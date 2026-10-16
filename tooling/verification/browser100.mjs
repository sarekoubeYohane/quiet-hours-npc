import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/heavenly-will');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const navigate=(page,name)=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
const fixture=()=>{const w=load('world').seedWorld();w.characters=[w.characters[0],w.characters.find(c=>c.id==='owner')];Object.assign(w.characters[1],{control:{mode:'taken-over'},location:'kris-home',region:'kris-home-main'});w.adjudication={provider:'openai',model:'fixture-adjudicator'};w.objects=[{id:'cup:1',source:'cup',label:'測試杯子',region:'kris-home-main',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['cass','owner'],allowedTo:['cass','owner'],stateTransitions:{contents:['empty','water','tea']}}];return w;};
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const proposal={type:'propose',target:'cup:1',content:'逐步加入水再沖泡茶',purpose:'泡茶',mood:'平靜',durationMinutes:60,intents:[]};
const tea={status:'accepted',effects:[],check:null,stages:[{afterMinutes:30,preconditions:[{objectId:'cup:1',revision:1,region:'kris-home-main',holder:null,state:{contents:'empty'}}],effects:[{kind:'state',objectId:'cup:1',expectedRevision:1,key:'contents',value:'water'}]},{afterMinutes:60,preconditions:[{objectId:'cup:1',revision:2,region:'kris-home-main',holder:null,state:{contents:'water'}}],effects:[{kind:'state',objectId:'cup:1',expectedRevision:2,key:'contents',value:'tea'}]}]};
const input=request=>JSON.parse(request.messages[1].content);
let browser;
try{
 browser=await launchBrowser();
 const scenario=async(kind)=>{
  store.install(fixture());const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
  const initial=modelRequests.length;setModelResponder(request=>completion(input(request).contractVersion==='world-adjudication.v1'?tea:proposal));
  const read=async()=> (await (await page.request.get(url+'/api/world')).json()).world;
  const chooseAI=async()=>{await navigate(page,'設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate(page,'觀察');};
  const operation=async(button,operation,status=200)=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation===operation);await button.click();const result=await response;assert.equal(result.status(),status,await result.text());await page.waitForFunction(()=>!document.querySelector('.advance-button')?.textContent.includes('處理中'));if(status===200)await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
  const advance=status=>operation(page.getByRole('button',{name:'下一回合',exact:true}),'advance',status);
  const intervene=async()=>{await page.getByLabel('你想說的話或發生的事',{exact:true}).fill('可以留意一下這邊嗎？');return operation(page.getByRole('button',{name:'加入事件',exact:true}),'intervene');};
  try{
   await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await chooseAI();let w=await advance();assert.equal(w.objects[0].state.contents,'empty');assert.equal(w.characters[0].plan.phases.cursor,0);w=await advance();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects[0].revision,2);assert.equal(w.characters[0].plan.phases.cursor,1);assert.equal(modelRequests.length-initial,2);
   if(kind==='complete'){
    const started=w.characters[0].plan.startedAt;await page.reload();await chooseAI();await intervene();setModelResponder(()=>completion({...proposal,type:'continue',target:'',content:''}));w=await advance();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.characters[0].plan.startedAt,started);assert.equal(w.characters[0].plan.phases.cursor,1);
    const replay=await page.request.post(url+'/api/world',{data:requests.filter(r=>r.operation==='advance').at(-1)});assert.equal(replay.status(),200);assert.equal((await replay.json()).world.objects[0].revision,2);w=await advance();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects[0].revision,3);assert.equal(w.characters[0].plan,undefined);assert.equal(modelRequests.length-initial,3);
    await navigate(page,'分析');await page.addStyleTag({content:'body,body *{font-family:"Noto Sans TC",sans-serif!important}'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:outputPath('browser100-completed.png'),fullPage:true});
   }else if(kind==='interrupt'){
    await intervene();setModelResponder(()=>completion({...proposal,type:'rest',target:'',content:'',durationMinutes:90}));await advance();w=await advance();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects[0].revision,2);assert.equal(w.characters[0].plan.phases,undefined);assert.equal(modelRequests.length-initial,3);
   }else if(kind==='save'){
    await advance();store.conflictOnNextSave();w=await advance(502);assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects[0].revision,2);assert.equal(w.characters[0].plan.phases.cursor,1);await page.getByRole('alert').waitFor();w=await advance();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects[0].revision,3);assert.equal(modelRequests.length-initial,2);
   }else{
    await page.getByRole('region',{name:'角色近況',exact:true}).getByRole('button',{name:'店主',exact:true}).click();await operation(page.getByRole('button',{name:'交還控制權',exact:true}),'return-control');let sawIntermediate=false;
    setModelResponder(request=>{const v=input(request);if(v.contractVersion==='world-adjudication.v1')return completion({status:'accepted',effects:[{kind:'transfer',objectId:'cup:1',expectedRevision:2,toHolder:'owner',toRegion:'kris-home-main'}],check:null});sawIntermediate=v.objects?.some(o=>o.id==='cup:1'&&o.state.contents==='water');return completion(proposal);});w=await advance();assert.equal(sawIntermediate,true);assert.equal(w.objects[0].holder,'owner');
    setModelResponder(()=>completion({...proposal,type:'move',target:'cafe',content:'',durationMinutes:15}));w=await advance();assert.equal(w.objects[0].region,'cafe-front');assert.equal(w.objects[0].state.contents,'water');assert.equal(w.characters[0].plan,undefined);
    let cass;setModelResponder(request=>{const v=input(request);if(v.self?.id==='cass')cass=v;return completion({...proposal,type:'rest',target:'',content:'',durationMinutes:60});});await advance();assert.ok(cass);assert.deepEqual(cass.objects,[]);assert.doesNotMatch(cass.self.activity,/cafe|owner|店主|咖啡/);
   }
   assert.deepEqual(errors,[]);console.log(`PASS #100 real Chromium ${kind}: committed intermediate state, phase cursor, reload/replay or interruption/staleness, bounded dispatch and persisted world verified`);
  }finally{await context.close();}
 };
 for(const kind of ['complete','interrupt','save','other-npc'])await scenario(kind);
}finally{await browser?.close();server.close();}
