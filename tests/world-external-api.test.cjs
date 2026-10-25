/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const rest={type:'rest',target:'',content:'休息',mood:'平靜',durationMinutes:15,intents:[]};
const proposal={...rest,type:'propose',target:'cup',content:'熱茶意外灑出，承接杯子、桌面與手的實際影響',purpose:'移動熱茶',timeIntent:{kind:'completion',maxMinutes:null}};
const change=(type,id,key,from,value,revision=0)=>({kind:'change-state',version:1,access:type==='object'?'authorized':'physical',target:{type,id},exposure:'public',expectedRevision:revision,changes:[{key,from,value}],reason:'observer-only:熱茶接觸造成外在變化'});
const accepted=effects=>({status:'accepted',completionMinutes:15,effects,stages:[],branches:null,check:null,routine:null});
async function scenario({reply=accepted([change('object','cup','volume','full','less',1),change('environment','cafe-front','桌面','乾燥','濕潤'),change('body','vera','手背',null,'燙紅')]),decision=proposal,die=12,prepare=()=>{}}={}){
 const w=seedWorld();const owner=w.characters.find(c=>c.id==='owner'),vera=w.characters.find(c=>c.id==='vera'),kris=w.characters.find(c=>c.id==='kris');
 w.characters=[owner,vera,kris];w.turn=0;w.contextId='external-fixture';w.adjudication={provider:'openai',model:'fixture-world'};w.playerBudget={calls:120,tokens:1000000};
 owner.location=vera.location='cafe';owner.region=vera.region='cafe-front';kris.location='kris-home';kris.region='kris-home-main';
 load('memory').addExperience(vera,w.minute,'PRIVATE_VERA_MEMORY');load('memory').addExperience(kris,w.minute,'PRIVATE_KRIS_MEMORY');
 w.objects=[{id:'cup',source:'fixture-cup',label:'熱茶杯',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{volume:'full'},lifecycle:'active',kind:'utensil',knownTo:['owner','vera'],allowedTo:['owner']}];
 w.scene={doors:{'cafe-door':'open'},noise:{},occluded:[],external:{'cafe-front':{revision:0,state:{桌面:'乾燥'}}}};
 prepare(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});
 const oldFetch=global.fetch,oldRandom=Math.random;let npc=0,judgments=0,dice=0;const requests=[],choices={};
 global.fetch=async(_url,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);requests.push({input,request});if(input.contractVersion==='world-adjudication.v1'){judgments++;return completion(typeof reply==='function'?reply(input):reply);}npc++;return completion(choices[input.self.id]||(input.self.id==='owner'?decision:rest));};
 Math.random=()=>{dice++;return (die-.5)/20;};
 return {post,read:async()=>(await(await GET()).json()).world,choose:v=>decision=v,chooseActor:(id,v)=>choices[id]=v,reply:v=>reply=v,counts:()=>({npc,judgments,dice}),requests,restore:()=>{global.fetch=oldFetch;Math.random=oldRandom;}};
}
async function advance(s,extra={}){const r=await s.post({operation:'advance',minutes:15,...extra});assert.equal(r.status,200,await r.clone().text());return s.read();}

