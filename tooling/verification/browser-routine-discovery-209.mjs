import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const require=createRequire(import.meta.url),fixture=require('../../tests/routine-discovery-fixture.cjs'),f=require('../../tests/routine-world-programs-fixture.cjs');
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/routine-discovery-209');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const w=fixture.initialWorld(load('world').seedWorld);store.install(w);
const frames=[];let npc=0,judgments=0,rolls=0,sourceId;const random=Math.random;Math.random=()=>{rolls++;return .675;};
const realObjects=world=>(world.objects||[]).filter(object=>object.kind!=='phone');
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content);frames.push({request,input});let value;
 if(input.contractVersion==='world-adjudication.v1'){
  judgments++;assert.equal(input.phones,undefined);
  if(judgments===1){assert.equal(input.action.target,'cafe');assert.equal(input.supplies.length,0);value=f.approval([fixture.search()],'find-ingredient');}
  else{assert.equal(judgments,2);assert.equal(input.action.target,sourceId);value={status:'accepted',completionMinutes:15,effects:[{kind:'materialize',supplyId:sourceId,expectedRemaining:1}],check:null};}
 }else{
  npc++;let action={type:'rest',target:'',content:'稍作休息',purpose:''};
  if(npc===1){assert.equal(input.supplies.length,0);action={type:'propose',target:'cafe',content:'查看這裡可用的普通備餐材料',purpose:'確認可用材料'};}
  if(npc===2){assert.ok(input.supplies.some(source=>source.id===sourceId));assert.equal(input.supplies[0].availability,'unknown');assert.equal(input.objects.some(object=>object.kind==='cooking-ingredient'),false);}
  if(npc===3){assert.ok(input.supplies.some(source=>source.id===sourceId));action={type:'propose',target:sourceId,content:'取一份剛才找到的材料',purpose:'取得材料'};}
  value={...action,mood:'平靜',durationMinutes:15,timeIntent:{kind:action.type==='rest'?'open-ended':'completion',maxMinutes:null},intents:[]};
 }
 return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(20000);await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click(),read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const counts=()=>({npc,judgments,rolls}),steps=[];let searchOperation,acquiredId;
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
 for(let i=0;i<4;i++){
  const pending=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');const saved=await read();
  assert.equal(saved.supplies.length,1);sourceId ||= saved.supplies[0].id;assert.equal(saved.supplies[0].id,sourceId);assert.equal(saved.supplies[0].remaining,1);assert.equal(saved.supplies[0].pending,undefined);assert.deepEqual(saved.supplies[0].knownTo,['owner']);assert.equal(saved.supplies[0].owner,'owner');assert.deepEqual(saved.supplies[0].allowedTo,['owner']);
  steps.push({minute:saved.minute,...counts(),sources:saved.supplies.length,objects:realObjects(saved).length,sequence:saved.supplies[0].background.sequence,sourceKnown:true});
  if(i===0){
   searchOperation=requests.filter(item=>item.operation==='advance').at(-1);assert.equal(realObjects(saved).length,0);assert.equal(saved.supplies[0].background.sequence,0);const observation=saved.characters[0].shortTerm.find(memory=>memory.observation?.supplyId===sourceId);assert.ok(observation);assert.equal(observation.source.supply,sourceId);assert.equal(rolls,1);
   await nav('分析');const source=page.getByRole('region',{name:'日常規則與成果'});await source.waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await source.screenshot({path:outputPath('confirmed-source.png')});const perception=page.locator('.analysis-events .perception-details').filter({hasText:'普通備餐材料'});await perception.getByText('感知詳情（觀察者）',{exact:true}).click();await perception.scrollIntoViewIfNeeded();assert.match(await perception.innerText(),/來源：普通備餐材料/);await page.screenshot({path:outputPath('source-perception.png')});
   const before=counts();await page.reload();assert.deepEqual(counts(),before);assert.equal((await read()).supplies[0].id,sourceId);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
  }
  if(i===1){assert.equal(realObjects(saved).length,0);assert.equal(judgments,1);}
  if(i===2){const actual=realObjects(saved)[0];assert.ok(actual);acquiredId=actual.id;assert.equal(actual.source,sourceId);assert.equal(actual.holder,'owner');assert.equal(actual.owner,'owner');assert.equal(actual.lifecycle,'active');assert.equal(saved.supplies[0].background.sequence,1);}
 }
 const saved=await read(),lastNpc=frames.filter(frame=>frame.input.self).at(-1);assert.equal(npc,4);assert.equal(judgments,2);assert.equal(rolls,1);assert.ok(lastNpc.input.objects.some(object=>object.id===acquiredId));assert.ok(lastNpc.input.supplies.some(source=>source.id===sourceId));assert.equal(JSON.stringify(frames.filter(frame=>frame.input.self).map(frame=>frame.request.messages)).includes('allowedTo'),false);
 await nav('分析');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.getByRole('region',{name:'日常規則與成果'}).screenshot({path:outputPath('acquired-material.png')});const before=counts();await page.reload();assert.deepEqual(counts(),before);const lastOperation=requests.filter(item=>item.operation==='advance').at(-1);for(const operation of [searchOperation,lastOperation]){assert.equal((await page.request.post(url+'/api/world',{data:operation})).status(),200);assert.deepEqual(counts(),before);}assert.deepEqual((await read()).supplies,saved.supplies);assert.deepEqual((await read()).objects,saved.objects);
 await page.setViewportSize({width:390,height:844});await nav('分析');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:outputPath('mobile-analysis.png')});assert.deepEqual(errors,[]);
 const npcFrames=frames.filter(frame=>frame.input.self),judgmentFrames=frames.filter(frame=>frame.input.contractVersion==='world-adjudication.v1');
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,realPaidCalls:0,existingUiAdvances:4,npc,judgments,rolls,steps,checks:{actualWorldApp:true,confirmedOrdinaryBackground:true,searchNoPhysicalObject:true,actualSourcePerception:true,sqliteReload:true,nextActualMessages:true,laterMaterialization:true,continuousSourceIdentity:true,noImplicitPermission:true,reloadZeroDispatch:true,searchAndLastOperationReplayZeroDispatch:true,desktop1280:true,mobile390NoOverflow:true,pageErrors:errors},capacity:{maxNpcInputBytes:Math.max(...npcFrames.map(frame=>Buffer.byteLength(frame.request.messages[1].content))),maxRequestBytes:Math.max(...frames.map(frame=>Buffer.byteLength(JSON.stringify(frame.request)))),maxAuthorityBytes:Math.max(...judgmentFrames.map(frame=>Buffer.byteLength(JSON.stringify({objects:frame.input.objects,supplies:frame.input.supplies})))),worldBytes:Buffer.byteLength(JSON.stringify(saved)),suppliesBytes:Buffer.byteLength(JSON.stringify(saved.supplies)),memoryBytes:Buffer.byteLength(JSON.stringify(saved.characters[0].shortTerm)),receiptBytes:Buffer.byteLength(JSON.stringify([saved.probeResults,saved.perceptionTrials]))}},null,2)+'\n');console.log('PASS #209 actual WorldApp/API/SQLite/next messages: ordinary source discovery then materialization; 4 NPC + 2 judgments + 1 perception roll');
}finally{Math.random=random;await browser?.close();server.close();}
