import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR||=resolve('docs/verification/assets/phone-memos-188');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters.forEach(c=>c.control={mode:'taken-over'});store.install(world);let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 let n=0;
 const advance=async()=>{const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(now=>{Date.now=()=>now;},clock.now);const waiting=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await waiting;assert.equal(response.status(),200,await response.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');n++;return read();};
 await page.goto(url);await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await advance();
 const selectPhone=async()=>{await page.getByRole('combobox',{name:'店主指定行動'}).click();await page.getByRole('option',{name:'手機資料操作',exact:true}).click();await page.getByRole('combobox',{name:'店主行動對象'}).click();await page.getByRole('option',{name:'店主 的手機',exact:true}).click();};
 await selectPhone();
 for(const operation of [{operation:'create',id:'ui-note',version:0,text:'外部原文，重載後仍然一樣。'},{operation:'list'},{operation:'read',id:'ui-note',version:1}]){
 await page.locator('#direct-content').fill(JSON.stringify({collection:'memos',...operation}));const waiting=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='direct');await page.getByRole('button',{name:'單次指定下一行動',exact:true}).click();assert.equal((await waiting).status(),200);await advance();
 }
 const saved=await read(),device=saved.phones.devices.find(d=>saved.objects.find(o=>o.id===d.objectId).owner==='owner');assert.deepEqual(device.memos[0].readers.map(r=>r.actorId),['owner']);assert.equal(saved.aiUsage?.totalCalls||0,0);
 await nav('分析');await page.getByText('手機與私人外部紀錄（觀察者）',{exact:true}).click();await page.getByText('外部原文，重載後仍然一樣。',{exact:true}).waitFor();await page.getByRole('region',{name:'日常規則與成果'}).screenshot({path:outputPath('saved-memo.png')});
 await page.reload();await nav('分析');await page.getByText('手機與私人外部紀錄（觀察者）',{exact:true}).click();await page.getByText('外部原文，重載後仍然一樣。',{exact:true}).waitFor();assert.deepEqual((await read()).phones,saved.phones);assert.deepEqual(errors,[]);
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,paidCalls:0,uiAdvances:n,actions:['create','list','read'],reloadConsistent:true,readerIds:device.memos[0].readers.map(r=>r.actorId)},null,2));console.log('PASS #188 Chromium existing direct-control/API/SQLite create/list/read/reload; zero paid calls.');
}finally{await browser?.close();server.close();}
