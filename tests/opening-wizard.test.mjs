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
  const context = { owner: 'a', fault: null, dice:0, random:()=>{context.dice++;return .5;} };
  context.env = { APP_ENV: 'local', AUTH_ORIGIN: 'https://test.invalid', MODEL_KEY_ENCRYPTION_SECRET: 'ab'.repeat(32), DB: { prepare(sql) { return { bind(...values) { return {
    async first() {const formedWrite=sql.startsWith('UPDATE character_drafts')&&typeof values[0]==='string'&&JSON.parse(values[0]).formation;const fault=formedWrite&&context.formFault||sql.includes('RETURNING')&&context.fault;if(formedWrite&&context.formFault)context.formFault=null;else if(fault)context.fault=null;if(fault==='before')throw Error('before');const result=db.prepare(sql).get(...values)??null;if(fault==='after')throw Error('after');return result;},
    async all() { return { results: db.prepare(sql).all(...values) }; }, async run() { const fault=sql.startsWith('INSERT INTO opening_drafts')&&context.draftFault;if(fault)context.draftFault=null;if(fault==='before')throw Error('before draft');const result={meta:{changes:Number(db.prepare(sql).run(...values).changes)}};if(fault==='after')throw Error('after draft');return result; },
  }; } }; } } };
  context.env.DB.batch=async statements=>{const fault=context.batchFault;context.batchFault=null;if(context.beforeBatch){const before=context.beforeBatch;context.beforeBatch=null;await before();}if(fault==='before')throw Error('before batch');db.exec('BEGIN');let committed=false;try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');committed=true;if(fault==='after')throw Error('after batch');return result;}catch(error){if(!committed)db.exec('ROLLBACK');throw error;}};
  const built = await esbuild.build({ entryPoints: ['app/api/opening-drafts/route.ts','app/api/character-drafts/route.ts','app/api/character-drafts/form/route.ts','app/api/character-cards/route.ts','app/api/model-settings/route.ts','app/api/world/route.ts','app/api/character-templates/route.ts','app/api/scene-templates/route.ts','app/api/saves/route.ts','app/api/character-drafts/from-template/route.ts','app/api/character-drafts/generate/route.ts'], outdir:'/tmp/character-drafts-test', bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': process.cwd() }, plugins: [{ name: 'boundaries', setup(b) {
    b.onLoad({filter:/character-formation\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replaceAll('Math.random','context.random'),loader:'ts'}));
    b.onResolve({ filter: /^(cloudflare:workers|@\/lib\/auth)$/ }, a => ({ path: a.path, namespace: 'boundary' }));
    b.onLoad({ filter: /.*/, namespace: 'boundary' }, a => ({ contents: a.path === 'cloudflare:workers' ? 'export const env = context.env;' : 'export const getGitHubUser = async () => context.owner ? {userId:context.owner} : null;' }));
  } }] });
  const entries = built.outputFiles.map(file => { const compiled={exports:{}}; new Function('module','exports','require','context',file.text)(compiled,compiled.exports,require,context); return compiled.exports; });
  const [openings,drafts,form,cards,api,world,people,scenes,saves,fromTemplate,generation] = entries;
  async function post(route,payload,path) {if(route===openings||route===saves&&!payload.operation)payload={operationScope:context.owner,...payload};const r=await route.POST(new Request('https://test.invalid'+path,{method:'POST',headers:{Origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(payload)}));return {status:r.status,body:await r.json()};}
  const request=async(body,save)=>{const url='https://test.invalid/api/model-settings'+(save?'?save='+save:'');const response=body===undefined?await api.GET(new Request(url)):await api.POST(new Request(url,{method:'POST',headers:{Origin:'https://test.invalid'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
  const worldRequest=async(payload,save)=>{const suffix=save?'?save='+save:'?workspace=account';const r=await world.GET(new Request('https://test.invalid/api/world'+suffix));const scope=await r.json();return payload===undefined?{status:r.status,body:scope}:post(world,{operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',operationScope:scope.operationScope,worldContext:scope.world.contextId,...payload},'/api/world'+suffix);};

  return {db,context,request,worldRequest,post,openings,scenes,saves,readOpening:async id=>{const r=await openings.GET(new Request('https://test.invalid/api/opening-drafts?id='+id+'&preview=1'));return {status:r.status,body:await r.json()};},source:payload=>post(people,payload,'/api/character-templates'),importTemplate:payload=>post(fromTemplate,{operationScope:'account-operations:'+context.owner,...payload},'/api/character-drafts/from-template'),generate:payload=>post(generation,payload,'/api/character-drafts/generate'),readOperation:async id=>{const r=await world.GET(new Request('https://test.invalid/api/world?workspace=account&operationId='+id));return r.json();},saveDraft:payload=>post(drafts,payload,'/api/character-drafts'),readDrafts:async()=>{const r=await drafts.GET();return {status:r.status,body:await r.json()};},form:payload=>post(form,{operationScope:'account-operations:'+context.owner,...payload},'/api/character-drafts/form'),complete:payload=>post(cards,{operationScope:'account-operations:'+context.owner,...payload},'/api/character-cards'),cards:async()=>{const r=await cards.GET();return {status:r.status,body:await r.json()};}};
}

const fields={name:'時雨',appearance:'35歲，身高175公分',personality:'安靜',abilities:'沒有特殊設定',background:'河畔長大',initialMemories:'記得老屋',beliefs:'重視承諾',preferences:'沒有特殊設定',directions:'修好老鐘',startLocation:''};
const models={npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}};
async function assets(f){
 await f.request({version:0,mode:'custom',models});await f.worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'});
 const draft=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'修鐘的人',fields})).body.draft;
 const scope=(await f.worldRequest()).body;
 const formed=await f.form({id:draft.id,version:draft.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:scope.operationScope,worldContext:scope.world.contextId});assert.equal(formed.status,200,JSON.stringify(formed.body));
 const card=(await f.complete({id:draft.id,version:formed.body.draft.version})).body.card;
 const scene=(await f.post(f.scenes,{id:crypto.randomUUID(),version:0,name:'老屋',note:'原始屋況',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[{id:'clock',name:'老鐘',roomId:'front',state:{運作:'停止'}}]},'/api/scene-templates')).body.template;
 return {card,scene};
}
test('confirmed opening stores formed cards, exact living values and immutable sources without advancing',async()=>{
 const f=await fixture(),previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:'{"bonuses":[]}'}}]});};
 try{
  const {card,scene}=await assets(f),id=crypto.randomUUID();const body={name:'第一個世界',step:4,description:'留在老屋',city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:'舊家'}],characters:[{templateId:card.id,version:card.version,placeId:'home',roomId:'front',mentalOpening:{current:49},openingNeeds:{hunger:12,thirst:20,fatigue:15,sleep:20}}]}};
  const draft=await f.post(f.openings,{id,version:0,body},'/api/opening-drafts');assert.equal(draft.status,200,JSON.stringify(draft.body));assert.equal(draft.body.world.turn,0);assert.equal(draft.body.world.characters[0].mentalEnergy.value,49);
  const saved=await f.post(f.saves,{id,draftId:id,draftVersion:1},'/api/saves');assert.equal(saved.status,201,JSON.stringify(saved.body));assert.deepEqual(saved.body.world,draft.body.world);assert.equal(saved.body.save.originalOpeningAvailable,true);
  const read=(await f.worldRequest(undefined,id)).body.world;assert.equal(read.turn,0);assert.deepEqual(read.characters[0].attributes.values,card.values);assert.equal(read.characters[0].needs.values.hunger,12);assert.equal(calls,1);
 }finally{globalThis.fetch=previous;f.db.close();}
});
async function prepared(f,{twoPlaces=false,twoPeople=false}={}){
 const {card,scene}=await assets(f);let second;
 if(twoPeople){const d=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'散步的人',fields:{...fields,name:'小春'}})).body.draft;const scope=(await f.worldRequest()).body;const formed=await f.form({id:d.id,version:d.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:scope.operationScope,worldContext:scope.world.contextId});second=(await f.complete({id:d.id,version:formed.body.draft.version})).body.card;}
 const id=crypto.randomUUID(),body={name:'保留原始開局',step:4,description:'兩人在老屋生活',city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:'甲屋'},...(twoPlaces?[{id:'work',templateId:scene.id,version:scene.version,name:'乙屋'}]:[])],characters:[{templateId:card.id,version:card.version,placeId:'home',roomId:'front',homeId:'home',homeRoomId:'front'},...(second?[{templateId:second.id,version:second.version,placeId:'home',roomId:'front',homeId:'home',homeRoomId:'front'}]:[])]}};
 const saved=await f.post(f.openings,{id,version:0,body},'/api/opening-drafts');assert.equal(saved.status,200,JSON.stringify(saved.body));return {id,body,card,scene,draft:saved.body};
}
async function controlled(run){const f=await fixture(),old=globalThis.fetch;globalThis.fetch=async()=>Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:'{"bonuses":[]}'}}]});try{await run(f);}finally{globalThis.fetch=old;f.db.close();}}
test('draft auto-save resumes with original sources after source edits; restart creates a separate world from original content',()=>controlled(async f=>{
 const {id,body,scene,draft}=await prepared(f);const edited=await f.post(f.scenes,{...scene,shared:undefined,name:'後來改成新屋',version:scene.version,rooms:[{id:'other',name:'新房'}],objects:[]},'/api/scene-templates');assert.equal(edited.status,200,JSON.stringify(edited.body));
 const updated=await f.post(f.openings,{id,version:1,body:{...body,name:'最後名稱',description:'最後確認內容'}},'/api/opening-drafts');assert.equal(updated.status,200);assert.equal(updated.body.world.configuration.locations[0].note,'原始屋況');assert.deepEqual(updated.body.preview.places[0].rooms,draft.preview.places[0].rooms);
 const saved=await f.post(f.saves,{id,draftId:id,draftVersion:2},'/api/saves');assert.equal(saved.status,201);assert.equal(saved.body.save.name,'最後名稱');
 const restart=await f.post(f.openings,{id:crypto.randomUUID(),version:0,restartSaveId:id},'/api/opening-drafts');assert.equal(restart.status,200,JSON.stringify(restart.body));assert.equal(restart.body.draft.body.description,'最後確認內容');assert.equal(restart.body.world.characters[0].profile.background,'河畔長大');assert.equal(restart.body.preview.places[0].rooms[0].name,'客廳');
 const restarted=await f.post(f.saves,{id:restart.body.draft.id,draftId:restart.body.draft.id,draftVersion:1},'/api/saves');assert.equal(restarted.status,201);assert.notEqual(restarted.body.world.contextId,saved.body.world.contextId);assert.equal((await f.worldRequest(undefined,id)).body.world.turn,0);
}));
test('same-source places are independent, cohabitants share one actual residence, and absent roads/grants do not create links',()=>controlled(async f=>{
 const {draft}=await prepared(f,{twoPlaces:true,twoPeople:true}),world=draft.world;assert.equal(draft.preview.issues.length,0);assert.equal(world.configuration.locations.length,2);assert.equal(world.objects.length,2);assert.notEqual(world.objects[0].id,world.objects[1].id);assert.notEqual(world.objects[0].region,world.objects[1].region);assert.equal(world.configuration.residences[world.characters[0].id],world.configuration.residences[world.characters[1].id]);assert.deepEqual(draft.preview.walks,[]);assert.equal(world.configuration.doors.length,0);
}));
test('draft conflicts preserve prior state, cross-account references are isolated, and invalid starts/cards cannot install worlds',()=>controlled(async f=>{
 const {id,body}=await prepared(f);const next=await f.post(f.openings,{id,version:1,body:{...body,name:'新版'}},'/api/opening-drafts');assert.equal(next.status,200);
 assert.equal((await f.post(f.openings,{id,version:1,body:{...body,name:'衝突輸入'}},'/api/opening-drafts')).status,409);assert.equal((await f.readOpening(id)).body.draft.body.name,'新版');assert.equal((await f.post(f.saves,{id,draftId:id,draftVersion:1},'/api/saves')).status,409);
 f.context.owner='other';assert.equal((await f.readOpening(id)).status,404);assert.equal((await f.post(f.saves,{id,draftId:id,draftVersion:2},'/api/saves')).status,404);f.context.owner='a';
 const badId=crypto.randomUUID(),invalid=await f.post(f.openings,{id:badId,version:0,body:{...body,city:{...body.city,characters:[{...body.city.characters[0],roomId:'missing'}]}}},'/api/opening-drafts');assert.equal(invalid.status,200);assert.ok(invalid.body.preview.issues.length);assert.equal((await f.post(f.saves,{id:badId,draftId:badId,draftVersion:1},'/api/saves')).status,400);
 assert.equal((await f.post(f.saves,{id:crypto.randomUUID(),name:'不可繞過形成',city:body.city},'/api/saves')).status,400);
}));
test('atomic failures and lost commit replies recover the same creation, without advancing or creating duplicates',()=>controlled(async f=>{
 for(const fault of ['before','after']){const {id}=await prepared(f);const input={id,draftId:id,draftVersion:1};f.context.batchFault=fault;assert.equal((await f.post(f.saves,input,'/api/saves')).status,503);const count=f.db.prepare('SELECT count(*) AS n FROM world_saves WHERE owner=? AND id=?').get('a',id).n;assert.equal(count,fault==='before'?0:1);const recovered=await f.post(f.saves,input,'/api/saves');assert.equal(recovered.status,fault==='before'?201:200);assert.equal(recovered.body.world.turn,0);assert.equal(f.db.prepare('SELECT count(*) AS n FROM world_saves WHERE owner=? AND id=?').get('a',id).n,1);assert.equal((await f.post(f.saves,{...input,id:crypto.randomUUID()},'/api/saves')).status,409);}
}));
test('opening need feelings resolve consistently, card capacity accepts its own range, and contradictory state blocks confirmation',()=>controlled(async f=>{
 const {id,body,card}=await prepared(f);const character=body.city.characters[0];
 const updated=await f.post(f.openings,{id,version:1,body:{...body,city:{...body.city,characters:[{...character,mentalOpening:{current:card.capacity},openingFeelings:{hunger:1,thirst:2,fatigue:0,sleep:3}}]}}},'/api/opening-drafts');assert.equal(updated.status,200,JSON.stringify(updated.body));assert.deepEqual(updated.body.world.characters[0].needs.values,{hunger:52.5,thirst:75,fatigue:20,sleep:92.5});assert.equal(updated.body.world.characters[0].mentalEnergy.value,card.capacity);
 const invalid=await f.post(f.openings,{id,version:2,body:{...body,city:{...body.city,characters:[{...character,openingNeeds:{hunger:10,thirst:20,fatigue:15,sleep:20},openingFeelings:{hunger:3}}]}}},'/api/opening-drafts');assert.equal(invalid.status,200);assert.ok(invalid.body.preview.issues.some(message=>message.includes('矛盾')));assert.equal(invalid.body.world,undefined);
}));
test('lost draft response reuses stored candidate and a competing draft edit cannot partially install a world',()=>controlled(async f=>{
 const {id,body}=await prepared(f);const input={id,version:1,body:{...body,name:'保留輸入'}};f.context.draftFault='after';assert.equal((await f.post(f.openings,input,'/api/opening-drafts')).status,503);const durable=(await f.readOpening(id)).body;const recovered=await f.post(f.openings,input,'/api/opening-drafts');assert.equal(recovered.status,200);assert.deepEqual(recovered.body.world,durable.world);assert.equal(recovered.body.draft.version,2);
 f.context.beforeBatch=async()=>{const edit=await f.post(f.openings,{id,version:2,body:{...body,name:'另一頁剛修改'}},'/api/opening-drafts');assert.equal(edit.status,200);};
 assert.equal((await f.post(f.saves,{id,draftId:id,draftVersion:2},'/api/saves')).status,409);assert.equal(f.db.prepare('SELECT count(*) AS n FROM worlds WHERE owner=?').get('save:a:'+id).n,0);assert.equal(f.db.prepare('SELECT count(*) AS n FROM world_saves WHERE owner=? AND id=?').get('a',id).n,0);
}));
test('legacy missing original is explicitly unavailable, and new reset/start-city never overwrite the selected world',()=>controlled(async f=>{
 const {id,body}=await prepared(f);await f.post(f.saves,{id,draftId:id,draftVersion:1},'/api/saves');f.db.prepare('UPDATE world_saves SET original_opening=NULL WHERE owner=? AND id=?').run('a',id); // historical migration fixture: no fabricated original
 const restart=await f.post(f.openings,{id:crypto.randomUUID(),version:0,restartSaveId:id},'/api/opening-drafts');assert.equal(restart.status,409);assert.match(restart.body.error,/沒有原始開局/);
 const state=()=>f.db.prepare('SELECT state FROM worlds WHERE owner=?').get('save:a:'+id).state;const before=state();assert.equal((await f.worldRequest({operation:'reset'},id)).status,409);assert.equal((await f.worldRequest({operation:'start-city',city:body.city},id)).status,409);assert.equal(state(),before);
}));

