/* eslint-disable @typescript-eslint/no-require-imports -- Public adjudication contract boundary. */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=load('world'),{parseEffectCandidate,effectCandidateSchema,effectRules}=load('adjudication-contract');
const effect={kind:'materialize',supplyId:'meal',expectedRemaining:1};
const accepted={status:'accepted',effects:[effect],check:null,stages:[],branches:null,completionMinutes:15};
test('public candidate parsing is world-independent and preserves explicit legal and illegal boundary cases',()=>{
 const world=seedWorld(),before=structuredClone(world);
 for(const [minutes,expected] of [[.1,15],[15,15],[15.1,30],[90,90]])assert.equal(parseEffectCandidate(JSON.stringify({...accepted,completionMinutes:minutes})).confirmedDurationMinutes,expected);
 for(const minutes of [0,-1,1440.1,'15'])assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,completionMinutes:minutes})));
 for(const status of ['denied','unsupported'])assert.equal(parseEffectCandidate(JSON.stringify({status,effects:[],check:null})).status,status);
 assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,status:'maybe'})));
 assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,effects:[{kind:'world-patch',value:{}}]})));
 assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,effects:Array(5).fill(effect)})));
 assert.deepEqual(world,before);
 assert.equal(effectCandidateSchema.properties.completionMinutes.anyOf[1].maximum,1440);
 assert.deepEqual(effectCandidateSchema.properties.status.enum,['accepted','denied','unsupported']);
 assert.ok(effectRules.some(rule=>rule.includes('1440')&&rule.includes('15')));
});
test('the world API sends the centralized free contract and executes only after current authority validation',async()=>{
 const {POST,GET}=load('route'),store=load('store');
 const w=seedWorld();w.characters=[w.characters[0],w.characters.find(c=>c.id==='owner')];w.characters[1].control={mode:'taken-over'};w.adjudication={provider:'openai',model:'gpt-6-luna'};
 w.supplies=[{id:'meal',label:'餐點',region:'kris-home-main',remaining:1,owner:'cass',knownTo:['cass'],allowedTo:['cass'],kind:'food',initialState:{}}];
 store.install(w);const request=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
 const original=global.fetch;let captured;
 global.fetch=async(_url,init)=>{
  const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);
  if(input.contractVersion==='world-adjudication.v1'){
   captured={input,schema:body.response_format.json_schema.schema};
   return Response.json({usage:{prompt_tokens:10,completion_tokens:2},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{...accepted,routine:null}))}}]});
  }
  return Response.json({usage:{prompt_tokens:10,completion_tokens:2},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{type:'propose',target:'meal',content:'拿這份餐點',purpose:'吃飯',mood:'平靜',durationMinutes:15,intents:[]}))}}]});
 };
 try{
  await POST(request({operation:'set-model-key',mode:'openai',key:'fixture-key'}));
  const response=await POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));
  assert.equal(response.status,200,await response.clone().text());
  assert.deepEqual(captured.schema.properties.status.enum,['accepted','denied','unsupported']);
  assert.equal(captured.schema.properties.completionMinutes.anyOf[1].maximum,1440);
  assert.ok(captured.input.effectRules.some(rule=>rule.includes('共同界線')&&rule.includes('1440')));
  assert.equal(nonPhoneObjects((await (await GET()).json()).world)[0].id,'meal:1');
  assert.equal(nonPhoneObjects(store.snapshot())[0].id,'meal:1');
  assert.equal(store.snapshot().supplies[0].remaining,0);
 }finally{global.fetch=original;}
});
test('routine approval parsing returns a candidate without binding or changing an existing world',()=>{
 const contract=load('adjudication-contract'),{approval}=require('./routine-program-fixture.cjs');
 const world=seedWorld(),before=structuredClone(world),raw=approval();
 const parsed=contract.parseAdjudicationCandidate(JSON.stringify(raw));
 assert.equal(parsed.kind,'routine');assert.equal(parsed.approval.version,2);
 assert.deepEqual(parsed.approval.timings,raw.routine.timings);
 assert.deepEqual(world,before);
 for(const mutate of [v=>{v.completionMinutes=15;},v=>{v.routine.timings[0].minutes=0;},v=>{v.routine.timings.push(v.routine.timings[0]);},v=>{v.effects=[effect];}]){
  const invalid=structuredClone(raw);mutate(invalid);assert.throws(()=>contract.parseAdjudicationCandidate(JSON.stringify(invalid)));assert.deepEqual(world,before);
 }
});
test('denied candidates cannot request a die and the shared ability bound applies to ordinary and result candidates',()=>{
 for(const status of ['denied','unsupported'])assert.throws(()=>parseEffectCandidate(JSON.stringify({status,effects:[],check:{difficulty:12,ability:'處理'}})));
 for(const ability of ['', 'x'.repeat(101)])assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,check:{difficulty:12,ability}})));
 assert.equal(parseEffectCandidate(JSON.stringify({...accepted,check:{difficulty:12,ability:'x'.repeat(100)}})).check.ability.length,100);
});
test('pure completion candidates reject a final phase contradicting their confirmed time',()=>{
 const staged={...accepted,effects:[],stages:[{afterMinutes:30,preconditions:[],effects:[effect]}]};
 assert.throws(()=>parseEffectCandidate(JSON.stringify(staged)));
 assert.equal(parseEffectCandidate(JSON.stringify({...staged,completionMinutes:30})).stages.at(-1).afterMinutes,30);
});
test('pure routine parsing verifies an offered scope without receiving mutable world references',()=>{
 const {parseAdjudicationCandidate}=load('adjudication-contract'),{approval}=require('./routine-program-fixture.cjs');
 const candidate=approval(),offered=['tea','coffee','food','drink','wash','return'];
 assert.equal(parseAdjudicationCandidate(JSON.stringify(candidate),{routineOperations:offered}).kind,'routine');
 assert.throws(()=>parseAdjudicationCandidate(JSON.stringify(candidate),{routineOperations:[]}));
 assert.throws(()=>parseAdjudicationCandidate(JSON.stringify(candidate),{routineOperations:['tea']}));
 const one=structuredClone(candidate);one.routine.timings=one.routine.timings.slice(0,1);one.routine.programs=one.routine.programs.slice(0,1);
 assert.equal(parseAdjudicationCandidate(JSON.stringify(one),{routineOperations:['tea']}).kind,'routine');
});

