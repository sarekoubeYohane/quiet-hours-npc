import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/activity-time');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const tea={type:'propose',target:'cafe',content:'泡一杯茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
const rest={type:'rest',target:'',content:'安靜休息',mood:'平靜',durationMinutes:45,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};
const continueDecision={...rest,type:'continue',durationMinutes:90};
let browser;
async function scenario(kind,minutes){
 const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-adjudicator'};
 if(kind==='moved'){
  const cass=load('world').seedWorld().characters.find(c=>c.id==='cass');cass.location='cafe';cass.region='cafe-front';world.characters.push(cass);
  world.objects=[{id:'shared-cup',source:'fixture',label:'共用杯子',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner','cass'],allowedTo:['owner','cass'],stateTransitions:{contents:['empty','water','tea']}}];
 }
 store.install(world);let npc=0,adjudication=0,decision=kind==='open'?rest:tea,ownerStep=0,cassStep=0;const inputs=[];
 setModelResponder(request=>{
  const input=JSON.parse(request.messages[1].content);
  if(input.contractVersion==='world-adjudication.v1'){
   adjudication++;
   if(kind==='moved')return completion(input.actor.id==='cass'?{status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[{objectId:'shared-cup',revision:1,region:'cafe-front',holder:null,state:[{key:'contents',value:'empty'}]}],effects:[{kind:'state',objectId:'shared-cup',expectedRevision:1,key:'contents',value:'water'}]},{afterMinutes:90,preconditions:[{objectId:'shared-cup',revision:2,region:'cafe-front',holder:null,state:[{key:'contents',value:'water'}]}],effects:[{kind:'state',objectId:'shared-cup',expectedRevision:2,key:'contents',value:'tea'}]}],check:null,routine:null,completionMinutes:90}:{status:'accepted',effects:[{kind:'transfer',objectId:'shared-cup',expectedRevision:2,toHolder:'owner',toRegion:'cafe-front'}],stages:[],check:null,routine:null,completionMinutes:15});
   return completion({status:'accepted',effects:[],stages:[],check:null,completionMinutes:null,routine:{family:'cafe-service',version:1,timings:input.routineOffer.operations.map(operation=>({operation,minutes:operation==='tea'?minutes:15}))}});
  }
  npc++;inputs.push(input);
  if(kind==='moved')return completion(input.self.id==='cass'?(++cassStep===1?{...tea,target:'shared-cup',content:'以現有杯子完成這杯茶',purpose:'完成茶飲'}:rest):(++ownerStep===1?{...rest,durationMinutes:90}:ownerStep===2?{...tea,target:'shared-cup',content:'拿起共用杯子',purpose:'攜帶杯子'}:{...rest,type:'move',target:'kris-home',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}}));
  return completion(decision);
 });
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:900}});page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const navigate=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const choose=async(mode='OpenAI 直連')=>{await navigate('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:mode,exact:true}).click();await navigate('觀察');};
 const tick=async()=>{const clock=await(await page.request.post(url+'/__fixture',{data:{advanceMs:1000}})).json();await page.evaluate(instant=>{Date.now=()=>instant;},clock.now);};
 const action=async(button,operation,status=200)=>{await tick();const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation===operation);await button.click();const response=await pending;assert.equal(response.status(),status,await response.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
 const advance=()=>action(page.getByRole('button',{name:'下一回合',exact:true}),'advance');
 const intervene=async(target='owner')=>{if(target==='owner')await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();await page.getByLabel('你想說的話或發生的事',{exact:true}).fill(kind==='controls'?'先泡一杯茶':'現在方便回應一下嗎？');return action(page.getByRole('button',{name:'加入事件',exact:true}),'intervene');};
 const replay=async w=>{const response=await page.request.post(url+'/api/world',{data:requests.filter(r=>r.operation==='advance').at(-1)});assert.equal(response.status(),200);assert.deepEqual((await response.json()).world.objects,w.objects);};
 try{
  await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await choose();let w=await advance();
  if(kind==='continue'||kind==='open'){
   const plan=structuredClone(w.characters[0].plan),objects=structuredClone(w.objects);await page.reload();await choose();await intervene();decision=continueDecision;w=await advance();assert.equal(w.characters[0].plan.startedAt,plan.startedAt);assert.equal(w.characters[0].plan.until,plan.until);assert.deepEqual(w.characters[0].plan.timeIntent,plan.timeIntent);assert.deepEqual(w.objects,objects);if(plan.phases)assert.equal(w.characters[0].plan.phases.cursor,plan.phases.cursor);await replay(w);
   if(kind==='open'){await intervene();w=await advance();assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,/時段.*到期/);assert.equal(npc,3);assert.equal(adjudication,0);}
   else{while(w.minute<plan.until)w=await advance();assert.equal(w.characters[0].plan,undefined);assert.equal(w.objects.filter(o=>o.state.beverage==='tea').length,1);assert.equal(npc,2);assert.equal(adjudication,1);}
  }else if(kind==='switch'){
   const cup=structuredClone(w.objects[0]);assert.equal(w.supplies.filter(s=>s.pending).length,1);await intervene();decision=rest;w=await advance();assert.equal(w.objects[0].id,cup.id);assert.equal(w.objects[0].state.contents,'water');assert.equal(w.supplies.filter(s=>s.pending).length,0);assert.equal(w.characters[0].plan.timeIntent.kind,'open-ended');await replay(w);await page.reload();await choose();w=await advance();w=await advance();assert.equal(w.objects.filter(o=>o.kind==='food').length,0);assert.equal(npc,2);assert.equal(adjudication,1);await navigate('分析');await page.screenshot({path:outputPath('browser119-interrupted-water.png'),fullPage:true});
  }else if(kind==='controls'){
   w=await advance();assert.equal(w.objects.filter(o=>o.state.beverage==='tea').length,1);assert.equal(npc,1);assert.equal(adjudication,1);
   await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();
   const control=page.getByRole('region',{name:'店主直接控制'});
   const directTea=async()=>{await tick();const saved=await read();const response=await page.request.post(url+'/api/world',{data:{operation:'direct',mode:'openai',worldContext:saved.contextId,operationId:`${Date.now()}:${crypto.randomUUID()}`,action:{type:'work',target:'tea'}}});assert.equal(response.status(),200,await response.text());await page.reload();await choose();await page.getByRole('region',{name:'角色近況'}).getByRole('button',{name:'店主',exact:true}).click();return read();};
   await directTea();w=await advance();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,30);assert.equal(w.characters[0].control.mode,'autonomous');await replay(w);w=await advance();assert.equal(w.objects.filter(o=>o.state.beverage==='tea').length,2);
   await action(control.getByRole('button',{name:'暫時接管店主'}),'takeover');await directTea();w=await advance();assert.equal(w.supplies.filter(s=>s.pending).length,1);const intermediate=structuredClone(w.objects);w=await action(control.getByRole('button',{name:'交還控制權'}),'return-control');assert.deepEqual(w.objects,intermediate);assert.equal(w.supplies.filter(s=>s.pending).length,0);assert.equal(w.characters[0].plan,undefined);
   await choose('規則試玩');await intervene();w=await advance();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,30);w=await advance();assert.equal(w.objects.filter(o=>o.state.beverage==='tea').length,3);assert.equal(npc,1);assert.equal(adjudication,1);await navigate('分析');await page.screenshot({path:outputPath('browser119-controls-reused.png'),fullPage:true});
  }else{
   await intervene();w=await advance();assert.equal(w.objects[0].holder,'owner');w=await advance();assert.equal(w.objects[0].region,'kris-home-main');while(w.minute<1350)w=await advance();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects[0].holder,'owner');assert.equal(w.objects.length,1);assert.equal(w.characters.find(c=>c.id==='cass').plan,undefined);w=await advance();const input=inputs.filter(i=>i.self.id==='cass').at(-1);assert.deepEqual(input.objects,[]);assert.doesNotMatch(input.self.activity,/kris-home|owner|店主|Kris/);assert.equal(adjudication,2);
  }
  assert.deepEqual(errors,[]);console.log(`PASS #119 actual Chromium ${kind}${minutes}: UI/API/reload/replay/time semantics, actual persisted effects and bounded dispatch ${npc} NPC+${adjudication} adjudication.`);
 }finally{await browser.close();browser=undefined;}
}
try{for(const [kind,minutes] of [['continue',60],['continue',90],['open',45],['switch',60],['controls',30],['moved',90]])if(!process.env.BROWSER119_CASE||process.env.BROWSER119_CASE===kind)await scenario(kind,minutes);}finally{await browser?.close();server.close();}
