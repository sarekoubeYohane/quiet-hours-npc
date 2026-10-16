import assert from 'node:assert/strict';
import {url,server,store,load,requests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const navigate=(page,name)=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
const instant=Date.parse('2026-10-15T16:00:00Z');
const world=load('world').seedWorld();world.playerBudget={calls:120,tokens:500000};for(const c of world.characters)c.control={mode:'taken-over'};world.characters[0].control={mode:'autonomous'};
load('costs').savePrice(world,{provider:'openai',model:'gpt-6-luna',input:2,output:5,source:'fixed browser fixture',date:'2026-10-15'});store.install(world);
globalThis.fetch=async()=>Response.json({usage:{prompt_tokens:1000,completion_tokens:200},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[]})},finish_reason:'stop'}]});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.clock.install({time:instant});await page.clock.pauseAt(instant);
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
 await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 await navigate(page,'分析');const panel=page.getByRole('region',{name:'未來一小時費用推估',exact:true});await panel.waitFor({timeout:2000});assert.match(await panel.innerText(),/資料不足/);
 await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByRole('combobox',{name:'決策方式'}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate(page,'分析');
 const clock=async(ms)=>{await page.request.post(url+'/__fixture',{data:{advanceMs:ms}});await page.clock.runFor(ms);};
 const tick=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST');await clock(30000);assert.equal((await response).status(),200);await page.waitForFunction(()=>!document.querySelector('.advance-button')?.textContent.includes('處理中'));await clock(500);await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');};
 await page.getByRole('button',{name:'開始自動',exact:true}).click();await tick();assert.match(await panel.innerText(),/資料不足/);await tick();assert.match(await panel.innerText(),/玩家預估新增 USD 0.36/);assert.match(await panel.innerText(),/2 個完成回合/);
 console.log('PASS #83 initial/one-round insufficient, two real automatic rounds + waiting intervals estimate USD0.36');
 const replay=JSON.stringify(requests.filter(r=>r.operation==='advance').at(-1));await page.route('**/api/world',route=>route.request().method()==='POST'&&JSON.parse(route.request().postData()).operation==='advance'?route.continue({postData:replay}):route.continue());await tick();await page.unroute('**/api/world');assert.match(await panel.innerText(),/2 個完成回合/);console.log('PASS #83 real settled operation replay does not add forecast sample');
 await page.getByRole('button',{name:'暫停自動',exact:true}).click();const paused=await panel.innerText();await clock(600000);assert.equal(await panel.innerText(),paused);assert.match(paused,/假設恢復後持續運行/);
 await page.getByRole('button',{name:'開始自動',exact:true}).click();assert.match(await panel.innerText(),/資料不足/);await tick();await tick();assert.match(await panel.innerText(),/玩家預估新增 USD 0.36/);
 console.log('PASS #83 pause stops time accumulation, hypothetical paused forecast, resume resets sampling');
 await navigate(page,'設定');await page.getByRole('combobox',{name:'自動推進速度',exact:true}).click();await page.getByRole('option',{name:'每 10 秒',exact:true}).click();await navigate(page,'分析');assert.match(await panel.innerText(),/資料不足/);
 await page.getByRole('button',{name:'暫停自動',exact:true}).click();await navigate(page,'設定');await page.getByRole('combobox',{name:'推進時間間隔',exact:true}).click();await page.getByRole('option',{name:'30 分鐘',exact:true}).click();await navigate(page,'分析');assert.match(await panel.innerText(),/資料不足/);
 await navigate(page,'設定');await page.getByRole('combobox',{name:'OpenAI 模型',exact:true}).click();await page.getByRole('option',{name:'GPT-6.1 Sol',exact:true}).click();await navigate(page,'分析');assert.match(await panel.innerText(),/資料不足/);assert.match(await panel.innerText(),/站主服務費用未知/);
 console.log('PASS #83 interval/minutes/model changes reset, owner estimate separate unknown');

 await navigate(page,'設定');await page.getByRole('combobox',{name:'自動推進速度',exact:true}).click();await page.getByRole('option',{name:'每 30 秒',exact:true}).click();await navigate(page,'分析');
 await page.getByRole('button',{name:'開始自動',exact:true}).click();await tick();await tick();assert.match(await panel.innerText(),/無法完整推估/);assert.doesNotMatch(await panel.innerText(),/玩家預估新增 USD 0/);
 console.log('PASS #83 unpriced actual model calls produce unknown forecast, never free');
 await navigate(page,'設定');
 for(const [name,value]of [['輸入 USD 單價','1'],['輸出 USD 單價','1'],['價格來源','forecast updated fixture'],['價格更新日期','2026-10-15']])await page.getByLabel(name,{exact:true}).fill(value);
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'),page.getByRole('button',{name:'保存自訂單價',exact:true}).click()]);
 await page.waitForFunction(()=>!document.querySelector('.advance-button')?.textContent.includes('處理中'));await navigate(page,'分析');assert.match(await panel.innerText(),/資料不足/);assert.match(await panel.innerText(),/0 個完成回合/);
 await page.getByRole('button',{name:'暫停自動',exact:true}).click();
 const manual=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST');await page.getByRole('button',{name:'下一回合',exact:true}).click();await manual;await clock(500);assert.match(await panel.innerText(),/0 個完成回合/);
 console.log('PASS #83 price change resets, manual world advance never adds automatic samples');

 await page.getByRole('button',{name:'開始自動',exact:true}).click();await tick();const knownTransport=globalThis.fetch;globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[]})},finish_reason:'stop'}]});await tick();assert.match(await panel.innerText(),/部分估算：預估新增 USD/);assert.match(await panel.innerText(),/僅已知小計/);globalThis.fetch=knownTransport;await page.getByRole('button',{name:'暫停自動',exact:true}).click();console.log('PASS #83 known cost plus missing usage produces partial future estimate');
 await navigate(page,'設定');await page.getByLabel('輸入 USD 單價',{exact:true}).fill('0');await page.getByLabel('輸出 USD 單價',{exact:true}).fill('0');
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'),page.getByRole('button',{name:'保存自訂單價',exact:true}).click()]);await page.waitForFunction(()=>!document.querySelector('.advance-button')?.textContent.includes('處理中'));await navigate(page,'分析');
 await page.getByRole('button',{name:'開始自動',exact:true}).click();await tick();await tick();assert.match(await panel.innerText(),/玩家預估新增 USD 0（估算/);assert.doesNotMatch(await panel.innerText(),/無法完整推估/);

 const transport=globalThis.fetch;let release,entered;const enteredPromise=new Promise(resolve=>entered=resolve);globalThis.fetch=async(...args)=>{entered();await new Promise(resolve=>release=resolve);return transport(...args);};
 const held=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST');held.catch(()=>{});await clock(30000);await enteredPromise;await page.request.post(url+'/__fixture',{data:{advanceMs:601000}});await page.clock.setSystemTime((await page.evaluate(()=>Date.now()))+601000);await clock(1000);assert.match(await panel.innerText(),/資料不足/);release();const heldResponse=await held;globalThis.fetch=transport;await clock(500);if(heldResponse.status()!==200){await page.getByRole('button',{name:'開始自動',exact:true}).waitFor();await page.getByRole('button',{name:'開始自動',exact:true}).click();}await tick();await tick();assert.match(await panel.innerText(),/玩家預估新增 USD 0（估算/);
 console.log('PASS #83 hanging operation ages out ten-minute samples, completed release rebuilds fresh forecast');
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await page.getByRole('button',{name:'開始自動',exact:true}).waitFor();assert.match(await panel.innerText(),/2 個完成回合/);assert.match(await panel.innerText(),/假設恢復後持續運行/);
 const hidden=await panel.innerText();await clock(600000);assert.equal(await panel.innerText(),hidden);
 await Promise.all([page.waitForResponse(r=>r.url().includes('/api/world')&&r.request().method()==='GET'),page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));})]);assert.match(await panel.innerText(),/2 個完成回合/);
 console.log('PASS #83 explicit zero price complete USD0, background stops and excludes idle, repeated GET adds no sample');
 await page.screenshot({path:outputPath('browser83-paused.png'),fullPage:true});await navigate(page,'設定');await page.getByRole('combobox',{name:'決策方式'}).click();await page.getByRole('option',{name:'OpenRouter AI',exact:true}).click();await navigate(page,'分析');assert.match(await panel.innerText(),/0 個完成回合/);assert.match(await panel.innerText(),/資料不足/);console.log('PASS #83 provider change discards incompatible populated samples');await page.reload();await navigate(page,'分析');await panel.waitFor();assert.match(await panel.innerText(),/資料不足/);assert.match(await panel.innerText(),/0 個完成回合/);console.log('PASS #83 reload resets browser-local sampling');
 await page.screenshot({path:outputPath('browser83.png'),fullPage:true});assert.deepEqual(errors,[]);console.log('PASS #83 no page errors');
}catch(error){console.error('BROWSER83 FAILURE',error);throw error;}finally{await browser?.close();server.close();}
