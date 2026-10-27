/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const vessel=(id='ordinary-vessel',state='empty')=>({id,source:'scene',label:'普通杯子',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:state},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea','coffee','dirty']}});
const tool=()=>({id:'shared-brewing-tools',source:'scene',label:'共用茶具',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{condition:'sound'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{condition:['sound','broken']}});
const proposal={type:'propose',target:'shared-brewing-tools',content:'我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶',purpose:'飲用',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]};
async function scenario({objects=[tool()],supplies,minutes=5,modify=()=>{}}={}){
 const world=seedWorld();world.contextId=crypto.randomUUID();world.adjudication={provider:'openai',model:'fixture-adjudicator'};world.objects=objects;if(supplies)world.supplies=supplies;world.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});modify(world);store.install(world);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const previous=global.fetch,inputs=[];let decision=proposal;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(input);return completion(input.contractVersion==='world-adjudication.v1'?{status:'accepted',completionMinutes:null,effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings:input.routineOffer.operations.map(operation=>({operation,minutes}))}}:decision);};
 return {post,read:async()=>(await(await GET()).json()).world,decision:value=>{decision=value;},inputs,restore:()=>{global.fetch=previous;}};
}
async function advance(s,extra={}){const r=await s.post({operation:'advance',minutes:15,...extra});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));return s.read();}

test('original tool proposal completes in a legal existing vessel and preserves identity on replay and reload',async()=>{
 const s=await scenario({objects:[tool(),vessel()]});try{
  const operationId=Date.now()+':'+crypto.randomUUID();let w=await advance(s,{operationId});
  assert.equal(w.routineRules[0].templates.length,6);assert.equal(w.objects.find(o=>o.id==='ordinary-vessel').state.contents,'tea');assert.equal(w.objects.filter(o=>o.kind==='utensil').length,2);assert.equal(w.characters.find(c=>c.id==='owner').plan,undefined);
  const before=w.objects;w=await advance(s,{operationId});assert.deepEqual(w.objects,before);assert.equal(s.inputs.length,2);assert.equal(w.aiUsage.totalCalls,2);
 }finally{s.restore();}
});

test('background materializes a persistent clean vessel when none exists or recorded vessels are dirty',async()=>{
 for(const dirty of [false,'contents','clean']){
  const original=vessel('previous-vessel',dirty==='clean'?'empty':'dirty');if(dirty==='clean')original.state.clean='no';const s=await scenario({objects:[tool(),...(dirty?[original]:[])]});try{
   const operationId=Date.now()+':'+crypto.randomUUID();let w=await advance(s,{operationId});
   const cups=w.objects.filter(o=>'contents' in o.state);assert.equal(cups.length,dirty?2:1);const created=cups.find(o=>o.id!=='previous-vessel');assert.equal(created.state.contents,'tea');assert.equal(created.holder,'owner');assert.equal(created.owner,'owner');assert.equal(created.region,'cafe-front');assert.ok(created.knownTo.includes('owner'));assert.ok(created.allowedTo.includes('owner'));
   if(dirty)assert.deepEqual(w.objects.find(o=>o.id==='previous-vessel'),original);
   const before=w.objects;w=await advance(s,{operationId});assert.deepEqual(w.objects,before);assert.equal(s.inputs.length,2);
  }finally{s.restore();}
 }
});

test('specific vessels, finite clean-vessel shortage, tool restrictions and missing materials cannot be bypassed by background',async()=>{
 const empty={id:'finite-vessels',label:'所有乾淨杯子',region:'cafe-front',remaining:0,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'utensil',initialState:{contents:'empty'},stateTransitions:{contents:['empty','water','tea','dirty']}};
 const noTea={id:'finite-tea',label:'最後的茶包',region:'cafe-front',remaining:0,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}};
 const cases=[
  {objects:[tool(),vessel('chosen','dirty')],decision:{...proposal,target:'chosen'}},
  {objects:[tool(),{...vessel('chosen'),holder:'cass'}],decision:{...proposal,target:'chosen'}},
  {objects:[tool(),{...vessel('chosen'),owner:'cass',allowedTo:[]}],decision:{...proposal,target:'chosen'}},
  {supplies:[empty]},
  {supplies:[noTea]},
  {objects:[{...tool(),state:{condition:'broken'}},vessel()]},
  {objects:[{...tool(),state:{available:'no'}},vessel()]},
  {supplies:[{...empty,remaining:1,initialState:{contents:'empty',clean:'no'}}]},
  {objects:[{...tool(),region:'cafe-back'},vessel()]},
  {objects:[{...tool(),owner:'cass',allowedTo:[]},vessel()]},
 ];
 for(const entry of cases){const s=await scenario(entry);if(entry.decision)s.decision(entry.decision);try{
  const before=await s.read(),w=await advance(s);assert.deepEqual(w.objects,before.objects);assert.deepEqual(w.supplies,before.supplies);assert.equal(w.characters.find(c=>c.id==='owner').plan,undefined);assert.ok(!w.objects.some(o=>o.state.beverage==='tea'));
 }finally{s.restore();}}
 const usable=await scenario({objects:[tool(),vessel('chosen')]});usable.decision({...proposal,target:'chosen'});try{const w=await advance(usable);assert.equal(w.objects.find(o=>o.id==='chosen').state.contents,'tea');assert.equal(w.objects.filter(o=>'contents' in o.state).length,1);}finally{usable.restore();}
});

