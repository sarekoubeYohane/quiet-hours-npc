/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {scenario,proposal,advance,vessel}=require('./routine-program-fixture.cjs');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const denied={status:'denied',completionMinutes:null,effects:[],stages:[],check:null,routine:null};
const rest={type:'rest',target:'',content:'自行決定先休息',purpose:'',mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[]};
function account(id,text,kind='experience'){return {id,characterId:'owner',version:1,time:1200,text,source:{kind,...(kind==='observation'?{person:'cass',sense:'sight',clarity:'clear'}:{})}};}

test('last known accounts preserve consumed meal identity and subjective sources through SQLite and actual next messages',async()=>{
 for(const knowledge of ['own','witness','unknown']){
  const s=await scenario({decision:{...proposal,target:'meal',content:'取用指定餐點'},reply:denied,modify:w=>{
   w.characters[0].memories=[];w.characters[0].shortTerm=[...(knowledge==='unknown'?[]:[account('known-meal',knowledge==='own'?'我吃完了指定餐點 [meal]。':'我看見 Cass 吃完指定餐點 [meal]。',knowledge==='own'?'experience':'observation')]),...Array.from({length:12},(_,i)=>({...account('unrelated-'+i,'窗外無關的聲音 '+i),time:1201+i}))];
   w.objects.push({...vessel('meal'),kind:'food',label:'指定餐點',lifecycle:'consumed',state:{}});
   w.supplies=[{id:'meal-source',label:'指定餐點',region:'cafe-front',kind:'food',remaining:0,owner:'owner',knownTo:['owner'],allowedTo:['owner'],initialState:{}}];
  }});
  try{
   await advance(s);s.choose(rest);await advance(s);
   const actual=s.inputs.filter(x=>x.input.self).at(-1),input=JSON.parse(actual.request.messages[1].content),known=input.self.lastKnownState;
   assert.ok(known,'last-known projection must reach real request/messages');
   const meal=known.entries.find(x=>x.reference.id==='known-meal');assert.equal(!!meal,knowledge!=='unknown');
   if(meal){assert.equal(meal.time,1200);assert.equal(meal.reference.version,1);assert.equal(meal.reference.kind,'short');assert.equal(meal.source.kind,knowledge==='own'?'experience':'observation');assert.match(meal.text,/\[meal\]/);}
   assert.ok(!input.objects.some(x=>x.id==='meal'));
   assert.equal(input.supplies[0].availability,'unknown');assert.match(known.gap,/未知/);
   const result=known.entries.find(x=>/行動回饋/.test(x.text));assert.ok(result);assert.match(result.text,/尚未執行/);assert.doesNotMatch(result.text,/須由有權角色自行同意授權/);
   assert.equal((await s.read()).objects.find(x=>x.id==='meal').lifecycle,'consumed');
  }finally{s.restore();}
 }
});

test('last-known state is identical for hidden changes, preserves mistaken accounts, and disappears with forgotten source',async()=>{
 const outputs=[];
 for(const hidden of [0,1]){
  const s=await scenario({reply:denied,modify:w=>{
   w.phones={schemaVersion:1,activatedAt:w.minute,devices:[]};
   w.characters[0].memories=[];w.characters[0].shortTerm=[account('mistake','我猜想杯子裡還有茶，也許是 Cass 留下的。','observation')];
   w.supplies=[{id:'private-stock',label:'背景材料',region:'cafe-front',kind:'food',remaining:hidden,owner:'owner',knownTo:['owner'],allowedTo:hidden?['owner']:[],initialState:{}}];
  }});
  try{
   await advance(s);s.choose(rest);await advance(s);const input=s.inputs.filter(x=>x.input.self).at(-1).input;
   const state=input.self.lastKnownState;assert.ok(state.entries.some(x=>x.reference.id==='mistake'&&x.text.includes('我猜想')));assert.doesNotMatch(JSON.stringify(state),/remaining|allowedTo|PRIVATE/);
   outputs.push(state.entries.map(x=>({time:x.time,source:x.source,text:x.text})));
   const w=await s.read();w.characters[0].shortTerm=[];w.characters[0].memories=[];w.characters[0].longTerm=[];load('store').replaceCommittedWorld(w);await advance(s);
   const next=s.inputs.filter(x=>x.input.self).at(-1).input.self.lastKnownState;
   assert.equal(next.entries.length,0);assert.match(next.gap,/未知/);
  }finally{s.restore();}
 }
 assert.deepEqual(outputs[0],outputs[1]);
});

