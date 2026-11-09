import { formCharacterCard, confirmOpening } from '../tooling/verification/opening-journey.mjs';
import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
async function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const name of (await readdir('drizzle')).filter(n => n.endsWith('.sql')).sort()) db.exec(await readFile('drizzle/' + name, 'utf8'));
  const context = { owner: 'a', fault: null, formationCalls:0, formationDraws:0 };
  context.env = { APP_ENV: 'local', AUTH_ORIGIN: 'https://test.invalid', MODEL_KEY_ENCRYPTION_SECRET: 'ab'.repeat(32), DB: { prepare(sql) { return { bind(...values) { return {
    async first() { const fault = sql.includes('RETURNING') && context.fault; if (fault) context.fault = null; if (fault === 'before') throw Error('before'); const r = db.prepare(sql).get(...values) ?? null; if (fault === 'after') throw Error('after'); return r; },
    async all() { return { results: db.prepare(sql).all(...values) }; }, run() { context.storageHook?.(sql,'before');const result={meta:{changes:Number(db.prepare(sql).run(...values).changes)}};context.storageHook?.(sql,'after');return result; },
  }; } }; } } };
  context.env.DB.batch=async statements=>{db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(statement.run());db.exec('COMMIT');if(context.lostBatchReply){context.lostBatchReply=false;throw Error('controlled lost batch reply');}return result;}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}};
  const built = await esbuild.build({ entryPoints: ['app/api/model-settings/route.ts', 'app/api/world/route.ts', 'app/api/character-templates/route.ts', 'app/api/scene-templates/route.ts', 'app/api/saves/route.ts','app/api/player-budget/route.ts','app/api/opening-drafts/route.ts','app/api/character-drafts/route.ts','app/api/character-drafts/form/route.ts','app/api/character-cards/route.ts','lib/world.ts'], outdir:'/tmp/character-drafts-test', bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': process.cwd() }, plugins: [{ name: 'boundaries', setup(b) {
    b.onResolve({ filter: /^(cloudflare:workers|@\/lib\/auth)$/ }, a => ({ path: a.path, namespace: 'boundary' }));
    b.onLoad({ filter: /.*/, namespace: 'boundary' }, a => ({ contents: a.path === 'cloudflare:workers' ? 'export const env = context.env;' : 'export const getGitHubUser = async () => context.owner ? {userId:context.owner} : null;' }));
  } }] });
  const entries = built.outputFiles.map(file => { const compiled={exports:{}}; new Function('module','exports','require','context',file.text)(compiled,compiled.exports,require,context); return compiled.exports; });
  const [api,world,people,scenes,saves,budget,openings,drafts,form,cards,worldModule] = entries;
  async function post(route,payload,path) {const r=await route.POST(new Request('https://test.invalid'+path,{method:'POST',headers:{Origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(payload)}));return {status:r.status,body:await r.json()};}
  const request=async(body,save)=>{const url='https://test.invalid/api/model-settings'+(save?'?save='+save:'');const response=body===undefined?await api.GET(new Request(url)):await api.POST(new Request(url,{method:'POST',headers:{Origin:'https://test.invalid'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
  const worldRequest=async(payload,save)=>{const suffix=save?'?save='+save:'?workspace=account';const r=await world.GET(new Request('https://test.invalid/api/world'+suffix));const scope=await r.json();return payload===undefined?{status:r.status,body:scope}:post(world,{operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',operationScope:scope.operationScope,worldContext:scope.world.contextId,...payload},'/api/world'+suffix);};
  const routes={'/api/world':world,'/api/opening-drafts':openings,'/api/character-drafts':drafts,'/api/character-drafts/form':form,'/api/character-cards':cards,'/api/saves':saves};
  const productRequest=async(path,payload)=>{const route=routes[path.split('?')[0]];if(payload!==undefined)return post(route,payload,path);const response=await route.GET(new Request('https://test.invalid'+path));return {status:response.status,body:await response.json()};};
  const formedCards=new Map();
  async function createWorld(name) {
    let card=formedCards.get(context.owner);
    if(!card){
      const scope=await worldRequest();assert.equal(scope.status,200,JSON.stringify(scope.body));
      if(!scope.body.modelKeys.openai.configured)assert.equal((await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-authoring-key'})).status,200);
      if(!scope.body.modelSettings.effective.adjudication)assert.equal((await worldRequest({operation:'set-adjudication',adjudication:{provider:'openai',model:'gpt-6.1-sol'}})).status,200);
      const previousFetch=globalThis.fetch,previousRandom=Math.random;
      globalThis.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages.at(-1).content);assert.equal(input.task,'character-card-assessment-v1');context.formationCalls++;return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:'{"bonuses":[]}'}}]});};
      Math.random=()=>{context.formationDraws++;return .5;};
      try{card=await formCharacterCard(productRequest,{name:name+'的人'});}finally{globalThis.fetch=previousFetch;Math.random=previousRandom;}
      assert.equal(context.formationDraws,20);formedCards.set(context.owner,card);
    }
    const scene=await post(scenes,{id:crypto.randomUUID(),version:0,name:name+'的家',note:'',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]},'/api/scene-templates');assert.equal(scene.status,201);
    const {saved}=await confirmOpening(productRequest,{name,city:{places:[{id:'home',templateId:scene.body.template.id,version:scene.body.template.version,name:name+'的家'}],characters:[{templateId:card.id,version:card.version,placeId:'home',roomId:'front'}]}});return saved.save.id;
  }
  // Explicit pre-existing history only. Never used as evidence of successful new creation.
  const createLegacyWorld=name=>{const id=crypto.randomUUID(),storage='historical:'+context.owner+':'+id;db.prepare('INSERT INTO worlds(owner,state,version,locked_until) VALUES(?,?,0,0)').run(storage,JSON.stringify(worldModule.seedWorld()));db.prepare('INSERT INTO world_saves(owner,id,storage_owner,name,created_at,creation_request,original_opening) VALUES(?,?,?,?,?,NULL,NULL)').run(context.owner,id,storage,name,Date.now());return id;};

  const budgetRequest=async input=>{const response=input===undefined?await budget.GET():await budget.POST(new Request('https://test.invalid/api/player-budget',{method:'POST',headers:{Origin:'https://test.invalid'},body:JSON.stringify({operationScope:context.owner,...input})}));return {status:response.status,body:await response.json()};};
  const saveRequest=input=>input===undefined?saves.GET().then(async response=>({status:response.status,body:await response.json()})):post(saves,input,'/api/saves');
  return { db, context, request, worldRequest, createWorld, createLegacyWorld, budgetRequest, saveRequest };
}

const models = {npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}};
test('account model defaults persist through the product API with conflict and lost response recovery, without dispatching', async()=>{
 const {db,context,request,worldRequest}=await fixture(); let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('unexpected model');};
 try {
   const empty=await request();assert.equal(empty.status,200);assert.equal(empty.body.source,'missing');assert.equal(empty.body.version,0);
   context.fault='before';assert.equal((await request({version:0,mode:'custom',models})).status,503);
   assert.equal((await request()).body.version,0);
   context.fault='after';assert.equal((await request({version:0,mode:'custom',models})).status,503);
   const saved=await request({version:0,mode:'custom',models});assert.equal(saved.status,200);assert.equal(saved.body.version,1);assert.deepEqual(saved.body.effective,models);assert.equal(saved.body.source,'account');
   assert.equal((await request({version:0,mode:'custom',models:{...models,npc:{...models.npc,model:'gpt-6.1-sol'}}})).status,409);
   const ledger=await worldRequest();assert.equal(ledger.body.world.turn,0);assert.equal(ledger.body.world.characters.length,0);
   assert.equal(calls,0);
   await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'});
   const expires=(await request()).body.modelKeys.openai.expiresAt;
   assert.equal((await request()).body.modelKeys.openai.expiresAt,expires);
   assert.equal((await request({version:1,mode:'custom',models})).body.modelKeys.openai.expiresAt,expires);
   context.owner='b';assert.equal((await request()).body.source,'missing');
   context.owner=null;assert.equal((await request()).status,401);
 } finally {globalThis.fetch=oldFetch;db.close();}
});

