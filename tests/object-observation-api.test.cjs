/* eslint-disable @typescript-eslint/no-require-imports -- Model transport fixture; real World API, perception and SQLite. */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=build('world'),{GET,POST}=build('route'),store=build('store');
const request=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+":"+crypto.randomUUID(),mode:'demo',...body})});
const post=body=>POST(request(body));
const read=async()=>(await(await GET()).json()).world;
const rest={type:'rest',target:'',content:'',mood:'',durationMinutes:15,intents:[]};
function scene(actorId='owner'){
 const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};
 const actor=w.characters.find(c=>c.id===actorId);actor.location='cafe';actor.region='cafe-front';w.characters=[actor,...(actorId==='owner'?[]:[w.characters.find(c=>c.id==='owner')])];
 w.objects=[{id:'unseen-item',source:'ordinary-existing-source',label:'未見過的布包',region:'cafe-storeroom',holder:null,owner:'owner',revision:1,state:{surface:'乾燥',secret:'PRIVATE_STATE'},stateExposure:{secret:'hidden'},lifecycle:'active',kind:'utensil',knownTo:[],allowedTo:['owner']}];
 return w;
}
async function run(w,fn){
 store.install(w);const inputs=[],messages=[],old=fetch,random=Math.random;let action=rest,judgment;Math.random=()=>0.675;
 global.fetch=async(url,init)=>{assert.match(String(url),/api\.openai\.com/);const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);inputs.push(input);messages.push(body.messages);const value=input.contractVersion==='world-adjudication.v1'?judgment:{...rest,...(input.self.id===w.characters[0].id?action:rest)};assert.ok(value,'unexpected adjudication call');return Response.json({choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),value))}}]});};
 const advance=async(operationId=Date.now()+":"+crypto.randomUUID())=>{const r=await post({operation:'advance',operationId,minutes:15,mode:'openai',model:'gpt-6-luna',limits:{calls:120,tokens:500000}});assert.equal(r.status,200,await r.clone().text());return read();};
 try{await post({operation:'set-model-key',mode:'openai',key:'fixture-key'});await post({operation:'set-budget',limits:{calls:120,tokens:500000}});await fn({inputs,messages,choose:a=>action=a,reply:value=>judgment=value,advance});}finally{global.fetch=old;Math.random=random;}
}
test('autonomous movement then active observation discovers an existing item; SQLite reload and next request retain only knowable facts',async()=>{
 await run(scene(),async s=>{
  s.choose({type:'move',target:'cafe-storeroom'});let w=await s.advance();
  assert.deepEqual(w.objects[0].knownTo,[],'movement alone does not discover objects');
  assert.equal(JSON.stringify(s.inputs[0]).includes('unseen-item'),false);
  s.choose({type:'observe',target:'cafe-storeroom',content:'sight'});w=await s.advance();
  assert.deepEqual(w.objects[0].knownTo,['owner']);assert.equal(w.objects[0].holder,null);assert.equal(w.objects[0].revision,1);assert.deepEqual(w.objects[0].allowedTo,['owner']);
  const event=w.events.findLast(e=>e.kind==='observe'),observation=event.perception[0].observations.find(o=>o.objectId==='unseen-item');assert.ok(observation);assert.equal(observation.clarity,'clear');assert.equal(observation.time,event.time);
  assert.ok(w.characters[0].shortTerm.some(m=>m.observation?.objectId==='unseen-item'&&m.source.object==='unseen-item'));
  s.choose(rest);await s.advance();const input=s.inputs.at(-1);assert.ok(input.objects.some(o=>o.id==='unseen-item'));assert.equal(JSON.stringify(input).includes('PRIVATE_STATE'),false);assert.equal(JSON.stringify(s.messages.at(-1)).includes('allowedTo'),false);
  assert.equal(w.aiUsage.totalCalls,2,'observation adds no adjudication or reflection call');
 });
});

