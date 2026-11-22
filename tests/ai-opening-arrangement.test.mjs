import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startApp} from '../tooling/verification/real-route-runtime.mjs';
import {formCharacterCard} from '../tooling/verification/opening-journey.mjs';
const operationId=()=>Date.now()+':'+crypto.randomUUID();
function requester(app,owner='a'){
 return async(path,body)=>{const response=await fetch(app.url+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'qh_local_owner='+owner,Origin:app.url,'Content-Type':'application/json','X-World-Time-Policy':'round-v1'},body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();let value;try{value=JSON.parse(text);}catch{value={error:text.slice(0,200)}}return {status:response.status,body:value};};
}
async function journey(app,owner='a'){
 const request=requester(app,owner);
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
  assert.equal(app.modelRequests.length,2);assert.deepEqual((await j.ok('/api/character-cards?accountScope=account-operations%3Aa')).cards.find(card=>card.id===j.card.id),j.card);
 }finally{await app.close();}
});

test('開局配給與逐房配物可分次核對，兩者在第 0 回合各保存一次',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  if(input.contractVersion==='opening-resources.v1'){
   assert.equal(input.request,'準備兩份飲水');
   return {supplies:[{kind:'water',label:'瓶裝飲水',region:input.actors[0].region,portions:2,responsible:'world',allowedTo:[input.actors[0].id],reason:'場所管理者提供給住戶'}],furnishingGrants:[],unavailable:[]};
  }
  return proposal(input);
 }});
 try{
  const j=await journey(app),city=structuredClone(j.draft.body.city);
  Object.assign(city.characters[0],{placeId:'home',roomId:'front',homeId:'home'});
  const scope={operationScope:'a',id:j.draft.id};
  let {draft}=await j.ok('/api/opening-drafts',{...scope,version:j.draft.version,body:{...j.draft.body,city}});
  const generate=(work)=>j.ok('/api/opening-drafts/arrange',{...scope,version:draft.version,operationId:operationId(),worldContext:j.scope.world.contextId,...work});
  let {arrangement}=await generate({purpose:'resources',resourceRequest:'準備兩份飲水'});
  const act=(action,fields)=>j.ok('/api/opening-drafts/arrange',{...scope,version:draft.version,operationId:arrangement.operationId,proposalVersion:arrangement.version,action,...fields});
  assert.equal(arrangement.city.resourcePlan.supplies[0].portions,2);
  assert.equal(draft.body.city.resourcePlan,undefined);
  ({draft}=await act('adopt',{city:arrangement.city}));
  ({arrangement}=await generate({supplyRooms:true,recommendRoads:false}));
  const edited=structuredClone(arrangement.city);
  edited.resourcePlan.supplies[0].portions=3;
  ({arrangement}=await act('edit',{city:edited}));
  ({draft,arrangement}=await act('adoptItems',{excludedItems:[]}));
  assert.equal(draft.body.city.resourcePlan.supplies[0].portions,2);
  ({draft}=await act('adopt',{city:arrangement.city}));
  const saved=await j.ok('/api/saves',{operationScope:'a',id:crypto.randomUUID(),draftId:draft.id,draftVersion:draft.version});
  assert.equal(saved.world.turn,0);
  assert.deepEqual(saved.world.supplies.filter(row=>row.label==='瓶裝飲水').map(row=>row.remaining),[3]);
  assert.equal(saved.world.objects.filter(row=>row.label==='木桌').length,1);
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


test('adoption receipt failure rolls back the draft, then the original operation recovers across disk reopen without another model or die',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'adoption-atomic-')),databasePath=join(directory,'acceptance.sqlite');
 let app=await startApp({databasePath,diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task==='character-card-assessment-v1'?{bonuses:[]}:proposal(input);}}),db;
 try{
  const j=await journey(app),base={operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:operationId()},suggested=await j.ok('/api/opening-drafts/arrange',{...base,worldContext:j.scope.world.contextId});
  const input={...base,action:'adopt',proposalVersion:suggested.arrangement.version,city:suggested.arrangement.city};
  db=new DatabaseSync(databasePath);const draftBefore=db.prepare('SELECT * FROM opening_drafts WHERE owner=? AND id=?').get('a',j.draft.id),proposalBefore=db.prepare('SELECT * FROM opening_arrangements WHERE owner=? AND draft_id=?').get('a',j.draft.id);
  db.exec("CREATE TRIGGER controlled_receipt_failure BEFORE UPDATE ON opening_arrangements WHEN NEW.state='adopted' BEGIN SELECT RAISE(ABORT,'controlled second write failure'); END");
  const failed=await j.request('/api/opening-drafts/arrange',input);assert.equal(failed.status,503);assert.equal(failed.body.operationUncertain,true);
  assert.deepEqual(db.prepare('SELECT * FROM opening_drafts WHERE owner=? AND id=?').get('a',j.draft.id),draftBefore);assert.deepEqual(db.prepare('SELECT * FROM opening_arrangements WHERE owner=? AND draft_id=?').get('a',j.draft.id),proposalBefore);assert.equal(app.modelRequests.length,2);
  db.exec('DROP TRIGGER controlled_receipt_failure');db.close();db=undefined;await app.close();
  app=await startApp({databasePath,diceFaces:[],modelResponder:()=>{throw Error('adoption recovery must not dispatch');}});const request=requester(app);
  const retried=await request('/api/opening-drafts/arrange',input);assert.equal(retried.status,200,JSON.stringify(retried.body));assert.equal(retried.body.draft.version,base.version+1);assert.equal(retried.body.arrangement.state,'adopted');assert.deepEqual(retried.body.draft.body.city,input.city);
  // Close/reopen after a committed adoption, then recover exactly that receipt.
  // The browser journey separately aborts a real committed HTTP response.
  await app.close();app=await startApp({databasePath,diceFaces:[],modelResponder:()=>{throw Error('committed replay must not dispatch');}});
  const replay=await requester(app)('/api/opening-drafts/arrange',input);assert.equal(replay.status,200,JSON.stringify(replay.body));assert.deepEqual(replay.body.draft,retried.body.draft);assert.deepEqual(replay.body.arrangement,retried.body.arrangement);assert.equal(app.modelRequests.length,0);
  db=new DatabaseSync(databasePath);assert.equal(db.prepare('SELECT version FROM opening_drafts WHERE owner=? AND id=?').get('a',j.draft.id).version,base.version+1);assert.equal(db.prepare('SELECT state FROM opening_arrangements WHERE owner=? AND draft_id=?').get('a',j.draft.id).state,'adopted');
 }finally{db?.close();await app.close();await rm(directory,{recursive:true,force:true});}
});

