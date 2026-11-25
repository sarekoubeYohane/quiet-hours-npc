/* eslint-disable @typescript-eslint/no-require-imports -- One repair turn for candidates that fail format validation. */
const {fixtureDecision,fixturePursuitDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET}=load('route'),{scenario,proposal,approval}=require('./routine-program-fixture.cjs');
const lookup=async id=>(await(await GET(new Request('https://test.invalid/api/world?operationScope=test-owner&operationId='+encodeURIComponent(id)))).json());
const operation=()=>({operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()});
const invalidDecision={...proposal,memorySelections:[{id:'unknown-ref',version:1,reason:'保留'}]};
const invalidApproval=()=>({...approval(),completionMinutes:15});
// `npc` and `judge` return the candidate for the nth call of that task; requests are kept for inspection.
async function run({repair=true,npc=()=>proposal,judge=()=>approval()}={}){
 const s=await scenario(),op=operation(),before=await s.read(),requests={npc:[],judge:[]};
 global.fetch=async(_url,init)=>{
  const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content),adjudication=input.contractVersion==='world-adjudication.v1';
  const list=adjudication?requests.judge:requests.npc;list.push(request);
  const candidate=adjudication?fixturePursuitDecision(input,judge(list.length)):fixtureDecision(input,npc(list.length));
  return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(candidate)}}]});
 };
 if(repair)globalThis.__FORMAT_REPAIR__='1';
 try{
  const response=await s.post(op),body=await response.json(),data=await lookup(op.operationId);
  const replay=await s.post(op);
  return {status:response.status,body,replay:await replay.json(),trace:data.decisionTrace,world:data.world,before,requests};
 }finally{delete globalThis.__FORMAT_REPAIR__;s.restore();}
}
const unchanged=(world,before)=>{const actual=structuredClone(world),expected=structuredClone(before);delete actual.aiUsage;delete expected.aiUsage;assert.deepEqual(actual,expected);};
const tasks=trace=>trace.dispatches.map(dispatch=>dispatch.task+(dispatch.failure?':'+dispatch.failure.kind:''));

test('an NPC decision that fails validation is shown its own reply and the validation error once, and the corrected decision commits', async()=>{
 const r=await run({npc:call=>call===1?invalidDecision:proposal});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.requests.npc.length,2);assert.equal(r.requests.judge.length,1);
 const [first,second]=r.requests.npc;
 assert.equal(first.messages.length,2);
 assert.deepEqual(second.messages.slice(0,2),first.messages);
 assert.equal(second.messages[2].role,'assistant');
 assert.deepEqual(JSON.parse(second.messages[2].content).memorySelections,invalidDecision.memorySelections);
 const repair=JSON.parse(second.messages[3].content);
 assert.equal(second.messages[3].role,'user');assert.equal(repair.validationFailed,true);
 assert.match(repair.validationError,/欄位 memorySelections.*收到.*預期/);
 assert.equal(repair.validationError,r.trace.dispatches[0].failure.detail);
 assert.equal(r.trace.outcome,'committed');
 assert.deepEqual(tasks(r.trace),['npc:candidate-validation','npc','adjudication']);
 assert.equal(r.world.aiUsage.totalCalls,3);
 assert.equal(r.requests.npc.length+r.requests.judge.length,3,'replaying the operation dispatches nothing');
});

test('an NPC decision that is still invalid after its one repair turn fails the round with every paid attempt recorded', async()=>{
 const r=await run({npc:()=>invalidDecision});
 assert.equal(r.status,502);
 assert.equal(r.requests.npc.length,2);assert.equal(r.requests.judge.length,0);
 assert.equal(r.trace.outcome,'rolled-back');
 assert.deepEqual(tasks(r.trace),['npc:candidate-validation','npc:candidate-validation']);
 assert.equal(r.body.error,r.trace.dispatches[1].failure.detail);
 unchanged(r.world,r.before);
 assert.equal(r.world.aiUsage.totalCalls,2);
 assert.deepEqual(r.replay,r.body);
});

test('a world adjudication refused by the format check gets one repair turn before anything is bound, and the corrected candidate commits', async()=>{
 const r=await run({judge:call=>call===1?invalidApproval():approval()});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.requests.npc.length,1);assert.equal(r.requests.judge.length,2);
 const [first,second]=r.requests.judge;
 assert.equal(first.messages.length,2);
 assert.deepEqual(second.messages.slice(0,2),first.messages);
 assert.equal(second.messages[2].role,'assistant');
 assert.equal(JSON.parse(second.messages[2].content).completionMinutes,15);
 const repair=JSON.parse(second.messages[3].content);
 assert.equal(repair.validationFailed,true);assert.equal(repair.validationError,'日常耗時須由整組規則確認。');
 assert.equal(r.trace.outcome,'committed');
 assert.deepEqual(tasks(r.trace),['npc','adjudication','adjudication']);
 const retry=r.trace.steps.filter(step=>step.kind==='adjudication-format-retry');
 assert.equal(retry.length,1);assert.deepEqual(retry[0].data,{message:'日常耗時須由整組規則確認。'});
 assert.equal(r.world.aiUsage.totalCalls,3);
});

test('a world adjudication that is still refused after its one repair turn fails the round without changing the world', async()=>{
 const r=await run({judge:()=>invalidApproval()});
 assert.equal(r.status,502);
 assert.equal(r.requests.judge.length,2);
 assert.equal(r.trace.outcome,'rolled-back');
 const failure=r.trace.steps.find(step=>step.kind==='round-failure');
 assert.equal(failure.data.validation.reason,'candidate_format');
 assert.equal(failure.data.message,'日常耗時須由整組規則確認。');
 unchanged(r.world,r.before);
 assert.equal(r.world.aiUsage.totalCalls,3);
 assert.deepEqual(r.replay,r.body);
});

test('without the build opt-in an invalid candidate fails after a single dispatch, as before', async()=>{
 const npc=await run({repair:false,npc:()=>invalidDecision});
 assert.equal(npc.status,502);assert.equal(npc.requests.npc.length,1);
 const judged=await run({repair:false,judge:()=>invalidApproval()});
 assert.equal(judged.status,502);assert.equal(judged.requests.judge.length,1);
 assert.equal(judged.trace.steps.some(step=>step.kind==='adjudication-format-retry'),false);
});
