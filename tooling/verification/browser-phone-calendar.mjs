import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {url,server,store,load,modelRequests,setModelResponder} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
process.env.BROWSER_ARTIFACT_DIR=resolve('docs/verification/assets/phone-calendar-192');await mkdir(process.env.BROWSER_ARTIFACT_DIR,{recursive:true});
const initial=load('world').seedWorld();initial.characters=initial.characters.filter(c=>c.id==='owner');initial.adjudication={provider:'openai',model:'fixture-world'};store.install(initial);let stage=0;
const phone=(input,p)=>({type:'phone',target:input.phones.find(d=>d.owner===input.self.id).objectId,content:JSON.stringify({collection:'calendar',...p})});
setModelResponder(body=>{
 const input=JSON.parse(body.messages[1].content),source=input.self.shortTerm[0];
 const value=stage===0?{arrangementUpdates:[{operation:'upsert',id:'later-talk',version:0,text:'以後想討論茶的香氣',condition:{kind:'time',minute:initial.minute+300},references:[{kind:'short',id:source.id,version:source.version}],reason:'我自己想留待稍後考慮'}]}:stage===1?phone(input,{operation:'create',id:'calendar-talk',version:0,text:'外部原文：稍後考慮談茶，並未答應邀約。',condition:{kind:'time',minute:initial.minute+60},arrangement:{id:'later-talk',version:1},reminder:true}):stage===2||stage>=7?{durationMinutes:120,timeIntent:{kind:'open-ended',maxMinutes:null}}:stage===3?{type:'continue'}:stage===4?phone(input,{operation:'read',id:'calendar-talk',version:1}):stage===5?phone(input,{operation:'reminder',id:'calendar-talk',version:1,condition:{kind:'time',minute:initial.minute+150}}):phone(input,{operation:'reminder',id:'calendar-talk',version:2,condition:null});
 return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],...value})}}]});
});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const send=async body=>{await page.request.post(url+'/__fixture',{data:{advanceMs:1000}});const r=await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data:{operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',model:'gpt-6-luna',minutes:15,...body}});assert.equal(r.status(),200,await r.text());return r.json();};
 await send({operation:'set-model-key',key:'fixture-key'});for(stage=0;stage<4;stage++)await send({operation:'advance'});
 await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 const show=async()=>{await page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name:'分析',exact:true}).click();await page.getByText('手機與私人外部紀錄（觀察者）',{exact:true}).click();await page.getByText('行事曆與提醒（1/32）',{exact:true}).click();};await show();
 const details=page.locator('details').filter({has:page.locator(':scope > summary').getByText('行事曆與提醒（1/32）',{exact:true})});
 assert.match(await details.innerText(),/外部原文/);assert.match(await details.innerText(),/已啟用/);assert.match(await details.innerText(),/通知 1 次/);assert.match(await details.innerText(),/尚未閱讀/);assert.match(await details.innerText(),/仍未完成/);const before=store.snapshot();await details.screenshot({path:outputPath('due-unread.png')});
 await page.reload();await show();assert.deepEqual(store.snapshot(),before);assert.equal(modelRequests.length,4);
 await send({operation:'intervene',target:'owner',text:'你可以自行考慮是否查看手機。'});stage=4;await send({operation:'advance'});await page.reload();await show();assert.ok((await details.innerText()).includes(initial.characters[0].name));assert.equal(store.snapshot().phones.devices[0].calendar[0].readers.length,1);await details.screenshot({path:outputPath('read.png')});
 for(stage=5;stage<8;stage++)await send({operation:'advance'});for(stage=8;stage<12;stage++)await send({operation:'advance'});await page.reload();await show();assert.match(await details.innerText(),/未啟用或已取消/);assert.match(await details.innerText(),/通知 1 次（有效 0）/);assert.equal(store.snapshot().characters[0].arrangements.items[0].status,'active');assert.equal(modelRequests.length,8);assert.deepEqual(errors,[]);await details.screenshot({path:outputPath('cancelled.png')});
 await writeFile(outputPath('evidence.json'),JSON.stringify({fixture:true,calls:modelRequests.length,calendar:store.snapshot().phones.devices[0].calendar,notifications:store.snapshot().phones.devices[0].notifications,arrangements:store.snapshot().characters[0].arrangements},null,2));console.log('PASS #192 realWorldApp/API/SQLite internal plan→calendar→reminder→continue→read→postpone→cancel, reload and no extra modelchain');
}finally{await browser?.close();server.close();}
