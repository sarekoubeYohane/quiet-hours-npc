import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startApp} from '../tooling/verification/real-route-runtime.mjs';
import {formCharacterCard} from '../tooling/verification/opening-journey.mjs';
const operationId=()=>Date.now()+':'+crypto.randomUUID();
async function journey(app,owner='a'){
 const request=async(path,body)=>{const response=await fetch(app.url+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'qh_local_owner='+owner,Origin:app.url,'Content-Type':'application/json','X-World-Time-Policy':'round-v1'},body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();let value;try{value=JSON.parse(text);}catch{value={error:text.slice(0,200)}}return {status:response.status,body:value};};
 const ok=async(path,body)=>{const result=await request(path,body);assert.ok(result.status>=200&&result.status<300,JSON.stringify(result));return result.body;};
 const accountScope='account-operations:'+owner;
 await ok('/api/model-settings',{accountScope,version:0,mode:'custom',models:{npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}}});
 const scope=await ok('/api/world?workspace=account&accountScope='+encodeURIComponent(accountScope));await ok('/api/world?workspace=account',{operation:'set-model-key',mode:'openai',key:'controlled-only',operationScope:scope.operationScope});
 await ok('/api/world?workspace=account',{operationId:operationId(),operation:'set-budget',mode:'demo',operationScope:scope.operationScope,worldContext:scope.world.contextId,limits:{calls:null,tokens:null}});
 const card=await formCharacterCard(request);
 const scene=(await ok('/api/scene-templates',{accountScope,id:crypto.randomUUID(),version:0,name:'工房',note:'',rooms:[{id:'front',name:'工作間'}],objects:[],connections:[]})).template;
 const body={name:'AI配置世界',step:3,description:'在工房生活，增加一張桌子',city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:'家'}],characters:[{templateId:card.id,version:card.version,placeId:'',roomId:''}]}};
 const draft=(await ok('/api/opening-drafts',{operationScope:owner,id:crypto.randomUUID(),version:0,body})).draft;
 return {request,ok,card,scene,draft,scope,owner};
}
function proposal(input){return {characters:input.city.characters.map(actor=>({templateId:actor.templateId,placeId:'home',roomId:'front',homeId:'home',homeRoomId:null,workplaceIds:[],ownedPlaceIds:[]})),backgroundPeople:[],relationships:[],accessGrants:[],finalization:{spaces:[{placeId:'home',rooms:[],objects:[{id:'table',roomId:'front',name:'木桌',state:[{key:'condition',value:'良好'}],hidden:false}],connections:[]}],walks:[]}};}
test('explicit AI arrangement uses frozen selected sources, stays a proposal, then adopts into the same confirmed and saved opening',async()=>{
 let captured;const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);if(input.task==='character-card-assessment-v1')return {bonuses:[]};captured=input;return proposal(input);}});
 try{
  const j=await journey(app),op=operationId();
  const reply=await j.ok('/api/opening-drafts/arrange',{operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:op,worldContext:j.scope.world.contextId});
  assert.equal(reply.arrangement.state,'complete');assert.equal(captured.task,'opening-arrangement-v1');assert.equal(captured.cards[0].id,j.card.id);assert.equal(captured.scenes[0].id,j.scene.id);assert.deepEqual(reply.draft.body.city,j.draft.body.city,'model cannot silently adopt');
  const adopted=await j.ok('/api/opening-drafts/arrange',{operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:op,action:'adopt',proposalVersion:reply.arrangement.version,city:reply.arrangement.city});
  assert.equal(adopted.draft.body.city.characters[0].placeId,'home');assert.equal(adopted.world.objects.find(object=>object.label==='木桌').state.condition,'良好');
  const saved=await j.ok('/api/saves',{operationScope:'a',id:crypto.randomUUID(),draftId:j.draft.id,draftVersion:adopted.draft.version});assert.equal(saved.world.turn,0);assert.deepEqual(saved.world.characters[0].attributes.values,j.card.values);assert.equal(saved.world.objects.find(object=>object.label==='木桌').state.condition,'良好');
  assert.equal(app.modelRequests.length,2);assert.deepEqual((await j.ok('/api/character-cards?accountScope=account-operations%3Aa')).cards[0],j.card);
 }finally{await app.close();}
});