test('another character can discover then legally take an item without learning hidden state or acquiring permission from discovery',async()=>{
 const w=scene('cass');w.objects[0].allowedTo=['owner','cass'];
 await run(w,async s=>{
  s.choose({type:'move',target:'cafe-storeroom'});await s.advance();s.choose({type:'observe',target:'cafe-storeroom',content:'sight'});let saved=await s.advance();
  assert.deepEqual(saved.objects[0].knownTo,['cass']);assert.equal(saved.objects[0].holder,null);assert.equal(saved.objects[0].owner,'owner');assert.deepEqual(saved.objects[0].allowedTo,['owner','cass']);
  s.choose({type:'propose',target:'unseen-item',content:'拿起眼前的布包',purpose:'查看布包'});s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'transfer',objectId:'unseen-item',expectedRevision:1,toHolder:'cass',toRegion:'cafe-storeroom'}],check:null});saved=await s.advance();assert.equal(saved.objects[0].holder,'cass');assert.equal(saved.objects[0].revision,2);assert.equal(saved.objects[0].owner,'owner');
  const input=s.inputs.filter(i=>i.self?.id==='cass').at(-1);assert.ok(input.objects.some(o=>o.id==='unseen-item'));assert.equal(JSON.stringify(input).includes('PRIVATE_STATE'),false);
  assert.equal(s.inputs.filter(i=>i.self?.id==='owner').some(i=>i.objects.some(o=>o.id==='unseen-item')),false);
 });
});

test('occlusion, inaccessible rooms, unsuccessful perception and hearing never expose unknown identities',async()=>{
 for(const condition of ['occluded','closed','missed','mixed','hearing']){
  const w=scene();if(condition==='occluded')w.scene.occluded=['cafe-storeroom'];if(condition==='closed')w.scene.doors['cafe-door']='closed';
  await run(w,async s=>{
   if(condition==='missed')Math.random=()=>0.075;if(condition==='mixed')Math.random=()=>0.375;
   s.choose({type:'observe',target:'cafe-storeroom',content:condition==='hearing'?'hearing':'sight'});let saved=await s.advance();assert.deepEqual(saved.objects[0].knownTo,[]);
   assert.equal(saved.characters[0].observations.some(o=>o.objectId),false);s.choose(rest);await s.advance();assert.equal(JSON.stringify(s.inputs.at(-1)).includes('unseen-item'),false);
   assert.equal(JSON.stringify(s.inputs.at(-1)).includes('未見過的布包'),false);
  });
 }
});

test('same conditions and operation replay preserve one discovery; moving nearer creates a new opportunity',async()=>{
 await run(scene(),async s=>{
  s.choose({type:'observe',target:'cafe-storeroom',content:'sight'});let rolls=0;Math.random=()=>{rolls++;return .675;};
  const op=Date.now()+':'+crypto.randomUUID();let saved=await s.advance(op);const count=()=>saved.characters[0].observations.filter(o=>o.objectId==='unseen-item').length;assert.equal(count(),1);assert.equal(rolls,1);const calls=saved.aiUsage.totalCalls;
  saved=await s.advance(op);assert.equal(saved.aiUsage.totalCalls,calls);assert.equal(count(),1);assert.equal(rolls,1);
  saved=await s.advance();assert.equal(count(),1);assert.equal(rolls,1);
  s.choose({type:'move',target:'cafe-storeroom'});await s.advance();s.choose({type:'observe',target:'cafe-storeroom',content:'再仔細看'});saved=await s.advance();assert.equal(count(),2);assert.equal(rolls,2);
 });
});



test('save conflict and failed commit do not leave discoveries, while a fresh operation can later commit',async()=>{
 for(const fault of ['conflict','failure'])await run(scene(),async s=>{
  s.choose({type:'observe',target:'cafe-storeroom',content:'sight'});
  if(fault==='conflict')store.conflictOnNextSave();else store.throwBeforeNextSave();
  const op=Date.now()+':'+crypto.randomUUID(),body={operation:'advance',operationId:op,minutes:15,mode:'openai',model:'gpt-6-luna'};
  assert.equal((await post(body)).status,502);let saved=await read();assert.deepEqual(saved.objects[0].knownTo,[]);assert.equal(saved.characters[0].observations.length,0);assert.deepEqual(saved.probeResults,{});
  const used=saved.aiUsage.totalCalls;await post(body);assert.equal((await read()).aiUsage.totalCalls,used);saved=await s.advance();assert.deepEqual(saved.objects[0].knownTo,['owner']);assert.equal(saved.characters[0].observations.filter(o=>o.objectId).length,1);
 });
});

