import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/heavenly-will');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const navigate=(page,name)=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
const world=load('world').seedWorld();world.characters=[world.characters[0],world.characters.find(c=>c.id==='owner')];world.characters[1].control={mode:'taken-over'};world.supplies=[{id:'meal',label:'測試餐點',region:'kris-home-main',remaining:1,owner:'cass',knownTo:['cass'],allowedTo:['cass'],kind:'food',initialState:{}}];store.install(world);
let judgments=0,chats=0;
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;return completion({status:'accepted',effects:judgments===1?[{kind:'materialize',supplyId:'meal',expectedRemaining:1}]:[{kind:'consume',objectId:'meal:1',expectedRevision:1}],check:null});}chats++;return completion({type:'propose',target:chats===1?'meal':'meal:1',content:'用手拿起並享用這份餐點',purpose:'吃飯',mood:'平靜',durationMinutes:15,intents:[]});});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(5000);
 await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();await navigate(page,'設定');
 await page.getByRole('button',{name:'保存裁定配置',exact:true}).waitFor();
 console.log('PASS #93 adjudication configuration is available inside existing settings');
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-only-secret'}});
 await page.reload();await navigate(page,'設定');
 await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'下一回合',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'開始自動',exact:true}).isDisabled(),true);
 assert.match(await page.locator('main').innerText(),/AI 模式需要保存裁定配置及有效 Key/);
 assert.equal(modelRequests.length,0);
 console.log('PASS #93 missing adjudication blocks manual and auto AI before any dispatch');
 await page.getByLabel('裁定模型',{exact:true}).fill('fixture-adjudicator');
 const saving=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation==='set-adjudication');
 await page.getByRole('button',{name:'保存裁定配置',exact:true}).click();const savedResponse=await saving;assert.equal(savedResponse.status(),200,await savedResponse.text());
 await page.waitForFunction(()=>!document.querySelector('.advance-button')?.textContent.includes('處理中'));
 const saved=await (await page.request.get(url+'/api/world')).json();assert.deepEqual(saved.world.adjudication,{provider:'openai',model:'fixture-adjudicator'});assert.doesNotMatch(JSON.stringify(saved),/fixture-only-secret/);
 assert.equal(await page.getByRole('button',{name:'下一回合',exact:true}).isEnabled(),true);
 assert.equal(await page.getByRole('button',{name:'開始自動',exact:true}).isEnabled(),true);
 await page.reload();await navigate(page,'設定');assert.equal(await page.getByLabel('裁定模型',{exact:true}).inputValue(),'fixture-adjudicator');assert.equal(await page.getByLabel('裁定服務 API Key',{exact:true}).inputValue(),'');assert.equal(modelRequests.length,0);
 console.log('PASS #93 config saves through real API and survives reload without paid validation or credential disclosure');
 await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate(page,'觀察');
 const advance=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const r=await response;assert.equal(r.status(),200,await r.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return (await (await page.request.get(url+'/api/world')).json()).world;};
 const acquired=await advance();assert.equal(acquired.objects[0].id,'meal:1');assert.equal(acquired.objects[0].holder,'cass');assert.equal(acquired.supplies[0].remaining,0);assert.match(await page.getByRole('region',{name:'精簡近況',exact:true}).innerText(),/測試餐點/);
 const consumed=await advance();assert.equal(consumed.objects.length,1);assert.equal(consumed.objects[0].id,'meal:1');assert.equal(consumed.objects[0].lifecycle,'consumed');assert.equal(consumed.aiUsage.totalCalls,4);assert.equal(chats,2);assert.equal(judgments,2);
 await navigate(page,'分析');await page.getByText('已發生用量與當時價格依據',{exact:true}).click();const costs=page.getByRole('region',{name:'已發生費用估算',exact:true});assert.match(await costs.innerText(),/NPC 決策/);assert.match(await costs.innerText(),/世界裁定/);
 console.log('PASS #93 real app acquires and consumes one persistent meal, two NPC plus two adjudication dispatches and separate cost tasks');
 await page.reload();await navigate(page,'分析');const reloaded=(await (await page.request.get(url+'/api/world')).json()).world;assert.equal(reloaded.objects[0].lifecycle,'consumed');assert.equal(modelRequests.length,4);
 await navigate(page,'設定');
 const replayBody=requests.filter(request=>request.operation==='advance').at(-1);const beforeReplay=modelRequests.length;const replay=await page.request.post(url+'/api/world',{data:replayBody});assert.equal(replay.status(),200);assert.equal(modelRequests.length,beforeReplay);assert.equal((await replay.json()).world.objects[0].lifecycle,'consumed');
 console.log('PASS #93 settled operation replay preserves consumed identity without further paid requests');
 await page.getByRole('button',{name:'清除裁定服務 Key',exact:true}).click();await page.getByLabel('裁定服務 API Key',{exact:true}).fill('replacement-fixture-secret');
 const keySave=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='set-model-key');await page.getByRole('button',{name:'保存裁定服務 Key（24 小時）',exact:true}).click();assert.equal((await keySave).status(),200);await page.waitForFunction(()=>document.querySelector('input[aria-label="裁定服務 API Key"]')?.value==='');
 assert.doesNotMatch(JSON.stringify(await (await page.request.get(url+'/api/world')).json()),/replacement-fixture-secret/);assert.equal(modelRequests.length,4);
 console.log('PASS #93 adjudication provider key can be replaced using existing encrypted storage without disclosure or paid validation');

 assert.deepEqual(errors,[]);
 await page.addStyleTag({content:'body,body *{font-family:"Noto Sans TC",sans-serif!important}'});await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:outputPath('browser93-settings.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:outputPath('browser93-settings-narrow.png'),fullPage:true});
 const runVariant=async(kind)=>{
  const fixture=structuredClone(world);fixture.adjudication={provider:'openai',model:'fixture-adjudicator'};if(kind==='budget')fixture.playerBudget={calls:1,tokens:30000};store.install(fixture);
  await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'variant-fixture-key'}});
  const context=await browser.newContext({reducedMotion:'reduce'});const view=await context.newPage();await view.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
  setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){if(kind==='save')store.conflictOnNextSave();if(kind==='stale')store.replaceCommittedWorld(structuredClone(fixture));return completion(kind==='denied'?{status:'denied',effects:[],check:null}:kind==='invalid'?{status:'accepted',effects:[{kind:'materialize',supplyId:'missing',expectedRemaining:1}],check:null}:{status:'accepted',effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1}],check:null});}return completion({type:'propose',target:'meal',content:'拿取餐點',purpose:'吃飯',mood:'平靜',durationMinutes:15,intents:[]});});
  try{
   await view.goto(url);await navigate(view,'設定');await view.getByRole('combobox',{name:'決策方式',exact:true}).click();await view.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate(view,'觀察');
   const before=modelRequests.length;const response=view.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await view.getByRole('button',{name:'下一回合',exact:true}).click();const result=await response;assert.equal(result.status(),kind==='denied'?200:kind==='budget'?429:502,await result.text());
   const saved=(await (await view.request.get(url+'/api/world')).json()).world;assert.equal(saved.objects?.length||0,0);assert.equal(saved.supplies[0].remaining,1);assert.equal(modelRequests.length-before,kind==='budget'?1:2);assert.equal(saved.aiUsage.totalCalls,kind==='budget'?1:2);
   if(kind==='denied')assert.equal(saved.turn,1);else{assert.equal(saved.turn,0);await view.getByRole('alert').waitFor();}
   console.log(`PASS #93 real browser ${kind}: no phantom object, retained known usage and bounded dispatch`);
  }finally{await context.close();}
 };
 for(const kind of ['denied','invalid','budget','save','stale'])await runVariant(kind);
}finally{await browser?.close();server.close();}
