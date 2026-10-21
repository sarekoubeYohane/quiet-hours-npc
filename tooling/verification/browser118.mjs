import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/activity-time');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
let browser;
try{
 for(const kind of ['open-ended','completion']){
  if(process.env.BROWSER118_CASE&&process.env.BROWSER118_CASE!==kind)continue;
  const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-adjudicator'};
  if(kind==='completion')world.supplies=[{id:'meal',label:'這份準備中的餐點',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];store.install(world);
  let npc=0,adjudication=0;const initial=modelRequests.length;
  setModelResponder(request=>{
   const input=JSON.parse(request.messages[1].content);
   if(input.contractVersion==='world-adjudication.v1'){
    adjudication++;assert.equal(kind,'completion');assert.equal(input.timeIntent.kind,'completion');assert.ok(request.response_format.json_schema.schema.required.includes('completionMinutes'));
    return completion({status:'accepted',effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1}],stages:[],check:null,routine:null,completionMinutes:45});
   }
   npc++;
   if(kind==='open-ended'&&npc===2){assert.equal(input.currentActivity,null);assert.match(input.self.activity,/時段.*到期/);}
   return completion(kind==='open-ended'?{type:'rest',target:'',content:'安靜休息半小時',mood:'平靜',durationMinutes:30,intents:[],timeIntent:{kind,maxMinutes:null}}:{type:'propose',target:'meal',content:'把這份準備中的餐點做好',purpose:'完成餐點',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind,maxMinutes:null}});
  });
  browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:900}});page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
  const navigate=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
  const choose=async()=>{await navigate('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate('觀察');};
  const advance=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const result=await response;assert.equal(result.status(),200,await result.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
  try{
   await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await choose();let w=await advance();const plan=w.characters[0].plan;assert.equal(plan.timeIntent?.kind,kind);assert.equal(plan.until-plan.startedAt,kind==='completion'?45:30);assert.equal(w.objects,undefined);assert.equal(npc,1);assert.equal(adjudication,kind==='completion'?1:0);
   const replay=await page.request.post(url+'/api/world',{data:requests.filter(r=>r.operation==='advance').at(-1)});assert.equal(replay.status(),200);assert.deepEqual((await replay.json()).world.characters[0].plan,plan);assert.equal(modelRequests.length-initial,kind==='completion'?2:1);
   await navigate('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});await panel.getByText(kind==='completion'?'完成目標安排 45 分鐘':'自行選定時段 30 分鐘',{exact:false}).waitFor();await page.screenshot({path:outputPath(`browser118-${kind}-pending.png`),fullPage:true});await page.reload();await choose();w=await advance();assert.equal(w.objects,undefined);
   if(kind==='completion'){assert.equal(w.supplies[0].remaining,1);assert.equal(w.characters[0].plan.startedAt,plan.startedAt);w=await advance();assert.equal(w.objects[0].id,'meal:1');assert.equal(w.supplies[0].remaining,0);assert.equal(npc,1);assert.equal(adjudication,1);}
   else{assert.match(w.characters[0].activity,/時段.*到期/);assert.equal(npc,1);assert.equal(adjudication,0);}
   assert.equal(w.characters[0].plan,undefined);await navigate('分析');await page.screenshot({path:outputPath(`browser118-${kind}-due.png`),fullPage:true});
   if(kind==='open-ended'){await navigate('觀察');await advance();assert.equal(npc,2);assert.equal(adjudication,0);}
   assert.equal(modelRequests.length-initial,2);assert.deepEqual(errors,[]);console.log(`PASS #118 actual Chromium ${kind}: saved semantics/time, reload/replay, no early result, due end and bounded normal decisions; ${npc} NPC+${adjudication} adjudication,80 fixture tokens.`);
  }finally{await browser.close();browser=undefined;}
 }
}finally{await browser?.close();server.close();}