test('a delayed new draft or finalization retains the originating account instead of current cookie account',()=>controlled(async f=>{
 const id=crypto.randomUUID(),input={id,version:0,operationScope:'a',body:{name:'原帳號輸入',description:'',step:1,city:{characters:[],places:[]}}};f.context.owner='b';assert.equal((await f.post(f.openings,input,'/api/opening-drafts')).status,409);assert.equal(f.db.prepare('SELECT count(*) AS n FROM opening_drafts').get().n,0);
 f.context.owner='a';const created=await prepared(f);f.context.owner='b';assert.equal((await f.post(f.saves,{id:created.id,draftId:created.id,draftVersion:1,operationScope:'a'},'/api/saves')).status,409);assert.equal(f.db.prepare('SELECT count(*) AS n FROM world_saves').get().n,0);
}));
test('moving from confirmation to entry or renaming keeps the already saved candidate and future random streams',()=>controlled(async f=>{
 const {id,body,draft}=await prepared(f);const moved=await f.post(f.openings,{id,version:1,body:{...body,name:'最後名稱',step:5}},'/api/opening-drafts');assert.equal(moved.status,200);assert.deepEqual(moved.body.world,draft.world);
}));
test('deleting a finalized world removes only its closed draft and preserves copied original, independent drafts and assets',()=>controlled(async f=>{
 const {id}=await prepared(f),confirmation={id,draftId:id,draftVersion:1};await f.post(f.saves,confirmation,'/api/saves');const otherId=crypto.randomUUID();await f.post(f.openings,{id:otherId,version:0,body:{name:'仍在建立',step:2,description:'保留這份草稿',city:{places:[],characters:[]}}},'/api/opening-drafts');
 const copy=await f.post(f.saves,{operation:'copy',operationId:crypto.randomUUID(),saveId:id,expectedVersion:0,name:'獨立副本'},'/api/saves');assert.equal(copy.status,201,JSON.stringify(copy.body));const copyId=copy.body.save.id;
 const deleted=await f.post(f.saves,{operation:'delete',operationId:crypto.randomUUID(),saveId:id,expectedVersion:0},'/api/saves');assert.equal(deleted.status,200,JSON.stringify(deleted.body));assert.equal((await f.readOpening(id)).status,404);assert.equal((await f.readOpening(otherId)).status,200);
 assert.equal((await f.post(f.saves,confirmation,'/api/saves')).status,410);assert.equal(f.db.prepare('SELECT count(*) AS n FROM worlds WHERE owner=?').get('save:a:'+id).n,0);assert.equal((await f.worldRequest(undefined,copyId)).body.world.turn,0);
 const restarted=await f.post(f.openings,{id:crypto.randomUUID(),version:0,restartSaveId:copyId},'/api/opening-drafts');assert.equal(restarted.status,200);assert.equal(restarted.body.world.characters[0].name,'時雨');assert.equal((await f.cards()).body.cards.length,1);assert.equal(f.db.prepare('SELECT count(*) AS n FROM scene_templates').get().n,1);
}));
