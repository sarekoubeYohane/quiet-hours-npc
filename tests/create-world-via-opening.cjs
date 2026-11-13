/* eslint-disable @typescript-eslint/no-require-imports -- Product API journey for compatibility test hosting only. */
const assert=require('node:assert/strict');
module.exports=async function createWorldViaOpening({load,name,scene,placeName=name+'的家',roomId='front',characterName=name+'的人',initialMemories='初到此地',characterPlacement={}}){
 const {formCharacterCard,confirmOpening,completeCharacterFields}=await import('../tooling/verification/opening-journey.mjs');
 const owner=(await load('auth').getGitHubUser()).userId;
 const routes={'/api/world':load('route'),'/api/character-drafts':load('character-drafts-route'),'/api/character-drafts/form':load('character-form-route'),'/api/character-cards':load('character-cards-route'),'/api/opening-drafts':load('opening-drafts-route'),'/api/saves':load('saves-route')};
 const request=async(path,payload)=>{const route=routes[path.split('?')[0]],response=payload===undefined?await route.GET(new Request('https://test.invalid'+path)):await route.POST(new Request('https://test.invalid'+path,{method:'POST',headers:{origin:'https://test.invalid','Content-Type':'application/json','X-World-Time-Policy':'round-v1'},body:JSON.stringify(payload)}));return {status:response.status,body:await response.json()};};
 const scope=(await request('/api/world?workspace=account')).body;assert.ok(scope.world);
 if(!scope.modelKeys.openai.configured)assert.equal((await request('/api/world?workspace=account',{operationScope:scope.operationScope,operation:'set-model-key',mode:'openai',key:'controlled-authoring-key'})).status,200);
 if(!scope.modelSettings.effective.adjudication)assert.equal((await request('/api/world?workspace=account',{operationId:Date.now()+':'+crypto.randomUUID(),operation:'set-adjudication',mode:'demo',operationScope:scope.operationScope,worldContext:scope.world.contextId,adjudication:{provider:'openai',model:'gpt-6.1-sol'}})).status,200);
 const previousFetch=global.fetch,previousRandom=Math.random;let formationCalls=0,draws=0,card;
 // Only the provider transport and dice are controlled. The form API performs
 // normal account reservation, usage settlement, durable formation and locking.
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages.at(-1).content);assert.equal(input.task,'character-card-assessment-v1');formationCalls++;return Response.json({usage:{prompt_tokens:2,completion_tokens:2},choices:[{message:{content:'{"bonuses":[]}'}}]});};
 Math.random=()=>{draws++;return .5;};
 try{card=await formCharacterCard(request,{fields:{...completeCharacterFields(characterName),initialMemories}});}finally{global.fetch=previousFetch;Math.random=previousRandom;}
 assert.equal(formationCalls,1);assert.equal(draws,20,'five 3d6, one 2d6 capacity and three need-trait dice, once');
 const city={places:[{id:'home',templateId:scene.id,version:scene.version,name:placeName}],characters:[{templateId:card.id,version:card.version,placeId:'home',roomId,...characterPlacement}]};
 const result=await confirmOpening(request,{name,city});assert.equal(result.input.operationScope,owner);return {...result,formationCalls,card};
};
