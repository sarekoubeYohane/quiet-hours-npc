import assert from 'node:assert/strict';
export const completeCharacterFields=name=>({name,appearance:'外套',personality:'安靜',abilities:'沒有特殊設定',background:'河畔長大',initialMemories:'初到此地',beliefs:'重視承諾',preferences:'沒有特殊設定',directions:'生活',startLocation:''});
const accepted=(result,status=200)=>{assert.equal(result.status,status,JSON.stringify(result.body));return result.body;};
/** Product API driver; auth/model/dice remain at the caller's explicit boundaries. */
export async function formCharacterCard(request,{name='開局人物',fields=completeCharacterFields(name),concept='修鐘的人'}={}){
 const scope=accepted(await request('/api/world?workspace=account'));
 const draft=accepted(await request('/api/character-drafts',{id:crypto.randomUUID(),version:0,concept,fields})).draft;
 const formed=accepted(await request('/api/character-drafts/form',{id:draft.id,version:draft.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:scope.operationScope,worldContext:scope.world.contextId})).draft;
 return accepted(await request('/api/character-cards',{id:draft.id,version:formed.version,operationScope:scope.operationScope})).card;
}
/** Confirm exact final content, then create only from that saved opening version. */
export async function confirmOpening(request,{name,city,description='',id=crypto.randomUUID()}){
 const {operationScope}=accepted(await request('/api/opening-drafts'));assert.ok(operationScope,'Opening writes need the original account owner');
 const draft=accepted(await request('/api/opening-drafts',{id:crypto.randomUUID(),version:0,operationScope,body:{name,step:4,description,city}})).draft;
 const input={id,draftId:draft.id,draftVersion:draft.version,operationScope};
 return {input,saved:accepted(await request('/api/saves',input),201),draft};
}
