/* eslint-disable @typescript-eslint/no-require-imports -- Public API transport fixture. */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${n}.cjs`));
const {seedWorld}=build('world'),{GET,POST}=build('route'),store=build('store');
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
const read=async()=>(await(await GET()).json()).world;
async function withModel(choose,run){const old=global.fetch,inputs=[];global.fetch=async(_u,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);inputs.push(input);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),input.contractVersion==='world-adjudication.v1'?choose(input):{type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[],cognitiveUpdates:[],interpretation:'',...choose(input)}))}}]});};try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:100,tokens:1000000}}));await run(inputs,b=>POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,...b})));}finally{global.fetch=old;}}
const op=(input,p)=>({type:'phone',target:input.phones.find(d=>d.owner===input.self.id)?.objectId,content:JSON.stringify(fixtureDecision(input,{collection:'inbox',...p}))});
test('message delivers unread to a real device without revealing body or forcing an extra recipient decision',async()=>{
 const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);
 await withModel(input=>input.self.id==='cass'?{type:'message',target:'vera',content:'PRIVATE_BODY_ONLY_AFTER_READ'}:{},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const saved=await read(),device=saved.phones.devices.find(d=>saved.objects.find(o=>o.id===d.objectId).owner==='vera');
  assert.equal(device.inbox.length,1);assert.equal(device.inbox[0].text,'PRIVATE_BODY_ONLY_AFTER_READ');assert.deepEqual(device.inbox[0].readers,[]);
  assert.equal(JSON.stringify(inputs.find(i=>i.self.id==='vera')).includes('PRIVATE_BODY_ONLY_AFTER_READ'),false);assert.equal(JSON.stringify(saved.characters.find(c=>c.id==='vera')).includes('PRIVATE_BODY_ONLY_AFTER_READ'),false);assert.equal(saved.events.some(e=>JSON.stringify(e).includes('PRIVATE_BODY_ONLY_AFTER_READ')),false);assert.equal(inputs.length,4);
 });
});
test('active inbox list preserves unread and specified reading creates only actual reader knowledge on the next normal slot',async()=>{
 const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0,id;
 await withModel(input=>{
  if(input.self.id==='cass'&&stage===0)return {type:'message',target:'vera',content:'INBOX_BODY_KEEP_EXACT 不用現在回覆。'};
  if(input.self.id==='vera'&&stage===1)return op(input,{operation:'list'});
  if(input.self.id==='vera'&&(stage===2||stage===3))return op(input,{operation:'read',id,version:1});
  return {};
 },async(inputs,advance)=>{
  for(stage=0;stage<5;stage++){
   assert.equal((await advance()).status,200);const saved=await read(),device=saved.phones.devices.find(d=>saved.objects.find(o=>o.id===d.objectId).owner==='vera');id=device.inbox[0].id;
   assert.equal(device.inbox.length,1);assert.equal(device.inbox[0].readers.length,stage<2?0:1);
   if(stage<3)assert.equal(JSON.stringify(inputs.findLast(i=>i.self.id==='vera')).includes('INBOX_BODY_KEEP_EXACT'),false);
   else assert.equal(JSON.stringify(inputs.findLast(i=>i.self.id==='vera')).includes('INBOX_BODY_KEEP_EXACT'),true);
   assert.equal(saved.characters.find(c=>c.id==='vera').cognition?.beliefs?.length||0,0);assert.deepEqual(saved.characters.find(c=>c.id==='vera').intents.filter(node=>node.kind!=='direction'),[]);
  }
  assert.equal(inputs.length,20);assert.equal(inputs.filter(i=>i.self.id==='kris').some(i=>JSON.stringify(i).includes('INBOX_BODY_KEEP_EXACT')),false);
  const saved=await read();assert.equal(saved.events.filter(e=>e.kind==='message').length,1);assert.equal(saved.characters.find(c=>c.id==='cass').shortTerm.some(m=>m.text.includes('INBOX_BODY_KEEP_EXACT')),true);
  assert.equal(inputs.filter(i=>i.self.id==='cass').some(i=>JSON.stringify(i).includes('readers')),false);
 });
});
test('same-device unread delivery is saved while the recipient is asleep or away and legacy history is never converted into fabricated reads',async()=>{
 const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};
 const vera=w.characters.find(c=>c.id==='vera');vera.plan={action:{type:'rest'},bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-12,sleepPerHour:-8},sleep:{elapsedMinutes:0},startedAt:w.minute,until:w.minute+1440,attention:'',modelKey:'openai:gpt-6-luna'};
 w.events.push({id:'old-message',actor:'cass',time:100,kind:'message',text:'HISTORICAL_ONLY_NOT_TO_REVIVE',audience:['cass','vera']});vera.shortTerm.push({id:'legacy-known',characterId:'vera',version:1,time:90,text:'ALREADY_KNOWN_LEGACY_BODY',source:{kind:'legacy-unclassified'}});vera.needs={version:1,activatedAt:w.minute,updatedAt:w.minute,values:{hunger:20,thirst:20,fatigue:70,sleep:80},assessed:{hunger:0,thirst:0,fatigue:2,sleep:2},history:[],dropped:0};store.install(w);
 await withModel(input=>input.self.id==='cass'?{type:'message',target:'vera',content:'SLEEPING_UNREAD_NEW_BODY'}:{},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const saved=await read(),device=saved.phones.devices.find(d=>saved.objects.find(o=>o.id===d.objectId).owner==='vera'),v=saved.characters.find(c=>c.id==='vera');
  assert.equal(device.inbox.length,1);assert.equal(device.inbox[0].text,'SLEEPING_UNREAD_NEW_BODY');assert.deepEqual(device.inbox[0].readers,[]);assert.equal(v.shortTerm.some(m=>m.text.includes('SLEEPING_UNREAD_NEW_BODY')),false);assert.equal(v.shortTerm.some(m=>m.text.includes('HISTORICAL_ONLY_NOT_TO_REVIVE')),false);assert.equal(v.shortTerm.some(m=>m.text.includes('ALREADY_KNOWN_LEGACY_BODY')),true);assert.ok(v.plan.sleep);assert.equal(inputs.some(i=>i.self.id==='vera'),false);assert.equal(device.inboxActivatedAt,w.minute);
 });
});
test('physical phone movement retains inbox identity; holding, ownership and private reading stay separate',async()=>{
 const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};w.characters.forEach(c=>{c.location='kris-home';c.region='kris-home-main';});w.objects=[{id:'shared-vera-phone',source:'existing-fixture',label:'Vera 的手機',kind:'phone',owner:'vera',holder:'vera',region:'kris-home-main',lifecycle:'active',revision:1,state:{condition:'sound'},knownTo:['cass','vera','kris','owner'],allowedTo:['vera']}];store.install(w);let stage=0,phoneId='shared-vera-phone',messageId;
 await withModel(input=>{
  if(input.contractVersion==='world-adjudication.v1')return {status:'accepted',completionMinutes:15,check:null,effects:[{kind:'physical',version:1,operation:stage===1?'place':'take',objectId:phoneId,expectedRevision:stage===1?1:2,reason:'移動手機，不移轉所有權或私人資料權限。'}],stages:[],branches:null,routine:null};
  if(input.self.id==='cass'&&stage===0)return {type:'message',target:'vera',content:'MOVE_WITH_DEVICE_BODY'};
  if(input.self.id==='vera'&&stage===1)return {type:'propose',target:phoneId,content:'把自己的手機放在桌上',purpose:'暫時放下手機'};
  if(input.self.id==='cass'&&stage===2)return {type:'propose',target:phoneId,content:'拿起桌上的手機',purpose:'拿起附近手機'};
  if(input.self.id==='cass'&&stage===3)return {type:'phone',target:phoneId,content:JSON.stringify(fixtureDecision(input,{collection:'inbox',operation:'list'}))};
  return {};
 },async(inputs,advance)=>{
  for(stage=0;stage<4;stage++){
   assert.equal((await advance()).status,200);const saved=await read(),d=saved.phones.devices.find(d=>saved.objects.find(o=>o.id===d.objectId).owner==='vera');phoneId=d.objectId;messageId??=d.inbox[0].id;assert.equal(d.inbox[0].id,messageId);assert.deepEqual(d.inbox[0].readers,[]);
  }
  const saved=await read(),o=saved.objects.find(o=>o.id===phoneId);assert.equal(o.holder,'cass');assert.equal(o.owner,'vera');assert.equal(saved.characters.find(c=>c.id==='cass').shortTerm.at(-2)?.text.includes('MOVE_WITH_DEVICE_BODY')||false,false);
 });
});
test('an owner whose phone is held by somebody else cannot list its hidden inbox or memo records',async()=>{
 const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0,phoneId;
 await withModel(input=>input.self.id==='cass'&&stage===0?{type:'message',target:'vera',content:'HIDDEN_HELD_PHONE_BODY'}:input.self.id==='vera'&&stage===1?{type:'phone',target:phoneId,content:JSON.stringify(fixtureDecision(input,{collection:'inbox',operation:'list'}))}:{},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const setup=await read(),d=setup.phones.devices.find(d=>setup.objects.find(o=>o.id===d.objectId).owner==='vera');phoneId=d.objectId;const o=setup.objects.find(o=>o.id===phoneId),cass=setup.characters.find(c=>c.id==='cass'),vera=setup.characters.find(c=>c.id==='vera');cass.location=vera.location;cass.region=vera.region;o.holder='cass';store.replaceCommittedWorld(setup);stage=1;
  assert.equal((await advance()).status,200);const saved=await read();assert.equal(saved.characters.find(c=>c.id==='vera').shortTerm.some(m=>m.text.includes(d.inbox[0].id)),false);assert.equal(saved.phones.devices.find(d=>d.objectId===phoneId).inbox[0].readers.length,0);
 });
});
test('missing sender device, destroyed recipient and full inbox cannot claim delivery or leave partial updates',async()=>{
 for(const fault of ['sender','recipient','capacity']){
  const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let sending=false;
  await withModel(input=>sending&&input.self.id==='cass'?{type:'message',target:'vera',content:'MUST_NOT_DELIVER'}:{},async(inputs,advance)=>{
   assert.equal((await advance()).status,200);const initial=await read(),sender=initial.phones.devices.find(d=>initial.objects.find(o=>o.id===d.objectId).owner==='cass'),recipient=initial.phones.devices.find(d=>initial.objects.find(o=>o.id===d.objectId).owner==='vera');
   if(fault==='sender')initial.objects=initial.objects.filter(o=>o.id!==sender.objectId);
   if(fault==='recipient')initial.objects.find(o=>o.id===recipient.objectId).lifecycle='destroyed';
   if(fault==='capacity')recipient.inbox=Array.from({length:64},(_,i)=>({id:`existing-${i}`,version:1,text:'保存中未讀原文',from:'kris',to:'vera',createdAt:initial.minute,updatedAt:initial.minute,deliveredAt:initial.minute,sharedWith:[],readers:[]}));
   store.replaceCommittedWorld(initial);sending=true;const before=await read(),operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId});assert.equal(response.status,502,fault);assert.match((await response.json()).error,/手機|裝置|收件匣/);const after=await read();assert.deepEqual(after.phones,before.phones);assert.deepEqual(after.characters,before.characters);const count=inputs.length;await advance({operationId});assert.equal(inputs.length,count);
  });
 }
});
test('delivery and reading roll back with later slots and CAS faults, while committed original operation replays exactly',async()=>{
 for(const fault of ['later','before','after','conflict','lease']){
  const w=seedWorld();w.characters.sort((a,b)=>['vera','owner','cass','kris'].indexOf(a.id)-['vera','owner','cass','kris'].indexOf(b.id));w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);let stage=0,id;
  await withModel(input=>input.self.id==='cass'&&stage===0?{type:'message',target:'vera',content:'ATOMIC_UNREAD_CONTENT'}:input.self.id==='vera'&&stage===1?op(input,{operation:'list'}):input.self.id==='vera'&&stage===2?op(input,{operation:'read',id,version:1}):input.self.id==='owner'&&stage===2&&fault==='later'?{type:'invalid'}:{},async(inputs,advance)=>{
   for(stage=0;stage<2;stage++)assert.equal((await advance()).status,200);const before=await read(),device=before.phones.devices.find(d=>before.objects.find(o=>o.id===d.objectId).owner==='vera');id=device.inbox[0].id;
   if(fault==='before')store.throwBeforeNextSave();if(fault==='after')store.throwAfterNextSave();if(fault==='conflict')store.conflictOnNextSave();if(fault==='lease')store.conflictOnNextSave(before,{lockedUntil:Date.now()+60000});
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId}),result=await response.json(),after=await read();assert.equal(response.status,fault==='after'?200:502,fault);
   if(fault==='after')assert.equal(after.phones.devices.find(d=>d.objectId===device.objectId).inbox[0].readers[0].actorId,'vera');else{assert.deepEqual(after.phones,before.phones);assert.deepEqual(after.characters,before.characters);}
   const count=inputs.length;const replay=await advance({operationId});assert.equal(inputs.length,count);if(fault==='after')assert.deepEqual(await replay.json(),result);
  });
 }
});
test('a third person can actually read one displayed message without marking the recipient read or gaining the whole inbox',async()=>{
 const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};w.characters.forEach(c=>{c.location='kris-home';c.region='kris-home-main';});store.install(w);let stage=0,phoneId,id;
 await withModel(input=>{
  if(input.self.id==='cass'&&stage===0)return {type:'message',target:'vera',content:'FINITE_SCREEN_MESSAGE_BODY'};
  if(input.self.id==='vera'&&stage===1)return op(input,{operation:'list'});
  if(input.self.id==='vera'&&stage===2)return op(input,{operation:'display',id,version:1});
  if(input.self.id==='kris'&&(stage===3||stage===4))return {type:'phone',target:phoneId,content:JSON.stringify(fixtureDecision(input,{collection:'inbox',operation:stage===3?'list':'read',...(stage===4?{id,version:1}:{})}))};
  return {};
 },async(inputs,advance)=>{
  for(stage=0;stage<5;stage++){assert.equal((await advance()).status,200);const saved=await read(),d=saved.phones.devices.find(d=>saved.objects.find(o=>o.id===d.objectId).owner==='vera');phoneId=d.objectId;id=d.inbox[0].id;assert.equal(d.inbox[0].readers.some(r=>r.actorId==='vera'),false);}
  const saved=await read(),d=saved.phones.devices.find(d=>d.objectId===phoneId);assert.deepEqual(d.inbox[0].readers.map(r=>r.actorId),['kris']);assert.equal(saved.characters.find(c=>c.id==='kris').shortTerm.some(m=>m.text.includes('FINITE_SCREEN_MESSAGE_BODY')),true);assert.equal(saved.characters.find(c=>c.id==='vera').shortTerm.some(m=>m.text.includes('FINITE_SCREEN_MESSAGE_BODY')),false);assert.equal(inputs.filter(i=>i.self?.id==='owner').some(i=>JSON.stringify(i).includes('FINITE_SCREEN_MESSAGE_BODY')),false);
 });
});
