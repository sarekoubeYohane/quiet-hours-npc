import { redactDiagnosticText, sensitiveDiagnosticKey } from './diagnostic-redaction';
import type { World } from './world';
import type { TokenUsage } from './activities';
import type { ModelObservation, ModelObserver } from './model-adapter';
import type { EnvironmentView } from './environment';

// Observer receipts never enter World, prompts or NPC memory. Keep the bound
// independent of the journal's existing exception for its latest world snapshot.
export const operationEvidenceBytes = 64 * 1024;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export type CandidateEvidence = { status: 'captured' | 'invalid-json' | 'omitted'; value?: Record<string, unknown>; truncated: boolean; redacted: boolean };
export type DispatchEvidence = { sequence: number; task: 'npc' | 'adjudication'; actorId: string; requestId: string; provider: string; model: string; usage: TokenUsage | null; candidate?: CandidateEvidence };
export type ReplayAdvance = { operation: 'advance'; operationId: string; worldContext?: string; mode: string; model?: string; minutes: number };
export type OperationEvidence = {
  schemaVersion: 1 | 2; operationId: string; requestId: string; contextId?: string;
  deployment: Pick<EnvironmentView, 'name' | 'commit' | 'builtAt'>;
  operation: string; baseVersion: number; resultVersion?: number;
  outcome: 'committed' | 'rolled-back' | 'not-committed';
  replay?: ReplayAdvance;
  counts: { npc: number; adjudication: number }; dispatches: DispatchEvidence[];
  result?: Record<string, unknown>; truncated: boolean; redacted: boolean;
};
export type OperationSummary = { operationId: string; operation?: string; status: number; requestId?: string; version?: number; evidenceAvailable: boolean };

type Shape = true | { [key: string]: Shape } | Shape[];
const proposalShape: Shape = { contractVersion: true, type: true, target: true, content: true, purpose: true, durationMinutes: true, timeIntent: { kind: true, maxMinutes: true } };
const quantityShape: Shape = {amount:true,unit:true};
const sourceShape: Shape = {type:true,id:true,revision:true,amount:true,unit:true,owner:true,disposition:true};
const formationShape: Shape = {operation:true,at:true,inputs:[true]};
const effectShape: Shape = {kind:true,version:true,access:true,exposure:true,expectedRegion:true,target:{type:true,id:true},changes:[{key:true,from:true,value:true}],reason:true,supplyId:true,expectedRemaining:true,objectId:true,expectedRevision:true,toHolder:true,toRegion:true,key:true,value:true,targetId:true,recipient:true,operation:true,quantity:quantityShape,outputId:true,inputs:[{objectId:true,expectedRevision:true,quantity:quantityShape,disposition:true}],outputs:[{id:true,label:true,kind:true,consumable:true,quantity:quantityShape,state:[{key:true,value:true,exposure:true}]}]};
const stateEntry: Shape = { key:true,value:true,exposure:true };
const physicalObjectShape = {allowedTo:[true],coOwners:[true],physicalHistory:[{actorId:true,minute:true,operation:true,permitted:true,priorHolder:true}],physicalHistoryDropped:true,unpermittedCount:true} satisfies Record<string,Shape>;
// The deepest allowed projection is result.rules[].programs[].branches[].stages[].effects[].value.
// Keep a finite structural bound as well as the independent 64 KiB receipt limit.
const projectionDepth = 11;
const resolutionShape: Shape = {roll:true,modifier:true,dc:true,total:true,outcome:true};
const selectedResultShape: Shape = {outcome:true,branch:true,resolution:resolutionShape};
const checkShape: Shape = { difficulty:true, ability:true };
const stageShape: Shape = {afterMinutes:true,preconditions:[{kind:true,version:true,target:{type:true,id:true},guard:{region:true,holder:{check:true,value:true}},objectId:true,revision:true,region:true,holder:true,state:[stateEntry]}],effects:[effectShape]};
const branchShape: Shape = {outcomes:[true],effects:[effectShape],stages:[stageShape]};
const routineStepShape: Shape = {kind:true,role:true,toHolder:true,key:true,value:true};
const routineStageShape: Shape = {afterMinutes:true,effects:[routineStepShape]};
const routineProgramShape: Shape = {operation:true,effects:[routineStepShape],stages:[routineStageShape],check:checkShape,branches:[{outcomes:[true],effects:[routineStepShape],stages:[routineStageShape]}]};
const candidateShape: Shape = {status:true,completionMinutes:true,effects:[effectShape],check:checkShape,branches:[branchShape],routine:{family:true,version:true,operation:true,subject:true,timings:[{operation:true,minutes:true}],programs:[routineProgramShape]},stages:[stageShape]};

