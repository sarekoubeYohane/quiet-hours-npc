import assert from 'node:assert/strict';
import {url,server,store,load,setModelResponder,modelRequests} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
let browser;
try{
 const world=load('world').seedWorld();world.contextId='browser-life-habits';world.adjudication={provider:'openai',model:'fixture-judge'};
 for(const c of world.characters)if(c.id!=='owner')c.control={mode:'taken-over'};
 store.install(world);const POST=load('route').POST;
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),mode:'openai',model:'gpt-6-luna',worldContext:world.contextId,...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});
 let choice;
 setModelResponder(async()=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(choice)}}]}));
 const decision=extra=>({type:'rest',target:'',content:'休息一會兒',mood:'平靜',durationMinutes:15,intents:[],...extra});
 const advance=async()=>{const r=await post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());};
 for(let day=0;day<3;day++){
  const w=store.snapshot();w.minute=1260+1440*day;store.replaceCommittedWorld(w);
  choice=decision({type:'work',target:'tidy',content:'整理桌面'});await advance();choice=decision();await advance();
  const e=store.snapshot().characters.find(c=>c.id==='owner').habitEvidence;
  choice=decision({habitCandidates:[{trigger:e.at(-2).memory,action:e.at(-1).memory}]});await advance();
 }
 const calls=modelRequests.length;
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 await page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name:'分析',exact:true}).click();
 await page.getByRole('heading',{name:'角色狀態',exact:true}).locator('..').locator('..').getByRole('button',{name:'店主',exact:true}).click();
 const panel=page.locator('details[aria-label="自主習慣證據"]');await panel.locator('summary').first().click();
 assert.match(await panel.innerText(),/整理之後，常會休息.*已形成.*3 個世界日/);assert.match(await panel.innerText(),/真正開始/);assert.match(await panel.innerText(),/開始不代表完成、有效或喜歡/);
 await panel.screenshot({path:outputPath('life-habits-desktop.png')});
 await page.reload();await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 await page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name:'分析',exact:true}).click();
 await page.getByRole('heading',{name:'角色狀態',exact:true}).locator('..').locator('..').getByRole('button',{name:'店主',exact:true}).click();
 await panel.locator('summary').first().click();assert.match(await panel.innerText(),/整理之後，常會休息/);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await panel.screenshot({path:outputPath('life-habits-narrow.png')});
 assert.equal(modelRequests.length,calls);assert.deepEqual(errors,[]);
 console.log('PASS habits: real API and SQLite three-day starts -> normal candidate -> formed event tendency -> existing analysis UI -> reload, desktop/mobile, no read model calls');
}finally{await browser?.close();server.close();}
