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
import { testSiteNpcPrompt } from './environment';
import { assembleNpcPrompt } from './npc-prompt-rewrite';

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
 let outgoingMessages=messages;
 const input=options.continuation?.input??normalDecisionInput(w,c,options.modelKey);
 const draft=testSiteNpcPrompt();
 const recalled=options.continuation?.recalled||[];
 const pinned=input.self.longTerm.filter(m=>recalled.some(r=>r.id===m.id&&r.version===m.version)).map(({id,version})=>({id,version}));
 let schema=decisionWireSchema(allowedTypes,input.self.shortTerm,c.mentalEnergy?.policy.experience?visibleFeelingSources([...input.self.shortTerm,...input.self.longTerm]):undefined,!!c.mentalEnergy,!!c.mentalEnergy?.policy.process,c.mentalEnergy?.policy.kind==='formal');
 boundDecisionRequest(w,c,input,()=>{
  schema=decisionWireSchema(allowedTypes,input.self.shortTerm,c.mentalEnergy?.policy.experience?visibleFeelingSources([...input.self.shortTerm,...input.self.longTerm]):undefined,!!c.mentalEnergy,!!c.mentalEnergy?.policy.process,c.mentalEnergy?.policy.kind==='formal');
  // Bound the exact outgoing transcript. Optional projections may shrink between attempts.
  if(draft){
   const {personality,goal,...self}=input.self;
   messages[0].content=assembleNpcPrompt(input,{name:self.name,personality,goal},{draft,recall:options.allowRecall}).text;
   messages[1].content=JSON.stringify({...input,self});
  }else{
   messages[1].content=JSON.stringify(input);
  }
  let systemPrompt=messages[0].content+'\n最終決策的每一層都只輸出本次 schema 定義的欄名，拼寫須完全相同。未定義的欄位一律省略，即使值是 null 也要省略整個鍵。';
  if(Object.hasOwn(schema.properties,'processFeeling')){
   systemPrompt+=' processFeeling 可為 null；填物件時只留 direction、level、reason 三欄。processFeeling.mood 即使是 null 也必須省略，決策頂層的 mood 照常填寫。processFeeling.direction 為 "neutral" 時，processFeeling.level 必須填數字 0。例如 {"direction":"neutral","level":0,"reason":"這件事讓我感覺平常。"}。';
  }
  if(options.allowRecall){
   const feelings = ['feelingUpdates','processFeeling'].filter(field => Object.hasOwn(schema.properties,field));
   const contract = [
    '本次可直接做最終決定，也可只回傳 {"type":"recall","questions":["想回想的事"]}。回想限一次，問題一至兩題，每題非空且最多 256 UTF-8 bytes。',
    '最終決定請依下列 JSON Schema 填寫。頂層省略 type，動作種類只填在 action.type。列舉值用英文，敘述寫繁體中文。',
    ...(feelings.length ? [feelings.join('、')+' 的 neutral 配 level 0，positive、negative 配非零等級。reason 為非空字串，最多 256 UTF-8 bytes。'] : []),
    'pursuitSelection.reason 可填空字串。沒有適用的方法變更時，methodAssessment.change 可填 {"kind":"not-applicable","detail":""}。timeIntent.maxMinutes 無上限填 null。活動估時與每回合推進分鐘數分開。',
    JSON.stringify(schema),
   ].join('\n');
   systemPrompt+='\n\n'+contract;
  }
  if(options.provider==='deepseek'){
   const identity=JSON.stringify({contractVersion:input.contractVersion,pursuitContext:input.pursuitContext});
   systemPrompt+='\n\n最終行動回覆請先逐字複製以下固定欄位和值，再於同一個 JSON 物件內填完本次決策：\n'+identity;
   systemPrompt+='\n提交前逐一核對頂層必填欄位：'+schema.required.join('、')+'。';
  }
  outgoingMessages=[{...messages[0],content:systemPrompt},...messages.slice(1)];
  return new TextEncoder().encode(modelRequestBody(options,outgoingMessages,schema,{allowRecall:options.allowRecall})).length<164000;
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
 return {input,schema,messages:outgoingMessages,context,prepareRecall,arrangementCueReceipts:arrangementCueReceipts(w,c,input),phoneNotificationReceipts:input.self.noticeOpportunities.map(n=>n.id)};
}
