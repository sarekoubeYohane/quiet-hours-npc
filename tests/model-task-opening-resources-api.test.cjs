/* eslint-disable @typescript-eslint/no-require-imports -- #413：開局備料經模型任務派送；經 world route、替身資料庫與腳本模型。 */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const origin='https://test.invalid';
const operationId=()=>Date.now()+':'+crypto.randomUUID();

// 以真正的開局 API 建立一個尚在第 0 回合的世界，回傳經 route 讀寫它的工具。
async function openingWorld(){
 const {POST,GET}=load('route'),store=load('store');store.install(load('world').seedWorld());
 const sceneResponse=await load('scene-templates-route').POST(new Request(origin+'/api/scene-templates',{method:'POST',headers:{origin},body:JSON.stringify({accountScope:'account-operations:test-owner',id:crypto.randomUUID(),version:0,name:'住宅',note:'住戶日常起居',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]})}));
 assert.equal(sceneResponse.status,201);
 const scene=(await sceneResponse.json()).template;
 const save=await require('./create-world-via-opening.cjs')({load,name:'備料測試',scene,characterPlacement:{homeId:'home'}});
 const url=origin+'/api/world?save='+save.input.id+'&owner=test-owner';
 const scope=(await(await GET(new Request(url))).json()).operationScope;
 // 帶操作身分讀取時，回應另附該操作的私有決策實錄。
 const read=async(id)=>(await GET(new Request(url+(id?'&operationId='+encodeURIComponent(id)+'&operationScope='+encodeURIComponent(scope):'')))).json();
 const post=async(body,services)=>{
  const current=await read();
  return POST(new Request(url,{method:'POST',headers:{origin,'X-World-Time-Policy':'round-v2'},body:JSON.stringify({operationScope:current.operationScope,worldContext:current.world.contextId,mode:'demo',...body})}),services);
 };
 assert.equal((await post({operation:'set-adjudication',operationId:operationId(),adjudication:{provider:'openai',model:'gpt-6.1-sol'}})).status,200);
 const prepare=async(services,id=operationId())=>{
  const body={operation:'prepare-opening-resources',resourceRequest:'飲水和簡餐',expectedVersion:(await read()).version,operationId:id};
  return {body,response:await post(body,services)};
 };
 return {read,post,prepare};
}

// 合乎契約的回覆：在腳本看到的第一位人物所在的房間各備一份飲水與即食食物。
const validPlan=task=>{
 const actor=task.input.actors[0];
 const supply=(kind,label)=>({region:actor.region,kind,label,portions:4,responsible:actor.id,allowedTo:[actor.id],reason:'住戶備妥並允許取用的日常物資'});
 return {supplies:[supply('water','可直接飲用的瓶裝水'),supply('food','可直接食用的三明治')],furnishingGrants:[],unavailable:[]};
};
const usage={inputTokens:20,outputTokens:10};

test('預算用完時不派送：回應說明預算已達上限，帳號的累計用量沒有增加',async()=>{
 const {scriptedModel}=load('scripted-model');
 const {read,post,prepare}=await openingWorld();
 const spent=(await read()).accountPlayer.usage;
 assert.ok(spent.calls>=1,'開局流程的人物卡判讀已用掉至少一次呼叫');
 assert.equal((await post({operation:'set-budget',operationId:operationId(),limits:{calls:spent.calls,tokens:10000000}})).status,200);
 const before=await read();
 const model=scriptedModel(task=>({reply:validPlan(task),usage}));
 const {response}=await prepare({modelTransport:model});
 const result=await response.json();
 assert.equal(response.status,429,JSON.stringify(result));
 assert.match(result.error,/已達玩家 AI 用量上限/);
 assert.equal(result.limitReached,true);
 assert.equal(model.dispatches.length,0);
 const after=await read();
 assert.deepEqual(after.accountPlayer.usage,before.accountPlayer.usage);
 assert.equal(after.world.supplies?.length??0,0);
});