test('proposal edits are durable and versioned before adoption, and invalid proposals cannot bypass manual confirmation',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task==='character-card-assessment-v1'?{bonuses:[]}:proposal(input);}});
 try{
  const j=await journey(app),op=operationId(),base={operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:op};
  const reply=await j.ok('/api/opening-drafts/arrange',{...base,worldContext:j.scope.world.contextId});const city=structuredClone(reply.arrangement.city);city.finalization.spaces[0].objects[0].name='使用者修改的圓桌';
  const edited=await j.ok('/api/opening-drafts/arrange',{...base,action:'edit',proposalVersion:reply.arrangement.version??0,city});
  assert.equal(edited.arrangement.city.finalization.spaces[0].objects[0].name,'使用者修改的圓桌');assert.equal(edited.arrangement.version,1);assert.deepEqual(edited.draft.body.city,j.draft.body.city);
  const reloaded=await j.ok('/api/opening-drafts?id='+j.draft.id+'&operationScope=a');assert.deepEqual(reloaded.arrangement,edited.arrangement);
  assert.equal((await j.request('/api/opening-drafts/arrange',{...base,action:'edit',proposalVersion:0,city:{...city,backgroundPeople:[{id:'late',name:'另一頁新輸入'}]}})).status,409);
  const invalid=structuredClone(city);invalid.characters[0].roomId='missing';const bad=await j.ok('/api/opening-drafts/arrange',{...base,action:'edit',proposalVersion:1,city:invalid});assert.ok(bad.arrangement.preview.issues.length);
  assert.equal((await j.request('/api/opening-drafts/arrange',{...base,action:'adopt',proposalVersion:2,city:invalid})).status,422);
  const fixed=await j.ok('/api/opening-drafts/arrange',{...base,action:'edit',proposalVersion:2,city});const adopted=await j.ok('/api/opening-drafts/arrange',{...base,action:'adopt',proposalVersion:fixed.arrangement.version,city});assert.equal(adopted.world.objects.find(object=>object.label==='使用者修改的圓桌').label,'使用者修改的圓桌');assert.equal(app.modelRequests.length,2);
 }finally{await app.close();}
});

test('slow arrangement and original operation recovery stay on the original draft/account, with concurrent writes and duplicates blocked',async()=>{
 let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:async request=>{const input=JSON.parse(request.messages.at(-1).content);if(input.task==='character-card-assessment-v1')return {bonuses:[]};enter();await gate;return proposal(input);}});
 try{
  const j=await journey(app),op=operationId(),payload={operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:op,worldContext:j.scope.world.contextId};const pending=j.request('/api/opening-drafts/arrange',payload);await entered;
  const before=await j.ok('/api/opening-drafts?id='+j.draft.id+'&operationScope=a');assert.equal(before.arrangement.state,'pending');assert.deepEqual(before.draft.body,j.draft.body);
  assert.equal((await j.request('/api/opening-drafts',{operationScope:'a',id:j.draft.id,version:j.draft.version,body:{...j.draft.body,name:'另一頁晚到修改'}})).status,409);
  assert.equal((await j.request('/api/opening-drafts/arrange',{...payload,operationId:operationId()})).status,409);
  const foreign=await fetch(app.url+'/api/opening-drafts/arrange',{method:'POST',headers:{Cookie:'qh_local_owner=b',Origin:app.url,'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(foreign.status,409);
  const foreignRead=await fetch(app.url+'/api/opening-drafts?id='+j.draft.id+'&operationScope=a',{headers:{Cookie:'qh_local_owner=b'}});assert.equal(foreignRead.status,409);
  release();assert.equal((await pending).status,200);const count=app.modelRequests.length;const replay=await j.ok('/api/opening-drafts/arrange',payload);assert.equal(replay.arrangement.state,'complete');assert.equal(app.modelRequests.length,count);assert.equal(count,2);
  const newBody={...j.draft.body,name:'完成後明示修改',description:'完成後明示更新開局描述'};const changed=await j.ok('/api/opening-drafts',{operationScope:'a',id:j.draft.id,version:j.draft.version,body:newBody});
  assert.equal((await j.request('/api/opening-drafts/arrange',{operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:op,proposalVersion:0,action:'adopt',city:replay.arrangement.city})).status,409);assert.equal(changed.draft.body.name,'完成後明示修改');
 }finally{release?.();await app.close();}
});

test('frozen source versions and explicit choices survive AI contradictions, reload and live source changes',async()=>{
 let inputSeen;const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);if(input.task==='character-card-assessment-v1')return {bonuses:[]};inputSeen=input;const answer=proposal(input);answer.characters[0].placeId='other';answer.characters[0].roomId='wrong';answer.characters[0].homeId='other';answer.characters[0].workplaceIds=['other'];answer.characters[0].ownedPlaceIds=['other'];answer.relationships=[{from:input.city.characters[0].templateId,to:'friend',targetType:'background',description:'AI不應覆寫'}];return answer;}});
 try{
  const j=await journey(app),cardId=j.card.id;const city={...j.draft.body.city,characters:[{...j.draft.body.city.characters[0],placeId:'home',roomId:'front',homeId:'home',workplaceIds:['home'],ownedPlaceIds:['home'],openingNeeds:{hunger:30,thirst:20,fatigue:15,sleep:20},mentalOpening:{current:30}}],backgroundPeople:[{id:'friend',name:'手填友人'}],relationships:[{from:cardId,to:'friend',targetType:'background',description:'手填舊識'}],accessGrants:[{placeId:'home',characterTemplateId:cardId}]};
  const drafted=(await j.ok('/api/opening-drafts',{operationScope:'a',id:j.draft.id,version:j.draft.version,body:{...j.draft.body,city}})).draft;
  await j.ok('/api/scene-templates',{accountScope:'account-operations:a',id:j.scene.id,version:1,name:'來源已更新',note:'',rooms:[{id:'newroom',name:'新版房間'}],objects:[],connections:[]});
  const op=operationId(),payload={operationScope:'a',id:drafted.id,version:drafted.version,operationId:op,worldContext:j.scope.world.contextId};const result=await j.ok('/api/opening-drafts/arrange',payload);
  assert.equal(inputSeen.scenes[0].version,1);assert.equal(inputSeen.scenes[0].name,'工房');assert.deepEqual(result.arrangement.city.characters[0],city.characters[0]);assert.equal(result.arrangement.city.relationships[0].description,'手填舊識');
  const read=await j.ok('/api/opening-drafts?id='+drafted.id+'&operationScope=a');assert.deepEqual(read.arrangement,result.arrangement);assert.equal(app.modelRequests.length,2);
  const adopted=await j.ok('/api/opening-drafts/arrange',{operationScope:'a',id:drafted.id,version:drafted.version,operationId:op,proposalVersion:0,action:'adopt',city:result.arrangement.city});assert.equal(adopted.world.characters[0].mentalEnergy.value,30);assert.equal(adopted.world.characters[0].needs.values.hunger,30);
  assert.equal((await j.ok('/api/scene-templates?accountScope=account-operations%3Aa')).templates.find(scene=>scene.id===j.scene.id).version,2);
 }finally{await app.close();}
});

