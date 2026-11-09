import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/time-276');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.contextId='browser-time-276';world.characters[0].control={mode:'taken-over',pending:{type:'shout',target:'observer',content:'十五分鐘後才出現'}};store.install(world);
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 await page.route('**/api/world',async route=>{if(route.request().method()==='POST'&&JSON.parse(route.request().postData()).operation==='advance'){const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},clock.now);}await route.continue();});
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const clickAdvance=async expected=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const r=await response;assert.equal(r.status(),200,await r.text());await page.waitForFunction(()=>!document.querySelector('[data-time-batch]'));await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');assert.equal((await read()).minute,expected);};
 await page.goto(url);assert.equal((await read()).timeContract,undefined);await clickAdvance(world.minute+5);let saved=await read();assert.equal(saved.timeContract,'five-minute-v1');assert.equal(saved.characters[0].plan.startedAt,world.minute+5);assert.equal(saved.characters[0].plan.until,world.minute+20);assert.equal(saved.events.some(e=>e.kind==='shout'),false);
 await nav('設定');await page.getByRole('combobox',{name:'推進時間間隔',exact:true}).click();await page.getByRole('option',{name:'15 分鐘（3 步）',exact:true}).click();await nav('觀察');await clickAdvance(world.minute+20);saved=await read();assert.equal(saved.events.filter(e=>e.kind==='shout').length,1);assert.equal(saved.characters[0].plan,undefined);
 const advances=requests.filter(r=>r.operation==='advance');assert.equal(advances.length,4);assert.ok(advances.every(r=>r.minutes===5&&r.timeContract==='five-minute-v1'));assert.equal(new Set(advances.map(r=>r.operationId)).size,4);
 const last=advances.at(-1);assert.equal((await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:last})).status(),200);assert.equal((await read()).minute,world.minute+20);
 await page.reload();assert.equal((await read()).minute,world.minute+20);await page.screenshot({path:outputPath('five-minute-reload.png'),fullPage:true});
 await nav('設定');await page.getByRole('combobox',{name:'推進時間間隔',exact:true}).click();await page.getByRole('option',{name:'30 分鐘（6 步）',exact:true}).click();await nav('觀察');await clickAdvance(world.minute+50);assert.equal(requests.filter(r=>r.operation==='advance').length,11);assert.deepEqual(errors,[]);
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,realPaidCalls:0,checks:{uiFiveMinuteAdoption:true,forwardShortAction:true,threeStepBatch:true,sixStepBatch:true,uniqueOperations:true,sqliteReload:true,originalIdReplay:true},requests:requests.filter(r=>r.operation==='advance'),minute:(await read()).minute},null,2));
 console.log('PASS #276 WorldApp: five-minute adoption, forward action, 3/6-step batches, SQLite reload and original-ID replay; 0 paid calls.');
}finally{await browser?.close();server.close();}
