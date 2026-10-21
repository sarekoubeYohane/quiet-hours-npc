/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const timings=[['tea',5],['coffee',6],['food',10],['drink',8],['wash',3],['return',1]].map(([operation,minutes])=>({operation,minutes}));
const accepted=()=>({status:'accepted',effects:[],stages:[],check:null,completionMinutes:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings:structuredClone(timings)}});
async function setup(adjust=x=>x){
 const w=seedWorld();w.contextId='routine-contract';w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-world'};w.objects=[{id:'ordinary-mug',source:'fixture',label:'杯子',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea','coffee','dirty']}}];store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const previous=global.fetch;let calls=0,contract,request;
 global.fetch=async(_url,init)=>{calls++;const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);const value=input.contractVersion==='world-adjudication.v1'?(contract=input,request=body,adjust(accepted())):{type:'propose',target:'ordinary-mug',content:'泡一杯普通茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
 return {post,read:async()=>await(await GET()).json(),restore:()=>{global.fetch=previous;},calls:()=>calls,contract:()=>contract,request:()=>request};
}
test('first routine approval has one unambiguous dispatched time/effect contract and completes at the aligned time',async()=>{
 const s=await setup();try{
  const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};const response=await s.post(op);assert.equal(response.status,200,await response.clone().text());
  const input=s.contract();assert.match(input.rules.join('\n'),/completionMinutes=null/);
  assert.ok(input.effectRules.some(rule=>rule.includes('routine=null')&&rule.includes('accepted')),'generic accepted effect rule must be conditional');
  assert.ok(input.effectRules.some(rule=>rule.includes('routine=null')&&rule.includes('completionMinutes')),'generic completion rule must be conditional');
  const schema=s.request().response_format.json_schema.schema;
  assert.match(schema.properties.completionMinutes.description,/routine/);assert.match(schema.properties.effects.description,/routine/);
  const w=(await s.read()).world;assert.equal(w.routineRules[0].templates.length,6);assert.ok(w.routineRules[0].templates.every(t=>t.result.minutes===15));assert.equal(w.objects.find(o=>o.id==='ordinary-mug').state.contents,'tea');assert.equal(w.objects.filter(o=>o.kind==='utensil').length,1);assert.ok(w.objects.some(o=>o.state.beverage==='tea'));assert.equal(w.characters[0].plan,undefined);
  const objects=structuredClone(w.objects);await s.post(op);assert.deepEqual((await s.read()).world.objects,objects);assert.equal(s.calls(),2);
 }finally{s.restore();}
});
test('captured contradictory time and malformed routine branches roll back while usage and failure survive reload and replay',async()=>{
 for(const adjust of [x=>({...x,completionMinutes:5}),x=>({...x,effects:[{kind:'materialize',supplyId:'unknown',expectedRemaining:1}]}),x=>({...x,check:{difficulty:8,ability:'泡茶'}}),x=>({...x,routine:{...x.routine,timings:x.routine.timings.slice(0,5)}}),x=>({...x,routine:{...x.routine,timings:x.routine.timings.map(t=>({...t,minutes:0}))}})]){
  const s=await setup(adjust);try{
   const before=(await s.read()).world,op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};const response=await s.post(op),result=await response.json();assert.equal(response.status,502);assert.equal(result.adjudicationFailure.stage,'parse');const saved=await s.read();assert.equal(saved.world.turn,before.turn);assert.equal(saved.world.minute,before.minute);assert.deepEqual(saved.world.objects,before.objects);assert.deepEqual(saved.world.routineRules,before.routineRules);assert.equal(saved.world.aiUsage.totalCalls,2);assert.equal(saved.world.aiUsage.totalInputTokens,60);assert.deepEqual(saved.adjudicationFailure,result.adjudicationFailure);await s.post(op);assert.equal(s.calls(),2);
  }finally{s.restore();}
 }
});
