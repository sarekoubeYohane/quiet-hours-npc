import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {characterApiFixture} from './support/character-api-fixture.mjs';
const fields={name:'原名',appearance:'外套',personality:'安靜',abilities:'沒有特殊設定',background:'河畔長大',initialMemories:'記得老屋',beliefs:'重視承諾',preferences:'沒有特殊設定',directions:'生活',startLocation:''};
test('original account owns asset edits, model settings, key writes and recovery reads before any mutation',async()=>{
 const f=await characterApiFixture(['drafts','people','scenes','settings','world','generation','form','cards']);
 const ids={drafts:crypto.randomUUID(),people:crypto.randomUUID(),scenes:crypto.randomUUID()};
 const payloads={drafts:{id:ids.drafts,version:0,concept:'原始',fields},people:{id:ids.people,version:0,fields},scenes:{id:ids.scenes,version:0,name:'原屋',note:'',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]},settings:{version:0,mode:'custom',models:{npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}}}};
 const paths={drafts:'/api/character-drafts',people:'/api/character-templates',scenes:'/api/scene-templates',settings:'/api/model-settings'};
 try{
  for(const owner of ['a','b']){f.context.owner=owner;for(const name of Object.keys(paths)){const captured=await f.read(f.routes[name],paths[name]);assert.equal(captured.body.accountScope,'account-operations:'+owner);const result=await f.post(f.routes[name],{...payloads[name],accountScope:captured.body.accountScope},paths[name]);assert.ok([200,201].includes(result.status),JSON.stringify(result.body));}}
  const before=f.db.prepare('SELECT * FROM character_drafts WHERE owner=?').all('b');
  for(const name of Object.keys(paths)){
   const old={...payloads[name],version:1,accountScope:'account-operations:a'};
   assert.equal((await f.post(f.routes[name],old,paths[name])).status,409,name);
   assert.equal((await f.post(f.routes[name],{...old,accountScope:undefined},paths[name])).status,409,name+' missing');
   assert.equal((await f.read(f.routes[name],paths[name]+'?accountScope=account-operations%3Aa')).status,409,name+' recovery');
  }
  assert.deepEqual(f.db.prepare('SELECT * FROM character_drafts WHERE owner=?').all('b'),before);
  for(const operation of ['set-model-key','clear-model-key','set-adjudication']){
   const result=await f.post(f.routes.world,{operation,operationScope:'account-operations:a',mode:'openai',key:'controlled-key'},'/api/world?workspace=account');assert.equal(result.status,409,operation);
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM account_model_keys').get().n,0);
  const snapshot=JSON.stringify(f.db.prepare('SELECT * FROM character_drafts WHERE owner=?').all('b'));
  for(const [route,path,payload] of [[f.routes.generation,'/api/character-drafts/generate',{id:ids.drafts,version:1,discard:true}],[f.routes.form,'/api/character-drafts/form',{id:ids.drafts,version:1,action:'allocate',values:{}}]])assert.equal((await f.post(route,{...payload,operationScope:'account-operations:a'},path)).status,409);
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM character_drafts WHERE owner=?').all('b')),snapshot);
  assert.equal((await f.read(f.routes.world,'/api/world?workspace=account&operationScope=account-operations%3Aa')).status,409);
  f.context.owner='a';assert.equal((await f.post(f.routes.drafts,{...payloads.drafts,version:1,accountScope:'account-operations:a'},paths.drafts)).status,200);
 }finally{f.db.close();}
});
