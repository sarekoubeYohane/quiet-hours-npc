import type { Character, World } from './world';
import type { phoneForActor } from './phones';
import { normalDecisionInput, boundDecisionRequest } from './npc-input';
import { arrangementCueReceipts } from './arrangement-cues';
import { knownPeopleForDecision, type CognitiveDecisionContext } from './cognition';
import { decisionWireSchema } from './npc-decision-schema';
import { modelRequestBody, type ModelMessage, type ModelService } from './model-adapter';

export type NpcDecisionContext=CognitiveDecisionContext & {phoneReferences:ReturnType<typeof phoneForActor>};
type PreparationOptions=Pick<ModelService,'model'|'provider'> & {
 modelKey:string;
 allowedTypes:string[];
 messages:ModelMessage[];
 allowRecall?:boolean;
 input?:ReturnType<typeof normalDecisionInput>;
 recalled?:{id:string;version:number}[];
};

// Prepare one coherent request after all optional projections have converged.
// The transcript uses the dispatch serializer, including its JSON escaping and
// provider wrapper. No receipt or world state is committed here.
export function prepareNpcDecision(w:World,c:Character,options:PreparationOptions){
 const {messages,allowedTypes}=options;
 const input=options.input??normalDecisionInput(w,c,options.modelKey);
 let schema=decisionWireSchema(allowedTypes,input.self.shortTerm);
 boundDecisionRequest(w,c,input,()=>{
  schema=decisionWireSchema(allowedTypes,input.self.shortTerm);
  messages[1].content=JSON.stringify(input);
  return new TextEncoder().encode(modelRequestBody(options,messages,schema,{allowRecall:options.allowRecall})).length<164000;
 },options.recalled);
 const visible:Character={...c,intents:input.self.intents,arrangements:{schemaVersion:1,items:input.self.arrangements.items},shortTerm:(c.shortTerm||[]).filter(m=>input.self.shortTerm.some(r=>r.id===m.id&&r.version===m.version)),longTerm:(c.longTerm||[]).filter(m=>input.self.longTerm.some(r=>r.id===m.id&&r.version===m.version)),preferences:{schemaVersion:1,items:input.self.preferences.items,trace:[],droppedTrace:0},cognition:{...input.self.cognition,trace:[]}};
 const context:NpcDecisionContext={visible,phoneReferences:input.phones,knownPeople:knownPeopleForDecision(visible,input.contacts.map(p=>p.id)),memoryReview:input.self.memoryReview,historyCandidates:input.self.cognition.historyCandidates||[]};
 return {input,schema,messages,context,arrangementCueReceipts:arrangementCueReceipts(w,c,input),phoneNotificationReceipts:input.self.noticeOpportunities.map(n=>n.id)};
}
