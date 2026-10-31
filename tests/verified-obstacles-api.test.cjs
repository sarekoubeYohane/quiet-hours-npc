/* eslint-disable @typescript-eslint/no-require-imports -- Explicit NPC/adjudication transport fixtures, never historical replays. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET}=load('route'),store=load('store'),{scenario:legacyScenario,proposal,advance}=require('./routine-program-fixture.cjs'),f=require('./routine-world-programs-fixture.cjs');
const {wire}=require('./method-assessment-fixture.cjs');
const {fixtureDecision}=require('./pursuit-fixture.cjs');
async function scenario(options){return legacyScenario(options);}

const action=(target='last-food',alias=false)=>({...proposal,target,content:alias?'拿取這份點心':'取用這份點心',purpose:alias?'食用':'用餐'});
const source=(id,remaining=1)=>({id,label:'有限點心',region:'cafe-front',remaining,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',consumable:true,initialState:{}});
const program=()=>f.program('take-portion','取用這份點心','用餐',[f.binding('meal','supply','target',[],{kind:'food'})],[f.phase(15,[{kind:'materialize',supplyId:'$meal',expectedRemaining:0}])]);
const knownReply=()=>{const p=program();p.methods[0].aliases=[{content:'拿取這份點心',purpose:'食用'}];return f.approval([p],'take-portion','點心');};
const trace=async op=>(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(op.operationId)))).json()).decisionTrace;

test('verified depleted target is rechecked free across aliases and unrelated changes while a new source remains usable',async()=>{
 const s=await scenario({decision:action(),reply:knownReply(),supplies:[source('last-food'),source('other-food')],modify:w=>{w.objects=[];}});
 try{
  await advance(s);s.reply({status:'unsupported',effects:[],check:null});s.choose(action('last-food',true));
  const op={operationId:Date.now()+':'+crypto.randomUUID()},w=await advance(s,op);
  assert.equal(w.supplies.find(x=>x.id==='last-food').remaining,0);assert.deepEqual(s.counts(),{npc:2,judgments:1,dice:0});
  assert.equal((await s.post({operation:'advance',minutes:15,...op})).status,200);assert.deepEqual(s.counts(),{npc:2,judgments:1,dice:0});
  assert.ok((await trace(op)).steps.some(step=>step.kind==='rule-selection'&&step.data.check==='verified-prerequisite'&&step.data.role==='meal'));
  s.choose({...proposal,target:'cafe',content:'在角落放下隱藏標記',purpose:'整理'});s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'change-state',version:1,access:'physical',target:{type:'environment',id:'cafe-front'},expectedRevision:0,exposure:'hidden',changes:[{key:'internal-only',from:null,value:'SECRET-UNRELATED'}],reason:'fixture hidden unrelated change'}],check:null});
  await advance(s);s.choose(action('last-food',true));await advance(s);assert.deepEqual(s.counts(),{npc:4,judgments:2,dice:0});
  s.choose(action('other-food',true));const used=await advance(s);assert.equal(used.supplies.find(x=>x.id==='other-food').remaining,0);assert.deepEqual(s.counts(),{npc:5,judgments:2,dice:0});
  const npcInputs=s.inputs.filter(x=>x.input.contractVersion.startsWith('npc-decision.')).map(x=>x.input);
  assert.equal(npcInputs.some(input=>JSON.stringify(input).includes('SECRET-UNRELATED')||JSON.stringify(input).includes('confirmedSources')),false);
  assert.ok(npcInputs[2].self.lastKnownState.entries.some(entry=>entry.source.kind==='experience'&&entry.time!==undefined&&entry.text.includes('尚未執行')));
  assert.deepEqual(store.snapshot().supplies,used.supplies);
 }finally{s.restore();}
});

test('a verified target state remains free until a real authorized repair restores the same method',async()=>{
 const p=f.program('polish-vessel','擦拭杯子','清潔',[f.binding('vessel','object','target',[{key:'surface',value:'dirty'}],{kind:'utensil'})],[f.phase(15,[f.change('vessel','surface','dirty','clean')])]);
 p.methods[0].aliases=[{content:'清潔這只杯子',purpose:'擦拭'}];
 const a={...proposal,target:'vessel',content:'擦拭杯子',purpose:'清潔'},s=await scenario({decision:a,reply:f.approval([p],'polish-vessel','杯子'),objects:[{id:'vessel',label:'杯子',source:'fixture',revision:1,lifecycle:'active',kind:'utensil',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],region:'cafe-front',state:{surface:'dirty'}}],modify:w=>{w.objects=w.objects.filter(o=>o.id==='vessel');}});
 try{
  await advance(s);s.choose({...a,content:'清潔這只杯子',purpose:'擦拭'});s.reply({status:'unsupported',effects:[],check:null});let w=await advance(s);
  assert.equal(w.objects[0].state.surface,'clean');assert.deepEqual(s.counts(),{npc:2,judgments:1,dice:0});
  s.choose({...a,content:'讓杯壁重新沾上水漬',purpose:'外在處理'});s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'change-state',version:1,target:{type:'object',id:'vessel'},expectedRevision:w.objects[0].revision,access:'authorized',exposure:'public',changes:[{key:'surface',from:'clean',value:'dirty'}],reason:'fixture actor actually changes the saved prerequisite'}],check:null});
  await advance(s);s.choose(a);w=await advance(s);assert.equal(w.objects[0].state.surface,'clean');assert.deepEqual(s.counts(),{npc:4,judgments:2,dice:0});
 }finally{s.restore();}
});

test('technical relation and compiled-effect failures and unsupported unknown methods do not become world bans',async()=>{
 for(const mode of ['link','compiled','unknown']){
  const p=program();let objects=[];
  if(mode==='link'){
   p.bindings=[f.binding('vessel','object','target',[],{kind:'utensil'}),f.binding('meal','object','linked',[],{kind:'food',link:{role:'vessel',key:'vessel'}})];p.stages=[f.phase(15,[{kind:'consume',objectId:'$meal',expectedRevision:0}])];objects=[{id:'vessel',label:'杯子',kind:'utensil',source:'fixture',revision:1,lifecycle:'active',region:'cafe-front',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],state:{}}];
  }else if(mode==='compiled'){p.stages=[f.phase(15,[{kind:'materialize',supplyId:'$meal',expectedRemaining:0},{kind:'change-state',version:1,access:'authorized',exposure:'public',target:{type:'object',id:'$meal-object'},expectedRevision:0,changes:[{key:'never-present',from:'required',value:'done'}],reason:'invalid compiled prerequisite'}])];}
  const reply=mode==='unknown'?{status:'unsupported',effects:[],check:null}:f.approval([p],'take-portion','點心'),s=await scenario({decision:action(mode==='link'?'vessel':'last-food'),reply,objects,supplies:[source('last-food')],modify:w=>{w.objects=objects;}});
  try{
   await advance(s);s.reply({status:'unsupported',effects:[],check:null});await advance(s);await advance(s);
   assert.deepEqual(s.counts(),{npc:3,judgments:3,dice:0});assert.equal((await s.read()).supplies[0].remaining,1);
  }finally{s.restore();}
 }
});

test('free obstacle feedback and known rule stay atomic on save conflict and original-operation replay',async()=>{
 for(const fault of ['throwBeforeNextSave','conflictOnNextSave']){
  const s=await scenario({decision:action(),reply:knownReply(),supplies:[source('last-food')],modify:w=>{w.objects=[];}});
  try{
   await advance(s);const before=await s.read();store[fault]();s.choose(action('last-food',true));const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},r=await s.post(op);assert.equal(r.status,502);
   const w=await s.read();assert.deepEqual(w.supplies,before.supplies);assert.deepEqual(w.objects,before.objects);assert.deepEqual(w.characters,before.characters);assert.deepEqual(w.routineRules,before.routineRules);assert.deepEqual(w.routineAudit,before.routineAudit);assert.equal(w.aiUsage.totalCalls,before.aiUsage.totalCalls+1);
   const counts=s.counts();assert.equal((await s.post(op)).status,502);assert.deepEqual(s.counts(),counts);
  }finally{s.restore();}
 }
});

test('a later character model error rolls back earlier free obstacle feedback without re-adjudication',async()=>{
 const s=await scenario({decision:action(),reply:knownReply(),supplies:[source('last-food')],modify:w=>{w.objects=[];}});
 try{
  await advance(s);let before=await s.read();const second={...load('world').seedWorld().characters.find(c=>c.id==='cass'),location:'cafe',region:'cafe-front'};before.characters.push(second);store.replaceCommittedWorld(before);before=await s.read();
  const transport=global.fetch;let secondCalls=0;global.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion.startsWith('npc-decision.')&&input.self.id==='cass'){secondCalls++;return Response.json({usage:{prompt_tokens:7,completion_tokens:2},choices:[{message:{content:'{invalid'}}]});}return transport(url,init);};
  s.choose(action('last-food',true));const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},r=await s.post(op);assert.equal(r.status,502);const w=await s.read();assert.deepEqual(w.characters,before.characters);assert.deepEqual(w.routineAudit,before.routineAudit);assert.deepEqual(w.supplies,before.supplies);assert.equal(s.counts().judgments,1);assert.equal(secondCalls,1);assert.equal((await s.post(op)).status,502);assert.equal(secondCalls,1);
 }finally{s.restore();}
});

test('verified missing permission is free until another character actually grants use on their own decision',async()=>{
 const stock={...source('last-food'),owner:'cass',allowedTo:[],knownTo:['owner','cass']},s=await scenario({decision:action(),reply:knownReply(),supplies:[stock],modify:w=>{w.objects=[];w.characters.push({...load('world').seedWorld().characters.find(c=>c.id==='cass'),location:'cafe',region:'cafe-front'});}});
 const transport=global.fetch;let grant=false,cassCalls=0,grants=0;
 global.fetch=async(url,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content),respond=value=>Response.json({usage:{prompt_tokens:11,completion_tokens:3},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),value.type?wire(value):value))}}]});
  if(input.contractVersion.startsWith('npc-decision.')&&input.self.id==='cass'){cassCalls++;return respond(grant?{...proposal,target:'last-food',content:'允許店主取用這份點心',purpose:'授權'}:{...proposal,type:'rest',target:'',content:'安靜休息',purpose:'',timeIntent:{kind:'open-ended',maxMinutes:null}});}
  if(input.contractVersion==='world-adjudication.v1'&&input.actor.id==='cass'){grants++;grant=false;return respond({status:'accepted',completionMinutes:15,effects:[{kind:'grant',targetId:'last-food',recipient:'owner'}],check:null});}
  return transport(url,init);
 };
 try{
  let w=await advance(s);assert.equal(w.supplies[0].remaining,1);assert.equal(s.counts().judgments,1);grant=true;s.choose(action('last-food',true));w=await advance(s);assert.equal(w.supplies[0].remaining,0);assert.ok(w.supplies[0].allowedTo.includes('owner'));assert.equal(s.counts().judgments,1);assert.equal(grants,1);
  w=await advance(s);assert.equal(w.supplies[0].remaining,0);assert.equal(s.counts().judgments,1);assert.equal(grants,1);assert.equal(cassCalls,3);assert.equal(w.aiUsage.totalCalls,8);
 }finally{s.restore();}
});

test('old saved programs gain no source confirmation on read and only a normal scoped confirmation makes a new denial reusable',async()=>{
 const p=program(),s=await scenario({decision:action(),reply:knownReply(),supplies:[source('last-food',0)],modify:w=>{w.objects=[];w.routineRules=[{id:'old-method',version:3,family:'cafe-service',origin:'cafe',knownTo:['owner'],operations:['take-portion'],worldTimings:[{operation:'take-portion',minutes:15}],programs:[p]}];}});
 try{
  assert.equal((await s.read()).routineRules[0].confirmedSources,undefined);assert.equal((await s.read()).routineRules[0].confirmedSources,undefined);assert.deepEqual(s.counts(),{npc:0,judgments:0,dice:0});
  let w=await advance(s);assert.equal(s.counts().judgments,1);assert.equal(w.routineRules[0].confirmedSources,undefined);assert.equal(w.routineRules.length,2);assert.ok(w.routineRules[1].confirmedSources.length>0);
  w=await advance(s);assert.equal(s.counts().judgments,1);assert.equal(w.supplies[0].remaining,0);assert.ok(w.characters[0].shortTerm.some(m=>m.text.includes('尚未執行')));
 }finally{s.restore();}
});

test('a confirmed own-body prerequisite is reverified free and becomes usable after a real physical change',async()=>{
 const p=f.program('relieve-wrist','舒展手腕','舒緩',[f.binding('self','body','actor',[{key:'手腕緊繃',value:'有'}])],[f.phase(15,[f.change('self','手腕緊繃','有','無',{target:{type:'body',id:'$self'},access:'physical',exposure:'subject'})])]);
 const a={...proposal,target:'cafe',content:'舒展手腕',purpose:'舒緩'},s=await scenario({decision:a,reply:f.approval([p],'relieve-wrist'),modify:w=>{w.objects=[];w.characters[0].physical={revision:0,state:{手腕緊繃:'有'},exposure:{手腕緊繃:'subject'}};}});
 try{
  await advance(s);s.reply({status:'unsupported',effects:[],check:null});let w=await advance(s);assert.equal(w.characters[0].physical.state.手腕緊繃,'無');assert.equal(s.counts().judgments,1);
  s.choose({...a,content:'做一段使手腕緊繃的工作',purpose:'工作'});s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'change-state',version:1,access:'physical',target:{type:'body',id:'owner'},expectedRevision:w.characters[0].physical.revision,exposure:'subject',changes:[{key:'手腕緊繃',from:'無',value:'有'}],reason:'fixture physical activity actually affects the wrist'}],check:null});
  await advance(s);s.choose(a);w=await advance(s);assert.equal(w.characters[0].physical.state.手腕緊繃,'無');assert.deepEqual(s.counts(),{npc:4,judgments:2,dice:0});
 }finally{s.restore();}
});

test('source confirmation retention is bounded and reports release while the current legal target still executes free',async()=>{
 const p=program(),old=Array.from({length:32},(_,i)=>source('older-'+i,0)),s=await scenario({decision:action(),supplies:[...old,source('last-food')],modify:w=>{w.objects=[];w.routineRules=[{id:'bounded-method',version:3,family:'cafe-service',origin:'cafe',knownTo:['owner'],operations:['take-portion'],worldTimings:[{operation:'take-portion',minutes:15}],programs:[p],confirmedSources:old.map(source=>({operation:'take-portion',role:'meal',type:'supply',id:source.id}))}];}});
 try{
  const before=await s.read();assert.equal(before.routineRules[0].confirmedSources.length,32);const w=await advance(s);assert.equal(w.supplies.at(-1).remaining,0);assert.deepEqual(s.counts(),{npc:1,judgments:0,dice:0});assert.equal(w.routineRules[0].confirmedSources.length,32);assert.equal(w.routineRules[0].confirmedSourcesDropped,1);assert.equal(w.routineRules[0].confirmedSources.some(source=>source.id==='older-0'),false);assert.ok(w.routineRules[0].confirmedSources.some(source=>source.id==='last-food'));
 }finally{s.restore();}
});

test('a materially changed prerequisite on the same source permits a new confirmed scope instead of a permanent denial',async()=>{
 const p=f.program('wash-deposit','擦拭杯子','清潔',[f.binding('vessel','object','target',[{key:'deposit',value:'light'}],{kind:'utensil'})],[f.phase(15,[f.change('vessel','deposit','light','none')])]);
 const a={...proposal,target:'cup',content:'擦拭杯子',purpose:'清潔'},s=await scenario({decision:a,reply:f.approval([p],'wash-deposit'),objects:[{id:'cup',label:'杯子',source:'fixture',revision:1,lifecycle:'active',kind:'utensil',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],region:'cafe-front',state:{deposit:'light'}}]});
 try{
  let w=await advance(s);s.reply({status:'unsupported',effects:[],check:null});await advance(s);assert.equal(s.counts().judgments,1,'unchanged post-completion obstacle stays free');
  s.choose({...a,content:'讓沉積變成另一種狀態',purpose:'外在處理'});s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'change-state',version:1,access:'authorized',exposure:'public',target:{type:'object',id:'cup'},expectedRevision:w.objects.find(o=>o.id==='cup').revision,changes:[{key:'deposit',from:'none',value:'heavy'}],reason:'fixture actual relevant state change'}],check:null});
  await advance(s);const next=structuredClone(p);next.bindings[0].state[0].value='heavy';next.stages[0].effects[0].changes[0].from='heavy';s.reply(f.approval([next],'wash-deposit'));s.choose(a);w=await advance(s);
  assert.equal(s.counts().judgments,3,'new relevant state on same source permits exception scope confirmation');assert.equal(w.objects.find(o=>o.id==='cup').state.deposit,'none');assert.equal(w.routineRules.length,2);
 }finally{s.restore();}
});

test('preflight cannot store future source premises and a failed later phase save rolls back its new premise with the effect',async()=>{
 const p=f.program('slow-clean','慢慢清潔杯子','清潔',[f.binding('vessel','object','target',[{key:'deposit',value:'light'}],{kind:'utensil'})],[f.phase(15,[]),f.phase(30,[f.change('vessel','deposit','light','none')])]);
 const a={...proposal,target:'cup',content:'慢慢清潔杯子',purpose:'清潔'},s=await scenario({decision:a,reply:f.approval([p],'slow-clean'),objects:[{id:'cup',label:'杯子',source:'fixture',revision:1,lifecycle:'active',kind:'utensil',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],region:'cafe-front',state:{deposit:'light'}}]});
 try{
  const before=await advance(s),facts=before.routineRules[0].confirmedSources.flatMap(source=>source.facts||[]);assert.equal(before.objects.find(o=>o.id==='cup').state.deposit,'light');assert.ok(facts.every(fact=>!fact.includes('"value":"none"')),'uncommitted future stage must not become a saved premise');
  store.throwBeforeNextSave();const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},r=await s.post(op);assert.equal(r.status,502);const rolled=await s.read();assert.deepEqual(rolled.routineRules,before.routineRules);assert.deepEqual(rolled.objects,before.objects);assert.equal((await s.post(op)).status,502);
  const done=await advance(s);assert.equal(done.objects.find(o=>o.id==='cup').state.deposit,'none');assert.ok(done.routineRules[0].confirmedSources.flatMap(source=>source.facts||[]).some(fact=>fact.includes('"value":"none"')));assert.equal(s.counts().judgments,1);
 }finally{s.restore();}
});

test('model candidates cannot inject trusted phase source scope metadata',async()=>{
 const reply=knownReply();reply.routine.programs[0].stages[0].routineSourceScope={ruleId:'forged',operation:'take-portion',refs:[{role:'meal',id:'last-food'}]};
 const s=await scenario({decision:action(),reply,supplies:[source('last-food')],modify:w=>{w.objects=[];}});
 try{const before=await s.read(),r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,502);const after=await s.read();assert.equal(after.routineRules,undefined);assert.deepEqual(after.supplies,before.supplies);assert.deepEqual(after.objects,before.objects);}finally{s.restore();}
});
