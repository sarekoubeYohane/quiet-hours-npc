import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/heavenly-will');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const navigate=(page,name)=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
const world=load('world').seedWorld();world.characters=[world.characters[0],world.characters.find(c=>c.id==='owner')];world.characters[1].control={mode:'taken-over'};world.characters[1].location='kris-home';world.characters[1].region='kris-home-main';world.adjudication={provider:'openai',model:'fixture-adjudicator'};
// The fixture explicitly grants borrowing; neither dialogue nor the adjudicator invents consent.
world.supplies=[{id:'cup',label:'測試杯子',region:'kris-home-main',remaining:1,owner:'owner',knownTo:['cass','owner'],allowedTo:['cass'],kind:'utensil',initialState:{clean:'no'},stateTransitions:{clean:['no','yes'],contents:['empty','water','tea']}}];store.install(world);
let step=0,judgments=0;
const effects=[[{kind:'materialize',supplyId:'cup',expectedRemaining:1}],null,[{kind:'state',objectId:'cup:1',expectedRevision:2,key:'clean',value:'yes'}],null,[{kind:'transfer',objectId:'cup:1',expectedRevision:4,toHolder:null,toRegion:'kris-home-main'}]];
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;return completion({status:'accepted',effects:effects[step-1],check:null});}step++;return completion({type:step===2||step===4?'move':'propose',target:step===2?'cafe':step===4?'kris-home':step===1?'cup':'cup:1',content:'處理眼前的杯子',purpose:'借用後洗淨歸還',mood:'平靜',durationMinutes:15,intents:[]});});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await navigate(page,'設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate(page,'觀察');
 const states=[{region:'kris-home-main',holder:'cass',clean:'no'},{region:'cafe-front',holder:'cass',clean:'no'},{region:'cafe-front',holder:'cass',clean:'yes'},{region:'kris-home-main',holder:'cass',clean:'yes'},{region:'kris-home-main',holder:null,clean:'yes'}];
 for(let index=0;index<states.length;index++){
  const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const result=await response;assert.equal(result.status(),200,await result.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');
  const saved=(await (await page.request.get(url+'/api/world')).json()).world;assert.equal(saved.objects.length,1);const cup=saved.objects[0];assert.equal(cup.id,'cup:1');assert.equal(cup.owner,'owner');assert.equal(cup.region,states[index].region);assert.equal(cup.holder,states[index].holder);assert.equal(cup.state.clean,states[index].clean);assert.equal(cup.revision,index+1);
 }
 assert.equal(step,5);assert.equal(judgments,3);assert.equal(modelRequests.length,8);assert.match(await page.getByRole('region',{name:'精簡近況',exact:true}).innerText(),/測試杯子/);
 await page.reload();const reloaded=(await (await page.request.get(url+'/api/world')).json()).world;assert.equal(reloaded.objects[0].id,'cup:1');assert.equal(reloaded.objects[0].holder,null);assert.equal(reloaded.objects[0].owner,'owner');assert.equal(reloaded.objects[0].state.clean,'yes');assert.equal(modelRequests.length,8);
 await navigate(page,'分析');await page.addStyleTag({content:'body,body *{font-family:"Noto Sans TC",sans-serif!important}'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:outputPath('browser94-returned.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS #94 real Chromium borrow/carry/wash/carry/return preserves identity, ownership, location, holder, state and revisions across five saved rounds and reload; 5 NPC + 3 adjudication requests');
}finally{await browser?.close();server.close();}
