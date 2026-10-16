import assert from 'node:assert/strict';
import {url,server} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const navigate=(page,name)=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
let browser;
try {
 browser=await launchBrowser();
 const page=await browser.newPage();await page.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T16:00:00Z');});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url);await navigate(page,'設定');await page.getByLabel('每小時 AI 呼叫上限',{exact:true}).waitFor();
 const read=async()=>page.request.get(`${url}/api/world`).then(r=>r.json());
 const apply=async()=>{await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'),page.getByRole('button',{name:'套用玩家預算',exact:true}).click()]);await page.getByRole('button',{name:'套用玩家預算',exact:true}).waitFor({state:'visible'});};
 const original=await read();
 await page.getByLabel('每小時 AI 呼叫上限',{exact:true}).selectOption('custom');
 for(const value of ['', '0','-1','1.5','9007199254740992']){
  await page.getByLabel('自訂呼叫上限',{exact:true}).fill(value);await page.getByRole('button',{name:'套用玩家預算',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'安全整數'}).waitFor();
  assert.equal((await read()).version,original.version);
 }
 await page.getByLabel('自訂呼叫上限',{exact:true}).fill('789');
 assert.equal((await read()).version,original.version,'draft never applies');
 await page.getByRole('button',{name:'取消預算變更',exact:true}).click();
 await page.getByLabel('每小時 AI 呼叫上限',{exact:true}).selectOption('custom');
 await page.getByLabel('自訂呼叫上限',{exact:true}).fill('789');
 await page.getByLabel('每小時 token 停止門檻',{exact:true}).selectOption('custom');
 await page.getByLabel('自訂 token 門檻',{exact:true}).fill('987654');await apply();
 await page.reload();await navigate(page,'設定');await page.getByLabel('自訂呼叫上限',{exact:true}).waitFor();assert.equal(await page.getByLabel('自訂呼叫上限',{exact:true}).inputValue(),'789');
 await page.getByLabel('每小時 AI 呼叫上限',{exact:true}).selectOption('unlimited');await page.getByLabel('每小時 token 停止門檻',{exact:true}).selectOption('unlimited');await apply();
 await page.getByRole('button',{name:'開始自動',exact:true}).waitFor();
 await page.reload();await navigate(page,'設定');await page.getByLabel('每小時 AI 呼叫上限',{exact:true}).waitFor();assert.equal(await page.getByLabel('每小時 AI 呼叫上限',{exact:true}).inputValue(),'unlimited');
 await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();
 await page.locator('input[type=password]').fill('fixture-key');await page.getByRole('button',{name:'保存 Key（24 小時）',exact:true}).click();
 await page.getByRole('button',{name:'替換 Key（24 小時）',exact:true}).waitFor();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'開始自動',exact:true}).click();await page.getByRole('button',{name:'開始自動',exact:true}).waitFor();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'開始自動',exact:true}).click();await page.getByRole('button',{name:'暫停自動',exact:true}).waitFor();
 await page.getByRole('button',{name:'暫停自動',exact:true}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'開始自動',exact:true}).click();await page.getByRole('button',{name:'暫停自動',exact:true}).waitFor();
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByRole('button',{name:'開始自動',exact:true}).waitFor();

 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByLabel('每小時 AI 呼叫上限',{exact:true}).selectOption('120');await page.getByLabel('每小時 token 停止門檻',{exact:true}).selectOption('500000');await apply();
 await page.getByRole('button',{name:'開始自動',exact:true}).click();await page.getByRole('button',{name:'暫停自動',exact:true}).waitFor();
 await page.getByLabel('每小時 AI 呼叫上限',{exact:true}).selectOption('unlimited');await page.getByLabel('每小時 token 停止門檻',{exact:true}).selectOption('1000000');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'套用玩家預算',exact:true}).click();
 assert.deepEqual((await read()).world.playerBudget,{calls:120,tokens:500000},'cancelled running switch changes neither field');await page.getByRole('button',{name:'暫停自動',exact:true}).waitFor();
 page.once('dialog',d=>d.accept());await apply();assert.deepEqual((await read()).world.playerBudget,{calls:null,tokens:1000000});await page.getByRole('button',{name:'暫停自動',exact:true}).waitFor();
 await page.getByRole('button',{name:'暫停自動',exact:true}).click();
 assert.deepEqual(errors,[]);await page.screenshot({path:outputPath('browser80.png'),fullPage:true});
 console.log('PASS #80 Chromium invalid custom values, draft/cancel, custom persist/reload, true unlimited persist/reload, start reject/accept, pause/resume confirmation, foreground pause, running unlimited whole-change cancel/accept');
}finally{await browser?.close();server.close();}
