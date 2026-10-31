/* eslint-disable @typescript-eslint/no-require-imports -- API transport fixtures. */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = build('world'), { GET, POST } = build('route'), store = build('store');
const world = require('./fixtures/ai-world.cjs')(seedWorld);
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin:'https://test.invalid', 'X-World-Time-Policy':'round-v1' }, body:JSON.stringify({ operationId:`${Date.now()}:${crypto.randomUUID()}`, mode:'demo', ...body }) });
const read = async () => (await (await GET()).json()).world;
const reference = input => ({kind:'short',id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version});
async function withModel(choose, run) {
 const previous=global.fetch, inputs=[];
 global.fetch=async (_url,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);if(input.contractVersion==='world-adjudication.v1')return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{status:'accepted',effects:[],stages:[],check:null,routine:null,completionMinutes:480,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}}))}}]});inputs.push(input);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[],cognitiveUpdates:[],interpretation:'',...choose(input)}))}}]});};
 try {await POST(request({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(request({operation:'set-budget',limits:{calls:120,tokens:500000}}));await run(inputs,body=>POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,...body})));} finally {global.fetch=previous;}
}

const create = input => ({operation:'upsert',id:'later-tea',version:0,text:'稍後和 Vera 討論新的茶',condition:{kind:'time',minute:600},references:[reference(input)],reason:'我想留待稍後處理'});