test('one actual activity atomically saves cup environment and body consequences and exposes only knowable clues',async()=>{
 const s=await scenario();try{
  const id=Date.now()+':'+crypto.randomUUID();const w=await advance(s,{operationId:id});
  assert.equal(w.objects[0].state.volume,'less');assert.equal(w.scene.external['cafe-front'].state.桌面,'濕潤');assert.equal(w.characters.find(c=>c.id==='vera').physical.state.手背,'燙紅');
  assert.equal(w.characters.find(c=>c.id==='vera').mood,'平靜');assert.equal(w.characters.find(c=>c.id==='vera').cognition,undefined);
  const vera=s.requests.find(r=>r.input.self?.id==='vera').input,kris=s.requests.find(r=>r.input.self?.id==='kris').input;
  assert.equal(vera.self.physical.state.手背,'燙紅');assert.equal(vera.scene.external.state.桌面,'濕潤');
  assert.match(JSON.stringify(vera),/PRIVATE_VERA_MEMORY/);assert.match(JSON.stringify(kris),/PRIVATE_KRIS_MEMORY/);
  assert.doesNotMatch(JSON.stringify(kris),/燙紅|濕潤|observer-only|PRIVATE_VERA_MEMORY/);
  assert.doesNotMatch(JSON.stringify(vera),/observer-only|PRIVATE_KRIS_MEMORY|operationEvidence/);
  assert.ok(w.characters.find(c=>c.id==='vera').observations.some(o=>o.sense==='touch'&&/燙紅/.test(o.text)));
  assert.deepEqual(s.counts(),{npc:3,judgments:1,dice:0});
  const counts=s.counts();await advance(s,{operationId:id});const reread=await s.read();assert.deepEqual(reread.objects,w.objects);assert.deepEqual(reread.scene,w.scene);assert.deepEqual(reread.characters.map(c=>c.physical),w.characters.map(c=>c.physical));assert.deepEqual(s.counts(),counts);
  const receipt=await(await GET(new Request('https://test.invalid/api/world?operationId='+id))).json();
  const bodyEvidence=receipt.operation.evidence.result.externalStates.find(item=>item.target.type==='body'&&item.target.id==='vera');
  assert.equal(bodyEvidence.before,null);assert.deepEqual(bodyEvidence.after.stateEntries,[{key:'手背',value:'燙紅'}]);
  const environmentEvidence=receipt.operation.evidence.result.externalStates.find(item=>item.target.type==='environment');assert.deepEqual(environmentEvidence.before.stateEntries,[{key:'桌面',value:'乾燥'}]);assert.deepEqual(environmentEvidence.after.stateEntries,[{key:'桌面',value:'濕潤'}]);
 }finally{s.restore();}
});

test('subject-only bodily changes are felt directly by the affected actor without exposing hidden symptoms to onlookers',async()=>{
 const effect={...change('body','owner','手心',null,'PRIVATE_STING'),exposure:'subject'};
 const s=await scenario({reply:accepted([effect])});try{
  let w=await advance(s);assert.equal(w.characters[0].physical.state.手心,'PRIVATE_STING');
  assert.ok(w.characters[0].observations.some(o=>o.sense==='touch'&&o.text.includes('PRIVATE_STING')));
  const vera=s.requests.find(r=>r.input.self?.id==='vera').input;
  assert.doesNotMatch(JSON.stringify(vera),/PRIVATE_STING|observer-only/);
  s.choose(rest);w=await advance(s);
  const owner=s.requests.filter(r=>r.input.self?.id==='owner').at(-1).input;assert.equal(owner.self.physical.state.手心,'PRIVATE_STING');
  assert.equal(s.counts().dice,0);
 }finally{s.restore();}
});

const condition=(type,id,key,value,guard)=>({kind:'state-condition',version:1,target:{type,id},state:[{key,value}],...(guard?{guard}:{})});
test('later phases reference relevant external conditions and preserve committed preparation when a bodily premise changes',async()=>{
 const staged={...accepted([]),completionMinutes:45,stages:[
  {afterMinutes:15,preconditions:[],effects:[change('object','cup','progress',null,'partial',1)]},
  {afterMinutes:45,preconditions:[condition('environment','cafe-front','桌面','乾燥'),condition('body','vera','手背',null)],effects:[change('object','cup','progress','partial','complete',2)]},
 ]};
 const s=await scenario({reply:input=>input.actor.id==='owner'?staged:accepted([change('body','vera','手背',null,'燙紅')])});try{
  let w=await advance(s);assert.equal(w.objects[0].state.progress,'partial');assert.ok(w.characters[0].plan);assert.doesNotMatch(w.characters[0].activity,/已結束|已完成/);
  s.chooseActor('vera',{...proposal,target:'vera',content:'手背接觸熱水',purpose:'移動身體'});w=await advance(s);assert.equal(w.characters.find(c=>c.id==='vera').physical.state.手背,'燙紅');assert.equal(w.objects[0].state.progress,'partial');
  s.chooseActor('vera',rest);w=await advance(s);assert.equal(w.objects[0].state.progress,'partial');assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,/條件已改變/);assert.equal(s.counts().judgments,2);assert.equal(s.counts().dice,0);
 }finally{s.restore();}
});

