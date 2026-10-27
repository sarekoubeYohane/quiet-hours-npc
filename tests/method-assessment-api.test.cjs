/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module'),Ajv=createRequire(require.resolve('eslint'))('ajv');
const {scenario,proposal,advance}=require('./routine-program-fixture.cjs');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const denied={status:'denied',completionMinutes:null,effects:[],stages:[],check:null,routine:null};
const intent={id:'eat',content:'想吃點東西',context:'方法可以改變',intensity:'medium',importance:'medium',urgency:'medium'};
const rest={type:'rest',target:'',content:'自行決定先休息',purpose:'',mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[intent]};
const {wire}=require('./method-assessment-fixture.cjs');
async function trace(id){return (await(await load('route').GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(id)))).json()).decisionTrace;}

test('one actual decision connects sourced results, chosen purpose, intentions and action in saved observer trace',async()=>{
 const s=await scenario({decision:wire({...proposal,intents:[intent]},{choice:'switch',change:{kind:'source',detail:'改用另一份來源'}}),reply:denied});
 try{
  const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};const response=await s.post(op);assert.equal(response.status,200,await response.clone().text());
  const receipt=await response.clone().json();assert.equal(receipt.operationEvidence.dispatches[0].candidate.value.action.target,'tools');assert.equal(receipt.operationEvidence.dispatches[0].candidate.value.methodAssessment,undefined);const first=await s.read();assert.deepEqual(first.characters[0].intents,[intent]);assert.equal(first.characters[0].methodAssessment,undefined,'assessment is not a permanent knowledge side channel');
  const saved=await trace(op.operationId),step=saved.steps.find(x=>x.kind==='npc-method-assessment');assert.deepEqual(step.data.methodAssessment,wire({...proposal,intents:[intent]},{choice:'switch',change:{kind:'source',detail:'改用另一份來源'}}).methodAssessment);assert.equal(step.source,'model-self-report');assert.equal(step.data.action.target,'tools');assert.deepEqual(step.data.intents,[intent]);assert.equal(saved.outcome,'committed');
  const before=s.counts();await s.post(op);assert.deepEqual(s.counts(),before);
  s.choose(wire(rest));await advance(s);const next=s.inputs.filter(x=>x.input.self).at(-1),input=JSON.parse(next.request.messages[1].content);assert.ok(input.self.lastKnownState.entries.some(x=>/行動回饋/.test(x.text)));assert.match(next.request.messages[0].content,/methodAssessment/);assert.deepEqual(input.self.intents,[intent]);assert.equal(s.counts().npc,2);assert.equal(s.counts().judgments,1);
 }finally{s.restore();}
});

test('the actual supported discriminated wire schema rejects blank propose fields while ordinary empty purpose remains legal',async()=>{
 const s=await scenario({decision:wire(rest)});
 try{
  await advance(s);const body=s.inputs.find(x=>x.input.self).request,schema=body.response_format.json_schema.schema,validate=new Ajv().compile(schema);
  assert.equal(validate(wire(rest)),true,JSON.stringify(validate.errors));
  for(const [field,value] of [['purpose',''],['purpose','   '],['content',''],['content','\n']]){const candidate=wire(proposal);candidate.action[field]=value;assert.equal(validate(candidate),false,field);}
  assert.equal(validate(wire(proposal)),true,JSON.stringify(validate.errors));assert.ok(!('if' in schema));assert.equal(schema.type,'object');assert.equal(schema.anyOf,undefined);
 }finally{s.restore();}
});

