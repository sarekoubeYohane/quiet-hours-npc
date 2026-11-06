import {fixtureDecision} from '../../tests/pursuit-fixture.cjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';

process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/controlled-feelings-262');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();
world.characters=world.characters.filter(c=>c.id==='owner');world.contextId='browser-controlled-feelings-262';world.adjudication={provider:'openai',model:'fixture-world'};
const policy={version:1,kind:'test',id:'browser-controlled-feelings-262',initial:5,maximum:20,awakePerHour:0,regulationCost:4,lowAt:4,experience:{levels:[0,2,5]},process:{seed:1,slotMinutes:10,levels:[0,6,12],multipliers:[1]}};
load('cloudflare-workers').env.MENTAL_ENERGY_TEST_POLICY=JSON.stringify(policy);store.install(world);
let npc=0,feelings=0;
const inputs=[];
const update=input=>{
 const memory=input.self.shortTerm.findLast(m=>m.feelingSources?.length);
 return memory?[{source:memory.feelingSources[0],direction:'positive',level:1,reason:'這份陪伴與主動調節是獨立經歷',mood:'有人陪伴而安心'}]:[];
};
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content);inputs.push(input);
 assert.equal(input.self.mentalEnergy.value,undefined);assert.equal(input.self.mentalEnergy.policy,undefined);
 let value;
 if(input.contractVersion==='controlled-feelings.v1'){
  feelings++;value={contractVersion:'controlled-feelings.v1',feelingUpdates:update(input),processFeeling:feelings===1?{direction:'positive',level:1,reason:'我享受這段由使用者選定的休息'}:null};
 }else{
  npc++;value=fixtureDecision(input,{type:npc===2?'continue':'reflect',target:'',content:'保留自己的思考和選擇',mood:'舊欄位無權覆寫',durationMinutes:90,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[],feelingUpdates:npc===2?update(input):[],processFeeling:null,emotionRegulation:npc===2?{effort:'放慢呼吸，重新理解眼前的挫折',reason:'先緩和到能承受，仍可以保留餘力',mood:'仍難受但能承受'}:null});
 }
 return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));page.on('dialog',dialog=>dialog.accept());page.setDefaultTimeout(15000);
 await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const operation=async(name,click)=>{const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation===name);await click();const response=await pending;assert.equal(response.status(),200,await response.text());return read();};
 const advance=async()=>{
  const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},clock.now);
  const saved=await operation('advance',()=>page.getByRole('button',{name:'下一回合',exact:true}).click());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return saved;
 };
 const intervene=async text=>{await page.getByRole('textbox',{name:'你想說的話或發生的事'}).fill(text);await operation('intervene',()=>page.getByRole('button',{name:'加入事件',exact:true}).click());await page.waitForFunction(()=>document.getElementById('intervention')?.value==='');};
 await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
 await page.goto(url);await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
 let saved=await advance();assert.equal(saved.characters[0].mentalEnergy.value,5);
 await intervene('我願意陪你面對這次挫折。');saved=await advance();assert.equal(saved.characters[0].mentalEnergy.value,3);assert.equal(saved.characters[0].mentalEnergy.history.filter(e=>e.kind==='regulation').length,1);
 await operation('takeover',()=>page.getByRole('button',{name:'暫時接管店主',exact:true}).click());
 const habitsBefore=structuredClone((await read()).characters[0].habitEvidence||[]);
 await operation('direct',()=>page.getByRole('button',{name:'單次指定下一行動',exact:true}).click());
 saved=await advance();let actor=saved.characters[0];assert.equal(actor.control.mode,'taken-over');assert.equal(actor.plan.action.type,'rest');assert.equal(actor.mentalEnergy.value,3);assert.equal(feelings,1);assert.equal(npc,2);
 const activityId=actor.plan.mentalProcess.id;
 saved=await advance();assert.equal(saved.characters[0].mentalEnergy.value,4.5);assert.equal(feelings,1);
 await intervene('接管期間，我仍在這裡陪你。');saved=await advance();actor=saved.characters[0];assert.equal(actor.mentalEnergy.value,8);assert.equal(actor.plan.mentalProcess.id,activityId);assert.equal(actor.plan.action.type,'rest');assert.equal(actor.mentalEnergy.history.filter(e=>e.kind==='regulation').length,1);assert.deepEqual(actor.habitEvidence||[],habitsBefore);assert.equal(feelings,2);assert.equal(npc,2);
 const snapshot=structuredClone(actor),lastOperation=requests.filter(r=>r.operation==='advance').at(-1);
 const replay=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:lastOperation});assert.equal(replay.status(),200);assert.deepEqual((await replay.json()).world.characters[0],snapshot);assert.equal(feelings,2);
 await nav('分析');const panel=page.getByRole('heading',{name:'精神電量',exact:true}).locator('..');await panel.getByText('觀察者數值：8/20',{exact:true}).waitFor();await panel.getByText('最近的精神電量變化',{exact:true}).click();await panel.screenshot({path:outputPath('controlled-energy-panel.png')});
 await page.getByText('已發生用量與當時價格依據',{exact:true}).click();const costs=page.getByRole('region',{name:'已發生費用估算'});await costs.getByText('接管感受評估',{exact:false}).waitFor();await costs.screenshot({path:outputPath('controlled-usage-panel.png')});
 await page.reload();await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await nav('分析');await page.getByText('觀察者數值：8/20',{exact:true}).waitFor();assert.deepEqual((await read()).characters[0],snapshot);assert.equal(feelings,2);
 const resumedClock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},resumedClock.now);
 await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');await operation('return-control',()=>page.getByRole('button',{name:'交還控制權',exact:true}).click());saved=await advance();
 assert.equal(saved.characters[0].mentalEnergy.value,8);assert.equal(saved.characters[0].mentalEnergy.history.filter(e=>e.kind==='regulation').length,1);assert.equal(npc,3);assert.equal(feelings,2);assert.equal(saved.aiUsage.totalCalls,5);assert.equal(saved.aiUsage.totalInputTokens,150);assert.equal(saved.aiUsage.totalOutputTokens,50);
 const cohorts=Object.values(saved.aiUsage.costs.total);assert.equal(cohorts.find(c=>c.task==='feelings').calls,2);assert.equal(cohorts.find(c=>c.task==='npc').calls,3);assert.ok(!JSON.stringify(inputs).includes(policy.id));assert.ok(!JSON.stringify(inputs).includes('multipliers'));assert.deepEqual(errors,[]);
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,realPaidCalls:0,counts:{npc,feelings},checks:{realUI:true,priorVoluntaryRegulation:true,controlledActivityPreserved:true,controlledNaturalFeeling:true,noControlledRegulation:true,noAutonomousHabit:true,noPerIntervalModel:true,purposeAccounting:true,sqliteReload:true,sameOperationReplay:true,returnControl:true},world:saved,inputs},null,2));
 console.log('PASS #262 Chromium: real income/regulation → takeover feelings/process → no-call continuation → return control; SQLite/replay/purpose ledger; 3 NPC + 2 feelings controlled calls, 0 paid.');
}finally{await browser?.close();server.close();}