test('new operations resolve fresh defaults on the server, capture both roles once, and custom saves and exact-ID recovery stay independent', async()=>{
 const {db,context,request,worldRequest,createWorld}=await fixture();const oldFetch=globalThis.fetch;const calls=[];
 const {fixtureDecision}=require('./pursuit-fixture.cjs');
 const defaultsB={npc:{provider:'openai',model:'gpt-6.1-sol'},adjudication:{provider:'openai',model:'heaven-B'}};
 const defaultsC={npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'heaven-C'}};
 let changed=false;
 globalThis.fetch=async(_url,init)=>{const payload=JSON.parse(init.body),input=JSON.parse(payload.messages[1].content);calls.push({model:payload.model,contract:input.contractVersion});
   if(input.contractVersion==='npc-decision.v3'&&!changed){changed=true;const update=await request({version:2,mode:'custom',models:defaultsC});assert.equal(update.status,200);}
   const content=input.contractVersion==='npc-decision.v3'?fixtureDecision(input,{type:'propose',target:'place:home',content:'輕聲哼唱',purpose:'聽自己聲音',durationMinutes:15}):{status:'denied',effects:[],check:null};
   return Response.json({usage:{prompt_tokens:3,completion_tokens:2},choices:[{message:{content:JSON.stringify(content)}}]});
 };
 try {
   const a=await createWorld('甲'),b=await createWorld('乙');
   await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'});
   assert.equal((await request({version:0,mode:'custom',models})).status,200);
   const stale=await worldRequest(undefined,a);assert.equal(stale.body.modelSettings.source,'account');
   assert.equal((await request({version:1,mode:'custom',models:defaultsB})).status,200);
   const operation={operation:'advance',operationId:Date.now()+':'+crypto.randomUUID(),mode:'openai',model:'gpt-6-luna',minutes:5,timeContract:'five-minute-v1',worldContext:stale.body.world.contextId,operationScope:stale.body.operationScope};
   const first=await worldRequest(operation,a);assert.equal(first.status,200,JSON.stringify(first.body));
   assert.deepEqual(calls.map(c=>c.model),['gpt-6.1-sol','heaven-B']);
   assert.equal((await worldRequest(operation,a)).status,200);assert.equal(calls.length,2);
   const after=await worldRequest(undefined,a);assert.equal(after.body.world.turn,1);assert.equal(after.body.modelSettings.source,'account');assert.equal(after.body.modelSettings.effective.adjudication.model,'heaven-C');
   assert.equal((await request({version:0,mode:'custom',models},b)).status,200);
   assert.equal((await request(undefined,b)).body.source,'save');
   const custom=await worldRequest({...operation,operationId:Date.now()+':'+crypto.randomUUID(),worldContext:undefined,operationScope:undefined},b);
   assert.equal(custom.status,409); // A stale source binding cannot select another world.
   const valid=await worldRequest({operation:'advance',mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'},b);
   assert.equal(valid.status,200,JSON.stringify(valid.body));assert.deepEqual(calls.slice(2).map(c=>c.model),['gpt-6-luna','gpt-6.1-sol']);
   context.owner='foreign';assert.equal((await request(undefined,a)).status,404);
 } finally {globalThis.fetch=oldFetch;db.close();}
});

test('existing explicit world adjudication remains legacy until the save explicitly chooses account inheritance', async()=>{
 const {context,db,request,worldRequest,createWorld}=await fixture();const oldFetch=globalThis.fetch;const calls=[];
 globalThis.fetch=async(_url,init)=>{const p=JSON.parse(init.body);calls.push(p.model);return Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:'{"background":"受控背景"}'}}]});};
 try {
   const id=await createWorld('已有設定');
   await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'});
   assert.equal((await worldRequest({operation:'set-adjudication',adjudication:{provider:'openai',model:'legacy-heaven-A'}},id)).status,200);
   assert.equal((await request({version:0,mode:'custom',models})).status,200);
   const legacy=await request(undefined,id);assert.equal(legacy.body.source,'legacy');assert.deepEqual(legacy.body.effective,{adjudication:{provider:'openai',model:'legacy-heaven-A'}});
   assert.equal((await worldRequest(undefined,id)).body.world.adjudication.model,'legacy-heaven-A');
   const fields={name:'甲',appearance:'',personality:'',abilities:'',background:'',initialMemories:'',beliefs:'',preferences:'',directions:'',startLocation:''};
   const old=await worldRequest({operation:'generate-character-template',characterGeneration:{description:'甲',fields}},id);assert.equal(old.status,200);assert.equal(calls[0],'legacy-heaven-A');
   assert.equal((await request({version:0,mode:'inherit'},id)).status,200);
   assert.equal((await request(undefined,id)).body.source,'account');
   assert.equal((await worldRequest({operation:'generate-character-template',characterGeneration:{description:'甲',fields}},id)).status,200);
   assert.equal(calls[1],'gpt-6.1-sol');
   assert.equal((await request(undefined,id)).body.source,'account');
 } finally {globalThis.fetch=oldFetch;db.close();}
});

