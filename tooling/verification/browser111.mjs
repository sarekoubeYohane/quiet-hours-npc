import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/routine-rules');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-adjudicator'};
world.routineRules=[{id:'browser-tea',version:1,family:'cafe-service',operations:['tea'],origin:'cafe',knownTo:['owner']}];
world.objects=[{id:'cup',source:'finite-cups',label:'咖啡館內唯一一隻茶杯',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty',condition:'broken'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea'],condition:['broken','sound']}}];store.install(world);
const completion=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
let npc=0,adjudication=0,newMethod=false;
setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){adjudication++;return completion({status:'unsupported',effects:[],stages:[],check:null});}npc++;assert.doesNotMatch(JSON.stringify(input),/routineAudit|ruleId|owner_consent|反循環|必須放棄/);return completion(newMethod?{type:'propose',target:'cup',content:'用魔法改造這隻茶杯',purpose:'改造器具',mood:'平靜',durationMinutes:30,intents:[]}:{type:'propose',target:'cafe',content:npc===1?'泡一杯茶':'沖泡一壺紅茶',purpose:'泡茶',mood:'平靜',durationMinutes:30,intents:[]});});
const navigate=(page,name)=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
let browser;
try{
 browser=await launchBrowser();const width=Number(process.env.BROWSER_WIDTH)||1280;const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const choose=async()=>{await navigate(page,'設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await navigate(page,'觀察');};
 const advance=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const result=await response;assert.equal(result.status(),200,await result.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');return read();};
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await choose();
 let w=await advance();assert.equal(w.routineAudit.at(-1).result,'blocked');assert.match(w.characters[0].activity,/器具已損壞/);
 await page.reload();await choose();w=await advance();assert.equal(npc,2);assert.equal(adjudication,0);assert.equal(w.aiUsage.totalCalls,2);assert.equal(w.objects[0].state.contents,'empty');
 await navigate(page,'分析');const panel=page.getByRole('region',{name:'日常規則與成果',exact:true});await panel.getByText('規則受阻，無新增裁定',{exact:false}).first().waitFor();
 const padding=await panel.evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft));assert.ok(padding>=18);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.screenshot({path:outputPath(`browser111-blocked-${width}.png`),fullPage:true});
 // Authoritative scene fixture update changes only relevant actual conditions;
 // the user-facing intervention separately enters the real API/memory path.
 w.objects[0].state.condition='sound';w.objects[0].revision++;store.replaceCommittedWorld(w);
 const intervention=await page.request.post(url+'/api/world',{data:{operation:'intervene',mode:'demo',operationId:`${Date.now()}:${crypto.randomUUID()}`,worldContext:w.contextId,target:'owner',text:'剛才的器具已經修好了。'}});assert.equal(intervention.status(),200);
 await page.reload();await choose();w=await advance();assert.equal(w.objects[0].state.contents,'water');w=await advance();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects.filter(o=>o.kind==='utensil').length,1);assert.equal(adjudication,0);assert.equal(npc,3);
 newMethod=true;w=await advance();assert.equal(npc,4);assert.equal(adjudication,1);assert.equal(w.aiUsage.totalCalls,5);assert.match(w.characters[0].activity,/無法落實/);assert.equal(modelRequests.length,5);
 await navigate(page,'分析');await page.screenshot({path:outputPath(`browser111-recovered-${width}.png`),fullPage:true});assert.deepEqual(errors,[]);
 console.log(`PASS #111 Chromium ${width}px: broken→fresh wording/reload→actual repair+intervene→timed completion→new-method unsupported; 4 normal NPC + 1 adjudication, 200 reported tokens; known blocked/recovery added 0 adjudications; readable padded panel, no horizontal overflow.`);
}finally{await browser?.close();server.close();}
