/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {scenario,proposal,vessel}=require('./routine-program-fixture.cjs');
const denied={status:'denied',completionMinutes:null,effects:[],stages:[],check:null,routine:null};
const rest={type:'rest',target:'',content:'先休息',purpose:'休息',mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[]};
const feedback=input=>input.self.shortTerm.filter(m=>m.text.includes('行動回饋'));
async function advance(s){const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();}

test('known tea denial survives SQLite reload into the next actual NPC request with its action, object and time',async()=>{
 const cup={...vessel('cup-a'),holder:'owner',state:{contents:'tea'}},s=await scenario({reply:denied,objects:[cup],decision:{...proposal,target:'cup-a'}});
 try{
  const first=await advance(s);s.choose(rest);await advance(s);
  const request=s.inputs.filter(entry=>entry.input.self)[1].request,input=JSON.parse(request.messages[1].content),result=feedback(input).at(-1);
  assert.ok(result,'persisted action feedback must reach actual messages');
  assert.match(result.text,/cup-a/);assert.match(result.text,/泡一杯/);assert.match(result.text,/沒有新增/);assert.match(result.text,/contents.*tea/);assert.equal(result.time,first.minute);
  assert.equal((await s.read()).objects.filter(o=>o.kind==='utensil').length,2);
  assert.doesNotMatch(result.text,/茶葉.*耗盡|allowedTo|骰|DC|大失敗/);
 }finally{s.restore();}
});

test('staged partial and complete work reaches next messages without internal outcome grades or premature completion',async()=>{
 const work={...vessel('work'),holder:'owner',label:'作品',state:{progress:'raw'},stateTransitions:{progress:['raw','partial','complete']}};
 const reply={status:'accepted',completionMinutes:30,effects:[],stages:[],check:{difficulty:12,ability:'加工'},branches:[{outcomes:['critical-success','success','mixed','failure','critical-failure'],effects:[{kind:'state',objectId:'work',expectedRevision:2,key:'progress',value:'complete'}],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:1,key:'progress',value:'partial'}]}]}]};
 const s=await scenario({objects:[work],reply,decision:{...proposal,target:'work',content:'加工作品',durationMinutes:30}});
 try{
  let w=await advance(s);assert.equal(w.objects.find(o=>o.id==='work').state.progress,'partial');assert.ok(w.characters[0].plan);
  w=await advance(s);assert.equal(w.objects.find(o=>o.id==='work').state.progress,'complete');s.choose(rest);await advance(s);
  const input=s.inputs.filter(entry=>entry.input.self).at(-1).input,results=feedback(input);
  assert.ok(results.some(m=>/progress.*partial/.test(m.text)));assert.ok(results.some(m=>/progress.*complete/.test(m.text)));
  assert.ok(!results.find(m=>/progress.*partial/.test(m.text)).text.includes('活動已完成'));
  assert.doesNotMatch(JSON.stringify({activity:input.self.activity,results}),/大成功|部分成功|大失敗|骰值|DC|結果為/);
  assert.equal(s.counts().npc,2);assert.equal(s.counts().judgments,1);
 }finally{s.restore();}
});

