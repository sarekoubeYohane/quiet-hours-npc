/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=build('world'),{GET,POST}=build('route'),store=build('store');
const {decision,candidate,adoption,choose}=require('./pursuit-selection-fixture.cjs');
const request=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',model:'gpt-6-luna',...body})});
const read=async()=> (await (await GET()).json()).world;
const post=async body=>POST(request({worldContext:(await read()).contextId,...body}));
const advance=extra=>post({operation:'advance',minutes:15,...extra});
async function setup(){const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-judge'};store.install(w);await post({operation:'set-model-key',key:'fixture-key'});return w;}
const reference=input=>({kind:'short',id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version});
const arrangement=(input,minute,id='later',pursuit={id:'owner:tea',version:0})=>({operation:'upsert',id,version:0,text:'精神好些後再考慮喝茶',condition:{kind:'time',minute},references:[reference(input)],reason:'仍想考慮但先休息',pursuit});
function accept(input,value,id='owner:tea'){
 const p=candidate('owner','tea','照顧自己的飲茶時間');value.pursuitCandidates=[p];value.pursuitUpdates=[adoption(input,p,id)];value.pursuitUpdates[0].node.context='先等待，沒有可靠條件時仍可正常決策再想';value.pursuitSelection.adoptions=[{candidateId:p.id,pursuitId:id}];choose(value,{kind:'candidate',id:p.id,version:0},id);return value;
}
function existing(input,value,id='owner:tea'){const p=input.self.intents.find(n=>n.id===id);choose(value,{kind:'existing',id,version:p.version});return value;}
function continuing(input,value){existing(input,value);value.action.type='continue';value.methodAssessment.choice='continue';value.methodAssessment.selectedAction.type='continue';return value;}
async function transport(respond,run){const original=global.fetch,frames=[];global.fetch=async(url,init)=>{assert.match(String(url),/api\.openai\.com/);const payload=JSON.parse(init.body),input=JSON.parse(payload.messages[1].content);frames.push(input);return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify(respond(input,payload))}}]});};try{return await run(frames);}finally{global.fetch=original;}}

test('same-decision pursuit and linked arrangement persist, due cue offers one normal continuation without restarting progress',async()=>{
 const initial=await setup();let decisions=0;
 await transport(input=>{const value=decision(input);decisions++;
  if(decisions===1){accept(input,value);value.durationMinutes=120;value.arrangementUpdates=[arrangement(input,initial.minute+30)];}
  else {assert.equal(input.self.arrangementCues.length,1);assert.equal(input.self.arrangementCues[0].pursuit.id,'owner:tea');assert.equal(input.self.arrangements.items[0].pursuitState.status,'active');continuing(input,value);}
  return value;
 },async frames=>{
  const response=await advance();assert.equal(response.status,200,await response.clone().text());const first=(await read()).characters[0];assert.deepEqual(first.arrangements.items[0].pursuit,{id:'owner:tea',version:1});
  const operationId=`${Date.now()}:${crypto.randomUUID()}`;assert.equal((await advance({operationId})).status,200);const saved=(await read()).characters[0];assert.equal(saved.plan.startedAt,first.plan.startedAt);assert.equal(saved.plan.until,first.plan.until);assert.equal(saved.arrangements.items[0].status,'active');assert.ok(saved.arrangements.items[0].cue.trigger.handledAt);
  assert.equal((await advance({operationId})).status,200);await read();assert.equal(frames.length,2);
  assert.equal((await advance()).status,200);assert.equal(frames.length,2);assert.equal((await read()).characters[0].intents.find(i=>i.id==='owner:tea').status,'active');
 });
});