test('a malformed settled model result preserves the draft, accounts one attempt and never retries that operation automatically',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task==='character-card-assessment-v1'?{bonuses:[]}:{dice:100,world:{}};}});
 try{
  const j=await journey(app),payload={operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:operationId(),worldContext:j.scope.world.contextId};const failed=await j.request('/api/opening-drafts/arrange',payload);assert.equal(failed.status,502);assert.equal(failed.body.arrangement.state,'failed');assert.deepEqual(failed.body.draft.body,j.draft.body);assert.equal(app.modelRequests.length,2);
  const repeated=await j.ok('/api/opening-drafts/arrange',payload);assert.equal(repeated.arrangement.state,'failed');assert.equal(app.modelRequests.length,2);
  const scope=await j.ok('/api/world?workspace=account&accountScope=account-operations%3Aa');assert.equal(scope.accountPlayer.usage.totalCalls,2);assert.equal((await j.ok('/api/saves')).saves.length,0);
 }finally{await app.close();}
});

test('missing account model key stops before dispatch, preserves input and only a new explicit operation runs after settings are saved',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task==='character-card-assessment-v1'?{bonuses:[]}:proposal(input);}});
 try{
  const j=await journey(app);await j.ok('/api/world?workspace=account',{operation:'clear-model-key',operationScope:j.scope.operationScope,mode:'openai'});
  const input={operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:operationId(),worldContext:j.scope.world.contextId};const failed=await j.request('/api/opening-drafts/arrange',input);assert.equal(failed.status,400);assert.equal(failed.body.modelSettingsRequired,true);assert.deepEqual(failed.body.draft.body,j.draft.body);assert.equal(app.modelRequests.length,1);
  await j.ok('/api/world?workspace=account',{operation:'set-model-key',operationScope:j.scope.operationScope,mode:'openai',key:'controlled-restored'});assert.equal(app.modelRequests.length,1);
  assert.equal((await j.ok('/api/opening-drafts/arrange',input)).arrangement.state,'failed');assert.equal(app.modelRequests.length,1);
  assert.equal((await j.ok('/api/opening-drafts/arrange',{...input,operationId:operationId()})).arrangement.state,'complete');assert.equal(app.modelRequests.length,2);
 }finally{await app.close();}
});

