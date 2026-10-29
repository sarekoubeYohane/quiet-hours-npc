/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const request=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',model:'gpt-6-luna',...body})});
const node=(id,parents=[],extra={})=>({id,content:id.split(':').at(-1),kind:'task',scope:'做一份自己想做的設計',satisfaction:'完成一份設計',intensity:'medium',importance:'medium',urgency:'low',context:'',parents,...extra});
const upsert=(id,parents=[],extra={},version=0)=>({operation:'upsert',id,version,node:node(id,parents,extra),references:[],reason:'這是我願意承接的方向'});
const reorder=(id,version,members,scope='children')=>({operation:'reorder',id,version,node:{scope,members},references:[],reason:'依現在的情境調整這個範圍的順序'});
function decision(input,{updates=[],focus=null,type='rest',target='',content='安靜休息',duration=15,choice=type==='continue'?'continue':'new'}={}){return {contractVersion:'npc-decision.v3',pursuitContext:input.pursuitContext,pursuitUpdates:updates,focusIntentId:focus,action:{type,target,content,purpose:''},mood:'平靜',durationMinutes:duration,timeIntent:{kind:'open-ended',maxMinutes:null},methodAssessment:{purpose:'依自己的追求選擇一步',knownResults:[],choice,method:content,change:{kind:'not-applicable',detail:''},reason:'依本人當前所知作選擇',selectedAction:{type,target},intentIds:focus?[focus]:[]},reconfirmBodyConsequences:false,attentionConditions:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],interpretation:'',preferenceUpdates:[],habitCandidates:[],arrangementUpdates:[]};}
async function scenario(responder,prepare=()=>{}){
 const {GET,POST}=load('route'),store=load('store'),world=load('world').seedWorld();world.adjudication={provider:'openai',model:'gpt-6-luna'};world.characters=world.characters.filter(c=>['vera','owner'].includes(c.id));world.characters.find(c=>c.id==='owner').control.mode='taken-over';prepare(world);store.install(world);
 const read=async()=>(await(await GET()).json()).world;
 const post=body=>POST(request(body));await post({operation:'set-model-key',key:'fixture-key'});
 const original=global.fetch,random=Math.random,frames=[];Math.random=()=>.675;
 global.fetch=async(url,init)=>{assert.match(String(url),/^https:\/\/api\.openai\.com\//);const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);frames.push({body,input});const value=await responder(input,body,frames.length);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
 return {read,post,frames,store,advance:()=>post({operation:'advance',minutes:15}),restore(){global.fetch=original;Math.random=random;}};
}
module.exports={load,request,node,upsert,reorder,decision,scenario};
