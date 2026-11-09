import { confirmOpening } from '../tooling/verification/opening-journey.mjs';
import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {characterApiFixture} from './support/character-api-fixture.mjs';
async function fixture(){
 const base=await characterApiFixture(),{context,post}=base,{openings,drafts,form,cards,world,people,scenes,saves,fromTemplate,generation}=base.routes;
  async function createWorld(name,card) {
    assert.ok(card,'New worlds must use the card formed in this product journey');
    const scene=await post(scenes,{id:crypto.randomUUID(),version:0,name:name+'的家',note:'',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]},'/api/scene-templates');assert.equal(scene.status,201);
    const apiRequest=async(path,payload)=>{const route=path==='/api/saves'?saves:openings;if(payload!==undefined)return post(route,payload,path);const response=await route.GET(new Request('https://test.invalid'+path));return {status:response.status,body:await response.json()};};
    const {saved}=await confirmOpening(apiRequest,{name,city:{places:[{id:'home',templateId:scene.body.template.id,version:scene.body.template.version,name:name+'的家'}],characters:[{templateId:card.id,version:card.version,placeId:'home',roomId:'front'}]}});return saved.save.id;
  }
  return {...base,createWorld,source:payload=>post(people,payload,'/api/character-templates'),importTemplate:payload=>post(fromTemplate,{operationScope:'account-operations:'+context.owner,...payload},'/api/character-drafts/from-template'),generate:payload=>post(generation,payload,'/api/character-drafts/generate'),readOperation:async id=>{const r=await world.GET(new Request('https://test.invalid/api/world?workspace=account&operationScope='+encodeURIComponent('account-operations:'+context.owner)+'&operationId='+id));return r.json();},saveDraft:payload=>post(drafts,payload,'/api/character-drafts'),readDrafts:async()=>{const r=await drafts.GET();return {status:r.status,body:await r.json()};},form:payload=>post(form,{operationScope:'account-operations:'+context.owner,...payload},'/api/character-drafts/form'),complete:payload=>post(cards,{operationScope:'account-operations:'+context.owner,...payload},'/api/character-cards'),cards:async()=>{const r=await cards.GET();return {status:r.status,body:await r.json()};}};
}


const fields={name:'孟澄',appearance:'35歲，身高175公分',personality:'安靜',abilities:'沒有特殊設定',background:'河畔長大',initialMemories:'記得外公工作桌',beliefs:'重視承諾',preferences:'沒有特殊設定',directions:'修好老鐘',startLocation:''};
const models={npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}};
async function configure(f){await f.request({version:0,mode:'custom',models});await f.worldRequest({operation:'set-model-key',mode:'openai',key:'controlled-key'});}
async function operation(f,draft){const scope=(await f.worldRequest()).body;return {id:draft.id,version:draft.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:scope.operationScope,worldContext:scope.world.contextId};}
test('forming locks text, rolls once in code, preserves total and capacity, and atomically saves an immutable selectable card',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:JSON.stringify({bonuses:[{target:'strength',source:'concept',quote:'擅長搬重物',substantive:true},{target:'capacity',source:'concept',quote:'處變不驚',substantive:true}]})}}]});};
 try{
  await configure(f);const draft=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'擅長搬重物，處變不驚',fields})).body.draft;
  const input=await operation(f,draft);const formed=await f.form(input);assert.equal(formed.status,200,JSON.stringify(formed.body));
  const value=formed.body.draft.formation;assert.equal(value.version,'character-card-v1');assert.deepEqual(value.values,{strength:14,endurance:12,dexterity:12,perception:12,appearance:12});assert.equal(value.initialTotal,62);assert.equal(value.capacity,80);assert.deepEqual(value.minimums,{strength:8,endurance:3,dexterity:3,perception:3,appearance:3});
  assert.equal(value.private,undefined);assert.equal(calls,1);const dice=f.context.dice;
  const replay=await f.form(input);assert.deepEqual(replay.body,formed.body);assert.equal(f.context.dice,dice);assert.equal(calls,1);
  assert.equal((await f.saveDraft({...formed.body.draft,fields:{...fields,name:'不能改名字'}})).status,409);
  assert.equal((await f.form({action:'allocate',id:draft.id,version:formed.body.draft.version,values:{...value.values,strength:7,endurance:19}})).status,400);
  assert.equal((await f.form({action:'allocate',id:draft.id,version:formed.body.draft.version,values:{...value.values,capacity:81}})).status,400);
  const allocated=await f.form({action:'allocate',id:draft.id,version:formed.body.draft.version,values:{...value.values,strength:13,dexterity:13}});assert.equal(allocated.status,200);assert.equal(allocated.body.draft.formation.capacity,80);
  assert.equal((await f.cards()).body.cards.length,0);
  assert.equal((await f.form({action:'allocate',id:draft.id,version:formed.body.draft.version,values:value.values})).status,409);
  assert.equal((await f.complete({id:draft.id,version:formed.body.draft.version})).status,409);
  const saved=await f.complete({id:draft.id,version:allocated.body.draft.version});assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.card.capacity,80);assert.equal(saved.body.card.values.dexterity,13);
  assert.equal((await f.cards()).body.cards.length,1);assert.deepEqual((await f.complete({id:draft.id,version:allocated.body.draft.version})).body.card,saved.body.card);assert.equal(f.context.dice,dice);assert.equal(calls,1);
  const read=(await f.readDrafts()).body.drafts[0];assert.equal(read.completedCard.id,saved.body.card.id);assert.equal(read.formation.capacity,80);
  f.context.owner='foreign';assert.deepEqual((await f.cards()).body.cards,[]);assert.equal((await f.form(input)).status,409);assert.equal((await f.form({...input,operationScope:'account-operations:foreign'})).status,404);assert.equal((await f.complete({id:draft.id,version:allocated.body.draft.version})).status,409);
 }finally{globalThis.fetch=oldFetch;f.db.close();}
});

