import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/activity-time');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
let browser;
try{
 for(const [teaMinutes,estimate] of [[30,15],[5,60]]){
  if(process.env.BROWSER116_TEA_MINUTES&&Number(process.env.BROWSER116_TEA_MINUTES)!==teaMinutes)continue;
  browser=await launchBrowser();
  const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-adjudicator'};store.install(world);
  let npc=0,adjudication=0;
  const initial=modelRequests.length;
  setModelResponder(request=>{
   const input=JSON.parse(request.messages[1].content);
   if(input.contractVersion==='world-adjudication.v1'){
    adjudication++;assert.ok(input.routineOffer.templates.every(t=>!('minutes' in t.result)),'world must confirm time without a fixed-time suggestion');
    return completion({status:'accepted',completionMinutes:null,effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:input.routineOffer.operations.map(operation=>({operation,minutes:operation==='tea'?teaMinutes:operation==='coffee'?45:15}))}});
   }
   npc++;assert.doesNotMatch(JSON.stringify(input),/routineAudit|ruleId|首次裁定|沿用日常規則/);
   return completion({type:'propose',target:'cafe',content:npc===1?'泡一杯普通茶':'準備一杯咖啡',purpose:'飲用',mood:'平靜',durationMinutes:estimate,intents:[]});
  });
  const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1280,height:900}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
  const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
  const navigate=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
  const choose=async()=>{await navigate('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate('觀察');};
  const advance=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const result=await response;assert.equal(result.status(),200,await result.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
  try{
   await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await choose();
   let w=await advance();const tea=w.routineRules[0].templates.find(t=>t.operation==='tea');assert.equal(tea.result.minutes,teaMinutes===5?15:30);assert.equal(w.routineRules[0].templates.length,6);
   if(teaMinutes===30){
    assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects.some(o=>o.state.beverage==='tea'),false);const plan=w.characters[0].plan;assert.equal(plan.until-plan.startedAt,30);
    await navigate('分析');await page.getByRole('region',{name:'日常規則與成果'}).getByText('完成目標安排 30 分鐘',{exact:false}).waitFor();await page.screenshot({path:outputPath('browser116-confirmed30-pending.png'),fullPage:true});await navigate('觀察');
    const replay=await page.request.post(url+'/api/world',{data:requests.filter(r=>r.operation==='advance').at(-1)});assert.equal(replay.status(),200);assert.equal(modelRequests.length-initial,2);assert.deepEqual((await replay.json()).world.objects,w.objects);
    w=await advance();
   }
   assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects.filter(o=>o.state.beverage==='tea').length,1);assert.equal(w.characters[0].plan,undefined);assert.equal(npc,1);assert.equal(adjudication,1);
   await page.reload();await choose();w=await advance();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,45);const start=w.characters[0].plan.startedAt;assert.equal(w.objects.some(o=>o.state.beverage==='coffee'),false);assert.equal(adjudication,1);assert.equal(npc,2);
   await page.reload();await choose();w=await advance();assert.equal(w.characters[0].plan.startedAt,start);assert.equal(w.objects.some(o=>o.state.beverage==='coffee'),false);w=await advance();assert.equal(w.objects.filter(o=>o.state.beverage==='coffee').length,1);assert.equal(w.characters[0].plan,undefined);assert.equal(npc,2);assert.equal(adjudication,1);assert.equal(modelRequests.length-initial,3);assert.equal(w.aiUsage.totalCalls,3);
   await navigate('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});await panel.getByText('沿用日常規則，無新增裁定',{exact:false}).first().waitFor();await panel.getByText('咖啡 45 分鐘',{exact:false}).waitFor();await page.screenshot({path:outputPath(`browser116-tea${teaMinutes}-reused-coffee45.png`),fullPage:true});assert.deepEqual(errors,[]);
   console.log(`PASS #116 actual Chromium: estimate ${estimate}, confirmed tea ${teaMinutes} -> ${tea.result.minutes}; reload and coffee45 reuse, replay, full outputs at confirmed ends; 2 NPC + 1 adjudication, 120 fixture tokens.`);
  }finally{await context.close();await browser.close();browser=undefined;}
 }
}finally{await browser?.close();server.close();}
