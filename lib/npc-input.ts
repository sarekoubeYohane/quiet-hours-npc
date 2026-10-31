import { pursuitLimits, pursuitsForDecision } from './pursuits';
import { boundPhoneNotifications } from './phone-notifications';
import type { Character, World } from './world';
import { perception } from './world';
import { budgetMemoryInput, memoryBytes, MemoryValidationError } from './memory';
import { arrangementsForDecision } from './arrangements';
import { cognitionForDecision, relationshipsProjection } from './cognition';
import { knownRoutineMethods } from './routine-rules';
import { habitsForDecision } from './habits';
import { canResumeActivity } from './activity-lifecycle';
import { phoneForActor } from './phones';
import { arrangementCuesForDecision } from './arrangement-cues';
export function normalDecisionInput(w:World,c:Character,modelKey:string){
 const resumable=canResumeActivity(w,c,modelKey);
 const perceived=perception(w,{...c,memories:c.memories.slice(-12),habits:undefined,control:c.control?{...c.control,experiences:undefined}:undefined});
 perceived.self.cognition=cognitionForDecision(c,perceived.contacts,perceived.visiblePeople);
 const self=Object.assign(perceived.self,{pursuitCapacity:{nodes:pursuitLimits.nodes,remaining:pursuitLimits.nodes-(c.intents?.length||0),omitted:0},focusIntentId:c.focusIntentId??null});
 self.intents=pursuitsForDecision(c);
 Object.assign(self.pursuitCapacity,{archivable:(c.intents||[]).filter(n=>n.status!=='active').map(({id,version})=>({id,version})),archivedCount:c.pursuitArchived?.length||0,archivedGap:c.pursuitArchivedDropped||0});
 perceived.self.relationships=relationshipsProjection(perceived.self.cognition.relationshipTags);
 const input=budgetMemoryInput({contractVersion:'npc-decision.v3',pursuitContext:w.pursuitContext,...perceived,self,knownMethods:knownRoutineMethods(w,c),knownControlExperiences:c.control?.mode==='autonomous'?c.control.experiences:undefined,currentActivity:c.plan?{timeIntent:c.plan.timeIntent,elapsedMinutes:Math.max(0,w.minute-c.plan.startedAt),remainingMinutes:Math.max(0,c.plan.until-w.minute),canContinueExisting:resumable,canPause:c.plan.resumable===true&&!c.pausedActivity}:null,learnedHabits:habitsForDecision(w,c)},c);
 return finalizeDecisionInput(w,c,input);
}


// Memory selection remains with its normal/recall caller. Both paths then use
// this identical derived view and byte reservation before binding references.
export function finalizeDecisionInput<T extends {phones:ReturnType<typeof phoneForActor>;self:Pick<ReturnType<typeof perception>['self'],'shortTerm'|'longTerm'|'arrangements'|'observations'>}>(w:World,c:Character,input:T,recalledMemories?:{id:string;version:number}[]){
 const final=Object.assign(input,{phoneReferenceGap:0,self:{...input.self,arrangementCues:[] as ReturnType<typeof arrangementCuesForDecision>,arrangementCueGap:0,noticeOpportunities:[] as {id:string;observationIds:string[]}[],noticeOpportunityGap:0}});
 const extra=recalledMemories===undefined?undefined:{recalledMemories};
 const shown={...c,shortTerm:c.shortTerm?.filter(m=>final.self.shortTerm.some(r=>r.id===m.id&&r.version===m.version)),longTerm:c.longTerm?.filter(m=>final.self.longTerm?.some(r=>r.id===m.id&&r.version===m.version)),cognition:'cognition'in final.self?final.self.cognition as Character['cognition']:c.cognition};
 Object.assign(final.self,{intents:pursuitsForDecision(c,shown)});
 final.phoneReferenceGap=boundPhoneInput(w,c,final,extra);
 const allCues=arrangementCuesForDecision(w,c,final);
 final.self.arrangementCues=allCues.slice(0,4);
 while(final.self.arrangementCues.length&&memoryBytes({input:final,...extra})>88*1024-1024)final.self.arrangementCues.pop();
 final.self.arrangementCueGap=allCues.length-final.self.arrangementCues.length;
 boundPhoneNotifications(w,c,final,extra);
 if(memoryBytes({input:final,...extra})>88*1024)throw new MemoryValidationError('完整角色輸入超過88KiB，尚未派送。');
 return final;
}

