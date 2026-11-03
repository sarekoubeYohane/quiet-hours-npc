import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,modelRequests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';

process.env.BROWSER_ARTIFACT_DIR ||= resolve('/tmp/model-key-retention');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
let browser;
try {
 browser=await launchBrowser();
 const first=await browser.newContext(),second=await browser.newContext();
 for(const context of [first,second])await context.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T16:00:00Z');});
 const a=await first.newPage(),b=await second.newPage();
 const read=async page=>(await(await page.request.get(url+'/api/world')).json());
 const settings=async page=>{await page.goto(url);await page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name:'設定',exact:true}).click();};
 const choose=async(page,label)=>{await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();};
 const save=async(page,replacement=false)=>{await page.locator('input[type=password]').first().fill('synthetic-retention-fixture');await page.getByRole('button',{name:replacement?'替換 Key（14 天）':'保存 Key（14 天）',exact:true}).click();await page.getByRole('button',{name:'替換 Key（14 天）',exact:true}).waitFor();assert.equal(await page.locator('input[type=password]').first().inputValue(),'');};
 const base=Date.parse('2026-10-15T16:00:00Z'),evidence=[];
 for(const [mode,label,provider] of [['openai','OpenAI 直連','openai'],['ai','OpenRouter AI','openrouter']]) {
  await settings(a);await choose(a,label);await save(a);
  const initial=(await read(a)).modelKeys[provider];assert.equal(initial.expiresAt,base+1209600000);
  await settings(b);await choose(b,label);await b.getByRole('button',{name:'重新檢查 Key',exact:true}).click();await b.getByRole('button',{name:'替換 Key（14 天）',exact:true}).waitFor();
  assert.equal((await read(b)).modelKeys[provider].expiresAt,initial.expiresAt);
  await a.reload();assert.equal((await read(a)).modelKeys[provider].expiresAt,initial.expiresAt);
  evidence.push({mode,provider,initialExpiresAt:initial.expiresAt,sharedAcrossContexts:true,reloadDoesNotRenew:true});
 }
 await a.request.post(url+'/__fixture',{data:{advanceMs:3600000}});
 await settings(a);await choose(a,'OpenAI 直連');await save(a,true);
 assert.equal((await read(b)).modelKeys.openai.expiresAt,base+1213200000);
 assert.equal((await read(b)).modelKeys.openrouter.expiresAt,base+1209600000);
 await a.getByRole('button',{name:'清除已存 Key',exact:true}).click();
 await a.getByRole('button',{name:'保存 Key（14 天）',exact:true}).waitFor();
 assert.equal((await read(b)).modelKeys.openai.configured,false);
 assert.equal((await read(b)).modelKeys.openrouter.configured,true);
 await a.request.post(url+'/__fixture',{data:{advanceMs:1206000000}});
 assert.equal((await read(b)).modelKeys.openrouter.configured,false);
 await settings(b);await choose(b,'OpenRouter AI');await b.getByRole('button',{name:'保存 Key（14 天）',exact:true}).waitFor();
 assert.equal(modelRequests.length,0,'save/read/replace/clear/expiry must never dispatch a model');
 await b.screenshot({path:outputPath('expired-key-settings.png'),fullPage:true});
 await writeFile(outputPath('key-retention.json'),JSON.stringify({fixture:true,auth:'fixed authenticated owner; real login/24h covered by auth API tests',evidence,replacementExpiresAt:base+1213200000,clearIsServiceScoped:true,expiry:true,modelDispatches:0},null,2));
 console.log('PASS model Key UI/API/SQLite: two providers, 14 days, two contexts, replacement, reload, scoped clear, expiry, zero dispatch');
} finally {await browser?.close();server.close();}
