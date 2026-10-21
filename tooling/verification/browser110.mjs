import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/routine-rules');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner'||c.id==='kris').sort((a)=>a.id==='owner'?-1:1);world.characters.find(c=>c.id==='kris').control={mode:'taken-over'};world.adjudication={provider:'openai',model:'fixture-adjudicator'};
// Explicit fixture permission from the cup owner; no speech is treated as a grant.
world.objects=[{id:'borrowed-cup',source:'fixture',label:'借來的杯子',region:'cafe-front',holder:null,owner:'kris',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner','kris'],allowedTo:['owner','kris'],stateTransitions:{contents:['empty','water','tea','coffee','dirty']}}];
world.supplies=[{id:'last-cake',label:'最後一份蛋糕',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];store.install(world);
const completion=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
const decisions=[
 {target:'borrowed-cup',content:'準備一杯茶',purpose:'飲用',durationMinutes:30},
 {target:'borrowed-cup',content:'喝掉這杯茶',purpose:'飲用'},
 {target:'borrowed-cup',content:'清洗杯子',purpose:'清潔'},
 {target:'borrowed-cup',content:'歸還杯子',purpose:'歸還'},
 {target:'borrowed-cup',content:'準備一杯咖啡',purpose:'飲用',durationMinutes:30},
 {target:'borrowed-cup',content:'喝掉這杯咖啡',purpose:'飲用'},
 {target:'borrowed-cup',content:'清洗杯子',purpose:'清潔'},
 {target:'borrowed-cup',content:'歸還杯子',purpose:'歸還'},
 {target:'last-cake',content:'取得一份蛋糕',purpose:'食用'},
 {target:'last-cake',content:'取用蛋糕',purpose:'食用'},
 {target:'cafe',content:'準備一份簡餐',purpose:'用餐'},
];
let npc=0,adjudication=0;
setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){adjudication++;return completion({status:'accepted',completionMinutes:null,effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:input.routineOffer.operations.map(operation=>({operation,minutes:operation==='tea'||operation==='coffee'?30:15}))}});}const decision=decisions[npc++];assert.ok(decision,'unexpected extra NPC dispatch');return completion({type:'propose',mood:'平靜',durationMinutes:15,intents:[],...decision});});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const navigate=async name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const choose=async()=>{await navigate('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate('觀察');};
 const advance=async()=>{const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(instant=>{Date.now=()=>instant;},clock.now);const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const result=await response;assert.equal(result.status(),200,await result.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await choose();
 let w=await advance();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects.length,1);assert.equal(adjudication,1);
 w=await advance();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects[1].state.vessel,'borrowed-cup');
 w=await advance();assert.equal(w.objects[1].lifecycle,'consumed');assert.equal(w.objects[0].state.contents,'dirty');
 w=await advance();assert.equal(w.objects[0].state.contents,'empty');w=await advance();assert.equal(w.objects[0].holder,null);
 await page.reload();await choose();w=await advance();assert.equal(w.objects[0].state.contents,'water');assert.equal(adjudication,1);w=await advance();assert.equal(w.objects[0].state.contents,'coffee');
 w=await advance();assert.equal(w.objects[2].lifecycle,'consumed');w=await advance();assert.equal(w.objects[0].state.contents,'empty');w=await advance();assert.equal(w.objects[0].holder,null);assert.equal(w.objects[0].owner,'kris');
 w=await advance();assert.equal(w.supplies.find(s=>s.id==='last-cake').remaining,0);w=await advance();assert.equal(w.objects.filter(o=>o.source==='last-cake').length,1);w=await advance();assert.ok(w.objects.some(o=>o.label==='簡餐'));
 const replay=await page.request.post(url+'/api/world',{data:requests.filter(r=>r.operation==='advance').at(-1)});assert.equal(replay.status(),200);assert.deepEqual((await replay.json()).world.objects,w.objects);assert.equal(modelRequests.length,12);assert.equal(npc,11);assert.equal(adjudication,1);assert.equal(w.aiUsage.totalCalls,12);assert.equal(w.aiUsage.totalInputTokens+w.aiUsage.totalOutputTokens,480);
 await navigate('分析');await page.getByRole('region',{name:'日常規則與成果',exact:true}).getByText('沿用日常規則，無新增裁定',{exact:false}).first().waitFor();await page.screenshot({path:outputPath('browser110-lifecycle.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS #110 actual Chromium application: tea→drink→same borrowed cup wash/return→reload→coffee→consume/wash/return→finite cake twice→ordinary meal→replay. 11 NPC + 1 adjudication, 480 reported tokens, one cup with original owner.');
}finally{await browser?.close();server.close();}
