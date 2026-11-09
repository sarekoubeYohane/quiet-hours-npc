import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startApp} from './real-route-runtime.mjs';
import {formCharacterCard} from './opening-journey.mjs';
const directory=await mkdtemp(join(tmpdir(),'opening-reopen-')),databasePath=join(directory,'world.sqlite'),output=process.env.BROWSER_ARTIFACT_DIR||'/tmp/opening-durable-288';await mkdir(output,{recursive:true});let app;let calls=0;const origins=[];
const start=async()=>{app=await startApp({databasePath,diceFaces:Array(20).fill(4),modelResponder:()=>{calls++;assert.equal(calls,1,'reopen must not repeat assessment');return {bonuses:[]};}});origins.push(app.url);};
const request=async(path,body,owner='a')=>{const response=await fetch(app.url+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'qh_local_owner='+owner,Origin:app.url,'Content-Type':'application/json','X-World-Time-Policy':'round-v1'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
const ok=async(path,body)=>{const result=await request(path,body);assert.ok(result.status>=200&&result.status<300,JSON.stringify(result));return result.body;};
try{
 await start();const commit=app.commit;await ok('/api/model-settings',{version:0,mode:'custom',models:{npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}}});await ok('/api/world?workspace=account',{operation:'set-model-key',mode:'openai',key:'controlled-durable-key'});
 const card=await formCharacterCard(request),scene=(await ok('/api/scene-templates',{id:crypto.randomUUID(),version:0,name:'原始老屋',note:'舊屋的描述',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[{id:'clock',name:'老鐘',roomId:'front',state:{運轉:'停止'}}]})).template;
 const id=crypto.randomUUID(),scope=(await ok('/api/opening-drafts')).operationScope,body={name:'持久原始世界',step:4,description:'最後確認的屋況',city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:'老家'}],characters:[{templateId:card.id,version:card.version,placeId:'home',roomId:'front'}]}};
 const draft=(await ok('/api/opening-drafts',{id,version:0,operationScope:scope,body})).draft,input={id,draftId:id,draftVersion:draft.version,operationScope:scope};
 await ok('/api/scene-templates',{...scene,shared:undefined,version:scene.version,name:'來源後來改成新屋',note:'新的描述',rooms:[{id:'new',name:'新房間'}],objects:[]});
 assert.equal((await request('/api/saves',input)).status,201);await app.close();app=undefined;await start();assert.equal(app.commit,commit);
 const resumed=await request('/api/saves',input);assert.equal(resumed.status,200);assert.equal(resumed.body.world.turn,0);assert.equal(resumed.body.world.configuration.locations[0].note,'舊屋的描述');assert.equal(resumed.body.world.objects[0].label,'老鐘');assert.deepEqual(resumed.body.world.characters[0].attributes.values,card.values);
 const closed=await ok('/api/opening-drafts?id='+id);assert.equal(closed.draft.finalizedSaveId,id);assert.deepEqual(closed.draft.sources,draft.sources);
 const restartId=crypto.randomUUID(),restart=await ok('/api/opening-drafts',{id:restartId,version:0,operationScope:scope,restartSaveId:id});assert.equal(restart.preview.places[0].rooms[0].name,'客廳');assert.equal(restart.world.configuration.locations[0].note,'舊屋的描述');
 const second=await ok('/api/saves',{id:restartId,draftId:restartId,draftVersion:restart.draft.version,operationScope:scope});assert.equal(second.world.turn,0);assert.notEqual(second.world.contextId,resumed.body.world.contextId);assert.equal((await ok('/api/saves')).saves.length,2);assert.equal((await request('/api/world?save='+id,undefined,'b')).status,404);assert.equal(calls,1);
 await writeFile(output+'/evidence.json',JSON.stringify({commit,origins,database:'same isolated disk SQLite actually closed and reopened, all migrations; no installed world',sourceSaveId:id,restartSaveId:restartId,originalAfterSourceUpdate:true,closedDraftRecovered:true,sameCreationReplayed:true,controlledModelCalls:calls,paidCalls:0},null,2));console.log(JSON.stringify({ok:true,output,calls}));
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