function observed(text,time=1260){return {id:'prior-observation',characterId:'owner',version:1,time,text,source:{kind:'observation',person:'cass',region:'cafe-front',sense:'sight',clarity:'clear'},observation:{id:'prior-observation',time,text,sense:'sight',kind:'activity',clarity:'clear',source:'cass',region:'cafe-front'}};}
test('a consumed specified meal only retains the actor own sourced observation, never the adjudicator claim or whole inventory',async()=>{
 for(const known of [false,true]){
  const s=await scenario({reply:{...denied,explanation:{summary:'SECRET-MODEL-CLAIM',facts:[]}},decision:{...proposal,target:'meal',content:'取用指定餐點',purpose:'吃飯'},modify:w=>{
   w.objects.push({...vessel('meal'),kind:'food',label:'指定餐點',lifecycle:'consumed',state:{},allowedTo:['SECRET-MEMBER']});
   w.characters[0].shortTerm=known?[observed('我看見 Cass 吃完指定餐點 [meal]。')]:[];w.characters[0].memories=[];
  }});
  try{
   await advance(s);s.choose(rest);await advance(s);const input=s.inputs.filter(entry=>entry.input.self)[1].input,text=JSON.stringify(input);
   assert.equal(text.includes('我看見 Cass 吃完指定餐點'),known);assert.doesNotMatch(text,/SECRET-MODEL-CLAIM|SECRET-MEMBER|allowedTo/);assert.ok(input.supplies.every(supply=>!Object.hasOwn(supply,'remaining')),'world stock stays private; pursuit capacity remaining is independent');
   const result=feedback(input).at(-1);assert.match(result.text,/meal/);assert.match(result.text,/沒有新增/);
   if(known){const observation=input.self.shortTerm.find(m=>m.id==='prior-observation');assert.equal(observation.source.kind,'observation');assert.equal(observation.source.person,'cass');}
   assert.equal((await s.read()).objects.find(o=>o.id==='meal').lifecycle,'consumed');
  }finally{s.restore();}
 }
});

test('identical known histories produce identical feedback when only hidden stock, lists, state and unverified reasons change',async()=>{
 const outputs=[];
 for(const variant of [0,1]){
  const s=await scenario({reply:{...denied,explanation:{summary:'PRIVATE-REASON-'+variant,facts:[]}},decision:{...proposal,target:'cup-a'},modify:w=>{
   // Equivalent histories include the same known handset identity; new activation must not add unrelated UUID variance.
   w.objects.push({...vessel('feedback-phone'),kind:'phone',holder:'owner',state:{condition:'sound'}});
   w.objects.find(o=>o.id==='cup-a').state.hidden='PRIVATE-STATE-'+variant;w.objects.find(o=>o.id==='cup-a').stateExposure={hidden:'hidden'};
   w.supplies=[{id:'supply',label:'有限茶葉',region:'cafe-front',kind:'food',initialState:{},remaining:variant,owner:'owner',knownTo:['owner'],allowedTo:variant?['owner']:['PRIVATE-LIST']}];
  }});
  try{await advance(s);s.choose(rest);await advance(s);const input=s.inputs.filter(entry=>entry.input.self)[1].input;outputs.push({activity:input.self.activity,feedback:feedback(input).map(m=>({text:m.text,time:m.time})),objects:input.objects,supplies:input.supplies});assert.doesNotMatch(JSON.stringify(input),/PRIVATE-/);}finally{s.restore();}
 }
 assert.deepEqual(outputs[0],outputs[1]);
});