test('unrelated external changes do not invalidate subset phase conditions',async()=>{
 const staged={...accepted([]),completionMinutes:45,stages:[
  {afterMinutes:15,preconditions:[],effects:[change('object','cup','progress',null,'partial',1)]},
  {afterMinutes:45,preconditions:[condition('body','vera','手背',null,{region:'cafe-front',holder:{check:false,value:null}})],effects:[change('object','cup','progress','partial','complete',2)]},
 ]};
 const s=await scenario({reply:input=>input.actor.id==='owner'?staged:accepted([change('body','vera','袖口',null,'濕潤')])});try{
  await advance(s);s.chooseActor('vera',{...proposal,target:'vera',content:'袖口沾了水',purpose:'移動身體'});await advance(s);s.chooseActor('vera',rest);
  const w=await advance(s);assert.equal(w.objects[0].state.progress,'complete');assert.equal(w.characters[0].plan,undefined);assert.equal(s.counts().judgments,2);assert.equal(s.counts().dice,0);
 }finally{s.restore();}
});

const outcomes=['critical-success','success','mixed','failure','critical-failure'];
const displace=(revision=0)=>({kind:'displace-body',version:1,targetId:'vera',expectedRegion:'cafe-front',expectedRevision:revision,toRegion:'cafe-storeroom',reason:'observer-only:推開的外在位置結果'});
test('intentional bodily influence uses existing five bands and moves carried objects without changing the recipient will or ownership',async()=>{
 for(const [die,outcome,position,posture] of [[20,'critical-success','cafe-storeroom','被拉開'],[12,'success','cafe-storeroom','被拉開'],[6,'mixed','cafe-front','踉蹌'],[2,'failure','cafe-front','失衡'],[1,'critical-failure','cafe-front','失衡']]){
  const reply={...accepted([]),check:{difficulty:12,ability:'推拉'},branches:[
   {outcomes:outcomes.slice(0,2),effects:[change('body','vera','姿勢',null,'被拉開'),displace(1)],stages:[]},
   {outcomes:['mixed'],effects:[change('body','vera','姿勢',null,'踉蹌')],stages:[]},
   {outcomes:outcomes.slice(3),effects:[change('body','vera','姿勢',null,'失衡')],stages:[]},
  ]};
  const s=await scenario({reply,die,decision:{...proposal,target:'vera',content:'試著拉開眼前的人',purpose:'移開身體'}});try{
   const initial=await s.read();initial.objects.push({id:'scarf',source:'fixture-scarf',label:'披肩',region:'cafe-front',holder:'vera',owner:'vera',revision:1,state:{},lifecycle:'active',kind:'textile',knownTo:['owner','vera'],allowedTo:['vera']});store.replaceCommittedWorld(initial);
   const w=await advance(s),vera=w.characters.find(c=>c.id==='vera'),scarf=w.objects.find(o=>o.id==='scarf');
   assert.equal(vera.region,position);assert.equal(vera.physical.state.姿勢,posture);assert.equal(vera.mood,'平靜');assert.equal(vera.cognition,undefined);assert.equal(scarf.region,position);assert.equal(scarf.owner,'vera');assert.deepEqual(scarf.allowedTo,['vera']);assert.equal(scarf.holder,'vera');
   assert.equal(Object.values(w.freeTrials)[0].outcome,outcome);assert.deepEqual(s.counts(),{npc:3,judgments:1,dice:1});
  }finally{s.restore();}
 }
});