test('completed card selection creates independent living state through real city APIs without forming the stable values again',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:'{"bonuses":[]}'}}]});};
 try{
  await configure(f);const draft=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields})).body.draft;
  const formed=await f.form(await operation(f,draft));assert.equal(formed.status,200);
  const card=(await f.complete({id:draft.id,version:formed.body.draft.version})).body.card;
  const dice=f.context.dice;const a=await f.createWorld('第一份生活',card),b=await f.createWorld('第二份生活',card);
  const first=(await f.worldRequest(undefined,a)).body.world,second=(await f.worldRequest(undefined,b)).body.world;
  assert.equal(first.turn,0);assert.equal(second.turn,0);assert.equal(first.characters[0].attributes.version,2);
  assert.deepEqual(first.characters[0].attributes.values,card.values);assert.deepEqual(second.characters[0].attributes.values,card.values);
  assert.equal(first.characters[0].mentalEnergy.policy.maximum,card.capacity);assert.equal(first.characters[0].mentalEnergy.value,49);
  assert.deepEqual(first.characters[0].needs.values,{hunger:20,thirst:20,fatigue:15,sleep:20});assert.deepEqual(first.characters[0].needs.personal.traits,card.needTraits);
  assert.notEqual(first.contextId,second.contextId);assert.equal(f.context.dice,dice);assert.equal(calls,1);
  assert.equal((await f.saveDraft({...formed.body.draft,fields:{...fields,background:'來源後來改動'}})).status,409);
  assert.equal((await f.worldRequest(undefined,a)).body.world.characters[0].profile.background,'河畔長大');
 }finally{globalThis.fetch=oldFetch;f.db.close();}
});