test('adoption uses the saved proposal revision and duplicate concurrent requests commit one draft revision',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task==='character-card-assessment-v1'?{bonuses:[]}:proposal(input);}});let db;
 try{
  const j=await journey(app),base={operationScope:'a',id:j.draft.id,version:j.draft.version,operationId:operationId()},result=await j.ok('/api/opening-drafts/arrange',{...base,worldContext:j.scope.world.contextId});
  const old={...base,action:'adopt',proposalVersion:result.arrangement.version,city:result.arrangement.city},city=structuredClone(result.arrangement.city);city.finalization.spaces[0].objects[0].name='原使用者核對的圓桌';
  const edited=await j.ok('/api/opening-drafts/arrange',{...base,action:'edit',proposalVersion:result.arrangement.version,city});db=new DatabaseSync(app.sqlitePath);const draftBefore=db.prepare('SELECT * FROM opening_drafts WHERE owner=? AND id=?').get('a',j.draft.id),proposalBefore=db.prepare('SELECT * FROM opening_arrangements WHERE owner=? AND draft_id=?').get('a',j.draft.id);
  assert.equal((await j.request('/api/opening-drafts/arrange',old)).status,409);assert.deepEqual(db.prepare('SELECT * FROM opening_drafts WHERE owner=? AND id=?').get('a',j.draft.id),draftBefore);assert.deepEqual(db.prepare('SELECT * FROM opening_arrangements WHERE owner=? AND draft_id=?').get('a',j.draft.id),proposalBefore);
  const input={...base,action:'adopt',proposalVersion:edited.arrangement.version,city};const replies=await Promise.all([j.request('/api/opening-drafts/arrange',input),j.request('/api/opening-drafts/arrange',input)]);for(const response of replies){assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.draft.version,base.version+1);assert.equal(response.body.arrangement.state,'adopted');}
  assert.equal(db.prepare('SELECT version FROM opening_drafts WHERE owner=? AND id=?').get('a',j.draft.id).version,base.version+1);assert.equal(app.modelRequests.length,2);
 }finally{db?.close();await app.close();}
});

