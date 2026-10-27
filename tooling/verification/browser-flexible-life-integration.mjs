import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,modelRequests,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const require=createRequire(import.meta.url),fixture=require('../../tests/fixtures/flexible-life-loop.cjs');
process.env.BROWSER_ARTIFACT_DIR||=resolve('docs/verification/assets/flexible-life-193');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const initial=fixture.initialWorld(load('world').seedWorld),transport=fixture.transport();store.install(initial);setModelResponder(body=>transport.respond(body));
let browser,uiAdvances=0,quietApiAdvances=0;const oldRandom=Math.random;Math.random=()=>0.8;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const tick=async()=>{const current=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},current.now);};
 const send=async body=>{const response=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:{operationId:`${Date.now()}:${crypto.randomUUID()}`,worldContext:initial.contextId,mode:'openai',model:'gpt-6-luna',minutes:15,...body}});const result=await response.json();assert.equal(response.status(),200,result.error);return result.world;};
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 await send({operation:'set-model-key',key:'fixture-key'});const clock=await(await page.request.get(url+'/__fixture')).json();await page.addInitScript(now=>{Date.now=()=>now;},clock.now);await page.goto(url);await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await page.getByText(/已設定 · 到期/).waitFor();await nav('觀察');
 const s={transport,read,intervene:async text=>{await tick();await send({operation:'intervene',mode:'demo',target:'owner',text});await page.reload();},advance:async(minutes=15)=>{
  await tick();const before=await read();
  if(fixture.actor(before).plan?.bodyActivity?.kind==='sleep'){
   const w=await send({operation:'advance',minutes});quietApiAdvances++;await page.reload();return w;
  }
  await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await page.getByText(/已設定 · 到期/).waitFor();await nav('觀察');const waiting=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await waiting,result=await response.json();assert.equal(response.status(),200,result.error);await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');uiAdvances++;return read();
 }};
 const checkpoints=[];
 const result=await fixture.run(s,async(name,w)=>{
  await nav('分析');await page.getByRole('button',{name:'店主',exact:true}).last().click();const phone=page.locator('details').filter({has:page.locator(':scope > summary').getByText('手機與私人外部紀錄（觀察者）',{exact:true})});if(await phone.count()&&await phone.getAttribute('open')===null)await phone.locator(':scope > summary').click();
  const arrangements=page.locator('details').filter({has:page.locator(':scope > summary').getByText('柔性安排',{exact:true})});if(await arrangements.count()&&await arrangements.getAttribute('open')===null)await arrangements.locator(':scope > summary').click();
  for(const nested of [phone.locator('details').filter({has:page.locator(':scope > summary').getByText(/^行事曆與提醒/)}),phone.locator('details').filter({has:page.locator(':scope > summary').getByText(/^裝置通知與察覺/)})])if(await nested.count()&&await nested.getAttribute('open')===null)await nested.locator(':scope > summary').click();
  const before=JSON.stringify(w.phones);assert.equal(JSON.stringify((await read()).phones),before,'observer panel cannot read for an NPC');
  if(['missed-asleep','late-read','postponed','dropped'].includes(name))await page.getByRole('region',{name:'日常規則與成果'}).screenshot({path:outputPath(name+'.png')});if(name==='dropped')await arrangements.screenshot({path:outputPath('dropped-arrangement.png')});
  checkpoints.push({name,minute:w.minute,turn:w.turn,arrangement:fixture.actor(w).arrangements.items[0].status,reminderVersion:fixture.device(w).calendar[0].reminder.version,readers:fixture.device(w).calendar[0].readers.map(r=>r.actorId),notifications:fixture.device(w).notifications?.length||0,counts:transport.counts()});await nav('觀察');
 });
 const beforeReload=await read(),beforeCounts=transport.counts();await page.reload();assert.deepEqual((await read()).phones,beforeReload.phones);assert.deepEqual(transport.counts(),beforeCounts);
 const last=requests.filter(r=>r.operation==='advance').at(-1),replay=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:last});assert.equal(replay.status(),200);assert.deepEqual(transport.counts(),beforeCounts);assert.deepEqual((await read()).characters,beforeReload.characters);
 const evidence=await(await page.request.get(url+'/api/world?operationId='+encodeURIComponent(last.operationId))).json();assert.equal(evidence.decisionTrace.outcome,'committed');assert.ok(evidence.decisionTrace.result.phones);assert.deepEqual(errors,[]);assert.equal(modelRequests.length,result.counts.npc+result.counts.adjudication);
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,paidCalls:0,uiAdvances,quietApiAdvances,...result,world:undefined,checkpoints,reloadAndReplayConsistent:true,traceContainsPrivatePhoneAuthority:true,pageErrors:errors},null,2));console.log('PASS #193 same-world Chromium/API/SQLite full arrangement/calendar/sleep/missed/read/postpone/continue/drop',JSON.stringify({uiAdvances,quietApiAdvances,counts:result.counts,elapsedMinutes:result.elapsedMinutes}));
}finally{Math.random=oldRandom;await browser?.close();server.close();}
