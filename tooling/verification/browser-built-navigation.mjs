// Exercise the actual production bundle, Workers routes and isolated D1.
// Only the local session fixture is supplied; no production login or model calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {launchBrowser} from './browser-runtime.mjs';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler'))('miniflare');
const root=resolve(process.env.BUILT_APP_DIR||'dist');
const config=JSON.parse(await readFile(root+'/server/wrangler.json','utf8'));
assert.equal(config.vars.APP_ENV,'production','Run pnpm build:production first');
const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));
const port=probe.address().port;await new Promise(done=>probe.close(done));
const origin=`http://127.0.0.1:${port}`;
const secret=randomBytes(32).toString('hex'),id=randomBytes(32).toString('base64url');
const external=[];
const mf=new Miniflare({
  host:'127.0.0.1',port,cf:false,
  modules:[config.main,...(await readdir(root+'/server',{recursive:true})).filter(file=>file.endsWith('.js')&&file!==config.main)].map(file=>({type:'ESModule',path:resolve(root,'server',file)})),
  compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
  assets:{directory:root+'/client',binding:'ASSETS',routerConfig:{has_user_worker:true},assetConfig:{not_found_handling:'none'}},
  d1Databases:{DB:'built-navigation-fixture'},
  bindings:{APP_ENV:'local',AUTH_ORIGIN:origin,GITHUB_CLIENT_ID:'local-fixture',GITHUB_CLIENT_SECRET:'local-fixture',SESSION_SECRET:secret,GITHUB_ALLOWED_IDS:'123'},
  outboundService:async request=>{external.push(new URL(request.url).origin);throw Error('External traffic forbidden in built navigation test');},
});
let browser;
const evidence={production:false,bundleEnvironment:'production',identity:'isolated local session/D1 fixture',routes:[],errors:[],external};
const output=process.env.BROWSER_ARTIFACT_DIR;
try{
  await mf.ready;
  const db=await mf.getD1Database('DB');
  for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
    for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  }
  await db.prepare('INSERT INTO auth_sessions (token_hash,user_id,display_name,expires_at) VALUES (?,?,?,?)').bind(createHash('sha256').update(id).digest('hex'),'123','Navigation fixture',Date.now()+3600000).run();
  browser=await launchBrowser();const context=await browser.newContext();
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin){external.push(url.origin);return route.abort();}
    return route.continue();
  });
  await context.addCookies([{name:'qh_session',value:id+'.'+createHmac('sha256',secret).update(origin+':'+id).digest('base64url'),url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>evidence.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')evidence.errors.push(message.text());});
  await page.goto(origin);await page.waitForLoadState('networkidle');
  await page.evaluate(()=>{window.__builtNavigationDocument=true;});
  const record=()=>evidence.routes.push(new URL(page.url()).pathname+new URL(page.url()).search);
  record();
  await page.getByRole('link',{name:'＋新開存檔',exact:true}).hover();
  await page.getByRole('link',{name:'＋新開存檔',exact:true}).click();
  await page.getByRole('heading',{name:'新開世界',exact:true}).waitFor();
  await page.getByRole('button',{name:'建立人物卡並返回',exact:true}).waitFor();record();
  assert.equal(new URL(page.url()).searchParams.get('owner'),'github:123');
  // This button flushes the draft via the real API and calls router.push.
  await page.getByRole('button',{name:'建立人物卡並返回',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/character-templates');record();
  assert.equal(new URL(page.url()).searchParams.get('owner'),'github:123');
  await page.getByRole('navigation',{name:'共同導覽'}).getByRole('link',{name:'設定',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/settings');record();
  await page.getByRole('navigation',{name:'共同導覽'}).getByRole('link',{name:'存檔',exact:true}).click();
  await page.waitForURL(origin+'/');record();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.evaluate(()=>window.__builtNavigationDocument),true,'Navigation must stay in the hydrated document');
  const drafts=await db.prepare('SELECT COUNT(*) AS n FROM opening_drafts WHERE owner=?').bind('github:123').first();
  assert.ok(drafts.n>=1,'The authoring button must save its opening draft');
  evidence.savedDrafts=drafts.n;
  assert.deepEqual(evidence.errors,[],'No hover, click or hydration errors');
  assert.deepEqual(external,[],'No outbound network or paid models');
  if(output){await mkdir(output,{recursive:true});await page.screenshot({path:output+'/navigation.png',fullPage:true});}
  console.log(JSON.stringify(evidence,null,2));
}catch(error){evidence.failure=error.message;console.error(JSON.stringify(evidence,null,2));process.exitCode=1;}
finally{
  if(output){await mkdir(output,{recursive:true});await writeFile(output+'/evidence.json',JSON.stringify(evidence,null,2)+'\n');}
  await browser?.close();await mf.dispose();
}
