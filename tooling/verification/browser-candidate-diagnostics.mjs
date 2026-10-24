import assert from 'node:assert/strict';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser} from './browser-runtime.mjs';

// Explicit synthetic provider replies and a legacy trace fixture. No private
// production transcript is available or reconstructed by this verification.
const decision={type:'rest',target:'',content:'休息',mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[],memorySelections:[]};
const cases=[['json','JSON 解析失敗'],['reference','記憶選留引用不合法'],['format','候選欄位格式錯誤'],['legacy','未記錄／未知'],['unknown-code','未記錄／未知']];
let browser;
try{
 browser=await launchBrowser();
 for(const [kind,label] of cases){
  const w=load('world').seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-world'};store.install(w);
  setModelResponder(()=>Response.json({usage:{prompt_tokens:7,completion_tokens:2},choices:[{message:{content:kind==='json'?'{BROKEN-SYNTHETIC':JSON.stringify({...decision,memorySelections:[{id:kind==='format'?w.characters[0].shortTerm[0].id:'UNKNOWN-SYNTHETIC',version:1,reason:kind==='format'?'':'保留'}]})}}]}));
  const context=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(20000);
  try{
   await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
   const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID(),mode:'openai',model:'gpt-6-luna'};
   const failed=await page.request.post(url+'/api/world',{data:op});assert.equal(failed.status(),502);
   const read=async()=>(await(await page.request.get(url+'/api/world?operationId='+encodeURIComponent(op.operationId))).json());
   const saved=await read();assert.equal(saved.decisionTrace.outcome,'rolled-back');
   if(kind==='legacy'||kind==='unknown-code'){
    // Simulates a persisted pre-change record; never infers its missing reason.
    if(kind==='legacy')delete saved.decisionTrace.dispatches[0].failure.reason;
    else saved.decisionTrace.dispatches[0].failure.reason='constructor';
    await load('decision-traces').saveDecisionTrace(store.database(),'test-owner',saved.decisionTrace,true);
   }
   const before=requests.length;await page.goto(url);const nav=()=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name:'分析',exact:true}).click();await nav();
   const panel=page.getByRole('region',{name:'決策追溯',exact:true});await panel.getByText(label,{exact:false}).waitFor();assert.match(await panel.innerText(),/回合已回復/);
   await page.reload();await nav();await panel.getByText(label,{exact:false}).waitFor();
   assert.equal(requests.length,before,'view and reload must not submit operations');
   console.log(`PASS candidate diagnostic Chromium ${kind}: saved API reason, analysis display, reload; synthetic fixture only`);
  }finally{await context.close();}
 }
}finally{await browser?.close();server.close();}
