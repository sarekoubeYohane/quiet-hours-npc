import { readFile, mkdir, access, readdir, open, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createRuntime } from './pursuit-runtime-228.mjs';
import { claimExperiment } from './pursuit-account-228.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
async function durableWrite(file,text,maxBytes){
  if(Buffer.byteLength(text)>maxBytes)throw Error('evidence-gap');
  const temporary=file+'.'+crypto.randomUUID()+'.tmp';
  let handle;
  try{handle=await open(temporary,'wx',0o600);await handle.writeFile(text);await handle.sync();await handle.close();handle=null;await rename(temporary,file);}
  finally{await handle?.close();await rm(temporary,{force:true});}
}
const runnerFiles=['tooling/experiments/pursuit-runner-228.mjs','tooling/experiments/pursuit-runtime-228.mjs','tooling/experiments/pursuit-account-228.mjs','tooling/experiments/pursuit-partner-228.cjs','tests/pursuit-selection-fixture.cjs','package.json','pnpm-lock.yaml'];
const productPaths=['lib','app','components','drizzle','package.json','pnpm-lock.yaml','tests/pursuit-selection-fixture.cjs'];
export async function runnerDigest(root=process.cwd()) {
  const files=[...runnerFiles,...(await readdir(join(root,'drizzle'))).filter(file=>file.endsWith('.sql')).sort().map(file=>'drizzle/'+file)];
  const require=createRequire(join(resolve(root),'package.json'));
  const dependency=await readFile(require.resolve('typescript'));
  const texts=await Promise.all(files.map(async file=>file+'\n'+(await readFile(join(root,file),'utf8')).replaceAll('\r\n','\n')));
  return digest(texts.join('\n')+'\nnode-major:'+process.versions.node.split('.')[0]+'\ntypescript:'+digest(dependency));
}
const fixedSchedule=['L1:1','L2:1','L3:1','L4:1','L5:1','L5:2','L4:2','L3:2','L2:2','L1:2'];
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const officialPriceSource=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['openai.com','www.openai.com','developers.openai.com','platform.openai.com'].includes(url.hostname);}catch{return false;}};
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
export async function preflight({ root = process.cwd(), planPath = join(root, 'tooling/experiments/pursuits-220.json'), authorization = null, priceSnapshot = null } = {}) {
  let plan;
  const missing = [], errors = [];
  try { const bytes=await readFile(planPath);if(bytes.length>64*1024)throw Error('plan limit');plan = JSON.parse(bytes); } catch { errors.push('sealed-plan'); }
  if (!authorization) missing.push('finite-authorization');
  if (!priceSnapshot) missing.push('official-price-snapshot');
  if (!plan?.implementationCommit) missing.push('reviewed-implementation-commit');
  if (!plan?.runnerSha256) missing.push('sealed-runner-sha256');
  if (plan) {
    if(plan.l5ChangePolicy!=='explicit-bound-controller-confirmation')errors.push('l5-change-policy');
    if(plan.version!==1||plan.issue!==220||plan.provider!=='openai'||plan.model!=='gpt-6-luna'||plan.adjudicationModel!=='gpt-6-luna'||JSON.stringify(plan.parameters)!==JSON.stringify({reasoning_effort:'none',store:false,npcMaxOutputTokens:2048,adjudicationMaxOutputTokens:12000,recall:false,retries:false})) errors.push('model-parameters');
    if(JSON.stringify(plan.schedule)!==JSON.stringify(fixedSchedule)||plan.window?.advances!==8||plan.window?.minutes!==15)errors.push('schedule-window');
    if(!['calls','tokens','usd','elapsedMs'].every(key=>finite(plan.limits?.[key])))errors.push('finite-plan-limits');
    if(plan.runnerSha256&&plan.runnerSha256!==await runnerDigest(root))errors.push('runner-hash');
    if(plan.implementationCommit)try{if(!/^[0-9a-f]{40}$/.test(plan.implementationCommit)||git(root,['rev-parse',plan.implementationCommit])!==plan.implementationCommit||git(root,['diff',plan.implementationCommit,'--',...productPaths])||git(root,['ls-files','--others','--exclude-standard','--',...productPaths]))errors.push('product-version');}catch{errors.push('product-version');}
    for(const name of ['service','creative'])try{const entry=plan.scenes[name],bytes=await readFile(resolve(root,entry.file));if(digest(bytes)!==entry.sha256)errors.push('scene-hash:'+name);const scene=JSON.parse(bytes);if(scene.pursuitVersion!==1||scene.characters.some(c=>c.intents.some(node=>node.kind!=='direction')))errors.push('scene-initial-pursuits:'+name);}catch{errors.push('scene:'+name);}
  }
  const planSha256=plan?digest(JSON.stringify(plan)):null;
  if(authorization&&(!authorization.approved||!authorization.reference||!authorization.runId||authorization.scope!=='isolated-pursuit-220'||authorization.payer!=='pursuit-experiment-payer'||authorization.planSha256!==planSha256||!(authorization.expiresAt>Date.now())||!['calls','tokens','usd','elapsedMs'].every(key=>finite(authorization.remaining?.[key]))))errors.push('finite-authorization');
  if(priceSnapshot&&(!officialPriceSource(priceSnapshot.source)||!/^\d{4}-\d{2}-\d{2}$/.test(priceSnapshot.date||'')||!(/^[a-f0-9]{64}$/.test(priceSnapshot.evidenceSha256||''))||priceSnapshot.provider!==plan?.provider||priceSnapshot.model!==plan?.model||!finite(priceSnapshot.input)||!finite(priceSnapshot.output)))errors.push('official-price-snapshot');
  if(authorization&&priceSnapshot&&authorization.priceSha256!==digest(JSON.stringify(priceSnapshot)))errors.push('authorized-price-mismatch');
  if(authorization&&Object.keys(authorization).some(key=>!['approved','reference','runId','scope','payer','planSha256','priceSha256','expiresAt','remaining'].includes(key)))errors.push('authorization-fields');
  if(priceSnapshot&&Object.keys(priceSnapshot).some(key=>!['provider','model','source','date','input','output','evidenceSha256'].includes(key)))errors.push('price-fields');
  return { plan, planSha256, errors, missing, paidReady: errors.length === 0 && missing.length === 0, realProviderCalls: 0 };
}

