import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR=resolve('docs/verification/assets/life-forecast-181');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const world=load('world').seedWorld();world.contextId='life-forecast';world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-judge'};
world.characters[0].needs={version:1,activatedAt:world.minute,updatedAt:world.minute,values:{hunger:20,thirst:20,fatigue:50,sleep:40},assessed:{hunger:0,thirst:0,fatigue:1,sleep:1},history:[],dropped:0};store.install(world);
let npc=0,judge=0;
setModelResponder(body=>{const input=JSON.parse(body.messages[1].content);let v;if(input.contractVersion==='world-adjudication.v1'){judge++;v={status:'accepted',effects:[],stages:[],check:null,routine:null,completionMinutes:480,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}};}else{npc++;v=npc===1?{type:'propose',target:'cafe',content:'在安全角落睡一覺',purpose:'睡眠恢復',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}}:{type:'rest',target:'',content:'醒來先休息',mood:'平靜',durationMinutes:60,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};}return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const send=async body=>{const r=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:{operationId:`${Date.now()}:${crypto.randomUUID()}`,worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',minutes:15,...body}});assert.equal(r.status(),200,await r.text());return r.json();};
 await send({operation:'set-model-key',key:'fixture-key'});await send({operation:'advance'});for(let i=0;i<3;i++)await send({operation:'advance',minutes:30});
 await page.goto(url);const nav=page.getByRole('navigation',{name:'觀察室分頁'});await nav.getByRole('button',{name:'設定',exact:true}).click();await page.getByRole('combobox',{name:'決策方式'}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav.getByRole('button',{name:'分析',exact:true}).click();
 const forecast=page.getByText('下一回合預計詢問',{exact:true}).locator('..');await forecast.waitFor();const shown=await forecast.innerText();assert.match(shown,/1\s*名角色/,'natural waking must count its next real decision');assert.equal(npc,1);assert.equal(judge,1);
 await forecast.screenshot({path:outputPath('next-wake-decision.png')});await send({operation:'advance'});assert.equal(npc,2);assert.equal(judge,1);assert.deepEqual(errors,[]);await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,shown,npc,judge},null,2));console.log('PASS next-round UI predicts one actual natural-wake NPC decision');
}finally{await browser?.close();server.close();}
