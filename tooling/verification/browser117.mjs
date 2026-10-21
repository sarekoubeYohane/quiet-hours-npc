import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/activity-time');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-adjudicator'};store.install(world);
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
let npc=0,adjudication=0;
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content);
 if(input.contractVersion==='world-adjudication.v1'){
  adjudication++;return completion({status:'accepted',completionMinutes:null,effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:input.routineOffer.operations.map(operation=>({operation,minutes:operation==='tea'?30:15}))}});
 }
 npc++;
 if(npc===2){assert.match(input.self.activity,/30/);assert.match(input.self.activity,/15/);assert.match(input.self.activity,/未啟動|不足/);}
 return completion({type:'propose',target:'cafe',content:'泡一杯普通茶',purpose:'飲用',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:npc===1?15:30},intents:[]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const navigate=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const choose=async()=>{await navigate('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate('觀察');};
 const advance=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const result=await response;assert.equal(result.status(),200,await result.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
 const replay=async world=>{const response=await page.request.post(url+'/api/world',{data:requests.filter(r=>r.operation==='advance').at(-1)});assert.equal(response.status(),200);const saved=(await response.json()).world;assert.deepEqual(saved.objects,world.objects);assert.deepEqual(saved.routineRules,world.routineRules);};
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await choose();
 let w=await advance();assert.equal(w.turn,1);assert.equal(w.characters[0].plan,undefined);assert.equal(w.objects,undefined);assert.equal(w.supplies,undefined);assert.equal(w.routineRules.length,1);assert.equal(w.routineRules[0].templates.length,6);assert.equal(npc,1);assert.equal(adjudication,1);const rules=structuredClone(w.routineRules);await replay(w);assert.equal(modelRequests.length,2);
 await navigate('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});await panel.getByText('30',{exact:false}).first().waitFor();await panel.getByText('明確投入上限 15',{exact:false}).waitFor();await page.screenshot({path:outputPath('browser117-shortage-saved.png'),fullPage:true});
 await page.reload();await choose();w=await advance();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects.length,1);assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,30);assert.deepEqual(w.routineRules,rules);assert.equal(npc,2);assert.equal(adjudication,1);await replay(w);assert.equal(modelRequests.length,3);
 w=await advance();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects.filter(o=>o.state.beverage==='tea').length,1);assert.equal(w.characters[0].plan,undefined);assert.equal(w.aiUsage.totalCalls,3);assert.equal(npc,2);assert.equal(adjudication,1);
 await navigate('分析');await panel.getByText('沿用日常規則，無新增裁定',{exact:false}).first().waitFor();await page.screenshot({path:outputPath('browser117-rearranged-completed.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS #117 actual Chromium: cap15/world30 normal saved shortage without entities; reload, known NPC feedback, autonomous cap30 reused rule, replay and timed completion; 2 NPC+1 adjudication, 120 fixture tokens.');
}finally{await browser?.close();server.close();}
