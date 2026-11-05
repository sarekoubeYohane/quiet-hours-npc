import { visibleFeelingSources } from './mental-experiences';
import type { Character, World } from './world';
import type { phoneForActor } from './phones';
import { normalDecisionInput, finalizeDecisionInput, boundDecisionRequest } from './npc-input';
import { arrangementsForDecision } from './arrangements';
import { budgetMemoryInput, memoryBytes, type MemoryProjection } from './memory';
import { arrangementCueReceipts } from './arrangement-cues';
import { knownPeopleForDecision, type CognitiveDecisionContext } from './cognition';
import { decisionWireSchema } from './npc-decision-schema';
import { modelRequestBody, type ModelMessage, type ModelService } from './model-adapter';

export type NpcDecisionContext=CognitiveDecisionContext & {feelingSources:string[];phoneReferences:ReturnType<typeof phoneForActor>};
type RecallContinuation={input:ReturnType<typeof normalDecisionInput>;recalled:{id:string;version:number}[]};
type PreparationOptions=Pick<ModelService,'model'|'provider'> & {
 modelKey:string;
 allowedTypes:string[];
 messages:ModelMessage[];
 allowRecall?:boolean;
 continuation?:RecallContinuation;
};

// Prepare one coherent request after all optional projections have converged.
// The transcript uses the dispatch serializer, including its JSON escaping and
// provider wrapper. No receipt or world state is committed here.
export function prepareNpcDecision(w:World,c:Character,options:PreparationOptions){
 const {messages,allowedTypes}=options;
 const input=options.continuation?.input??normalDecisionInput(w,c,options.modelKey);
 const recalled=options.continuation?.recalled||[];
 const pinned=input.self.longTerm.filter(m=>recalled.some(r=>r.id===m.id&&r.version===m.version)).map(({id,version})=>({id,version}));
 let schema=decisionWireSchema(allowedTypes,input.self.shortTerm,c.mentalEnergy?.policy.experience?visibleFeelingSources([...input.self.shortTerm,...input.self.longTerm]):undefined,!!c.mentalEnergy?.policy.process);
 boundDecisionRequest(w,c,input,()=>{
  schema=decisionWireSchema(allowedTypes,input.self.shortTerm,c.mentalEnergy?.policy.experience?visibleFeelingSources([...input.self.shortTerm,...input.self.longTerm]):undefined,!!c.mentalEnergy?.policy.process);
  messages[1].content=JSON.stringify(input);
  return new TextEncoder().encode(modelRequestBody(options,messages,schema,{allowRecall:options.allowRecall})).length<164000;
 },pinned);
 const visible:Character={...c,intents:input.self.intents,arrangements:{schemaVersion:1,items:input.self.arrangements.items},shortTerm:(c.shortTerm||[]).filter(m=>input.self.shortTerm.some(r=>r.id===m.id&&r.version===m.version)),longTerm:(c.longTerm||[]).filter(m=>input.self.longTerm.some(r=>r.id===m.id&&r.version===m.version)),preferences:{schemaVersion:1,items:input.self.preferences.items,trace:[],droppedTrace:0},cognition:{...input.self.cognition,trace:[]}};
 const context:NpcDecisionContext={visible,feelingSources:c.mentalEnergy?.policy.experience?visibleFeelingSources([...input.self.shortTerm,...input.self.longTerm]):[],phoneReferences:input.phones,knownPeople:knownPeopleForDecision(visible,input.contacts.map(p=>p.id)),memoryReview:input.self.memoryReview,historyCandidates:input.self.cognition.historyCandidates||[]};
 const prepareRecall=(memories:MemoryProjection):RecallContinuation=>{
  const handles=memories.map(({id,version})=>({id,version}));
  // Allocate before the continuation guard and transcript extension, as on
  // the original path. Body convergence happens on the next preparation.
  input.self.longTerm=input.self.longTerm.filter(item=>!handles.some(ref=>ref.id===item.id&&ref.version===item.version));
  budgetMemoryInput(input,c,{memories,handles});
  input.self.longTerm=[...memories,...input.self.longTerm];
  if(memoryBytes({input,recalledMemories:handles})>88*1024)throw Error('回想後記憶輸入超過 88 KiB，本回合已回復。');
  const shown={...c,shortTerm:(c.shortTerm||[]).filter(item=>input.self.shortTerm.some(ref=>ref.id===item.id&&ref.version===item.version)),longTerm:(c.longTerm||[]).filter(item=>input.self.longTerm.some(ref=>ref.id===item.id&&ref.version===item.version))};
  input.self.arrangements=arrangementsForDecision(c,shown);
  while(input.self.arrangements.items.length&&memoryBytes({input,recalledMemories:handles})>88*1024)input.self.arrangements.items.pop();
  finalizeDecisionInput(w,c,input,handles);
  messages[1].content=JSON.stringify(input);
  return {input,recalled:handles};
 };
 return {input,schema,messages,context,prepareRecall,arrangementCueReceipts:arrangementCueReceipts(w,c,input),phoneNotificationReceipts:input.self.noticeOpportunities.map(n=>n.id)};
}