test('formation and completed-card lost replies recover their original stored state and never repeat paid assessment',async()=>{
 for(const fault of ['before','after']) {
  const f=await fixture(),oldFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:'{"bonuses":[]}'}}]});};
  try{
   await configure(f);const draft=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields})).body.draft;const input=await operation(f,draft);
   f.context.formFault=fault;assert.equal((await f.form(input)).status,503);const used=f.context.dice;
   const stored=(await f.readDrafts()).body.drafts[0];assert.equal(!!stored.formation,fault==='after');assert.equal(calls,1);
   const recovered=await f.form(input);assert.equal(recovered.status,200);assert.equal(calls,1);if(fault==='after')assert.equal(f.context.dice,used);else assert.ok(f.context.dice>used);
   const stable=f.context.dice;assert.equal((await f.form(input)).status,200);assert.equal(f.context.dice,stable);
   f.context.batchFault=fault;const complete={id:draft.id,version:recovered.body.draft.version};assert.equal((await f.complete(complete)).status,503);assert.equal((await f.cards()).body.cards.length,fault==='after'?1:0);
   const card=await f.complete(complete);assert.equal(card.status,200);assert.equal((await f.cards()).body.cards.length,1);assert.equal(calls,1);assert.equal(f.context.dice,stable);
  }finally{globalThis.fetch=oldFetch;f.db.close();}
 }
});

test('pending formation rejects concurrent edits and a second operation, and public recovery hides candidate mappings and rolls',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch;let calls=0,input;
 globalThis.fetch=async()=>{calls++;const pending=(await f.readDrafts()).body.drafts[0];assert.ok(pending.pendingFormation);
  assert.equal((await f.saveDraft({...pending,fields:{...pending.fields,name:'晚到改名'}})).status,409);
  assert.equal((await f.form({...input,operationId:Date.now()+':'+crypto.randomUUID()})).status,409);
  return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:JSON.stringify({bonuses:[{target:'strength',source:'concept',quote:'擅長搬重物',substantive:true},{target:'strength',source:'concept',quote:'擅長搬重物',substantive:true}]})}}]});};
 try{
  await configure(f);const draft=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'擅長搬重物',fields})).body.draft;input=await operation(f,draft);const formed=await f.form(input);assert.equal(formed.status,200);assert.equal(formed.body.draft.fields.name,'孟澄');assert.equal(formed.body.draft.formation.values.strength,14);assert.equal(calls,1);
  const recovery=await f.readOperation(input.operationId);const publicData=JSON.stringify({formed:formed.body,drafts:(await f.readDrafts()).body,recovery});assert.ok(!publicData.includes('"bonuses"'));assert.ok(!publicData.includes('"rolls"'));assert.ok(!publicData.includes('"private"'));assert.ok(!publicData.includes('3d6'));assert.equal(recovery.decisionTrace.gap,'character-formation-private');
 }finally{globalThis.fetch=oldFetch;f.db.close();}
});

test('numeric game-stat requests and incomplete text stop before models or dice while age and height remain legitimate',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:'{"bonuses":[]}'}}]});};
 try{
  await configure(f);
  for(const abilities of ['力量至少18','力量高於18','力量>=-1','力量不等於十二','耐力大於一點五','strength lower-than 18','力量大於18','耐力低於8','外觀小於18','精神容量不得超過90','strength greater than 18','endurance lower than 8','appearance no higher than 18','mental capacity not smaller than 65','精神容量65–90','耐力比18歲時更好且力量18','strength:18','容量80','力量十八','力量：一','耐力為十二','精神容量八十至九十','外觀10–18','dexterity is 18','strength must be 18','endurance between 8 and 18','strength should be 18','dexterity set to 18','mental capacity from 65 to 90','appearance >= 18']){const draft=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields:{...fields,abilities}})).body.draft;assert.equal((await f.form(await operation(f,draft))).status,400);}
  const missing=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields:{...fields,beliefs:''}})).body.draft;assert.equal((await f.form(await operation(f,missing))).status,400);assert.equal(calls,0);assert.equal(f.context.dice,0);
  const legal=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'35歲，身高175公分，做力量訓練3年',fields})).body.draft;assert.equal((await f.form(await operation(f,legal))).status,200);assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;f.db.close();}
});