test('old-world reads do not invent discovery; receipt capacity fails visibly without reroll or knowledge',async()=>{
 const w=scene();delete w.probeResults;delete w.perceptionTrials;store.install(w);const before=store.snapshot();await read();await read();assert.deepEqual(store.snapshot(),before);
 const full=scene();full.probeResults=Object.fromEntries(Array.from({length:2048},(_,i)=>['prior-'+i,{characterId:'owner',status:'missed',observations:[],reason:'prior receipt'}]));
 await run(full,async s=>{
  s.choose({type:'observe',target:'cafe-storeroom',content:'sight'});let rolls=0;Math.random=()=>{rolls++;return .675;};const r=await post({operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna'});assert.equal(r.status,502);assert.match(await r.clone().text(),/保存容量/);assert.equal(rolls,0);const saved=await read();assert.deepEqual(saved.objects[0].knownTo,[]);assert.equal(Object.keys(saved.probeResults).length,2048);
 });
});

test('original-version person and sound receipt JSON survives SQLite reload without reroll at unchanged conditions',async()=>{
 for(const sense of ['sight','hearing'])for(const receipt of ['probe','trial']){
  const w=scene();w.objects=[];const other=seedWorld().characters.find(c=>c.id==='cass');other.location='cafe';other.region='cafe-storeroom';other.control={mode:'taken-over',active:true};other.plan={action:{type:'work',target:'tidy'},startedAt:w.minute,until:w.minute+120,modelKey:'openai:gpt-6-luna',attention:''};w.characters.push(other);w.characters[0].abilityTags=[];w.scene.occluded=['cafe-storeroom'];w.scene.noise['cafe-front']='quiet';
  w.currentSensory={presence:{owner:{region:'cafe-front',clue:'owner-original'},cass:{region:'cafe-storeroom',clue:'person-original'}},activities:{cass:{region:'cafe-storeroom',clue:'work-original',action:{type:'work',target:'tidy'}}}};
  // Literal v1 persisted tuple shapes from main 9bd0e56; no new object slot.
  const clue=sense==='sight'?'person-original':'work-original',text=sense==='sight'?'遮擋處有人影晃動。':'附近傳來做事的動靜。',kind=sense==='sight'?'person':'sound';
  const opportunity=JSON.stringify([JSON.stringify(['probe',clue]),'owner','cafe-front',[[sense,kind,text,null,null]],'medium',0,2]);
  const result={roll:2,modifier:2,dc:12,total:-8,outcome:'failure'},factors={ability:0,attention:2,interference:'medium'};
  const originalTrial={opportunity,resolution:result,factors,candidates:[]};
  const originalProbeKey=JSON.stringify(['owner','cafe-front',sense,[clue],[[sense,kind,text,null,null,false,'medium']],sense==='hearing'?'quiet':'',[]]);
  if(receipt==='probe')w.probeResults={[originalProbeKey]:{characterId:'owner',status:'missed',observations:[],reason:'主動查探沒有取得新線索',opportunity,resolution:result,factors}};
  w.perceptionTrials={[opportunity]:originalTrial};
  await run(w,async s=>{let rolls=0;Math.random=()=>{rolls++;return .975;};s.choose({type:'observe',target:'cafe-storeroom',content:sense});const saved=await s.advance();assert.equal(rolls,0,sense+' '+receipt+' must reuse original-version result');assert.equal(saved.characters[0].observations.length,0);assert.deepEqual(saved.perceptionTrials[opportunity],originalTrial);const observed=saved.events.findLast(e=>e.kind==='observe').perception[0];assert.equal(observed.resolution.roll,2);assert.equal(observed.status,'missed');});
 }
});

test('a 128-byte object identity commits an observation and appears in the next actual request without oversized memory identity',async()=>{
 const w=scene(),objectId='x'.repeat(128);w.objects[0].id=objectId;assert.equal(Buffer.byteLength(objectId),128);
 await run(w,async s=>{s.choose({type:'observe',target:'cafe-storeroom',content:'sight'});let saved=await s.advance();assert.deepEqual(saved.objects[0].knownTo,['owner']);const observation=saved.characters[0].observations.find(o=>o.objectId===objectId);assert.ok(observation);assert.ok(Buffer.byteLength(observation.id)<=128);assert.equal(saved.characters[0].shortTerm.find(m=>m.id===observation.id).source.object,objectId);s.choose(rest);await s.advance();assert.ok(s.inputs.at(-1).objects.some(o=>o.id===objectId));assert.match(JSON.stringify(s.messages.at(-1)),new RegExp(objectId));assert.equal(JSON.stringify(s.messages.at(-1)).includes('PRIVATE_STATE'),false);});
});