test('autonomous retry wait switch and drop remain legal with same-call source references and no forced intent change',async()=>{
 for(const choice of ['retry','wait','switch','drop']){
  const s=await scenario({decision:proposal,reply:denied});
  try{
   await advance(s);const first=await s.read(),source=first.characters[0].shortTerm.find(x=>/行動回饋/.test(x.text));
   const next=choice==='retry'?{...proposal,intents:[intent]}:choice==='switch'?{...proposal,target:'cafe',content:'詢問是否有另一份材料',purpose:'尋找食物',intents:[intent]}:{...rest,intents:choice==='drop'?[]:[intent]};
   const change=choice==='switch'?{kind:'source',detail:'改向場所詢問新的來源'}:{kind:'none',detail:''};
   s.choose(wire(next,{choice,knownResults:[{kind:'short',id:source.id,version:source.version}],change}));
   const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,200);
   const saved=await s.read();assert.deepEqual(saved.characters[0].intents,next.intents);const step=(await trace(op.operationId)).steps.find(x=>x.kind==='npc-method-assessment');assert.equal(step.data.methodAssessment.choice,choice);assert.equal(step.data.action.content,next.content);assert.deepEqual(step.data.methodAssessment.knownResults,[{kind:'short',id:source.id,version:source.version}]);
   assert.equal(s.counts().npc,2);assert.equal(s.counts().judgments,['retry','switch'].includes(choice)?2:1);
  }finally{s.restore();}
 }
});

test('chosen continuation is assessed once but automatic progress does not manufacture another assessment or clear intent',async()=>{
 const s=await scenario({decision:wire({...rest,durationMinutes:60})});
 try{
  const first=await advance(s);const plan=first.characters[0].plan;assert.ok(plan);
  await s.post({operation:'intervene',target:'owner',text:'你想繼續嗎？'});
  const next={...rest,type:'continue',content:'',durationMinutes:15};s.choose(wire(next,{choice:'continue',method:'繼續原先休息',change:{kind:'none',detail:''}}));
  const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,200);assert.ok((await trace(op.operationId)).steps.some(x=>x.kind==='npc-method-assessment'));assert.equal((await s.read()).characters[0].plan.startedAt,plan.startedAt);
  const automatic={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(automatic)).status,200);assert.ok(!(await trace(automatic.operationId)).steps.some(x=>x.kind==='npc-method-assessment'));assert.equal(s.counts().npc,2);assert.deepEqual((await s.read()).characters[0].intents,[intent]);
 }finally{s.restore();}
});

test('unknown stale private references and mechanically inconsistent action or intent links roll back without paid repair',async()=>{
 for(const invalid of [
  {knownResults:[{kind:'short',id:'PRIVATE-TRACE',version:1}]},
  {knownResults:[{kind:'short',id:'legacy:owner:memory:0:1260',version:99}]},
  {selectedAction:{type:'propose',target:'tools'}},
  {intentIds:['never-submitted']},
  {choice:'continue'},
 ]){
  const s=await scenario({decision:wire(rest,invalid)});
  try{
   const before=await s.read(),op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};const response=await s.post(op);assert.equal(response.status,502);const saved=await s.read();assert.deepEqual(saved.characters,before.characters);assert.equal(saved.aiUsage.totalCalls,1);const calls=s.counts();await s.post(op);assert.deepEqual(s.counts(),calls);assert.equal((await trace(op.operationId)).outcome,'rolled-back');
  }finally{s.restore();}
 }
});

test('later NPC errors and save conflict keep assessment candidate trace separate from the rolled-back world',async()=>{
 for(const fault of ['later','save']){
  const s=await scenario({decision:wire(rest),modify:w=>{if(fault==='later'){const peer=structuredClone(w.characters[0]);peer.id='peer';peer.shortTerm=[];peer.longTerm=[];peer.memories=[];peer.observations=[];delete peer.control;w.characters.push(peer);}}}),transport=global.fetch;
  global.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.self?.id==='peer')return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:'{"bad":true}'}}]});return transport(url,init);};
  try{
   const before=await s.read();if(fault==='save')load('store').conflictOnNextSave();const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,502);assert.deepEqual((await s.read()).characters,before.characters);const saved=await trace(op.operationId);assert.equal(saved.outcome,fault==='save'?'not-committed':'rolled-back');assert.ok(saved.steps.some(x=>x.kind==='npc-method-assessment'));const calls=s.counts();await s.post(op);assert.deepEqual(s.counts(),calls);
  }finally{s.restore();}
 }
});

