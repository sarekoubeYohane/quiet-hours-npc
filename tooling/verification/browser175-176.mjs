import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/long-activities');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const rest={type:'rest',target:'',content:'安靜閱讀',mood:'平靜',durationMinutes:240,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:1000}});page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 const navigate=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const choose=async()=>{await navigate('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate('觀察');};
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const advance=async()=>{const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(instant=>{Date.now=()=>instant;},clock.now);await navigate('觀察');const waiting=page.waitForResponse(response=>response.url().endsWith('/api/world')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await waiting;assert.equal(response.status(),200,await response.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
 for(const kind of ['open-ended','resumable']){
  const w=load('world').seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-adjudicator'};
  if(kind==='resumable')w.objects=[{id:'work',source:'fixture',label:'工作容器',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea']}}];store.install(w);
  let next=kind==='open-ended'?rest:{...rest,type:'propose',target:'work',content:'完成這項長工作',purpose:'完成工作',durationMinutes:30,timeIntent:{kind:'completion',maxMinutes:240}},pending=true,npc=0,judgments=0;
  const select=decision=>{next=decision;pending=true;};
  setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;return completion({resumable:true,status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:1,key:'contents',value:'water'}]},{afterMinutes:240,preconditions:[{objectId:'work',revision:2,region:'cafe-front',holder:null,state:[{key:'contents',value:'water'}]}],effects:[{kind:'state',objectId:'work',expectedRevision:2,key:'contents',value:'tea'}]}],check:null,routine:null,completionMinutes:240});}npc++;const decision=!pending&&input.currentActivity?.canContinueExisting?{...rest,type:'continue',durationMinutes:15}:next;pending=false;return completion(decision);});
  await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await choose();let world=await advance();const started=world.characters[0].plan.startedAt;
  for(let i=0;i<6;i++)world=await advance();assert.equal(world.minute-started,105);assert.equal(world.characters[0].plan.startedAt,started);
  await navigate('分析');await page.getByRole('region',{name:'日常規則與成果'}).getByText('240 分鐘',{exact:false}).waitFor();await page.getByRole('region',{name:'日常規則與成果'}).screenshot({path:outputPath(`long-${kind}-105.png`)});await page.reload();await choose();
  if(kind==='open-ended'){
   for(let i=0;i<9;i++)world=await advance();assert.equal(world.characters[0].plan,undefined);assert.match(world.characters[0].activity,/時段.*到期/);assert.equal(judgments,0);assert.equal(npc,2);
  }else{
   const intervention=await page.request.post(url+'/api/world',{data:{operationId:`${Date.now()}:${crypto.randomUUID()}`,operation:'intervene',mode:'openai',target:'owner',text:'可以先休息。'}});assert.equal(intervention.status(),200,await intervention.text());select({...rest,type:'pause',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});world=await advance();const paused=world.characters[0].pausedActivity;assert.equal(paused.elapsedMinutes,120);assert.equal(world.objects[0].revision,2);
   await navigate('分析');await page.getByText('暫停中',{exact:false}).waitFor();await page.getByRole('region',{name:'日常規則與成果'}).screenshot({path:outputPath('long-paused.png')});await page.reload();await choose();
   select({...rest,durationMinutes:30});await advance();world=await advance();select({...rest,type:'resume',target:paused.id,durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});world=await advance();assert.equal(world.characters[0].pausedActivity,undefined);assert.equal(world.characters[0].plan.phases.cursor,1);assert.equal(world.objects[0].revision,2);
   await navigate('分析');await page.getByRole('region',{name:'日常規則與成果'}).screenshot({path:outputPath('long-resumed.png')});
   for(let i=0;i<8;i++)world=await advance();assert.equal(world.characters[0].plan,undefined);assert.equal(world.objects[0].revision,3);assert.equal(world.objects[0].state.contents,'tea');assert.equal(judgments,1);
  }
  await navigate('分析');await page.getByRole('region',{name:'日常規則與成果'}).screenshot({path:outputPath(`long-${kind}-finished.png`)});console.log(`PASS #175/#176 Chromium ${kind}: 240-minute shared lifecycle, SQLite reload, actual application UI, NPC ${npc}, adjudication ${judgments}`);
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();server.close();}
