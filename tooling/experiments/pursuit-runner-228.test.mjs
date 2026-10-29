import '../../tooling/verification/no-network.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, runExperiment, runnerDigest, digest, readback } from './pursuit-runner-228.mjs';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from './pursuit-runtime-228.mjs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const {decision,upsert}=require('../../tests/pursuit-graph-fixture.cjs');
const {assess}=require('../../tests/pursuit-lifecycle-fixture.cjs');
const programs=require('../../tests/routine-world-programs-fixture.cjs');
const {search}=require('../../tests/routine-discovery-fixture.cjs');
async function registration(directory,mutate=()=>{}) {
  const plan=JSON.parse(await readFile('tooling/experiments/pursuits-220.json','utf8'));
  plan.implementationCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  plan.runnerSha256=await runnerDigest();
  const authorization={approved:true,reference:'synthetic-test-authorization-only',runId:crypto.randomUUID(),scope:'isolated-pursuit-220',payer:'pursuit-experiment-payer',expiresAt:Date.now()+600000,remaining:{calls:160,tokens:2000000,usd:1,elapsedMs:2700000}};
  const priceSnapshot={provider:'openai',model:'gpt-6-luna',source:'https://openai.com/api/pricing/',evidenceSha256:digest('SYNTHETIC TEST PRICE ONLY'),date:'2026-10-29',input:.0001,output:.0002};
  mutate({plan,authorization,priceSnapshot});authorization.planSha256=digest(JSON.stringify(plan));authorization.priceSha256=digest(JSON.stringify(priceSnapshot));
  const planPath=join(directory,'plan.json');await writeFile(planPath,JSON.stringify(plan));
  return {mode:'live',runDirectory:directory,planPath,authorization,priceSnapshot,controlledTransport:true,credential:async()=>'synthetic-credential-228'};
}

async function existingPayer(directory) {
  const runtime=await createRuntime({databasePath:join(directory,'world.sqlite')});
  const before=await(await runtime.get()).json();
  const result=await runtime.post({operation:'set-budget',mode:'openai',worldContext:before.world.contextId,operationId:Date.now()+':'+crypto.randomUUID(),limits:{calls:100,tokens:1000000}});
  assert.equal(result.status,200);await runtime.close();
}

test('default preflight reports missing finite authorization without reading credentials or forwarding', async () => {
  const result = await preflight();
  assert.equal(result.paidReady, false);
  assert.ok(result.missing.includes('finite-authorization'));
  assert.ok(result.missing.includes('official-price-snapshot'));
  assert.equal(result.realProviderCalls, 0);
});

test('default 12-call/30000-token payer can forward and stops at its original cumulative limit without refreshing its window',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pursuit-default-limits-'));
  try {
    const options=await registration(directory);let forwards=0;
    const result=await runExperiment({...options,providerFetch:async(_url,init)=>{forwards++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(decision(input,{duration:120}))}}]});}});
    assert.match(result.stopped,/player-limit|technical-error:429|technical-error:502/);assert.ok(forwards>0);assert.equal(result.trials.length,10);assert.ok(result.trials.some(t=>t.rounds>0));
    const view=await readback({runDirectory:directory});assert.equal(view.world.playerBudget,undefined);assert.equal(view.world.aiUsage.totalCalls,12);assert.equal(view.world.aiUsage.calls,12);
    const first=result.trials.find(t=>t.payerAfter)?.payerAfter.usage;assert.equal(view.world.aiUsage.windowStartedAt,first.windowStartedAt);
  }finally{await rm(directory,{recursive:true,force:true});}
});

for(const kind of ['calls','tokens','usd'])test('authorization '+kind+' is a lower hard ceiling than the plan and existing payer',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pursuit-min-'+kind+'-'));
  try{
    await existingPayer(directory);const options=await registration(directory,({authorization})=>{authorization.remaining[kind]=kind==='usd'?1e-15:1;});let forwards=0;
    const result=await runExperiment({...options,providerFetch:async(_url,init)=>{forwards++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(decision(input))}}]});}});
    assert.match(result.stopped,/dispatch-reserve-limit|technical-error:502/);assert.equal(forwards,kind==='calls'?1:0);
    const view=await readback({runDirectory:directory});assert.deepEqual(view.world.playerBudget,{calls:100,tokens:1000000});
  }finally{await rm(directory,{recursive:true,force:true});}
});

