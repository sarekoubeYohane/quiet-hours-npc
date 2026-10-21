import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';

process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/world-physical-147');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
// Only initial world, model transport and dice are fixtures. Subsequent effects,
// UI actions, operation replay, serialization and SQLite use the application.
const world=load('world').seedWorld();world.contextId='browser-physical-147';
world.characters=world.characters.filter(c=>['cass','owner'].includes(c.id));
for(const c of world.characters){c.location='kris-home';c.region='kris-home-main';}
world.characters.find(c=>c.id==='owner').control={mode:'taken-over'};
world.adjudication={provider:'openai',model:'fixture-world'};world.playerBudget={calls:60,tokens:1000000};
const cup=(id,holder,allowedTo)=>({id,source:'old-supply',label:id==='borrowed-cup'?'借來的杯子':'物主持有的杯子',region:'kris-home-main',holder,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['cass','owner'],allowedTo});
world.objects=[cup('borrowed-cup','cass',['cass','owner']),cup('held-cup','owner',['owner'])];
store.install(world);let step=0,npc=0,adjudication=0;const originalRandom=Math.random;let dice=0;Math.random=()=>{dice++;return 0;};
const physical=(operation,objectId,revision)=>({kind:'physical',version:1,operation,objectId,expectedRevision:revision,reason:'觀察者的隱藏裁定原因，不代表物主同意。'});
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content),judgment=input.contractVersion==='world-adjudication.v1';
 assert.doesNotMatch(JSON.stringify(input),/operationEvidence|觀察者的隱藏裁定原因/);
 let value;
 if(judgment){
  adjudication++;
  const effects=step===0?[physical('destroy','borrowed-cup',1)]:step===1?[physical('take','held-cup',1)]:[{kind:'change-state',exposure:'public',version:1,access:'physical',target:{type:'object',id:'held-cup'},expectedRevision:2,changes:[{key:'surface',from:null,value:'濕潤'}],reason:'觀察者的隱藏裁定原因，不代表物主同意。'}];
  value={status:'accepted',completionMinutes:15,effects,stages:[],branches:null,check:null,routine:null};
  if(step===0)value={...value,effects:[],check:{difficulty:12,ability:'拿穩杯子'},branches:[{outcomes:['critical-success','success','mixed'],effects:[],stages:[]},{outcomes:['failure','critical-failure'],effects,stages:[]}]};
 }else{npc++;value={type:'propose',target:step===0?'borrowed-cup':'held-cup',content:step===0?'拿穩借來的杯子時手滑':'不等待物主許可，直接操作面前的杯子',purpose:'操作物件',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]};}
 return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);
 await page.addInitScript(now=>{Date.now=()=>now;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const read=async id=>{const response=await page.request.get(url+'/api/world'+(id?'?operationId='+encodeURIComponent(id):''));assert.equal(response.status(),200);return response.json();};
 const selectAI=async()=>{await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');};
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await selectAI();
 const advance=async()=>{
  const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},clock.now);
  const pending=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,(await response.json()).error);await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');const id=requests.filter(request=>request.operation==='advance').at(-1).operationId;return read(id);
 };
 const snapshots=[];let saved=await advance();snapshots.push(saved.operation.evidence);assert.equal(saved.world.objects[0].lifecycle,'destroyed');assert.equal(saved.world.objects[0].owner,'owner');assert.equal(saved.world.objects[0].physicalHistory[0].permitted,true);assert.deepEqual(saved.world.objects[0].allowedTo,['cass','owner']);assert.equal(dice,1);
 step=1;saved=await advance();snapshots.push(saved.operation.evidence);assert.equal(saved.world.objects[1].holder,'cass');assert.equal(saved.world.objects[1].owner,'owner');assert.deepEqual(saved.world.objects[1].allowedTo,['owner']);assert.equal(saved.world.objects[1].acceptedBy,undefined);assert.equal(saved.world.objects[1].unpermittedCount,1);
 step=2;saved=await advance();snapshots.push(saved.operation.evidence);assert.equal(saved.world.objects[1].state.surface,'濕潤');assert.equal(saved.world.objects[1].source,'old-supply');assert.equal(saved.world.objects[1].unpermittedCount,2);assert.equal(saved.operation.evidence.dispatches.find(d=>d.task==='adjudication').candidate.value.effects[0].access,'physical');assert.equal(saved.world.characters.find(c=>c.id==='owner').goal,world.characters.find(c=>c.id==='owner').goal);
 const counts={npc,adjudication,dice};await nav('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});assert.match(await panel.innerText(),/已損毀/);assert.match(await panel.innerText(),/surface.*濕潤/);assert.match(await panel.innerText(),/未獲許可累計 2 次/);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath('physical-consequences.png')});
 await page.reload();await nav('分析');assert.match(await panel.innerText(),/surface.*濕潤/);const receipt=page.getByRole('region',{name:'操作驗收證據'});await receipt.getByText('查看操作驗收證據',{exact:true}).click();const replay=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operationId===saved.operation.evidence.operationId);await receipt.getByRole('button',{name:'重送同一操作（不新增回合）',exact:true}).click();assert.equal((await replay).status(),200);assert.deepEqual({npc,adjudication,dice},counts);assert.deepEqual((await read()).world.objects,saved.world.objects);
 assert.doesNotMatch(saved.world.characters.find(c=>c.id==='cass').activity,/觀察者的隱藏裁定原因/);
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,realPaidModelCalls:0,counts,checks:{borrowedAccidentalDamage:true,otherHolderPhysicalTake:true,noForgedConsent:true,sameIdentity:true,physicalState:true,sqliteReload:true,sameIdReplay:true},snapshots,objects:saved.world.objects},null,2)+'\n');
 console.log('PASS #147 WorldApp + world API + SQLite borrowed damage, unpermitted held-object operation, autonomy and same-ID replay.');
}finally{Math.random=originalRandom;await browser?.close();server.close();}
