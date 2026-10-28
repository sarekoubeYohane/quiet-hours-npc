/* eslint-disable @typescript-eslint/no-require-imports -- API/SQLite with explicit external transport fixture. */
const test=require('node:test'),assert=require('node:assert/strict');
const {scenario,initialWorld,load,rest,discover,accepted}=require('./discovery-fixture.cjs');
test('a natural known-place search obtains related unknown authority facts, commits perception and survives SQLite into the next actual messages',async()=>{
 const s=await scenario();try{
  s.reply(input=>{assert.ok(input.objects.some(o=>o.id==='unknown-object'));assert.ok(input.supplies.some(o=>o.id==='unknown-supply'));assert.equal(input.actor.memories,undefined);assert.equal(input.phones,undefined);return accepted([discover(['unknown-object'])]);});
  const w=await s.advance();assert.deepEqual(w.objects[0].knownTo,['owner']);assert.equal(w.objects[0].holder,null);assert.equal(w.objects[0].revision,1);assert.deepEqual(w.supplies[0].knownTo,[]);
  assert.ok(w.characters[0].shortTerm.some(m=>m.observation?.objectId==='unknown-object'));assert.equal(s.judgments().length,1);assert.equal(JSON.stringify(s.npc()[0].input).includes('unknown-object'),false);
  s.choose(rest);await s.advance();const next=s.npc().at(-1);assert.ok(next.input.objects.some(o=>o.id==='unknown-object'));assert.equal(JSON.stringify(next.request.messages).includes('SECRET_OBJECT'),false);assert.equal(s.judgments().length,1);
 }finally{s.restore();}
});

test('finding an existing supply records its source, not stock amount or permission, and a later legal activity can materialize it',async()=>{
 const s=await scenario();try{
  s.reply(accepted([discover([],['unknown-supply'])]));let w=await s.advance();assert.deepEqual(w.supplies[0].knownTo,['owner']);assert.equal(w.supplies[0].remaining,2);assert.deepEqual(w.supplies[0].allowedTo,['owner']);assert.equal(w.objects.some(o=>o.source==='unknown-supply'),false);assert.ok(w.characters[0].shortTerm.some(m=>m.observation?.supplyId==='unknown-supply'&&m.source.supply==='unknown-supply'));
  s.choose({...rest,type:'propose',target:'unknown-supply',content:'取一份布料',purpose:'使用已找到的材料'});s.reply(accepted([{kind:'materialize',supplyId:'unknown-supply',expectedRemaining:2}]));w=await s.advance();assert.equal(w.supplies[0].remaining,1);assert.equal(w.objects.find(o=>o.source==='unknown-supply').holder,'owner');const input=s.npc().at(-1).input;assert.equal(input.supplies[0].availability,'unknown');assert.equal(input.supplies[0].remaining,undefined);assert.ok(input.self.shortTerm.some(m=>m.source.supply==='unknown-supply'));assert.equal(s.judgments().length,2);
 }finally{s.restore();}
});

test('world authority is local and bounded with explicit omissions; hidden nearby changes and unverified explanations never enter NPC input',async()=>{
 const observed=[],base=initialWorld();load('phones').activatePhones(base);
 for(const marker of ['SECRET_VARIANT_A','SECRET_VARIANT_B']){
  const s=await scenario({world:structuredClone(base),prepare:w=>{w.scene.doors['cafe-door']='closed';w.objects.push({...w.objects[0],id:'remote-hidden',region:'cafe-storeroom',state:{private:marker}});for(let i=0;i<40;i++)w.objects.push({...w.objects[0],id:'local-'+i,state:{...Object.fromEntries(Array.from({length:15},(_,n)=>['surface'+n,'布'.repeat(70)])),private:marker}});}});try{
   s.reply(input=>{assert.equal(input.objects.some(o=>o.id==='remote-hidden'),false);assert.ok(input.explorationScope.objectsOmitted>0);assert.equal(input.explorationScope.complete,false);assert.ok(Buffer.byteLength(JSON.stringify({objects:input.objects,supplies:input.supplies}))<=65536);return {...accepted([discover()]),explanation:{summary:marker,facts:[]}};});
   await s.advance();s.choose(rest);await s.advance();const input=s.npc().at(-1).input;assert.equal(JSON.stringify(input).includes(marker),false);observed.push({objects:input.objects,supplies:input.supplies,text:input.self.shortTerm.map(m=>m.text)});
  }finally{s.restore();}
 }
 assert.deepEqual(observed[0],observed[1]);
});

