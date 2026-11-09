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
  const built = await esbuild.build({ entryPoints: ['app/api/character-drafts/route.ts', 'app/api/character-drafts/generate/route.ts', 'app/api/world/route.ts'], outdir:'/tmp/character-drafts-test', bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': process.cwd() }, plugins: [{ name: 'boundaries', setup(b) {
    b.onResolve({ filter: /^(cloudflare:workers|@\/lib\/auth)$/ }, a => ({ path: a.path, namespace: 'boundary' }));
    b.onLoad({ filter: /.*/, namespace: 'boundary' }, a => ({ contents: a.path === 'cloudflare:workers' ? 'export const env = context.env;' : 'export const getGitHubUser = async () => context.owner ? {userId:context.owner} : null;' }));
  } }] });
  const entries = built.outputFiles.map(file => { const compiled={exports:{}}; new Function('module','exports','require','context',file.text)(compiled,compiled.exports,require,context); return compiled.exports; });
  const [api,generation,world] = entries;
  async function request(body, origin = 'https://test.invalid') { const response = body === undefined ? await api.GET() : await api.POST(new Request('https://test.invalid/api/character-drafts', { method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body) })); return { status:response.status,body:await response.json() }; }
  async function post(route,payload,path) {const r=await route.POST(new Request('https://test.invalid'+path,{method:'POST',headers:{Origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(payload)}));return {status:r.status,body:await r.json()};}
  const generate=payload=>post(generation,payload,'/api/character-drafts/generate');
  const worldRequest=async payload=>{const r=await world.GET(new Request('https://test.invalid/api/world?workspace=account')); const scope=await r.json(); return payload===undefined ? {status:r.status,body:scope} : post(world,{operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',operationScope:scope.operationScope,worldContext:scope.world.contextId,...payload},'/api/world?workspace=account');};
  return { db, context, request, generate, worldRequest };
}
const fields = {name:'',appearance:'',personality:'',abilities:'',background:'',initialMemories:'',beliefs:'',preferences:'',directions:'',startLocation:''};
test('account character text drafts save without name, recover lost replies, reject stale writes and isolate accounts', async () => {
  const {db,context,request} = await fixture();
  try {
    const input={id:crypto.randomUUID(),version:0,concept:'安靜的修鐘人',fields:{...fields,personality:'安靜'}};
    assert.equal((await request(input,'https://evil.invalid')).status,403);
    context.fault='before'; assert.equal((await request(input)).status,503);
    assert.deepEqual((await request()).body.drafts,[]);
    context.fault='after'; assert.equal((await request(input)).status,503);
    const saved=await request(input); assert.equal(saved.status,200); assert.equal(saved.body.draft.version,1);
    assert.equal(saved.body.draft.fields.name,''); assert.equal(saved.body.draft.provenance.personality.kind,'user');
    assert.equal(saved.body.draft.provenance.background.kind,'empty');
    const changed=await request({...input,version:1,fields:{...input.fields,background:'沒有特殊背景'}});
    assert.equal(changed.status,200); assert.equal(changed.body.draft.version,2);
    assert.equal((await request({...input,version:1,concept:'另一裝置的舊修改'})).status,409);
    assert.equal((await request()).body.drafts[0].fields.background,'沒有特殊背景');
    context.owner='b'; assert.deepEqual((await request()).body.drafts,[]);
    assert.equal((await request({...input,version:2})).status,409);
    context.owner=null; assert.equal((await request()).status,401);
  } finally {db.close();}
});

test('AI completion preserves filled fields, stores trustworthy origins, and punctuation does not earn user provenance', async () => {
  const {db,request,generate,worldRequest}=await fixture();
  const originalFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:JSON.stringify({name:'被模型覆蓋',personality:'健談',background:'在河畔學修鐘。',appearance:'綠色外套'})}}]});};
  try {
    assert.equal((await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'})).status,200);
    assert.equal((await worldRequest({operation:'set-adjudication',adjudication:{provider:'openai',model:'gpt-6.1-sol'}})).status,200);
    const scope=(await worldRequest()).body;
    const saved=(await request({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields:{...fields,name:'孟澄',personality:'安靜'}})).body.draft;
    const input={id:saved.id,version:saved.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:scope.operationScope,worldContext:scope.world.contextId};
    const result=await generate(input); assert.equal(result.status,200); assert.equal(calls,1);
    assert.equal(result.body.draft.fields.name,'孟澄'); assert.equal(result.body.draft.fields.personality,'安靜');
    assert.equal(result.body.draft.fields.background,'在河畔學修鐘。');
    assert.equal(result.body.draft.provenance.background.kind,'ai');
    assert.equal(result.body.draft.provenance.background.materiallyEdited,false);
    const replay=await generate(input); assert.equal(replay.status,200);assert.equal(calls,1);
    assert.deepEqual(replay.body.draft,result.body.draft);
    const draft=result.body.draft;
    const punctuation=await request({...draft,fields:{...draft.fields,background:'在河畔，學修鐘！'}});
    assert.equal(punctuation.body.draft.provenance.background.materiallyEdited,false);
    const changed=await request({...punctuation.body.draft,fields:{...draft.fields,background:'在河畔跟外公學修鐘。'}});
    assert.equal(changed.body.draft.provenance.background.materiallyEdited,true);
    assert.equal(changed.body.draft.provenance.background.aiText,'在河畔學修鐘。');
    assert.equal((await request()).body.drafts[0].fields.background,'在河畔跟外公學修鐘。');
  } finally {globalThis.fetch=originalFetch;db.close();}
});

