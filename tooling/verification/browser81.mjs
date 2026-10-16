import assert from 'node:assert/strict';
import {url,server,store,load} from './browser-fixture.mjs';
import {launchBrowser,outputPath} from './browser-runtime.mjs';
const navigate=(page,name)=>page.getByRole('navigation',{name:'觀察室分頁'}).getByRole('button',{name,exact:true}).click();
const env=load('cloudflare-workers').env;
const action={type:'rest',target:'',content:'',mood:'平靜',durationMinutes:90,intents:[]};
const world=()=>{const w=load('world').seedWorld();for(const c of w.characters)c.control={mode:'taken-over'};w.characters[0].control={mode:'autonomous'};return w;};
let browser;
try{
 browser=await launchBrowser();
 const page=await browser.newPage();await page.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-15T16:00:00Z');});
 const read=async()=>(await(await page.request.get(url+'/api/world')).json()).world;
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const setup=async()=>{await page.context().clearCookies();store.install(world());await page.request.post(url+'/api/world',{data:{operation:'set-model-key',mode:'openai',key:'test-key'}});await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByRole('combobox',{name:'決策方式'}).click();await page.getByRole('option',{name:'OpenAI 直連',exact:true}).click();};
 await setup();await navigate(page,'分析');assert.match(await page.getByRole('region',{name:'付費方與限制'}).innerText(),/目前未啟用/);console.log('PASS disabled owner service payer panel');
 // Provider boundary fault; browser still operates actual WorldApp and real world API.
 globalThis.fetch=async()=>new Response('{}',{status:429});await page.getByRole('button',{name:'下一回合',exact:true}).click();await page.getByRole('alert').filter({hasText:'供應商額度／速率：'}).waitFor();console.log('PASS provider quota visible scope');
 await setup();env.RECALL_ENABLED='true';env.RECALL_USAGE_DB=store.database();env.OWNER_EMBEDDING_KEY='owner-key';env.MEMORY_VECTOR_INDEX={upsert:async()=>({}),deleteByIds:async()=>({}),getByIds:async()=>[],queryById:async()=>({matches:[]}),query:async()=>({matches:[]})};env.RECALL_BUDGET_LIMITS=JSON.stringify({embedding:{ownerMonthly:0,accountMonthly:0}});
 globalThis.fetch=async()=>Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({type:'recall',questions:['她？']})}}]});await page.getByRole('button',{name:'下一回合',exact:true}).click();await page.getByRole('alert').filter({hasText:'站主共用服務：站主回想服務預算不足'}).waitFor();assert.equal((await read()).turn,0);console.log('PASS owner budget reason browser + rollback');
 delete env.RECALL_BUDGET_LIMITS;await setup();delete env.OWNER_EMBEDDING_KEY;await page.getByRole('button',{name:'下一回合',exact:true}).click();await page.getByRole('alert').filter({hasText:'站主共用服務：站主回想服務尚未啟用'}).waitFor();console.log('PASS owner configuration unavailable browser');
 delete env.RECALL_ENABLED;await setup();globalThis.fetch=async()=>{throw Error('test transport failure')};await page.getByRole('button',{name:'下一回合',exact:true}).click();await page.getByRole('alert').filter({hasText:'技術故障：'}).waitFor();console.log('PASS technical failure browser');
 await setup();globalThis.fetch=async()=>Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(action)}}]});await page.getByRole('button',{name:'下一回合',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.advance-button')?.textContent.trim()==='下一回合');assert.equal((await read()).turn,1);console.log('PASS normal chat browser + world API commit');
 assert.deepEqual(errors,[]);await page.screenshot({path:outputPath('browser81.png'),fullPage:true});console.log('PASS no page errors');
}finally{await browser?.close();server.close();}