test('unknown template text requires explicit creation and real user changes; source updates never rewrite a completed card',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch;let candidates=[];
 globalThis.fetch=async()=>Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:JSON.stringify({bonuses:candidates})}}]});
 try{
  await configure(f);const source=(await f.source({id:crypto.randomUUID(),version:0,fields:{...fields,background:'擅長搬重物'}})).body.template;
  const importInput={id:crypto.randomUUID(),templateId:source.id,templateVersion:source.version};const imported=await f.importTemplate(importInput);assert.equal(imported.status,200);assert.equal(imported.body.draft.provenance.background.kind,'unknown');assert.equal(imported.body.draft.provenance.background.materiallyEdited,false);
  candidates=[{target:'strength',source:'background',quote:'擅長搬重物',substantive:true}];
  const plain=await f.form(await operation(f,imported.body.draft));assert.equal(plain.status,200);assert.equal(plain.body.draft.formation.minimums.strength,3);
  const card=(await f.complete({id:plain.body.draft.id,version:plain.body.draft.version})).body.card;
  const second=(await f.importTemplate({id:crypto.randomUUID(),templateId:source.id,templateVersion:source.version})).body.draft;
  const edited=(await f.saveDraft({...second,fields:{...second.fields,background:'在港口獨立搬卸大型木箱'}})).body.draft;assert.equal(edited.provenance.background.kind,'unknown');assert.equal(edited.provenance.background.materiallyEdited,true);
  candidates=[{target:'strength',source:'background',quote:'搬卸大型木箱',substantive:true}];assert.equal((await f.form(await operation(f,edited))).body.draft.formation.minimums.strength,8);
  assert.equal((await f.source({...source,fields:{...source.fields,background:'來源改成新的經歷'}})).status,200);
  assert.equal((await f.importTemplate(importInput)).body.draft.fields.background,'擅長搬重物');assert.equal((await f.cards()).body.cards.find(value=>value.id===card.id).fields.background,'擅長搬重物');
 }finally{globalThis.fetch=oldFetch;f.db.close();}
});

test('AI-only or recycled AI trait text cannot earn a bonus, while a cited substantive user addition can',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch;let generationText='擅長搬重物',candidates=[];
 globalThis.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages.at(-1).content);return Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:JSON.stringify(input.task==='character-card-assessment-v1'?{bonuses:candidates}:{background:generationText})}}]});};
 async function aiDraft(){const base=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'製作一位修鐘人',fields:{...fields,background:''}})).body.draft;return (await f.generate(await operation(f,base))).body.draft;}
 try{
  await configure(f);
  const untouched=await aiDraft();candidates=[{target:'strength',source:'background',quote:'擅長搬重物',substantive:true}];assert.equal((await f.form(await operation(f,untouched))).body.draft.formation.minimums.strength,3);
  const reused=await aiDraft();const cleared=(await f.saveDraft({...reused,fields:{...reused.fields,background:''}})).body.draft;const pasted=(await f.saveDraft({...cleared,fields:{...cleared.fields,background:'擅長，搬重物！'}})).body.draft;assert.equal(pasted.provenance.background.materiallyEdited,false);candidates=[{target:'strength',source:'background',quote:'擅長，搬重物！',substantive:true}];assert.equal((await f.form(await operation(f,pasted))).body.draft.formation.minimums.strength,3);
  const history=await aiDraft();const blank=(await f.saveDraft({...history,fields:{...history.fields,background:''}})).body.draft;generationText='善於修鐘';const newer=(await f.generate(await operation(f,blank))).body.draft;const oldTrait=(await f.saveDraft({...newer,fields:{...newer.fields,background:'擅長搬重物，家門是綠色'}})).body.draft;candidates=[{target:'strength',source:'background',quote:'擅長搬重物',substantive:true}];assert.equal((await f.form(await operation(f,oldTrait))).body.draft.formation.minimums.strength,3);
  generationText='擅長搬重物';const original=await aiDraft();const user=(await f.saveDraft({...original,fields:{...original.fields,background:'擅長搬重物，在港口獨立搬卸大型木箱'}})).body.draft;candidates=[{target:'strength',source:'background',quote:'搬卸大型木箱',substantive:true}];assert.equal((await f.form(await operation(f,user))).body.draft.formation.minimums.strength,8);
 }finally{globalThis.fetch=oldFetch;f.db.close();}
});