test('explicit inheritance with no account defaults projects missing settings without rewriting the stored legacy result', async()=>{
 const {context,db,request,worldRequest,createWorld}=await fixture();
 try {
   const id=await createWorld('待補設定');
   const set=await worldRequest({operation:'set-adjudication',adjudication:{provider:'openai',model:'legacy-A'}},id);assert.equal(set.status,200);
   const before=await worldRequest(undefined,id);assert.equal(before.body.modelSettings.source,'legacy');
   assert.equal((await request({version:0,mode:'inherit'},id)).status,200);
   const missing=await worldRequest(undefined,id);assert.equal(missing.body.modelSettings.source,'missing');assert.deepEqual(missing.body.modelSettings.effective,{});assert.equal(missing.body.world.adjudication,undefined);assert.equal(missing.body.version,before.body.version);
   const again=await worldRequest(undefined,id);assert.equal(again.body.version,before.body.version);assert.equal(again.body.world.turn,0);
 } finally {db.close();}
});

test('cleared or expired account keys return the original settings flag before any AI dispatch and keep the selected story', async()=>{
 for(const failure of ['clear','expire']) {
   const {context,db,request,worldRequest,createWorld}=await fixture();const oldFetch=globalThis.fetch,oldNow=Date.now;let calls=0;
   globalThis.fetch=async()=>{calls++;throw Error('a missing key must never dispatch');};
   try {
     const id=await createWorld('保留來源世界');
     await request({version:0,mode:'custom',models});
     await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'});
     const initial=await worldRequest(undefined,id);assert.equal(initial.body.modelKeys.openai.configured,true);
     if(failure==='clear')await worldRequest({operation:'clear-model-key',mode:'openai'});
     else Date.now=()=>initial.body.modelKeys.openai.expiresAt+1;
     const response=await worldRequest({operation:'advance',operationId:Date.now()+':'+crypto.randomUUID(),mode:'openai',model:'gpt-6-luna',minutes:5,timeContract:'five-minute-v1',operationScope:initial.body.operationScope,worldContext:initial.body.world.contextId},id);
     assert.equal(response.status,400);assert.equal(response.body.modelSettingsRequired,true);assert.equal(calls,0);
     const after=await worldRequest(undefined,id);assert.equal(after.body.world.turn,initial.body.world.turn);assert.equal(after.body.world.minute,initial.body.world.minute);assert.equal(after.body.version,initial.body.version);assert.equal(after.body.modelKeys.openai.configured,false);
   } finally {Date.now=oldNow;globalThis.fetch=oldFetch;db.close();}
 }
});