// Only optional projections are released, never saved memory or an effective
// pursuit. Both provider bodies use this exact final view and reference scope.
export function boundDecisionRequest(w:World,c:Character,input:ReturnType<typeof normalDecisionInput>,fits:()=>boolean,recalled:{id:string;version:number}[]=[]){
 const gaps=(input as typeof input&{projectionGaps?:Record<string,number>}).projectionGaps||Object.assign(input,{projectionGaps:{} as Record<string,number>}).projectionGaps;
 const omitted=(key:string)=>{gaps[key]=(gaps[key]||0)+1;};
 const refresh=()=>{
  const shown={...c,shortTerm:c.shortTerm?.filter(m=>input.self.shortTerm.some(r=>r.id===m.id&&r.version===m.version)),longTerm:c.longTerm?.filter(m=>input.self.longTerm.some(r=>r.id===m.id&&r.version===m.version))};
  const arrangements=input.self.arrangements.items;
  input.self.arrangements=arrangementsForDecision(c,shown);input.self.arrangements.items=input.self.arrangements.items.filter(item=>arrangements.some(a=>a.id===item.id&&a.version===item.version));
  input.self.memoryReview=input.self.memoryReview.filter(ref=>ref.kind==='trace'||(ref.kind==='short'?input.self.shortTerm:input.self.longTerm).some(m=>m.id===ref.id&&m.version===ref.version));
  input.self.relationships=relationshipsProjection(input.self.cognition.relationshipTags);
  input.self.cognition.reviewCandidates=input.self.cognition.reviewCandidates?.filter(candidate=>(candidate.kind==='belief'?input.self.cognition.beliefs:input.self.cognition.relationshipTags).some(item=>item.id===candidate.id&&item.version===candidate.version));
  finalizeDecisionInput(w,c,input,recalled.length?recalled:undefined);
 };
 while(!fits()){
  if(input.self.lastKnownState&&!recalled.length){delete input.self.lastKnownState;omitted('lastKnownState');continue;}
  if(input.self.memories.length){input.self.memories=[];omitted('compatibilityMemories');continue;}
  if(input.knownControlExperiences?.length){input.knownControlExperiences=[];omitted('compatibilityControl');continue;}
  const index=input.self.longTerm.findLastIndex(m=>!recalled.some(r=>r.id===m.id&&r.version===m.version));
  if(index>=0){input.self.longTerm.splice(index,1);omitted('longTerm');refresh();continue;}
  if(input.self.cognition.beliefs.length){input.self.cognition.beliefs.pop();omitted('beliefs');refresh();continue;}
  if(input.self.cognition.relationshipTags.length){input.self.cognition.relationshipTags.pop();omitted('relationships');refresh();continue;}
  if(input.self.preferences.items.length){input.self.preferences.items.pop();omitted('preferences');continue;}
  if(input.learnedHabits.length){input.learnedHabits.pop();omitted('habits');continue;}
  if(input.knownMethods.length){input.knownMethods.pop();omitted('knownMethods');continue;}
  // Escape-heavy source text can fit the input envelope but exceed the exact
  // outer provider JSON. Release only input copies, preferring sources that
  // do not support an already visible arrangement or notice opportunity.
  const essential=new Set([...input.self.arrangements.items.map(item=>item.memory.id),...input.self.noticeOpportunities.flatMap(item=>item.observationIds)]);
  const shortIndex=input.self.shortTerm.findLastIndex(item=>!essential.has(item.id));
  if(shortIndex>=0){const [removed]=input.self.shortTerm.splice(shortIndex,1);omitted('shortTerm');delete input.self.lastKnownState;input.pendingInterventions=input.pendingInterventions.filter(item=>item.memoryId!==removed.id);refresh();continue;}
  const phone=input.phones.findLast(p=>p.records.length);if(phone){phone.records.pop();input.phoneReferenceGap++;omitted('phoneReferences');continue;}
  if(input.self.arrangementCues.length){input.self.arrangementCues.pop();input.self.arrangementCueGap++;continue;}
  if(input.self.noticeOpportunities.length){input.self.noticeOpportunities.pop();input.self.noticeOpportunityGap++;continue;}
  throw new MemoryValidationError('必要追求圖與本人來源無法放入原派送包絡，尚未派送。');
 }
}

// Device identity and the ability to list remain available even when optional
// external-record handles compete with the existing psychological envelope.
export function boundPhoneInput<T extends {phones:ReturnType<typeof phoneForActor>;self:{shortTerm:{id:string;version:number}[];longTerm:{id:string;version:number}[]|undefined}}>(w:World,c:Character,input:T,extra?:unknown){
 const visible={...c,shortTerm:c.shortTerm?.filter(m=>input.self.shortTerm.some(r=>r.id===m.id&&r.version===m.version)),longTerm:c.longTerm?.filter(m=>input.self.longTerm?.some(r=>r.id===m.id&&r.version===m.version))};
 const projected=phoneForActor(w,visible);
 input.phones=projected.map(device=>({...device,records:[]}));
 let omitted=0;
 for(let index=0;index<projected.length;index++)for(const record of projected[index].records){input.phones[index].records.push(record);if(memoryBytes({input,...(extra?{extra}: {})})>88*1024-1024){input.phones[index].records.pop();omitted++;}}
 return omitted;
}
