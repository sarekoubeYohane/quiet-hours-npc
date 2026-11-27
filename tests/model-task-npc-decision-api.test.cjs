/* eslint-disable @typescript-eslint/no-require-imports -- #417：NPC 自主決策經模型任務派送；經 route、替身資料庫與腳本模型。 */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const origin='https://test.invalid';
const action={type:'reflect',target:'',content:'我再想想。',mood:'好奇',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[]};
// 不合契約：選留了本次沒看到的短期記憶。
const invalid=input=>({...fixtureDecision(input,action),memorySelections:[{id:'unknown-ref',version:1,reason:'保留'}]});
const valid=input=>fixtureDecision(input,action);
const recallRequest={type:'recall',questions:['她喜歡什麼？']};
const recallKeys=['RECALL_ENABLED','RECALL_USAGE_DB','OWNER_EMBEDDING_KEY','MEMORY_VECTOR_INDEX'];

// 只有一位人物自主決策；`reply(第幾次派送, 第一則輸入, 這次派送)` 回傳這次的回覆。回想服務的 embedding 仍經 fetch，不是模型任務。
async function round({repair=false,recall=false,budget,reply=(_call,input)=>valid(input),usage={inputTokens:30,outputTokens:10}}={}){
 const {scriptedModel}=load('scripted-model'),{GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world'),{env}=load('cloudflare-workers');
 const world={...seedWorld(),adjudication:{provider:'openai',model:'gpt-6-luna'}};world.contextId='model-task-npc-decision';
 for(const character of world.characters)character.control={mode:'taken-over'};
 const actor=world.characters[0];actor.control={mode:'autonomous'};
 actor.longTerm=[{id:'recall-me',characterId:actor.id,version:2,time:0,text:'據說她喜歡紅茶，尚未確認。',source:{kind:'experience'},origin:{id:'past',version:1},reason:'在意'}];
 store.install(world);
 const original=global.fetch,chats=[],vectors=new Map();
 if(recall){
  env.RECALL_ENABLED='true';env.RECALL_USAGE_DB=store.database();env.OWNER_EMBEDDING_KEY='owner-key';
  env.MEMORY_VECTOR_INDEX={upsert:async records=>{for(const record of records)vectors.set(record.id,record);return {mutationId:'m'};},deleteByIds:async ids=>{for(const id of ids)vectors.delete(id);return {mutationId:'d'};},getByIds:async ids=>ids.flatMap(id=>vectors.has(id)?[vectors.get(id)]:[]),queryById:async id=>({matches:vectors.has(id)?[vectors.get(id)]:[]}),query:async()=>({matches:[...vectors.values()]})};
 }
 global.fetch=async(url,init)=>{
  if(String(url).includes('embeddings'))return Response.json({usage:{total_tokens:7},data:JSON.parse(init.body).input.map((_,index)=>({index,embedding:Array(1536).fill(.1)}))});
  chats.push(String(url));throw Error('NPC 自主決策不應經 fetch 派送');
 };
 const first=await(await GET(new Request(origin+'/api/world'))).json();
 const model=scriptedModel(dispatch=>({reply:reply(model.dispatches.length,JSON.parse(dispatch.messages[1].content),dispatch),usage}));
 const operationId=()=>Date.now()+':'+crypto.randomUUID(),id=operationId();
 const post=async body=>{
  const response=await POST(new Request(origin+'/api/world',{method:'POST',headers:{origin,'X-World-Time-Policy':'round-v2'},body:JSON.stringify({operationScope:first.operationScope,worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',operationId:operationId(),...body})}),{modelTransport:model});
  return {status:response.status,body:await response.json()};
 };
 const ok=async body=>{const result=await post(body);assert.equal(result.status,200,JSON.stringify(result.body));return result;};
 // 帶操作身分讀取時另附該操作的私有決策實錄；operationScope 用 GET 回應裡的那一個。
 const read=async withTrace=>(await GET(new Request(origin+'/api/world'+(withTrace?'?operationScope='+encodeURIComponent(first.operationScope)+'&operationId='+encodeURIComponent(id):'')))).json();
 const reservations=async()=>(await store.database().prepare('SELECT reservation_id, kind FROM recall_dispatch_usage ORDER BY reserved_at').bind().all()).results;
 await ok({operation:'set-model-key',key:'fixture'});
 if(budget)await ok({operation:'set-budget',limits:budget});
 const before=await read();
 const advance=async()=>{
  if(repair)globalThis.__FORMAT_REPAIR__='1';
  try{return await post({operation:'advance',minutes:15,operationId:id});}finally{delete globalThis.__FORMAT_REPAIR__;}
 };
 return {store,model,chats,id,actor,before,post,ok,read,reservations,advance,restore(){global.fetch=original;store.onStorage(undefined);for(const key of recallKeys)delete env[key];delete globalThis.__FORMAT_REPAIR__;}};
}
const unchanged=(world,before)=>{const actual=structuredClone(world),expected=structuredClone(before);delete actual.aiUsage;delete expected.aiUsage;assert.deepEqual(actual,expected);};
const tasks=trace=>trace.dispatches.map(dispatch=>dispatch.task+(dispatch.failure?':'+dispatch.failure.kind:''));
const accountCalls=body=>body.accountPlayer.usage.calls;
const npcCost=world=>Object.values(world.aiUsage.costs.total).filter(cost=>cost.task==='npc');

test('NPC 自主決策的格式修正行為不變：人物收到自己的原回覆與不合契約的原因後重新回覆一次，修正後的決策隨回合提交，兩次派送都計入用量並留在私有決策實錄',async()=>{
 const r=await round({repair:true,reply:(call,input)=>call===1?invalid(input):valid(input)});
 try{
  const result=await r.advance();
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.deepEqual(r.chats,[],'NPC 自主決策不再經 fetch 派送');
  assert.equal(r.model.dispatches.length,2);
  const [first,second]=r.model.dispatches;
  assert.equal(first.task,'npc');assert.equal(first.actorId,r.actor.id);assert.equal(first.attempt,1);assert.equal(second.attempt,2);
  assert.equal(first.label,r.actor.name+'的 NPC 決策');assert.equal(second.label,r.actor.name+'的 NPC 決策格式修正');
  assert.equal(first.provider,'openai');assert.equal(first.model,'gpt-6-luna');
  // 輸出 token 上限沒有另外指定，沿用供應商預設。
  assert.equal(first.maxOutputTokens,undefined);
  assert.equal(first.messages.length,2);
  // 重問：原訊息之後接上自己的原回覆與驗證結果。
  assert.deepEqual(second.messages.slice(0,2),first.messages);
  assert.equal(second.messages[2].role,'assistant');
  assert.deepEqual(JSON.parse(second.messages[2].content).memorySelections,[{id:'unknown-ref',version:1,reason:'保留'}]);
  assert.equal(second.messages[3].role,'user');
  const repair=JSON.parse(second.messages[3].content);
  assert.equal(repair.validationFailed,true);
  assert.match(repair.validationError,/欄位 memorySelections.*收到.*預期/);
  assert.match(repair.instruction,/只修正指出的問題/);
  const after=await r.read(true);
  // 修正後的決策隨回合提交。
  assert.equal(after.world.minute,r.before.world.minute+15);assert.equal(after.world.turn,r.before.world.turn+1);
  // 兩次派送都計次、計費，帳本分類是 NPC。
  assert.equal(after.world.aiUsage.totalCalls,2);assert.equal(after.world.aiUsage.totalUnknownCalls,0);
  assert.equal(after.world.aiUsage.totalInputTokens,60);assert.equal(after.world.aiUsage.totalOutputTokens,20);
  assert.equal(accountCalls(after),accountCalls(r.before)+2);
  const [cost]=npcCost(after.world);
  assert.equal(cost.calls,2);assert.equal(cost.input,60);
  // 兩次派送都留在私有決策實錄，第一次帶著不合契約的原因。
  assert.equal(after.decisionTrace.outcome,'committed');
  assert.deepEqual(tasks(after.decisionTrace),['npc:candidate-validation','npc']);
  const [failed,corrected]=after.decisionTrace.dispatches;
  assert.equal(failed.failure.stage,'npc-candidate-validation');assert.equal(failed.failure.reason,'memory-selection-reference');
  assert.equal(failed.failure.detail,repair.validationError);
  assert.equal(JSON.parse(failed.requestBody).messages.length,2);
  assert.equal(JSON.parse(corrected.requestBody).messages.length,4);
  assert.deepEqual(JSON.parse(corrected.rawCandidate).memorySelections,[]);
  // 請求身分維持改動前的形狀。
  for(const dispatch of after.decisionTrace.dispatches)assert.match(dispatch.requestId,/^[0-9a-f-]{36}$/);
  // 有對象人物，照舊留操作證據。
  assert.equal(result.body.operationEvidence.counts.npc,2);
  assert.deepEqual(result.body.operationEvidence.dispatches.map(item=>[item.task,item.actorId]),[['npc',r.actor.id],['npc',r.actor.id]]);
  // 未啟用回想的環境不做派送預留。
  assert.deepEqual(await r.reservations(),[]);
  // 同一操作身分重送時回放原結果，不再派送。
  assert.deepEqual((await r.advance()).body,result.body);
  assert.equal(r.model.dispatches.length,2);
 }finally{r.restore();}
});

test('修正後仍不合契約時整回合回復：回合失敗且世界維持推進前的樣子，兩次派送都計入用量',async()=>{
 const r=await round({repair:true,reply:(_call,input)=>invalid(input)});
 try{
  const result=await r.advance();
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.equal(r.model.dispatches.length,2);
  const after=await r.read(true);
  unchanged(after.world,r.before.world);
  assert.equal(after.world.aiUsage.totalCalls,2);
  assert.equal(accountCalls(after),accountCalls(r.before)+2);
  assert.equal(after.decisionTrace.outcome,'rolled-back');
  assert.deepEqual(tasks(after.decisionTrace),['npc:candidate-validation','npc:candidate-validation']);
  assert.equal(result.body.error,after.decisionTrace.dispatches[1].failure.detail);
  assert.match(result.body.error,/欄位 memorySelections.*收到.*預期/);
  assert.deepEqual((await r.advance()).body,result.body);
  assert.equal(r.model.dispatches.length,2);
 }finally{r.restore();}
});

test('回想續答的每次派送都計入用量：人物取得回想結果後再回覆一次，兩次派送都計入用量並留在私有決策實錄',async()=>{
 const r=await round({recall:true,reply:(call,input)=>call===1?recallRequest:valid(input)});
 try{
  const result=await r.advance();
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.deepEqual(r.chats,[]);
  assert.equal(r.model.dispatches.length,2);
  const [first,second]=r.model.dispatches;
  assert.equal(first.label,r.actor.name+'的 NPC 決策');assert.equal(second.label,r.actor.name+'的回想續答');
  assert.equal(second.task,'npc');assert.equal(second.attempt,2);
  // 續答：原回覆之後接上回想結果的引用，完整內容放進輸入。
  assert.equal(second.messages.length,4);
  assert.deepEqual(JSON.parse(second.messages[2].content),recallRequest);
  const continuation=JSON.parse(second.messages[3].content);
  assert.deepEqual(continuation.recalledMemories,[{id:'recall-me',version:2}]);assert.equal(continuation.recallComplete,true);
  assert.ok(second.messages[1].content.includes('據說她喜歡紅茶，尚未確認。'));
  const after=await r.read(true);
  assert.equal(after.world.minute,r.before.world.minute+15);
  assert.equal(after.world.aiUsage.totalCalls,2);assert.equal(after.world.aiUsage.totalUnknownCalls,0);
  assert.equal(after.world.aiUsage.totalInputTokens,60);
  assert.equal(accountCalls(after),accountCalls(r.before)+2);
  assert.equal(npcCost(after.world)[0].calls,2);
  assert.equal(after.decisionTrace.outcome,'committed');
  assert.deepEqual(tasks(after.decisionTrace),['npc','npc']);
  assert.deepEqual(JSON.parse(after.decisionTrace.dispatches[0].rawCandidate),recallRequest);
  assert.equal(JSON.parse(after.decisionTrace.dispatches[1].requestBody).messages.length,4);
  assert.equal(result.body.operationEvidence.counts.npc,2);
  // 兩次派送各自登記派送預留；key 的形狀與改動前相同（第一次是回合內第幾次派送，續答是這位人物自己的序號）。
  const chat=(await r.reservations()).filter(row=>row.kind==='chat').map(row=>row.reservation_id);
  assert.equal(chat.length,2);
  assert.match(chat[0],new RegExp(':'+r.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+':chat:0$'));
  assert.match(chat[1],new RegExp(':'+r.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+':'+r.actor.id+':\\d+$'));
  assert.equal(after.recallUsage.playerPaidChatCalls,2);
  assert.deepEqual((await r.advance()).body,result.body);
  assert.equal(r.model.dispatches.length,2);
 }finally{r.restore();}
});

test('回想續答前預算已用完：帳號的玩家預算在第一次派送後達到上限，沒有第二次派送，回應說明預算已達上限',async()=>{
 const r=await round({recall:true,reply:(call,input)=>call===1?recallRequest:valid(input),usage:{inputTokens:900,outputTokens:100},budget:{calls:120,tokens:1000}});
 try{
  const result=await r.advance();
  assert.equal(result.status,429,JSON.stringify(result.body));
  assert.deepEqual(result.body.stopReason,{scope:'player',code:'player_budget'});
  assert.match(result.body.error,/預算|上限/);
  assert.equal(r.model.dispatches.length,1,'沒有第二次派送');
  const after=await r.read(true);
  unchanged(after.world,r.before.world);
  // 已付的那一次保留。
  assert.equal(after.world.aiUsage.totalCalls,1);assert.equal(after.world.aiUsage.totalInputTokens,900);
  assert.equal(accountCalls(after),accountCalls(r.before)+1);
  assert.deepEqual(tasks(after.decisionTrace),['npc']);
  assert.equal((await r.reservations()).filter(row=>row.kind==='chat').length,1);
 }finally{r.restore();}
});

test('未開啟格式修正時只派送一次：回覆不合契約，回合失敗且已付用量保留',async()=>{
 const r=await round({reply:(_call,input)=>invalid(input)});
 try{
  const result=await r.advance();
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.match(result.body.error,/欄位 memorySelections.*收到.*預期/);
  assert.equal(r.model.dispatches.length,1);
  const after=await r.read(true);
  unchanged(after.world,r.before.world);
  assert.equal(after.world.aiUsage.totalCalls,1);assert.equal(after.world.aiUsage.totalInputTokens,30);
  assert.equal(accountCalls(after),accountCalls(r.before)+1);
  assert.deepEqual(tasks(after.decisionTrace),['npc:candidate-validation']);
  assert.equal(result.body.error,after.decisionTrace.dispatches[0].failure.detail);
 }finally{r.restore();}
});

test('沒有送出的請求不計入用量：決策在送出前因派送預留失敗而停下，重讀世界時世界內用量的呼叫次數沒有因這次決策增加',async()=>{
 const r=await round();
 try{
  // 帳號帳本的派送預留是送出前的最後一關；讓這一筆寫入失敗。
  r.store.onStorage(sql=>{if(sql.startsWith('INSERT OR IGNORE INTO player_dispatches'))throw Error('fixture reservation unavailable');});
  const result=await r.advance();
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.equal(result.body.error,'fixture reservation unavailable');
  assert.equal(r.model.dispatches.length,0,'決策沒有送出');
  r.store.onStorage(undefined);
  const after=await r.read();
  unchanged(after.world,r.before.world);
  assert.equal(after.world.aiUsage.totalCalls,r.before.world.aiUsage?.totalCalls||0);
  assert.equal(after.world.aiUsage.calls,r.before.world.aiUsage?.calls||0);
  assert.equal(npcCost(after.world).length,0);
  assert.equal(accountCalls(after),accountCalls(r.before));
 }finally{r.restore();}
});

test('格式修正之後仍可回想一次：三次派送各自計入用量，最後一次沿用格式修正的顯示名稱',async()=>{
 const r=await round({repair:true,recall:true,reply:(call,input)=>call===1?invalid(input):call===2?recallRequest:valid(input)});
 try{
  const result=await r.advance();
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.deepEqual(r.model.dispatches.map(dispatch=>dispatch.label),[' NPC 決策',' NPC 決策格式修正',' NPC 決策格式修正'].map(label=>r.actor.name+'的'+label));
  assert.equal(r.model.dispatches[2].messages.length,6);
  const after=await r.read(true);
  assert.equal(after.world.aiUsage.totalCalls,3);
  assert.deepEqual(tasks(after.decisionTrace),['npc:candidate-validation','npc','npc']);
  assert.equal((await r.reservations()).filter(row=>row.kind==='chat').length,3);
 }finally{r.restore();}
});
