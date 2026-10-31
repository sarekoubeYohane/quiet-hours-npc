import '../verification/no-network.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {url,server,store,load,setModelResponder,modelRequests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const {decision,upsert,edit,assess}=createRequire(import.meta.url)('../../tests/pursuit-exit-fixture.cjs');
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/pursuit-review-220/history');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(world);let calls=0;
setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);calls++;let value;
 if(calls===1)value=decision(input,{updates:[upsert('owner:parent',[],{kind:'direction',content:'最初的方向內容',scope:'原來的上層範圍'}),upsert('owner:child',[{id:'owner:parent',version:0}],{content:'過去的工作',scope:'已經結束的原工作'})]});
 else if(calls===2)value=decision(input,{updates:[assess(input,'owner:child','satisfied','ready')]});
 else value=decision(input,{updates:[edit(input,'owner:parent',{content:'新的方向內容',scope:'不同的新版上層範圍'})]});
 return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
 for(let round=0;round<3;round++){
  await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
  const pending=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());
 }
 const before=store.snapshot();await page.reload();await nav('分析');await page.getByRole('button',{name:'店主',exact:true}).click();
 const panel=page.getByRole('region',{name:'分層追求',exact:true}),child=panel.locator('li').filter({has:page.getByRole('heading',{name:'任務 · 過去的工作',exact:true})});
 assert.match(await child.innerText(),/owner:parent v1.*當前 v2/);assert.doesNotMatch(await child.innerText(),/新的方向內容|不同的新版上層範圍/);assert.match(await child.innerText(),/已經結束的原工作/);
 await child.screenshot({path:outputPath('historical-parent-gap.png')});assert.equal(calls,3);assert.deepEqual(store.snapshot(),before);assert.deepEqual(errors,[]);
 assert.equal(store.snapshot().characters[0].intents.find(n=>n.id==='owner:child').parents[0].version,1);
 await writeFile(outputPath('summary.json'),JSON.stringify({result:'PASS',realPaidCalls:0,fixtureCalls:calls,historicalParentVersion:1,currentParentVersion:2,oldChildScopePreserved:true,reloadNoDispatch:true,nextActualInputBytes:Buffer.byteLength(modelRequests.at(-1).messages[1].content)},null,2));
}finally{await browser?.close();server.close();}