test('世界時間到期只提供一次正常決策，continue 保留原活動，重送與GET不重喚起',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>c.id==='owner');store.install(initial);let stage=0;
 await withModel(input=>stage===0?{type:'rest',durationMinutes:120,timeIntent:{kind:'open-ended',maxMinutes:null},arrangementUpdates:[{...create(input),condition:{kind:'time',minute:initial.minute+30}}]}:{type:'continue'},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const started=(await read()).characters[0].plan;stage=1;const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId});assert.equal(response.status,200);const result=await response.json();
  assert.equal(inputs.length,2);assert.equal(inputs.at(-1).self.arrangementCues.length,1);const saved=(await read()).characters[0];assert.equal(saved.plan.startedAt,started.startedAt);assert.equal(saved.plan.until,started.until);assert.equal(saved.arrangements.items[0].cue.trigger.handledAt,result.world.minute);assert.equal(saved.arrangements.items[0].status,'active');
  assert.deepEqual(await(await advance({operationId})).json(),result);await read();assert.equal((await advance()).status,200);assert.equal(inputs.length,2);
 });
});
test('明示延期可再次喚起；同條件改字不再觸發，未完成安排保持',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>c.id==='owner');store.install(initial);let stage=0;
 await withModel(input=>({arrangementUpdates:stage===0?[{...create(input),condition:{kind:'time',minute:0}}]:stage===1?[{...create(input),version:1,text:'換個說法：稍後談茶',condition:{kind:'time',minute:0}}]:stage===3?[{...create(input),version:2,condition:{kind:'time',minute:initial.minute+75}}]:[]}),async(inputs,advance)=>{
  for(stage=0;stage<6;stage++)assert.equal((await advance()).status,200);
  assert.deepEqual(inputs.map(i=>i.self.arrangementCues.length),[0,1,0,0,1,0]);assert.equal((await read()).characters[0].arrangements.items[0].status,'active');
 });
});
test('本人位置情境離開再返回可再喚起；持續相同情境及無關版本不會重提醒',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>c.id==='owner');store.install(initial);let stage=0;
 await withModel(input=>stage===0?{type:'move',target:'cafe-storeroom',arrangementUpdates:[{...create(input),condition:{kind:'context',region:'cafe-storeroom'}}]}:stage===2?{type:'move',target:'cafe-front'}:stage===3?{type:'move',target:'cafe-storeroom'}:{},async(inputs,advance)=>{
  for(stage=0;stage<6;stage++)assert.equal((await advance()).status,200);assert.deepEqual(inputs.map(i=>i.self.arrangementCues.length),[0,1,0,0,1,0]);
 });
});
test('事件喚起只依真實感知的已知線索；相同人物與區域的改口不刷新條件',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>['owner','cass'].includes(c.id));for(const c of initial.characters){c.location='cafe';c.region='cafe-front';}store.install(initial);let stage=0;
 await withModel(input=>input.self.id==='owner'?{arrangementUpdates:stage===0?[{...create(input),condition:{kind:'event',clueKind:'speech',source:'cass',region:'cafe-front'}}]:[]}:{type:'say',target:'owner',content:stage===0?'茶已準備好':'只是換個說法，茶準備好了'},async(inputs,advance)=>{
  for(stage=0;stage<3;stage++)assert.equal((await advance()).status,200);const ownerInputs=inputs.filter(i=>i.self.id==='owner');assert.deepEqual(ownerInputs.map(i=>i.self.arrangementCues.length),[0,1,0]);assert.ok(ownerInputs[1].self.observations.some(o=>o.source==='cass'&&o.kind==='speech'));
 });
});
test('未知人物到達與不可見私人事件不觸發精確喚起',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>['owner','cass'].includes(c.id));for(const c of initial.characters){c.location='cafe';c.region=c.id==='owner'?'cafe-front':'cafe-storeroom';}initial.scene={doors:{'cafe-door':'closed'},noise:{},occluded:[]};store.install(initial);let stage=0;
 await withModel(input=>input.self.id==='owner'?{arrangementUpdates:stage===0?[{...create(input),condition:{kind:'event',clueKind:'activity',source:'cass',region:'cafe-storeroom'}}]:[]}:{type:'reflect',content:'沒有向他人公開的私下想法'},async(inputs,advance)=>{
  for(stage=0;stage<3;stage++)assert.equal((await advance()).status,200);assert.ok(inputs.filter(i=>i.self.id==='owner').every(i=>i.self.arrangementCues.length===0));assert.ok(inputs.filter(i=>i.self.id==='owner').every(i=>!JSON.stringify(i).includes('沒有向他人公開的私下想法')));
 });
});
test('多提醒沿同一決策有界處理；未展示項目不被其他提醒一併標為已處理',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>c.id==='owner');store.install(initial);let stage=0;
 await withModel(input=>stage<2?{arrangementUpdates:Array.from({length:4},(_,i)=>({...create(input),id:'due-'+(stage*4+i),condition:{kind:'time',minute:initial.minute+45}}))}:{},async(inputs,advance)=>{
  for(stage=0;stage<3;stage++)assert.equal((await advance()).status,200);const items=(await read()).characters[0].arrangements.items;assert.equal(inputs[2].self.arrangementCues.length,4);assert.equal(inputs[2].self.arrangementCueGap,4);assert.equal(items.filter(i=>i.cue?.trigger?.handledAt!==undefined).length,4);assert.equal(items.filter(i=>i.cue?.trigger&&i.cue.trigger.handledAt===undefined).length,4);
  stage=3;assert.equal((await advance()).status,200);assert.equal((await read()).characters[0].arrangements.items.filter(i=>i.cue?.trigger?.handledAt!==undefined).length,8);assert.equal(inputs.length,4);
 });
});
test('喚起與已處理游標遇保存故障／CAS／提交後回應遺失維持原子與重送',async()=>{
 for(const fault of ['before','conflict','after']){
  const initial=world();initial.characters=initial.characters.filter(c=>c.id==='owner');store.install(initial);let stage=0;
  await withModel(input=>stage===0?{arrangementUpdates:[{...create(input),condition:{kind:'time',minute:initial.minute+30}}]}:{},async(inputs,advance)=>{
   assert.equal((await advance()).status,200);stage=1;const before=await read();if(fault==='before')store.throwBeforeNextSave();if(fault==='conflict')store.conflictOnNextSave();if(fault==='after')store.throwAfterNextSave();
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId}),result=await response.json(),after=await read(),calls=inputs.length;
   if(fault==='after')assert.ok(after.characters[0].arrangements.items[0].cue.trigger.handledAt);else{assert.deepEqual(after.characters,before.characters);assert.equal(after.minute,before.minute);}
   assert.deepEqual(await(await advance({operationId})).json(),result);assert.equal(inputs.length,calls);
  });
 }
});
test('較後角色錯誤共同回復已喚起安排與活動，不提前消耗處理機會',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>['owner','cass'].includes(c.id));store.install(initial);let stage=0,count=0;
 await withModel(input=>stage===0?{arrangementUpdates:[{...create(input),condition:{kind:'time',minute:initial.minute+30}}]}:++count===2?{type:'invalid'}:{},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const before=await read();stage=1;assert.equal((await advance()).status,502);const after=await read();assert.deepEqual(after.characters,before.characters);assert.equal(after.minute,before.minute);assert.equal(inputs[2].self.arrangementCues.length,1);
 });
});

test('真正睡眠不因內在時間提醒喚醒或增加決策；安排仍保持未完成',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>c.id==='owner');const c=initial.characters[0];c.needs={version:1,activatedAt:initial.minute,updatedAt:initial.minute,values:{hunger:20,thirst:20,fatigue:70,sleep:80},assessed:{hunger:0,thirst:0,fatigue:2,sleep:2},history:[],dropped:0};store.install(initial);
 await withModel(input=>({type:'propose',target:'cafe',content:'在角落睡覺',purpose:'恢復睡眠',timeIntent:{kind:'completion',maxMinutes:null},arrangementUpdates:[{...create(input),condition:{kind:'time',minute:initial.minute+30}}]}),async(inputs,advance)=>{
  for(let i=0;i<5;i++)assert.equal((await advance()).status,200);const saved=(await read()).characters[0];assert.equal(saved.plan.bodyActivity.kind,'sleep');assert.equal(inputs.length,1);assert.equal(saved.arrangements.items[0].status,'active');assert.equal(saved.arrangements.items[0].cue,undefined);
 });
});
