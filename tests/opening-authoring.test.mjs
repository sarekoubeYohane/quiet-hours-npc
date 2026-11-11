import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {characterApiFixture} from './support/character-api-fixture.mjs';
const require=createRequire(import.meta.url),esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
const built=await esbuild.build({entryPoints:['lib/opening-authoring.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const compiled={exports:{}};new Function('module','exports','require',built.outputFiles[0].text)(compiled,compiled.exports,require);
const {fillUniqueStarts,returnOpeningAsset}=compiled.exports;
const actor={templateId:'card-a',version:1,placeId:'',roomId:''};
const scene={id:crypto.randomUUID(),version:1,name:'小屋',note:'',rooms:[{id:'room',name:'起居室'}],connections:[],objects:[]};
const place={id:'home',templateId:scene.id,version:1,name:'小屋'};
test('unique starts fill only empty choices; multiple rooms and explicit choices are preserved',()=>{
 const city={characters:[actor],places:[place]};
 assert.deepEqual(fillUniqueStarts(city,[scene]).characters[0],{...actor,placeId:'home',roomId:'room'});
 assert.deepEqual(city.characters[0],actor);
 assert.equal(fillUniqueStarts({...city,places:[place,{...place,id:'other'}]},[scene]).characters[0].placeId,'');
 assert.equal(fillUniqueStarts(city,[{...scene,rooms:[...scene.rooms,{id:'bed',name:'臥室'}]}]).characters[0].roomId,'');
 assert.equal(fillUniqueStarts({...city,finalization:{spaces:[{placeId:'home',rooms:[{id:'extra',name:'新增房間'}],objects:[],connections:[]}],walks:[]}},[scene]).characters[0].roomId,'');
 const explicit={...actor,placeId:'elsewhere',roomId:'chosen'};
 assert.deepEqual(fillUniqueStarts({...city,characters:[explicit]},[scene]).characters[0],explicit);
});
test('scene handoff survives a lost reply with valid instance IDs, unchanged draft fields and one attachment',async()=>{
 const f=await characterApiFixture(['openings','scenes']);const old=globalThis.fetch;
 try{
  const sceneReply=await f.post(f.routes.scenes,{...scene,version:0},'/api/scene-templates');assert.equal(sceneReply.status,201,JSON.stringify(sceneReply.body));
  const savedScene=sceneReply.body.template,id=crypto.randomUUID(),path='/new?draft='+id+'&owner=a';
  const body={name:'原本名稱',description:'保留敘述',step:3,city:{characters:[],places:[]}};
  assert.equal((await f.post(f.routes.openings,{id,version:0,body},'/api/opening-drafts')).status,200);
  let loseReply=true;
  globalThis.fetch=async(url,options)=>{
   const request=new Request('https://test.invalid'+url,{...options,headers:{Origin:'https://test.invalid','Content-Type':'application/json'}});
   const response=await f.routes.openings[options?.method==='POST'?'POST':'GET'](request);
   if(options?.method==='POST'&&loseReply){loseReply=false;throw Error('lost reply after commit');}return response;
  };
  await assert.rejects(returnOpeningAsset(path,'account-operations:a',{kind:'scene',scene:savedScene}),/lost reply/);
  assert.equal(await returnOpeningAsset(path,'account-operations:a',{kind:'scene',scene:savedScene}),path);
  const stored=(await f.read(f.routes.openings,'/api/opening-drafts?id='+id)).body.draft;
  assert.equal(stored.body.name,body.name);assert.equal(stored.body.description,body.description);assert.equal(stored.body.step,3);
  assert.equal(stored.body.city.places.length,1);assert.match(stored.body.city.places[0].id,/^[a-zA-Z0-9_-]{1,24}$/);
  assert.equal(stored.sources.scenes[0].id,savedScene.id);
  let requests=0;globalThis.fetch=async()=>{requests++;throw Error('must not send');};
  await assert.rejects(returnOpeningAsset(path,'account-operations:b',{kind:'scene',scene:savedScene}),/無法核對/);assert.equal(requests,0);
 }finally{globalThis.fetch=old;f.db.close();}
});
test('asset return reports concurrent edits and never blindly retries an outdated body',async()=>{
 const old=globalThis.fetch,id=crypto.randomUUID();let writes=0;
 globalThis.fetch=async(_,options)=>options?.method==='POST'?(writes++,Response.json({error:'另頁已修改'},{status:409})):Response.json({operationScope:'a',draft:{version:1,body:{name:'保留',step:1,city:{characters:[],places:[]}}}});
 try{await assert.rejects(returnOpeningAsset('/new?draft='+id+'&owner=a','account-operations:a',{kind:'card',id:'card-a',version:1}),/另頁已修改/);assert.equal(writes,1);}
 finally{globalThis.fetch=old;}
});
