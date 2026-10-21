/* eslint-disable @typescript-eslint/no-require-imports -- Public adjudication contract boundary. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=load('world'),{parseEffectCandidate,effectCandidateSchema,effectRules}=load('adjudication-contract');
const effect={kind:'materialize',supplyId:'meal',expectedRemaining:1};
const accepted={status:'accepted',effects:[effect],check:null,stages:[],branches:null,completionMinutes:15};
test('public candidate parsing is world-independent and preserves explicit legal and illegal boundary cases',()=>{
 const world=seedWorld(),before=structuredClone(world);
 for(const [minutes,expected] of [[.1,15],[15,15],[15.1,30],[90,90]])assert.equal(parseEffectCandidate(JSON.stringify({...accepted,completionMinutes:minutes})).confirmedDurationMinutes,expected);
 for(const minutes of [0,-1,90.1,'15'])assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,completionMinutes:minutes})));
 for(const status of ['denied','unsupported'])assert.equal(parseEffectCandidate(JSON.stringify({status,effects:[],check:null})).status,status);
 assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,status:'maybe'})));
 assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,effects:[{kind:'world-patch',value:{}}]})));
 assert.throws(()=>parseEffectCandidate(JSON.stringify({...accepted,effects:Array(5).fill(effect)})));
 assert.deepEqual(world,before);
 assert.equal(effectCandidateSchema.properties.completionMinutes.anyOf[1].maximum,90);
 assert.deepEqual(effectCandidateSchema.properties.status.enum,['accepted','denied','unsupported']);
 assert.ok(effectRules.some(rule=>rule.includes('90')&&rule.includes('15')));
});
test('the world API sends the centralized free contract and executes only after current authority validation',async()=>{
 const {POST,GET}=load('route'),store=load('store');
 const w=seedWorld();w.characters=[w.characters[0],w.characters.find(c=>c.id==='owner')];w.characters[1].control={mode:'taken-over'};w.adjudication={provider:'openai',model:'gpt-6-luna'};
 w.supplies=[{id:'meal',label:'餐點',region:'kris-home-main',remaining:1,owner:'cass',knownTo:['cass'],allowedTo:['cass'],kind:'food',initialState:{}}];
 store.install(w);const request=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
 const original=global.fetch;let captured;
 global.fetch=async(_url,init)=>{
  const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);
  if(input.contractVersion==='world-adjudication.v1'){
   captured={input,schema:body.response_format.json_schema.schema};
   return Response.json({usage:{prompt_tokens:10,completion_tokens:2},choices:[{message:{content:JSON.stringify({...accepted,routine:null})}}]});
  }
  return Response.json({usage:{prompt_tokens:10,completion_tokens:2},choices:[{message:{content:JSON.stringify({type:'propose',target:'meal',content:'拿這份餐點',purpose:'吃飯',mood:'平靜',durationMinutes:15,intents:[]})}}]});
 };
 try{
  await POST(request({operation:'set-model-key',mode:'openai',key:'fixture-key'}));
  const response=await POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));
  assert.equal(response.status,200,await response.clone().text());
  assert.deepEqual(captured.schema.properties.status.enum,['accepted','denied','unsupported']);
  assert.equal(captured.schema.properties.completionMinutes.anyOf[1].maximum,90);
  assert.ok(captured.input.effectRules.some(rule=>rule.includes('共同界線')&&rule.includes('90')));
  assert.equal((await (await GET()).json()).world.objects[0].id,'meal:1');
  assert.equal(store.snapshot().objects[0].id,'meal:1');
  assert.equal(store.snapshot().supplies[0].remaining,0);
 }finally{global.fetch=original;}
});
