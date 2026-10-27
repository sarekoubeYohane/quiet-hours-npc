import type { Character, World } from './world';
import { perception } from './world';
import { budgetMemoryInput, memoryBytes } from './memory';
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
 perceived.self.relationships=relationshipsProjection(perceived.self.cognition.relationshipTags);
 const input=budgetMemoryInput({contractVersion:'npc-decision.v1',...perceived,knownMethods:knownRoutineMethods(w,c),knownControlExperiences:c.control?.mode==='autonomous'?c.control.experiences:undefined,currentActivity:c.plan?{timeIntent:c.plan.timeIntent,elapsedMinutes:Math.max(0,w.minute-c.plan.startedAt),remainingMinutes:Math.max(0,c.plan.until-w.minute),canContinueExisting:resumable,canPause:c.plan.resumable===true&&!c.pausedActivity}:null,learnedHabits:habitsForDecision(w,c)},c);
 const phoneReferenceGap=boundPhoneInput(w,c,input);
 const allCues=arrangementCuesForDecision(w,c,input),arrangementCues=allCues.slice(0,4);
 while(arrangementCues.length&&memoryBytes({input,arrangementCues})>88*1024-1024)arrangementCues.pop();
 return {...input,phoneReferenceGap,self:{...input.self,arrangementCues,arrangementCueGap:allCues.length-arrangementCues.length}};
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
