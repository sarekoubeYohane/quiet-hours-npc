/* eslint-disable @typescript-eslint/no-require-imports -- Explicit model transport fixtures; API/effects/SQLite remain real. */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const {POST,GET}=load('route'),store=load('store'),{seedWorld}=load('world');
const f=require('./routine-world-programs-fixture.cjs');
const response=(value,_fixtureInput)=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(_fixtureInput,value))}}]});
const propose=(content,purpose,target='cafe')=>({type:'propose',target,content,purpose,mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]});
const rest={type:'reflect',target:'',content:'先想想下一步',mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[]};
const exhausted=()=>({id:'finished-meal',label:'最後一份簡餐',kind:'food',region:'cafe-front',owner:'owner',knownTo:['owner','cass'],allowedTo:['owner','cass'],remaining:0,initialState:{},consumable:true});
const stock=(owner='owner')=>({id:'flour',label:'另一份麵粉',kind:'food',region:'cafe-front',owner,knownTo:['owner','cass'],allowedTo:[owner],remaining:1,initialState:{material:'麵粉'},quantity:{amount:1,unit:'item'},consumable:false});
function preparation(){
 const binding=f.binding('raw','supply','local',[],{kind:'food',sourceRole:'material',sourceSubject:'麵粉',background:f.bg('普通麵粉','food')});
 return f.program('prepare-flatbread','用另一個來源的麵粉做一份薄餅','準備食物',[binding],[f.phase(15,[{kind:'materialize',supplyId:'$raw',expectedRemaining:0},f.form('新做的一份薄餅','meal')])]);
}
async function scenario({actorId='owner',prepare=()=>{}}={}){
 const w=seedWorld();w.contextId='alternative-food-fixture';w.adjudication={provider:'openai',model:'fixture-judge'};w.characters=w.characters.filter(c=>c.id===actorId||c.id==='owner');if(actorId!=='owner')w.characters.find(c=>c.id==='owner').control={mode:'taken-over'};const actor=w.characters.find(c=>c.id===actorId);actor.location='cafe';actor.region='cafe-front';w.supplies=[exhausted()];prepare(w,actor);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});let decision=rest,candidate,judgments=0;const inputs=[],requests=[],old=global.fetch;
 global.fetch=async(url,init)=>{assert.match(String(url),/^https:\/\/api\.openai\.com\//,'Unexpected external destination');const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);requests.push(request);inputs.push(input);if(input.contractVersion==='world-adjudication.v1'){judgments++;return response(typeof candidate==='function'?candidate(input):candidate,JSON.parse(JSON.parse(init.body).messages[1].content));}return response(typeof decision==='function'?decision(input):decision,JSON.parse(JSON.parse(init.body).messages[1].content));};
 return {post,read:async()=>(await(await GET()).json()).world,choose:value=>{decision=value;},reply:value=>{candidate=value;},inputs,requests,judgments:()=>judgments,restore:()=>{global.fetch=old;}};
}
const advance=async s=>{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return (await r.clone().json()).world;};
module.exports={scenario,preparation,propose,rest,stock,exhausted,advance};
