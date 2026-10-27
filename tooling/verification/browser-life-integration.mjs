import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const require=createRequire(import.meta.url),fixture=require('../../tests/fixtures/life-loop.cjs'),run=require('../../tests/fixtures/life-loop-flow.cjs');
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/life-integration');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=fixture.initialWorld(load('world').seedWorld),transport=fixture.model();store.install(world);setModelResponder(request=>transport.respond(request));
const oldRandom=Math.random;Math.random=()=>0.65;let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const configure=async()=>{await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');};
 let minuteChoice=15,uiAdvances=0,apiAdvances=0;
 const advance=async(minutes=15)=>{
  const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},clock.now);
  // Core living transitions use the existing UI. Quiet cross-day waiting uses
  // the exact same public API without fabricating clocks or historical rows.
  if(uiAdvances<24){
   if(minuteChoice!==minutes){await nav('設定');await page.getByRole('combobox',{name:'推進時間間隔',exact:true}).click();await page.getByRole('option',{name:`${minutes} 分鐘`,exact:true}).click();await nav('觀察');minuteChoice=minutes;}
   const waiting=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const result=await waiting;assert.equal(result.status(),200,await result.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');uiAdvances++;
  }else{
   const result=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:{operation:'advance',operationId:`${clock.now}:${crypto.randomUUID()}`,worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',minutes}});assert.equal(result.status(),200,await result.text());apiAdvances++;
  }
  return read();
 };
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await configure();
 const seen=[];
 const checkpoint=async(name,saved)=>{
  seen.push({name,minute:saved.minute,turn:saved.turn});
  if(!['paused','ingested','resumed','sleeping','complete'].includes(name))return;
  if(uiAdvances>=24){await page.reload();minuteChoice=15;await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await configure();}
  await nav('分析');const characterPanel=page.locator('section.character').filter({has:page.getByRole('heading',{name:'角色狀態',exact:true})});await page.getByRole('heading',{name:'身體需求',exact:true}).waitFor();
  if(name==='paused'){await page.getByRole('region',{name:'日常規則與成果'}).getByText('暫停中',{exact:false}).first().waitFor();await page.getByRole('region',{name:'日常規則與成果'}).screenshot({path:outputPath('paused-work.png')});}
  if(name==='ingested'){await page.getByText('飢餓 16.25/100',{exact:false}).waitFor();await page.getByRole('heading',{name:'身體需求',exact:true}).locator('..').screenshot({path:outputPath('actual-ingestion.png')});}
  if(name==='resumed'){assert.equal(saved.objects.find(o=>o.id==='material').revision,2);await characterPanel.screenshot({path:outputPath('resumed-work.png')});}
  if(name==='sleeping'){await page.getByText('睡眠狀態：睡眠中',{exact:false}).waitFor();await page.getByRole('heading',{name:'身體需求',exact:true}).locator('..').screenshot({path:outputPath('cross-ninety-sleep.png')});}
  if(name==='complete'){
   await characterPanel.getByText('自主習慣證據',{exact:true}).click();await characterPanel.getByText('事件型候選',{exact:true}).first().waitFor();await characterPanel.getByText('主觀喜好',{exact:true}).click();await characterPanel.getByText('我喜歡完成整理後坐一會兒。',{exact:true}).waitFor();await characterPanel.getByText('整理之後，常會休息 · 已形成 · 3 個世界日',{exact:true}).locator('..').screenshot({path:outputPath('established-event-habit.png')});await characterPanel.getByText('我喜歡完成整理後坐一會兒。',{exact:true}).locator('..').screenshot({path:outputPath('subjective-preference.png')});
   const fromDatabase=await read();assert.deepEqual(fromDatabase.characters,saved.characters);assert.equal(fromDatabase.minute,saved.minute);
  }
  await nav('觀察');
 };
 const result=await run({read,advance,transport},load('habits'),checkpoint);
 const last=requests.filter(r=>r.operation==='advance').at(-1),beforeReplay=transport.counts();const replay=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:last});assert.equal(replay.status(),200,await replay.text());assert.deepEqual(transport.counts(),beforeReplay);assert.deepEqual((await read()).characters,result.world.characters);assert.deepEqual(errors,[]);
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,realPaidCalls:0,uiAdvances,apiAdvances,elapsedMinutes:result.elapsedMinutes,counts:result.counts,resolutions:result.world.freeTrials,seen,owner:{needs:result.world.characters[0].needs,preferences:result.world.characters[0].preferences,habits:result.world.characters[0].habits,eventHabits:result.world.characters[0].eventHabits},objects:result.world.objects},null,2));
 console.log(`PASS #181 real Chromium/API/SQLite: ${uiAdvances} existing UI advances, ${apiAdvances} public API advances, ${result.elapsedMinutes} real advanced world minutes, 3 days of habits/preferences; no fixture time/state replacement, no paid calls.`);
}finally{Math.random=oldRandom;await browser?.close();server.close();}
