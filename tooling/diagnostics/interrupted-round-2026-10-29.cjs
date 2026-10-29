/* Diagnostic only. Synthetic transport, isolated SQLite, controlled time.
 * Not proof that the production Worker died at this boundary. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { fork } = require('node:child_process');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET } = load('route');
const store = load('store');
const { scenario, proposal } = require('../../tests/routine-program-fixture.cjs');
const instant = 1793246600000;
const operation = { operation:'advance', minutes:15, operationId:instant + ':00000000-0000-4000-8000-000000000001' };
const lookup = async () => (await (await GET(new Request('https://test.invalid/api/world?operationId=' + operation.operationId))).json());
const response = () => Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify({...proposal,type:'rest',target:'',content:'Synthetic rest'})}}]});

async function child() {
  Date.now = () => instant;
  const s = await scenario();
  let receivedCandidate = false, sent = 0;
  global.fetch = async () => { sent++; return response(); };
  store.onStorage(async (sql, values) => {
    let parsedInMemory=false;
    if (sql.startsWith('INSERT INTO decision_traces') || sql.startsWith('UPDATE decision_traces')) {
      const trace = JSON.parse(values[sql.startsWith('INSERT') ? 5 : 0]);
      if (trace.lastKnownStage === 'candidate-received') receivedCandidate = true;
      parsedInMemory=trace.steps.some(x=>x.kind==='npc-parsed');
    }
    // This guard follows the awaited candidate checkpoint. SQL below verifies
    // the checkpoint really reached SQLite before this process is terminated.
    const boundary=process.env.DIAGNOSTIC_CRASH_POINT||'before-validation';
    if (receivedCandidate && (boundary==='after-validation'?parsedInMemory:sql.startsWith('SELECT locked_until, version'))) {
      store.onStorage(undefined);
      const db = store.database();
      const world = await db.prepare('SELECT * FROM worlds WHERE owner = ?').bind('test-owner').first();
      const traces = (await db.prepare('SELECT * FROM decision_traces WHERE owner = ?').bind('test-owner').all()).results;
      assert.equal(JSON.parse(traces[0].body).lastKnownStage, 'candidate-received');
      process.send({world,traces,sent,boundary,parsedInMemory}, () => process.exit(0));
      await new Promise(() => {});
    }
  });
  const result=await s.post(operation);
  throw Error('termination boundary was not reached; HTTP '+result.status+' '+(await result.json()).error);
}

async function main() {
  let now = instant;
  Date.now = () => now;
  const captured = await new Promise((resolve,reject) => {
    const p = fork(__filename, ['--terminated-worker'], {stdio:['ignore','ignore','pipe','ipc']});
    let snapshot, errors='';
    p.stderr.on('data', x => errors += x);
    p.on('message', x => snapshot=x);
    p.on('exit', code => code===0 && snapshot ? resolve(snapshot) : reject(Error('fixture child failed: '+code+' '+errors)));
    p.on('error', reject);
  });
  const s = await scenario();
  try {
    // Restore only the rows actually persisted by the terminated process into
    // a fresh isolated SQLite instance. No candidate world or RAM ledger.
    const db = store.database(), w = captured.world;
    await db.prepare('UPDATE worlds SET state = ?, version = ?, locked_until = ?, operations = ? WHERE owner = ?').bind(w.state,w.version,w.locked_until,w.operations,'test-owner').run();
    for (const row of captured.traces) {
      await db.prepare('INSERT INTO decision_traces (owner,context_id,operation_id,request_id,created_at,body,bytes) VALUES (?,?,?,?,?,?,?)').bind(row.owner,row.context_id,row.operation_id,row.request_id,row.created_at,row.body,row.bytes).run();
    }
    let redispatches=0;
    global.fetch = async () => { redispatches++; throw Error('unexpected redispatch'); };
    const pending = await lookup();
    assert.equal(pending.operation.state,'pending');
    const d = pending.decisionTrace.dispatches[0];
    assert.equal(d.usage.inputTokens,30);
    assert.equal(d.stage,'candidate-received');
    assert.equal(pending.decisionTrace.checkpoints.at(-1).completedAt,undefined);
    now=w.locked_until+1;
    assert.equal((await lookup()).operation.state,'uncertain');
    const r=await s.post(operation), first=await r.json();
    assert.equal(r.status,502); assert.equal(first.operationUncertain,true);
    const final=await lookup();
    assert.equal(final.operation.state,'uncertain'); assert.equal(final.operation.evidence,null);
    assert.equal(final.world.turn,0); assert.equal(final.version,w.version);
    assert.equal(final.decisionTrace.dispatches.length,1);
    assert.equal((await s.post(operation)).status,502);
    assert.equal(redispatches,0);
    assert.deepEqual(await (await s.post(operation)).json(),first);
    assert.deepEqual((await lookup()).world.aiUsage,final.world.aiUsage,'same-ID recovery must not count the same dispatch twice');
    console.log('INTERRUPTED_ROUND '+JSON.stringify({injected:'process exit',boundary:captured.boundary,parsedInMemory:captured.parsedInMemory,sent:captured.sent,redispatches,stage:d.stage,state:final.operation.state,status:r.status,evidence:final.operation.evidence,traceKnownTokens:d.usage.inputTokens+d.usage.outputTokens,totalCalls:final.world.aiUsage.totalCalls,totalInputTokens:final.world.aiUsage.totalInputTokens,turn:final.world.turn,version:final.version}));
    assert.equal(final.world.aiUsage.totalCalls,1,'RED: durable known usage is absent from world cumulative totals after same-ID expiry recovery');
    assert.equal(final.world.aiUsage.totalInputTokens,30);
    assert.equal(final.world.aiUsage.totalOutputTokens,10);
  } finally { s.restore(); }
}
if(process.argv.includes('--terminated-worker')) child().catch(e=>{console.error(e.message);process.exit(1);});
else require('node:test')('known usage survives an interrupted worker and original-ID recovery',main);