test('rewording and unrelated pursuit version changes retain cue identity; explicit postponement creates one new opportunity',async()=>{
 const initial=await setup();let stage=0;
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.durationMinutes=120;v.arrangementUpdates=[arrangement(input,initial.minute+30)];}
  else {continuing(input,v);const saved=input.self.arrangements.items[0];assert.equal(input.self.arrangementCues.length,stage===1||stage===3?1:0);
   if(stage===1){const old=input.self.intents.find(n=>n.id==='owner:tea');v.pursuitUpdates=[{operation:'upsert',id:old.id,version:old.version,node:Object.fromEntries(['id','content','intensity','importance','urgency','context','kind','scope','satisfaction','parents'].map(k=>[k,old[k]])),references:[],reason:'保留同一追求，不變更等待條件'}];v.arrangementUpdates=[{...arrangement(input,saved.condition.minute,'later',{id:old.id,version:old.version}),version:saved.version,text:'換一種說法，仍想晚一點考慮喝茶'}];}
   if(stage===2){assert.equal(saved.pursuit.version,2);assert.equal(saved.pursuitState.currentVersion,2);v.arrangementUpdates=[{...arrangement(input,initial.minute+75,'later',{id:'owner:tea',version:2}),version:saved.version,reason:'我想明示再晚一點考慮'}];}
  }return v;
 },async frames=>{
  assert.equal((await advance()).status,200);stage=1;assert.equal((await advance()).status,200);const handled=(await read()).characters[0].arrangements.items[0].cue;
  stage=2;assert.equal((await post({operation:'intervene',target:'owner',text:'只是問候，不要求做事'})).status,200);assert.equal((await advance()).status,200);const postponed=(await read()).characters[0].arrangements.items[0];assert.notEqual(postponed.cue?.conditionKey,handled.conditionKey);
  assert.equal(frames.length,3);assert.equal((await advance()).status,200);assert.equal(frames.length,3);stage=3;assert.equal((await advance()).status,200);assert.equal(frames.length,4);const final=(await read()).characters[0];assert.equal(final.arrangements.items[0].status,'active');assert.equal(final.intents.find(n=>n.id==='owner:tea').status,'active');assert.equal(final.plan.startedAt,initial.minute);
 });
});

for(const [name,link]of [
 ['foreign actor',{id:'cass:direction',version:1}],['missing endpoint',{id:'owner:missing',version:0}],['stale endpoint',{id:'owner:direction',version:0}],['unknown reference fields',{id:'owner:direction',version:1,secret:true}],
])test(`linked arrangement rejects ${name} atomically before any reminder can be committed`,async()=>{
 const initial=await setup();await transport(input=>{const v=decision(input);v.arrangementUpdates=[arrangement(input,initial.minute+30,'invalid',link)];return v;},async frames=>{assert.equal((await advance()).status,502);const saved=await read();assert.equal(frames.length,1);assert.equal(saved.turn,0);assert.deepEqual(saved.characters,initial.characters);assert.equal(saved.aiUsage.totalCalls,1);});
});

test('ended pursuit stops its old cue without completing independent arrangement or reviving the pursuit',async()=>{
 const initial=await setup();let stage=0;
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.arrangementUpdates=[arrangement(input,initial.minute+45)];}
  else if(stage===1){v.pursuitUpdates=[{operation:'drop',id:'owner:tea',version:1,node:null,references:[],reason:'我已不想繼續'}];v.durationMinutes=120;}
  else {const item=input.self.arrangements.items[0];assert.equal(item.pursuitState.status,'ended');assert.equal(item.pursuit.version,1);assert.equal(item.pursuitState.currentVersion,2);assert.equal(input.self.arrangementCues.length,0);}
  return v;
 },async frames=>{assert.equal((await advance()).status,200);stage=1;assert.equal((await advance()).status,200);stage=2;assert.equal((await advance()).status,200);assert.equal(frames.length,2);await post({operation:'intervene',target:'owner',text:'打個招呼'});assert.equal((await advance()).status,200);const saved=(await read()).characters[0];assert.equal(saved.arrangements.items[0].status,'active');assert.equal(saved.intents.find(i=>i.id==='owner:tea').status,'dropped');assert.equal(frames.length,3);});
});

test('unrelated pursuit revision keeps the original link version and does not rearm the same known condition',async()=>{
 const initial=await setup();let stage=0;
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.durationMinutes=120;v.arrangementUpdates=[arrangement(input,initial.minute+30)];}
  else {continuing(input,v);if(stage===1){assert.equal(input.self.arrangementCues.length,1);const old=input.self.intents.find(n=>n.id==='owner:tea');v.pursuitUpdates=[{operation:'upsert',id:old.id,version:old.version,node:Object.fromEntries(['id','content','intensity','importance','urgency','context','kind','scope','satisfaction','parents'].map(k=>[k,old[k]])),references:[],reason:'只是再次保留原追求'}];}
   else {assert.equal(input.self.arrangements.items[0].pursuit.version,1);assert.equal(input.self.arrangements.items[0].pursuitState.currentVersion,2);assert.equal(input.self.arrangementCues.length,0);}}
  return v;
 },async frames=>{assert.equal((await advance()).status,200);stage=1;assert.equal((await advance()).status,200);stage=2;await post({operation:'intervene',target:'owner',text:'普通問候'});assert.equal((await advance()).status,200);assert.equal((await advance()).status,200);assert.equal(frames.length,3);});
});

