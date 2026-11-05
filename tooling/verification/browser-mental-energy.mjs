import {fixtureDecision} from '../../tests/pursuit-fixture.cjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/mental-energy');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.contextId='browser-life-needs';world.adjudication={provider:'openai',model:'fixture-world'};
const policy={version:1,kind:'test',id:'browser-energy-257',initial:10,maximum:20,awakePerHour:12,regulationCost:7,lowAt:10};
load('cloudflare-workers').env.MENTAL_ENERGY_TEST_POLICY=JSON.stringify(policy);store.install(world);
let npc=0;const inputs=[];
setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);inputs.push(input);npc++;assert.equal(input.self.mentalEnergy.canRegulate,true);assert.equal(input.self.mentalEnergy.value,undefined);assert.equal(input.self.mentalEnergy.policy,undefined);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'rest',target:'',content:'坐下休息',mood:'心情不錯',durationMinutes:90,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[]}))}}]});});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const advance=async()=>{const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},clock.now);const waiting=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await waiting;assert.equal(response.status(),200,await response.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
 await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await nav('分析');await page.getByText('精神電量尚未啟用',{exact:false}).waitFor();await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
 let saved=await advance();assert.equal(saved.characters[0].mentalEnergy.value,7);const state=structuredClone(saved.characters[0].mentalEnergy);
 await nav('分析');await page.getByRole('heading',{name:'精神電量',exact:true}).waitFor();await page.getByText('觀察者數值：7/20',{exact:true}).waitFor();await page.getByText('最近的精神電量變化',{exact:true}).click();await page.getByRole('heading',{name:'精神電量',exact:true}).locator('..').screenshot({path:outputPath('energy-panel.png')});
 const replay=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:requests.filter(r=>r.operation==='advance').at(-1)});assert.equal(replay.status(),200);assert.deepEqual((await replay.json()).world.characters[0].mentalEnergy,state);assert.equal(npc,1);
 await page.reload();await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await nav('分析');await page.getByText('觀察者數值：7/20',{exact:true}).waitFor();assert.deepEqual((await read()).characters[0].mentalEnergy,state);
 await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');saved=await advance();assert.equal(saved.characters[0].mentalEnergy.value,4);assert.equal(npc,1);assert.equal(saved.aiUsage.totalCalls,1);assert.deepEqual(errors,[]);
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,realPaidCalls:0,counts:{npc},checks:{uiActivation:true,uiAdvance:true,sqliteReload:true,sameOperationReplay:true,privateFeelings:true,awakeRest:true},state:saved.characters[0].mentalEnergy,inputs},null,2));
 console.log('PASS #257 Chromium: explicit activation, real UI advance, awake rest consumption, SQLite reload, replay; 1 controlled NPC call; no paid calls.');
}finally{await browser?.close();server.close();}
