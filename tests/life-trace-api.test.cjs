/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID(),reply=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const common={target:'',content:'安靜片刻',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
const read=async operationId=>(await(await GET(operationId?new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(operationId)):undefined)).json());
test('private dispatch, result and actor-feedback preserve actual life state and sources at their own saved boundaries',async()=>{
 const world=seedWorld();world.contextId='life-trace';world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-judge'};store.install(world);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const original=global.fetch,inputs=[];let stage=0,pair,calls=0;
 global.fetch=async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1')return reply({status:'accepted',effects:[],stages:[],check:null,routine:null,completionMinutes:120,resumable:true,activityIdentity:{version:1,key:'quiet-reading',label:'安靜閱讀'},bodyActivity:{version:1,kind:'rest',fatiguePerHour:-9,sleepPerHour:0}});
  inputs.push(input);let value=stage===0?{...common,type:'work',target:'tidy',content:'整理桌面'}:stage===1?{...common,type:'propose',target:'cafe',content:'在角落讀書',purpose:'安靜閱讀'}:stage===2?{...common,type:'pause',preferenceUpdates:[{operation:'upsert',id:'quiet-reading',version:0,topic:'閱讀',context:'收拾之後',text:'我喜歡安靜讀書。',references:[{kind:'short',...pair.action}],reason:'這次閱讀讓我想保留這個偏好。'}],habitCandidates:[pair]}:{...common,type:'rest',timeIntent:{kind:'open-ended',maxMinutes:null}};return reply(value);
 };
 try{
  const advance=async()=>{const operationId=id(),r=await post({operation:'advance',minutes:15,operationId});assert.equal(r.status,200,await r.clone().text());return {operationId,data:await r.json()};};
  await advance();stage=1;await advance();const performed=(await read()).world.characters[0];assert.equal(performed.habitEvidence.length,2);pair={trigger:performed.habitEvidence[0].memory,action:performed.habitEvidence[1].memory};
  await post({operation:'intervene',target:'owner',text:'你可以先停下來想一下。'});stage=2;const third=await advance(),thirdRead=await read(third.operationId),trace=thirdRead.decisionTrace,c=thirdRead.world.characters[0];
  assert.ok(c.preferences.items.length);assert.ok(c.pausedActivity);assert.equal(c.eventHabits.length,1);
  const atDispatch=trace.dispatches.find(d=>d.task==='npc').worldSnapshot.actors.find(a=>a.id==='owner');assert.ok(atDispatch.needs,'private dispatch must preserve authority needs');assert.deepEqual(atDispatch.habitEvidence,performed.habitEvidence);assert.equal(atDispatch.pausedActivity,undefined);assert.equal(atDispatch.preferences,undefined);
  const result=trace.result.actors.find(a=>a.id==='owner'),feedback=trace.steps.find(s=>s.kind==='npc-feedback'&&s.actorId==='owner').data;
  for(const field of ['needs','preferences','habits','habitEvidence','eventHabits','pausedActivity']){assert.deepEqual(result[field],c[field],field+' result');assert.deepEqual(feedback[field],c[field],field+' feedback');}
  stage=3;const fourth=await advance(),later=(await read(fourth.operationId)).decisionTrace;const nextDispatch=later.dispatches.find(d=>d.task==='npc').worldSnapshot.actors[0];assert.deepEqual(nextDispatch.preferences,c.preferences);assert.deepEqual(nextDispatch.pausedActivity,c.pausedActivity);assert.deepEqual(nextDispatch.eventHabits,c.eventHabits);assert.deepEqual((await read(third.operationId)).decisionTrace,trace,'later choices cannot rewrite original snapshots');
  const sent=JSON.stringify(inputs);assert.doesNotMatch(sent,/fatiguePerHour|activatedAt|updatedAt|assessed|preferenceTrace|habitEvidenceDropped|worldSnapshot|traceActorSnapshot/);assert.equal(thirdRead.world.decisionTrace,undefined);
  const beforeCalls=calls;await post({operation:'advance',minutes:15,operationId:third.operationId});assert.equal(calls,beforeCalls);assert.deepEqual((await read(third.operationId)).decisionTrace,trace);
 }finally{global.fetch=original;}
});