test('player budget and spent calls are shared by two saved worlds rather than reset by selecting another',async()=>{
 const {context,db,request,worldRequest,createWorld}=await fixture(),oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:3,completion_tokens:2},choices:[{message:{content:'{"background":"受控背景"}'}}]});};
 try{
   const first=await createWorld('第一世界'),second=await createWorld('第二世界');
   await request({version:0,mode:'custom',models});
   await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-account-budget-key'});
   assert.equal((await worldRequest({operation:'set-budget',limits:{calls:2,tokens:30000}},first)).status,200);
   const fields={name:'',appearance:'',personality:'',abilities:'',background:'',initialMemories:'',beliefs:'',preferences:'',directions:'',startLocation:''};
   const generation={operation:'generate-character-template',characterGeneration:{description:'修鐘人',fields}};
   assert.equal((await worldRequest(generation,first)).status,200);
   const next=await worldRequest(generation,second);
   assert.equal(next.status,429,JSON.stringify(next.body));
   assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;db.close();}
});

test('account settings work before a first world, retain explicit policy and price, recover lost saves, and make no model calls',async()=>{
 const {db,context,budgetRequest,saveRequest,createWorld,worldRequest}=await fixture();const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not dispatch');};
 try{
   const initial=await budgetRequest();assert.equal(initial.status,200);assert.deepEqual(initial.body.limits,{calls:12,tokens:30000});
   assert.deepEqual((await saveRequest()).body.saves,[]);
   context.storageHook=(sql,phase)=>{if(sql.startsWith('UPDATE player_accounts SET budget=')&&phase==='before'){context.storageHook=null;throw Error('before policy commit');}};
   assert.equal((await budgetRequest({version:0,limits:{calls:24,tokens:null}})).status,503);
   assert.deepEqual((await budgetRequest()).body.limits,{calls:12,tokens:30000});
   context.storageHook=(sql,phase)=>{if(sql.startsWith('UPDATE player_accounts SET budget=')&&phase==='after'){context.storageHook=null;throw Error('lost policy reply');}};
   const input={version:0,limits:{calls:24,tokens:null}};
   assert.equal((await budgetRequest(input)).status,503);assert.equal((await budgetRequest(input)).status,200);
   const saved=(await budgetRequest()).body;assert.equal(saved.version,1);assert.deepEqual(saved.limits,input.limits);
   assert.equal((await budgetRequest({version:0,limits:{calls:1,tokens:1}})).status,409);
   const price={provider:'openai',model:'gpt-6.1-sol',input:1,output:2,source:'受控價格',date:'2026-11-09'};
   assert.equal((await budgetRequest({version:1,price})).status,200);
   const world=await createWorld('新檔不刷新設定');const selected=(await worldRequest(undefined,world)).body;
   assert.deepEqual(selected.accountPlayer.limits,input.limits);assert.equal(selected.accountPlayer.prices[0].input,1);
   assert.equal(calls,0);assert.equal(context.formationCalls,1);assert.equal(selected.accountPlayer.usage.totalCalls,1);
   context.owner='b';assert.deepEqual((await budgetRequest()).body.limits,{calls:12,tokens:30000});assert.equal((await budgetRequest({version:0,operationScope:'a',limits:{calls:1,tokens:1}})).status,409);assert.deepEqual((await budgetRequest()).body.limits,{calls:12,tokens:30000});
   context.owner=null;assert.equal((await budgetRequest()).status,401);
 }finally{globalThis.fetch=oldFetch;db.close();}
});