test('closing and reopening the disk database restores the saved suggestion and original operation without model or dice',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ai-opening-'));const databasePath=join(directory,'acceptance.sqlite');let app=await startApp({databasePath,diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task==='character-card-assessment-v1'?{bonuses:[]}:proposal(input);}});
 try{
  const j=await journey(app),input={operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:operationId(),worldContext:j.scope.world.contextId};const original=await j.ok('/api/opening-drafts/arrange',input);await app.close();app=await startApp({databasePath,diceFaces:[],modelResponder:()=>{throw Error('read/replay must not dispatch');}});
  const read=await fetch(app.url+'/api/opening-drafts?id='+j.draft.id+'&operationScope=a',{headers:{Cookie:'qh_local_owner=a'}});const stored=await read.json();assert.equal(read.status,200);assert.deepEqual(stored.arrangement,original.arrangement);
  const replay=await fetch(app.url+'/api/opening-drafts/arrange',{method:'POST',headers:{Cookie:'qh_local_owner=a',Origin:app.url,'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(replay.status,200);assert.deepEqual((await replay.json()).arrangement,original.arrangement);assert.equal(app.modelRequests.length,0);
 }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});

test('actual SQLite adoption failure before a write preserves both draft and proposal, then the original request recovers exactly once',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task==='character-card-assessment-v1'?{bonuses:[]}:proposal(input);}});let db;
 try{
  const j=await journey(app),base={operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:operationId()};const result=await j.ok('/api/opening-drafts/arrange',{...base,worldContext:j.scope.world.contextId});const input={...base,action:'adopt',proposalVersion:result.arrangement.version,city:result.arrangement.city};
  db=new DatabaseSync(app.sqlitePath);db.exec("CREATE TRIGGER controlled_adoption_failure BEFORE UPDATE ON opening_drafts BEGIN SELECT RAISE(ABORT,'controlled storage failure before adoption write'); END");
  assert.equal((await j.request('/api/opening-drafts/arrange',input)).status,503);const unchanged=await j.ok('/api/opening-drafts?id='+j.draft.id+'&operationScope=a');assert.deepEqual(unchanged.draft.body,j.draft.body);assert.equal(unchanged.arrangement.state,'complete');assert.equal((await j.ok('/api/saves')).saves.length,0);db.exec('DROP TRIGGER controlled_adoption_failure');
  const adopted=await j.ok('/api/opening-drafts/arrange',input),replayed=await j.ok('/api/opening-drafts/arrange',input);assert.deepEqual(replayed.draft,adopted.draft);assert.equal(replayed.arrangement.state,'adopted');assert.equal(app.modelRequests.length,2);
 }finally{db?.close();await app.close();}
});

test('a later failed request keeps the prior saved proposal accessible, and step or name changes do not require paying to regenerate it',async()=>{
 let fail=false;const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task==='character-card-assessment-v1'?{bonuses:[]}:fail?{invalid:true}:proposal(input);}});
 try{
  const j=await journey(app),firstOp=operationId(),base={operationScope:'a',id:j.draft.id,version:j.draft.version,worldContext:j.scope.world.contextId};const first=await j.ok('/api/opening-drafts/arrange',{...base,operationId:firstOp});
  fail=true;assert.equal((await j.request('/api/opening-drafts/arrange',{...base,operationId:operationId()})).status,502);
  const loaded=await j.ok('/api/opening-drafts?id='+j.draft.id+'&operationScope=a');assert.deepEqual(loaded.previousArrangement.city,first.arrangement.city);assert.equal(loaded.previousArrangement.operationId,firstOp);
  const stepped=await j.ok('/api/opening-drafts',{operationScope:'a',id:j.draft.id,version:j.draft.version,body:{...j.draft.body,name:'改名保留建議',step:4}});
  const adopted=await j.ok('/api/opening-drafts/arrange',{operationScope:'a',id:j.draft.id,version:stepped.draft.version,operationId:firstOp,proposalVersion:first.arrangement.version,action:'adopt',city:first.arrangement.city});assert.equal(adopted.draft.body.name,'改名保留建議');assert.equal(adopted.world.objects.some(object=>object.label==='木桌'),true);assert.equal(app.modelRequests.length,3);
 }finally{await app.close();}
});
