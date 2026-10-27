/* eslint-disable @typescript-eslint/no-require-imports -- API transport fixtures. */
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = build('world'), { GET, POST } = build('route'), store = build('store');
const world = require('./fixtures/ai-world.cjs')(seedWorld);
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin:'https://test.invalid', 'X-World-Time-Policy':'round-v1' }, body:JSON.stringify({ operationId:`${Date.now()}:${crypto.randomUUID()}`, mode:'demo', ...body }) });
const read = async () => (await (await GET()).json()).world;
const reference = input => ({kind:'short',id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version});
async function withModel(choose, run) {
 const previous=global.fetch, inputs=[];
 global.fetch=async (_url,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);inputs.push(input);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[],cognitiveUpdates:[],interpretation:'',...choose(input)})}}]});};
 try {await POST(request({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(request({operation:'set-budget',limits:{calls:120,tokens:500000}}));await run(inputs,body=>POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,...body})));} finally {global.fetch=previous;}
}

const create = input => ({operation:'upsert',id:'later-tea',version:0,text:'稍後和 Vera 討論新的茶',condition:{kind:'time',minute:600},references:[reference(input)],reason:'我想留待稍後處理'});
test('柔性安排在正常決策與 SQLite 重讀保存，不強制新增意圖，原 ID 重送不重派',async()=>{
 store.install(world());let first=true;
 await withModel(input=>first&&input.self.id==='cass'?{arrangementUpdates:[create(input)]}:{},async(inputs,advance)=>{
  const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId});assert.equal(response.status,200);const result=await response.json();
  const saved=(await read()).characters[0];assert.equal(saved.arrangements.items[0].version,1);assert.deepEqual(saved.intents,[]);
  assert.deepEqual(await(await advance({operationId})).json(),result);assert.equal(inputs.length,4);
  first=false;assert.equal((await advance()).status,200);const input=inputs.findLast(i=>i.self.id==='cass');assert.equal(input.self.arrangements.items[0].text,'稍後和 Vera 討論新的茶');assert.equal(inputs.findLast(i=>i.self.id==='vera').self.arrangements.items.length,0);
 });
});

