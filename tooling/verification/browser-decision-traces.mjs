import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,transportFrames,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/decision-traces');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const proposal={type:'propose',target:'acceptance-tea-kit',content:'我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。',purpose:'飲用',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]};
const timings=[['tea',5],['coffee',6],['food',10],['drink',8],['wash',3],['return',1]].map(([operation,minutes])=>({operation,minutes}));
const approved={completionMinutes:null,stages:[],status:'accepted',effects:[],check:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings},explanation:{summary:'這是隔離fixture的普通泡茶核准。',facts:[{reference:'action.target',value:'acceptance-tea-kit'}]}};
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
let browser;
try{
 for(const scenario of ['success','denied-full-cup','no-progress','rule-reuse'].filter(name=>!process.env.TRACE_SCENARIO||name===process.env.TRACE_SCENARIO)){
  browser=await launchBrowser();
  const w=await load('acceptance-scene').enterAcceptanceScene(load('world').seedWorld());w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-adjudicator'};
  if(scenario==='denied-full-cup')w.objects.find(o=>o.id==='acceptance-cup').state.contents='tea';
  store.install(w);let npc=0,judgments=0;
  setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;return completion(scenario==='no-progress'?{status:'unsupported',completionMinutes:null,effects:[],stages:[],check:null,routine:null}:scenario==='denied-full-cup'?{status:'denied',completionMinutes:null,effects:[],stages:[],check:null,routine:null,explanation:{summary:'fixture杯中原有茶；這只是模型自述。',facts:[{reference:'objects.acceptance-cup.state.contents',value:'tea'}]}}:approved);}npc++;return completion(proposal);});
  const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
  const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
  const read=async id=>(await(await page.request.get(url+'/api/world'+(id?'?operationId='+encodeURIComponent(id):''))).json());
  try{
   await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
   await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
   const wireStart=transportFrames.length;
   const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());
   const operation=requests.filter(r=>r.operation==='advance').at(-1),saved=await read(operation.operationId),trace=saved.decisionTrace;
   let reuseTrace=null;
   assert.ok(trace);assert.equal(trace.outcome,'committed');assert.equal(trace.requestId,response.headers()['x-world-request-id']);
   trace.dispatches.forEach((dispatch,index)=>{assert.equal(dispatch.requestBody,transportFrames[wireStart+index].requestBody);assert.equal(dispatch.responseBody,transportFrames[wireStart+index].responseBody);});
   if(scenario==='denied-full-cup'){assert.equal(trace.dispatches[1].worldSnapshot.objects.find(o=>o.id==='acceptance-cup').state.contents,'tea');assert.ok(trace.steps.some(s=>s.source==='model-self-report'));}
   if(scenario==='no-progress')assert.equal(trace.dispatches.length,2);
   if(scenario==='rule-reuse'){
    // A second real operation uses an already approved method; only program checks decide reuse.
    setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;return completion(approved);}npc++;return completion({...proposal,content:'清洗杯子',purpose:'清洗',target:'acceptance-cup'});});
    const current=store.snapshot();const cup=current.objects.find(o=>o.id==='acceptance-cup');cup.state.contents='dirty';cup.stateTransitions.contents.push('dirty');for(const drink of current.objects.filter(o=>o.state.vessel===cup.id)){drink.lifecycle='consumed';drink.revision++;}store.replaceCommittedWorld(current);
    await page.reload();await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');const second=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const secondResponse=await second;assert.equal(secondResponse.status(),200,await secondResponse.text());const recent=await read();const reused=await read(recent.decisionTraces.records[0].operationId);reuseTrace=reused.decisionTrace;reuseTrace.dispatches.forEach((dispatch,index)=>{assert.equal(dispatch.requestBody,transportFrames[wireStart+trace.dispatches.length+index].requestBody);assert.equal(dispatch.responseBody,transportFrames[wireStart+trace.dispatches.length+index].responseBody);});assert.equal(judgments,1);assert.ok(reused.decisionTrace.steps.some(step=>step.kind==='rule-selection'&&step.data.branch==='program-result'));
   }
   await page.reload();await nav('分析');const panel=page.getByRole('region',{name:'決策追溯',exact:true});await panel.waitFor();await panel.getByText('實際模型派送',{exact:true}).waitFor();
   assert.ok((await panel.innerText()).includes('世界已提交'));assert.ok((await panel.innerText()).includes('最後已知階段'));
   await panel.getByText('實際送出的請求本文',{exact:true}).first().click();assert.ok((await panel.innerText()).includes('gpt-6-luna'));
   const beforeCalls={npc,judgments};const replay=await page.request.post(url+'/api/world',{data:operation});assert.equal(replay.status(),200);assert.deepEqual({npc,judgments},beforeCalls);assert.deepEqual((await read(operation.operationId)).decisionTrace,trace);assert.deepEqual(errors,[]);
   await panel.scrollIntoViewIfNeeded();await page.screenshot({path:outputPath(scenario+'.png'),fullPage:false});
   await writeFile(outputPath(scenario+'.json'),JSON.stringify({fixture:true,scenario,trace,reuseTrace,checks:{wireBytes:true,reload:true,private:true,sameIdZeroDispatch:true,reuseWireBytes:!!reuseTrace},reuseTraceBytes:reuseTrace?Buffer.byteLength(JSON.stringify(reuseTrace)):null,traceBytes:Buffer.byteLength(JSON.stringify(trace))},null,2)+'\n');
   console.log(`PASS decision trace Chromium ${scenario}; actual bytes, SQLite reload, UI, same-ID no new dispatch; fixture only`);
  }finally{await context.close();await browser.close();browser=undefined;}
 }
}finally{await browser?.close();server.close();}