test('forgotten arrangement detail is not reconstructed from an active pursuit link when time arrives',async()=>{
 const initial=await setup();let stage=0;const secret='精確安排原文只應由記憶可知';
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.arrangementUpdates=[{...arrangement(input,initial.minute+30),text:secret}];}
  else {assert.equal(input.self.arrangements.items.length,0);assert.equal(input.self.arrangementCues.length,0);assert.doesNotMatch(JSON.stringify(input),new RegExp(secret));existing(input,v);}
  return v;
 },async frames=>{assert.equal((await advance()).status,200);for(let i=0;i<82;i++)assert.equal((await post({operation:'intervene',target:'owner',text:`後來的普通經歷${i}`})).status,200);stage=1;assert.equal((await advance()).status,200);const saved=(await read()).characters[0];assert.equal(saved.arrangements.items[0].text,secret);assert.equal(saved.arrangements.items[0].pursuit.id,'owner:tea');assert.equal(saved.intents.find(n=>n.id==='owner:tea').status,'active');assert.equal(frames.length,2);});
});

test('six known linked cues share existing decisions, and omitted opportunities stay unhandled until actually displayed',async()=>{
 const initial=await setup();let stage=0;
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.durationMinutes=240;v.arrangementUpdates=Array.from({length:3},(_,i)=>arrangement(input,initial.minute+60,`later-${i}`));}
  else if(stage===1){continuing(input,v);v.arrangementUpdates=Array.from({length:3},(_,i)=>arrangement(input,initial.minute+60,`later-${i+3}`,{id:'owner:tea',version:1}));}
  else {continuing(input,v);assert.equal(input.self.arrangementCues.length,stage===2?4:2);assert.equal(input.self.arrangementCueGap,stage===2?2:0);}
  return v;
 },async frames=>{assert.equal((await advance()).status,200);stage=1;await post({operation:'intervene',target:'owner',text:'只是換個話題問候'});assert.equal((await advance()).status,200);stage=2;assert.equal((await advance()).status,200);assert.equal(frames.length,2);assert.equal((await advance()).status,200);assert.equal(frames.length,3);const four=(await read()).characters[0].arrangements.items;assert.equal(four.filter(i=>i.cue?.trigger?.handledAt!==undefined).length,4);stage=3;assert.equal((await advance()).status,200);assert.equal(frames.length,4);assert.equal((await read()).characters[0].arrangements.items.filter(i=>i.cue?.trigger?.handledAt!==undefined).length,6);});
});

test('failed due-cue commit and original-ID replay do not consume the opportunity; next committed decision may consider it',async()=>{
 const initial=await setup();let stage=0;
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.durationMinutes=120;v.arrangementUpdates=[arrangement(input,initial.minute+30)];}else {assert.equal(input.self.arrangementCues.length,1);continuing(input,v);}return v;},async frames=>{
  assert.equal((await advance()).status,200);const before=(await read()).characters[0];stage=1;store.conflictOnNextSave();const operationId=`${Date.now()}:${crypto.randomUUID()}`;assert.equal((await advance({operationId})).status,502);assert.deepEqual((await read()).characters[0],before);assert.equal(frames.length,2);assert.equal((await advance({operationId})).status,502);assert.equal(frames.length,2);assert.equal((await advance()).status,200);assert.equal(frames.length,3);assert.ok((await read()).characters[0].arrangements.items[0].cue.trigger.handledAt);
 });
});

test('takeover suspends linked opportunities and return offers one known normal decision without a background slot',async()=>{
 const initial=await setup();let stage=0;
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.arrangementUpdates=[arrangement(input,initial.minute+30)];}else {assert.equal(input.self.arrangementCues.length,1);existing(input,v);}return v;},async frames=>{assert.equal((await advance()).status,200);stage=1;await post({operation:'takeover'});for(let i=0;i<3;i++)assert.equal((await advance()).status,200);assert.equal(frames.length,1);const waiting=(await read()).characters[0];assert.equal(waiting.arrangements.items[0].cue,undefined);await read();assert.equal(frames.length,1);await post({operation:'return-control'});assert.equal((await advance()).status,200);assert.equal(frames.length,2);assert.equal((await read()).characters[0].arrangements.items[0].status,'active');});
});