test('inaccessible or malformed external consequences reject the complete batch and never alter consent or mental fields',async()=>{
 const invalid=[
  [change('object','cup','volume','full','less',1),change('body','vera','意願',null,'同意')],
  [change('object','cup','volume','full','less',1),change('environment','kris-home-main','地面',null,'濕潤')],
  [change('body','unknown-person','手背',null,'燙紅')],
  [{...change('body','vera','手背',null,'燙紅'),expectedRevision:99}],
  [{...displace(),toRegion:'kris-home-main'}],
  [{...change('body','vera','手背',null,'燙紅'),exposure:'omniscient'}],
 ];
 for(const effects of invalid){const s=await scenario({reply:accepted(effects)});try{
  const before=await s.read(),id=Date.now()+':'+crypto.randomUUID(),body={operation:'advance',minutes:15,operationId:id};
  assert.equal((await s.post(body)).status,502);const after=await s.read();assert.deepEqual(after.objects,before.objects);assert.deepEqual(after.scene,before.scene);assert.deepEqual(after.characters.map(c=>c.physical),before.characters.map(c=>c.physical));assert.deepEqual(after.characters.map(c=>c.intents),before.characters.map(c=>c.intents));assert.equal(after.turn,before.turn);assert.equal(s.counts().dice,0);
  const counts=s.counts();assert.equal((await s.post(body)).status,502);assert.deepEqual(s.counts(),counts);
 }finally{s.restore();}}
 const closed=await scenario({reply:accepted([displace()]),prepare:w=>{w.scene.doors['cafe-door']='closed';}});try{assert.equal((await closed.post({operation:'advance',minutes:15})).status,502);assert.equal((await closed.read()).characters.find(c=>c.id==='vera').region,'cafe-front');}finally{closed.restore();}
});

test('combined external states survive actual SQLite save confirmation and replay and roll back on save or version failure',async()=>{
 for(const [fault,status,committed] of [['throwBeforeNextSave',502,false],['throwAfterNextSave',200,true],['conflictOnNextSave',502,false]]){
  const s=await scenario();try{
   const before=await s.read(),id=Date.now()+':'+crypto.randomUUID(),body={operation:'advance',minutes:15,operationId:id};
   store[fault]();const response=await s.post(body);assert.equal(response.status,status);const after=await s.read();
   if(committed){assert.equal(after.objects[0].state.volume,'less');assert.equal(after.scene.external['cafe-front'].state.桌面,'濕潤');assert.equal(after.characters.find(c=>c.id==='vera').physical.state.手背,'燙紅');}
   else{assert.deepEqual(after.objects,before.objects);assert.deepEqual(after.scene,before.scene);assert.deepEqual(after.characters.map(c=>c.physical),before.characters.map(c=>c.physical));assert.equal(after.turn,before.turn);}
   const counts=s.counts();assert.equal((await s.post(body)).status,status);const reloaded=await s.read();assert.deepEqual(reloaded.objects,after.objects);assert.deepEqual(reloaded.scene,after.scene);assert.deepEqual(reloaded.characters.map(c=>c.physical),after.characters.map(c=>c.physical));assert.deepEqual(s.counts(),counts);assert.equal(counts.dice,0);
  }finally{s.restore();}
 }
});

test('body attempts retain a frozen relevant footprint across rewording and added unselected references',async()=>{
 const reply={...accepted([]),check:{difficulty:12,ability:'推拉'},branches:[
  {outcomes:outcomes.slice(0,2),effects:[change('body','vera','姿勢',null,'被拉開'),displace(1)],stages:[]},
  {outcomes:['mixed'],effects:[change('body','vera','姿勢',null,'踉蹌')],stages:[]},
  {outcomes:outcomes.slice(3),effects:[],stages:[]},
 ]};
 const s=await scenario({reply,die:2,decision:{...proposal,target:'vera',content:'試著拉開眼前的人',purpose:'移開身體'}});try{
  await advance(s);assert.equal(s.counts().dice,1);
  const changed=structuredClone(reply);changed.check.difficulty=8;changed.check.ability='另一種推拉說法';changed.branches[0].effects.push(change('body','owner','袖口',null,'沾水'));
  s.reply(changed);s.choose({...proposal,target:'vera',content:'換個說法拉開眼前的人',purpose:'移開身體'});const w=await advance(s);
  assert.equal(s.counts().judgments,2);assert.equal(s.counts().dice,1);assert.equal(w.characters.find(c=>c.id==='vera').physical,undefined);assert.equal(w.characters[0].physical,undefined);
 }finally{s.restore();}
});

