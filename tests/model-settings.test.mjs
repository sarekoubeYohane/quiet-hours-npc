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
  const context = { owner: 'a', fault: null };
  context.env = { APP_ENV: 'local', AUTH_ORIGIN: 'https://test.invalid', MODEL_KEY_ENCRYPTION_SECRET: 'ab'.repeat(32), DB: { prepare(sql) { return { bind(...values) { return {
    async first() { const fault = sql.includes('RETURNING') && context.fault; if (fault) context.fault = null; if (fault === 'before') throw Error('before'); const r = db.prepare(sql).get(...values) ?? null; if (fault === 'after') throw Error('after'); return r; },
    async all() { return { results: db.prepare(sql).all(...values) }; }, async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
  }; } }; } } };
  context.env.DB.batch=async statements=>{db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const built = await esbuild.build({ entryPoints: ['app/api/model-settings/route.ts', 'app/api/world/route.ts', 'app/api/character-templates/route.ts', 'app/api/scene-templates/route.ts', 'app/api/saves/route.ts'], outdir:'/tmp/character-drafts-test', bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': process.cwd() }, plugins: [{ name: 'boundaries', setup(b) {
    b.onResolve({ filter: /^(cloudflare:workers|@\/lib\/auth)$/ }, a => ({ path: a.path, namespace: 'boundary' }));
    b.onLoad({ filter: /.*/, namespace: 'boundary' }, a => ({ contents: a.path === 'cloudflare:workers' ? 'export const env = context.env;' : 'export const getGitHubUser = async () => context.owner ? {userId:context.owner} : null;' }));
  } }] });
  const entries = built.outputFiles.map(file => { const compiled={exports:{}}; new Function('module','exports','require','context',file.text)(compiled,compiled.exports,require,context); return compiled.exports; });
  const [api,world,people,scenes,saves] = entries;
  async function post(route,payload,path) {const r=await route.POST(new Request('https://test.invalid'+path,{method:'POST',headers:{Origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(payload)}));return {status:r.status,body:await r.json()};}
  const request=async(body,save)=>{const url='https://test.invalid/api/model-settings'+(save?'?save='+save:'');const response=body===undefined?await api.GET(new Request(url)):await api.POST(new Request(url,{method:'POST',headers:{Origin:'https://test.invalid'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
  const worldRequest=async(payload,save)=>{const suffix=save?'?save='+save:'?workspace=account';const r=await world.GET(new Request('https://test.invalid/api/world'+suffix));const scope=await r.json();return payload===undefined?{status:r.status,body:scope}:post(world,{operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',operationScope:scope.operationScope,worldContext:scope.world.contextId,...payload},'/api/world'+suffix);};
  async function createWorld(name) {
    const fields={name,appearance:'外套',personality:'安靜',abilities:'沒有特殊設定',background:'沒有特殊設定',initialMemories:'初到此地',beliefs:'沒有特殊設定',preferences:'沒有特殊設定',directions:'生活',startLocation:''};
    const person=await post(people,{id:crypto.randomUUID(),version:0,fields},'/api/character-templates');assert.equal(person.status,200);
    const scene=await post(scenes,{id:crypto.randomUUID(),version:0,name:name+'的家',note:'',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]},'/api/scene-templates');assert.equal(scene.status,201);
    const saved=await post(saves,{id:crypto.randomUUID(),name,city:{places:[{id:'home',templateId:scene.body.template.id,version:scene.body.template.version,name:name+'的家'}],characters:[{templateId:person.body.template.id,version:person.body.template.version,placeId:'home',roomId:'front'}]}},'/api/saves');assert.equal(saved.status,201,JSON.stringify(saved.body));return saved.body.save.id;
  }
  return { db, context, request, worldRequest, createWorld };
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
 const {db,request,worldRequest,createWorld}=await fixture();const oldFetch=globalThis.fetch;const calls=[];
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
 const {db,request,worldRequest,createWorld}=await fixture();
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
   const {db,request,worldRequest,createWorld}=await fixture();const oldFetch=globalThis.fetch,oldNow=Date.now;let calls=0;
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