test('explicit waiting and deferred assessments retain the same pursuit while a linked opportunity remains optional',async()=>{
 const initial=await setup();let stage=0;
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.arrangementUpdates=[arrangement(input,initial.minute+30)];}
  else {const p=input.self.intents.find(n=>n.id==='owner:tea');if(stage===1){assert.equal(input.self.arrangementCues.length,1);v.pursuitUpdates=[{operation:'assess',id:p.id,version:p.version,node:{status:'active',progress:'waiting',basis:{kind:'subjective',text:'我還想做，只是先等一等'}},references:[],reason:'目前仍願意等待'}];}
   else {assert.equal(p.progress,'waiting');v.pursuitUpdates=[{operation:'assess',id:p.id,version:p.version,node:{status:'active',progress:'deferred',basis:{kind:'subjective',text:'沒有可靠新條件，先留待日後正常決策'}},references:[],reason:'我現在想先做別的事'}];}
  }return v;
 },async frames=>{assert.equal((await advance()).status,200);stage=1;assert.equal((await advance()).status,200);const waiting=(await read()).characters[0];assert.equal(waiting.intents.find(n=>n.id==='owner:tea').progress,'waiting');assert.equal(waiting.arrangements.items[0].status,'active');stage=2;assert.equal((await advance()).status,200);const deferred=(await read()).characters[0];assert.equal(deferred.intents.find(n=>n.id==='owner:tea').progress,'deferred');assert.equal(deferred.intents.find(n=>n.id==='owner:tea').id,waiting.intents.find(n=>n.id==='owner:tea').id);assert.equal(frames.length,3);});
});

test('completing an arrangement is independent of whether its linked pursuit is satisfied',async()=>{
 const initial=await setup();let stage=0;
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.arrangementUpdates=[arrangement(input,initial.minute+30)];}
  else {const saved=input.self.arrangements.items[0];v.arrangementUpdates=[{...arrangement(input,saved.condition.minute,saved.id,saved.pursuit),version:saved.version,operation:'complete',text:saved.text,reason:'這次已重新考慮，安排可完成，但追求仍在'}];existing(input,v);v.durationMinutes=120;}
  return v;
 },async frames=>{assert.equal((await advance()).status,200);stage=1;assert.equal((await advance()).status,200);const saved=(await read()).characters[0];assert.equal(saved.arrangements.items[0].status,'completed');assert.equal(saved.intents.find(i=>i.id==='owner:tea').status,'active');assert.equal((await advance()).status,200);assert.equal(frames.length,2);});
});

test('a known contextual opportunity uses the existing matcher once and never requires a model per pursuit level',async()=>{
 await setup();let stage=0;
 await transport(input=>{const v=decision(input);if(stage===0){accept(input,v);v.durationMinutes=120;v.arrangementUpdates=[{...arrangement(input,0),condition:{kind:'context',region:input.self.region}}];}
  else {assert.equal(input.self.arrangementCues.length,1);continuing(input,v);}return v;
 },async frames=>{assert.equal((await advance()).status,200);stage=1;assert.equal((await advance()).status,200);assert.equal((await advance()).status,200);assert.equal(frames.length,2);});
});

test('real confirmed sleep is not awakened by a linked time arrangement and does not add reconsideration dispatches',async()=>{
 const initial=await setup(),c=initial.characters[0];c.needs={version:1,activatedAt:initial.minute,updatedAt:initial.minute,values:{hunger:20,thirst:20,fatigue:70,sleep:80},assessed:{hunger:0,thirst:0,fatigue:2,sleep:2},history:[],dropped:0};store.install(initial);await post({operation:'set-model-key',key:'fixture-key'});
 await transport(input=>{if(input.contractVersion==='world-adjudication.v1')return {status:'accepted',effects:[],stages:[],check:null,routine:null,completionMinutes:480,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}};
  const v=decision(input);accept(input,v);v.action={type:'propose',target:'cafe',content:'在角落睡一覺',purpose:'恢復睡眠'};v.methodAssessment.selectedAction={type:'propose',target:'cafe'};v.timeIntent={kind:'completion',maxMinutes:null};v.arrangementUpdates=[arrangement(input,initial.minute+30)];return v;
 },async frames=>{for(let i=0;i<5;i++){const response=await advance();assert.equal(response.status,200,await response.clone().text());}const saved=(await read()).characters[0];assert.equal(saved.plan.bodyActivity.kind,'sleep');assert.equal(saved.arrangements.items[0].cue,undefined);assert.equal(saved.arrangements.items[0].status,'active');assert.equal(frames.filter(input=>input.contractVersion==='npc-decision.v3').length,1);assert.equal(frames.filter(input=>input.contractVersion==='world-adjudication.v1').length,1);});
});