test('road suggestions identify disconnected places and allow independent adoption after the player connects or isolates them', async () => {
 let seen;
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  seen=input;
  const answer=proposal(input);
  answer.finalization.walks=[{places:['cafe','vera'],minutes:7}];
  return answer;
 }});
 try {
  const j=await journey(app);
  const places=['home','kris','cafe','vera'].map((id,i)=>({...j.draft.body.city.places[0],id,name:['住宅','Kris 的住處','街角咖啡館','Vera 的房間'][i]}));
  const manual={places:['home','kris'],minutes:5};
  const city={...j.draft.body.city,places,finalization:{spaces:[],walks:[manual,{places:['home','cafe'],minutes:null}]}};
  const draft=(await j.ok('/api/opening-drafts',{id:j.draft.id,version:j.draft.version,operationScope:'a',body:{...j.draft.body,description:'',city}})).draft;
  const base={id:draft.id,operationId:operationId(),version:draft.version,operationScope:'a'};
  const arranged=await j.ok('/api/opening-drafts/arrange',{...base,recommendRoads:true,worldContext:j.scope.world.contextId});
  assert.equal(seen.recommendRoads,true);
  assert.deepEqual(arranged.draft.body.city,city);
  const proposalCity=arranged.arrangement.city;
  const action={...base,city:proposalCity,action:'adoptRoads',proposalVersion:arranged.arrangement.version};
  const blocked=await j.request('/api/opening-drafts/arrange',action);
  assert.equal(blocked.status,422);
  for(const place of places)assert.ok(blocked.body.error.includes(place.name),blocked.body.error);
  proposalCity.finalization.walks=[manual,{places:['home','cafe'],minutes:9}];
  proposalCity.isolatedPlaceIds=['vera'];
  const edited=await j.ok('/api/opening-drafts/arrange',{...action,action:'edit'});
  const adopt={...action,proposalVersion:edited.arrangement.version};
  const adopted=await j.ok('/api/opening-drafts/arrange',adopt);
  const reopened=await j.ok('/api/opening-drafts?id='+draft.id+'&operationScope=a');
  assert.deepEqual(reopened.draft.body.city.finalization.walks,proposalCity.finalization.walks);
  assert.deepEqual(reopened.draft.body.city.isolatedPlaceIds,['vera']);
  assert.deepEqual(reopened.draft.body.city.characters,city.characters);
  assert.deepEqual(reopened.draft.body.city.finalization.spaces,[]);
  assert.equal(reopened.arrangement.state,'complete');
  assert.ok(reopened.arrangement.receipts.roads);
  assert.equal((await j.ok('/api/opening-drafts/arrange',adopt)).draft.version,adopted.draft.version);
  const noRoads=await j.ok('/api/opening-drafts/arrange',{...base,operationId:operationId(),version:adopted.draft.version,worldContext:j.scope.world.contextId,recommendRoads:false});
  assert.equal(seen.recommendRoads,false);
  assert.deepEqual(noRoads.arrangement.city.finalization.walks,proposalCity.finalization.walks);
 } finally {await app.close();}
});

test('AI may move a prefilled start, while a player choice after preview survives adoption and reopening',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  const reply=proposal(input);
  reply.characters[0].placeId='second';
  return reply;
 }});
 try{
  const j=await journey(app), original=j.draft.body.city;
  const city={...original,places:[...original.places,{...original.places[0],id:'second',name:'同格局工房'}],characters:[{...original.characters[0],placeId:'home',roomId:'front',placeOrigin:'system',roomOrigin:'system'}]};
  const save=(version,city)=>j.ok('/api/opening-drafts',{operationScope:'a',id:j.draft.id,version,body:{...j.draft.body,city}});
  const {draft}=await save(j.draft.version,city);
  const base={operationScope:'a',id:draft.id,operationId:operationId()};
  const result=await j.ok('/api/opening-drafts/arrange',{...base,version:draft.version,worldContext:j.scope.world.contextId});
  assert.equal(result.draft.body.city.characters[0].placeId,'home');
  assert.equal(result.arrangement.city.characters[0].placeId,'second');
  const manual={...city,characters:[{...city.characters[0],roomOrigin:'player'}]};
  const latest=await save(draft.version,manual);
  await j.ok('/api/opening-drafts/arrange',{...base,version:latest.draft.version,action:'adopt',proposalVersion:result.arrangement.version,city:result.arrangement.city});
  const reopened=await j.ok('/api/opening-drafts?id='+draft.id+'&operationScope=a');
  assert.deepEqual([reopened.draft.body.city.characters[0].placeId,reopened.draft.body.city.characters[0].roomId,reopened.draft.body.city.characters[0].roomOrigin],['home','front','player']);
 }finally{await app.close();}
});