test('lost AI completion replies recover once, and slow AI responses never overwrite another device', async () => {
  const {db,context,request,generate,worldRequest}=await fixture();
  const originalFetch=globalThis.fetch;
  let calls=0, onModel;
  globalThis.fetch=async()=>{calls++; await onModel?.();return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:'{"background":"AI 背景"}'}}]});};
  try {
    await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'});
    await worldRequest({operation:'set-adjudication',adjudication:{provider:'openai',model:'gpt-6.1-sol'}});
    const scope=(await worldRequest()).body;
    const inputFor=draft=>({id:draft.id,version:draft.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:scope.operationScope,worldContext:scope.world.contextId});
    const first=(await request({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields})).body.draft;
    onModel=()=>{context.fault='after';};
    const input=inputFor(first);
    assert.equal((await generate(input)).status,503);
    const recovered=await generate(input);
    assert.equal(recovered.status,200); assert.equal(recovered.body.draft.fields.background,'AI 背景'); assert.equal(calls,1);
    const second=(await request({id:crypto.randomUUID(),version:0,concept:'另一位人物',fields})).body.draft;
    const secondInput=inputFor(second);
    onModel=async()=>{
      const pending=(await request()).body.drafts.find(d=>d.id===second.id);
      const edit=await request({...pending,fields:{...pending.fields,personality:'另一裝置親填'}});
      assert.equal(edit.status,200);
    };
    assert.equal((await generate(secondInput)).status,409);
    assert.equal((await generate(secondInput)).status,409);
    assert.equal(calls,2);
    const saved=(await request()).body.drafts.find(d=>d.id===second.id);
    assert.equal(saved.fields.personality,'另一裝置親填');assert.equal(saved.fields.background,'');
    assert.equal((await generate({id:saved.id,version:saved.version,discard:true})).status,200);
  } finally {globalThis.fetch=originalFetch;db.close();}
});

test('restoring AI text after a persisted empty field preserves its AI source and substantive edit evidence', async()=>{
  const {db,request,generate,worldRequest}=await fixture(),oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:'{"background":"在河畔學修鐘。"}'}}]});
  try {
    await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'});
    await worldRequest({operation:'set-adjudication',adjudication:{provider:'openai',model:'gpt-6.1-sol'}});
    const scope=(await worldRequest()).body;
    let draft=(await request({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields})).body.draft;
    draft=(await generate({id:draft.id,version:draft.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:scope.operationScope,worldContext:scope.world.contextId})).body.draft;
    draft=(await request({...draft,fields:{...draft.fields,background:''}})).body.draft;
    draft=(await request({...draft,fields:{...draft.fields,background:'在河畔，學修鐘！'}})).body.draft;
    let saved=(await request()).body.drafts.find(value=>value.id===draft.id);
    assert.equal(saved.provenance.background.kind,'ai');
    assert.equal(saved.provenance.background.materiallyEdited,false);
    assert.equal(saved.provenance.background.aiText,'在河畔學修鐘。');
    draft=(await request({...draft,fields:{...draft.fields,background:'在河畔跟外公學修鐘。'}})).body.draft;
    saved=(await request()).body.drafts.find(value=>value.id===draft.id);
    assert.equal(saved.provenance.background.kind,'ai');
    assert.equal(saved.provenance.background.materiallyEdited,true);
    assert.equal(saved.provenance.background.userText,'在河畔跟外公學修鐘。');
  } finally {globalThis.fetch=oldFetch;db.close();}
});

test('recompletion and discarded slow results retain every known AI field source across saved clears', async()=>{
  const {db,request,generate,worldRequest}=await fixture(),oldFetch=globalThis.fetch;
  let calls=0,onModel;
  globalThis.fetch=async()=>{calls++;await onModel?.();return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:JSON.stringify({background:calls===1?'在河畔學修鐘。':calls===2?'在山城做木工。':'慢回覆的新文字'})}}]});};
  try {
    await worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'});
    await worldRequest({operation:'set-adjudication',adjudication:{provider:'openai',model:'gpt-6.1-sol'}});
    const scope=(await worldRequest()).body;
    const inputFor=draft=>({id:draft.id,version:draft.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:scope.operationScope,worldContext:scope.world.contextId});
    let draft=(await request({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields})).body.draft;
    draft=(await generate(inputFor(draft))).body.draft;
    draft=(await request({...draft,fields:{...draft.fields,background:''}})).body.draft;
    draft=(await generate(inputFor(draft))).body.draft;
    draft=(await request({...draft,fields:{...draft.fields,background:''}})).body.draft;
    onModel=async()=>{
      const current=(await request()).body.drafts.find(value=>value.id===draft.id);
      assert.equal((await request({...current,fields:{...current.fields,personality:'保留另一裝置的文字'}})).status,200);
    };
    assert.equal((await generate(inputFor(draft))).status,409);
    draft=(await request()).body.drafts.find(value=>value.id===draft.id);
    draft=(await request({...draft,fields:{...draft.fields,background:'在河畔，學修鐘！'}})).body.draft;
    const saved=(await request()).body.drafts.find(value=>value.id===draft.id);
    assert.equal(saved.fields.personality,'保留另一裝置的文字');
    assert.equal(saved.provenance.background.kind,'ai');
    assert.equal(saved.provenance.background.materiallyEdited,false);
    assert.equal(calls,3);
  }finally{globalThis.fetch=oldFetch;db.close();}
});
