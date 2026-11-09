import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
const {fixtureDecision}=createRequire(import.meta.url)('./pursuit-fixture.cjs');
import {startApp} from '../tooling/verification/real-route-runtime.mjs';
import {journey,operationId,advanceCraft} from '../tooling/verification/versioned-d100-journey.mjs';
test('formed card is used by the real world route as explicit d100-v2, persists, and replays its original operation',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),checkRolls:[60],modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task?{bonuses:[]}:fixtureDecision(input,{type:'work',target:'craft-challenge',content:'星月'});}});
 try{
  const j=await journey(app),save=await j.create();const initial=await j.world(save);assert.equal(initial.world.turn,0);assert.equal(initial.world.characters[0].attributes.version,2);
  const actor=initial.world.characters[0].id;
  await j.send(save,{operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:5,timeContract:'five-minute-v1'});
  await j.send(save,{operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:5,timeContract:'five-minute-v1'});
  await j.send(save,{operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:5,timeContract:'five-minute-v1'});
  const op=operationId();const result=await j.send(save,{operation:'advance',mode:'openai',model:'gpt-6-luna',operationId:op,minutes:5,timeContract:'five-minute-v1'});
  const resolution=result.world.events.findLast(e=>e.actor===actor&&e.resolution)?.resolution;
  assert.equal(resolution.system,'d100-v2');assert.equal(resolution.threshold,60);assert.equal(resolution.outcome,'success');assert.equal(resolution.attributeVersion,2);
  const stored=(await j.world(save)).world;assert.deepEqual(stored.events.findLast(e=>e.actor===actor&&e.resolution).resolution,resolution);
  const replay=await j.send(save,{operation:'advance',mode:'openai',model:'gpt-6-luna',operationId:op,minutes:5,timeContract:'five-minute-v1'});assert.deepEqual(replay.world.events.findLast(e=>e.actor===actor&&e.resolution).resolution,resolution);
  assert.equal(app.modelRequests.length,2);
 }finally{await app.close();}
});

test('real saved card worlds cover 5/60/90/95 thresholds, extremes, partial bands and continuation without an extra draw',async()=>{
 const cases=[
  [3,'craft-expert-challenge',5,[[1,'critical-success'],[5,'critical-success'],[6,'mixed'],[25,'mixed'],[26,'failure'],[95,'failure'],[96,'critical-failure'],[100,'critical-failure']]],
  [12,'craft-challenge',60,[[5,'critical-success'],[6,'success'],[60,'success'],[61,'mixed'],[80,'mixed'],[81,'failure'],[95,'failure'],[96,'critical-failure']]],
  [18,'craft-challenge',90,[[5,'critical-success'],[90,'success'],[91,'mixed'],[95,'mixed'],[96,'critical-failure'],[100,'critical-failure']]],
  [18,'craft-easy-challenge',95,[[5,'critical-success'],[6,'success'],[95,'success'],[96,'critical-failure']]],
 ];
 let task='craft-challenge';const rows=cases.flatMap(([dex,kind,threshold,bounds])=>bounds.map(([roll,outcome])=>({dex,kind,threshold,roll,outcome})));
 const app=await startApp({diceFaces:Array(20*rows.length).fill(4),checkRolls:rows.map(x=>x.roll),modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task?{bonuses:[]}:fixtureDecision(input,{type:'work',target:task,content:'星月'});}});
 try{
  const j=await journey(app);
  for(const row of rows){task=row.kind;const save=await j.create({dexterity:row.dex}),result=await advanceCraft(j,save),actor=result.world.characters[0];
   const r=result.world.events.findLast(e=>e.actor===actor.id&&e.resolution)?.resolution;
   assert.equal(r?.system,'d100-v2',JSON.stringify(row));assert.equal(r.threshold,row.threshold,JSON.stringify(row));assert.equal(r.roll,row.roll);assert.equal(r.outcome,row.outcome,JSON.stringify(row));assert.equal(r.attributeVersion,2);
   assert.deepEqual((await j.world(save)).world.events.findLast(e=>e.resolution).resolution,r);
   // The unchanged design/method already has a project: another full activity cannot reroll.
   await advanceCraft(j,save);assert.equal((await j.world(save)).world.events.filter(e=>e.resolution).length,1);
  }
  assert.equal(app.modelRequests.length,rows.length*3,'one assessment and two NPC choices per world; no model after the roll');
 }finally{await app.close();}
});

test('fresh adjudication chooses v2 with no relevant ability at 55, hides dice from NPC input and retains one physical opportunity',async()=>{
 let ability='一般協調',attribute=null;let inputs=[];
 const app=await startApp({diceFaces:Array(20).fill(4),checkRolls:[55],modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);inputs.push(input);
  if(input.task)return {bonuses:[]};
  if(input.contractVersion==='world-adjudication.v1')return {status:'accepted',routine:null,completionMinutes:5,effects:[],stages:[],check:{difficulty:12,ability,system:'d100-v2',attribute,sense:null},branches:[{outcomes:['critical-success','success','mixed','failure','critical-failure'],effects:[],stages:[]}]};
  return fixtureDecision(input,{type:'propose',target:input.self.region,content:'嘗試協調步伐',purpose:'協調',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});
 }});
 try{
  const j=await journey(app),save=await j.create();const result=await j.send(save,{operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:5,timeContract:'five-minute-v1'});
  const receipt=Object.values(result.world.freeTrials)[0];assert.equal(receipt.system,'d100-v2');assert.equal(receipt.threshold,55);assert.equal(receipt.outcome,'success');assert.equal(receipt.factors.attribute,null);
  assert.equal(inputs.find(input=>input.contractVersion==='world-adjudication.v1').actor.checkSystem,'d100-v2');
  ability='力量';attribute='strength';await j.send(save,{operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:5,timeContract:'five-minute-v1'});
  const reloaded=await j.world(save);assert.deepEqual(Object.values(reloaded.world.freeTrials),[receipt]);assert.doesNotMatch(JSON.stringify(inputs.filter(input=>input.self).at(-1)),/threshold|d100-v2|critical-success|critical-failure/);
 }finally{await app.close();}
});