test('the disclosed assessment UTF-8 byte boundary accepts 2048 and rejects 2049 without another dispatch',async()=>{
 for(const bytes of [2048,2049]){
  const candidate=wire(rest,{purpose:'目'.repeat(250),method:'法'.repeat(240),reason:'',change:{kind:'none',detail:'界'.repeat(70)}});
  const padding=bytes-Buffer.byteLength(JSON.stringify(candidate.methodAssessment));assert.ok(padding>=0&&padding<=256);candidate.methodAssessment.reason='r'.repeat(padding);assert.equal(Buffer.byteLength(JSON.stringify(candidate.methodAssessment)),bytes);
  const s=await scenario({decision:candidate});
  try{
   const before=await s.read(),op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,bytes===2048?200:502);
   const request=s.inputs.find(x=>x.input.self).request;assert.match(request.messages[0].content,/methodAssessment.*2048 bytes/);const validate=new Ajv().compile(request.response_format.json_schema.schema);assert.equal(validate(candidate),true,JSON.stringify(validate.errors));
   if(bytes===2049)assert.deepEqual((await s.read()).characters,before.characters);assert.equal(s.counts().npc,1);assert.equal(s.counts().judgments,0);const counts=s.counts();await s.post(op);assert.deepEqual(s.counts(),counts);
  }finally{s.restore();}
 }
});

test('v2 phone action and sourced arrangement share one assessed decision and atomic replay',async()=>{
 const source={id:'want-later',characterId:'owner',version:1,time:1200,text:'我想稍後再試另一種方法。',source:{kind:'experience'}};
 const s=await scenario({decision:wire(rest),modify:w=>{w.characters[0].shortTerm=[source];w.characters[0].memories=[];}});
 try{
  // Establish the real phone baseline through the public advance, then use the
  // identity actually provisioned by the world rather than inventing a device.
  await advance(s);const before=await s.read(),device=before.phones.devices[0];
  const reference={kind:'short',id:source.id,version:1};
  const action={...rest,type:'phone',target:device.objectId,content:JSON.stringify({collection:'memos',operation:'create',id:'retry-note',version:0,text:'稍後改用另一種方法。'}),timeIntent:{kind:'completion',maxMinutes:null},arrangementUpdates:[{operation:'upsert',id:'try-later',version:0,text:'稍後重試',condition:{kind:'time',minute:before.minute+60},references:[reference],reason:'我想稍後再試'}]};
  const candidate=wire(action,{choice:'switch',knownResults:[reference],change:{kind:'preparation',detail:'先保存筆記與稍後安排'}});s.choose(candidate);
  const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};
  const response=await s.post(op);assert.equal(response.status,200,await response.clone().text());
  const actual=s.inputs.filter(x=>x.input.self).at(-1),schema=actual.request.response_format.json_schema.schema;
  assert.equal(actual.input.contractVersion,'npc-decision.v2');assert.ok(actual.input.self.lastKnownState.entries.some(x=>x.reference.id===source.id));
  const validate=new Ajv().compile(schema);assert.equal(validate(candidate),true,JSON.stringify(validate.errors));
  const saved=await s.read();assert.equal(saved.phones.devices[0].memos[0].text,'稍後改用另一種方法。');assert.equal(saved.characters[0].arrangements.items[0].text,'稍後重試');assert.equal(saved.minute,before.minute+15);
  assert.ok((await trace(op.operationId)).steps.some(x=>x.kind==='npc-method-assessment'&&x.data.methodAssessment.selectedAction.type==='phone'));
  const counts=s.counts();await s.post(op);assert.deepEqual(s.counts(),counts);assert.equal(counts.npc,2);assert.equal(counts.judgments,0);
  assert.deepEqual((await s.read()).phones,saved.phones);
 }finally{s.restore();}
});
