import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';

process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/routine-object');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const proposal={type:'propose',target:'acceptance-tea-kit',content:'我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶',purpose:'飲用',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]};
const captured={completionMinutes:5,stages:[],status:'accepted',effects:[],check:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings:[{operation:'tea',minutes:5},{operation:'coffee',minutes:6},{operation:'food',minutes:10},{operation:'drink',minutes:8},{operation:'wash',minutes:3},{operation:'return',minutes:1}]}};
let browser;
try{
 for(const scenario of ['contradictory','existing','unrecorded','dirty','lifecycle']){
  browser=await launchBrowser();
  const world=await load('acceptance-scene').enterAcceptanceScene(load('world').seedWorld());
  world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-adjudicator'};
  if(scenario==='unrecorded')world.objects=world.objects.filter(o=>o.id!=='acceptance-cup');
  if(scenario==='dirty'){world.objects[0].state.clean='no';world.objects[0].state.contents='dirty';world.objects[0].stateTransitions.contents.push('dirty');}
  // The original acceptance cup declares only empty/water/tea. This separate
  // lifecycle fixture explicitly declares the ordinary drink/wash transition.
  if(scenario==='lifecycle')world.objects[0].stateTransitions.contents.push('dirty');
  const originalObjects=structuredClone(world.objects);store.install(world);
  let npc=0,adjudication=0,decision=proposal;
  setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);
   if(input.contractVersion==='world-adjudication.v1'){adjudication++;return completion({...captured,completionMinutes:scenario==='contradictory'?5:null});}
   npc++;return completion(decision);
  });
  const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1280,height:1000}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
  const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
  const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
  const choose=async()=>{await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');};
  try{
   await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await choose();
   const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');
   await page.getByRole('button',{name:'下一回合',exact:true}).click();const result=await response;
   assert.equal(result.status(),scenario==='contradictory'?502:200,await result.text());
   await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');
   let saved=await read();assert.equal(npc,1);assert.equal(adjudication,1);
   const operation=requests.filter(r=>r.operation==='advance').at(-1);
   const replay=await page.request.post(url+'/api/world',{data:operation});assert.equal(replay.status(),result.status());assert.equal(npc,1);assert.equal(adjudication,1);
   assert.deepEqual((await read()).objects,saved.objects);
   if(scenario==='contradictory'){
    assert.equal(saved.turn,0);assert.equal(saved.minute,720);assert.deepEqual(saved.objects,originalObjects);assert.equal(saved.routineRules,undefined);assert.equal(saved.aiUsage.totalCalls,2);
    await page.reload();await page.getByText('裁定候選不合法：查看失敗診斷（本回合未提交）',{exact:true}).click();
    await page.getByRole('heading',{name:'裁定候選',exact:true}).waitFor();
    await page.getByRole('heading',{name:'裁定候選',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:outputPath('contradictory-diagnostic.png'),fullPage:false});
   }else{
    assert.equal(saved.turn,1);assert.equal(saved.minute,735);assert.equal(saved.routineRules[0].templates.length,6);assert.equal(saved.characters[0].plan,undefined);
    const filled=saved.objects.filter(o=>o.kind==='utensil'&&o.state.contents==='tea');assert.equal(filled.length,1);
    assert.equal(saved.objects.filter(o=>o.kind==='food'&&o.state.beverage==='tea').length,1);
    if(['existing','lifecycle'].includes(scenario))assert.equal(filled[0].id,'acceptance-cup');else assert.notEqual(filled[0].id,'acceptance-cup');
    if(scenario==='dirty')assert.deepEqual(saved.objects.find(o=>o.id==='acceptance-cup'),originalObjects[0]);
    await page.getByText('供應、物件與活動階段',{exact:true}).click();
    await page.getByRole('region',{name:'驗收場景狀態',exact:true}).getByText('內容物：茶已泡好',{exact:true}).waitFor();
    const beforeReload=structuredClone(saved.objects);await page.reload();saved=await read();assert.deepEqual(saved.objects,beforeReload);
    await nav('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});await panel.getByText('泡茶 15 分鐘',{exact:false}).waitFor();
    await panel.screenshot({path:outputPath(`${scenario}-completed-reloaded.png`)});
    if(scenario==='lifecycle'){
     await choose();
     const advance=async()=>{
      const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');
      await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());
      await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();
     };
     const id=filled[0].id;
     decision={...proposal,target:id,content:'喝茶'};saved=await advance();assert.equal(saved.objects.find(o=>o.id===id).state.contents,'dirty');
     decision={...proposal,target:id,content:'清洗杯子',purpose:'清洗'};saved=await advance();assert.equal(saved.objects.find(o=>o.id===id).state.contents,'empty');
     decision={...proposal,content:'泡一杯茶'};saved=await advance();assert.equal(saved.objects.find(o=>o.id===id).state.contents,'tea');assert.equal(saved.objects.filter(o=>'contents' in o.state).length,1);
     assert.equal(npc,4);assert.equal(adjudication,1);await page.reload();assert.deepEqual((await read()).objects,saved.objects);
     await nav('分析');await page.getByRole('region',{name:'日常規則與成果'}).getByText('沿用日常規則，無新增裁定',{exact:false}).first().waitFor();
     await page.getByRole('region',{name:'日常規則與成果'}).screenshot({path:outputPath('washed-cup-reused.png')});
    }
   }
   assert.deepEqual(errors,[]);console.log(`PASS #122/#123 Chromium ${scenario}: original tea-kit proposal; API + SQLite + UI reload + replay; ${npc} NPC + ${adjudication} adjudication, ${(npc+adjudication)*40} fixture tokens${scenario==='lifecycle'?'; drink, wash and new tea reuse the same cup without adjudication':''}.`);
  }finally{await context.close();await browser.close();browser=undefined;}
 }
 console.log(`Captured ${modelRequests.length} transport requests; no real model requests.`);
}finally{await browser?.close();server.close();}