test('search outcomes distinguish no new clue, denial, unsupported execution and invalid explanation-only success',async()=>{
 for(const result of ['none','denied','unsupported','explanation-only']){
  const s=await scenario();try{
   const candidate=result==='none'?accepted([discover()]):result==='explanation-only'?{...accepted([]),explanation:{summary:'SECRET_UNVERIFIED_PROMISE',facts:[]}}:{status:result,effects:[],check:null};s.reply(candidate);
   const r=await s.post(s.body());assert.equal(r.status,result==='explanation-only'?502:200);let w=await s.read();assert.deepEqual(w.objects[0].knownTo,[]);assert.deepEqual(w.supplies[0].knownTo,[]);assert.equal(w.supplies[0].remaining,2);
   if(result==='none')assert.ok(w.characters[0].shortTerm.some(m=>m.text==='仔細查看後，沒有發現新的線索。'));
   s.choose(rest);await s.advance();const input=s.npc().at(-1).input;assert.equal(JSON.stringify(input).includes('SECRET_UNVERIFIED_PROMISE'),false);assert.equal(JSON.stringify(input).includes('unknown-object'),false);assert.equal(JSON.stringify(input).includes('缺貨'),false);
  }finally{s.restore();}
 }
});

test('invalid, remote, pending, fabricated and mental-patch discovery candidates leave no knowledge or world changes',async()=>{
 for(const kind of ['duplicate','missing','remote','pending','mental']){
  const s=await scenario({prepare:w=>{if(kind==='remote')w.objects[0].region='cafe-storeroom';if(kind==='pending')w.supplies[0].pending=true;}});try{
   const effect=kind==='duplicate'?discover(['unknown-object','unknown-object']):kind==='missing'?discover(['invented-id']):kind==='pending'?discover([],['unknown-supply']):kind==='mental'?{...discover(['unknown-object']),memory:'一定要供餐'}:discover(['unknown-object']);s.reply(accepted([effect]));
   const before=await s.read(),body=s.body();body.operationId=Date.now()+':'+crypto.randomUUID();assert.equal((await s.post(body)).status,502);let w=await s.read();assert.deepEqual(w.objects,before.objects);assert.deepEqual(w.supplies,before.supplies);assert.deepEqual(w.characters,before.characters);assert.deepEqual(w.probeResults,before.probeResults);const calls=w.aiUsage.totalCalls;await s.post(body);assert.equal((await s.read()).aiUsage.totalCalls,calls);
  }finally{s.restore();}
 }
});

test('stored long search has no premature perception or clone roll; completion alone records knowable clues',async()=>{
 const s=await scenario();try{
  let rolls=0;Math.random=()=>{rolls++;return .675;};s.reply({...accepted([discover(['unknown-object'])]),completionMinutes:30});let w=await s.advance();assert.deepEqual(w.objects[0].knownTo,[]);assert.equal(rolls,0);assert.equal(w.events.some(e=>e.kind==='observe'),false);assert.ok(w.characters[0].plan);
  w=await s.advance();assert.deepEqual(w.objects[0].knownTo,['owner']);assert.equal(rolls,1);assert.equal(s.judgments().length,1);const found=w.events.findLast(e=>e.kind==='observe');assert.equal(found.time,1290);s.choose(rest);await s.advance();assert.ok(s.npc().at(-1).input.objects.some(o=>o.id==='unknown-object'));assert.equal(rolls,1);
 }finally{s.restore();}
});

test('same search, synonym wording, reload and original operation replay do not reroll or duplicate discoveries',async()=>{
 const s=await scenario();try{
  let rolls=0;Math.random=()=>{rolls++;return .675;};const body={...s.body(),operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(body)).status,200);let w=await s.read();assert.equal(rolls,1);const calls=w.aiUsage.totalCalls,memories=w.characters[0].shortTerm.filter(m=>m.observation?.objectId==='unknown-object').length;
  assert.equal((await s.post(body)).status,200);assert.equal((await s.read()).aiUsage.totalCalls,calls);assert.equal(rolls,1);
  s.choose({...rest,type:'propose',target:'cafe-front',content:'再看一下周圍能用的東西',purpose:'確認物資'});w=await s.advance();assert.equal(rolls,1);assert.equal(w.characters[0].shortTerm.filter(m=>m.observation?.objectId==='unknown-object').length,memories);assert.equal(s.judgments().length,2,'each distinct free proposal still uses only its existing adjudication call');
 }finally{s.restore();}
});

