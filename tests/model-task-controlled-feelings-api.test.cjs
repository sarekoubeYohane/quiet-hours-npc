/* eslint-disable @typescript-eslint/no-require-imports -- #416：接管後感受經模型任務派送；經 route、替身資料庫與腳本模型。 */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const origin='https://test.invalid',usage={inputTokens:30,outputTokens:10};
const policy={version:1,kind:'test',id:'controlled-feelings-416',initial:5,maximum:20,awakePerHour:0,regulationCost:4,lowAt:4,experience:{levels:[0,2,5]},process:{seed:7,slotMinutes:15,levels:[0,4,8],multipliers:[1]}};
const operationId=()=>Date.now()+':'+crypto.randomUUID();
const feeling=()=>({contractVersion:'controlled-feelings.v1',feelingUpdates:[],processFeeling:{direction:'positive',level:1,reason:'我覺得這段休息舒服'}});
const recallKeys=['RECALL_ENABLED','RECALL_USAGE_DB'];

// 使用者指定一位人物休息（暫時接管）；接管後感受由腳本模型回覆，其他人物的 NPC 自主決策仍由替換的 fetch 回覆（#417 才改）。
async function takeover({recall=false,others=false,spend=false,reply=feeling}={}){
 const {scriptedModel}=load('scripted-model'),{GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world'),{env}=load('cloudflare-workers');
 const world=seedWorld();world.contextId='model-task-controlled-feelings';
 if(!others)world.characters=world.characters.filter(character=>character.id==='owner');
 world.adjudication={provider:'openai',model:'fixture'};
 store.install(world);env.MENTAL_ENERGY_TEST_POLICY=JSON.stringify(policy);
 if(recall){env.RECALL_ENABLED='true';env.RECALL_USAGE_DB=store.database();}
 const fetches=[],original=global.fetch;
 global.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);fetches.push(input);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'rest',target:'',content:'我自己休息'}))}}]});};
 const first=await(await GET(new Request(origin+'/api/world'))).json();
 const model=scriptedModel(dispatch=>({reply:reply(dispatch),usage}));
 const post=async body=>{
  const response=await POST(new Request(origin+'/api/world',{method:'POST',headers:{origin,'X-World-Time-Policy':'round-v2'},body:JSON.stringify({operationScope:first.operationScope,worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',operationId:operationId(),...body})}),{modelTransport:model});
  return {status:response.status,body:await response.json()};
 };
 const ok=async body=>{const result=await post(body);assert.equal(result.status,200,JSON.stringify(result.body));return result;};
 // 帶操作身分讀取時另附該操作的私有決策實錄；operationScope 用 GET 回應裡的那一個。
 const read=async id=>(await GET(new Request(origin+'/api/world'+(id?'?operationScope='+encodeURIComponent(first.operationScope)+'&operationId='+encodeURIComponent(id):'')))).json();
 const reservations=async()=>(await store.database().prepare('SELECT reservation_id, account_owner, kind, units FROM recall_dispatch_usage ORDER BY reserved_at').bind().all()).results;
 await ok({operation:'set-model-key',key:'fixture'});
 // 先讓人物自己過一回合，帳號才有已用的額度。
 if(spend)await ok({operation:'advance',minutes:15});
 await ok({operation:'direct',action:{type:'rest',target:'',content:'我指定繼續在這裡休息'}});
 const id=operationId();
 return {store,model,fetches,id,post,ok,read,reservations,advance:()=>post({operation:'advance',minutes:15,operationId:id}),restore(){global.fetch=original;store.onStorage(undefined);delete env.MENTAL_ENERGY_TEST_POLICY;for(const key of recallKeys)delete env[key];delete globalThis.__FORMAT_REPAIR__;}};
}
const tasks=trace=>trace.dispatches.map(dispatch=>dispatch.task+(dispatch.failure?':'+dispatch.failure.kind:''));

test('接管後感受的既有行為不變：被暫時接管的人物有一次獨立的感受派送，計入用量並留在私有決策實錄與操作證據',async()=>{
 const t=await takeover();
 try{
  const before=await t.read(),result=await t.advance();
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(t.fetches.length,0,'接管後感受不再經 fetch 派送');
  assert.equal(t.model.dispatches.length,1);
  const [dispatch]=t.model.dispatches;
  assert.equal(dispatch.task,'feelings');assert.equal(dispatch.actorId,'owner');assert.equal(dispatch.attempt,1);
  assert.equal(dispatch.label,before.world.characters[0].name+'的感受評估');
  assert.equal(dispatch.provider,'openai');assert.equal(dispatch.model,'gpt-6-luna');
  assert.equal(dispatch.maxOutputTokens,undefined);
  assert.equal(dispatch.messages.length,2);
  assert.equal(dispatch.input.contractVersion,'controlled-feelings.v1');
  assert.deepEqual(dispatch.contract.required,['contractVersion','feelingUpdates','processFeeling']);
  const after=await t.read(t.id),character=after.world.characters[0];
  // 感受隨回合提交，行動仍是使用者指定的那一個。
  assert.equal(after.world.minute,before.world.minute+15);
  assert.equal(character.plan.action.type,'rest');
  assert.equal(character.plan.mentalProcess.assessment.direction,'positive');
  // 這次派送計次、計費，帳本分類是感受。
  assert.equal(after.world.aiUsage.totalCalls,1);assert.equal(after.world.aiUsage.totalUnknownCalls,0);
  assert.equal(after.world.aiUsage.totalInputTokens,30);assert.equal(after.world.aiUsage.totalOutputTokens,10);
  assert.equal(after.accountPlayer.usage.calls,before.accountPlayer.usage.calls+1);
  const costs=Object.values(after.world.aiUsage.costs.total);
  assert.equal(costs.length,1);assert.equal(costs[0].task,'feelings');assert.equal(costs[0].calls,1);assert.equal(costs[0].input,30);
  // 私有決策實錄保存送出內容與回覆。
  assert.equal(after.decisionTrace.outcome,'committed');
  assert.deepEqual(tasks(after.decisionTrace),['feelings']);
  const [traced]=after.decisionTrace.dispatches;
  assert.equal(traced.actorId,'owner');
  assert.match(traced.requestId,/:owner:feelings:/);
  assert.equal(JSON.parse(traced.requestBody).messages.length,2);
  assert.equal(JSON.parse(traced.rawCandidate).contractVersion,'controlled-feelings.v1');
  // 有對象人物的任務照舊留操作證據。
  assert.equal(result.body.operationEvidence.counts.feelings,1);
  assert.deepEqual(result.body.operationEvidence.dispatches.map(item=>[item.task,item.actorId]),[['feelings','owner']]);
  // 未啟用回想的環境不做派送預留。
  assert.deepEqual(await t.reservations(),[]);
  // 同一操作身分重送時回放原結果，不再派送。
  assert.equal((await t.advance()).status,200);
  assert.equal(t.model.dispatches.length,1);
 }finally{t.restore();}
});

test('啟用回想的環境下，接管後感受的派送會先登記：回想用量帳本多一筆玩家付費的派送預留',async()=>{
 const t=await takeover({recall:true});
 try{
  const result=await t.advance();
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(t.model.dispatches.length,1);
  const rows=await t.reservations();
  assert.equal(rows.length,1);
  assert.equal(rows[0].account_owner,'test-owner');assert.equal(rows[0].kind,'chat');assert.equal(rows[0].units,1);
  // 派送預留的 key 與改動前相同：世界、操作身分、推進回合內的第幾次派送。
  assert.ok(rows[0].reservation_id.endsWith(':'+t.id+':chat:0'),rows[0].reservation_id);
 }finally{t.restore();}
});

test('付費請求結果不明時不重送：感受派送已登記但結果不明，同一次派送再被要求送出時回應說明禁止重送，沒有再次派送模型',async()=>{
 const t=await takeover({recall:true});
 try{
  const before=await t.read();
  // 這次派送要查自己的派送預留時，帳本裡已經有同一筆（先前登記、結果不明）。
  let registered;
  t.store.onStorage(async(sql,values)=>{
   if(registered||!sql.includes('FROM recall_dispatch_usage WHERE reservation_id'))return;
   registered=values[0];
   await load('recall-services').reserveRecallDispatch(t.store.database(),'test-owner','chat',registered,1,{ownerMonthly:0,accountMonthly:0},'player');
  });
  const result=await t.advance();
  assert.ok(registered?.endsWith(':'+t.id+':chat:0'),String(registered));
  assert.notEqual(result.status,200);
  assert.match(result.body.error,/付費請求結果不明，禁止重送。/);
  assert.equal(t.model.dispatches.length,0);
  assert.equal(t.fetches.length,0);
  // 回合沒有推進，也沒有多登記一筆、沒有計次。
  const after=await t.read();
  assert.equal(after.world.minute,before.world.minute);
  assert.equal((await t.reservations()).length,1);
  assert.equal(after.accountPlayer.usage.totalCalls,before.accountPlayer.usage.totalCalls);
 }finally{t.restore();}
});

test('預算用完時不派送感受：帳號的玩家預算已達上限，推進世界時間時沒有派送模型',async()=>{
 const t=await takeover({spend:true});
 try{
  const spent=(await t.read()).accountPlayer.usage,sent=t.fetches.length;
  assert.ok(spent.calls>0);
  await t.ok({operation:'set-budget',limits:{calls:spent.calls,tokens:10000000}});
  const before=await t.read(),result=await t.advance();
  assert.equal(result.status,429,JSON.stringify(result.body));
  assert.match(result.body.error,/已達玩家 AI 用量上限/);
  assert.equal(t.model.dispatches.length,0);
  assert.equal(t.fetches.length,sent);
  assert.deepEqual((await t.read()).accountPlayer.usage,before.accountPlayer.usage);
 }finally{t.restore();}
});

test('預算在同一回合內用完時不派送感受：其他人物的派送用掉最後的額度後，感受不派送、回合回復，已付用量保留',async()=>{
 const t=await takeover({others:true});
 try{
  const before=await t.read(),npcs=before.world.characters.length-1;
  assert.ok(npcs>0);
  await t.ok({operation:'set-budget',limits:{calls:before.accountPlayer.usage.calls+npcs,tokens:10000000}});
  const result=await t.advance();
  assert.equal(result.status,429,JSON.stringify(result.body));
  assert.match(result.body.error,/已達玩家 AI 用量上限/);
  assert.equal(t.fetches.length,npcs);
  assert.equal(t.model.dispatches.length,0);
  const after=await t.read();
  assert.equal(after.world.minute,before.world.minute);
  assert.equal(after.accountPlayer.usage.calls,before.accountPlayer.usage.calls+npcs);
 }finally{t.restore();}
});

test('接管後感受的回覆不合契約時不重問：即使建置開啟格式修正也只派送一次，回合失敗且已付用量保留，失敗留在私有決策實錄',async()=>{
 const t=await takeover({reply:()=>({...feeling(),contractVersion:'something-else'})});
 try{
  const before=await t.read();
  globalThis.__FORMAT_REPAIR__='1';
  const result=await t.advance();
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.equal(result.body.error,'接管感受只允許合法經歷與實際活動感受，不能越權決策或調節');
  assert.equal(t.model.dispatches.length,1);
  const after=await t.read(t.id);
  assert.equal(after.world.minute,before.world.minute);
  assert.equal(after.world.aiUsage.totalCalls,1);assert.equal(after.world.aiUsage.totalInputTokens,30);
  assert.equal(after.accountPlayer.usage.calls,before.accountPlayer.usage.calls+1);
  assert.deepEqual(tasks(after.decisionTrace),['feelings:candidate-validation']);
  assert.equal(after.decisionTrace.dispatches[0].failure.stage,'controlled-feelings-validation');
  assert.equal(result.body.operationEvidence.dispatches[0].task,'feelings');
  assert.equal(result.body.operationEvidence.dispatches[0].candidate.status,'captured');
 }finally{t.restore();}
});