const generationFields={name:'',appearance:'',personality:'',abilities:'',background:'',initialMemories:'',beliefs:'',preferences:'',directions:'',startLocation:''};
const generationOperation={operation:'generate-character-template',characterGeneration:{description:'修鐘人',fields:generationFields}};
test('copy, source deletion, new worlds and original-ID replay preserve the same account bill and original hour',async()=>{
 const {context,db,request,worldRequest,createWorld,budgetRequest,saveRequest}=await fixture(),oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:3,completion_tokens:2},choices:[{message:{content:'{"background":"受控背景"}'}}]});};
 try{
   await request({version:0,mode:'custom',models});await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-bill'});
   await budgetRequest({version:0,limits:{calls:3,tokens:30000}});
   const source=await createWorld('來源帳單');const operation={...generationOperation,operationId:Date.now()+':'+crypto.randomUUID()};
   assert.equal((await worldRequest(operation,source)).status,200);
   assert.equal((await worldRequest(operation,source)).status,200);assert.equal(calls,1);
   const before=(await budgetRequest()).body,current=(await worldRequest(undefined,source)).body;
   const copied=await saveRequest({operationScope:'a',operation:'copy',operationId:crypto.randomUUID(),saveId:source,expectedVersion:current.version,name:'帳單不複製'});assert.equal(copied.status,201);
   const copyRead=(await worldRequest(undefined,copied.body.save.id)).body;
   assert.equal(copyRead.world.aiUsage.totalCalls,0);assert.equal(copyRead.accountPlayer.usage.totalCalls,1+context.formationCalls);
   assert.equal((await saveRequest({operationScope:'a',operation:'delete',operationId:crypto.randomUUID(),saveId:source,expectedVersion:current.version})).status,200);
   const second=await createWorld('刪除後的新檔');assert.equal((await worldRequest(generationOperation,second)).status,200);
   const denied=await worldRequest(generationOperation,copied.body.save.id);assert.equal(denied.status,429);assert.equal(calls,2);
   const after=(await budgetRequest()).body;assert.equal(after.usage.windowStartedAt,before.usage.windowStartedAt);assert.equal(after.usage.totalCalls,2+context.formationCalls);assert.equal(after.usage.totalInputTokens,6+context.formationCalls*2);assert.equal(after.usage.totalUnknownCalls,0);
   assert.equal((await saveRequest()).body.accountUsage.totalCalls,2+context.formationCalls);
 }finally{globalThis.fetch=oldFetch;db.close();}
});

