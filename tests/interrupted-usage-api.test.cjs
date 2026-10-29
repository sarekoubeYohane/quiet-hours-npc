/* eslint-disable @typescript-eslint/no-require-imports */
/* Diagnostic only. Synthetic transport, isolated SQLite, controlled time.
 * Not proof that the production Worker died at this boundary. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { fork } = require('node:child_process');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET } = load('route');
const store = load('store');
const { scenario, proposal, approval } = require('./routine-program-fixture.cjs');
const instant = 1793246600000;
const operation = { operation:'advance', minutes:15, operationId:instant + ':00000000-0000-4000-8000-000000000001' };
const lookup = async () => (await (await GET(new Request('https://test.invalid/api/world?operationId=' + operation.operationId))).json());
const response = () => Response.json({usage:{prompt_tokens:30,completion_tokens:10,...(process.env.CRASH_CACHE==='yes'?{prompt_tokens_details:{cached_tokens:5}}:{})},choices:[{message:{content:JSON.stringify({...proposal,type:'rest',target:'',content:'Synthetic rest'})}}]});

async function child() {
  Date.now = () => instant;
  const s = await scenario({modify:w=>{w.playerBudget={calls:null,tokens:null};w.modelPrices=[{id:'crash-price',provider:'openai',model:'gpt-6-luna',input:1,output:2,cachedInput:.5,source:'synthetic',date:'2026-10-29',custom:true,savedAt:instant}];if(process.env.CRASH_ADJ==='yes')w.modelPrices.push({id:'world-crash-price',provider:'openai',model:'fixture-world',input:3,output:4,source:'synthetic',date:'2026-10-29',custom:true,savedAt:instant});if(process.env.CRASH_CALLS==='2'&&process.env.CRASH_ADJ!=='yes'){const second=structuredClone(w.characters[0]);second.id='second';second.shortTerm=[];second.longTerm=[];second.memories=[];second.memoryTrace=[];second.observations=[];delete second.cognition;delete second.control;w.characters.push(second);}}});
  let receivedCandidate = false, sent = 0;
  global.fetch = async () => { sent++;if(process.env.CRASH_ADJ==='yes')return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(sent===1?proposal:approval())}}]}); if(process.env.CRASH_PARTIAL==='yes'&&sent===2)return Response.json({choices:[{message:{content:JSON.stringify({...proposal,type:'rest',target:'',content:'Synthetic rest'})}}]});return response(); };
  store.onStorage(async (sql, values) => {
    let parsedInMemory=false;
    if (sql.startsWith('INSERT INTO decision_traces') || sql.startsWith('UPDATE decision_traces')) {
      const trace = JSON.parse(values[sql.startsWith('INSERT') ? 5 : 0]);
      if (trace.lastKnownStage === 'candidate-received'&&trace.dispatches.length===Number(process.env.CRASH_CALLS||1)) receivedCandidate = true;
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

async function interrupted(options={}) {
  const clock=Date.now;
  let now = instant;
  Date.now = () => now;
  const captured = await new Promise((resolve,reject) => {
    const p = fork(__filename, ['--terminated-worker'], {stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,...options}});
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
    now=w.locked_until+1;
    return {s,db,captured,read:lookup,operation,setNow:value=>{now=value;},restore:()=>{s.restore();Date.now=clock;},redispatches:()=>redispatches};
  } catch(error) {s.restore();Date.now=clock;throw error;}
}
if(process.argv.includes('--terminated-worker')) child().catch(e=>{console.error(e.message);process.exit(1);});
else {
 const test=require('node:test');
 const recover=async f=>{const response=await f.s.post(operation);assert.equal(response.status,502);return response.json();};
 for(const boundary of ['before-validation','after-validation'])test(`durable normal usage recovers after process exit ${boundary}, without changing receipt or story`,async()=>{
  const f=await interrupted({DIAGNOSTIC_CRASH_POINT:boundary});
  try{
   const before=await f.read(),receipt=await recover(f),saved=await f.read();
   assert.equal(saved.world.aiUsage.totalCalls,1);assert.equal(saved.world.aiUsage.totalInputTokens,30);assert.equal(saved.world.aiUsage.totalOutputTokens,10);
   assert.equal(saved.costSummary.total.knownUsd,.00005);assert.equal(saved.costSummary.total.complete,true);
   assert.equal(saved.world.turn,0);assert.equal(saved.version,before.version);assert.deepEqual(saved.world.objects,before.world.objects);
   assert.equal(saved.operation.evidence,null);assert.equal(saved.usageRecovery.status,'accounted');assert.equal(saved.usageRecovery.unknownRange,true);assert.equal(saved.unresolvedUsageRecovery,true);
   for(let n=0;n<3;n++)assert.deepEqual(await recover(f),receipt);
   assert.deepEqual((await f.read()).world,saved.world);assert.equal(f.redispatches(),0);
  }finally{f.restore();}
 });
 test('multiple dispatches restore historical price cohorts and stay out of a newer hourly window',async()=>{
  const f=await interrupted({CRASH_CALLS:'2'});
  try{f.setNow(instant+3600001);await recover(f);const saved=await f.read();assert.equal(saved.world.aiUsage.totalCalls,2);assert.equal(saved.world.aiUsage.totalInputTokens,60);assert.equal(saved.world.aiUsage.totalOutputTokens,20);assert.equal(saved.costSummary.total.knownUsd,.0001);assert.equal(saved.costSummary.total.cohorts[0].price.id,'crash-price');assert.equal(saved.world.aiUsage.calls,0);assert.equal(saved.costSummary.hour.knownUsd,0);}finally{f.restore();}
 });
 test('NPC and adjudication recover separate historical prices while cached tokens use their captured rate',async()=>{
  let f=await interrupted({CRASH_CALLS:'2',CRASH_ADJ:'yes'});
  try{await recover(f);const saved=await f.read();assert.equal(saved.world.aiUsage.totalCalls,2);assert.ok(Math.abs(saved.costSummary.total.knownUsd-.00018)<1e-12);assert.deepEqual(saved.costSummary.total.cohorts.map(c=>[c.task,c.price.id]),[['npc','crash-price'],['adjudication','world-crash-price']]);}finally{f.restore();}
  f=await interrupted({CRASH_CACHE:'yes'});
  try{await recover(f);const saved=await f.read();assert.ok(Math.abs(saved.costSummary.total.knownUsd-.0000475)<1e-12);assert.equal(saved.costSummary.total.cohorts[0].cachedInput,5);assert.equal(saved.costSummary.total.complete,true);}finally{f.restore();}
 });
 test('partially known dispatches preserve known usage and explicitly leave unknown token/cost scope',async()=>{
  const f=await interrupted({CRASH_CALLS:'2',CRASH_PARTIAL:'yes'});
  try{await recover(f);const saved=await f.read();assert.equal(saved.world.aiUsage.totalCalls,2);assert.equal(saved.world.aiUsage.totalInputTokens,30);assert.equal(saved.world.aiUsage.totalUnknownCalls,1);assert.equal(saved.costSummary.total.knownUsd,.00005);assert.equal(saved.costSummary.total.complete,false);assert.equal(saved.usageRecovery.knownCalls,1);assert.equal(saved.usageRecovery.unknownRange,true);}finally{f.restore();}
 });
 test('competing same-ID recoveries count once and preserve a newer story',async()=>{
  const f=await interrupted();
  try{const world=(await f.read()).world;world.turn=9;world.minute=999;store.replaceCommittedWorld(world);await Promise.all([recover(f),recover(f),recover(f)]);const saved=await f.read();assert.equal(saved.world.turn,9);assert.equal(saved.world.minute,999);assert.equal(saved.version,1);assert.equal(saved.world.aiUsage.totalCalls,1);assert.equal(saved.world.aiUsage.totalInputTokens,30);}finally{f.restore();}
 });
 test('storage failures leave an explicit pending scope and recover after storage returns',async()=>{
  const f=await interrupted();
  try{store.failNextTraceRead();await recover(f);let saved=await f.read();assert.equal(saved.world.aiUsage.totalCalls,0);assert.equal(saved.usageRecovery.unknownRange,true);await recover(f);saved=await f.read();assert.equal(saved.world.aiUsage.totalCalls,1);
   store.failNextTraceRead();saved=await f.read();assert.equal(saved.usageRecovery.status,'unavailable');assert.equal(saved.unresolvedUsageRecovery,true);
  }finally{f.restore();}
 });
 test('missing or evicted trace remains pending instead of zero-cost confirmation',async()=>{
  const f=await interrupted();
  try{await f.db.prepare('DELETE FROM decision_traces WHERE owner = ?').bind('test-owner').run();await recover(f);const saved=await f.read();assert.equal(saved.world.aiUsage.totalCalls,0);assert.equal(saved.usageRecovery.status,'pending');assert.equal(saved.usageRecovery.unknownRange,true);assert.equal(saved.unresolvedUsageRecovery,true);}finally{f.restore();}
 });
 test('legacy unchanged world recovers known tokens but never invents historical prices',async()=>{
  const f=await interrupted();
  try{const row=await f.db.prepare('SELECT operations FROM worlds WHERE owner = ?').bind('test-owner').first();const journal=JSON.parse(row.operations);delete journal.usage;await f.db.prepare('UPDATE worlds SET operations = ? WHERE owner = ?').bind(JSON.stringify(journal),'test-owner').run();
   const stored=await f.db.prepare('SELECT body FROM decision_traces WHERE owner = ? AND operation_id = ?').bind('test-owner',operation.operationId).first();const trace=JSON.parse(stored.body);delete trace.accounting;for(const d of trace.dispatches)delete d.price;await f.db.prepare('UPDATE decision_traces SET body = ?, bytes = ? WHERE owner = ? AND operation_id = ?').bind(JSON.stringify(trace),Buffer.byteLength(JSON.stringify(trace)),'test-owner',operation.operationId).run();
   await recover(f);const saved=await f.read();assert.equal(saved.world.aiUsage.totalCalls,1);assert.equal(saved.world.aiUsage.totalInputTokens,30);assert.equal(saved.costSummary.total.complete,false);assert.equal(saved.costSummary.total.cohorts[0].price,null);assert.equal(saved.costSummary.total.knownUsd,0);assert.equal(saved.usageRecovery.unknownRange,true);
  }finally{f.restore();}
 });
 test('an unavailable accounting write leaves the same receipt and can later recover exactly once',async()=>{
  const f=await interrupted();let failed=false;
  try{store.onStorage(async sql=>{if(sql.startsWith('UPDATE worlds SET state = ?, operations = ?')){failed=true;throw Error('synthetic write unavailable');}});const receipt=await recover(f);assert.equal(failed,true);assert.equal((await f.read()).world.aiUsage.totalCalls,0);assert.equal((await f.read()).usageRecovery.status,'pending');store.onStorage(undefined);assert.deepEqual(await recover(f),receipt);assert.equal((await f.read()).world.aiUsage.totalCalls,1);}finally{store.onStorage(undefined);f.restore();}
 });
 test('the original worker arriving after recovery cannot double-account or change an uncertain receipt',async()=>{
  const clock=Date.now;let now=instant;Date.now=()=>now;const s=await scenario({decision:{...proposal,type:'rest',target:'',content:'Synthetic rest'}});let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let candidate=false,paused=false;
  store.onStorage(async(sql,values)=>{if(sql.startsWith('UPDATE decision_traces')||sql.startsWith('INSERT INTO decision_traces')){const t=JSON.parse(values[sql.startsWith('INSERT')?5:0]);if(t.lastKnownStage==='candidate-received')candidate=true;}if(candidate&&!paused&&sql.startsWith('SELECT locked_until, version')){paused=true;entered();await gate;}});
  let running;
  try{running=s.post(operation);await ready;now=instant+430001;const receipt=await (await s.post(operation)).json();assert.equal(receipt.operationUncertain,true);assert.equal((await lookup()).world.aiUsage.totalCalls,1);release();await running;assert.deepEqual(await (await s.post(operation)).json(),receipt);const saved=await lookup();assert.equal(saved.world.aiUsage.totalCalls,1);assert.equal(saved.world.aiUsage.totalInputTokens,30);assert.equal(saved.world.turn,0);assert.equal(saved.usageRecovery.unknownRange,false);}finally{release();await running;store.onStorage(undefined);s.restore();Date.now=clock;}
 });
 test('evicting an unresolved receipt retains a bounded unknown-range warning',async()=>{
  const f=await interrupted();
  try{await recover(f);for(let n=0;n<9;n++){f.setNow(instant+440000+n);const response=await f.s.post({operation:'set-budget',limits:{calls:null,tokens:null},operationId:(instant+440000+n)+':'+crypto.randomUUID()});assert.equal(response.status,200);}
   const saved=await f.read();assert.equal(saved.operation.state,'expired');assert.equal(saved.unresolvedUsageRecovery,true);assert.equal(saved.world.aiUsage.totalCalls,1);await f.s.post(operation);assert.equal((await f.read()).world.aiUsage.totalCalls,1);
  }finally{f.restore();}
 });
 test('a legacy trace with changed story version cannot establish deduplication and is not guessed into totals',async()=>{
  const f=await interrupted();
  try{const row=await f.db.prepare('SELECT operations FROM worlds WHERE owner = ?').bind('test-owner').first();const journal=JSON.parse(row.operations);delete journal.usage;await f.db.prepare('UPDATE worlds SET operations = ?, version = version + 1 WHERE owner = ?').bind(JSON.stringify(journal),'test-owner').run();await recover(f);const saved=await f.read();assert.equal(saved.world.aiUsage.totalCalls,0);assert.equal(saved.usageRecovery.status,'legacy-unverifiable');assert.equal(saved.usageRecovery.unknownRange,true);}finally{f.restore();}
 });
}