test('free routine reuse retains known broken utensil context while private supply and grant changes cannot alter its feedback',async()=>{
 const values=[];
 for(const variant of [0,1]){
  const s=await scenario({decision:{...proposal,type:'work',target:'tea',content:'泡茶',purpose:'泡茶',durationMinutes:15},modify:w=>{
   // Keep this public device identical while varying only hidden supply/grant facts.
   w.objects.push({...vessel('feedback-phone'),kind:'phone',holder:'owner',state:{condition:'sound'}});
   w.routineRules=[{id:'known-tea',version:1,family:'cafe-service',operations:['tea'],origin:'cafe',knownTo:['owner']}];
   const cup=w.objects.find(o=>o.id==='cup-a');cup.state.condition='broken';cup.stateTransitions.condition=['broken','sound'];
   w.objects=w.objects.filter(o=>o.id!=='cup-b');cup.owner='private-owner';cup.allowedTo=variant?['owner']:['private-list'];
   w.supplies=[{id:'tea-leaves',label:'茶葉',region:'cafe-front',remaining:variant,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];
  }});
  try{
   await advance(s);s.choose(rest);await advance(s);const input=s.inputs.filter(entry=>entry.input.self)[1].input;
   assert.equal(s.counts().judgments,0);assert.match(input.self.activity,/器具.*損壞/);assert.ok(feedback(input).at(-1).text.includes('cup-a'));assert.doesNotMatch(JSON.stringify(input),/private-owner|private-list|材料已用完|allowedTo/);assert.ok(input.supplies.every(supply=>!Object.hasOwn(supply,'remaining')));
   values.push({activity:input.self.activity,feedback:feedback(input).map(m=>({time:m.time,text:m.text}))});
  }finally{s.restore();}
 }
 assert.deepEqual(values[0],values[1]);
});

test('unsubmitted results roll back, replay adds no experience or model calls, and legacy worlds never reconstruct feedback from traces',async()=>{
 const store=load('store');
 for(const fault of ['throwBeforeNextSave','conflictOnNextSave',null]){
  const s=await scenario({reply:denied,decision:{...proposal,target:'cup-a'}});
  try{
   const body={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};if(fault)store[fault]();
   const response=await s.post(body);assert.equal(response.status,fault?502:200);const first=await s.read(),calls=s.counts();
   assert.equal(first.characters[0].shortTerm.some(m=>m.text.includes('行動回饋')),!fault);
   await s.post(body);assert.deepEqual(s.counts(),calls);assert.deepEqual((await s.read()).characters[0].shortTerm,first.characters[0].shortTerm);
   // Explicit legacy/forgotten fixture: no new field and no resurrection from
   // the existing private trace of the previous accepted operation.
   const w=await s.read();delete w.characters[0].shortTerm;w.characters[0].memories=[];w.characters[0].observations=[];store.replaceCommittedWorld(w);
   s.choose(rest);await advance(s);const next=s.inputs.filter(e=>e.input.self).at(-1).input;assert.equal(feedback(next).length,0);
  }finally{s.restore();}
 }
});

test('new sourced observations coexist with historical denial and a subjective success is never corrected from hidden truth',async()=>{
 const store=load('store'),s=await scenario({reply:denied,decision:{...proposal,target:'meal',content:'取得餐點'},modify:w=>{
  w.characters[0].shortTerm=[observed('我覺得已經把餐點放進口袋。')];w.characters[0].memories=[];
  w.objects.push({...vessel('meal'),label:'餐點',kind:'food',lifecycle:'consumed',state:{},knownTo:[]});
 }});
 try{
  await advance(s);const w=await s.read(),prior=w.characters[0].shortTerm.find(m=>m.id==='prior-observation');assert.equal(prior.text,'我覺得已經把餐點放進口袋。');
  const fresh=observed('剛收到 Cass 的訊息：另一份餐點已放到桌上。',w.minute+1);fresh.id='new-message';fresh.source={kind:'observation',person:'cass',region:'cafe-front',sense:'hearing',clarity:'clear'};fresh.observation.id=fresh.id;fresh.observation.source='cass';fresh.observation.sense='hearing';w.characters[0].shortTerm.push(fresh);load('memory').projectMemories(w.characters[0]);store.replaceCommittedWorld(w);
  s.choose({...rest,type:'say',target:'observer',content:'我先不吃，晚點再說'});await advance(s);
  const input=s.inputs.filter(e=>e.input.self).at(-1).input;assert.ok(input.self.shortTerm.some(m=>m.text===prior.text));assert.ok(input.self.shortTerm.some(m=>m.id==='new-message'));assert.ok(feedback(input).length);
  assert.doesNotMatch(JSON.stringify(input.self),/其實.*吃掉|你.*弄錯|consumed|已消耗/);
 }finally{s.restore();}
});

test('actor feedback does not disclose the private proposal to another present NPC through a work observation',async()=>{
 const s=await scenario({reply:{status:'accepted',completionMinutes:15,effects:[{kind:'state',objectId:'cup-a',expectedRevision:1,key:'contents',value:'water'}],stages:[],check:null},decision:{...proposal,target:'cup-a',content:'PRIVATE-PROPOSAL'},modify:w=>{
  const peer=structuredClone(w.characters[0]);peer.id='peer';peer.name='旁人';peer.memories=[];peer.shortTerm=[];peer.longTerm=[];peer.relationships={};delete peer.control;w.characters.push(peer);
 }}),transport=global.fetch;
 global.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.self?.id==='peer'){s.inputs.push({input,request:JSON.parse(init.body)});return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),rest))}}]});}return transport(url,init);};
 try{await advance(s);const peer=s.inputs.find(e=>e.input.self?.id==='peer').input;assert.doesNotMatch(JSON.stringify(peer),/PRIVATE-PROPOSAL|行動回饋/);const w=await s.read();assert.ok(w.characters.find(c=>c.id==='owner').shortTerm.some(m=>m.text.includes('PRIVATE-PROPOSAL')));}finally{s.restore();}
});