const exists=async file=>{try{await access(file);return true;}catch{return false;}};
export async function readback({runDirectory,root=process.cwd()}) {
  const state=JSON.parse(await readFile(join(runDirectory,'run-state.json'),'utf8'));
  const runtime=await createRuntime({root,databasePath:state.accountDatabasePath||join(runDirectory,'world.sqlite'),readonly:true});
  try{return {state,...await(await runtime.get(state.pendingOperationId||state.lastOperationId)).json()};}finally{await runtime.close();}
}

// Public executable runner. Tests inject only provider transport and credential input;
// they enter this same paid-mode gate, with explicitly synthetic finite authorization.
export async function runExperiment({root=process.cwd(),planPath=join(root,'tooling/experiments/pursuits-220.json'),mode='preflight',runDirectory,authorization=null,priceSnapshot=null,credential,providerFetch=globalThis.fetch,controlledTransport=false,stopRequested=async()=>false,clock=()=>Date.now(),storageFault,accountDirectory,confirmMealCommitment=async()=>null}={}) {
  const checked=await preflight({root,planPath,authorization,priceSnapshot});
  if(mode==='preflight')return checked;
  if(mode!=='live'||!checked.paidReady)throw Error('Preflight rejected: '+[...checked.errors,...checked.missing].join(', '));
  if(!runDirectory||!credential)throw Error('Private output directory and explicit credential source required');
  if(accountDirectory&&!controlledTransport)throw Error('account-directory-is-controlled-test-only');
  const relativeOutput=relative(resolve(root),resolve(runDirectory));
  if(!relativeOutput||!isAbsolute(relativeOutput)&&relativeOutput!=='..'&&!relativeOutput.startsWith('..'+(process.platform==='win32'?'\\':'/')))throw Error('Private output must be outside repository');
  await mkdir(runDirectory,{recursive:true,mode:0o700});
  const stateFile=join(runDirectory,'run-state.json');
  const state={version:1,runId:authorization.runId,planSha256:checked.planSha256,firstDispatchAt:null,forwardedCalls:0,providerInvocations:0,fixtureCalls:0,tokens:0,usd:0,pendingOperationId:null,lastOperationId:null,stopped:null,trials:fixedSchedule.map(id=>({id,status:'not-reached',rounds:0,classification:'unassessed'}))};
  // Exclusive creation forbids accidental restart/reset/retry of an interrupted batch.
  const lock=await open(join(runDirectory,'RUN.lock'),'wx',0o600);await lock.writeFile('Exclusive experiment. Readback only after stop.');await lock.sync();await lock.close();
  const account=await claimExperiment({accountDirectory,authorization,planSha256:checked.planSha256,runDirectory});
  try {
  state.accountDatabasePath=account.databasePath;
  account.persist(state);
  await durableWrite(stateFile,JSON.stringify(state),256*1024);
  await durableWrite(join(runDirectory,'run-manifest.json'),JSON.stringify({plan:checked.plan,authorization,priceSnapshot}),64*1024);
  const save=async()=>{account.persist(state);await durableWrite(stateFile,JSON.stringify(state,null,2),256*1024);};
  const plan=checked.plan,limits=Object.fromEntries(Object.keys(plan.limits).map(key=>[key,Math.min(plan.limits[key],authorization.remaining[key])]));
  const runtime=await createRuntime({root,databasePath:account.databasePath,storageFault});
  const oldFetch=globalThis.fetch;
  let key='',currentTrial,roundStart,roundDispatches=0,roundTokens=0,traceFrames=[],trialBytes=0,partner;
  const require=createRequire(import.meta.url);
  const {createPartner}=require('./pursuit-partner-228.cjs');
  const redactor=runtime.load('diagnostic-redaction').redactDiagnosticText;
  const redact=text=>redactor(text,[key]);
  const writeEvidence=async(name,value)=>{const text=redact(JSON.stringify(value));const bytes=Buffer.byteLength(text);if(bytes>1024*1024||trialBytes+bytes>16*1024*1024||await exists(join(runDirectory,name)))throw Error('evidence-gap');trialBytes+=bytes;await durableWrite(join(runDirectory,name),text,1024*1024);};
  const stop=async()=>{if(await stopRequested()||await exists(join(runDirectory,'STOP')))throw Error('user-stop');if(clock()>=authorization.expiresAt)throw Error('authorization-expired');if(state.firstDispatchAt&&clock()-state.firstDispatchAt>=limits.elapsedMs)throw Error('elapsed-limit');};
  const post=async(body)=>{const response=await runtime.post(body);const result=await response.json();if(response.status!==200||result.operationUncertain||result.stopReason)throw Error('technical-error:'+response.status+':'+(result.error||''));return result;};
  const operation=async(body)=>{const view=await(await runtime.get()).json();return post({mode:'openai',model:plan.model,worldContext:view.world.contextId,operationId:Date.now()+':'+crypto.randomUUID(),...body});};
  try {
    // No credential read before complete non-secret authorization/version/scene checks.
    key=await credential();if(typeof key!=='string'||!key.trim()||key.length>4096)throw Error('credential-unavailable');
    await post({operation:'set-model-key',mode:'openai',key});
    await operation({operation:'set-adjudication',adjudication:{provider:plan.provider,model:plan.adjudicationModel}});
    await operation({operation:'set-price',price:{provider:plan.provider,model:plan.model,input:priceSnapshot.input,output:priceSnapshot.output,cachedInput:priceSnapshot.input,source:priceSnapshot.source,date:priceSnapshot.date}});
    globalThis.fetch=async(url,init)=>{
      await stop();
      if(state.unknownUsage)throw Error('unknown-usage-or-cost');
      if(String(url)!=='https://api.openai.com/v1/chat/completions'||init?.method!=='POST'||init.redirect!=='manual'||typeof init.body!=='string')throw Error('request-boundary');
      const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content),isNpc=!!input.self;
      if(body.model!==plan.model||body.store!==false||body.reasoning_effort!=='none'||Buffer.byteLength(init.body)>=164000||body.max_completion_tokens>(isNpc?2048:12000))throw Error('request-model-parameters');
      if(init.signal?.aborted)throw Error('request-aborted');
      roundDispatches++;
      const payer=roundStart.world.playerBudget||{calls:12,tokens:30000},usage=roundStart.world.aiUsage;
      const sameHour=usage&&Date.now()-usage.windowStartedAt<3600000;
      if(payer.calls!==null&&(sameHour?usage.calls:0)+roundDispatches>payer.calls||payer.tokens!==null&&(sameHour?usage.inputTokens+usage.outputTokens:0)+roundTokens>=payer.tokens)throw Error('player-limit');
      let response,forwarded=false;
      if(isNpc&&input.self.id!==currentTrial.focus){state.fixtureCalls++;response=Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(partner.reply(input))}}]});}
      else {
        const reserve=Buffer.byteLength(init.body)+body.max_completion_tokens;
        const reserveUsd=(Buffer.byteLength(init.body)*priceSnapshot.input+body.max_completion_tokens*priceSnapshot.output)/1e6;
        if(state.forwardedCalls+1>limits.calls||state.tokens+reserve>limits.tokens||state.usd+reserveUsd>limits.usd)throw Error('dispatch-reserve-limit');
        state.firstDispatchAt??=clock();state.forwardedCalls++;
        // Persist before crossing provider boundary. A crash keeps the call uncertain.
        state.unresolvedDispatch={sequence:state.forwardedCalls,operationId:state.pendingOperationId,requestSha256:digest(init.body),reservedTokens:reserve,reservedUsd:reserveUsd};await save();
        await stop();forwarded=true;state.providerInvocations++;
        response=await providerFetch(url,init); // Original body bytes, schema, messages and signal.
      }
      const responseBody=await response.clone().text();
      traceFrames.push({forwarded,requestBody:init.body,responseBody});
      const parsed=JSON.parse(responseBody),usageResult=parsed.usage;
      if(!response.ok||!usageResult||![usageResult.prompt_tokens,usageResult.completion_tokens].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('unknown-usage-or-transport');
      const used=usageResult.prompt_tokens+usageResult.completion_tokens;roundTokens+=used;
      if(forwarded){state.tokens+=used;state.usd+=(usageResult.prompt_tokens*priceSnapshot.input+usageResult.completion_tokens*priceSnapshot.output)/1e6;
        const cached=usageResult.prompt_tokens_details?.cached_tokens;
        if(cached!==undefined&&(!Number.isFinite(cached)||cached<0||cached>usageResult.prompt_tokens))state.unknownUsage='invalid-cached-tokens';
        else delete state.unresolvedDispatch;
        await save();if(!state.unknownUsage&&(state.tokens>limits.tokens||state.usd>limits.usd))throw Error('actual-usage-limit');}
      return response;
    };
    for(let index=0;index<state.trials.length;index++) {
      await stop();
      const trial=state.trials[index],scenario=trial.id.split(':')[0];
      currentTrial={id:trial.id,focus:scenario==='L4'?'vera':'owner'};
      const beforeReset=runtime.payerState();
      await operation({operation:'reset'});
      const reset=await(await runtime.get()).json();
      const payerProjection=w=>({usage:w.aiUsage?{...w.aiUsage,savedDecisions:0}:undefined,budget:w.playerBudget});
      if(JSON.stringify(beforeReset)!==JSON.stringify(runtime.payerState()))throw Error('reset-payer-mismatch');
      const sceneEntry=plan.scenes[scenario==='L4'?'creative':'service'];
      const bytes=await readFile(resolve(root,sceneEntry.file));if(digest(bytes)!==sceneEntry.sha256)throw Error('scene-hash');
      await runtime.initializeStory(JSON.parse(bytes));
      partner=createPartner(scenario,{runId:state.runId,trial:trial.id});trial.status='running';trial.payerBefore=payerProjection(reset.world);trialBytes=0;
      for(let round=0;round<plan.window.advances;round++) {
        await stop();roundStart=await(await runtime.get()).json();roundDispatches=0;roundTokens=0;traceFrames=[];
        if(roundStart.unresolvedUsageRecovery||!roundStart.costSummary.total.complete)throw Error('unknown-usage-or-cost');
        const payer=roundStart.world.playerBudget||{calls:12,tokens:30000},usage=roundStart.world.aiUsage;
        // Preserve the product's known-cumulative player policy. The separate
        // finite experiment allowance reserves actual bytes at every dispatch.
        if(payer.calls!==null&&usage.calls>=payer.calls||payer.tokens!==null&&usage.inputTokens+usage.outputTokens>=payer.tokens)throw Error('player-limit');
        state.pendingOperationId=Date.now()+':'+crypto.randomUUID();await save();
        const body={operation:'advance',operationId:state.pendingOperationId,worldContext:roundStart.world.contextId,mode:'openai',model:plan.model,minutes:15};
        await post(body);
        const after=await(await runtime.get(state.pendingOperationId)).json();
        if(after.operation?.state!=='settled'||after.decisionTrace?.outcome!=='committed'||after.decisionTrace?.gap||after.decisionTrace?.gaps?.length||after.unresolvedUsageRecovery||!after.costSummary.total.complete)throw Error('evidence-gap-or-uncertain');
        const actual=(after.decisionTrace.dispatches||[]).map(frame=>frame.requestBody);
        if(traceFrames.some(frame=>!actual.includes(frame.requestBody)))throw Error('prepared-request-mismatch');
        await writeEvidence(`${trial.id.replace(':','-')}-${round+1}.json`,{trial:trial.id,round:round+1,operationId:state.pendingOperationId,before:roundStart,after,transport:traceFrames});
        state.lastOperationId=state.pendingOperationId;state.pendingOperationId=null;
        trial.rounds++;trial.lastVersion=after.version;trial.payerAfter=payerProjection(after.world);await save();
        let confirmation=null;
        if(scenario==='L5'){
          const remaining=Math.min(authorization.expiresAt-clock(),limits.elapsedMs-(state.firstDispatchAt?clock()-state.firstDispatchAt:0));
          if(remaining<=0)throw Error('elapsed-limit');
          const signal=AbortSignal.timeout(Math.max(1,remaining));let listener;
          try{confirmation=await Promise.race([confirmMealCommitment({runId:state.runId,trial:trial.id,operationId:state.lastOperationId,world:structuredClone(after.world),signal}),new Promise((_,reject)=>{listener=()=>reject(Error('confirmation-time-limit'));signal.addEventListener('abort',listener,{once:true});})]);}
          finally{if(listener)signal.removeEventListener('abort',listener);}
          await stop();
        }
        partner.observe(after.world,{operationId:state.lastOperationId,confirmation});trial.partner=partner.report();await save();
      }
      trial.status='window-ended';await save();
      if(index===0)await runtime.archive(join(runDirectory,'first-trial.sqlite'));
    }
  }catch(error){state.stopped=redact(error instanceof Error?error.message:String(error));await save();}
  finally {globalThis.fetch=oldFetch;await runtime.close();}
  // Reopen the same file; GET readback cannot load/probe credentials or forward.
  const reopened=await readback({runDirectory,root});
  const readbackText=redact(JSON.stringify(reopened));
  if(Buffer.byteLength(readbackText)>1024*1024||trialBytes+Buffer.byteLength(readbackText)>16*1024*1024){state.stopped='evidence-gap';await save();await durableWrite(join(runDirectory,'readback.json'),JSON.stringify({gap:'readback-size-limit',operationId:state.pendingOperationId||state.lastOperationId,bytes:Buffer.byteLength(readbackText)}),1024);}
  else await durableWrite(join(runDirectory,'readback.json'),readbackText,1024*1024);
  key='';account.finish(state,reopened.operation?.state==='settled'&&reopened.costSummary?.total.complete===true&&!reopened.usageRecovery?.unknownRange&&!reopened.unresolvedUsageRecovery);
  return {...state,sqliteReopened:true,realProviderCalls:controlledTransport?0:state.providerInvocations,forwardingTransport:controlledTransport?'injected-controlled-provider':'provider'};
  } finally {account.close();}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),value=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
  if(args.includes('--readback'))console.log(JSON.stringify(await readback({runDirectory:value('--readback')})));
  else {
    const authorization=value('--authorization')?JSON.parse(await readFile(value('--authorization'),'utf8')):null;
    const priceSnapshot=value('--prices')?JSON.parse(await readFile(value('--prices'),'utf8')):null;
    const result=await runExperiment({mode:args.includes('--live')?'live':'preflight',planPath:value('--plan')||undefined,runDirectory:value('--output'),authorization,priceSnapshot,confirmMealCommitment:async({trial})=>{const directory=value('--confirmations-dir');if(!directory)return null;try{const bytes=await readFile(join(directory,trial.replace(':','-')+'.json'));return bytes.length<=4096?JSON.parse(bytes):null;}catch{return null;}},credential:async()=>{const name=value('--credential-env');if(!name)throw Error('Explicit credential env name required');return process.env[name];}});
    console.log(JSON.stringify(result,null,2));
    if(result.stopped||result.errors?.length)process.exitCode=2;
  }
}
