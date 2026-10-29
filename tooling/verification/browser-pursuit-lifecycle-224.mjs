import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,setModelResponder,modelRequests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const {decision,upsert,assess}=createRequire(import.meta.url)('../../tests/pursuit-lifecycle-fixture.cjs');
process.env.BROWSER_ARTIFACT_DIR ||= resolve('outputs/pursuit-lifecycle-224');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>['vera','owner'].includes(c.id));world.characters.find(c=>c.id==='owner').control.mode='taken-over';world.adjudication={provider:'openai',model:'fixture-judge'};store.install(world);
let calls=0;
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content);calls++;
 let value;
 if(calls===1)value=decision(input,{updates:[upsert('vera:design',[{id:'vera:direction',version:1}],{content:'完成自己的設計',scope:'研究後完成一份自己的設計',satisfaction:'有一份我願意採用的設計'})],focus:'vera:design',type:'say',target:'observer',content:'我想先研究，再做一份自己的設計。'});
 else if(calls===2)value=decision(input,{focus:'vera:design',type:'work',target:'study-craft',content:'看看眼前布料與髮飾參考',choice:'switch'});
 else if(calls===3)value=decision(input,{focus:'vera:design',type:'work',target:'craft-challenge',content:'依研究構思自己的設計',duration:30,choice:'switch'});
 else if(calls===4){assert.equal(input.self.intents.find(n=>n.id==='vera:design').status,'active');value=decision(input,{updates:[assess(input,'vera:design','satisfied','ready'),assess(input,'vera:direction','active','enough')]});}
 else {assert.equal(input.self.intents.find(n=>n.id==='vera:direction').progress,'enough');assert.equal(input.self.intents.find(n=>n.id==='vera:design').status,'satisfied');value=decision(input);}
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
 for(let round=0;round<6;round++){
  await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await responsePromise;assert.equal(response.status(),200,await response.text());
  const actor=store.snapshot().characters.find(c=>c.id==='vera');if(round===3){assert.equal(calls,3);assert.equal(actor.plan,undefined);assert.equal(actor.intents.find(n=>n.id==='vera:design').status,'active');}if(round>=2)assert.equal(actor.projects.length,1);
 }
 await page.reload();await nav('分析');await page.getByRole('button',{name:'Vera',exact:true}).click();const panel=page.getByRole('region',{name:'分層追求',exact:true});
 assert.match(await panel.innerText(),/本人認為已滿足/);assert.match(await panel.innerText(),/暫時足夠/);assert.match(await panel.innerText(),/依當時可知結果/);assert.match(await panel.innerText(),/研究後完成一份自己的設計/);
 await panel.screenshot({path:outputPath('satisfied-and-enough.png')});
 await nav('觀察');await page.getByRole('button',{name:'人物檔案',exact:true}).click();assert.match(await page.getByRole('region',{name:'人物檔案',exact:true}).innerText(),/本人認為已滿足/);
 await page.setViewportSize({width:390,height:844});await nav('分析');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:outputPath('mobile-analysis.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.equal(calls,5);const saved=store.snapshot(),actor=saved.characters.find(c=>c.id==='vera');assert.equal(actor.projects.length,1);
 const summary={result:'PASS',worldTurns:saved.turn,actualFixtureDispatches:calls,realPaidDispatches:0,actualDesignResults:1,stableScope:actor.intents.find(n=>n.id==='vera:design').scope,satisfaction:actor.intents.find(n=>n.id==='vera:design').status,directionProgress:actor.intents.find(n=>n.id==='vera:direction').progress,reloadedAnalysis:true,reloadedProfile:true,nextActualInputBytes:Buffer.byteLength(modelRequests.at(-1).messages[1].content,'utf8')};await writeFile(outputPath('summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await browser?.close();server.close();}