test('the next ordinary decision can wait, rest, ask, refuse or choose another method without feedback rewriting its intentions',async()=>{
 const intent={id:'independent',content:'由我決定如何生活',intensity:'high',importance:'medium',urgency:'low',context:'仍保留原本方向'};
 for(const next of [{...rest,content:'等待一會兒'},{...rest},{...rest,type:'say',target:'observer',content:'可以幫我找別的工具嗎？'},{...rest,type:'say',target:'observer',content:'我不想做這件事'},{...proposal,target:'cup-a',content:'換一種方法處理杯子',purpose:'整理'}]){
  const s=await scenario({reply:denied,decision:{...proposal,target:'cup-a',intents:[intent]}});
  try{await advance(s);const retained=(await s.read()).characters[0].intents;assert.ok(retained.some(node=>node.id==='owner:independent'&&node.scope===intent.content));assert.ok(retained.some(node=>node.kind==='direction'));s.choose({...next,intents:[intent]});await advance(s);const input=s.inputs.filter(e=>e.input.self).at(-1).input;const projected=retained.map(node=>{const visible=structuredClone(node);delete visible.reason;return {...visible,sourceGaps:{formation:0,assessment:0}};});assert.deepEqual(input.self.intents,projected);for(const node of input.self.intents){assert.equal(Object.hasOwn(node,'reason'),false);assert.deepEqual(node.sourceGaps,{formation:0,assessment:0});}assert.ok(feedback(input).length);assert.deepEqual((await s.read()).characters[0].intents,retained);if(next.type==='propose'){const judgment=s.inputs.filter(e=>e.input.contractVersion==='world-adjudication.v1').at(-1).input;assert.equal(judgment.action.content,next.content);}}
  finally{s.restore();}
 }
});

test('bounded short-term feedback expires normally instead of reviving from private traces',async()=>{
 const s=await scenario({reply:denied,decision:{...proposal,target:'cup-a'}});
 try{
  await advance(s);await s.post({operation:'takeover'});
  for(let i=0;i<81;i++)assert.equal((await s.post({operation:'intervene',target:'owner',text:'近期線索 '+i})).status,200);
  await s.post({operation:'return-control'});s.choose(rest);await advance(s);
  const input=s.inputs.filter(e=>e.input.self).at(-1).input;assert.equal(feedback(input).length,0);assert.ok(input.self.shortTerm.length<=80);
 }finally{s.restore();}
});

test('an actually committed hidden consequence does not correct an existing subjective success or leak the objective value',async()=>{
 const s=await scenario({decision:{...proposal,target:'cup-a',content:'試著調整器具'},reply:{status:'accepted',completionMinutes:15,effects:[{kind:'change-state',version:1,target:{type:'object',id:'cup-a'},expectedRevision:1,changes:[{key:'innerCondition',from:'initial',value:'HIDDEN-BROKEN'}],exposure:'hidden',access:'authorized',reason:'PRIVATE-INTERNAL-REASON'}],stages:[],check:null},modify:w=>{
  const cup=w.objects.find(o=>o.id==='cup-a');cup.state.innerCondition='initial';cup.stateExposure={innerCondition:'hidden'};
  w.characters[0].shortTerm=[observed('從外表看來，我覺得器具已修好了。')];w.characters[0].memories=[];
 }});
 try{
  const first=await advance(s);assert.equal(first.objects.find(o=>o.id==='cup-a').state.innerCondition,'HIDDEN-BROKEN');s.choose(rest);await advance(s);
  const input=s.inputs.filter(e=>e.input.self).at(-1).input,text=JSON.stringify(input);assert.ok(text.includes('從外表看來，我覺得器具已修好了。'));assert.doesNotMatch(text,/HIDDEN-BROKEN|PRIVATE-INTERNAL-REASON|innerCondition|其實.*壞|你.*弄錯/);
  assert.equal(input.self.shortTerm.find(m=>m.id==='prior-observation').source.kind,'observation');assert.ok(feedback(input).length);
 }finally{s.restore();}
});

