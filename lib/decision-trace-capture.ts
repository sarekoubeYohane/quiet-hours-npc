import type { World, Character } from './world';
import { isCandidateFailureReason, type ModelObserver, type ModelObservation } from './model-adapter';
import { decisionTraceLimits, omitDecisionTraceContent, type DecisionTrace } from './decision-traces';
import { redactDiagnosticText, sensitiveDiagnosticKey } from './diagnostic-redaction';

export function traceActorSnapshot(actor:Character) {
  return structuredClone({id:actor.id,location:actor.location,region:actor.region,physical:actor.physical,activity:actor.activity,plan:actor.plan,
    needs:actor.needs,preferences:actor.preferences,habits:actor.habits,habitEvidence:actor.habitEvidence,habitEvidenceDropped:actor.habitEvidenceDropped,
    eventHabits:actor.eventHabits,pausedActivity:actor.pausedActivity,intents:actor.intents});
}

// Observer-only snapshots never become World fields or prompt inputs. Each is
// frozen at the dispatch boundary, including relevant facts that did not change.
export function traceWorldSnapshot(world: World) {
  return structuredClone({minute:world.minute,turn:world.turn,objects:world.objects||[],supplies:world.supplies||[],
    scene:world.scene,environment:world.scene?.external||{},naturalChanges:world.naturalChanges||[],routineRules:world.routineRules||[],
    actors:world.characters.map(traceActorSnapshot)});
}
export function createDecisionTrace(context: Pick<DecisionTrace,'operationId'|'requestId'|'operation'|'baseVersion'|'contextId'|'outcome'> & {deployment?:unknown;timePolicy?:{version:string;leaseCreatedAt:number;workDeadline:number;leaseDeadline:number;clientMs:number}}, checkpoint?: (trace:DecisionTrace)=>Promise<void>) {
  const secrets=new Set<string>();let unknownCredentials=false,contentLimitExceeded=false,omittedOriginalBytes=0;
  const omitContent=()=>unknownCredentials||contentLimitExceeded;
  const trace:DecisionTrace={...context,schemaVersion:1,acceptedAt:Date.now(),lastKnownStage:'accepted',dispatches:[],steps:[],gaps:[],redacted:false};
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
    steps.push({kind,actorId,source,data:omitContent()?{gap:'trace-content-omitted'}:structuredClone(data),at:Date.now()});trace.lastKnownStage=kind;
  };
  const observer=(task:'npc'|'adjudication',actor:Character,world:World,provider:string,model:string,key:string,legacy?:ModelObserver):ModelObserver=>{
    secrets.add(key);let active:Record<string,unknown>|undefined;
    return async(event:ModelObservation)=>{
      await legacy?.(event);
      if(event.kind==='prepared'){
        active={sequence:trace.dispatches.length+1,task,actorId:actor.id,requestId:event.requestId,provider,model,startedAt:Date.now(),
          ...(omitContent()?{}:{requestBody:event.requestBody,worldSnapshot:traceWorldSnapshot(world)}),stage:'dispatch-prepared',signal:event.timing??null};
        trace.dispatches.push(active);trace.lastKnownStage='dispatch-prepared';
      }else if(active&&event.kind==='fetch-start'){active.fetchStartedAt=event.at;return;}
      else if(active&&event.kind==='dispatch'){if(active.stage==='dispatch-prepared')active.stage='dispatched';trace.lastKnownStage=String(active.stage);}
      else if(active&&event.kind==='headers'){active.httpStatus=event.httpStatus;active.headersReceivedAt=Date.now();active.stage='response-headers';trace.lastKnownStage='response-headers';}
      else if(active&&(event.kind==='response'||event.kind==='late-response')){if(!omitContent())active.responseBody=event.responseBody;active.httpStatus=event.httpStatus;active.receivedAt=event.at??Date.now();if(event.kind==='response'&&event.usage){active.usage=event.usage;active.usageKnownAt=event.at??Date.now();}active.stage=event.kind==='late-response'?'late-discarded':'received';trace.lastKnownStage=String(active.stage);if(event.kind==='late-response'){
        active.discarded=true;
        try{const usage=JSON.parse(event.responseBody)?.usage;if(typeof usage?.prompt_tokens==='number'&&typeof usage?.completion_tokens==='number'&&Number.isFinite(usage.prompt_tokens)&&Number.isFinite(usage.completion_tokens)&&usage.prompt_tokens>=0&&usage.completion_tokens>=0)active.lateUsage={inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens};}catch{/* Malformed late bodies remain raw evidence. */}
      }}
      else if(active&&event.kind==='usage'){active.usage=event.usage;active.usageKnownAt=event.at??Date.now();}
      else if(active&&event.kind==='candidate'){if(!omitContent())active.rawCandidate=event.raw;active.stage='candidate-received';trace.lastKnownStage='candidate-received';}
      else if(active&&event.kind==='failure'){active.failure={kind:event.failure,stage:event.stage,...(isCandidateFailureReason(event.reason)?{reason:event.reason}:{})};active.stage=event.failure;trace.lastKnownStage=event.failure;}
      await persist();
    };
  };
  let writes=Promise.resolve();
  const snapshot=()=>{
    if(!omitContent()){
      const measured=new TextEncoder().encode(JSON.stringify(trace)).byteLength;
      if(measured>decisionTraceLimits.recordBytes){
        contentLimitExceeded=true;omittedOriginalBytes=measured;
        // Once this operation is over its content budget, retain receipts only.
        // Avoid repeatedly serializing all earlier transcripts at every later
        // actor's checkpoint while preserving actual dispatch/usage metadata.
        for(const item of trace.dispatches){const dispatch=item as Record<string,unknown>;for(const key of ['requestBody','responseBody','rawCandidate','worldSnapshot','parsedCandidate','validation'])delete dispatch[key];}
        for(const item of steps)item.data={gap:'single-record-limit'};
        delete trace.result;
      }
    }
    const value=unknownCredentials?omitDecisionTraceContent(trace,'credential-redaction-unavailable',true):contentLimitExceeded?omitDecisionTraceContent(trace,'single-record-limit',false,omittedOriginalBytes):trace;
    const cleaned=scrub(value) as DecisionTrace;cleaned.redacted=trace.redacted||unknownCredentials;return cleaned;
  };
  const checkpoints:{sequence:number;startedAt:number;completedAt?:number}[]=[];trace.checkpoints=checkpoints;
  const persist=async()=>{if(checkpoint){
    const point={sequence:checkpoints.length+1,startedAt:Date.now()} as {sequence:number;startedAt:number;completedAt?:number};
    if(checkpoints.length<256)checkpoints.push(point);
    const copy=snapshot();writes=writes.then(async()=>{await checkpoint(copy);point.completedAt=Date.now();});await writes;
  }};
  const finish=(outcome:DecisionTrace['outcome'],world?:World,resultVersion?:number)=>{
    trace.outcome=outcome;trace.resultVersion=resultVersion;
    if(world&&!omitContent())trace.result=traceWorldSnapshot(world);
    return snapshot();
  };
  const discard=(kind:string)=>{const active=trace.dispatches.at(-1) as Record<string,unknown>|undefined;if(active){active.discarded=true;active.failure={kind,stage:active.stage};active.stage='discarded';}};
  const gap=(reason:string)=>{const gaps=trace.gaps as string[];if(!gaps.includes(reason))gaps.push(reason);};
  return {observer,step,finish,persist,gap,discard,omitUnsafeContent:()=>{unknownCredentials=true;gap('credential-redaction-unavailable');},registerSecret:(key:string)=>{secrets.add(key);}};
}