test('bounded state uses only this requests shown source versions and measures its byte cost without extra calls',async()=>{
 const s=await scenario({decision:rest,modify:w=>{
  w.characters[0].memories=[];
  w.characters[0].shortTerm=Array.from({length:20},(_,i)=>({...account('account-'+i,'我記得 [meal] 當時的感受。'+('主觀'.repeat(200))),time:1200+i}));
  w.characters[0].longTerm=[{...account('long-meal','聽 Cass 說，餐點可能已用完。','observation'),origin:{id:'forgotten-origin',version:1},reason:'留下印象'}];
 }});
 try{
  await advance(s);const input=s.inputs.find(x=>x.input.self).input,state=input.self.lastKnownState;
  assert.ok(state.entries.length<=8);assert.ok(Buffer.byteLength(JSON.stringify(state))<=8192);assert.ok(state.omitted>0);
  for(const entry of state.entries){const shown=entry.reference.kind==='short'?input.self.shortTerm:input.self.longTerm;assert.ok(shown.some(x=>x.id===entry.reference.id&&x.version===entry.reference.version&&x.text===entry.text));}
  assert.equal(s.counts().npc,1);assert.equal(s.counts().judgments,0);
  // Measure representative generated input, including all duplicate views.
  assert.ok(Buffer.byteLength(JSON.stringify(input))<88*1024);
 }finally{s.restore();}
});

test('failed save and same operation replay cannot create last-known experience or dispatch twice',async()=>{
 for(const fault of [null,'throwBeforeNextSave','conflictOnNextSave']){
  const s=await scenario({reply:denied});
  try{
   const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};if(fault)load('store')[fault]();
   const first=await s.post(op);assert.equal(first.status,fault?502:200);const saved=await s.read(),counts=s.counts();await s.post(op);assert.deepEqual(s.counts(),counts);assert.deepEqual((await s.read()).characters[0].shortTerm,saved.characters[0].shortTerm);
   s.choose(rest);await advance(s);const next=s.inputs.filter(x=>x.input.self).at(-1).input.self.lastKnownState;
   assert.equal(next.entries.some(x=>/行動回饋/.test(x.text)),!fault);
  }finally{s.restore();}
 }
});

test('real meal ingestion commits its known result into next messages and later actor failure rolls it all back',async()=>{
 for(const fail of [false,true]){
  const s=await scenario({decision:{...proposal,target:'meal',content:'吃這份餐點',purpose:'進食'},objects:[{...vessel('meal'),kind:'food',holder:'owner',state:{},quantity:{amount:1,unit:'serving'},consumable:true}],reply:{status:'accepted',completionMinutes:15,effects:[{kind:'ingest',version:1,objectId:'meal',expectedRevision:1,hungerRelief:15,thirstRelief:0}],stages:[],check:null,routine:null},modify:w=>{
   w.characters[0].shortTerm=[];w.characters[0].memories=[];
   if(fail){const peer=structuredClone(w.characters[0]);peer.id='peer';peer.name='另一人';delete peer.control;w.characters.push(peer);}
  }}),transport=global.fetch;
  global.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.self?.id==='peer')return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify({invalid:'later actor'})}}]});return transport(url,init);};
  try{
   const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};const response=await s.post(op);assert.equal(response.status,fail?502:200);
   const saved=await s.read(),meal=saved.objects.find(x=>x.id==='meal');assert.equal(meal.lifecycle,fail?'active':'consumed');
   if(fail){assert.equal(saved.characters[0].shortTerm.length,0);const counts=s.counts();await s.post(op);assert.deepEqual(s.counts(),counts);saved.characters=saved.characters.filter(x=>x.id==='owner');load('store').replaceCommittedWorld(saved);}
   else assert.equal(saved.characters[0].needs.values.hunger,5.75);
   s.choose(rest);await advance(s);const input=s.inputs.filter(x=>x.input.self).at(-1).input,entries=input.self.lastKnownState.entries;
   assert.equal(entries.some(x=>/行動回饋/.test(x.text)&&/meal/.test(x.text)),!fail);
   if(!fail){assert.ok(!input.objects.some(x=>x.id==='meal'));assert.ok(entries.some(x=>x.source.kind==='experience'&&/攝取|食用/.test(x.text)));}
  }finally{s.restore();}
 }
});
