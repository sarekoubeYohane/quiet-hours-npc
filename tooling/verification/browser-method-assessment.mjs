import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/method-assessment');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const w=load('world').seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-judge'};store.install(w);
let npc=0,judgments=0;
setModelResponder(request=>{
 const input=JSON.parse(request.messages[1].content);let value;
 if(input.contractVersion==='world-adjudication.v1'){judgments++;value={status:'denied',completionMinutes:null,effects:[],stages:[],check:null,routine:null};}
 else{
  npc++;const action=npc===1?{type:'propose',target:'cafe',content:'尋找另一份合法食物來源',purpose:'進食'}:{type:'rest',target:'',content:'先等待新消息',purpose:''};
  const source=input.self.shortTerm.find(item=>item.text.includes('行動回饋'));
  value={contractVersion:'npc-decision.v2',action,mood:'平靜',durationMinutes:15,timeIntent:{kind:npc===1?'completion':'open-ended',maxMinutes:null},intents:[{id:'food',content:'照顧自己的飲食',context:'等待可知的新線索',intensity:'medium',importance:'medium',urgency:'low'}],attentionConditions:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],interpretation:'',reconfirmBodyConsequences:false,preferenceUpdates:[],habitCandidates:[],methodAssessment:{purpose:'照顧自己的飲食',knownResults:source?[{kind:'short',id:source.id,version:source.version}]:[],choice:npc===1?'new':'wait',method:action.content,change:{kind:npc===1?'not-applicable':'condition',detail:npc===1?'':'等到新消息再決定'},reason:source?'目前只知道上次尚未執行，未得知受阻原因。':'自行尋找可行來源，不要求別人配合。',selectedAction:{type:action.type,target:action.target},intentIds:['food']}};
 }
 return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
 await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
 await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
 for(let i=0;i<2;i++){
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');
  await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());
  await page.reload();await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
 }
 const op=requests.filter(item=>item.operation==='advance').at(-1),saved=await(await page.request.get(url+'/api/world?operationId='+encodeURIComponent(op.operationId))).json(),trace=saved.decisionTrace;
 assert.equal(trace.outcome,'committed');const step=trace.steps.find(item=>item.kind==='npc-method-assessment');assert.equal(step.source,'model-self-report');assert.equal(step.data.methodAssessment.choice,'wait');assert.equal(step.data.methodAssessment.knownResults.length,1);
 const input=JSON.parse(JSON.parse(trace.dispatches[0].requestBody).messages[1].content);assert.ok(input.self.lastKnownState.entries.some(item=>item.reference.id===step.data.methodAssessment.knownResults[0].id));
 await nav('分析');const panel=page.getByRole('region',{name:'決策追溯',exact:true});await panel.getByText('實際模型派送',{exact:true}).waitFor();
 await panel.getByText('本次目的、方法評估、意圖與行動（主觀自述，非成果證據）',{exact:true}).click();assert.match(await panel.innerText(),/等到新消息再決定/);assert.match(await panel.innerText(),/world|世界已提交/);
 const before={npc,judgments};assert.equal((await page.request.post(url+'/api/world',{data:op})).status(),200);assert.deepEqual({npc,judgments},before);assert.deepEqual(errors,[]);
 await panel.getByText('本次目的、方法評估、意圖與行動（主觀自述，非成果證據）',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:outputPath('assessment.png')});
 await writeFile(outputPath('summary.json'),JSON.stringify({fixture:true,npc,judgments,checks:{actualUI:true,sqliteReload:true,actualNextMessages:true,sourceRef:true,sameIdZeroDispatch:true},inputBytes:Buffer.byteLength(JSON.stringify(input)),assessmentBytes:Buffer.byteLength(JSON.stringify(step.data.methodAssessment))},null,2)+'\n');
 console.log('PASS method assessment Chromium: UI/API/SQLite/next messages, two NPC calls and one judgment, replay zero; fixture only');
}finally{await browser?.close();server.close();}
