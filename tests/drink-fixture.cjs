/* eslint-disable @typescript-eslint/no-require-imports -- Explicit model and saved-world fixtures. */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const f=require('./routine-world-programs-fixture.cjs');
const opid=()=>Date.now()+':'+crypto.randomUUID();
const item=(id,kind,state,lifecycle='active')=>({id,kind,state,lifecycle,label:kind==='drink'?'茶':'杯子',source:'fixture',region:'cafe-front',holder:'owner',owner:'owner',revision:1,consumable:kind==='drink',quantity:{amount:lifecycle==='active'?1:0,unit:'item'},knownTo:['owner'],allowedTo:['owner']});
function drinkProgram(target='tea',direction='from-role',minutes=15){
 const bindings=target==='tea'?[f.binding('drink','object','target',[{key:'beverage',value:'tea'}],{kind:'drink'}),f.binding('vessel','object','linked',[{key:'contents',value:'tea'}],{kind:'utensil',link:{role:'drink',key:'vessel',direction}})]:[f.binding('vessel','object','target',[{key:'contents',value:'tea'}],{kind:'utensil'}),f.binding('drink','object','linked',[{key:'beverage',value:'tea'}],{kind:'drink',link:{role:'vessel',key:'vessel',...(direction?{direction}:{})}})];
 return f.program('drink-serving','喝這杯茶','飲用',bindings,[f.phase(minutes,[{kind:'ingest',version:1,objectId:'$drink',expectedRevision:0,hungerRelief:0,thirstRelief:15},f.change('vessel','contents','tea','empty')])]);
}
async function scenario(program,prepare=()=>{}){
 const w=seedWorld();w.contextId='drink-fixture';w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-judge'};w.objects=[item('old-cup','utensil',{contents:'empty'}),item('old-tea','drink',{vessel:'old-cup',beverage:'tea'},'consumed'),item('cup','utensil',{contents:'tea'}),item('tea','drink',{vessel:'cup',beverage:'tea'})];prepare(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:opid(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});const old=global.fetch,inputs=[],requests=[];let npc=0,judgments=0;let decision={type:'propose',target:program.bindings[0].role==='drink'?'tea':'cup',content:'喝這杯茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
 global.fetch=async(_url,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);requests.push(request);inputs.push(input);let value;if(input.contractVersion==='world-adjudication.v1'){judgments++;value=f.approval([program],program.operation,'茶');}else{npc++;value=decision;}return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),value))}}]});};
 return{post,inputs,requests,read:async()=>(await(await GET()).json()).world,choose:v=>{decision=v;},reply:v=>{program=v;},counts:()=>({npc,judgments}),restore:()=>{global.fetch=old;}};
}
async function advance(s,extra={}){const r=await s.post({operation:'advance',minutes:15,...extra});assert.equal(r.status,200,await r.clone().text());return s.read();}
module.exports={scenario,drinkProgram,advance,item,store,seedWorld,f,opid};
