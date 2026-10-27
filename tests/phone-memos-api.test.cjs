/* eslint-disable @typescript-eslint/no-require-imports -- Public API transport fixture. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${n}.cjs`));
const {seedWorld}=build('world'),{GET,POST}=build('route'),store=build('store');
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
const read=async()=>(await(await GET()).json()).world;
test('GET leaves legacy phone baseline absent; first committed advance provisions once and reload never replaces a lost phone',async()=>{
 store.install(seedWorld());assert.equal((await read()).phones,undefined);
 assert.equal((await POST(req({operation:'advance',minutes:15}))).status,200);
 const w=await read();assert.equal(w.phones.schemaVersion,1);assert.equal(w.phones.devices.length,4);assert.equal(w.objects.filter(o=>o.kind==='phone').length,4);
 const id=w.phones.devices[0].objectId;w.objects=w.objects.filter(o=>o.id!==id);store.install(w);
 assert.equal((await POST(req({operation:'advance',minutes:15}))).status,200);assert.equal((await read()).objects.some(o=>o.id===id),false);
});
async function withModel(choose,run){const old=global.fetch,inputs=[];global.fetch=async(_u,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);inputs.push(input);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[],cognitiveUpdates:[],interpretation:'',...choose(input)})}}]});};try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:100,tokens:1000000}}));await run(inputs,b=>POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,...b})));}finally{global.fetch=old;}}
const op=(input,p)=>({type:'phone',target:input.phones.find(d=>d.owner===input.self.id)?.objectId,content:JSON.stringify({collection:'memos',...p})});
test('normal phone decisions create, list, read, revise and remove exact private memo text without extra calls',async()=>{
 const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;
 await withModel(input=>input.self.id!=='cass'?{}:op(input,[{operation:'create',id:'note',version:0,text:'我想晚點談，不代表已答應。'},{operation:'list'},{operation:'read',id:'note',version:1},{operation:'update',id:'note',version:1,text:'新的原文，舊想法已修改。'},{operation:'delete',id:'note',version:2}][stage]),async(inputs,advance)=>{
 for(stage=0;stage<5;stage++){assert.equal((await advance()).status,200);const saved=await read(),d=saved.phones.devices.find(d=>saved.objects.find(o=>o.id===d.objectId).owner==='cass');assert.equal(d.memos.length,stage===4?0:1);if(stage<3)assert.equal(d.memos[0].text,'我想晚點談，不代表已答應。');if(stage===2)assert.equal(d.memos[0].readers[0].actorId,'cass');assert.equal(inputs.filter(i=>i.self.id==='vera').some(i=>JSON.stringify(i).includes('我想晚點談')),false);assert.equal(saved.events.some(e=>JSON.stringify(e).includes('我想晚點談')),false);}
 assert.equal(inputs.length,20);
 });
});
test('only actual finite displayed content can be read by a nearby third person; ordinary holding or borrowing exposes no body',async()=>{
 const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};w.characters.forEach(c=>{c.location='kris-home';c.region='kris-living';});store.install(w);let stage=0;
 await withModel(input=>{
  if(input.self.id==='cass')return stage===0?op(input,{operation:'create',id:'private',version:0,text:'這句只留給真正讀者。'}):stage===1?op(input,{operation:'display',id:'private',version:1}):{};
  if(input.self.id==='kris'&&stage>=2){const device=input.phones.find(d=>d.owner==='cass');return {type:'phone',target:device.objectId,content:JSON.stringify({collection:'memos',operation:stage===2?'list':'read',...(stage===3?{id:'private',version:1}:{})})};}
  return {};
 },async(inputs,advance)=>{
  for(stage=0;stage<4;stage++)assert.equal((await advance()).status,200);
  const saved=await read(),d=saved.phones.devices.find(d=>saved.objects.find(o=>o.id===d.objectId).owner==='cass');
  assert.deepEqual(d.memos[0].readers.map(r=>r.actorId),['kris']);assert.equal(saved.characters.find(c=>c.id==='kris').shortTerm.some(m=>m.text.includes('這句只留給真正讀者。')),true);
  assert.equal(inputs.filter(i=>i.self.id==='kris').some(i=>JSON.stringify(i).includes('這句只留給真正讀者。')),false);assert.equal(inputs.filter(i=>i.self.id==='vera').some(i=>JSON.stringify(i).includes('這句只留給真正讀者。')),false);
 });
});
test('phone data, readers and activation roll back on later actor failure and saving faults; original operation replay dispatches once',async()=>{
 for(const fault of ['later','before','after','conflict']){
  const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let fail=fault==='later';
  await withModel(input=>input.self.id==='cass'?op(input,{operation:'create',id:'atomic',version:0,text:'只跟整輪一起保存。'}):fail?{type:'invalid'}:{},async(inputs,advance)=>{
   if(fault==='before')store.throwBeforeNextSave();if(fault==='after')store.throwAfterNextSave();if(fault==='conflict')store.conflictOnNextSave();
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId}),result=await response.json(),saved=await read(),count=inputs.length;
   if(fault==='after')assert.equal(saved.phones.devices.find(d=>saved.objects.find(o=>o.id===d.objectId).owner==='cass').memos[0].text,'只跟整輪一起保存。');
   else {assert.equal(saved.phones,undefined);assert.equal(saved.objects?.some(o=>o.kind==='phone')||false,false);}
   fail=false;await advance({operationId});assert.equal(inputs.length,count);if(fault==='after')assert.deepEqual(await(await advance({operationId})).json(),result);
  });
 }
});
test('unshown, stale, foreign, remote and overcapacity memo operations preserve all existing data',async()=>{
 for(const invalid of ['unshown','stale','foreign','remote','capacity']){
  const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0;
  await withModel(input=>input.self.id!=='cass'?{}:op(input,stage===0?{operation:'create',id:'saved',version:0,text:'原文不會靜默遺失。'}:{operation:invalid==='capacity'?'create':'update',id:invalid==='foreign'?'not-listed':invalid==='capacity'?'new':'saved',version:invalid==='capacity'?0:invalid==='stale'?999:1,text:'不該寫入。'}),async(inputs,advance)=>{
   assert.equal((await advance()).status,200);const original=await read(),d=original.phones.devices.find(d=>original.objects.find(o=>o.id===d.objectId).owner==='cass');
   if(invalid==='unshown')original.characters.find(c=>c.id==='cass').shortTerm=[];
   if(invalid==='remote'){const o=original.objects.find(o=>o.id===d.objectId);o.holder=null;o.region='vera-room';}
   if(invalid==='capacity'){d.memos=Array.from({length:32},(_,i)=>({...d.memos[0],id:`saved-${i}`}));}
   store.replaceCommittedWorld(original);stage=1;const before=await read();assert.equal((await advance()).status,502,invalid);assert.deepEqual((await read()).phones,before.phones);
  });
 }
});
