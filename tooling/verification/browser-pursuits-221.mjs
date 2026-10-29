import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,setModelResponder,modelRequests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR ||= resolve('outputs/pursuits-221');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const w=load('world').seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-judge'};store.install(w);
let calls=0;
setModelResponder(request=>{
 const data=JSON.parse(request.messages[1].content);calls++;assert.equal(data.contractVersion,'npc-decision.v3');
 if(calls===2)assert.equal(data.self.intents.find(n=>n.id==='owner:quiet').scope,'先讓自己安靜休息一會兒');
 const value={contractVersion:'npc-decision.v3',pursuitContext:data.pursuitContext,focusIntentId:'owner:quiet',pursuitUpdates:calls===1?[{operation:'upsert',id:'owner:quiet',version:0,node:{id:'owner:quiet',content:'照顧自己的精神',context:'',kind:'intent',scope:'先讓自己安靜休息一會兒',satisfaction:null,intensity:'medium',importance:'medium',urgency:'low',parents:[{id:'owner:direction',version:1}]},references:[],reason:'依自己的想法承接休息'}]:[],action:{type:'rest',target:'',content:'安靜休息',purpose:''},mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},methodAssessment:{purpose:'照顧自己的精神',knownResults:[],choice:'new',method:'安靜休息',change:{kind:'none',detail:''},reason:'仍想照顧自己',selectedAction:{type:'rest',target:''},intentIds:['owner:quiet']},reconfirmBodyConsequences:false,attentionConditions:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],interpretation:'',preferenceUpdates:[],habitCandidates:[],arrangementUpdates:[]};
 return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify(value)}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
 await page.addInitScript(instant=>{Date.now=()=>instant;},Date.parse('2026-10-15T16:00:00Z'));
 const nav=name=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
 await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'fixture-key'}});
 for(let round=0;round<2;round++){
  await page.goto(url);await nav('設定');await page.getByRole('combobox',{name:'決策方式',exact:true}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();await nav('觀察');
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/world')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).operation==='advance');
  await page.getByRole('button',{name:'下一回合',exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());
 }
 await page.reload();await nav('分析');await page.getByRole('button',{name:'店主',exact:true}).click();const panel=page.getByRole('region',{name:'分層追求',exact:true});
 await panel.getByText('先讓自己安靜休息一會兒',{exact:false}).first().waitFor();assert.match(await panel.innerText(),/owner:quiet.*v1/s);assert.match(await panel.innerText(),/上層：整理咖啡館/);
 await panel.getByText('追求變更痕跡（觀察者）',{exact:true}).click();assert.match(await panel.innerText(),/新承接 → v1 先讓自己安靜休息一會兒/);
 await panel.screenshot({path:outputPath('pursuits-panel.png')});
 await page.screenshot({path:outputPath('analysis.png'),fullPage:true});
 await nav('觀察');await page.getByRole('button',{name:'人物檔案',exact:true}).click();assert.match(await page.getByRole('region',{name:'人物檔案',exact:true}).innerText(),/承接範圍：先讓自己安靜休息一會兒/);
 await page.screenshot({path:outputPath('profile.png'),fullPage:true});
 assert.equal(calls,2);assert.deepEqual(errors,[]);const saved=store.snapshot();assert.equal(saved.turn,2);assert.equal(saved.characters[0].intents.find(i=>i.id==='owner:quiet').version,1);
 const summary={result:'PASS',worldTurn:saved.turn,actualFixtureDispatches:calls,realPaidDispatches:0,reloadedAnalysis:true,reloadedProfile:true,nextActualRequestPreservedScope:JSON.parse(modelRequests[1].messages[1].content).self.intents.find(i=>i.id==='owner:quiet').scope};
 await writeFile(outputPath('summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await browser?.close();server.close();}
