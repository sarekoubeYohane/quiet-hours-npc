import assert from 'node:assert/strict';
import {url,server} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
let browser;
try {
 browser=await launchBrowser();
 const page=await browser.newPage();await page.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T16:00:00Z');});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const asset=await page.request.get(`${url}/characters/owner/avatar.webp`);
 assert.equal(asset.headers()['content-type'],'image/webp','the real character asset must be served instead of the SPA');
 await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 await page.getByRole('button',{name:'下一回合',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');
 const world=await page.request.get(`${url}/api/world`).then(r=>r.json());
 assert.equal(world.world.turn,1);assert.deepEqual(errors,[]);
 await page.screenshot({path:outputPath('browser-smoke.png'),fullPage:true});
 console.log('PASS actual Chromium, actual WorldApp, real world API, SQLite world turn = 1');
}finally{await browser?.close();server.close();}