test('a road repair keeps pending proposals and manual setup and offers only bridges between disconnected groups', async()=>{
 let repairInput;
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  if(input.task==='opening-road-repair-v1'){
   repairInput=input;
   return {walks:[{places:['home','kris'],minutes:89},{places:['vera','cafe'],minutes:1},{places:['kris','cafe'],minutes:10},{places:['home','cafe'],minutes:11}]};
  }
  return proposal(input);
 }});
 try{
  const j=await journey(app);
  const places=['home','kris','cafe','vera'].map(id=>({...j.draft.body.city.places[0],id,name:id}));
  const manual={places:['home','kris'],minutes:6}, shoe={id:'shoe',roomId:'front',name:'鞋櫃',state:{}};
  const city={...j.draft.body.city,places,isolatedPlaceIds:['vera'],characters:j.draft.body.city.characters.map(person=>({...person,placeId:'home',roomId:'front'})),
   finalization:{spaces:[{placeId:'home',rooms:[],connections:[],objects:[shoe]}],walks:[manual]}};
  const draft=(await j.ok('/api/opening-drafts',{operationScope:'a',id:j.draft.id,version:j.draft.version,body:{...j.draft.body,description:'',city}})).draft;
  const base={operationScope:'a',id:draft.id,version:draft.version,worldContext:j.scope.world.contextId};
  const original=await j.ok('/api/opening-drafts/arrange',{...base,operationId:operationId(),recommendRoads:true});
  const request={...base,operationId:operationId(),repairOf:{operationId:original.arrangement.operationId,version:original.arrangement.version}};
  const repaired=await j.ok('/api/opening-drafts/arrange',request);
  assert.deepEqual(repairInput.groups,[['home','kris'],['cafe']]);
  assert.deepEqual(repairInput.isolatedPlaceIds,['vera']);
  assert.deepEqual(repairInput.walks,[manual]);
  assert.deepEqual(repaired.draft.body.city,city);
  const preview=repaired.arrangement.city;
  assert.deepEqual(preview.finalization.walks,[manual,{places:['kris','cafe'],minutes:10}]);
  assert.deepEqual(preview.characters,original.arrangement.city.characters);
  assert.deepEqual(preview.finalization.spaces,original.arrangement.city.finalization.spaces);
  const calls=app.modelRequests.length;
  assert.deepEqual((await j.ok('/api/opening-drafts/arrange',request)).arrangement,repaired.arrangement);
  assert.equal(app.modelRequests.length,calls);
  const action={operationScope:'a',id:draft.id,version:draft.version,operationId:request.operationId};
  preview.finalization.walks[1]={places:['kris','home'],minutes:14};
  const wrong=await j.ok('/api/opening-drafts/arrange',{...action,action:'edit',proposalVersion:repaired.arrangement.version,city:preview});
  const blocked=await j.request('/api/opening-drafts/arrange',{...action,action:'adoptRoads',proposalVersion:wrong.arrangement.version,city:preview});
  assert.equal(blocked.status,422);
  preview.finalization.walks[1]={places:['home','cafe'],minutes:14};
  const fixed=await j.ok('/api/opening-drafts/arrange',{...action,action:'edit',proposalVersion:wrong.arrangement.version,city:preview});
  await j.ok('/api/opening-drafts/arrange',{...action,action:'adoptRoads',proposalVersion:fixed.arrangement.version,city:preview});
  const restored=await j.ok('/api/opening-drafts?id='+draft.id+'&operationScope=a');
  assert.deepEqual(restored.draft.body.city.finalization.walks,[manual,{places:['home','cafe'],minutes:14}]);
  assert.deepEqual(restored.draft.body.city.finalization.spaces[0].objects,[shoe]);
 }finally{await app.close();}
});

test('逐房配物以空白描述預覽各房結果，再採納所選三十一件並接續同一份草稿',async()=>{
 let latest;
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  latest=input;
  const reply=proposal(input),rooms=['front','kitchen','study','hall','storage','entry','bedroom'];
  reply.checkedRooms=rooms.filter(id=>id!=='bedroom').map(roomId=>({placeId:'home',roomId}));
  reply.finalization.spaces[0].objects=[...rooms.slice(0,5).flatMap((roomId,roomIndex)=>
   Array.from({length:[7,7,6,6,6][roomIndex]},(_,index)=>({id:roomId+'-'+index,roomId,name:roomId==='front'&&index===0?'客用桌椅':roomId+'物品'+index,state:[],hidden:false}))),
   {id:'repeat',roomId:'entry',name:'鞋櫃',state:[],hidden:false}];
  return reply;
 }});
 try{
  const j=await journey(app),city=structuredClone(j.draft.body.city);
  city.finalization={walks:[],spaces:[{placeId:'home',connections:[],rooms:['kitchen','study','hall','storage','entry','bedroom'].map(id=>({id,name:id==='entry'?'玄關':id})),
   objects:[{id:'cabinet',roomId:'entry',name:'鞋櫃',state:{}},{id:'umbrella',roomId:'entry',name:'雨傘架',state:{}}]}]};
  const {draft}=await j.ok('/api/opening-drafts',{id:j.draft.id,operationScope:'a',version:j.draft.version,body:{...j.draft.body,description:'',city}});
  const generate=version=>j.ok('/api/opening-drafts/arrange',{operationScope:'a',id:draft.id,operationId:operationId(),worldContext:j.scope.world.contextId,version,supplyRooms:true});
  const first=await generate(draft.version);
  assert.equal(latest.description,'');assert.equal(latest.supplyRooms,true);assert.deepEqual(first.draft.body.city,city);
  const {rooms}=first.arrangement.roomItems;
  assert.equal(rooms.length,7);assert.deepEqual(rooms.find(r=>r.roomId==='entry').existing.map(v=>v.name),['鞋櫃','雨傘架']);
  assert.equal(rooms.find(r=>r.roomId==='entry').checked,true);assert.equal(rooms.find(r=>r.roomId==='entry').suggestedIds.length,0);
  assert.equal(rooms.find(r=>r.roomId==='bedroom').checked,false);
  assert.equal(rooms.reduce((sum,r)=>sum+r.suggestedIds.length,0),32);
  const adopted=await j.ok('/api/opening-drafts/arrange',{operationScope:'a',id:draft.id,operationId:first.arrangement.operationId,version:draft.version,proposalVersion:first.arrangement.version,action:'adoptItems',excludedItems:['home:front-0']});
  assert.equal(adopted.arrangement.state,'complete');
  const reloaded=await j.ok('/api/opening-drafts?id='+draft.id+'&operationScope=a');
  const objects=reloaded.draft.body.city.finalization.spaces[0].objects;
  assert.equal(objects.length,33);assert.equal(objects.some(v=>v.name==='客用桌椅'),false);assert.equal(objects.filter(v=>v.name==='鞋櫃').length,1);
  assert.deepEqual(reloaded.draft.body.city.characters,city.characters);
  const next=await generate(reloaded.draft.version);
  assert.deepEqual(next.arrangement.roomItems.excludedItems,[]);
  assert.deepEqual(next.arrangement.roomItems.rooms.find(r=>r.roomId==='front').suggestedIds,['front-0']);
 }finally{await app.close();}
});

