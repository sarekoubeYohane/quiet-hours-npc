/* Diagnostic only: synthetic replies, virtual elapsed time, existing API/SQLite seam.
 * No product fix. Reproduce RED with DEADLINE_EXPECT_COMPLETE=1.
 * Run via tests/run-activities.mjs, with tooling/verification/no-network.mjs preloaded.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = n => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, n + '.cjs'));
const { GET } = load('route');
const store = load('store');
const { scenario } = require('../../../../tests/routine-program-fixture.cjs');

function clock() {
  const originalNow = Date.now, originalTimeout = AbortSignal.timeout;
  let now = originalNow(), queue = [], signals = [];
  Date.now = () => now;
  const sleep = ms => new Promise(resolve => queue.push({at: now + ms, run: resolve}));
  AbortSignal.timeout = ms => {
    const c = new AbortController();
    signals.push({at: now, ms});
    queue.push({at: now + ms, run: () => c.abort(new DOMException('fixture deadline', 'TimeoutError'))});
    return c.signal;
  };
  return { signals, sleep, async run(work) {
    let done = false, value, error;
    work.then(v => {value = v; done = true;}, e => {error = e; done = true;});
    for(let i = 0; !done && i < 10000; i++) {
      await new Promise(resolve => setImmediate(resolve));
      if(done) break;
      queue.sort((a,b) => a.at - b.at);
      const next = queue.shift();
      if(next) {now = next.at; next.run();}
    }
    assert.ok(done, 'virtual clock did not settle API operation');
    if(error) throw error;
    return value;
  }, restore() {Date.now = originalNow; AbortSignal.timeout = originalTimeout;} };
}
const cases = [
  {name:'cumulative-body', latency:14000, last:'body', expected:502},
  {name:'cumulative-dispatch', latency:14000, last:'dispatch', expected:502},
  {name:'fast-control', latency:12000, last:'body', expected:200},
  {name:'storage-pressure', latency:12000, last:'body', checkpoint:400, expected:502},
  {name:'three-actor-control', latency:14000, last:'body', actors:3, expected:200},
  {name:'single-call-control', latency:14000, last:'body', actors:1, expected:200},
];
for(const config of cases) test(config.name, async () => {
  const c = clock();
  let s, writes = 0, sent = 0, lease, leaseObservedAt;
  const wire = [];
  try {
    s = await scenario({modify:w => {
      const owner = w.characters[0];
      w.characters = Array.from({length:config.actors || 4}, (_,i) => ({...structuredClone(owner), id:i ? 'actor-'+i : 'owner', name:'Synthetic '+i, shortTerm:[], longTerm:[], memories:[], memoryTrace:[], observations:[]}));
      w.playerBudget = {calls:null,tokens:null};
    }});
    const before = await s.read();
    const hook = async () => {
      writes++;
      if(lease === undefined) {lease = (await store.database().prepare('SELECT locked_until FROM worlds WHERE owner = ?').bind('test-owner').first()).locked_until; leaseObservedAt = Date.now();}
      store.onNextTraceWrite(hook);
      if(config.checkpoint) await c.sleep(config.checkpoint);
    };
    store.onNextTraceWrite(hook);
    global.fetch = async (_url, init) => {
      const index = ++sent, input = JSON.parse(JSON.parse(init.body).messages[1].content);
      const adjudication = input.contractVersion === 'world-adjudication.v1';
      wire.push({index, task:adjudication?'adjudication':'npc', at:Date.now()});
      const result = adjudication
        ? {status:'denied',effects:[],stages:[],check:null,routine:null}
        : {type:'propose',target:'tools',content:'Inspect synthetic tool',purpose:'inspect',mood:'calm',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]};
      const body = JSON.stringify({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(result)}}]});
      if(index === (config.actors || 4)*2 && config.last === 'body') {
        return new Response(new ReadableStream({async pull(controller) {
          await c.sleep(config.latency);
          if(init.signal.aborted) controller.error(init.signal.reason);
          else {controller.enqueue(new TextEncoder().encode(body));controller.close();}
        }}, {highWaterMark:0}), {status:200});
      }
      await c.sleep(config.latency);
      if(init.signal.aborted) throw init.signal.reason;
      return new Response(body,{status:200});
    };
    const op = {operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};
    const response = await c.run(s.post(op)), first = await response.json();
    store.onNextTraceWrite(() => {});
    const saved = await (await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(op.operationId)))).json();
    const trace = saved.decisionTrace, last = trace.dispatches.at(-1);
    const failure = trace.steps.find(x => x.kind === 'round-failure');
    const summary = {case:config.name,status:response.status,calls:sent,traceWrites:writes,leaseObservedAtOffset:leaseObservedAt-trace.acceptedAt,leaseOffset:lease-trace.acceptedAt,
      wireOffsets:wire.map(x=>x.at-trace.acceptedAt),signalOffsets:c.signals.map(x=>x.at-trace.acceptedAt),signalBudgets:c.signals.map(x=>x.ms),
      lastWireRemainingMs:c.signals.at(-1).at+c.signals.at(-1).ms-wire.at(-1).at,headers:last.httpStatus||null,
      failure:last.failure||null,failureOffset:failure?failure.at-trace.acceptedAt:null,turn:saved.world.turn,outcome:trace.outcome,
      knownTokens:saved.world.aiUsage.totalInputTokens+saved.world.aiUsage.totalOutputTokens,unknownCalls:saved.world.aiUsage.totalUnknownCalls};
    console.log('DEADLINE_DIAGNOSTIC '+JSON.stringify(summary));
    assert.equal(sent, (config.actors||4)*2, 'must reach the final adjudication');
    const expectComplete = process.env.DEADLINE_EXPECT_COMPLETE === '1' && config.name === 'cumulative-body';
    assert.equal(response.status,expectComplete?200:config.expected,expectComplete?'RED: four sequential NPC/adjudication pairs at 14s each should have a viable round budget; final body is cut short':config.name);
    if(response.status === 502) {
      assert.equal(last.failure.kind,'timeout');
      assert.equal(last.failure.stage,config.last === 'body'?'response-body':'dispatch');
      assert.equal(last.responseBody,undefined);assert.equal(last.usage,undefined);
      const story = w => {const copy=structuredClone(w);delete copy.aiUsage;return copy;};
      assert.deepEqual(story(saved.world),story(before),'whole story rolls back');
      assert.equal(saved.world.aiUsage.totalInputTokens,((config.actors||4)*2-1)*30);assert.equal(saved.world.aiUsage.totalOutputTokens,((config.actors||4)*2-1)*10);
      assert.equal(saved.world.aiUsage.totalUnknownCalls,1);assert.equal(trace.outcome,'rolled-back');
    } else {assert.equal(saved.world.turn,before.turn+1);assert.equal(trace.outcome,'committed');}
    const calls=sent, second=await s.post(op);
    assert.equal(second.status,response.status);assert.deepEqual(await second.json(),first);assert.equal(sent,calls,'same ID must not redispatch');
  } finally {store.onNextTraceWrite(()=>{});s?.restore();c.restore();}
});