test('a directly felt bodily consequence triggers existing reevaluation while the affected NPC may choose to continue',async()=>{
 let original;
 const s=await scenario({reply:accepted([change('body','vera','手背',null,'燙紅')]),prepare:w=>{
  const vera=w.characters.find(c=>c.id==='vera');vera.plan={action:{type:'rest'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};original=structuredClone(vera.plan);
 }});try{
  s.chooseActor('vera',{...rest,type:'continue'});const w=await advance(s),vera=w.characters.find(c=>c.id==='vera');
  const request=s.requests.find(r=>r.input.self?.id==='vera').input;assert.equal(request.currentActivity.canContinueExisting,true);assert.equal(vera.plan.startedAt,original.startedAt);assert.equal(vera.plan.until,original.until);assert.ok(vera.attentionDiagnostics.some(item=>/直接互動/.test(item.reason)));assert.ok(vera.observations.some(o=>o.sense==='touch'));assert.deepEqual(s.counts(),{npc:3,judgments:1,dice:0});
 }finally{s.restore();}
});

test('hidden environment and bodily facts remain authority conditions without becoming same-room or self knowledge',async()=>{
 const hiddenEnvironment={...change('environment','cafe-front','無色氣體',null,'HIDDEN_GAS'),exposure:'hidden'};
 const hiddenBody={...change('body','owner','皮膚狀況',null,'HIDDEN_MARK'),exposure:'hidden'};
 const s=await scenario({reply:accepted([hiddenEnvironment,hiddenBody])});try{
  let w=await advance(s);assert.equal(w.scene.external['cafe-front'].state.無色氣體,'HIDDEN_GAS');assert.equal(w.characters[0].physical.state.皮膚狀況,'HIDDEN_MARK');
  s.choose({...proposal,content:'繼續整理桌上的杯子'});s.reply({...accepted([]),stages:[{afterMinutes:15,preconditions:[condition('environment','cafe-front','無色氣體','HIDDEN_GAS'),condition('body','owner','皮膚狀況','HIDDEN_MARK')],effects:[change('object','cup','volume','full','less',1)]}]});w=await advance(s);assert.equal(w.objects[0].state.volume,'less');
  for(const request of s.requests.filter(r=>r.input.self)){assert.doesNotMatch(JSON.stringify(request.input),/HIDDEN_GAS|HIDDEN_MARK|無色氣體|皮膚狀況/);assert.doesNotMatch(request.input.self.activity,/外在狀況已改變|身體狀況有變化|外在狀態已改變/);}
  for(const actor of w.characters)assert.doesNotMatch(JSON.stringify(actor.observations),/HIDDEN_GAS|HIDDEN_MARK/);
  assert.equal(s.counts().dice,0);assert.equal(s.counts().judgments,2);
 }finally{s.restore();}
});

test('new hidden object state is preserved as an authority fact and observer evidence while old visible state remains known',async()=>{
 const hidden={...change('object','cup','隱藏配方',null,'HIDDEN_RECIPE',1),exposure:'hidden'};
 const s=await scenario({reply:accepted([hidden])});try{
  const id=Date.now()+':'+crypto.randomUUID();let w=await advance(s,{operationId:id});assert.equal(w.objects[0].state.隱藏配方,'HIDDEN_RECIPE');assert.equal(w.objects[0].stateExposure.隱藏配方,'hidden');assert.equal(w.objects[0].state.volume,'full');
  const vera=s.requests.find(r=>r.input.self?.id==='vera').input;assert.equal(vera.objects.find(o=>o.id==='cup').state.volume,'full');
  s.choose({...proposal,content:'繼續整理這個杯子'});s.reply({...accepted([]),stages:[{afterMinutes:15,preconditions:[condition('object','cup','隱藏配方','HIDDEN_RECIPE')],effects:[change('object','cup','volume','full','less',2)]}]});w=await advance(s);assert.equal(w.objects[0].state.volume,'less');
  for(const request of s.requests.filter(r=>r.input.self))assert.doesNotMatch(JSON.stringify(request.input),/HIDDEN_RECIPE|隱藏配方/);
  const receipt=await(await GET(new Request('https://test.invalid/api/world?operationId='+id))).json();assert.ok(receipt.operation.evidence.result.objects[0].stateEntries.some(entry=>entry.value==='HIDDEN_RECIPE'));
  assert.equal(s.counts().dice,0);
 }finally{s.restore();}
});
