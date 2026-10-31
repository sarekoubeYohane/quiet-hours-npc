import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,setModelResponder,modelRequests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const {decision,upsert,drop,edit,assess,workWorld,judgment,startWork}=createRequire(import.meta.url)('../../tests/pursuit-exit-fixture.cjs');
process.env.BROWSER_ARTIFACT_DIR ||= resolve('outputs/pursuit-exit-225');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();workWorld(world);world.adjudication={provider:'openai',model:'fixture-judge'};store.install(world);
let npc=0,judgments=0;
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content);let value;
 if(input.contractVersion==='world-adjudication.v1'){judgments++;value=judgment();}
 else {
  npc++;
  if(npc===1)value=startWork(input);
  else if(npc===2)value=decision(input,{updates:[drop(input,'owner:work'),upsert('owner:replacement',[],{scope:'換成自己的新動機，仍想完成同一份實物'})],focus:'owner:replacement',type:'continue',content:'沿原進度繼續，不重做已投入的部分'});
  else if(npc===3)value=decision(input,{updates:[assess(input,'owner:replacement','satisfied','ready'),edit(input,'owner:replacement',{scope:'只保留已投入部分，不繼續做到全部完成',satisfaction:'本人覺得目前這一部分已足夠'})],type:'pause',content:'我明示縮小範圍並暫停實際進度'});
  else {const ended=input.self.intents.find(node=>node.id==='owner:replacement');assert.equal(ended.status,'satisfied');assert.equal(ended.scope,'只保留已投入部分，不繼續做到全部完成');assert.ok(input.self.pausedActivity);value=decision(input);}
 }
 return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1100},reducedMotion:'reduce'}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const api=async body=>{const response=await page.request.post(url+'/api/world',{data:{mode:'openai',operationId:Date.now()+':'+crypto.randomUUID(),...body}});assert.equal(response.status(),200,await response.text());};
 await api({operation:'set-model-key',key:'fixture-key'});
 let origin;
 for(let round=0;round<4;round++){
  if(round&&round<3)await api({operation:'intervene',target:'owner',text:'有新的情況，你可以依自己的想法繼續、改範圍或停下來。'});
  await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
  const pending=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());
  const actor=store.snapshot().characters[0];if(!round)origin=actor.plan.pursuitOrigin;else assert.deepEqual((actor.plan?.pursuitOrigin||actor.pausedActivity.plan.pursuitOrigin),origin);assert.equal(store.snapshot().objects[0].revision,2);
 }
 await page.reload();await nav('分析');await page.getByRole('button',{name:'店主',exact:true}).click();const panel=page.getByRole('region',{name:'分層追求',exact:true});
 await panel.getByText('追求變更痕跡（觀察者）',{exact:true}).click();const text=await panel.innerText();assert.match(text,/開始時的歷史追求.*owner:work v1/);assert.match(text,/已明示放下/);assert.match(text,/本人認為已滿足/);assert.match(text,/換成自己的新動機，仍想完成同一份實物/);assert.match(text,/只保留已投入部分，不繼續做到全部完成/);assert.match(text,/目前沒有連結追求/);
 await panel.screenshot({path:outputPath('exit-origin-panel.png')});await page.screenshot({path:outputPath('analysis.png'),fullPage:true});await nav('觀察');await page.getByRole('button',{name:'人物檔案',exact:true}).click();assert.match(await page.getByRole('region',{name:'人物檔案',exact:true}).innerText(),/開始時的歷史追求/);
 await page.setViewportSize({width:390,height:844});await nav('分析');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:outputPath('mobile-analysis.png'),fullPage:true});
 const saved=store.snapshot(),actor=saved.characters[0];assert.equal(npc,4);assert.equal(judgments,1);assert.equal(actor.plan,undefined);assert.equal(actor.pausedActivity.plan.phases.cursor,1);assert.deepEqual(actor.pausedActivity.plan.pursuitIds,[]);assert.deepEqual(actor.pausedActivity.plan.pursuitOrigin,origin);assert.equal(saved.objects[0].state.progress,'partial');assert.deepEqual(errors,[]);
 const summary={result:'PASS',worldTurn:saved.turn,fixtureNpc:npc,fixtureJudgments:judgments,realPaidDispatches:0,objectRevision:2,physicalProgress:'partial',pausedPhaseCursor:1,origin:origin.pursuits,currentPausedPursuits:[],originalPursuit:'dropped',replacementPursuit:'satisfied-after-scope-change',reloadedAnalysis:true,reloadedProfile:true,nextActualInputBytes:Buffer.byteLength(modelRequests.filter(request=>JSON.parse(request.messages[1].content).self).at(-1).messages[1].content,'utf8')};await writeFile(outputPath('summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await browser?.close();server.close();}