test('branch validation, proposal cap and interrupted long activity never expose a not-yet-executed finding',async()=>{
 for(const kind of ['branches','cap','interrupt']){
  const s=await scenario();try{
   let rolls=0;Math.random=()=>{rolls++;return .675;};
   if(kind==='branches')s.reply({status:'accepted',completionMinutes:15,effects:[],stages:[],check:null,branches:[{outcomes:['critical-success','success','mixed','failure','critical-failure'],effects:[discover(['unknown-object'])],stages:[]}]});
   else{s.reply({...accepted([discover(['unknown-object'])]),completionMinutes:30});if(kind==='cap')s.choose({...rest,type:'propose',target:'cafe-front',content:'查看附近物資',purpose:'確認來源',timeIntent:{kind:'completion',maxMinutes:15}});}
   let w=await s.advance();if(kind==='branches'){assert.equal(rolls,1);assert.deepEqual(w.objects[0].knownTo,['owner']);}
   else{assert.equal(rolls,0);assert.deepEqual(w.objects[0].knownTo,[]);if(kind==='cap')assert.equal(w.characters[0].plan,undefined);else{await s.post({operation:'direct',action:{type:'rest'}});w=await s.advance();assert.equal(w.characters[0].plan.action.type,'rest');assert.equal(w.characters[0].plan.phases,undefined);assert.deepEqual(w.objects[0].knownTo,[]);assert.equal(rolls,0);}}
  }finally{s.restore();}
 }
});

test('invalid later NPC, provider failure and final-save conflict atomically roll back discovery while preserving dispatched usage',async()=>{
 for(const kind of ['later','provider','conflict']){
  const s=await scenario({prepare:w=>{if(kind==='later'){const cass=load('world').seedWorld().characters.find(c=>c.id==='cass');cass.location='cafe';cass.region='cafe-front';w.characters.push(cass);}}});try{
   if(kind==='later')s.choose(input=>input.self.id==='owner'?{...rest,type:'propose',target:'cafe-front',content:'查看身邊物品',purpose:'取得線索'}:{invalid:'later actor fixture'});
   if(kind==='provider')s.reply(()=>{throw Error('fixture transport failure');});if(kind==='conflict')load('store').conflictOnNextSave();
   const before=await s.read(),body={...s.body(),operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(body)).status,502);const w=await s.read();assert.deepEqual(w.objects,before.objects);assert.deepEqual(w.supplies,before.supplies);assert.deepEqual(w.characters,before.characters);assert.deepEqual(w.probeResults,before.probeResults);assert.ok(w.aiUsage.totalCalls>=2);await s.post(body);assert.equal((await s.read()).aiUsage.totalCalls,w.aiUsage.totalCalls);
  }finally{s.restore();}
 }
});

test('discovery receipts are world-owner isolated and read-only old worlds do not fabricate source knowledge',async()=>{
 const s=await scenario();try{
  s.reply(accepted([discover(['unknown-object'],['unknown-supply'])]));await s.advance();const other=initialWorld();delete other.probeResults;delete other.perceptionTrials;load('store').installForOwner('another-owner',other);load('auth').setUserId('another-owner');const saved=await s.read();assert.deepEqual(saved.objects[0].knownTo,[]);assert.deepEqual(saved.supplies[0].knownTo,[]);assert.equal(saved.characters[0].shortTerm.some(m=>m.observation?.objectId||m.observation?.supplyId),false);
 }finally{load('auth').setUserId('test-owner');s.restore();}
});

test('private trace separates actual authority request, candidate, submitted knowledge and next normal request',async()=>{
 const s=await scenario();try{
  const body={...s.body(),operationId:Date.now()+':'+crypto.randomUUID()},response=await s.post(body);assert.equal(response.status,200);const receipt=await response.json(),candidate=receipt.operationEvidence.dispatches.find(d=>d.task==='adjudication').candidate.value.effects[0];assert.equal(candidate.kind,'discover');assert.deepEqual(candidate.objectIds,['unknown-object']);
  const detail=await(await load('route').GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(body.operationId)))).json(),trace=detail.decisionTrace;assert.equal(trace.outcome,'committed');const dispatch=trace.dispatches.find(d=>d.task==='adjudication');assert.ok(JSON.parse(JSON.parse(dispatch.requestBody).messages[1].content).objects.some(o=>o.id==='unknown-object'));assert.equal(JSON.parse(dispatch.rawCandidate).effects[0].kind,'discover');assert.ok(trace.steps.some(step=>step.kind.includes('candidate')||step.kind.includes('effects')||step.kind.includes('validated')));assert.deepEqual(detail.world.objects[0].knownTo,['owner']);
  s.choose(rest);await s.advance();assert.ok(s.npc().at(-1).input.objects.some(o=>o.id==='unknown-object'));
 }finally{s.restore();}
});