test('parallel worlds reserve one shared call before dispatch and a retained result never dispatches or charges again',async()=>{
 const {context,db,request,worldRequest,createWorld,budgetRequest}=await fixture(),oldFetch=globalThis.fetch;let calls=0,release,entered;
 const started=new Promise(resolve=>{entered=resolve;});const gate=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async()=>{calls++;entered();await gate;return Response.json({usage:{prompt_tokens:3,completion_tokens:2},choices:[{message:{content:'{"background":"受控背景"}'}}]});};
 try{
   await request({version:0,mode:'custom',models});await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-parallel'});
   await budgetRequest({version:0,limits:{calls:2,tokens:30000}});
   const first=await createWorld('並行甲'),second=await createWorld('並行乙');
   const operation={...generationOperation,operationId:Date.now()+':'+crypto.randomUUID()};
   const pending=worldRequest(operation,first);await started;
   const during=(await budgetRequest()).body;assert.equal(during.usage.calls,1+context.formationCalls);assert.equal(during.usage.totalUnknownCalls,1);
   assert.equal((await worldRequest(generationOperation,second)).status,429);assert.equal(calls,1);
   release();assert.equal((await pending).status,200);
   assert.equal((await worldRequest(operation,first)).status,200);assert.equal(calls,1);
   const saved=(await budgetRequest()).body;assert.equal(saved.usage.calls,1+context.formationCalls);assert.equal(saved.usage.totalInputTokens,3+context.formationCalls*2);assert.equal(saved.usage.totalOutputTokens,2+context.formationCalls*2);assert.equal(saved.usage.totalUnknownCalls,0);
 }finally{release?.();globalThis.fetch=oldFetch;db.close();}
});

test('pre-dispatch account reservation failures do not spend; source commit reply loss replays one known account charge',async()=>{
 const {db,context,request,worldRequest,createWorld,budgetRequest}=await fixture(),oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:3,completion_tokens:2},choices:[{message:{content:'{"background":"受控背景"}'}}]});};
 try{
   await request({version:0,mode:'custom',models});await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-failures'});
   const first=await createWorld('故障原檔');
   context.storageHook=(sql,phase)=>{if(sql.startsWith('INSERT OR IGNORE INTO player_dispatches')&&phase==='before'){context.storageHook=null;throw Error('before reservation commit');}};
   assert.equal((await worldRequest(generationOperation,first)).status,502);assert.equal(calls,0);assert.equal((await budgetRequest()).body.usage.totalCalls,0+context.formationCalls);
   context.storageHook=(sql,phase)=>{if(sql.startsWith('INSERT OR IGNORE INTO player_dispatches')&&phase==='after'){context.storageHook=null;context.lostBatchReply=true;}};
   assert.equal((await worldRequest(generationOperation,first)).status,502);assert.equal(calls,0);assert.equal((await budgetRequest()).body.usage.totalCalls,0+context.formationCalls);
   context.storageHook=(sql,phase)=>{if(sql.startsWith('UPDATE worlds SET state = ?')&&phase==='after'){context.storageHook=null;throw Error('lost story commit reply');}};
   const original={...generationOperation,operationId:Date.now()+':'+crypto.randomUUID()};
   assert.equal((await worldRequest(original,first)).status,200);assert.equal((await worldRequest(original,first)).status,200);assert.equal(calls,1);
   const account=(await budgetRequest()).body;assert.equal(account.usage.totalCalls,1+context.formationCalls);assert.equal(account.usage.totalInputTokens,3+context.formationCalls*2);assert.equal(account.usage.totalUnknownCalls,0);
 }finally{globalThis.fetch=oldFetch;db.close();}
});

