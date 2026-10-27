/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const opid=()=>Date.now()+':'+crypto.randomUUID();
async function scenario(prepare=()=>{}) {
 const w=seedWorld();w.contextId='life-needs';w.adjudication={provider:'openai',model:'fixture-judge'};w.characters=w.characters.filter(c=>c.id==='owner');prepare(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:opid(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});let npc=0,inputs=[];const old=global.fetch;
 global.fetch=async(_url,init)=>{npc++;inputs.push(JSON.parse(JSON.parse(init.body).messages[1].content));return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify({type:npc===1?'rest':'continue',target:'',content:'先留在這裡',mood:'平靜',durationMinutes:90,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}})}}]});};
 return {post,read:async()=>(await(await GET()).json()).world,inputs,calls:()=>npc,restore:()=>{global.fetch=old;}};
}
test('four needs start at an explicit mutation boundary, advance separately and survive SQLite read/replay',async()=>{
 const s=await scenario();try{
  const before=await s.read();assert.equal(before.characters[0].needs,undefined);
  const body={operation:'advance',minutes:15,operationId:opid()};const response=await s.post(body);assert.equal(response.status,200,await response.clone().text());let w=await s.read();
  assert.deepEqual(w.characters[0].needs.values,{hunger:20.75,thirst:21.5,fatigue:15.25,sleep:21});assert.equal(w.characters[0].needs.activatedAt,before.minute);assert.equal(w.characters[0].needs.updatedAt,w.minute);
  const current=structuredClone(w.characters[0].needs);await s.read();assert.deepEqual((await s.read()).characters[0].needs,current);await s.post(body);assert.deepEqual((await s.read()).characters[0].needs,current);assert.equal(s.calls(),1);
  const input=JSON.stringify(s.inputs[0]);assert.match(input,/bodyFeelings/);assert.doesNotMatch(input,/activatedAt|updatedAt|assessed|20\.75|21\.5/);
 }finally{s.restore();}
});

test('a new feeling stage prompts once, continuing is voluntary and same stage does not reprompt after reload',async()=>{
 const s=await scenario(w=>{w.characters[0].needs={version:1,activatedAt:w.minute,updatedAt:w.minute,values:{hunger:39,thirst:39,fatigue:39,sleep:39},assessed:{hunger:0,thirst:0,fatigue:0,sleep:0},history:[],dropped:0};});try{
  await s.post({operation:'advance',minutes:15});assert.equal(s.calls(),1);const first=(await s.read()).characters[0].plan;
  await s.post({operation:'advance',minutes:15});const w=await s.read();assert.equal(s.calls(),2);assert.equal(w.characters[0].plan.startedAt,first.startedAt);assert.equal(w.characters[0].plan.until,first.until);
  await s.post({operation:'advance',minutes:15});assert.equal(s.calls(),2);assert.equal((await s.read()).characters[0].needs.assessed.hunger,1);assert.equal((await s.read()).characters[0].intents.length,0);
 }finally{s.restore();}
});

test('later model failure and save conflict roll back needs and assessed stages while operation replay does not dispatch',async()=>{
 const s=await scenario();try{
  await s.post({operation:'advance',minutes:15});await s.post({operation:'intervene',target:'owner',text:'你好'});const before=await s.read();store.conflictOnNextSave();const body={operation:'advance',minutes:15,operationId:opid()};assert.equal((await s.post(body)).status,502);assert.deepEqual((await s.read()).characters[0].needs,before.characters[0].needs);const calls=s.calls();await s.post(body);assert.equal(s.calls(),calls);
 }finally{s.restore();}
});