test('controlled lowest and highest dice obey every ordinary and one-level background formula, including appearance and capacity',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch;let bonuses=[];
 globalThis.fetch=async()=>Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:JSON.stringify({bonuses})}}]});
 try{
  await configure(f);
  for(const rewarded of [false,true])for(const high of [false,true]){
   f.context.random=()=>{f.context.dice++;return high?.999999:0;};
   bonuses=rewarded?['strength','endurance','dexterity','perception','appearance','capacity'].map(target=>({target,source:'concept',quote:'全能且精神穩定',substantive:true})):[];
   const draft=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'全能且精神穩定',fields})).body.draft;
   const before=f.context.dice;const result=await f.form(await operation(f,draft));assert.equal(result.status,200);const value=result.body.draft.formation;
   assert.deepEqual(Object.values(value.values),Array(5).fill(high?18:rewarded?8:3));assert.equal(value.capacity,high?90:rewarded?65:40);assert.equal(value.initialTotal,high?90:rewarded?40:15);assert.equal(f.context.dice-before,rewarded?14:20);
  }
 }finally{globalThis.fetch=oldFetch;f.db.close();}
});

test('a model cannot choose numeric values or dice and a settled invalid assessment never forms or automatically retries',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:'{"bonuses":[],"values":{"strength":18},"capacity":90}'}}]});};
 try{
  await configure(f);const draft=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields})).body.draft;const input=await operation(f,draft);
  const response=await f.form(input);assert.equal(response.status,502);assert.equal(f.context.dice,0);assert.equal(calls,1);
  const saved=(await f.readDrafts()).body.drafts[0];assert.equal(saved.formation,undefined);assert.equal(saved.pendingFormation,undefined);assert.equal(saved.fields.name,'孟澄');
  assert.equal((await f.form(input)).status,409);assert.equal(calls,1);assert.equal(f.context.dice,0);
 }finally{globalThis.fetch=oldFetch;f.db.close();}
});

test('allocation and completion retain the original account even when two accounts deliberately share a draft UUID',async()=>{
 const f=await fixture(),oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:'{"bonuses":[]}'}}]});
 try{
  await configure(f);const id=crypto.randomUUID();const a=(await f.saveDraft({id,version:0,concept:'甲',fields})).body.draft;const formedA=(await f.form(await operation(f,a))).body.draft;
  f.context.owner='b';await configure(f);const b=(await f.saveDraft({id,version:0,concept:'乙',fields:{...fields,name:'另一帳號人物'}})).body.draft;const formedB=(await f.form(await operation(f,b))).body.draft;
  assert.equal(formedA.version,formedB.version);
  assert.equal((await f.form({action:'allocate',id,version:formedA.version,operationScope:formedA.accountScope,values:formedA.formation.values})).status,409);
  assert.equal((await f.complete({id,version:formedA.version,operationScope:formedA.accountScope})).status,409);
  assert.deepEqual((await f.cards()).body.cards,[]);assert.equal((await f.readDrafts()).body.drafts[0].fields.name,'另一帳號人物');
  f.context.owner='a';assert.equal((await f.readDrafts()).body.drafts[0].fields.name,'孟澄');assert.equal((await f.readDrafts()).body.drafts[0].completedCard,undefined);
 }finally{globalThis.fetch=oldFetch;f.db.close();}
});


test('ordinary Chinese ability prose forms through the real API and persists without treating word fragments as numeric assignments',async()=>{
 const f=await fixture(),old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:'{"bonuses":[]}'}}]});};
 try{await configure(f);for(const description of ['耐力一般','外觀十分普通','力量一如往常','力量：一如往常']){
  const draft=(await f.saveDraft({id:crypto.randomUUID(),version:0,concept:'修鐘人',fields:{...fields,abilities:description}})).body.draft;
  const formed=await f.form(await operation(f,draft));assert.equal(formed.status,200,JSON.stringify(formed.body));
  const saved=(await f.readDrafts()).body.drafts.find(item=>item.id===draft.id);assert.equal(saved.fields.abilities,description);assert.ok(saved.formation);
 }assert.equal(calls,4);}finally{globalThis.fetch=old;f.db.close();}
});
