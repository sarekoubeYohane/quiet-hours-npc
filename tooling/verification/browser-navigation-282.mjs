import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {startApp} from './real-route-runtime.mjs';
import {launchBrowser} from './browser-runtime.mjs';

const root=resolve(process.env.REAL_ROUTE_REPO||process.cwd());
const output=resolve(process.env.BROWSER_ARTIFACT_DIR||'docs/verification/assets/navigation-282');
await mkdir(output,{recursive:true});
const app=await startApp({root,port:5282});
const evidence={checkedAt:new Date().toISOString(),origin:app.url,commit:app.commit,builtAt:app.builtAt,identity:'本機 cookie 身分替身 qh_local_owner；非真人 OAuth',runtime:'真正 vinext App Router、產品頁面與 API、隔離 SQLite；未安裝世界 fixture',trials:[]};
let browser,page;
try {
  browser=await launchBrowser();
  const context=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'reduce'});
  page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/*',route=>new URL(route.request().url()).origin===app.url?route.continue():route.abort());
  page.setDefaultTimeout(30000);
  await page.goto(app.url);
  await page.getByRole('heading',{name:'登入你的觀察室',exact:true}).waitFor();
  await page.waitForLoadState('networkidle');
  evidence.unauthenticated={url:page.url(),title:await page.title(),heading:await page.locator('h1').allTextContents()};
  await context.addCookies([{name:'qh_local_owner',value:'navigation-282',url:app.url}]);
  await page.reload();
  await page.getByRole('navigation',{name:'範本管理'}).waitFor();
  for(const [name,path,heading,returnLabel,slug] of [
    ['人物範本','/character-templates','人物範本','返回觀察室','characters'],
    ['場景範本','/scene-templates','場景範本','回到觀察室','scenes'],
  ]) {
    const before={url:page.url(),title:await page.title()};
    const link=page.getByRole('navigation',{name:'範本管理'}).getByRole('link',{name,exact:true});
    const href=await link.getAttribute('href');
    assert.equal(href,path);
    await link.click();
    await page.waitForURL(app.url+path);
    await page.getByRole('heading',{name:heading,exact:true}).first().waitFor();
    const after={url:page.url(),title:await page.title(),heading:await page.locator('h1').allTextContents()};
    await page.screenshot({path:join(output,slug+'.png'),fullPage:true});
    await page.reload();
    await page.getByRole('heading',{name:heading,exact:true}).first().waitFor();
    assert.equal(page.url(),app.url+path);
    const reloaded={url:page.url(),title:await page.title()};
    await page.getByRole('link',{name:returnLabel,exact:true}).click();
    await page.waitForURL(app.url+'/');
    await page.getByRole('navigation',{name:'範本管理'}).waitFor();
    const returned={url:page.url(),title:await page.title()};
    // Independent browser-history return, separate from the product return link.
    await page.getByRole('navigation',{name:'範本管理'}).getByRole('link',{name,exact:true}).click();
    await page.waitForURL(app.url+path);
    await page.goBack();
    await page.waitForURL(app.url+'/');
    await page.getByRole('navigation',{name:'範本管理'}).waitFor();
    evidence.trials.push({name,href,before,after,reloaded,returned,browserBack:page.url(),result:'passed'});
  }
  assert.deepEqual(errors,[]);
  assert.equal(app.modelRequests.length,0);
  assert.equal(app.requests.filter(x=>x.method==='POST').length,0);
  evidence.pageErrors=errors;evidence.modelCalls=app.modelRequests.length;evidence.productPostRequests=0;
  await writeFile(join(output,'local-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
} catch(error) {if(page){await page.screenshot({path:join(output,'local-failure.png'),fullPage:true});await writeFile(join(output,'local-failure.txt'),String(error)+'\n'+await page.locator('body').innerText());}throw error;} finally {await browser?.close();await app.close();}
