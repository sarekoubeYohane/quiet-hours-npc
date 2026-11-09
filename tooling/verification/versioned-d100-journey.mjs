import assert from 'node:assert/strict';
const fields={name:'時雨',appearance:'35歲，身高175公分',personality:'安靜',abilities:'沒有特殊設定',background:'河畔長大',initialMemories:'記得老屋',beliefs:'重視承諾',preferences:'沒有特殊設定',directions:'修好老鐘',startLocation:''};
const models={npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}};
export const operationId=()=>Date.now()+':'+crypto.randomUUID();
export async function journey(app,owner='d100-a'){
 const request=async(path,body)=>{const response=await fetch(app.url+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'qh_local_owner='+owner,Origin:app.url,'Content-Type':'application/json','X-World-Time-Policy':'round-v1'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const ok=async(path,body)=>{const r=await request(path,body);assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
 const world=save=>ok('/api/world'+(save?'?save='+save:'?workspace=account'));
 const send=async(save,body)=>{const scope=await world(save);return ok('/api/world'+(save?'?save='+save:'?workspace=account'),{operationId:operationId(),mode:'demo',operationScope:scope.operationScope,worldContext:scope.world.contextId,...body});};
 await ok('/api/model-settings',{version:0,mode:'custom',models});await send(null,{operation:'set-budget',limits:{calls:null,tokens:null}});await send(null,{operation:'set-model-key',mode:'openai',key:'controlled-d100-key'});
 async function create({dexterity=12,name='隔離檢定',objects=[]}={}){
  const draft=(await ok('/api/character-drafts',{id:crypto.randomUUID(),version:0,concept:'修鐘的人',fields})).draft;const scope=await world();
  let formed=(await ok('/api/character-drafts/form',{id:draft.id,version:draft.version,operationId:operationId(),operationScope:scope.operationScope,worldContext:scope.world.contextId})).draft;
  const appearance=Math.min(18,24-dexterity);
  const values={strength:36-dexterity-appearance,endurance:12,dexterity,perception:12,appearance};
  formed=(await ok('/api/character-drafts/form',{action:'allocate',id:draft.id,version:formed.version,operationScope:scope.operationScope,values})).draft;
  const card=(await ok('/api/character-cards',{id:draft.id,version:formed.version,operationScope:scope.operationScope})).card;
  const scene=(await ok('/api/scene-templates',{id:crypto.randomUUID(),version:0,name:'工房',note:'',rooms:[{id:'front',name:'工作間'}],connections:[],objects})).template;
  const save=(await ok('/api/saves',{id:crypto.randomUUID(),name,city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:'工房'}],characters:[{templateId:card.id,version:card.version,placeId:'home',roomId:'front'}]}})).save;
  return save.id;
 }
 return {request,ok,world,send,create};
}

export async function advanceCraft(j,save,op=operationId()){let result;for(let step=0;step<4;step++)result=await j.send(save,{operation:'advance',mode:'openai',model:'gpt-6-luna',operationId:step===3?op:operationId(),minutes:5,timeContract:'five-minute-v1'});return result;}