test('legacy paid totals and original rolling hour are adopted once with existing account budget and model prices',async()=>{
 const {context,db,worldRequest,createWorld,createLegacyWorld,budgetRequest}=await fixture();const oldNow=Date.now;
 try{
   const source=createLegacyWorld('既有生活');
   const row=db.prepare('SELECT storage_owner FROM world_saves WHERE owner=? AND id=?').get('a',source);
   const stored=JSON.parse(db.prepare('SELECT state FROM worlds WHERE owner=?').get(row.storage_owner).state);
   const initial=Date.now()-20*60000;
   stored.playerBudget={calls:17,tokens:60000};stored.modelPrices=[{id:'original-price',provider:'openai',model:'gpt-6.1-sol',input:1,output:2,source:'既有單價',date:'2026-11-09',custom:true,savedAt:initial}];
   stored.aiUsage={windowStartedAt:initial,calls:3,inputTokens:30,outputTokens:20,unknownCalls:1,totalCalls:50,totalInputTokens:300,totalOutputTokens:200,totalUnknownCalls:4,savedDecisions:7};
   db.prepare('UPDATE worlds SET state=? WHERE owner=?').run(JSON.stringify(stored),row.storage_owner);
   const first=(await budgetRequest()).body;assert.equal(first.usage.windowStartedAt,initial);assert.equal(first.usage.calls,3+context.formationCalls);assert.equal(first.usage.totalCalls,50+context.formationCalls);assert.deepEqual(first.limits,{calls:17,tokens:60000});assert.equal(first.prices[0].id,'original-price');
   const second=await createWorld('後來的新檔');const selected=(await worldRequest(undefined,second)).body;
   assert.equal(selected.accountPlayer.usage.windowStartedAt,initial);assert.equal(selected.accountPlayer.usage.totalCalls,50+context.formationCalls);
   Date.now=()=>initial+3600001;
   const expired=(await budgetRequest()).body;assert.equal(expired.usage.calls,0);assert.equal(expired.usage.totalCalls,50+context.formationCalls);assert.equal(expired.usage.windowStartedAt,initial+3600001);
 }finally{Date.now=oldNow;db.close();}
});

test('known and unknown paid failures remain account facts after source deletion and do not double on original-ID recovery',async()=>{
 const {context,db,request,worldRequest,createWorld,budgetRequest,saveRequest}=await fixture(),oldFetch=globalThis.fetch;let calls=0,known=false;
 globalThis.fetch=async()=>{calls++;if(!known)throw Error('controlled unknown provider outcome');return Response.json({usage:{prompt_tokens:3,completion_tokens:2},choices:[{message:{content:'not valid JSON'}}]});};
 try{
   await request({version:0,mode:'custom',models});await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-unknown'});
   const source=await createWorld('失敗費用仍保留');let operation={...generationOperation,operationId:Date.now()+':'+crypto.randomUUID()};
   assert.equal((await worldRequest(operation,source)).status,502);assert.equal((await worldRequest(operation,source)).status,502);assert.equal(calls,1);
   known=true;operation={...generationOperation,operationId:Date.now()+':'+crypto.randomUUID()};
   assert.equal((await worldRequest(operation,source)).status,502);assert.equal((await worldRequest(operation,source)).status,502);assert.equal(calls,2);
   const before=(await budgetRequest()).body;assert.equal(before.usage.totalCalls,2+context.formationCalls);assert.equal(before.usage.totalUnknownCalls,1);assert.equal(before.usage.totalInputTokens,3+context.formationCalls*2);
   const current=(await worldRequest(undefined,source)).body;
   assert.equal((await saveRequest({operationScope:'a',operation:'delete',operationId:crypto.randomUUID(),saveId:source,expectedVersion:current.version})).status,200);
   const after=(await budgetRequest()).body;assert.equal(after.usage.totalCalls,2+context.formationCalls);assert.equal(after.usage.totalUnknownCalls,1);assert.equal(after.usage.windowStartedAt,before.usage.windowStartedAt);
   assert.equal((await saveRequest()).body.accountUsage.totalCalls,2+context.formationCalls);
 }finally{globalThis.fetch=oldFetch;db.close();}
});