test('回覆合乎契約時保存結果並計一次用量，私有決策實錄留下這次派送',async()=>{
 const {scriptedModel}=load('scripted-model');
 const {read,prepare}=await openingWorld();
 const before=await read();
 const model=scriptedModel(task=>({reply:validPlan(task),usage}));
 const {body,response}=await prepare({modelTransport:model});
 assert.equal(response.status,200,await response.clone().text());

 // 腳本模型看到的是任務本身，不是供應商的請求格式。
 assert.equal(model.dispatches.length,1);
 const [seen]=model.dispatches;
 assert.equal(seen.task,'opening-resources');
 assert.equal(seen.label,'開局備料');
 assert.equal(seen.actorId,undefined);
 assert.equal(seen.provider,'openai');
 assert.equal(seen.model,'gpt-6.1-sol');
 assert.equal('key' in seen,false);
 assert.equal(seen.attempt,1);
 assert.equal(seen.maxOutputTokens,6000);
 assert.equal(seen.input.contractVersion,'opening-resources.v1');
 assert.equal(seen.input.request,'飲水和簡餐');
 assert.equal(seen.contract.type,'object');

 const after=await read(body.operationId);
 assert.equal(after.world.turn,0);
 assert.deepEqual(after.world.supplies.map(item=>item.label).sort(),['可直接食用的三明治','可直接飲用的瓶裝水']);
 assert.equal(after.world.openingResources.supplies.length,2);
 assert.equal(after.world.aiUsage.calls,before.world.aiUsage.calls+1);
 assert.equal(after.world.aiUsage.inputTokens,before.world.aiUsage.inputTokens+20);
 assert.equal(after.world.aiUsage.outputTokens,before.world.aiUsage.outputTokens+10);
 assert.equal(after.accountPlayer.usage.calls,before.accountPlayer.usage.calls+1);

 const trace=after.decisionTrace;
 assert.equal(trace.operation,'prepare-opening-resources');
 assert.equal(trace.dispatches.length,1);
 const [dispatch]=trace.dispatches;
 assert.equal(dispatch.task,'adjudication');
 assert.equal(dispatch.requestId,body.operationId+':opening-resources');
 assert.deepEqual(dispatch.usage,usage);
 const sent=JSON.parse(dispatch.requestBody);
 assert.equal(JSON.parse(sent.messages.at(-1).content).request,'飲水和簡餐');
 assert.deepEqual(JSON.parse(dispatch.rawCandidate),validPlan(seen));
 assert.deepEqual(JSON.parse(JSON.parse(dispatch.responseBody).content),validPlan(seen));
});

test('同一操作身分重送時回應與第一次相同，不再派送',async()=>{
 const {scriptedModel}=load('scripted-model');
 const {post,prepare}=await openingWorld();
 const model=scriptedModel(task=>({reply:validPlan(task),usage}));
 const {body,response}=await prepare({modelTransport:model});
 assert.equal(response.status,200,await response.clone().text());
 const first=await response.json();
 const again=await post(body,{modelTransport:model});
 assert.equal(again.status,200);
 const replayed=await again.json();
 assert.deepEqual(replayed,first);
 assert.equal(model.dispatches.length,1);
});

test('回覆不合契約時操作失敗、世界沒有新增物資，只派送一次且已付用量保留',async()=>{
 const {scriptedModel}=load('scripted-model');
 const {read,prepare}=await openingWorld();
 const before=await read();
 // 缺少契約要求的 unavailable，portions 也不是整數。
 const model=scriptedModel(task=>({reply:{supplies:[{...validPlan(task).supplies[0],portions:'很多'}],furnishingGrants:[]},usage}));
 const {response}=await prepare({modelTransport:model});
 const result=await response.json();
 assert.equal(response.status,502,JSON.stringify(result));
 assert.equal(result.error,'日常物資未能完整確認，尚未新增物資；原世界與回合已保留。');
 assert.equal(model.dispatches.length,1);
 const after=await read();
 assert.equal(after.world.supplies?.length??0,0);
 assert.equal(after.world.openingResources,undefined);
 assert.equal(after.world.turn,0);
 assert.equal(after.world.aiUsage.calls,before.world.aiUsage.calls+1);
 assert.equal(after.accountPlayer.usage.calls,before.accountPlayer.usage.calls+1);
 assert.equal(after.accountPlayer.usage.inputTokens,before.accountPlayer.usage.inputTokens+20);
 assert.equal(after.accountPlayer.usage.outputTokens,before.accountPlayer.usage.outputTokens+10);
});
