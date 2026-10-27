/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const opid=()=>Date.now()+':'+crypto.randomUUID();
const asleep={type:'propose',target:'cafe',content:'在安全角落睡一覺',purpose:'睡眠恢復',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
const awake={type:'rest',target:'',content:'醒來先安靜休息',mood:'平靜',durationMinutes:60,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};
const reply=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
async function scenario(prepare=()=>{},judge){
 const world=seedWorld();world.contextId='sleep-v1';world.characters=world.characters.filter(c=>c.id==='owner');world.adjudication={provider:'openai',model:'fixture-judge'};
 const c=world.characters[0];c.needs={version:1,activatedAt:world.minute,updatedAt:world.minute,values:{hunger:39,thirst:39,fatigue:70,sleep:80},assessed:{hunger:0,thirst:0,fatigue:2,sleep:2},history:[],dropped:0};prepare(world);store.install(world);
 const post=b=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:opid(),worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',...b})}));
 await post({operation:'set-model-key',key:'fixture-key'});let npc=0,judgments=0,choose;const inputs=[],old=global.fetch;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;return reply(judge?judge(input):{status:'accepted',effects:[],stages:[],check:null,routine:null,completionMinutes:480,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}});}npc++;inputs.push(input);return reply(choose?choose(input,npc):npc===1?asleep:awake);};
 return {post,read:async()=>(await(await GET()).json()).world,choose:f=>{choose=f;},inputs,counts:()=>({npc,judgments}),restore:()=>{global.fetch=old;}};
}
async function advance(s,minutes=15,extra={}){const r=await s.post({operation:'advance',minutes,...extra});assert.equal(r.status,200,await r.clone().text());return s.read();}
test('actual confirmed sleep crosses ninety minutes with proportional recovery and no hunger-triggered new decision',async()=>{
 const s=await scenario();try{
  await advance(s);await advance(s,30);await advance(s,30);await advance(s,30);const request={operation:'advance',minutes:15,operationId:opid()};await s.post(request);let w=await s.read();
  assert.equal(w.characters[0].plan.bodyActivity.kind,'sleep');assert.deepEqual(s.counts(),{npc:1,judgments:1});assert.equal(w.characters[0].needs.values.sleep,60);assert.equal(w.characters[0].needs.values.fatigue,60);
  assert.equal(w.characters[0].needs.values.hunger,45);assert.equal(w.characters[0].needs.values.thirst,51);assert.equal(w.characters[0].plan.sleep.elapsedMinutes,120);
  const before=structuredClone(w.characters[0]);await s.read();await s.post(request);w=await s.read();assert.deepEqual(w.characters[0],before);assert.deepEqual(s.counts(),{npc:1,judgments:1});
 }finally{s.restore();}
});

test('natural waking follows actual recovery rather than estimated duration and leaves the next choice autonomous',async()=>{
 const s=await scenario(w=>{w.characters[0].needs.values.sleep=40;});try{
  await advance(s);for(let i=0;i<3;i++)await advance(s,30);let w=await advance(s);
  assert.deepEqual(s.counts(),{npc:2,judgments:1});assert.equal(w.characters[0].needs.values.sleep,20);assert.equal(w.characters[0].needs.values.fatigue,60);
  assert.equal(w.characters[0].plan.action.type,'rest');assert.equal(w.characters[0].plan.bodyActivity.kind,'rest');assert.ok(w.events.some(e=>e.text.includes('自然醒')));
  const own=s.inputs.at(-1);assert.match(JSON.stringify(own),/自然醒/);assert.doesNotMatch(JSON.stringify(own),/naturalWakeAt|fatiguePerHour|sleepPerHour|assessed/);
 }finally{s.restore();}
});

