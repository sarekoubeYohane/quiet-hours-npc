import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';

process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/world-object-146');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
// Initial world/model/randomness are fixtures; all later state changes travel
// through the actual WorldApp, world API, activity lifecycle and SQLite store.
const world=load('world').seedWorld();
world.characters=world.characters.filter(c=>c.id==='owner');world.contextId='browser-object-146';
world.adjudication={provider:'openai',model:'fixture-world'};world.playerBudget={calls:60,tokens:1000000};
world.objects=[{id:'original-cup',source:'original-supply',label:'原杯子',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea']}}];
store.install(world);
let value='茶漬',from=null,npc=0,adjudication=0;
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content);
 const judgment=input.contractVersion==='world-adjudication.v1';
 if(judgment)adjudication++;else npc++;
 const reply=judgment?{status:'accepted',completionMinutes:15,effects:[{kind:'change-state',exposure:'public',version:1,access:'authorized',target:{type:'object',id:'original-cup'},expectedRevision:store.snapshot().objects[0].revision,changes:[{key:'surface',from,value}],reason:'觀察者裁定理由，不能作為角色已知的隱藏原因。'}],stages:[],branches:null,check:null,routine:null}:{type:'propose',target:'original-cup',content:'整理杯子外側留下的痕跡',purpose:'整理物件',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]};
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
 let saved=await advance();assert.equal(saved.world.objects[0].state.surface,'茶漬');assert.equal(saved.world.objects[0].id,'original-cup');assert.equal(saved.world.objects[0].source,'original-supply');
 await nav('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});assert.match(await panel.innerText(),/surface.*茶漬/);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath('object-state.png')});
 const counts={npc,adjudication};await page.reload();await nav('分析');assert.match(await panel.innerText(),/surface.*茶漬/);
 const receipt=page.getByRole('region',{name:'操作驗收證據'});await receipt.getByText('查看操作驗收證據',{exact:true}).click();const replay=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operationId===saved.operation.evidence.operationId);await receipt.getByRole('button',{name:'重送同一操作（不新增回合）',exact:true}).click();assert.equal((await replay).status(),200);assert.deepEqual({npc,adjudication},counts);assert.deepEqual((await read()).world.objects,saved.world.objects);
 from='茶漬';value='濕潤';await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');saved=await advance();assert.equal(saved.world.objects[0].state.surface,'濕潤');assert.equal(saved.world.objects.length,1);assert.equal(saved.world.objects[0].revision,3);
 assert.doesNotMatch(saved.world.characters[0].activity,/觀察者裁定理由|隱藏原因/);
 const evidence={fixture:true,realPaidModelCalls:0,counts:{npc,adjudication},checks:{uiAdvance:true,sqliteReload:true,sameObject:true,sameOperationReplay:true,differentConfirmedConsequences:true},receipt:saved.operation.evidence,objects:saved.world.objects};
 await writeFile(outputPath('evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log('PASS #146 WorldApp + world API + SQLite new state, later consequence, reload and same-ID replay.');
}finally{await browser?.close();server.close();}
