import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,setModelResponder,modelRequests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR=resolve('docs/verification/assets/life-sleep-177');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.contextId='sleep-browser';world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-world'};
world.characters[0].needs={version:1,activatedAt:world.minute,updatedAt:world.minute,values:{hunger:39,thirst:39,fatigue:70,sleep:40},assessed:{hunger:0,thirst:0,fatigue:2,sleep:1},history:[],dropped:0};store.install(world);
let npc=0,judge=0;
setModelResponder(body=>{const input=JSON.parse(body.messages[1].content);let value;
if(input.contractVersion==='world-adjudication.v1'){judge++;value={status:'accepted',effects:[],stages:[],check:null,routine:null,completionMinutes:480,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}};}
else{npc++;value=npc===1?{type:'propose',target:'cafe',content:'在安全角落睡一覺',purpose:'睡眠恢復',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}}:{type:'rest',target:'',content:'醒來先坐一會兒',mood:'平靜',durationMinutes:60,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};}
return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const send=async body=>{const r=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:{operationId:`${Date.now()}:${crypto.randomUUID()}`,worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',minutes:15,...body}});assert.equal(r.status(),200,await r.text());return r.json();};
 await send({operation:'set-model-key',key:'fixture-key'});await send({operation:'advance'});for(let i=0;i<3;i++)await send({operation:'advance',minutes:30});
 await page.goto(url);const nav=page.getByRole('navigation',{name:'觀察室分頁'});await nav.getByRole('button',{name:'分析',exact:true}).click();await page.getByRole('button',{name:'店主',exact:true}).click();await page.getByRole('heading',{name:'身體需求',exact:true}).waitFor();
 let detail=page.getByRole('heading',{name:'身體需求',exact:true}).locator('..');assert.match(await detail.innerText(),/睡眠狀態：睡眠中/);assert.match(await detail.innerText(),/105 分鐘/);assert.equal(npc,1);assert.equal(judge,1);
 await detail.screenshot({path:outputPath('sleeping-105-minutes.png')});await page.reload();await nav.getByRole('button',{name:'分析',exact:true}).click();await page.getByRole('button',{name:'店主',exact:true}).click();await detail.waitFor();assert.match(await detail.innerText(),/105 分鐘/);
 const result=await send({operation:'advance'});await page.reload();await nav.getByRole('button',{name:'分析',exact:true}).click();await page.getByRole('button',{name:'店主',exact:true}).click();await detail.waitFor();assert.match(await detail.innerText(),/睡眠狀態：清醒/);assert.equal(result.world.characters[0].needs.values.sleep,20);assert.equal(npc,2);assert.equal(judge,1);assert.ok(result.world.events.some(e=>e.text.includes('自然醒')));
 await detail.screenshot({path:outputPath('naturally-awake.png')});assert.deepEqual(errors,[]);
 const evidence={fixture:true,browser:'Chromium',npc,judge,modelCalls:modelRequests.length,minute:result.world.minute,needs:result.world.characters[0].needs,activity:result.world.characters[0].activity};await writeFile(outputPath('evidence.json'),JSON.stringify(evidence,null,2));console.log('PASS sleep actual WorldApp/API/SQLite/reload; 105 minutes asleep, natural wake at 120, 2 NPC + 1 adjudication transport fixtures');
}finally{await browser?.close();server.close();}