test('ordinary requests do not wake sleep, while an actually heard shout wakes after two hours without full-night recovery',async()=>{
 const s=await scenario(w=>{const owner=w.characters[0],cass=seedWorld().characters.find(c=>c.id==='cass');cass.location='cafe';cass.region='cafe-front';cass.needs=structuredClone(owner.needs);w.characters.push(cass);owner.control={mode:'taken-over'};});try{
  await advance(s);await advance(s,30);await s.post({operation:'intervene',target:'cass',text:'方便時再聊，不急。'});await advance(s,30);await advance(s,30);
  assert.deepEqual(s.counts(),{npc:1,judgments:1});
  assert.equal((await s.post({operation:'direct',action:{type:'shout',target:'cass',content:'小心！請醒一醒！'}})).status,200);
  const w=await advance(s);const c=w.characters.find(c=>c.id==='cass');assert.deepEqual(s.counts(),{npc:2,judgments:1});assert.equal(c.plan.bodyActivity.kind,'rest');assert.equal(c.needs.values.sleep,60);assert.equal(c.needs.values.fatigue,60);assert.ok(w.events.some(e=>e.text.includes('刺激而醒')));
 }finally{s.restore();}
});

test('crossing natural wake inside a submitted interval counts only actual sleep and a low-need proposal does not prepay recovery',async()=>{
 const s=await scenario(w=>{w.characters[0].needs.values.sleep=21;});try{
  const w=await advance(s);assert.equal(w.characters[0].needs.values.sleep,20.6);assert.equal(w.characters[0].needs.values.fatigue,69.65);
  assert.equal(w.characters[0].plan,undefined);assert.ok(w.events.some(e=>e.text.includes('自然醒')));assert.ok(w.characters[0].needs.history.some(e=>e.reason.includes('sleep 6分鐘')));
  const next=await advance(s);assert.equal(s.counts().npc,2);assert.equal(next.characters[0].needs.values.sleep,21.6);
 }finally{s.restore();}
});

test('a full eight-hour sleep restores independently from fatigue without technical-period decisions',async()=>{
 const s=await scenario(w=>{w.characters[0].needs.values.sleep=100;});try{
  await advance(s);for(let i=0;i<15;i++)await advance(s,30);const w=await advance(s);
  assert.equal(w.characters[0].needs.values.sleep,20);assert.equal(w.characters[0].needs.values.fatigue,30);assert.deepEqual(s.counts(),{npc:2,judgments:1});assert.ok(w.events.some(e=>e.text.includes('自然醒')));
 }finally{s.restore();}
});

test('sleep progress and recovery share save-conflict, uncertain-commit and original-operation replay boundaries',async()=>{
 for(const failure of ['conflict','before','after']){
  const s=await scenario();try{
   await advance(s);const before=await s.read();if(failure==='conflict')store.conflictOnNextSave();else if(failure==='before')store.throwBeforeNextSave();else store.throwAfterNextSave();
   const body={operation:'advance',minutes:30,operationId:opid()};const r=await s.post(body),result=await r.json();const durable=await s.read();
   if(failure==='conflict'||failure==='before'){assert.deepEqual(durable.characters[0].needs,before.characters[0].needs);assert.deepEqual(durable.characters[0].plan,before.characters[0].plan);assert.equal(durable.minute,before.minute);}else assert.equal(durable.characters[0].plan.sleep.elapsedMinutes,45);
   const replay=await s.post(body);assert.deepEqual(await replay.json(),result);assert.equal(replay.status,r.status);assert.deepEqual((await s.read()).characters[0],durable.characters[0]);assert.deepEqual(s.counts(),{npc:1,judgments:1});
  }finally{s.restore();}
 }
});

test('a denied sleep proposal and an explicit short maximum do not start sleep or gain recovery',async()=>{
 for(const deny of [true,false]){
  const s=await scenario(()=>{},deny?()=>({status:'denied',effects:[],stages:[],check:null,routine:null,completionMinutes:null}):undefined);try{
   s.choose(()=>({...asleep,timeIntent:{kind:'completion',maxMinutes:30}}));const w=await advance(s);assert.equal(w.characters[0].plan,undefined);assert.equal(w.characters[0].needs.values.sleep,81);assert.equal(w.characters[0].needs.values.fatigue,70.25);
  }finally{s.restore();}
 }
});

