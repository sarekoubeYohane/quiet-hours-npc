import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';

process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/world-formation-149');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
// Initial world/model/randomness are fixtures; all later state changes travel
// through the actual WorldApp, world API, activity lifecycle and SQLite store.
const world=load('world').seedWorld();
world.characters=world.characters.filter(c=>['owner','cass'].includes(c.id));Object.assign(world.characters.find(c=>c.id==='cass'),{location:'cafe',region:'cafe-front'});world.contextId='browser-formation-149';
world.adjudication={provider:'openai',model:'fixture-world'};world.playerBudget={calls:60,tokens:1000000};
world.objects=[{id:'cake',source:'last-cake',label:'最後一個蛋糕',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{},lifecycle:'active',kind:'food',knownTo:['owner'],allowedTo:['owner']}];
world.objects.push({...world.objects[0],id:'flour',source:'flour-stock',label:'麵粉',kind:'raw-material',consumable:false},{...world.objects[0],id:'sugar',source:'sugar-stock',label:'糖',owner:'cass',kind:'raw-material',consumable:false},{...world.objects[0],id:'shared-cup',source:'cup-stock',label:'Cass的杯子',owner:'cass',holder:'cass',kind:'utensil',allowedTo:[],knownTo:['owner','cass'],consumable:false});
world.supplies=[{id:'last-cake',label:'最後一個蛋糕',region:'cafe-front',remaining:0,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];
store.install(world);
let step=0,npc=0,adjudication=0;
const form={kind:'form',version:1,access:'authorized',operation:'partition',inputs:[{objectId:'cake',expectedRevision:1,quantity:{amount:1,unit:'item'},disposition:'consumed'}],outputs:[{id:'cake-pieces',label:'切成四份的蛋糕',kind:'food',consumable:true,quantity:{amount:4,unit:'piece'},state:[]}],reason:'原蛋糕已切開；四份先整體追蹤。'};
const stages=[
 {target:'cake',content:'將蛋糕切成四份，先整體保存',effects:[form]},
 {target:'cake-pieces',content:'取出其中一份作獨立拿取',effects:[{kind:'separate',version:1,access:'authorized',objectId:'cake-pieces',expectedRevision:1,quantity:{amount:1,unit:'piece'},outputId:'cake-piece-one',reason:'這份現在需要獨立拿取。'}]},
 {target:'cake-piece-one',content:'吃掉已獨立拿取的一份',effects:[{kind:'consume',objectId:'cake-piece-one',expectedRevision:1}]},
 {target:'flour',content:'把兩份已獲准的材料製成一組糕點',effects:[{kind:'form',version:1,access:'authorized',operation:'transform',inputs:['flour','sugar'].map(objectId=>({objectId,expectedRevision:1,quantity:{amount:1,unit:'item'},disposition:'consumed'})),outputs:[{id:'shared-pastry',label:'共同來源的糕點',kind:'pastry',consumable:true,quantity:{amount:2,unit:'item'},state:[]}],reason:'兩種材料的來源與共同權利保持。'}]},
 {target:'shared-cup',content:'把另一角色持有的杯子打碎成一組碎片',effects:[{kind:'form',version:1,access:'physical',operation:'partition',inputs:[{objectId:'shared-cup',expectedRevision:1,quantity:{amount:1,unit:'item'},disposition:'destroyed'}],outputs:[{id:'cup-shards',label:'杯子碎片',kind:'ceramic-fragments',consumable:false,quantity:{amount:5,unit:'piece'},state:[]}],reason:'已確認的物理碎裂不代表物主同意。'}]},
 {target:'cup-shards',content:'把一片碎片細分出來單獨處置',effects:[{kind:'separate',version:1,access:'physical',objectId:'cup-shards',expectedRevision:1,quantity:{amount:1,unit:'piece'},outputId:'single-shard',reason:'細分承接已存在的一片，不複製歷史。'}]},
];
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content),judgment=input.contractVersion==='world-adjudication.v1';
 if(judgment)adjudication++;else npc++;
 const stage=stages[step];
 const reply=judgment?{status:'accepted',completionMinutes:15,effects:stage.effects,stages:[],branches:null,check:null,routine:null}:input.self.id==='owner'?{type:'propose',target:stage.target,content:stage.content,purpose:'材料處理',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]}:{type:'rest',target:'',content:'安靜休息',purpose:'休息',mood:'平靜',durationMinutes:90,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[]};
 return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(reply)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);
 await page.addInitScript(now=>{Date.now=()=>now;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const read=async id=>{const response=await page.request.get(url+'/api/world'+(id?'?operationId='+encodeURIComponent(id):''));assert.equal(response.status(),200);return response.json();};
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
 await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
 const advance=async()=>{
  const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},clock.now);
  const pending=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,(await response.json()).error);await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');const id=requests.filter(request=>request.operation==='advance').at(-1).operationId;return read(id);
 };
 let saved=await advance();assert.equal(saved.world.objects.find(o=>o.id==='cake').lifecycle,'consumed');assert.equal(saved.world.objects.find(o=>o.id==='cake-pieces').quantity.amount,4);
 step=1;saved=await advance();assert.equal(saved.world.objects.find(o=>o.id==='cake-pieces').quantity.amount,3);assert.equal(saved.world.objects.find(o=>o.id==='cake-piece-one').quantity.amount,1);
 await nav('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});assert.match(await panel.innerText(),/3.*piece/);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath('cake-separated.png')});
 const counts={npc,adjudication},before=structuredClone(saved.world.objects);await page.reload();await nav('分析');assert.match(await panel.innerText(),/3.*piece/);
 const receipt=page.getByRole('region',{name:'操作驗收證據'});await receipt.getByText('查看操作驗收證據',{exact:true}).click();const replay=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operationId===saved.operation.evidence.operationId);await receipt.getByRole('button',{name:'重送同一操作（不新增回合）',exact:true}).click();assert.equal((await replay).status(),200);assert.deepEqual({npc,adjudication},counts);assert.deepEqual((await read()).world.objects,before);
 step=2;await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');saved=await advance();assert.equal(saved.world.objects.find(o=>o.id==='cake-piece-one').lifecycle,'consumed');assert.equal(saved.world.objects.find(o=>o.id==='cake-pieces').quantity.amount,3);
 step=3;saved=await advance();const shared=saved.world.objects.find(o=>o.id==='shared-pastry');assert.deepEqual(shared.coOwners,['owner','cass']);assert.deepEqual(shared.allowedTo,['owner']);assert.equal(shared.sources.length,2);await nav('分析');assert.match(await panel.innerText(),/共同來源權利/);assert.match(await panel.innerText(),/flour.*sugar/);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath('shared-source-product.png')});await nav('觀察');
 step=4;saved=await advance();const cup=saved.world.objects.find(o=>o.id==='shared-cup');assert.equal(cup.lifecycle,'destroyed');assert.equal(cup.owner,'cass');assert.deepEqual(cup.allowedTo,[]);assert.equal(cup.unpermittedCount,1);assert.equal(saved.world.objects.find(o=>o.id==='cup-shards').quantity.amount,5);
 step=5;saved=await advance();assert.equal(saved.world.objects.find(o=>o.id==='cup-shards').quantity.amount,4);assert.equal(saved.world.objects.find(o=>o.id==='single-shard').physicalHistory,undefined);await nav('分析');assert.match(await panel.innerText(),/未獲許可/);assert.match(await panel.innerText(),/4.*piece/);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath('physical-shards.png')});
 await page.reload();assert.deepEqual((await read()).world.objects,saved.world.objects);assert.equal(adjudication,6);
 const evidence={fixture:true,realPaidModelCalls:0,counts:{npc,adjudication},checks:{uiAdvance:true,sqliteReload:true,partitionRecorded:true,quantityPreserved:true,sameOperationReplay:true,independentPortionConsumed:true,multipleSources:true,jointOwners:true,physicalPartition:true,physicalHistory:true,childHistoryNotInvented:true},receipt:saved.operation.evidence,objects:saved.world.objects};
 await writeFile(outputPath('evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log('PASS #149 WorldApp + world API + SQLite aggregate partition, separate portion, consumption, multi-source ownership, physical fragments, reload and same-ID replay.');
}finally{await browser?.close();server.close();}
