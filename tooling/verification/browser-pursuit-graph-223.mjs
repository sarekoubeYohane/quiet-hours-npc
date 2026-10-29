import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,setModelResponder,modelRequests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const {decision,upsert,reorder}=createRequire(import.meta.url)('../../tests/pursuit-graph-fixture.cjs');
process.env.BROWSER_ARTIFACT_DIR ||= resolve('outputs/pursuit-graph-223');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>['vera','owner'].includes(c.id));world.characters.find(c=>c.id==='owner').control.mode='taken-over';world.adjudication={provider:'openai',model:'fixture-judge'};store.install(world);
let calls=0;
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content);calls++;
 let value;
 if(calls===1)value=decision(input,{updates:[upsert('vera:gift',[],{kind:'direction',content:'送禮方向',scope:'為朋友準備一份心意',satisfaction:null,context:'等待朋友回覆喜歡的樣式'}),upsert('vera:shared',[{id:'vera:direction',version:1},{id:'vera:gift',version:0}],{content:'一份設計'}),upsert('vera:other',[{id:'vera:direction',version:1}],{content:'整理參考'}),upsert('vera:untouched',[{id:'vera:direction',version:1}],{content:'保留構想'})],focus:'vera:shared',type:'work',target:'craft-challenge',content:'構思兼具創作和送禮意義的一份設計',duration:60});
 else {
  const ref=id=>({id,version:input.self.intents.find(n=>n.id===id).version});
  const updates=calls===2?[reorder('vera:roots',0,[ref('vera:gift'),ref('vera:direction')],'roots'),reorder('vera:direction',ref('vera:direction').version,[ref('vera:other'),ref('vera:shared')])]:[];
  if(calls===3){assert.equal(input.self.intents.filter(n=>!n.parents.length)[0].id,'vera:gift');const shared=input.self.intents.find(n=>n.id==='vera:shared');assert.equal(shared.parents.find(p=>p.id==='vera:direction').order,1);assert.equal(shared.parents.find(p=>p.id==='vera:gift').order,0);}
  value=decision(input,{updates,focus:'vera:shared',type:'continue',content:'依原進度繼續',duration:60});
 }
 return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1100},reducedMotion:'reduce'}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
 await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const api=async body=>{const response=await page.request.post(url+'/api/world',{data:{mode:'openai',operationId:Date.now()+':'+crypto.randomUUID(),...body}});assert.equal(response.status(),200,await response.text());};
 await api({operation:'set-model-key',mode:'openai',key:'fixture-key'});
 let startedAt,until;
 for(let round=0;round<3;round++){
  if(round)await api({operation:'intervene',target:'vera',text:'朋友尚未回覆；依自己的想法考慮順序，也可繼續手上的設計。'});
  await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await responsePromise;assert.equal(response.status(),200,await response.text());
  const actor=store.snapshot().characters.find(c=>c.id==='vera');if(!round){startedAt=actor.plan.startedAt;until=actor.plan.until;}else{assert.equal(actor.plan.startedAt,startedAt);assert.equal(actor.plan.until,until);}assert.equal(actor.projects.length,1);
 }
 await page.reload();await nav('分析');await page.getByRole('button',{name:'Vera',exact:true}).click();const panel=page.getByRole('region',{name:'分層追求',exact:true});
 await panel.getByText('各層順序與共享關係',{exact:true}).waitFor();assert.match(await panel.innerText(),/根追求順序：送禮方向 → 尊重 Cass/);assert.match(await panel.innerText(),/整理參考 → 一份設計（共享） → 保留構想/);assert.match(await panel.innerText(),/共享同一工作/);
 await panel.screenshot({path:outputPath('shared-order-panel.png')});await page.screenshot({path:outputPath('analysis.png'),fullPage:true});
 await nav('觀察');await page.getByRole('button',{name:'人物檔案',exact:true}).click();assert.match(await page.getByRole('region',{name:'人物檔案',exact:true}).innerText(),/共享同一工作/);
 await page.setViewportSize({width:390,height:844});await nav('分析');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:outputPath('mobile-analysis.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.equal(calls,3);const saved=store.snapshot(),actor=saved.characters.find(c=>c.id==='vera');assert.equal(actor.intents.filter(n=>n.id==='vera:shared').length,1);assert.equal(actor.projects.length,1);
 const summary={result:'PASS',worldTurn:saved.turn,actualFixtureDispatches:calls,realPaidDispatches:0,sharedNodes:1,actualDesignResults:1,reloadedAnalysis:true,reloadedProfile:true,continuedOriginalStartedAt:startedAt,continuedOriginalUntil:until,nextActualInputBytes:Buffer.byteLength(modelRequests[2].messages[1].content,'utf8')};await writeFile(outputPath('summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await browser?.close();server.close();}