test('本人可延期、維持與放下安排；時間越過不強制完成或重建意圖',async()=>{
 store.install(world());let stage=0;
 await withModel(input=>input.self.id!=='cass'?{}:{arrangementUpdates:stage===0?[create(input)]:stage<4?[{...create(input),version:stage===1?1:2,operation:stage===2?'keep':stage===3?'drop':'upsert',condition:{kind:'time',minute:0}}]:[]},async(inputs,advance)=>{
  for(stage=0;stage<5;stage++){assert.equal((await advance()).status,200);const c=(await read()).characters[0];assert.deepEqual(c.intents,[]);assert.equal(c.arrangements.items[0].status,stage>=3?'dropped':'active');if(stage===2)assert.equal(c.arrangements.items[0].version,2);}
 });
});
test('較後角色非法引用、過期與共同心理工作量超限，安排與知情整輪回復',async()=>{
 for(const fault of ['foreign','stale','count']){
  store.install(world());const before=await read();let first=true;
  await withModel(input=>{const item=create(input);if(first){first=false;return {arrangementUpdates:[item]};}if(fault==='foreign')item.references[0].id=before.characters[0].shortTerm[0].id;if(fault==='stale')item.version=1;return {arrangementUpdates:fault==='count'?Array.from({length:4},(_,i)=>({...item,id:'arr-'+i})):[item],...(fault==='count'?{memorySelections:[{id:input.self.shortTerm[0].id,version:1,reason:'保留'}]}:{})};},async(inputs,advance)=>{assert.equal((await advance()).status,502);const after=await read();assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.events,before.events);assert.equal(after.minute,before.minute);assert.equal(inputs.length,2);});
 }
});
test('安排保存故障、CAS 衝突與提交後回應遺失沿 journal 回復或重放',async()=>{
 for(const fault of ['before','after','conflict']){store.install(world());const before=await read();await withModel(input=>input.self.id==='cass'?{arrangementUpdates:[create(input)]}:{},async(inputs,advance)=>{
  if(fault==='before')store.throwBeforeNextSave();if(fault==='after')store.throwAfterNextSave();if(fault==='conflict')store.conflictOnNextSave();const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId}),result=await response.json();const after=await read();
  if(fault==='after'){assert.equal(after.characters[0].arrangements.items[0].version,1);assert.deepEqual(await(await advance({operationId})).json(),result);assert.equal(inputs.length,4);}else{assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.events,before.events);}
 });}
});
test('短期安排被合法容量淘汰後不從安排索引或 observer trace 復活',async()=>{
 store.install(world());let stage=0;
 await withModel(input=>stage===0&&input.self.id==='cass'?{arrangementUpdates:[create(input)]}:{},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);stage=1;
  for(let i=0;i<82;i++){const response=await POST(request({operation:'intervene',target:'cass',text:`新的本人經歷 ${i}`}));assert.equal(response.status,200);}
  const before=await read();assert.equal(before.characters[0].shortTerm.some(m=>m.text.includes('我的柔性安排')),false);
  assert.equal((await advance()).status,200);const input=inputs.findLast(i=>i.self.id==='cass');assert.deepEqual(input.self.arrangements.items,[]);assert.equal(JSON.stringify(input).includes('稍後和 Vera 討論新的茶'),false);assert.equal((await read()).characters[0].arrangements.items.length,1);
 });
});
test('明示歸檔只釋放已放下安排的索引，不刪本人記憶；不容許有效安排被靜默淘汰',async()=>{
 store.install(world());let stage=0;
 await withModel(input=>input.self.id!=='cass'?{}:{arrangementUpdates:[stage===0?create(input):{...create(input),version:stage===1?1:2,operation:stage===1?'drop':'archive'}]},async(inputs,advance)=>{
  for(stage=0;stage<3;stage++)assert.equal((await advance()).status,200);
  const c=(await read()).characters[0];assert.equal(c.arrangements.items.length,0);assert.ok(c.shortTerm.some(m=>m.text.includes('稍後和 Vera 討論新的茶')));
 });
});
test('選留的安排沿真實長期記憶保存；合法 forget 後索引不能恢復全文',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>c.id==='cass');store.install(initial);let stage=0;
 await withModel(input=>stage===0?{arrangementUpdates:[create(input)]}:stage===1?{memorySelections:input.self.shortTerm.filter(m=>m.text.includes('我的柔性安排')).map(m=>({id:m.id,version:m.version,reason:'我想記住稍後的打算'}))}:stage===3?{memoryOperations:[{type:'forget',targets:input.self.longTerm.map(m=>({id:m.id,version:m.version})),text:'',unresolved:[],reason:'我選擇放下這段記憶'}]}:{},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);stage=1;assert.equal((await advance()).status,200);
  for(let i=0;i<82;i++)assert.equal((await POST(request({operation:'intervene',target:'cass',text:`後來經歷 ${i}`}))).status,200);
  stage=2;assert.equal((await advance()).status,200);assert.equal(inputs.at(-1).self.arrangements.items.length,1);
  stage=3;assert.equal((await advance()).status,200);stage=4;assert.equal((await advance()).status,200);assert.deepEqual(inputs.at(-1).self.arrangements.items,[]);assert.doesNotMatch(JSON.stringify(inputs.at(-1)),/稍後和 Vera 討論新的茶/);assert.equal((await read()).characters[0].arrangements.items.length,1);
 });
});
test('16筆容量滿時不默默淘汰未完成安排，非法歸檔同樣整輪拒絕',async()=>{
 const initial=world();initial.characters=initial.characters.filter(c=>c.id==='cass');store.install(initial);let stage=0;
 await withModel(input=>stage<4?{arrangementUpdates:Array.from({length:4},(_,i)=>({...create(input),id:'item-'+(stage*4+i)}))}:stage===4?{arrangementUpdates:[{...create(input),id:'one-too-many'}]}:{arrangementUpdates:[{...create(input),id:'item-0',version:1,operation:'archive'}]},async(inputs,advance)=>{
  for(stage=0;stage<4;stage++)assert.equal((await advance()).status,200);const before=await read();assert.equal(before.characters[0].arrangements.items.length,16);
  for(stage=4;stage<6;stage++){assert.equal((await advance()).status,502);assert.deepEqual((await read()).characters,before.characters);}
 });
});
