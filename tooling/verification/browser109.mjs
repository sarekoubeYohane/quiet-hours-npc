import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/routine-rules');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-adjudicator'};store.install(world);
const completion=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
let npc=0,adjudication=0;
setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){adjudication++;assert.equal(input.routineOffer.family,'cafe-service');assert.ok(request.response_format.json_schema.schema.properties.routine);return completion({status:'accepted',completionMinutes:null,effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:input.routineOffer.operations.map(operation=>({operation,minutes:operation==='tea'||operation==='coffee'?30:15}))}});}npc++;assert.doesNotMatch(JSON.stringify(input),/routineAudit|ruleId|首次裁定|沿用日常規則/);return completion({type:'work',target:'tea',content:'泡一杯茶',mood:'平靜',durationMinutes:30,intents:[]});});
const navigate=(page,name)=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const choose=async()=>{await navigate(page,'設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate(page,'觀察');};
 const advance=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const result=await response;assert.equal(result.status(),200,await result.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await choose();
 let w=await advance();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.routineRules.length,1);assert.equal(adjudication,1);
 w=await advance();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.characters[0].plan,undefined);
 await page.reload();await choose();w=await advance();assert.equal(w.objects.filter(o=>o.kind==='utensil').length,2);assert.equal(w.objects.filter(o=>o.kind==='utensil')[1].state.contents,'water');assert.equal(adjudication,1);assert.equal(npc,2);
 const replay=await page.request.post(url+'/api/world',{data:requests.filter(r=>r.operation==='advance').at(-1)});assert.equal(replay.status(),200);assert.equal((await replay.json()).world.objects.filter(o=>o.kind==='utensil').length,2);assert.equal(modelRequests.length,3);
 w=await advance();assert.equal(w.objects.filter(o=>o.kind==='utensil')[1].state.contents,'tea');assert.equal(w.aiUsage.totalCalls,3);
 await navigate(page,'分析');await page.getByRole('region',{name:'日常規則與成果',exact:true}).getByText('沿用日常規則，無新增裁定',{exact:false}).waitFor();await page.screenshot({path:outputPath('browser109-reused.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS #109 actual application Chromium: first rule/background approval, timed water→tea, new activity after completion and reload, replay, observer analysis, no diagnostic NPC leakage; 2 NPC + 1 adjudication dispatch, 120 reported tokens.');
}finally{await browser?.close();server.close();}