test('a shout without sensory opportunity does not wake or reveal its content to the sleeper',async()=>{
 const s=await scenario(w=>{const owner=w.characters[0],cass=seedWorld().characters.find(c=>c.id==='cass');cass.needs=structuredClone(owner.needs);w.characters.push(cass);owner.control={mode:'taken-over'};});try{
  s.choose((_input,n)=>n===1?{...asleep,target:'kris-home'}:awake);await advance(s);
  await s.post({operation:'direct',action:{type:'shout',target:'cass',content:'小心！這是隔離位置的秘密喊話。'}});const w=await advance(s);const c=w.characters.find(x=>x.id==='cass');assert.equal(c.plan.bodyActivity.kind,'sleep');assert.equal(c.plan.sleep.stimulusWakeAt,undefined);assert.deepEqual(s.counts(),{npc:1,judgments:1});assert.doesNotMatch(JSON.stringify(c.shortTerm),/隔離位置的秘密喊話/);
 }finally{s.restore();}
});

test('a later actor failure rolls back the newly begun sleep together with time and recovery',async()=>{
 const s=await scenario(w=>{w.characters.push(seedWorld().characters.find(c=>c.id==='cass'));});try{
  const before=await s.read();s.choose((_input,n)=>n===1?asleep:{type:'not-a-valid-action'});const body={operation:'advance',minutes:15,operationId:opid()};assert.equal((await s.post(body)).status,502);const after=await s.read();assert.equal(after.minute,before.minute);assert.deepEqual(after.characters.map(c=>c.needs),before.characters.map(c=>c.needs));assert.deepEqual(after.characters.map(c=>c.plan),before.characters.map(c=>c.plan));const counts=s.counts();await s.post(body);assert.deepEqual(s.counts(),counts);assert.equal(after.aiUsage.totalCalls,3);
 }finally{s.restore();}
});

test('an explicit sleep maximum bounds actual recovery rather than forcing the longer reported estimate',async()=>{
 const s=await scenario(w=>{w.characters[0].needs.values.sleep=40;});try{
  s.choose((_input,n)=>n===1?{...asleep,timeIntent:{kind:'completion',maxMinutes:150}}:awake);const first=await advance(s);assert.equal(first.characters[0].plan.bodyActivity.kind,'sleep');for(let i=0;i<3;i++)await advance(s,30);const w=await advance(s);assert.equal(w.characters[0].needs.values.sleep,20);assert.deepEqual(s.counts(),{npc:2,judgments:1});
 }finally{s.restore();}
});

test('waking settles only stages due within actual sleep and cancels later effects without prepaying them',async()=>{
 const s=await scenario(w=>{w.characters[0].needs.values.sleep=25;w.objects=[{id:'sleep-cup',source:'fixture',label:'床邊杯',kind:'utensil',revision:1,region:'cafe-front',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],lifecycle:'active',state:{contents:'empty'},stateTransitions:{contents:['empty','water','tea']}}];},()=>({status:'accepted',effects:[],stages:[{afterMinutes:30,preconditions:[],effects:[{kind:'state',objectId:'sleep-cup',expectedRevision:1,key:'contents',value:'water'}]},{afterMinutes:480,preconditions:[],effects:[{kind:'state',objectId:'sleep-cup',expectedRevision:2,key:'contents',value:'tea'}]}],check:null,routine:null,completionMinutes:480,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}}));try{
  await advance(s);const w=await advance(s,30);assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects[0].revision,2);assert.ok(w.events.some(e=>e.text.includes('自然醒')));assert.equal(w.characters[0].plan.bodyActivity.kind,'rest');assert.deepEqual(s.counts(),{npc:2,judgments:1});
 }finally{s.restore();}
});
