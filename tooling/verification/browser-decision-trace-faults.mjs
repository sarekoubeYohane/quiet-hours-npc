import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/decision-trace-faults');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const rest={type:'rest',target:'',content:'安靜休息',purpose:'休息',mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[]};
const proposal={...rest,type:'propose',target:'acceptance-tea-kit',content:'我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。',purpose:'飲用',timeIntent:{kind:'completion',maxMinutes:null}};
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const scenarios=['npc-malformed-body','npc-malformed-candidate','adjudication-malformed','http-failure','transport-failure','later-actor-rollback','save-conflict','save-before','save-after','lease-late','trace-write-failure','trace-checkpoint-failure','archive-read-failure','credential-redaction-unavailable'];
let browser;
try{
 for(const scenario of scenarios.filter(name=>!(process.env.FAULT_SCENARIO||process.env.TRACE_SCENARIO)||name===(process.env.FAULT_SCENARIO||process.env.TRACE_SCENARIO))){
  browser=await launchBrowser();
  const world=await load('acceptance-scene').enterAcceptanceScene(load('world').seedWorld());world.characters=world.characters.filter(c=>c.id==='owner'||scenario==='later-actor-rollback'&&c.id==='kris').sort((a,b)=>a.id==='owner'?-1:b.id==='owner'?1:0);world.adjudication={provider:'openai',model:'fixture-world'};
  const credentialMarker='opaque-unreadable-provider-browser-credential';
  if(scenario==='credential-redaction-unavailable'){world.characters[0].goal=credentialMarker;world.objects[0].label=credentialMarker;assert.ok(world.contextId);}
  store.install(world);let calls=0,armed=false,armedCalls=0,release,entered;
  const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  setModelResponder(async request=>{
   calls++;const input=JSON.parse(request.messages[1].content),adjudication=input.contractVersion==='world-adjudication.v1';
   if(!armed)return completion(rest);
   armedCalls++;
   if(scenario==='trace-checkpoint-failure')store.failTraceWrites(true);
   if(scenario==='npc-malformed-body')return new Response('{malformed provider body',{status:200});
   if(scenario==='npc-malformed-candidate')return completion('{not a decision');
   if(scenario==='adjudication-malformed')return completion(adjudication?'{not a ruling':proposal);
   if(scenario==='http-failure')return Response.json({error:{message:'fixture unavailable'},usage:{prompt_tokens:17,completion_tokens:3}},{status:503});
   if(scenario==='transport-failure'||scenario==='later-actor-rollback'&&armedCalls===2)throw Error('fixture connection failed');
   if(scenario==='lease-late'){entered();await gate;}
   return completion(rest);
  });
  const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  const read=async id=>(await(await page.request.get(url+'/api/world'+(id?'?operationId='+encodeURIComponent(id):''))).json());
  const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
  const advance=async()=>{const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();return pending;};
  const settle=()=>page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');
  try{
   const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.addInitScript(instant=>{Date.now=()=>instant;},clock.now);
   await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
   if(scenario==='credential-redaction-unavailable'){assert.equal((await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'ai',key:credentialMarker}})).status(),200);await store.database().prepare('UPDATE account_model_keys SET ciphertext = ? WHERE provider = ?').bind('damaged','openrouter').run();}
   await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
   assert.equal((await advance()).status(),200);await settle();const oldId=requests.filter(r=>r.operation==='advance').at(-1).operationId,before=await read();
   if(scenario==='credential-redaction-unavailable'){
    const operation=requests.filter(r=>r.operation==='advance').at(-1),first=await read(oldId),trace=first.decisionTrace;assert.equal(trace.outcome,'committed');assert.equal(trace.gap,'credential-redaction-unavailable');assert.equal(trace.contextId,undefined);assert.equal(trace.result,undefined);assert.deepEqual(trace.steps,[]);assert.ok(trace.dispatches.every(d=>d.requestBody===undefined&&d.responseBody===undefined&&d.worldSnapshot===undefined&&d.actorId===undefined&&d.model===undefined));assert.ok(!JSON.stringify(trace).includes(credentialMarker));const originalCalls=calls;
    for(let i=0;i<9;i++){const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1}})).json();const changed=await page.request.post(url+'/api/world',{data:{operation:'takeover',operationId:clock.now+':'+crypto.randomUUID(),worldContext:world.contextId,mode:'demo'}});assert.equal(changed.status(),200,await changed.text());}
    const expired=await read(oldId);assert.equal(expired.operation.state,'expired');assert.deepEqual(expired.decisionTrace,trace);assert.ok(expired.decisionTraces.records.some(item=>item.operationId===oldId));assert.equal(calls,originalCalls);
    await page.reload();await nav('分析');const panel=page.getByRole('region',{name:'決策追溯',exact:true});await panel.getByRole('combobox',{name:'追溯操作',exact:true}).waitFor();await panel.getByRole('combobox',{name:'追溯操作',exact:true}).selectOption(oldId);await panel.getByText('實際模型派送',{exact:true}).waitFor();assert.match(await panel.locator('option').filter({hasText:oldId}).innerText(),/場景未知，內容已省略/);assert.match(await panel.innerText(),/credential-redaction-unavailable/);assert.ok(!(await panel.innerText()).includes(credentialMarker));assert.equal(calls,originalCalls);
    assert.equal((await page.request.post(url+'/api/world',{data:operation})).status(),410);assert.equal(calls,originalCalls);assert.deepEqual((await read(oldId)).decisionTrace,trace);assert.deepEqual(errors,[]);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath(scenario+'.png')});await writeFile(outputPath(scenario+'.json'),JSON.stringify({fixture:true,scenario,backend:'e1e1808',realPaidModelCalls:0,operationId:oldId,trace,afterJournalEviction:{operationState:expired.operation.state,indexDiscoverable:true},checks:{unusedDamagedKeyDoesNotBlock:true,metadataOnly:true,contextUnknown:true,credentialNotPresent:true,journalEviction:true,reloadDiscoverable:true,selection:true,readsAddZeroModels:true,expiredIdAddsZeroModels:true,noPageErrors:true}},null,2)+'\n');console.log('PASS decision trace fault Chromium credential-redaction-unavailable; metadata-only receipt remains discoverable after journal eviction, unknown context marked, reload/read/expired-ID add zero dispatch; fixture only');continue;
   }
   if(scenario==='archive-read-failure')store.failNextTraceRead();
   if(scenario==='save-conflict')store.conflictOnNextSave();
   if(scenario==='save-before')store.throwBeforeNextSave();
   if(scenario==='save-after')store.throwAfterNextSave();
   if(scenario==='trace-write-failure')store.failTraceWrites(true);
   armed=true;
   const pending=advance();
   if(scenario==='lease-late'){await ready;await page.request.post(url+'/__fixture',{data:{advanceMs:130000}});release();}
   const response=await pending,expected=scenario==='archive-read-failure'?503:['save-after','trace-write-failure','trace-checkpoint-failure'].includes(scenario)?200:502;assert.equal(response.status(),expected,await response.text());await settle();
   const failed=requests.filter(r=>r.operation==='advance').at(-1);assert.notEqual(failed.operationId,oldId);
   if(expected!==200)await page.getByRole('button',{name:'分析詳情',exact:true}).click();else await nav('分析');
   const panel=page.getByRole('region',{name:'決策追溯',exact:true});await panel.waitFor();
   await page.waitForFunction(id=>document.querySelector('[aria-label="追溯操作"]')?.value===id,failed.operationId,{timeout:5000});
   const saved=await read(failed.operationId),trace=saved.decisionTrace;
   if(scenario==='archive-read-failure'){
    const rejected=await response.json();assert.equal(rejected.operationUncertain,true);assert.deepEqual(rejected.decisionTraceStatus,{status:'read-failed',gap:'prior-acceptance-unavailable',lastKnownStage:'before-acceptance'});assert.equal(calls,1);assert.deepEqual(saved.world,before.world);assert.equal(saved.version,before.version);assert.equal(trace,null);
    assert.match(await panel.innerText(),/prior-acceptance-unavailable/);assert.match(await panel.innerText(),/本次 HTTP 回應（非已保存回條）/);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath(scenario+'.png')});
    await page.reload();await nav('分析');await page.waitForFunction(id=>document.querySelector('[aria-label="追溯操作"]')?.value===id,failed.operationId,{timeout:5000});assert.match(await panel.innerText(),/找不到紀錄不代表沒有派送/);assert.doesNotMatch(await panel.innerText(),/本次 HTTP 回應（非已保存回條）/);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath(scenario+'-missing.png')});
    const retry=await page.request.post(url+'/api/world',{data:failed});assert.equal(retry.status(),200);assert.equal(calls,2);const accepted=await read(failed.operationId);assert.equal(accepted.world.turn,before.world.turn+1);const replay=await page.request.post(url+'/api/world',{data:failed});assert.equal(replay.status(),200);assert.equal(calls,2);assert.deepEqual((await read(failed.operationId)).world,accepted.world);
    await page.reload();await nav('分析');await panel.getByText('實際模型派送',{exact:true}).waitFor();assert.match(await panel.innerText(),/世界已提交/);assert.deepEqual(errors,[]);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath(scenario+'-recovered.png')});await writeFile(outputPath(scenario+'.json'),JSON.stringify({fixture:true,scenario,realPaidModelCalls:0,operationId:failed.operationId,rejected,afterRecoveryTrace:accepted.decisionTrace,checks:{beforeAcceptance:true,noDispatchOnReadFailure:true,noWorldChangeOnReadFailure:true,localResponseGap:true,reloadMissing:true,sameIdFirstAcceptanceThenReplay:true,noDuplicateEffect:true}},null,2)+'\n');console.log('PASS decision trace fault Chromium archive-read-failure; localized fail-closed before acceptance, original ID focus, missing reload, recovery accepts once and same-ID replay adds nothing; fixture only');continue;
   }
   if(scenario==='trace-write-failure'){
    assert.equal(trace,null);assert.match(await panel.innerText(),/資料缺口/);assert.equal(saved.operation.decisionTraceStatus.status,'write-failed');
   }else if(scenario==='trace-checkpoint-failure'){
    assert.ok(trace);assert.equal(trace.dispatches[0].stage,'dispatch-prepared');assert.equal(trace.outcome,'unknown');assert.equal(saved.operation.decisionTraceStatus.status,'write-failed');assert.match(await panel.getByLabel('本筆追溯保存狀態').innerText(),/本筆資料缺口/);assert.match(await panel.innerText(),/是否真正發送未知/);
   }else{
    assert.ok(trace,'fault transcript must survive for API and analysis');assert.match(await panel.innerText(),/最後已知階段/);
    assert.equal(trace.requestId,response.headers()['x-world-request-id']);
    assert.equal(trace.outcome,scenario==='save-after'?'committed':['save-conflict','save-before','lease-late'].includes(scenario)?'not-committed':'rolled-back');
    if(scenario==='npc-malformed-body'){assert.equal(trace.dispatches[0].responseBody,'{malformed provider body');assert.equal(trace.dispatches[0].failure.kind,'provider-body');}
    if(scenario==='adjudication-malformed')assert.equal(trace.dispatches.length,2);
    if(scenario==='http-failure'){assert.equal(trace.dispatches[0].httpStatus,503);assert.equal(trace.dispatches[0].failure.kind,'http');assert.deepEqual(trace.dispatches[0].usage,{inputTokens:17,outputTokens:3});}
    if(scenario==='transport-failure'){assert.equal(trace.dispatches[0].responseBody,undefined);assert.equal(trace.dispatches[0].failure.kind,'transport');}
    if(scenario==='later-actor-rollback')assert.equal(trace.dispatches.length,2);
   }
   if(expected===502){assert.deepEqual(saved.world.objects,before.world.objects);assert.deepEqual(saved.world.events,before.world.events);assert.equal(saved.world.turn,before.world.turn);}
   else assert.equal(saved.world.turn,before.world.turn+1);
   const beforeReplay=calls,version=saved.version,afterResponse=await page.request.post(url+'/api/world',{data:failed});assert.equal(afterResponse.status(),expected);assert.equal(calls,beforeReplay);
   const after=await read(failed.operationId);assert.equal(after.version,version);assert.deepEqual(after.world,saved.world);assert.deepEqual(after.decisionTrace,trace);
   await page.reload();await nav('分析');await page.waitForFunction(id=>document.querySelector('[aria-label="追溯操作"]')?.value===id,failed.operationId,{timeout:5000});
   assert.deepEqual(errors,[]);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath(scenario+'.png')});
   const artifact={fixture:true,scenario,realPaidModelCalls:0,operationId:failed.operationId,trace,status:saved.operation.decisionTraceStatus,checks:{failureFocus:true,reload:true,noNewDispatch:true,noDuplicateEffect:true,worldOutcomeConfirmed:true,noPageErrors:true}};
   const text=JSON.stringify(artifact,null,2)+'\n';assert.ok(!text.includes('fixture-key'));await writeFile(outputPath(scenario+'.json'),text);
   console.log(`PASS decision trace fault Chromium ${scenario}; original operation focus, private receipt, reload and same-ID zero extra dispatch/effects; fixture only`);
  }finally{release();store.failTraceWrites(false);await context.close();await browser.close();browser=undefined;}
 }
}finally{await browser?.close();server.close();}
