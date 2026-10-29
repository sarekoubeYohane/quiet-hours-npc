import '../verification/no-network.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { url, server } from './browser-fixture.mjs';
import { launchBrowser, outputPath } from './browser-runtime.mjs';
if(!process.env.EXPERIMENT_SQLITE)throw Error('An already executed synthetic private runner database is required');
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/pursuit-runner-228');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
let browser;
try {
  browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1100},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
  const read=async()=>await(await page.request.get(url+'/api/world')).json();
  const before=await read();assert.ok(before.world.objects.some(object=>object.id==='bread-stock:1'));
  await page.goto(url);await page.reload();
  const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
  await nav('分析');await page.getByRole('button',{name:'店主',exact:true}).click();
  const panel=page.getByRole('region',{name:'分層追求',exact:true});await panel.waitFor();
  assert.match(await panel.innerText(),/本人認為已滿足/);assert.match(await panel.innerText(),/暫時足夠/);assert.match(await panel.innerText(),/取得一份餐點/);
  await panel.screenshot({path:outputPath('sqlite-reopened-pursuit.png')});
  await nav('觀察');await page.getByRole('button',{name:'人物檔案',exact:true}).click();
  assert.match(await page.getByRole('region',{name:'人物檔案',exact:true}).innerText(),/本人認為已滿足/);
  await page.setViewportSize({width:390,height:844});await nav('分析');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:outputPath('mobile-reloaded.png'),fullPage:true});
  const after=await read();assert.deepEqual(after.world,before.world);assert.equal((await page.request.post(url+'/api/world',{data:{operation:'advance'}})).status(),403);assert.deepEqual(errors,[]);
  const summary={result:'PASS',fileSQLite:true,realWorldApp:true,reloadedAnalysis:true,reloadedProfile:true,mobile390NoOverflow:true,worldUnchanged:true,advanceForbidden:true,paidProviderCalls:0,turn:after.world.turn,totalEngineCalls:after.world.aiUsage.totalCalls,actualMealObjects:after.world.objects.filter(object=>object.id==='bread-stock:1').length};
  await writeFile(outputPath('summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
} finally {await browser?.close();server.close();}
