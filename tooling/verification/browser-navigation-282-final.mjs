import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(process.env.REAL_ROUTE_REPO||process.cwd()),output=resolve(process.env.BROWSER_ARTIFACT_DIR||'/tmp/navigation-282-final');
const {startApp}=await import(pathToFileURL(join(root,'tooling/verification/real-route-runtime.mjs')).href);
const {launchBrowser}=await import(pathToFileURL(join(root,'tooling/verification/browser-runtime.mjs')).href);
await mkdir(output,{recursive:true});
const app=await startApp({root,port:5282});
const owner='navigation-282',expected=process.env.EXPECTED_COMMIT||'d9a692f';assert.equal(app.commit,expected);
const evidence={checkedAt:new Date().toISOString(),origin:app.url,commit:app.commit,builtAt:app.builtAt,sourceStatusAtStart:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),driverSha256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),identity:'本機 qh_local_owner cookie hosting 身分替身；非真人 GitHub OAuth／正式登入',runtime:'真正 vinext App Router、產品頁面與 API、隔離磁碟 SQLite／全 migrations，未安裝世界 fixture',trials:[]};
let browser,page;
try{
 browser=await launchBrowser();const context=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.route('**/*',route=>new URL(route.request().url()).origin===app.url?route.continue():route.abort());
 await page.goto(app.url);await page.getByRole('heading',{name:'登入你的觀察室',exact:true}).waitFor();evidence.unauthenticated={url:page.url(),title:await page.title(),headings:await page.locator('h1').allTextContents(),routes:[]};
 for(const path of ['/character-templates','/scene-templates']){const response=await context.request.get(app.url+path,{maxRedirects:0});assert.equal(response.status(),307);evidence.unauthenticated.routes.push({path,status:response.status(),location:response.headers().location});}
 await context.addCookies([{name:'qh_local_owner',value:owner,url:app.url}]);await page.reload();await page.getByRole('heading',{name:'世界存檔',exact:true}).waitFor();await page.getByText('尚無世界存檔。從「＋新開存檔」開始建立第一份世界。',{exact:true}).waitFor();
 const nav=()=>page.getByRole('navigation',{name:'共同導覽'});const version=await page.locator('header').innerText();assert.ok(version.includes(expected));evidence.authenticated={url:page.url(),title:await page.title(),heading:'世界存檔',observedVersionText:version,owner};
 const matches=path=>url=>url.origin===app.url&&url.pathname===path&&url.searchParams.get('owner')===owner;
 for(const [name,path,heading,returnLabel,slug] of [['人物','/character-templates','人物範本','返回觀察室','characters'],['場景','/scene-templates','場景範本','存檔','scenes']]){
  const before={url:page.url(),title:await page.title()},link=nav().getByRole('link',{name,exact:true}),href=await link.getAttribute('href');assert.ok(matches(path)(new URL(href,app.url)));await link.click();await page.waitForURL(matches(path));await page.getByRole('heading',{name:heading,exact:true}).waitFor();
  const after={url:page.url(),title:await page.title(),headings:await page.locator('h1').allTextContents()};await page.screenshot({path:join(output,slug+'.png'),fullPage:true});await page.reload();await page.getByRole('heading',{name:heading,exact:true}).waitFor();assert.ok(matches(path)(new URL(page.url())));const reloaded={url:page.url(),title:await page.title()};
  const productReturn=slug==='scenes'?nav().getByRole('link',{name:returnLabel,exact:true}):page.getByRole('link',{name:returnLabel,exact:true});const returnHref=await productReturn.getAttribute('href');assert.equal(returnHref,'/');await productReturn.click();await page.waitForURL(app.url+'/');await page.getByRole('heading',{name:'世界存檔',exact:true}).waitFor();const returned={label:returnLabel,href:returnHref,url:page.url(),title:await page.title()};
  await nav().getByRole('link',{name,exact:true}).click();await page.waitForURL(matches(path));await page.getByRole('heading',{name:heading,exact:true}).waitFor();await page.goBack();await page.waitForURL(app.url+'/');await page.getByRole('heading',{name:'世界存檔',exact:true}).waitFor();
  evidence.trials.push({name,href,before,after,reloaded,returned,browserBack:{url:page.url(),title:await page.title()},result:'passed'});
 }
 assert.deepEqual(errors,[]);assert.equal(app.modelRequests.length,0);assert.equal(app.requests.filter(item=>item.method==='POST').length,0);evidence.pageErrors=errors;evidence.modelCalls=0;evidence.productPostRequests=0;evidence.paidCalls=0;await writeFile(join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}catch(error){if(page){await page.screenshot({path:join(output,'failure.png'),fullPage:true});await writeFile(join(output,'failure.txt'),String(error)+'\n'+await page.locator('body').innerText());}throw error;}finally{await browser?.close();await app.close();}