test('bounded model explanations remain self-reported evidence for allowed, denied, and unsupported candidates without inventing legacy reasons',()=>{
 const explanation={summary:'杯中原已有茶，因此不再填入。',facts:[{reference:'objects.ordinary-mug.state.contents',value:'tea'}]};
 for(const status of ['denied','unsupported','accepted']){
  const input=status==='accepted'?accepted:{status,effects:[],check:null};
  assert.deepEqual(parseEffectCandidate(JSON.stringify({...input,explanation})).explanation,explanation);
 }
 assert.equal(parseEffectCandidate(JSON.stringify(accepted)).explanation,undefined);
 assert.equal(parseEffectCandidate(JSON.stringify({...accepted,explanation:null})).explanation,undefined);
 for(const invalid of [{...explanation,summary:'x'.repeat(513)},{...explanation,facts:Array(9).fill(explanation.facts[0])},{summary:'',facts:[]},{...explanation,facts:[{reference:'x',value:'x'.repeat(257)}]},{...explanation,thoughts:'private chain'}])assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,explanation:invalid})));
 const contract=load('adjudication-contract'),{approval}=require('./routine-program-fixture.cjs');
 assert.deepEqual(contract.parseAdjudicationCandidate(JSON.stringify({...approval(),explanation})).explanation,explanation);
 assert.equal(contract.parseAdjudicationCandidate(JSON.stringify(approval())).explanation,undefined);
 assert.equal(effectCandidateSchema.properties.explanation.anyOf[1].properties.summary.maxLength,512);
 assert.ok(effectRules.some(rule=>rule.includes('模型自述')&&rule.includes('內部思考')));
});
