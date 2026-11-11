// Local-only UI fixture, created through the public authoring APIs.
import assert from 'node:assert/strict';
import {formCharacterCard,confirmOpening} from './opening-journey.mjs';
const base='http://127.0.0.1:5194',owner='analysis-qa';
async function request(path,body){
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'qh_local_owner='+owner,Origin:base,'Content-Type':'application/json','X-World-Time-Policy':'round-v1'},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return {status:response.status,body:value};
}
const read=async(path,body)=>(await request(path,body)).body;
assert.deepEqual((await read('/api/saves')).saves,[],'use a fresh isolated QA database');
const settings=await read('/api/model-settings');
await read('/api/model-settings',{accountScope:settings.accountScope,version:0,mode:'custom',models:{npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}}});
const workspace=await read('/api/world?workspace=account');
await read('/api/world?workspace=account',{operationScope:workspace.operationScope,operation:'set-model-key',mode:'openai',key:'local-mock-key'});
const cards=[await formCharacterCard(request,{name:'林澄'}),await formCharacterCard(request,{name:'葉青'})];
const scenes=await read('/api/scene-templates');
const {template:scene}=await read('/api/scene-templates',{accountScope:scenes.accountScope,id:crypto.randomUUID(),version:0,name:'河岸小屋',note:'觀察與分析 UI 驗證',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]});
const {input}=await confirmOpening(request,{name:'河岸生活 · UI 驗證',city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:'河岸小屋'}],characters:cards.map(card=>({templateId:card.id,version:card.version,placeId:'home',roomId:'front'}))}});
console.log(JSON.stringify({entry:'http://localhost:5195/start?account='+owner,observe:'http://localhost:5194/observe?save='+input.id+'&owner='+owner,id:input.id}));
