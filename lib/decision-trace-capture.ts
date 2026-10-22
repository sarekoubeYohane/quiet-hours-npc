import type { World, Character } from './world';
import type { ModelObserver, ModelObservation } from './model-adapter';
import type { DecisionTrace } from './decision-traces';
import { redactDiagnosticText, sensitiveDiagnosticKey } from './diagnostic-redaction';

// Observer-only snapshots never become World fields or prompt inputs. Each is
// frozen at the dispatch boundary, including relevant facts that did not change.
export function traceWorldSnapshot(world: World) {
  return structuredClone({minute:world.minute,turn:world.turn,objects:world.objects||[],supplies:world.supplies||[],
    scene:world.scene,environment:world.scene?.external||{},naturalChanges:world.naturalChanges||[],routineRules:world.routineRules||[],
    actors:world.characters.map(actor=>({id:actor.id,location:actor.location,region:actor.region,physical:actor.physical,activity:actor.activity,plan:actor.plan}))});
}
export function createDecisionTrace(context: Pick<DecisionTrace,'operationId'|'requestId'|'operation'|'baseVersion'|'contextId'|'outcome'> & {deployment?:unknown}) {
  const secrets=new Set<string>();
  const trace:DecisionTrace={...context,schemaVersion:1,lastKnownStage:'accepted',dispatches:[],steps:[],gaps:[],redacted:false};
  const steps=trace.steps as {kind:string;actorId?:string;source:string;data:unknown;at:number}[];
  const scrub=(value:unknown,depth=0):unknown=>{
    if(depth>48){(trace.gaps as string[]).push('redaction-depth-limit');return '<OMITTED>';}
    if(typeof value==='string'){
      let clean=redactDiagnosticText(value,secrets);
      // A provider body contains JSON encoded messages and candidate strings.
      // Retain the original byte string whenever recursively masking it changes nothing.
      try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'){
        const masked=scrub(parsed,depth+1);if(JSON.stringify(parsed)!==JSON.stringify(masked))clean=JSON.stringify(masked);
      }}catch{/* A malformed body is still useful evidence, except secrets. */}
      if(clean!==value)trace.redacted=true;
      return clean;
    }
    if(Array.isArray(value))return value.map(item=>scrub(item,depth+1));
    if(value&&typeof value==='object'){
      const item=value as Record<string,unknown>;
      return Object.fromEntries(Object.entries(item).map(([key,entry])=>{
        const secret=sensitiveDiagnosticKey.test(key)||((key==='value'||key==='from')&&typeof item.key==='string'&&sensitiveDiagnosticKey.test(item.key));
        if(secret)trace.redacted=true;
        return [redactDiagnosticText(key,secrets),secret?'<REDACTED>':scrub(entry,depth+1)];
      }));
    }
    return value;
  };
  const step=(kind:string,actorId:string|undefined,data:unknown,source='program')=>{
    steps.push({kind,actorId,source,data:structuredClone(data),at:Date.now()});trace.lastKnownStage=kind;
  };
  const observer=(task:'npc'|'adjudication',actor:Character,world:World,provider:string,model:string,key:string,legacy?:ModelObserver):ModelObserver=>{
    secrets.add(key);let active:Record<string,unknown>|undefined;
    return (event:ModelObservation)=>{
      legacy?.(event);
      if(event.kind==='dispatch'){
        active={sequence:trace.dispatches.length+1,task,actorId:actor.id,requestId:event.requestId,provider,model,startedAt:Date.now(),
          requestBody:event.requestBody,worldSnapshot:traceWorldSnapshot(world),stage:'dispatched'};
        trace.dispatches.push(active);trace.lastKnownStage='dispatched';
      }else if(active&&event.kind==='response'){active.responseBody=event.responseBody;active.httpStatus=event.httpStatus;active.receivedAt=Date.now();active.stage='received';trace.lastKnownStage='received';}
      else if(active&&event.kind==='usage')active.usage=event.usage;
      else if(active&&event.kind==='candidate'){active.rawCandidate=event.raw;active.stage='candidate-received';trace.lastKnownStage='candidate-received';}
    };
  };
  const finish=(outcome:DecisionTrace['outcome'],world?:World,resultVersion?:number)=>{
    trace.outcome=outcome;trace.resultVersion=resultVersion;
    if(world)trace.result=traceWorldSnapshot(world);
    const cleaned=scrub(trace) as DecisionTrace;cleaned.redacted=trace.redacted;return cleaned;
  };
  return {observer,step,finish};
}
