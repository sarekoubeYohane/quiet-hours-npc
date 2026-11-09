import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/personal-needs-278');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.contextId='browser-personal-needs-278';world.characters[0].control={mode:'taken-over',experiences:[]};store.install(world);
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 await page.goto(url);await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await nav('分析');
 await page.getByText('確認並啟用個人化身體需求',{exact:true}).click();
 await page.getByLabel('飢餓累積特性',{exact:true}).selectOption('0.8');await page.getByLabel('口渴累積特性',{exact:true}).selectOption('1');await page.getByLabel('睡眠需求累積特性',{exact:true}).selectOption('1.2');
 await page.getByLabel('身體需求設定依據',{exact:true}).fill('已確認背景：飢餓較慢，睡意累積較快');await page.getByLabel('開局飢餓',{exact:true}).fill('0');
 const enabled=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='enable-body-needs');await page.getByRole('button',{name:'確認啟用此人物需求',exact:true}).click();const response=await enabled;assert.equal(response.status(),200,await response.text());await page.getByText('個人化身體需求已啟用；重載不重抽。',{exact:true}).waitFor();
 let saved=await read();assert.deepEqual(saved.characters[0].needs.personal.traits,{hunger:0.8,thirst:1,sleep:1.2});assert.equal(saved.characters[0].needs.values.hunger,0);const initial=structuredClone(saved.characters[0].needs);
 await page.reload();await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await nav('分析');await page.getByText('個人化身體需求已啟用；重載不重抽。',{exact:true}).waitFor();assert.deepEqual((await read()).characters[0].needs,initial);
 await nav('觀察');const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},clock.now);
 const advanced=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();assert.equal((await advanced).status(),200);await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');saved=await read();assert.ok(saved.characters[0].needs.values.hunger>0);assert.deepEqual(saved.characters[0].needs.personal.traits,initial.personal.traits);
 const body=requests.filter(r=>r.operation==='advance').at(-1),before=structuredClone(saved.characters[0].needs);const replay=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:body});assert.equal(replay.status(),200);assert.deepEqual((await read()).characters[0].needs,before);
 await nav('分析');await page.getByRole('heading',{name:'身體需求',exact:true}).locator('..').screenshot({path:outputPath('personal-needs.png')});assert.deepEqual(errors,[]);
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,realPaidCalls:0,checks:{explicitOwnerSetup:true,backgroundConstraints:true,initialValue:true,sqliteReload:true,actualAdvance:true,sameOperationReplay:true,stableTraits:true},needs:before},null,2));console.log('PASS #278 Chromium: explicit setup, initial state, stable traits, actual advance, SQLite reload and replay; no paid calls.');
}finally{await browser?.close();server.close();}
