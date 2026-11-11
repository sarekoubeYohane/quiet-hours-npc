// Diagnostic against the loopback preview only. Never calls a real model.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5190',owner='dice-diagnostic',scope='account-operations:'+owner;
async function request(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:'qh_local_owner='+owner,Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;}
const settings=await request('/api/model-settings?accountScope='+scope);
await request('/api/model-settings',{accountScope:scope,version:settings.version,mode:'custom',models:{npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}}});
await request('/api/world?workspace=account',{operation:'set-model-key',mode:'openai',key:'local-mock-key',operationScope:scope});
const context=await request('/api/world?workspace=account&operationScope='+scope),results=[];
for(let n=0;n<3;n++){
 const fields={name:'隨機檢查'+n,appearance:'戴眼鏡',personality:'安靜',abilities:'沒有特殊設定',background:'河畔長大',initialMemories:'記得老屋',beliefs:'重視承諾',preferences:'喜歡散步',directions:'適應新生活',startLocation:''};
 const {draft}=await request('/api/character-drafts',{id:crypto.randomUUID(),version:0,concept:'',fields,accountScope:scope});
 const formed=await request('/api/character-drafts/form',{id:draft.id,version:draft.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:scope,worldContext:context.world.contextId});
 const f=formed.draft.formation;results.push({values:f.values,capacity:f.capacity,needTraits:f.needTraits});
}
console.log(JSON.stringify(results,null,2));
assert.ok(results.some(result=>Object.values(result.values).some(value=>value!==12)||result.capacity!==70||Object.values(result.needTraits).some(value=>value!==1)),'Preview still reproduces the fixed all-four dice signature in every character');