test('legacy uncertain operations without recoverable evidence retain an account unknown range after source deletion',async()=>{
 const {context,db,createLegacyWorld,budgetRequest,saveRequest}=await fixture();
 try{
   const source=createLegacyWorld('舊的未知帳單'),storage=db.prepare('SELECT storage_owner FROM world_saves WHERE owner=? AND id=?').get('a',source).storage_owner;
   const operationId=Date.now()+':'+crypto.randomUUID();
   db.prepare('UPDATE worlds SET operations=? WHERE owner=?').run(JSON.stringify({floor:0,results:{[operationId]:{status:502,body:{operationUncertain:true}}}}),storage);
   assert.equal((await budgetRequest()).body.unknownAccountingRanges,1);
   assert.equal((await saveRequest({operationScope:'a',operation:'delete',operationId:crypto.randomUUID(),saveId:source,expectedVersion:0})).status,200);
   assert.equal((await budgetRequest()).body.unknownAccountingRanges,1);
   assert.equal((await saveRequest()).body.accountUsage.unknownAccountingRanges,1);
 }finally{db.close();}
});

test('a known response survives an unavailable account settlement and recovers once before deleting its source',async()=>{
 const {db,context,request,worldRequest,createWorld,budgetRequest,saveRequest}=await fixture(),oldFetch=globalThis.fetch;let calls=0,writes=0;
 globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:3,completion_tokens:2},choices:[{message:{content:'{"background":"受控背景"}'}}]});};
 try{
   await request({version:0,mode:'custom',models});await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-known-recovery'});
   const source=await createWorld('已知回覆待核對');
   context.storageHook=(sql,phase)=>{if(sql.startsWith('UPDATE player_accounts SET usage=')&&phase==='before'&&++writes===2){context.storageHook=null;throw Error('known account settlement unavailable');}};
   const original={...generationOperation,operationId:Date.now()+':'+crypto.randomUUID()};
   assert.equal((await worldRequest(original,source)).status,502);assert.equal(calls,1);
   const current=(await worldRequest(undefined,source)).body;
   assert.equal((await saveRequest({operationScope:'a',operation:'delete',operationId:crypto.randomUUID(),saveId:source,expectedVersion:current.version})).status,200);
   const account=(await budgetRequest()).body;
   assert.equal(account.usage.totalCalls,1+context.formationCalls);assert.equal(account.usage.totalInputTokens,3+context.formationCalls*2);assert.equal(account.usage.totalOutputTokens,2+context.formationCalls*2);assert.equal(account.usage.totalUnknownCalls,0);
   assert.equal((await budgetRequest()).body.usage.totalInputTokens,3+context.formationCalls*2);assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;db.close();}
});

test('a parallel NPC request rejected before provider dispatch creates no fake paid use in either account or world diagnostics',async()=>{
 const {context,db,request,worldRequest,createWorld,budgetRequest}=await fixture(),oldFetch=globalThis.fetch;let calls=0,release,entered;
 const {fixtureDecision}=require('./pursuit-fixture.cjs');const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async(_url,init)=>{calls++;entered();await gate;return Response.json({usage:{prompt_tokens:3,completion_tokens:2},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{type:'rest',target:'',content:''}))}}]});};
 try{
   await request({version:0,mode:'custom',models});await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-no-phantom'});
   await budgetRequest({version:0,limits:{calls:3,tokens:30000}});
   const first=await createWorld('派送中甲'),second=await createWorld('派送中乙');
   const advance={operation:'advance',mode:'openai',minutes:5,timeContract:'five-minute-v1'};
   const pending=worldRequest(advance,first);await started;
   const rejected=await worldRequest(advance,second);assert.equal(rejected.status,502);assert.equal(rejected.body.world.turn,0);assert.equal(rejected.body.world.aiUsage.totalCalls,0);assert.equal(calls,1);
   release();assert.equal((await pending).status,200);assert.equal((await budgetRequest()).body.usage.totalCalls,1+context.formationCalls);
 }finally{release?.();globalThis.fetch=oldFetch;db.close();}
});
