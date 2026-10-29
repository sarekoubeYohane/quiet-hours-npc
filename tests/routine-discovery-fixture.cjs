/* eslint-disable @typescript-eslint/no-require-imports -- Shared explicit transport fixture, never deployed. */
const f=require('./routine-world-programs-fixture.cjs');
function search({content='查看這裡可用的普通備餐材料',label='普通備餐材料',minutes=15}={}){
 const bg=f.bg(label,'cooking-ingredient',false,[{key:'category',value:'食材',exposure:'public'}]);
 const raw=f.binding('raw','supply','local',[],{kind:'cooking-ingredient',sourceRole:'material',sourceSubject:'食材',background:bg});
 return f.program('find-ingredient',content,'確認可用材料',[raw],[f.phase(minutes,[{kind:'discover',version:1,region:'$here',objectIds:[],supplyIds:['$raw']}])]);
}
const initial=w=>{w.supplies=[];w.routinePlaces[0].confirmedOperations=['food'];};
function initialWorld(seedWorld){const w=seedWorld();w.contextId='routine-discovery-fixture';w.adjudication={provider:'openai',model:'fixture-judge'};w.characters=w.characters.filter(c=>c.id==='owner');w.characters[0].location='cafe';w.characters[0].region='cafe-front';initial(w);return w;}
module.exports={search,initial,initialWorld};
