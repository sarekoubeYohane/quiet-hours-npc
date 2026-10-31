import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,setModelResponder,modelRequests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const require=createRequire(import.meta.url),{decision,candidate,adoption,choose}=require('../../tests/pursuit-selection-fixture.cjs');
process.env.BROWSER_ARTIFACT_DIR ||= resolve('outputs/pursuit-arrangements-226');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const w=load('world').seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-judge'};store.install(w);
let calls=0;
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content),v=decision(input);calls++;
 if(calls===1){const p=candidate('owner','tea','留一點自己的飲茶時間');v.pursuitCandidates=[p];v.pursuitUpdates=[adoption(input,p,'owner:tea')];v.pursuitSelection.adoptions=[{candidateId:p.id,pursuitId:'owner:tea'}];choose(v,{kind:'candidate',id:p.id,version:0},'owner:tea');v.durationMinutes=120;v.arrangementUpdates=[{operation:'upsert',id:'later-tea',version:0,text:'等一會兒再考慮喝茶',condition:{kind:'time',minute:w.minute+30},references:[{kind:'short',id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version}],reason:'現在先安靜休息',pursuit:{id:'owner:tea',version:0}}];}
 else {choose(v,{kind:'existing',id:'owner:tea',version:input.self.intents.find(n=>n.id==='owner:tea').version});v.action.type='continue';v.methodAssessment.choice='continue';v.methodAssessment.selectedAction.type='continue';
  if(calls===2){assert.equal(input.self.arrangementCues.length,1);v.pursuitUpdates=[{operation:'assess',id:'owner:tea',version:1,node:{status:'active',progress:'deferred',basis:{kind:'subjective',text:'我想先把眼前休息做完，之後再考慮'}},references:[],reason:'這次只獲得考慮機會，仍自主延期'}];}
  else {assert.equal(input.self.arrangementCues.length,0);assert.equal(input.self.arrangements.items[0].pursuit.version,1);assert.equal(input.self.arrangements.items[0].pursuitState.currentVersion,2);assert.equal(input.self.intents.find(n=>n.id==='owner:tea').progress,'deferred');}}
 return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify(v)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const configure=async()=>{await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');};
 const advance=async()=>{const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const r=await pending;assert.equal(r.status(),200,await r.text());};
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
 await configure();await advance();const plan=store.snapshot().characters[0].plan;await advance();await page.reload();await nav('分析');await page.getByRole('button',{name:'店主',exact:true}).click();
 const pursuits=page.getByRole('region',{name:'分層追求',exact:true});assert.match(await pursuits.innerText(),/延期/);assert.match(await pursuits.innerText(),/再考慮安排：later-tea/);
 const arrangements=page.locator('details').filter({has:page.locator('summary').getByText('柔性安排',{exact:true})}).last();await arrangements.locator('summary').getByText('柔性安排',{exact:true}).click();assert.match(await arrangements.innerText(),/連結時 v1 · 目前 v2/);assert.match(await arrangements.innerText(),/已獲一次正常決策機會/);await arrangements.screenshot({path:outputPath('arrangements.png')});await pursuits.screenshot({path:outputPath('pursuits.png')});
 await page.request.post(url+'/api/world',{data:{operation:'intervene',mode:'openai',operationId:`${Date.now()}:${crypto.randomUUID()}`,target:'owner',text:'普通問候'}});await configure();await advance();assert.equal(calls,3);const saved=store.snapshot().characters[0];assert.equal(saved.plan.startedAt,plan.startedAt);assert.equal(saved.plan.until,plan.until);assert.equal(saved.arrangements.items[0].status,'active');assert.deepEqual(errors,[]);
 const summary={result:'PASS',realPaidDispatches:0,fixtureNpcDispatches:calls,sqliteReload:true,nextActualRequest:true,linkedVersion:saved.arrangements.items[0].pursuit.version,currentVersion:saved.intents.find(n=>n.id==='owner:tea').version,progress:saved.intents.find(n=>n.id==='owner:tea').progress,unchangedActivity:true,handledCueNotRearmed:JSON.parse(modelRequests[2].messages[1].content).self.arrangementCues.length===0};await writeFile(outputPath('summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await browser?.close();server.close();}