test('同輪新增房間與物品可預覽、勾選並分次或全部採納',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  const reply=proposal(input),space=reply.finalization.spaces[0];
  space.rooms=[{id:'studio',name:'畫室',privateFor:null},{id:'closet',name:'儲物間',privateFor:null}];
  space.objects=[
   {id:'easel',roomId:'studio',name:'畫架',state:[],hidden:false},
   {id:'stool',roomId:'studio',name:'矮凳',state:[],hidden:false},
   {id:'box',roomId:'closet',name:'收納箱',state:[],hidden:false},
   {id:'bench',roomId:'old',name:'長椅',state:[],hidden:false},
   {id:'stray',roomId:'unknown',name:'無房間物品',state:[],hidden:false},
  ];
  reply.checkedRooms=['studio','closet','unknown'].map(roomId=>({placeId:'home',roomId}));
  return reply;
 }});
 try{
  const j=await journey(app);
  for(const path of ['all','items-first','delete-after-items']){
   const city={...j.draft.body.city,finalization:{spaces:[{placeId:'home',rooms:[{id:'old',name:'舊房間'}],objects:[],connections:[]}],walks:[]}};
   let {draft}=await j.ok('/api/opening-drafts',{operationScope:'a',id:crypto.randomUUID(),version:0,body:{...j.draft.body,city}});
   const base={operationScope:'a',id:draft.id,operationId:operationId()};
   let {arrangement}=await j.ok('/api/opening-drafts/arrange',{...base,version:draft.version,supplyRooms:true,worldContext:j.scope.world.contextId});
   const action=(action,extra)=>j.ok('/api/opening-drafts/arrange',{...base,version:draft.version,proposalVersion:arrangement.version,action,...extra});
   const rows=arrangement.roomItems.rooms;
   assert.deepEqual(rows.find(room=>room.roomId==='studio')?.suggestedIds,['easel','stool']);
   assert.deepEqual(rows.find(room=>room.roomId==='studio').existing,[]);
   assert.deepEqual(rows.find(room=>room.roomId==='closet')?.suggestedIds,['box']);
   assert.deepEqual(rows.find(room=>room.roomId==='old')?.suggestedIds,['bench']);
   assert.ok(!rows.some(room=>room.roomId==='unknown'));
   const read=()=>j.ok('/api/opening-drafts?id='+draft.id+'&operationScope=a');
   assert.deepEqual((await read()).draft.body.city,city);
   // Rename the proposed room, then remove an existing room from the live draft.
   const edited=structuredClone(arrangement.city);
   edited.finalization.spaces[0].rooms.find(room=>room.id==='studio').name='版畫室';
   ({arrangement}=await action('edit',{city:edited}));
   assert.equal(arrangement.roomItems.rooms.find(room=>room.roomId==='studio').roomName,'版畫室');
   city.finalization.spaces[0].rooms=[];
   ({draft}=await j.ok('/api/opening-drafts',{operationScope:'a',id:draft.id,version:draft.version,body:{...j.draft.body,city}}));
   const excludedItems=['home:stool','home:box'];
   ({arrangement}=await action('selectItems',{excludedItems}));
   if(path!=='all'){
    await action('adoptItems',{excludedItems});
    ({draft,arrangement}=await read());
    const partial=draft.body.city.finalization.spaces[0];
    assert.deepEqual(partial.rooms,[{id:'studio',name:'版畫室'}]);
    assert.deepEqual(partial.objects.map(item=>[item.roomId,item.id]),[['studio','easel']]);
    assert.deepEqual(arrangement.roomItems.adoptedItemKeys,['home:easel']);
    assert.deepEqual(draft.body.city.characters,j.draft.body.city.characters);
    if(path==='delete-after-items'){
     const manual=structuredClone(draft.body.city);
     manual.finalization.spaces[0].objects=[];
     manual.finalization.spaces[0].rooms=[];
     ({draft}=await j.ok('/api/opening-drafts',{operationScope:'a',id:draft.id,version:draft.version,body:{...draft.body,city:manual}}));
    }
   }
   await action('adopt',{city:arrangement.city});
   const saved=(await read()).draft.body.city.finalization.spaces[0];
   assert.deepEqual(saved.rooms.map(room=>room.id),path==='delete-after-items'?['closet']:['studio','closet']);
   assert.deepEqual(saved.objects.map(item=>[item.roomId,item.id]),path==='delete-after-items'?[]:[['studio','easel']]);
  }
 }finally{await app.close();}
});