test('slow source operation and its versioned activity stay on their original save across selection and account boundaries',async()=>{
 let signal;const entered=new Promise(resolve=>signal=resolve);let release;const blocked=new Promise(resolve=>release=resolve);let npc=0;
 const app=await startApp({diceFaces:Array(40).fill(4),checkRolls:[60],modelResponder:async request=>{const input=JSON.parse(request.messages.at(-1).content);if(input.task)return {bonuses:[]};if(npc++===0){signal();await blocked;}return fixtureDecision(input,{type:'work',target:'craft-challenge',content:'星月'});}});
 try{
  const j=await journey(app),a=await j.create({name:'來源'}),b=await j.create({name:'另份'}),op=operationId();
  const pending=j.send(a,{operation:'advance',mode:'openai',model:'gpt-6-luna',operationId:op,minutes:5,timeContract:'five-minute-v1'});await entered;
  const other=(await j.world(b)).world;assert.equal(other.turn,0);assert.equal(other.characters[0].plan,undefined);
  const foreign=await fetch(app.url+'/api/world?save='+a,{headers:{Cookie:'qh_local_owner=foreign'}});assert.equal(foreign.status,404);
  release();const accepted=await pending;assert.equal(accepted.world.characters[0].plan.checkSystem,'d100-v2');assert.equal(accepted.world.characters[0].plan.attributeVersion,2);
  assert.deepEqual((await j.send(a,{operation:'advance',mode:'openai',model:'gpt-6-luna',operationId:op,minutes:5,timeContract:'five-minute-v1'})).world,accepted.world);
  let result;for(let i=0;i<3;i++)result=await j.send(a,{operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:5,timeContract:'five-minute-v1'});
  assert.equal(result.world.events.findLast(e=>e.resolution).resolution.system,'d100-v2');assert.equal((await j.world(b)).world.turn,0);assert.equal(app.modelRequests.length,3);
 }finally{release?.();await app.close();}
});

test('certain or denied opportunities never draw; appearance is rejected before the die even for a completed card',async()=>{
 let variant='certain';const app=await startApp({diceFaces:Array(60).fill(4),checkRolls:[],modelResponder:request=>{
  const input=JSON.parse(request.messages.at(-1).content);if(input.task)return {bonuses:[]};
  if(input.contractVersion==='world-adjudication.v1')return variant==='denied'?{status:'denied',routine:null,completionMinutes:null,effects:[],stages:[],check:null,branches:null}:{status:'accepted',routine:null,completionMinutes:5,effects:[],stages:[],check:variant==='certain'?null:{difficulty:12,ability:'外觀',system:'d100-v2',attribute:'appearance',sense:null},branches:[{outcomes:['critical-success','success','mixed','failure','critical-failure'],effects:[],stages:[]}]};
  return fixtureDecision(input,{type:'propose',target:input.self.region,content:'嘗試本地動作',purpose:'檢查',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});
 }});
 try{
  const j=await journey(app);
  for(const value of ['certain','denied','appearance']){variant=value;const save=await j.create();const scope=await j.world(save),op=operationId(),body={operation:'advance',operationId:op,mode:'openai',model:'gpt-6-luna',operationScope:scope.operationScope,worldContext:scope.world.contextId,minutes:5,timeContract:'five-minute-v1'};
   const r=await j.request('/api/world?save='+save,body);assert.equal(r.status,value==='appearance'?502:200,JSON.stringify(r.body));assert.equal(r.body.world.events.filter(e=>e.resolution).length,0);assert.equal(Object.keys(r.body.world.freeTrials||{}).length,0);
   const calls=app.modelRequests.length;const replay=await j.request('/api/world?save='+save,body);assert.equal(replay.status,r.status);assert.equal(app.modelRequests.length,calls,'original ID does not re-dispatch a denied or invalid opportunity');
  }
 }finally{await app.close();}
});

test('a card perception check uses v2 ability plus active attention and reuses the discovered resource receipt',async()=>{
 const app=await startApp({diceFaces:Array(20).fill(4),checkRolls:[70],modelResponder:request=>{const input=JSON.parse(request.messages.at(-1).content);return input.task?{bonuses:[]}:fixtureDecision(input,{type:'observe',target:input.self.region,content:'sight'});}});
 try{
  const j=await journey(app),save=await j.create({objects:[{id:'clock',name:'老鐘',roomId:'front',state:{condition:'old'},hidden:true}]});
  const result=await advanceCraft(j,save);const trace=result.world.events.flatMap(e=>e.perception||[]).find(trace=>trace.resolution);
  assert.equal(trace.resolution.system,'d100-v2');assert.equal(trace.resolution.threshold,70);assert.equal(trace.resolution.factors.attribute,'perception');assert.equal(trace.resolution.factors.attention,10);assert.equal(trace.resolution.outcome,'success');
  const receipt=Object.values(result.world.perceptionTrials)[0];await advanceCraft(j,save);assert.deepEqual(Object.values((await j.world(save)).world.perceptionTrials),[receipt]);
 }finally{await app.close();}
});
