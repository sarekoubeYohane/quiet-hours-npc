import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startApp} from './real-route-runtime.mjs';
import {launchBrowser} from './browser-runtime.mjs';
import {formCharacterCard,confirmOpening} from './opening-journey.mjs';
const out=process.env.BROWSER_ARTIFACT_DIR||'/tmp/quiet-hours-review-browser';await mkdir(out,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'account-review-281-')),databasePath=join(dir,'account.sqlite'),port=5286;
const transportRoles=[];
const responder=request=>{const input=JSON.parse(request.messages[1].content);const role=input.task==='character-card-assessment-v1'?'formation':'generation';transportRoles.push(role);return role==='formation'?{bonuses:[]}:{background:'河畔的受控背景'};};
let app=await startApp({port,databasePath,modelResponder:responder,diceFaces:Array(20).fill(4)}),browser,page;
const evidence={production:false,modelSemanticQuality:false,steps:[]};
try{
 browser=await launchBrowser();const context=await browser.newContext({viewport:{width:1360,height:1100},reducedMotion:'reduce'});await context.addCookies([{name:'qh_local_owner',value:'review-account-281',url:app.url}]);page=await context.newPage();page.setDefaultTimeout(30000);
 await page.route('**/*',route=>new URL(route.request().url()).origin===app.url?route.continue():route.abort());
 const get=path=>page.evaluate(async path=>{const response=await fetch(path);return {status:response.status,body:await response.json()};},path);
 const post=(path,input)=>page.evaluate(async({path,input})=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-World-Time-Policy':'round-v1'},body:JSON.stringify(input)});return {status:response.status,body:await response.json()};},{path,input});
 const check=(value,status=200)=>{assert.equal(value.status,status,JSON.stringify(value.body));return value.body;};
 await page.goto(app.url+'/settings');await page.getByRole('heading',{name:'帳號玩家預算與用量'}).waitFor();
 assert.deepEqual((await get('/api/saves')).body.saves,[]);
 await page.getByLabel('每小時 AI 呼叫上限',{exact:true}).selectOption('custom');await page.getByLabel('自訂呼叫上限',{exact:true}).fill('1');await page.getByRole('button',{name:'套用玩家預算',exact:true}).click();await page.getByText('帳號玩家預算與價格已保存；沒有派送模型。',{exact:true}).waitFor();
 await page.getByText('自訂模型單價（USD／每百萬 tokens）',{exact:true}).click();
 await page.getByLabel('輸入 USD 單價',{exact:true}).fill('1');await page.getByLabel('輸出 USD 單價',{exact:true}).fill('2');await page.getByLabel('價格來源',{exact:true}).fill('受控本機價格');await page.getByRole('button',{name:'保存自訂單價',exact:true}).click();await page.waitForFunction(async()=>{const response=await fetch('/api/player-budget');return (await response.json()).prices.some(value=>value.source==='受控本機價格');});
 assert.equal(app.modelRequests.length,0);evidence.steps.push('empty account configures budget and price on real settings route without a world or dispatch');
 check(await post('/api/model-settings',{version:0,mode:'custom',models:{npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}}}));
 check(await post('/api/world?workspace=account',{operation:'set-model-key',mode:'openai',key:'controlled-only-key'}));
 const blank={name:'',appearance:'',personality:'',abilities:'',background:'',initialMemories:'',beliefs:'',preferences:'',directions:'',startLocation:''};
 const request=(path,input)=>input===undefined?get(path):post(path,input);
 let card=await formCharacterCard(request,{name:'河岸人物'});
 const formationBaseline=check(await get('/api/player-budget'));evidence.formationBaseline={calls:formationBaseline.usage.calls,totalCalls:formationBaseline.usage.totalCalls,windowStartedAt:formationBaseline.usage.windowStartedAt};assert.equal(formationBaseline.usage.totalCalls,1);assert.deepEqual(transportRoles,['formation']);
 // Formation is an actual paid-kind operation. Preserve its account charge and
 // explicitly allow one more dispatch for the original cross-save quota case.
 check(await post('/api/player-budget',{version:formationBaseline.version,operationScope:formationBaseline.accountOwner,limits:{...formationBaseline.limits,calls:formationBaseline.usage.calls+1}}));
 async function create(name){const scene=check(await post('/api/scene-templates',{id:crypto.randomUUID(),version:0,name:name+'家',note:'',rooms:[{id:'main',name:'客廳'}],connections:[],objects:[]}),201).template;return (await confirmOpening(request,{name,city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:name+'住處'}],characters:[{templateId:card.id,version:card.version,placeId:'home',roomId:'main'}]}})).saved;}
 const first=await create('甲世界'),second=await create('乙世界');
 async function act(save,extra){const current=check(await get('/api/world?save='+save));return post('/api/world?save='+save,{operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',operationScope:current.operationScope,worldContext:current.world.contextId,...extra});}
 const generation={operation:'generate-character-template',characterGeneration:{description:'受控概念',fields:blank}};
 check(await act(first.save.id,generation));check(await act(second.save.id,generation),429);assert.equal(app.modelRequests.length,2);assert.deepEqual(transportRoles,['formation','generation']);
 const accountBefore=check(await get('/api/player-budget'));evidence.accountAfterGeneration={calls:accountBefore.usage.calls,totalCalls:accountBefore.usage.totalCalls,windowStartedAt:accountBefore.usage.windowStartedAt};assert.equal(accountBefore.usage.totalCalls,formationBaseline.usage.totalCalls+1);assert.equal(accountBefore.usage.totalUnknownCalls,0);
 evidence.steps.push('second saved world cannot refresh shared quota; one real card formation plus exactly one allowed cross-save generation');
 await page.goto(app.url);const region=()=>page.getByRole('region',{name:'甲世界的存檔管理'}),field=()=>region().getByLabel('甲世界的另存名稱',{exact:true});await field().fill('保留可編輯的分岔名稱');
 let blocked=false;await page.route('**/api/saves',async route=>{if(!blocked&&route.request().method()==='POST'&&JSON.parse(route.request().postData()).operation==='copy'){blocked=true;await route.abort('failed');}else await route.continue();});
 await region().getByRole('button',{name:'另存目前進度',exact:true}).click();await region().getByRole('button',{name:'恢復此存檔操作',exact:true}).waitFor();await page.reload();await region().getByRole('button',{name:'恢復此存檔操作',exact:true}).waitFor();
 check(await act(first.save.id,{operation:'advance',minutes:5,timeContract:'five-minute-v1'}));
 await region().getByRole('button',{name:'恢復此存檔操作',exact:true}).click();await region().getByRole('alert').waitFor();
 assert.equal(await field().inputValue(),'保留可編輯的分岔名稱');assert.equal(await field().isEnabled(),true);await page.screenshot({path:join(out,'copy-conflict-input-retained.png'),fullPage:true});
 await page.reload();assert.equal(await field().inputValue(),'保留可編輯的分岔名稱');await region().getByRole('button',{name:'另存目前進度',exact:true}).click();await page.waitForURL(/\/observe\?save=/);await page.getByRole('heading',{name:'此刻的世界'}).waitFor();
 const copyId=new URL(page.url()).searchParams.get('save');assert.notEqual(copyId,first.save.id);const source=check(await get('/api/world?save='+first.save.id));
 check(await post('/api/saves',{operation:'delete',operationId:crypto.randomUUID(),saveId:first.save.id,expectedVersion:source.version}));
 const copied=check(await get('/api/world?save='+copyId));assert.equal(copied.world.aiUsage.totalCalls,0);assert.equal(copied.accountPlayer.usage.totalCalls,accountBefore.usage.totalCalls);assert.equal(copied.accountPlayer.usage.windowStartedAt,accountBefore.usage.windowStartedAt);
 evidence.steps.push('unaccepted copy survives reload and version conflict with editable name; fresh confirmation copies, source deletion leaves account charge');
 await page.goto(app.url+'/settings');await page.getByText(/帳號本小時：2 次 AI 呼叫/).waitFor();await page.screenshot({path:join(out,'account-authority.png'),fullPage:true});
 await page.close();await app.close();app=await startApp({port,databasePath,modelResponder:responder,diceFaces:Array(20).fill(4)});page=await context.newPage();await page.route('**/*',route=>new URL(route.request().url()).origin===app.url?route.continue():route.abort());await page.goto(app.url+'/settings');await page.getByText(/帳號本小時：2 次 AI 呼叫/).waitFor();
 const persisted=check(await get('/api/player-budget'));assert.equal(persisted.usage.totalCalls,accountBefore.usage.totalCalls);assert.equal(persisted.usage.windowStartedAt,accountBefore.usage.windowStartedAt);assert.equal(persisted.prices[0].source,'受控本機價格');
 check(await act(copyId,generation),429);assert.equal(app.modelRequests.length,0);
 evidence.steps.push('SQLite close/reopen preserves original hour, settings, price and spent call; copied world cannot dispatch');
 // Historical fault only: the old receipt and its migration-origin marker
 // have no recoverable model trace. Never replace the product-created world,
 // reset account initialization, erase the real formation charge or change its hour.
 await context.addCookies([{name:'qh_local_owner',value:'review-unknown-281',url:app.url}]);await page.goto(app.url+'/character-templates');
 check(await post('/api/model-settings',{version:0,mode:'custom',models:{npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}}}));
 check(await post('/api/world?workspace=account',{operation:'set-model-key',mode:'openai',key:'controlled-only-historical-key'}));
 card=await formCharacterCard(request,{name:'歷史來源人物'});
 const legacy=await create('歷史未知來源');const sqlite=new DatabaseSync(databasePath);
 const storage=sqlite.prepare('SELECT storage_owner FROM world_saves WHERE owner=? AND id=?').get('review-unknown-281',legacy.save.id).storage_owner;
 const historicalId=Date.now()+':'+crypto.randomUUID();
 sqlite.exec('BEGIN IMMEDIATE');
 try{sqlite.prepare('UPDATE worlds SET operations=? WHERE owner=?').run(JSON.stringify({floor:0,results:{[historicalId]:{status:502,body:{operationUncertain:true}}}}),storage);sqlite.prepare('INSERT INTO player_usage_origins(owner,storage_owner,recovery,unknown_range) VALUES(?,?,?,0)').run('review-unknown-281',storage,JSON.stringify({[historicalId]:null}));sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}sqlite.close();
 assert.equal(check(await get('/api/player-budget')).unknownAccountingRanges,1);
 check(await post('/api/saves',{operation:'delete',operationId:crypto.randomUUID(),saveId:legacy.save.id,expectedVersion:0}));
 const independent=await create('未知帳務後的其他世界');const unknown=check(await get('/api/world?save='+independent.save.id));assert.equal(unknown.accountPlayer.unknownAccountingRanges,1);assert.equal(unknown.unresolvedUsageRecovery,false);
 await page.goto(app.url+'/observe?save='+independent.save.id);await page.getByRole('heading',{name:'此刻的世界'}).waitFor();
 const compact=page.locator('.compact-cost');await compact.waitFor();assert.match(await compact.innerText(),/未確認範圍/);assert.doesNotMatch(await compact.innerText(),/估算 USD 0/);
 await page.getByRole('button',{name:'費用與停止詳情',exact:true}).click();const panel=page.getByRole('region',{name:'已發生費用估算'});await panel.waitFor();assert.match(await panel.innerText(),/未確認範圍/);assert.doesNotMatch(await panel.innerText(),/玩家累計已發生：估算 USD 0/);
 await page.screenshot({path:join(out,'account-unknown-both-summaries.png'),fullPage:true});evidence.steps.push('deleted historical uncertain source remains unknown in both compact summary and account cost panel of another real saved world');evidence.commit=app.commit;evidence.origin=app.url;evidence.status='passed';evidence.controlledCalls=transportRoles.length;evidence.transportRoles=transportRoles;evidence.formationCalls=transportRoles.filter(role=>role==='formation').length;evidence.generationCalls=transportRoles.filter(role=>role==='generation').length;assert.deepEqual(transportRoles,['formation','generation','formation']);evidence.paidCalls=0;
 await writeFile(join(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
} catch(error){if(page){await page.screenshot({path:join(out,'failure.png'),fullPage:true});await writeFile(join(out,'failure.txt'),String(error)+'\n'+await page.locator('body').innerText());}throw error;} finally{await browser?.close();await app.close();await rm(dir,{recursive:true,force:true});}