test('three starts keep their separate origins across fixed AI suggestions, adoption and reopening two residences',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  const targets=[['east','bedroom'],['west','bedroom'],['west','living']];
  return {characters:input.city.characters.map((actor,i)=>({templateId:actor.templateId,placeId:targets[i][0],roomId:targets[i][1],
   homeId:null,homeRoomId:null,workplaceIds:[],ownedPlaceIds:[]})),backgroundPeople:[],relationships:[],accessGrants:[],finalization:{spaces:[],walks:[]}};
 }});
 try{
  const j=await journey(app);
  const {cards}=await j.ok('/api/character-cards?accountScope=account-operations%3Aa');
  const house=(await j.ok('/api/scene-templates',{accountScope:'account-operations:a',id:crypto.randomUUID(),version:0,
   name:'住宅',note:'',rooms:[{id:'living',name:'客廳'},{id:'bedroom',name:'臥室'}],objects:[],connections:[]})).template;
  const places=['west','east'].map((id,i)=>({id,name:['西住宅','東住宅'][i],templateId:house.id,version:house.version}));
  const actors=cards.slice(0,3).map((c,i)=>({templateId:c.id,version:c.version,placeId:i===2?'east':'west',roomId:i===1?'':'living',
   placeOrigin:i===1?'player':'system',roomOrigin:i===2?'player':'system'}));
  const starts=city=>city.characters.map(c=>[c.placeId,c.roomId]);
  const arrange=async(characters)=>{
   const draft=(await j.ok('/api/opening-drafts',{operationScope:'a',id:crypto.randomUUID(),version:0,body:{...j.draft.body,city:{places,characters}}})).draft;
   const base={operationScope:'a',id:draft.id,version:draft.version,operationId:operationId()};
   const proposed=await j.ok('/api/opening-drafts/arrange',{...base,worldContext:j.scope.world.contextId});
   assert.deepEqual(starts(proposed.draft.body.city),starts(draft.body.city));
   await j.ok('/api/opening-drafts/arrange',{...base,action:'adopt',proposalVersion:proposed.arrangement.version,city:proposed.arrangement.city});
   const reopened=await j.ok('/api/opening-drafts?id='+draft.id+'&operationScope=a');
   return [starts(proposed.arrangement.city),starts(reopened.draft.body.city)];
  };
  const expected=[['east','bedroom'],['west','bedroom'],['east','living']];
  assert.deepEqual(await arrange(actors),[expected,expected]);
  const legacy=actors.map(({templateId,version,placeId})=>({templateId,version,placeId,roomId:'living'}));
  const oldStarts=[['west','living'],['west','living'],['east','living']];
  assert.deepEqual(await arrange(legacy),[oldStarts,oldStarts]);
 }finally{await app.close();}
});