test('a legal batch with long multibyte labels keeps the additional feedback inside the existing short-memory limit',async()=>{
 const objects=Array.from({length:4},(_,i)=>({...vessel('batch-'+i),holder:'owner',label:'物'.repeat(200)}));
 const s=await scenario({objects,decision:{...proposal,target:'batch-0',content:'說'.repeat(500)},reply:{status:'accepted',completionMinutes:15,effects:objects.map(o=>({kind:'state',objectId:o.id,expectedRevision:1,key:'contents',value:'water'})),stages:[],check:null}});
 try{await advance(s);s.choose(rest);await advance(s);const input=s.inputs.filter(e=>e.input.self).at(-1).input;assert.ok(feedback(input).length);assert.ok(feedback(input).every(m=>Buffer.byteLength(m.text)<=4096));assert.equal((await s.read()).objects.filter(o=>o.id.startsWith('batch-')&&o.state.contents==='water').length,4);}finally{s.restore();}
});

test('saved phased periods and selected attempts ending after their last effect persist a terminal result without repeating effects',async()=>{
 for(const mode of ['open-ended','selected','legacy']){
  // Explicit old saved-plan fixture. The current API does not accept new
  // open-ended world proposals; compatibility must still finish stored plans.
  const s=await scenario({modify:w=>{w.characters[0].plan={action:{type:'propose',target:'cup-a',content:'整理器具半小時'},startedAt:w.minute,until:w.minute+30,attention:'',modelKey:'openai:gpt-6-luna',...(mode==='open-ended'?{timeIntent:{kind:'open-ended',maxMinutes:null}}:{}),...(mode==='selected'?{selectedResult:{outcome:'mixed',branch:0}}:{}),phases:{origin:'cafe-front',cursor:0,stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'cup-a',expectedRevision:1,key:'contents',value:'water'}]}]}};}});
  try{
   let w=await advance(s),cup=w.objects.find(o=>o.id==='cup-a');assert.equal(cup.revision,2);assert.equal(cup.state.contents,'water');assert.ok(w.characters[0].plan);const firstCount=w.characters[0].shortTerm.filter(m=>m.text.includes('行動回饋')).length;
   const operation={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(operation)).status,200);w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,mode==='open-ended'?/時段.*到期/:/已結束/);assert.doesNotMatch(w.characters[0].activity,/活動已完成|尚未完成|部分成功/);assert.equal(w.objects.find(o=>o.id==='cup-a').revision,2);assert.equal(w.characters[0].shortTerm.filter(m=>m.text.includes('行動回饋')).length,firstCount+1);
   const counts=s.counts();await s.post(operation);assert.deepEqual(s.counts(),counts);assert.deepEqual((await s.read()).characters[0].shortTerm,w.characters[0].shortTerm);
   s.choose(rest);await advance(s);const input=s.inputs.filter(e=>e.input.self).at(-1).input;assert.equal(input.self.plan,undefined);assert.equal(input.currentActivity,null);assert.match(input.self.activity,mode==='open-ended'?/時段.*到期/:/已結束/);assert.match(feedback(input).at(-1).text,/到期|已結束/);assert.match(feedback(input).at(-1).text,/活動始於/);assert.equal((await s.read()).objects.find(o=>o.id==='cup-a').revision,2);assert.equal(s.counts().judgments,0);assert.equal(s.counts().npc,1);
  }finally{s.restore();}
 }
});
