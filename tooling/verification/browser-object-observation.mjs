import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,requests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/object-observation-207');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const w=load('world').seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-judge'};
w.objects=[{id:'unseen-item',source:'ordinary-source',label:'儲藏室的布包',region:'cafe-storeroom',holder:null,owner:'owner',revision:1,state:{surface:'乾燥',secret:'SECRET_HIDDEN'},stateExposure:{secret:'hidden'},lifecycle:'active',kind:'utensil',knownTo:[],allowedTo:['owner']}];store.install(w);
const frames=[];let npc=0,rolls=0;const originalRandom=Math.random;Math.random=()=>{rolls++;return .675;};
setModelResponder(request=>{const input=JSON.parse(request.messages[1].content);assert.ok(input.self,'No adjudication is needed for observation');frames.push({request,input});npc++;const action=npc===1?{type:'move',target:'cafe-storeroom'}:npc===2?{type:'observe',target:'cafe-storeroom',content:'sight'}:{type:'rest'};return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],...action})}}]});});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(20000);await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
 for(let i=0;i<3;i++){
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');
  if(i===0)assert.deepEqual((await read()).objects[0].knownTo,[]);
 }
 assert.equal(npc,3);assert.equal(rolls,1);assert.ok(frames[2].input.objects.some(o=>o.id==='unseen-item'));assert.equal(JSON.stringify(frames.map(f=>f.input)).includes('SECRET_HIDDEN'),false);
 const saved=await read();assert.deepEqual(saved.objects[0].knownTo,['owner']);assert.equal(saved.objects[0].holder,null);
 await nav('分析');const observation=page.locator('.analysis-events .perception-details').filter({hasText:'儲藏室的布包'});await observation.getByText('感知詳情（觀察者）',{exact:true}).click();await observation.scrollIntoViewIfNeeded();assert.match(await observation.innerText(),/來源：儲藏室的布包/);await page.screenshot({path:outputPath('observation.png')});
 await nav('分析');const panel=page.getByRole('region',{name:'日常規則與成果'});await panel.waitFor();await panel.screenshot({path:outputPath('objects.png')});
 const count=npc;await page.reload();assert.equal(npc,count);assert.deepEqual((await read()).objects,saved.objects);const last=requests.filter(r=>r.operation==='advance').at(-1);assert.equal((await page.request.post(url+'/api/world',{data:last})).status(),200);assert.equal(npc,count);
 await page.setViewportSize({width:390,height:844});await nav('觀察');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:outputPath('mobile.png')});assert.deepEqual(errors,[]);
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,realPaidCalls:0,npc,adjudication:0,rolls,checks:{actualUiAdvances:3,movementNotKnowledge:true,discoveryNotPossession:true,sqliteReload:true,nextActualMessages:true,noHiddenState:true,reloadZeroDispatch:true,replayZeroDispatch:true,mobileNoOverflow:true,pageErrors:errors},capacity:{inputBytes:Buffer.byteLength(frames[2].request.messages[1].content),worldBytes:Buffer.byteLength(JSON.stringify(saved)),memoryBytes:Buffer.byteLength(JSON.stringify(saved.characters[0].shortTerm)),probeReceiptBytes:Buffer.byteLength(JSON.stringify(saved.probeResults))}},null,2)+'\n');console.log('PASS #207 actual WorldApp / SQLite / next messages / reload / replay / desktop + mobile');
}finally{Math.random=originalRandom;await browser?.close();server.close();}