test('分組採納後接續全部採納，保留手選起點、手動物品與取消項目',async()=>{
 let connected=false,repairRequested=false;
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  if(input.task==='opening-road-repair-v1'){
   assert.deepEqual(input.groups,[['home'],['cafe']]);
   return {walks:[{places:['home','cafe'],minutes:14},{places:['cafe','home'],minutes:22}]};
  }
  const suggestion=proposal(input);
  if(repairRequested)for(let i=0;i<30;i++)suggestion.finalization.spaces[0].objects.push({id:'item-'+i,roomId:'front',name:'配物'+i,state:[],hidden:false});
  suggestion.checkedRooms=input.city.places.map(place=>({placeId:place.id,roomId:'front'}));
  suggestion.finalization.spaces[0].objects.push({id:'chair',roomId:'front',name:'取消的椅子',state:[],hidden:false});
  suggestion.finalization.walks=connected?[{places:['home','cafe'],minutes:8}]:[];
  return suggestion;
 }});
 try{
  const j=await journey(app);
  for(const path of ['items-manual','roads','items-repair']){
   connected=path==='roads';repairRequested=path==='items-repair';
   const firstGroup=connected?'adoptRoads':'adoptItems';
   const city=structuredClone(j.draft.body.city);
   city.characters[0]={...city.characters[0],placeId:'home',roomId:'front',placeOrigin:'system',roomOrigin:'system'};
   city.places.push({...city.places[0],id:'cafe',name:'街角咖啡館'});
   const write=(version,city,id)=>j.ok('/api/opening-drafts',{operationScope:'a',id,version,body:{...j.draft.body,description:'',city}});
   let {draft}=await write(0,city,crypto.randomUUID());
   let operation=operationId();const generate={operationScope:'a',id:draft.id,operationId:operation,worldContext:j.scope.world.contextId,version:draft.version,supplyRooms:true,recommendRoads:true};
   let {arrangement}=await j.ok('/api/opening-drafts/arrange',generate);
   const action=(name,extra)=>({operationScope:'a',id:draft.id,operationId:operation,version:draft.version,proposalVersion:arrangement.version,action:name,...extra});
   const excludedItems=['home:chair'];
   ({arrangement}=await j.ok('/api/opening-drafts/arrange',action('selectItems',{excludedItems})));
   if(!connected){
    assert.equal((await j.request('/api/opening-drafts/arrange',action('adoptRoads',{city:arrangement.city}))).status,422);
    assert.equal((await j.request('/api/opening-drafts/arrange',action('adopt',{city:arrangement.city}))).status,422);
   }
   ({draft,arrangement}=await j.ok('/api/opening-drafts/arrange',action(firstGroup,connected?{city:arrangement.city}:{excludedItems})));
   const reloaded=await j.ok('/api/opening-drafts?id='+draft.id+'&operationScope=a');
   assert.deepEqual(reloaded.arrangement.roomItems.excludedItems,excludedItems);
   assert.equal(reloaded.arrangement.state,'complete');
   if(!connected)assert.equal(reloaded.draft.body.city.finalization.walks.length,0);
   else assert.equal(reloaded.draft.body.city.finalization.spaces.length,0);
   const latest=structuredClone(draft.body.city);
   latest.characters[0]={...latest.characters[0],placeId:'cafe',roomId:'front',placeOrigin:'player',roomOrigin:'player'};
   let space=latest.finalization.spaces.find(value=>value.placeId==='home');
   if(!space){space={placeId:'home',rooms:[],objects:[],connections:[]};latest.finalization.spaces.push(space);}
   if(!connected)space.objects[0].name='玩家改名的木桌';
   space.objects.push({id:'vase',name:'手放花瓶',roomId:'front',state:{}});
   if(connected)latest.finalization.walks[0].minutes=15;
   ({draft}=await write(draft.version,latest,draft.id));
   if(repairRequested){
    const repairOf={operationId:operation,version:arrangement.version};
    operation=operationId();
    ({arrangement}=await j.ok('/api/opening-drafts/arrange',{operationScope:'a',id:draft.id,version:draft.version,worldContext:j.scope.world.contextId,operationId:operation,repairOf}));
    assert.ok(arrangement.receipts.items);
    assert.deepEqual(arrangement.roomItems.excludedItems,excludedItems);
    assert.equal(arrangement.city.finalization.walks.length,1);
   }else if(!connected){
    const repaired=structuredClone(arrangement.city);repaired.finalization.walks=[{places:['home','cafe'],minutes:14}];
    ({arrangement}=await j.ok('/api/opening-drafts/arrange',action('edit',{city:repaired})));
   }
   const all=action('adopt',{city:arrangement.city});
   const complete=await j.ok('/api/opening-drafts/arrange',all);
   assert.equal(complete.arrangement.state,'adopted');
   assert.deepEqual((await j.ok('/api/opening-drafts/arrange',all)).draft,complete.draft);
   const saved=(await j.ok('/api/opening-drafts?id='+draft.id+'&operationScope=a')).draft.body.city;
   assert.equal(saved.characters[0].placeId,'cafe');assert.equal(saved.characters[0].roomOrigin,'player');
   assert.deepEqual(saved.finalization.walks,[{places:['home','cafe'],minutes:connected?15:14}]);
   const expectedNames=[connected?'木桌':'玩家改名的木桌','手放花瓶'];
   if(repairRequested)for(let i=0;i<30;i++)expectedNames.push('配物'+i);
   assert.deepEqual(saved.finalization.spaces[0].objects.map(item=>item.name).sort(),expectedNames.sort());
  }
 }finally{await app.close();}
});