export function createOperationEvidence(context: {
  operationId: string; requestId: string; operation: string; baseVersion: number;
  world: World; deployment: EnvironmentView; replay?: ReplayAdvance;
}) {
  const secrets = new Set<string>();
  const before = context.world;
  const evidence: OperationEvidence = {
    schemaVersion:2, operationId:context.operationId, requestId:context.requestId,
    contextId:before.contextId, deployment:{name:context.deployment.name,commit:context.deployment.commit,builtAt:context.deployment.builtAt},
    operation:context.operation, baseVersion:context.baseVersion, outcome:'not-committed',
    ...(context.replay ? {replay:context.replay} : {}), counts:{npc:0,adjudication:0},dispatches:[],truncated:false,redacted:false,
  };
  const redact = (text: string) => {
    const result = redactDiagnosticText(text,secrets);
    if(result !== text)evidence.redacted=true;
    return result;
  };
  const scalar = (value: unknown): unknown => {
    if(typeof value==='string') {
      const clean=redact(value), encoded=new TextEncoder().encode(clean);
      if(encoded.length<=2048)return clean;
      evidence.truncated=true;
      return new TextDecoder('utf-8',{fatal:false}).decode(encoded.slice(0,2044))+'…';
    }
    if(value===null || typeof value==='boolean' || typeof value==='number'&&Number.isFinite(value))return value;
    if(value!==undefined)evidence.truncated=true;
    return undefined;
  };
  const project = (value:unknown,shape:Shape,depth=0,strict=true):unknown => {
    if(value===null)return null;
    if(depth>projectionDepth){evidence.truncated=true;return undefined;}
    if(shape===true)return scalar(value);
    if(Array.isArray(shape)) {
      if(!Array.isArray(value))return scalar(value);
      if(value.length>16)evidence.truncated=true;
      return value.slice(0,16).map(item=>project(item,shape[0],depth+1,strict));
    }
    if(!record(value))return scalar(value);
    const selected:Record<string,unknown>={};
    for(const key of Object.keys(shape))if(Object.hasOwn(value,key))selected[key]=project(value[key],shape[key],depth+1,strict);
    if(strict&&Object.keys(value).some(key=>!Object.hasOwn(shape,key)))evidence.truncated=true;
    if(typeof value.key==='string' && sensitiveDiagnosticKey.test(value.key)){for(const field of ['value','from'])if(Object.hasOwn(selected,field)){selected[field]='<REDACTED>';evidence.redacted=true;}}
    return selected;
  };
  const capture = (raw:string,task:'npc'|'adjudication'): CandidateEvidence => {
    // Do not retain arbitrary malformed text: it may be a private transcript.
    if(raw.length>32768 || new TextEncoder().encode(raw).length>32768){evidence.truncated=true;return {status:'omitted',truncated:true,redacted:false};}
    let parsed:unknown;
    try{parsed=JSON.parse(task==='npc'?raw.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''):raw);}catch{return {status:'invalid-json',truncated:false,redacted:false};}
    if(!record(parsed))return {status:'omitted',truncated:true,redacted:false};
    const previousTruncated=evidence.truncated,previousRedacted=evidence.redacted;
    evidence.truncated=false;evidence.redacted=false;
    // Private NPC response fields are intentionally excluded, not a failed capture.
    const source=task==='npc'?Object.fromEntries(Object.keys(proposalShape).filter(key=>Object.hasOwn(parsed,key)).map(key=>[key,parsed[key]])):parsed;
    const value=project(source,task==='npc'?proposalShape:candidateShape) as Record<string,unknown>;
    const captured={status:'captured' as const,value,truncated:evidence.truncated,redacted:evidence.redacted};
    evidence.truncated ||= previousTruncated;evidence.redacted ||= previousRedacted;
    return captured;
  };
  const observer = (task:'npc'|'adjudication',actorId:string,provider:string,model:string,key:string):ModelObserver => {
    secrets.add(key);
    let active:DispatchEvidence|undefined;
    return (event:ModelObservation) => {
      if(event.kind==='dispatch') {
        evidence.counts[task]++;
        active={sequence:evidence.counts.npc+evidence.counts.adjudication,task,actorId,requestId:event.requestId||'',provider,model,usage:null};
        if(evidence.dispatches.length<32)evidence.dispatches.push(active);else evidence.truncated=true;
      } else if(active && event.kind==='usage') {
        const usage=event.usage;
        if(Number.isFinite(usage.inputTokens)&&usage.inputTokens>=0&&Number.isFinite(usage.outputTokens)&&usage.outputTokens>=0) {
          active.usage={inputTokens:usage.inputTokens,outputTokens:usage.outputTokens};
          if(typeof usage.cachedInputTokens==='number'&&Number.isFinite(usage.cachedInputTokens)&&usage.cachedInputTokens>=0)active.usage.cachedInputTokens=usage.cachedInputTokens;
          else if(usage.cachedInputTokens!==undefined)evidence.truncated=true;
        }
      }
      else if(active && event.kind==='candidate')active.candidate=capture(event.raw,task);
    };
  };
  const finish = (world:World|undefined,outcome:OperationEvidence['outcome'],resultVersion?:number):OperationEvidence => {
    evidence.outcome=outcome;evidence.resultVersion=resultVersion;
    if(world) {
      const objects=(world.objects||[]).filter(object=>JSON.stringify(object)!==JSON.stringify(before.objects?.find(old=>old.id===object.id)));
      const beforeObjects=objects.flatMap(object=>{const old=before.objects?.find(previous=>previous.id===object.id);return old?[old]:[];});
      const objectEvidence=(object:NonNullable<World['objects']>[number])=>({...object,stateEntries:Object.entries(object.state).map(([key,value])=>({key,value,...(object.stateExposure&&Object.hasOwn(object.stateExposure,key)?{exposure:object.stateExposure[key]}:{})}))});
      const externalSnapshot=(source:World)=>[
        ...source.characters.filter(actor=>actor.physical).map(actor=>({target:{type:'body',id:actor.id},revision:actor.physical!.revision,region:actor.region,stateEntries:Object.entries(actor.physical!.state).map(([key,value])=>({key,value})),exposureEntries:Object.entries(actor.physical!.exposure||{}).map(([key,value])=>({key,value}))})),
        ...Object.entries(source.scene?.external||{}).map(([id,bag])=>({target:{type:'environment',id},revision:bag.revision,region:id,stateEntries:Object.entries(bag.state).map(([key,value])=>({key,value})),exposureEntries:[]})),
      ];
      const afterExternal=externalSnapshot(world),beforeExternal=externalSnapshot(before);
      const externalStates=afterExternal.flatMap(after=>{const previous=beforeExternal.find(item=>item.target.type===after.target.type&&item.target.id===after.target.id)||null;return JSON.stringify(previous)===JSON.stringify(after)?[]:[{target:after.target,before:previous,after}];});
      const rules=(world.routineRules||[]).map(rule=>({id:rule.id,version:rule.version,family:rule.family,timings:rule.templates?.map(template=>({operation:template.operation,minutes:template.result.minutes})),programs:rule.programs}));
      const actors=world.characters.map(actor=>({id:actor.id,activity:actor.activity,plan:actor.plan?{
        startedAt:actor.plan.startedAt,until:actor.plan.until,action:actor.plan.action,phaseCursor:actor.plan.phases?.cursor,
        selectedResult:actor.plan.selectedResult,
        stages:actor.plan.phases?.stages.map(stage=>({...stage,preconditions:stage.preconditions.map(condition=>({...condition,state:'target' in condition?condition.state:Object.entries(condition.state).map(([key,value])=>({key,value}))}))})),
      }:null}));
      // Only new mechanical results, never event text, audiences, attempt keys or private context.
      // Completed plans are removed by the lifecycle; their committed resolution remains evidence.
      const previousEvents=new Set(before.events.map(event=>event.id));
      const resolutions=world.events.filter(event=>!previousEvents.has(event.id)&&['attempt','work'].includes(event.kind)&&event.resolution)
        .map(event=>({eventId:event.id,actorId:event.actor,resolution:event.resolution}));
      evidence.result=project({turn:world.turn,minute:world.minute,actors,rules,objects:objects.map(objectEvidence),beforeObjects:beforeObjects.map(objectEvidence),externalStates,resolutions},
        {turn:true,minute:true,actors:[{id:true,activity:true,plan:{startedAt:true,until:true,action:{type:true,target:true,content:true},phaseCursor:true,selectedResult:selectedResultShape,stages:[stageShape]}}],rules:[{id:true,version:true,family:true,timings:[{operation:true,minutes:true}],programs:[routineProgramShape]}],objects:[{...physicalObjectShape,id:true,source:true,sources:[sourceShape],quantity:quantityShape,consumable:true,coOwners:[true],formation:formationShape,endedByFormation:{operation:true,at:true,actorId:true,disposition:true},revision:true,region:true,holder:true,owner:true,lifecycle:true,kind:true,state:{contents:true,clean:true,vessel:true,beverage:true,available:true,condition:true},stateEntries:[stateEntry]}],beforeObjects:[{...physicalObjectShape,id:true,source:true,sources:[sourceShape],quantity:quantityShape,consumable:true,coOwners:[true],formation:formationShape,endedByFormation:{operation:true,at:true,actorId:true,disposition:true},revision:true,region:true,holder:true,owner:true,lifecycle:true,kind:true,stateEntries:[stateEntry]}],externalStates:[{target:{type:true,id:true},before:{revision:true,region:true,stateEntries:[stateEntry],exposureEntries:[stateEntry]},after:{revision:true,region:true,stateEntries:[stateEntry],exposureEntries:[stateEntry]}}],resolutions:[{eventId:true,actorId:true,resolution:resolutionShape}]},0,false) as Record<string,unknown>;
    }else delete evidence.result;
    // Redact metadata too, after all dispatched service credentials are known.
    const sanitize=(value:unknown):unknown=>{
      if(Array.isArray(value))return value.map(sanitize);
      if(record(value))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitize(item)]));
      return scalar(value);
    };
    const clean=sanitize(evidence) as OperationEvidence;
    clean.redacted ||= evidence.redacted;clean.truncated ||= evidence.truncated;
    if(clean.replay && JSON.stringify(clean.replay)!==JSON.stringify(evidence.replay)){delete clean.replay;clean.redacted=true;}
    // Preserve receipts/counters and identity before larger candidates/results.
    while(bytes(clean)>operationEvidenceBytes) {
      const candidate=clean.dispatches.find(item=>item.candidate?.value);
      if(candidate){candidate.candidate={status:'omitted',truncated:true,redacted:candidate.candidate!.redacted};clean.truncated=true;continue;}
      if(clean.result){delete clean.result;clean.truncated=true;continue;}
      clean.dispatches.pop();clean.truncated=true;
      if(!clean.dispatches.length)break;
    }
    return clean;
  };
  return {observer,finish};
}
