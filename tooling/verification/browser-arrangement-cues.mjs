import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR=resolve('docs/verification/assets/arrangement-cues-191');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const initial=load('world').seedWorld();initial.characters=initial.characters.filter(c=>c.id==='owner');initial.adjudication={provider:'openai',model:'fixture-world'};store.install(initial);
let stage=0;
setModelResponder(body=>{
 const input=JSON.parse(body.messages[1].content),source=input.self.shortTerm[0];
 const update={operation:'upsert',id:'tea-later',version:stage===0?0:1,text:'稍後與 Vera 討論茶的香氣',condition:{kind:'time',minute:initial.minute+30},references:[{kind:'short',id:source.id,version:source.version}],reason:'我想自行安排稍後的事'};
 return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({type:stage===0?'rest':'continue',target:'',content:'',mood:'平靜',durationMinutes:stage===0?120:15,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[],arrangementUpdates:stage===0?[update]:[]})}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const send=async body=>{const r=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:{operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',model:'gpt-6-luna',minutes:15,...body}});assert.equal(r.status(),200,await r.text());return r.json();};
 await send({operation:'set-model-key',key:'fixture-key'});await send({operation:'advance'});await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 const nav=async()=>{await page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name:'分析',exact:true}).click();await page.getByRole('button',{name:initial.characters[0].name,exact:true}).last().click();};await nav();const details=page.locator('details').filter({has:page.locator(':scope > summary').getByText('柔性安排',{exact:true})});
 await details.locator(':scope > summary').click();assert.match(await details.innerText(),/稍後與 Vera 討論茶的香氣/);assert.match(await details.innerText(),/尚未越過時間/);const before=store.snapshot();await details.screenshot({path:outputPath('saved.png')});
 await page.reload();await nav();await details.locator(':scope > summary').click();assert.deepEqual(store.snapshot(),before);assert.match(await details.innerText(),/尚未完成/);
 stage=1;await send({operation:'advance'});await page.reload();await nav();await details.locator(':scope > summary').click();assert.match(await details.innerText(),/已獲一次正常決策機會/);assert.match(await details.innerText(),/尚未完成/);const beforeContinue=store.snapshot();await send({operation:'advance'});await page.reload();await nav();await details.locator(':scope > summary').click();assert.equal(store.snapshot().characters[0].plan.startedAt,beforeContinue.characters[0].plan.startedAt);assert.equal(modelRequests.length,2);assert.deepEqual(errors,[]);await details.screenshot({path:outputPath('handled.png')});
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,calls:modelRequests.length,arrangements:store.snapshot().characters[0].arrangements},null,2));console.log('PASS #191 actual WorldApp/API/SQLite due cue, continue, deduplication, reload; transport fixture only');
}finally{await browser?.close();server.close();}