for(const failure of ['unknown-usage','stop','elapsed','key-echo','technical'])test('runner stops on '+failure+' and reopens only the original operation without another dispatch',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pursuit-stop-'+failure+'-'));
  try{
    await existingPayer(directory);const options=await registration(directory);let calls=0,offset=0;
    if(failure==='elapsed'){options.authorization.remaining.elapsedMs=10000;options.clock=()=>Date.now()+offset;}
    const result=await runExperiment({...options,providerFetch:async(_url,init)=>{
      calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content),value=decision(input,{duration:120});
      if(failure==='technical')throw Error('synthetic transport stopped');
      if(failure==='stop')await writeFile(join(directory,'STOP'),'synthetic user stop');
      if(failure==='elapsed')offset=20000;
      if(failure==='key-echo')value.action.content='synthetic-credential-228';
      return Response.json({...(failure==='unknown-usage'?{}:{usage:{prompt_tokens:30,completion_tokens:10}}),choices:[{message:{content:JSON.stringify(value)}}]});
    }});
    assert.equal(calls,1);assert.ok(result.stopped);
    const first=await readback({runDirectory:directory}),second=await readback({runDirectory:directory});
    assert.equal(first.state.pendingOperationId||first.state.lastOperationId,second.state.pendingOperationId||second.state.lastOperationId);assert.equal(first.world.turn,second.world.turn);assert.equal(calls,1);
    assert.equal(first.state.trials.length,10);assert.equal(first.modelKeys.openai.configured,false);
    for(const file of (await readdir(directory)).filter(file=>file.endsWith('.json')))assert.equal((await readFile(join(directory,file),'utf8')).includes('synthetic-credential-228'),false,file);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('uncertain SQLite commit retains the original pending ID and durable usage evidence; a second run cannot replace it',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pursuit-pending-'));
  try{
    await existingPayer(directory);const options=await registration(directory);let calls=0,failed=false;
    const result=await runExperiment({...options,storageFault:sql=>{if(calls&&sql.startsWith('UPDATE worlds SET state = ?'))failed=true;if(failed&&sql.startsWith('UPDATE worlds'))throw Error('synthetic SQLite unavailable at commit');},providerFetch:async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(decision(input))}}]});}});
    assert.ok(result.stopped);assert.equal(calls,1);assert.ok(result.pendingOperationId);
    const saved=JSON.parse(await readFile(join(directory,'run-state.json'),'utf8'));assert.equal(saved.pendingOperationId,result.pendingOperationId);assert.equal(saved.forwardedCalls,1);
    const view=await readback({runDirectory:directory});assert.ok(['pending','uncertain'].includes(view.operation.state));assert.ok(view.decisionTrace.dispatches.some(d=>d.usage?.inputTokens===30));
    await assert.rejects(runExperiment(options),/EEXIST/);assert.equal(calls,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('oversized private evidence is an explicit gap and bounded readback rather than a successful truncated chain',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pursuit-evidence-gap-'));
  try{
    await existingPayer(directory);const options=await registration(directory);let calls=0;
    const result=await runExperiment({...options,providerFetch:async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json({padding:'x'.repeat(1024*1024),usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(decision(input))}}]});}});
    assert.match(result.stopped,/evidence-gap/);assert.equal(calls,1);assert.ok(result.pendingOperationId);
    for(const file of (await readdir(directory)).filter(file=>file.endsWith('.json')))assert.ok((await readFile(join(directory,file))).length<=1024*1024,file);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('complete preflight accepts synthetic local registration and rejects changed version, scene, order, parameters and finite authorization',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pursuit-preflight-'));
  try {
    const options=await registration(directory);assert.equal((await preflight(options)).paidReady,true);
    for(const [name,mutate] of Object.entries({
      product:({plan})=>{plan.implementationCommit='0'.repeat(40);},
      runner:({plan})=>{plan.runnerSha256='bad';},
      scene:({plan})=>{plan.scenes.service.sha256='bad';},
      schedule:({plan})=>{plan.schedule.reverse();},
      window:({plan})=>{plan.window.advances=9;},
      model:({plan})=>{plan.model='another-model';},
      parameters:({plan})=>{plan.parameters.npcMaxOutputTokens=4096;},
      authScope:({authorization})=>{authorization.scope='production';},
      authExpired:({authorization})=>{authorization.expiresAt=1;},
      authUnlimited:({authorization})=>{authorization.remaining.usd=null;},
      price:({priceSnapshot})=>{priceSnapshot.input=null;},
    })) {
      const changed=await registration(directory,mutate);let touched=0;
      await assert.rejects(runExperiment({...changed,credential:async()=>{touched++;return 'must-not-read';},providerFetch:async()=>{touched++;throw Error('network forbidden');}}),/Preflight rejected/,name);
      assert.equal(touched,0,name);
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('runtime helper, SQL and an untracked product module cannot bypass the sealed source version',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pursuit-source-pin-'));
  try{
    const options=await registration(directory);
    for(const file of ['tests/pursuit-selection-fixture.cjs','drizzle/0000_bizarre_inhumans.sql','lib/runner-untracked-fixture.ts']){
      let original;
      try{original=await readFile(file);}catch{original=null;}
      try{
        await writeFile(file,(original?.toString()||'')+'\n// synthetic source version mismatch\n');
        const result=await preflight(options);assert.equal(result.paidReady,false,file);assert.ok(result.errors.some(error=>['product-version','runner-hash'].includes(error)),file);
      }finally{if(original)await writeFile(file,original);else await rm(file,{force:true});}
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('a positive forwarded journey really commits, reopens file SQLite and retains payer usage across story reset', async () => {
  const directory = process.env.PURSUIT_EVIDENCE_DIR || await mkdtemp(join(tmpdir(), 'pursuit-positive-'));
  const random=Math.random;Math.random=()=>.675; // Only the approved external perception die seam.
  try {
    await existingPayer(directory);
    const options=await registration(directory);let count=0,judgments=0,firstContext;const actual=[];
    options.providerFetch=async(url,init)=>{
      assert.equal(String(url),'https://api.openai.com/v1/chat/completions');actual.push(init.body);
      const input=JSON.parse(JSON.parse(init.body).messages[1].content);let value;
      if(input.contractVersion==='world-adjudication.v1'){judgments++;value=programs.approval([search()],'find-ingredient');}
      else {firstContext??=input.pursuitContext;
        if(input.pursuitContext!==firstContext)value=decision(input,{duration:120});
        else {count++;
          if(count===1)value=decision(input,{updates:[upsert('owner:care',[],{kind:'direction',content:'照顧眼前生活',scope:'依我的心意照顧眼前生活',satisfaction:null}),upsert('owner:meal',[{id:'owner:direction',version:1},{id:'owner:care',version:0}],{scope:'查證後取得一份餐點',satisfaction:'真的取得餐點'})],focus:'owner:meal',type:'say',target:'cass',content:'你想吃什麼餐點？'});
          else if(count===2)value=decision(input,{updates:[assess(input,'owner:meal','active','waiting','subjective',[])],focus:'owner:meal',choice:'wait',content:'先等客人想清楚'});
          else if(count===3){assert.ok(input.self.shortTerm.some(m=>m.source?.person==='cass'&&m.text.includes('普通')));value=decision(input,{focus:'owner:meal',type:'propose',target:'cafe',content:'查看這裡可用的普通備餐材料',choice:'switch'});value.timeIntent={kind:'completion',maxMinutes:null};value.action.purpose='確認可用材料';}
          else if(count===4){assert.ok(input.supplies.some(source=>source.kind==='cooking-ingredient'));assert.equal(input.self.intents.find(n=>n.id==='owner:meal').parents.length,2);value=decision(input,{focus:'owner:meal',type:'propose',target:'bread-stock',content:'用現有麵包準備一份餐點',choice:'switch'});value.timeIntent={kind:'completion',maxMinutes:null};value.action.purpose='準備餐點';}
          else if(count===5){assert.ok(input.objects.some(o=>o.kind==='meal'));value=decision(input,{updates:[assess(input,'owner:meal','satisfied','ready'),assess(input,'owner:direction','active','enough')]});}
          else if(count===6){const old=input.self.intents.find(n=>n.id==='owner:care');value=decision(input,{updates:[{operation:'drop',id:old.id,version:old.version,node:null,references:[],reason:'我現在不想繼續這個額外方向'}]});}
          else value=decision(input,{duration:120});
          if(count===1)value.pursuitCandidates.push({id:'owner:candidate:walk-only-now',kind:'intent',content:'先出去走走',scope:'只在這次考慮散步',satisfaction:null,references:[]});
          else assert.equal(JSON.stringify(input).includes('只在這次考慮散步'),false,'unadopted possibility never becomes next input');
        }
      }
      return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
    };
    const controlledProvider=options.providerFetch,fixtureFailures=[];
    options.providerFetch=async(...args)=>{try{return await controlledProvider(...args);}catch(error){fixtureFailures.push(error.stack);throw error;}};
    const result = await runExperiment(options);
    assert.equal(result.stopped,null,JSON.stringify({result,fixtureFailures}));
    assert.equal(result.realProviderCalls, 0);
    assert.ok(result.forwardedCalls >= 2);
    assert.ok(result.trials[0].rounds >= 2);
    assert.equal(result.sqliteReopened, true);
    assert.equal(result.trials.length,10);assert.equal(judgments,1);assert.ok(count>=6);
    const fifth=JSON.parse(await readFile(join(directory,'L1-1-5.json'),'utf8'));assert.equal(fifth.after.world.objects.filter(o=>o.kind==='meal'&&o.lifecycle==='active').length,1);assert.equal(fifth.after.world.characters.find(c=>c.id==='owner').intents.find(n=>n.id==='owner:meal').status,'satisfied');
    for(let i=1;i<10;i++)assert.deepEqual(result.trials[i].payerBefore,result.trials[i-1].payerAfter);
    const stored=await readback({runDirectory:directory});assert.ok(stored.world.aiUsage.totalCalls>actual.length);assert.equal(stored.modelKeys.openai.configured,false,'readback has no encryption secret');
    console.info('RUNNER_228_SUMMARY '+JSON.stringify({controlled:true,realPaidDispatches:0,trials:result.trials.length,advances:result.trials.reduce((sum,trial)=>sum+trial.rounds,0),forwardedControlledProviderCalls:result.providerInvocations,partnerFixtureCalls:result.fixtureCalls,engineCalls:stored.world.aiUsage.totalCalls,syntheticOriginalPlayerLimit:stored.world.playerBudget,sqliteReopened:result.sqliteReopened,wallClockUnmodified:true,perceptionDie:.675,maxBodyBytes:Math.max(...actual.map(body=>Buffer.byteLength(body)))}));
  } finally { Math.random=random;if(!process.env.PURSUIT_EVIDENCE_DIR)await rm(directory,{recursive:true,force:true}); }
});
