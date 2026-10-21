import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
import {approval,proposal,vessel} from './routine-program-fixture.mjs';
import shared from './routine-results-fixture.cjs';
const kind=process.argv[2]||'flow',values={'critical-success':.99,success:.7,mixed:.5,failure:.2,'critical-failure':0,flow:.5};
process.env.BROWSER_ARTIFACT_DIR ||= '/tmp/npc129-browser';await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
let browser;const oldRandom=Math.random;
try{
 const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-world'};world.objects=[{...vessel('tools'),state:{condition:'sound'},stateTransitions:{condition:['sound','broken']}},vessel('cup-a'),vessel('cup-b')];world.supplies=shared.raw();store.install(world);
 let decision=proposal,value=values[kind],npc=0,adjudication=0,dice=0;const reply=shared.uncertain(approval);setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){adjudication++;return completion(reply);}npc++;return completion(decision);});Math.random=()=>{dice++;return value;};
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:960}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const act=async(button,operation)=>{const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},clock.now);const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation===operation);await button.click();const response=await pending;assert.equal(response.status(),200,await response.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
 const advance=()=>act(page.getByRole('button',{name:'下一回合',exact:true}),'advance');
 const selectAI=async()=>{await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');};
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await selectAI();
 let saved=await advance();assert.equal(saved.characters[0].plan.selectedResult.outcome,kind==='flow'?'mixed':kind);const plan=structuredClone(saved.characters[0].plan);await page.reload();assert.deepEqual((await read()).characters[0].plan,plan);await selectAI();saved=await advance();
 const expected=['critical-success','success'].includes(kind)?'tea':['mixed','flow'].includes(kind)?'water':'empty';assert.equal(saved.objects.find(o=>o.id==='cup-a').state.contents,expected);assert.equal(saved.objects.find(o=>o.id==='raw-tea:3').lifecycle,'consumed');assert.equal(saved.supplies.some(s=>s.pending),false);
 if(kind==='flow'){
  value=.99;decision={...proposal,content:'泡一杯茶'};saved=await advance();assert.equal(saved.objects.find(o=>o.id==='cup-b').state.contents,'water');assert.equal(adjudication,1);assert.equal(dice,2);const second=structuredClone(saved.characters[0].plan);
  await nav('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath('reused.png')});await nav('觀察');
  await page.getByRole('combobox',{name:'事件知情對象',exact:true}).click();await page.getByRole('option',{name:'只對 店主 說',exact:true}).click();await page.getByLabel('你想說的話或發生的事',{exact:true}).fill('稍後想聊聊');await act(page.getByRole('button',{name:'加入事件',exact:true}),'intervene');decision={...proposal,type:'continue'};saved=await advance();assert.equal(saved.objects.find(o=>o.id==='cup-b').state.contents,'tea');assert.equal(saved.characters[0].plan,undefined);assert.equal(second.startedAt+30,second.until);assert.equal(dice,2);
  decision={...proposal,content:'泡一杯茶'};saved=await advance();const third=saved.characters[0].plan,thirdCup=saved.objects.find(o=>'contents' in o.state&&!['cup-a','cup-b'].includes(o.id));assert.ok(third);assert.equal(thirdCup.state.contents,'water');
  await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();saved=await act(page.getByRole('region',{name:'店主直接控制'}).getByRole('button',{name:'暫時接管店主'}),'takeover');assert.equal(saved.characters[0].plan,undefined);assert.equal(saved.supplies.some(s=>s.pending),false);assert.equal(saved.objects.find(o=>o.id===thirdCup.id).state.contents,'water');await act(page.getByRole('region',{name:'店主直接控制'}).getByRole('button',{name:'交還控制權'}),'return-control');saved=await read();assert.deepEqual({npc,adjudication,dice},{npc:4,adjudication:1,dice:3});
 }
 const latest=requests.filter(r=>r.operation==='advance').at(-1),before=structuredClone(saved.objects);assert.equal((await page.request.post(url+'/api/world',{data:latest})).status(),200);await page.reload();assert.deepEqual((await read()).objects,before);await nav('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});assert.match(await panel.innerText(),/cup-a/);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath(kind+'.png')});assert.deepEqual(errors,[]);if(kind!=='flow')assert.deepEqual({npc,adjudication,dice},{npc:1,adjudication:1,dice:1});
 console.log(`PASS #129 Chromium ${kind}: saved rule/outcome, actual materials and cups, API/SQLite/UI reload/replay; ${npc} NPC + ${adjudication} adjudication + ${dice} dice.`);
}catch(error){console.error(error);process.exitCode=1;}finally{Math.random=oldRandom;await browser?.close();server.close();}
