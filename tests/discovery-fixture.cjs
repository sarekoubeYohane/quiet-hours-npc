/* eslint-disable @typescript-eslint/no-require-imports -- Explicit model boundary fixture; real World API and SQLite. */
const path=require('node:path'),assert=require('node:assert/strict');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=load('world'),{GET,POST}=load('route'),store=load('store');
const rest={type:'rest',target:'',content:'',purpose:'',mood:'平靜',durationMinutes:15,intents:[]};
const proposal={...rest,type:'propose',target:'cafe-front',content:'仔細查看附近有什麼可以使用的東西',purpose:'確認眼前可用的物資'};
const discover=(objectIds=[],supplyIds=[])=>({kind:'discover',version:1,region:'cafe-front',objectIds,supplyIds});
const accepted=effects=>({status:'accepted',completionMinutes:15,effects,check:null});
function initialWorld(){const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6-luna'};w.objects=[{id:'unknown-object',source:'existing-stock',label:'桌邊布袋',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{surface:'乾燥',private:'SECRET_OBJECT'},stateExposure:{private:'hidden'},lifecycle:'active',kind:'utensil',knownTo:[],allowedTo:['owner']}];w.supplies=[{id:'unknown-supply',label:'常備布料',region:'cafe-front',remaining:2,owner:'owner',knownTo:[],allowedTo:['owner'],kind:'fabric',initialState:{material:'棉'}}];return w;}
async function scenario({prepare,world=initialWorld()}={}){if(prepare)prepare(world);store.install(world);let action=proposal,judgment=accepted([discover(['unknown-object'])]);const frames=[],old=fetch,random=Math.random;Math.random=()=>.675;
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',...body})}));const read=async()=>(await(await GET()).json()).world;
 global.fetch=async(url,init)=>{assert.match(String(url),/api\.openai\.com/);const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);frames.push({request,input});const value=input.contractVersion==='world-adjudication.v1'?(typeof judgment==='function'?judgment(input):judgment):(typeof action==='function'?action(input):action);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:typeof value==='string'?value:JSON.stringify(value)}}]});};
 await post({operation:'set-model-key',mode:'openai',key:'fixture-key'});await post({operation:'set-budget',limits:{calls:120,tokens:500000}});
 const body=()=>({operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna'});return {post,read,frames,choose:v=>action=v,reply:v=>judgment=v,body,advance:async()=>{const r=await post(body());assert.equal(r.status,200,await r.clone().text());return read();},restore:()=>{global.fetch=old;Math.random=random;},judgments:()=>frames.filter(f=>f.input.contractVersion==='world-adjudication.v1'),npc:()=>frames.filter(f=>f.input.self)};
}
module.exports={scenario,initialWorld,rest,proposal,discover,accepted,store,load};