test('補路以後來手動刪掉的路段和新增場所為準，同一請求可重送',async()=>{
 let modelInput;
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);
  if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  if(input.task==='opening-road-repair-v1'){modelInput=input;return {walks:[{places:['b','c'],minutes:8},{places:['c','d'],minutes:10}]};}
  return proposal(input);
 }});
 try{
  const j=await journey(app),id=j.draft.id;
  const places=['home','b','c','d'].map(id=>({...j.draft.body.city.places[0],id,name:id}));
  const ab={places:['home','b'],minutes:5},bc={places:['b','c'],minutes:4};
  const city={...j.draft.body.city,places:places.slice(0,3),finalization:{spaces:[],walks:[ab,bc]}};
  const save=(version,city)=>j.ok('/api/opening-drafts',{operationScope:'a',id,version,body:{...j.draft.body,city}});
  const {draft}=await save(j.draft.version,city);
  const base={operationScope:'a',id,worldContext:j.scope.world.contextId};
  const first=await j.ok('/api/opening-drafts/arrange',{...base,operationId:operationId(),version:draft.version,recommendRoads:true});
  const live=(await save(draft.version,{...city,places,finalization:{spaces:[],walks:[ab]}})).draft;
  const request={...base,operationId:operationId(),version:live.version,repairOf:{operationId:first.arrangement.operationId,version:first.arrangement.version}};
  const repair=await j.ok('/api/opening-drafts/arrange',request);
  assert.deepEqual(modelInput.groups,[['home','b'],['c'],['d']]);assert.deepEqual(modelInput.walks,[ab]);
  assert.deepEqual(repair.arrangement.originalRoads.walks,[ab]);
  assert.deepEqual(repair.arrangement.city.places,places);
  assert.deepEqual(repair.draft.body.city,live.body.city);
  const requests=app.modelRequests.length;
  assert.deepEqual((await j.ok('/api/opening-drafts/arrange',request)).arrangement,repair.arrangement);
  assert.equal(app.modelRequests.length,requests);
  const {draft:adopted}=await j.ok('/api/opening-drafts/arrange',{operationScope:'a',id,operationId:request.operationId,version:live.version,proposalVersion:repair.arrangement.version,city:repair.arrangement.city,action:'adoptRoads'});
  assert.deepEqual(adopted.body.city.finalization.walks,[ab,{places:['b','c'],minutes:8},{places:['c','d'],minutes:10}]);
 }finally{await app.close();}
});

test('編輯建議物品的房間後保留勾選，採納收據只記錄當時實際增加的物品',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);if(input.task==='character-card-assessment-v1')return {bonuses:[]};
  const res=proposal(input);res.checkedRooms=[{placeId:'home',roomId:'front'},{placeId:'home',roomId:'entry'}];
  res.finalization.spaces[0].objects.push({id:'chair',name:'椅子',roomId:'front',hidden:false,state:[]},{id:'cup',name:'杯子',roomId:'front',hidden:false,state:[]});return res;
 }});
 try{
  const j=await journey(app),id=j.draft.id,op=operationId();
  const city={...j.draft.body.city,finalization:{spaces:[{placeId:'home',rooms:[{id:'entry',name:'玄關'}],objects:[],connections:[]}],walks:[]}};
  const save=(version,city)=>j.ok('/api/opening-drafts',{operationScope:'a',id,version,body:{...j.draft.body,city}});
  let {draft}=await save(j.draft.version,city);
  const base={operationScope:'a',id,operationId:op};
  let {arrangement}=await j.ok('/api/opening-drafts/arrange',{...base,version:draft.version,supplyRooms:true,worldContext:j.scope.world.contextId});
  const action=(action,input)=>j.ok('/api/opening-drafts/arrange',{...base,version:draft.version,proposalVersion:arrangement.version,action,...input});
  const excludedItems=['home:chair'];
  ({arrangement}=await action('selectItems',{excludedItems}));
  const edited=structuredClone(arrangement.city);
  for(const object of edited.finalization.spaces[0].objects)object.roomId='entry';
  ({arrangement}=await action('edit',{city:edited}));
  assert.deepEqual(arrangement.roomItems.rooms.find(r=>r.roomId==='entry').suggestedIds,['table','chair','cup']);
  assert.deepEqual(arrangement.roomItems.excludedItems,excludedItems);
  city.finalization.spaces[0].objects.push({id:'mine',roomId:'entry',name:'木桌',state:{}});
  ({draft}=await save(draft.version,city));
  const result=await action('adoptItems',{excludedItems});
  assert.deepEqual(result.draft.body.city.finalization.spaces[0].objects.map(o=>o.name),['木桌','杯子']);
  assert.deepEqual(result.arrangement.roomItems.adoptedItemKeys,['home:cup']);
  assert.deepEqual((await j.ok('/api/opening-drafts?id='+id+'&operationScope=a')).arrangement.roomItems.adoptedItemKeys,['home:cup']);
 }finally{await app.close();}
});