test('the required brewing tool is rechecked across a long activity while earlier water remains saved',async()=>{
 for(const change of [o=>{o.state.available='no';},o=>{o.state.condition='broken';},o=>{o.region='cafe-back';},o=>{o.owner='cass';o.allowedTo=[];},o=>{o.holder='cass';}]){
  const s=await scenario({minutes:30});try{
   let w=await advance(s);const created=w.objects.find(o=>'contents' in o.state);assert.equal(created.state.contents,'water');assert.ok(w.characters.find(c=>c.id==='owner').plan);
   change(w.objects.find(o=>o.id==='shared-brewing-tools'));store.replaceCommittedWorld(w);
   w=await advance(s);assert.equal(w.objects.find(o=>o.id===created.id).state.contents,'water');assert.equal(w.objects.some(o=>o.state.beverage==='tea'),false);assert.equal(w.characters.find(c=>c.id==='owner').plan,undefined);assert.equal(s.inputs.length,2);
  }finally{s.restore();}
 }
});

test('new drink, wash and brew activities reuse the saved rule and the washed vessel without another adjudication',async()=>{
 const s=await scenario();try{
  let w=await advance(s),cup=w.objects.find(o=>'contents' in o.state);const id=cup.id;
  s.decision({...proposal,target:id,content:'喝茶'});w=await advance(s);assert.equal(w.objects.find(o=>o.id===id).state.contents,'dirty');assert.equal(w.objects.find(o=>o.state.vessel===id).lifecycle,'consumed');
  s.decision({...proposal,target:id,content:'清洗杯子',purpose:'清洗'});w=await advance(s);assert.equal(w.objects.find(o=>o.id===id).state.contents,'empty');
  s.decision({...proposal,content:'泡一杯茶'});w=await advance(s);assert.equal(w.objects.find(o=>o.id===id).state.contents,'tea');assert.equal(w.objects.filter(o=>'contents' in o.state).length,1);assert.equal(w.objects.filter(o=>o.state.vessel===id).length,2);assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,1);assert.equal(w.aiUsage.totalCalls,5);
 }finally{s.restore();}
});

test('explicit time shortage saves approval without materializing, then a new activity can start under the saved rule',async()=>{
 const s=await scenario({minutes:30});s.decision({...proposal,timeIntent:{kind:'completion',maxMinutes:15}});try{
  let w=await advance(s);assert.equal(w.routineRules[0].templates.length,6);assert.equal(w.objects.length,1);assert.equal(w.supplies,undefined);assert.equal(w.characters.find(c=>c.id==='owner').plan,undefined);
  s.decision({...proposal,content:'泡一杯茶'});w=await advance(s);const cup=w.objects.find(o=>'contents' in o.state);assert.equal(cup.state.contents,'water');assert.ok(w.characters.find(c=>c.id==='owner').plan);w=await advance(s);assert.equal(w.objects.find(o=>o.id===cup.id).state.contents,'tea');assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,1);
 }finally{s.restore();}
});

test('cancelled brewing preserves the concrete water vessel, removes pending tea and does not replay future effects',async()=>{
 const s=await scenario({minutes:30});try{
  let w=await advance(s);const cup=w.objects.find(o=>'contents' in o.state);assert.equal(cup.state.contents,'water');
  // Public takeover cancels the activity, preserving already committed effects.
  let response=await s.post({operation:'takeover'});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  w=await advance(s);assert.equal(w.objects.find(o=>o.id===cup.id).state.contents,'water');assert.equal(w.objects.some(o=>o.state.beverage==='tea'),false);assert.equal(w.supplies.some(s=>s.pending),false);assert.equal(w.characters.find(c=>c.id==='owner').plan,undefined);assert.equal(s.inputs.length,2);
 }finally{s.restore();}
});

test('washing a recorded dirty cup restores its explicit cleanliness and the next new brew reuses that identity',async()=>{
 for(const contents of ['dirty','empty']){
 const old=vessel('old-dirty-vessel',contents);old.state.clean='no';old.stateTransitions.clean=['yes','no'];
 const s=await scenario({objects:[tool(),old]});try{
  await advance(s);s.decision({...proposal,target:old.id,content:'清洗杯子',purpose:'清洗'});
  let w=await advance(s);assert.equal(w.objects.find(o=>o.id===old.id).state.contents,'empty');assert.equal(w.objects.find(o=>o.id===old.id).state.clean,'yes');assert.equal(w.objects.find(o=>o.id===old.id).revision,contents==='dirty'?4:3);
  s.decision({...proposal,content:'泡一杯茶'});w=await advance(s);assert.equal(w.objects.find(o=>o.id===old.id).state.contents,'tea');assert.equal(w.objects.filter(o=>'contents' in o.state).length,2);assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,1);
 }finally{s.restore();}
 }
});
