import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';

process.env.BROWSER_ARTIFACT_DIR=resolve('docs/verification/assets/life-preferences-178');
await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const initial=load('world').seedWorld();
initial.adjudication={provider:'openai',model:'fixture-world'};store.install(initial);
let stage=0;
setModelResponder(body=>{
 const input=JSON.parse(body.messages[1].content),source=input.self.shortTerm[0];
 const common={id:'quiet-moment',version:stage===0?0:1,references:[{kind:'short',id:source.id,version:source.version}],reason:stage===0?'這次經歷讓我想保留安靜片刻。':'我已重新考慮這個偏好。'};
 const update=stage===0?{...common,operation:'upsert',topic:'安靜片刻',context:'一個人時',text:'我喜歡有一段不被打擾的時間。'}:{...common,operation:'withdraw'};
 return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[],cognitiveUpdates:[],interpretation:'',preferenceUpdates:input.self.id==='cass'?[update]:[]})}}]});
});
let browser;
try {
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 const send=async body=>{const response=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:{operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',model:'gpt-6-luna',minutes:15,...body}});assert.equal(response.status(),200,await response.text());return response.json();};
 await send({operation:'set-model-key',key:'fixture-key'});await send({operation:'advance'});
 await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 const nav=()=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name:'分析',exact:true}).click();
 await nav();const details=page.locator('details').filter({has:page.locator(':scope > summary').getByText('主觀喜好',{exact:true})});
 await details.locator(':scope > summary').click();assert.match(await details.innerText(),/我喜歡有一段不被打擾的時間/);assert.match(await details.innerText(),/一個人時/);
 await details.getByText('來源與理由',{exact:true}).first().click();assert.match(await details.innerText(),/這次經歷讓我想保留安靜片刻/);
 assert.equal(store.snapshot().characters[0].preferences.items[0].version,1);
 await details.screenshot({path:outputPath('preference-saved.png')});
 await page.reload();await nav();await details.locator(':scope > summary').click();assert.match(await details.innerText(),/我喜歡有一段不被打擾的時間/);
 stage=1;await send({operation:'advance'});await page.reload();await nav();await details.locator(':scope > summary').click();assert.match(await details.innerText(),/尚無明示保存的喜好/);
 await details.getByText('喜好變更痕跡',{exact:true}).click();assert.match(await details.innerText(),/撤回/);assert.match(await details.innerText(),/不是完整永久心理史/);
 assert.equal(modelRequests.length,8);assert.deepEqual(errors,[]);
 await details.screenshot({path:outputPath('preference-withdrawn.png')});
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,modelCalls:modelRequests.length,world:store.snapshot()},null,2));
 console.log('PASS #178 actual WorldApp/API/SQLite preference save, sources, reload, withdraw and bounded trace; transport fixture only.');
} finally {await browser?.close();server.close();}
