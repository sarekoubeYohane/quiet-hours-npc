/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const proposal={type:'propose',target:'workpiece',content:'用現有材料加工這件作品',purpose:'完成作品',mood:'平靜',durationMinutes:30,timeIntent:{kind:'completion',maxMinutes:null},intents:[]};
const state=(value,revision=1)=>({kind:'state',objectId:'workpiece',expectedRevision:revision,key:'progress',value});
const outcomes=['critical-success','success','mixed','failure','critical-failure'];
const candidate=()=>({status:'accepted',completionMinutes:30,effects:[],stages:[],check:{difficulty:12,ability:'加工'},branches:[{outcomes:outcomes.slice(0,2),effects:[state('complete')],stages:[]},{outcomes:['mixed'],effects:[state('partial')],stages:[]},{outcomes:outcomes.slice(3),effects:[{kind:'consume',objectId:'material',expectedRevision:1}],stages:[]}]});
async function scenario({die=2,reply=candidate(),decision=proposal}={}){
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-world'};w.contextId='result-fixture';w.objects=[{id:'workpiece',source:'fixture',label:'練習作品',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{progress:'raw'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{progress:['raw','partial','complete']}},{id:'material',source:'fixture-material',label:'一份材料',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{},lifecycle:'active',kind:'food',knownTo:['owner'],allowedTo:['owner']}];store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const oldFetch=global.fetch,oldRandom=Math.random;let npc=0,judgments=0,dice=0;const requests=[];
 global.fetch=async(_url,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);requests.push({input,request});if(input.contractVersion==='world-adjudication.v1'){judgments++;return completion(reply);}npc++;return completion(decision);};Math.random=()=>{dice++;return (die-.5)/20;};
 return {post,read:async()=>(await(await GET()).json()).world,choose:v=>decision=v,reply:v=>reply=v,counts:()=>({npc,judgments,dice}),requests,restore:()=>{global.fetch=oldFetch;Math.random=oldRandom;}};
}
const advance=async(s,extra={})=>{const r=await s.post({operation:'advance',minutes:15,...extra});assert.equal(r.status,200,await r.clone().text());return s.read();};
test('a free failed result consumes only its confirmed material at completion and survives reload and replay',async()=>{
 const s=await scenario();try{let w=await advance(s);assert.equal(w.objects[1].lifecycle,'active');assert.ok(w.characters[0].plan);const op=Date.now()+':'+crypto.randomUUID();w=await advance(s,{operationId:op});assert.equal(w.objects[1].lifecycle,'consumed');assert.match(w.characters[0].activity,/這次嘗試已結束/);assert.doesNotMatch(w.characters[0].activity,/大成功|部分成功|大失敗/);assert.equal(w.objects[0].state.progress,'raw');assert.equal(w.characters[0].plan,undefined);assert.equal(w.routineRules,undefined);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:1});await advance(s,{operationId:op});assert.deepEqual((await s.read()).objects,w.objects);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:1});}finally{s.restore();}
});
test('all five outcome bands select only the shared confirmed branch and retain their chosen result while active',async()=>{
 for(const [die,outcome,progress,material] of [[20,'critical-success','complete','active'],[12,'success','complete','active'],[6,'mixed','partial','active'],[2,'failure','raw','consumed'],[1,'critical-failure','raw','consumed']]){
  const s=await scenario({die});try{let w=await advance(s);assert.equal(w.characters[0].plan.selectedResult.outcome,outcome);assert.equal(w.characters[0].plan.selectedResult.resolution.roll,die);assert.equal(w.objects[0].state.progress,'raw');w=await advance(s);assert.equal(w.objects[0].state.progress,progress);assert.equal(w.objects[1].lifecycle,material);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:1});assert.equal(Object.values(w.freeTrials)[0].outcome,outcome);}finally{s.restore();}
 }
});
test('an empty failure branch occupies its confirmed time without inventing a known success or exposing its internal grade',async()=>{
 const reply=candidate();reply.branches[2].effects=[];const s=await scenario({reply});try{let w=await advance(s);assert.ok(w.characters[0].plan);w=await advance(s);assert.equal(w.characters[0].plan,undefined);assert.equal(w.objects[1].lifecycle,'active');assert.match(w.characters[0].activity,/這次嘗試已結束/);assert.doesNotMatch(w.characters[0].activity,/大成功|部分成功|大失敗/);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:1});}finally{s.restore();}
});
test('all branches are validated before dice, and conflicts or an illegal unselected branch atomically reject with usage',async()=>{
 for(const change of [r=>r.branches[0].effects[0].objectId='hidden',r=>r.branches[0].outcomes.push('failure'),r=>r.branches[0].outcomes=['success'],r=>r.effects.push(state('complete')),r=>r.branches[0].effects[0].value='unlisted']){
  const reply=candidate();change(reply);const s=await scenario({reply});try{const before=await s.read(),op=Date.now()+':'+crypto.randomUUID(),body={operation:'advance',minutes:15,operationId:op};const response=await s.post(body);assert.equal(response.status,502);const w=await s.read();assert.equal(w.turn,before.turn);assert.deepEqual(w.objects,before.objects);assert.equal(w.freeTrials,undefined);assert.equal(w.routineRules,undefined);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:0});assert.equal(w.aiUsage.totalCalls,2);assert.equal((await s.post(body)).status,502);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:0});}finally{s.restore();}
 }
});
test('an insufficient explicit cap validates all outcomes without rolling or starting, and deterministic branches never roll',async()=>{
 const s=await scenario({decision:{...proposal,timeIntent:{kind:'completion',maxMinutes:15}}});try{const w=await advance(s);assert.equal(w.objects[0].state.progress,'raw');assert.equal(w.objects[1].lifecycle,'active');assert.equal(w.characters[0].plan,undefined);assert.equal(w.freeTrials,undefined);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:0});}finally{s.restore();}
 const reply=candidate();reply.check=null;reply.branches=[{outcomes,effects:[state('complete')],stages:[]}];const d=await scenario({reply});try{await advance(d);const w=await advance(d);assert.equal(w.objects[0].state.progress,'complete');assert.deepEqual(d.counts(),{npc:1,judgments:1,dice:0});}finally{d.restore();}
});
test('paraphrases, changed DC, reordered and regrouped branches, unrelated added references, or revision-only changes do not wash a retained failure',async()=>{
 const reply=candidate();reply.branches[2].effects=[];const s=await scenario({reply});try{
  await advance(s);await advance(s);const changed=candidate();changed.check={difficulty:8,ability:'另一種描述'};changed.branches=[{outcomes:['failure'],effects:[],stages:[]},{outcomes:['critical-failure'],effects:[],stages:[]},...changed.branches.slice(0,2).reverse()];s.reply(changed);s.choose({...proposal,content:'換個說法重新試試看'});
  let w=await s.read();w.objects[0].revision++;w.objects[0].label='只改名字';w.objects.push({...structuredClone(w.objects[0]),id:'unrelated',source:'unrelated'});changed.branches.find(b=>b.outcomes.includes('success')).effects.push({...state('partial',2),objectId:'unrelated'});changed.branches.forEach(b=>b.effects.forEach(e=>{if(e.objectId==='workpiece')e.expectedRevision=2;}));store.replaceCommittedWorld(w);w=await advance(s);assert.equal(w.characters[0].plan.selectedResult.outcome,'failure');await advance(s);assert.deepEqual(s.counts(),{npc:2,judgments:2,dice:1});
  // A committed semantic premise change is a legitimate new physical attempt.
  w=await s.read();w.objects[0].state.progress='partial';w.objects[0].revision++;store.replaceCommittedWorld(w);changed.branches.find(b=>b.outcomes.includes('mixed')).effects[0].value='complete';changed.branches.forEach(b=>b.effects.forEach(e=>{if(e.objectId==='workpiece')e.expectedRevision=w.objects[0].revision;}));s.reply(changed);await advance(s);assert.deepEqual(s.counts(),{npc:3,judgments:3,dice:2});
 }finally{s.restore();}
});
const staged=()=>{const r=candidate();r.completionMinutes=45;r.branches[0].effects=[state('complete',2)];r.branches[0].stages=[{afterMinutes:15,preconditions:[{objectId:'workpiece',revision:1,region:'cafe-front',holder:'owner',state:[{key:'progress',value:'raw'}]}],effects:[state('partial')]}];return r;};
test('new information can continue the selected branch without reroll, while takeover or changed premises preserve partial work and stop future effects',async()=>{
 for(const mode of ['continue','takeover','moved']){
  const s=await scenario({die:20,reply:staged()});try{let w=await advance(s),plan=structuredClone(w.characters[0].plan);assert.equal(w.objects[0].state.progress,'partial');assert.equal(plan.phases.cursor,1);
   if(mode==='continue'){assert.equal((await s.post({operation:'intervene',target:'owner',text:'現在方便說話嗎？'})).status,200);s.choose({...proposal,type:'continue'});w=await advance(s);assert.equal(w.characters[0].plan.startedAt,plan.startedAt);assert.equal(w.characters[0].plan.until,plan.until);assert.deepEqual(w.characters[0].plan.selectedResult,plan.selectedResult);w=await advance(s);assert.equal(w.objects[0].state.progress,'complete');assert.deepEqual(s.counts(),{npc:2,judgments:1,dice:1});}
   else if(mode==='takeover'){assert.equal((await s.post({operation:'takeover'})).status,200);w=await advance(s);w=await advance(s);assert.equal(w.objects[0].state.progress,'partial');assert.equal(w.characters[0].plan,undefined);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:1});}
   else {w.objects[0].region='cafe-back';w.objects[0].revision++;store.replaceCommittedWorld(w);w=await advance(s);w=await advance(s);assert.equal(w.objects[0].state.progress,'partial');assert.equal(w.characters[0].plan,undefined);assert.doesNotMatch(w.characters[0].activity,/cafe-back/);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:1});}
  }finally{s.restore();}
 }
});
test('save conflict or failure rolls back result selection and effects but keeps usage; uncertain successful commit replays once',async()=>{
 for(const fault of ['conflictOnNextSave','throwBeforeNextSave','throwAfterNextSave']){
  const s=await scenario({die:20,reply:staged()});try{store[fault]();const op=Date.now()+':'+crypto.randomUUID(),body={operation:'advance',minutes:15,operationId:op};const response=await s.post(body),w=await s.read();assert.equal(response.status,fault==='throwAfterNextSave'?200:502);assert.equal(w.objects[0].state.progress,fault==='throwAfterNextSave'?'partial':'raw');assert.equal(w.aiUsage.totalCalls,2);assert.equal(!!w.characters[0].plan,fault==='throwAfterNextSave');assert.equal(!!w.freeTrials,fault==='throwAfterNextSave');assert.equal((await s.post(body)).status,response.status);assert.deepEqual((await s.read()).objects,w.objects);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:1});}finally{s.restore();}
 }
});
test('transport schema and instructions distinguish result branches from legacy and old legal candidates remain executable',async()=>{
 const reply={status:'accepted',completionMinutes:15,effects:[state('complete')],stages:[],check:null,branches:null};const s=await scenario({reply});try{const w=await advance(s);assert.equal(w.objects[0].state.progress,'complete');const {input,request}=s.requests.find(x=>x.input.contractVersion==='world-adjudication.v1');assert.ok(request.response_format.json_schema.schema.required.includes('branches'));assert.match(input.effectRules.join(' '),/非 null branches/);assert.match(input.rules.join(' '),/branches=null/);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:0});}finally{s.restore();}
});
test('independent real material units produce fresh attempts instead of inheriting the first historical die forever',async()=>{
 const s=await scenario();try{await advance(s);await advance(s);for(const id of ['material-2','material-3']){const w=await s.read(),fresh={...structuredClone(w.objects[1]),id,source:id,revision:1,lifecycle:'active',holder:'owner'};w.objects.push(fresh);store.replaceCommittedWorld(w);const r=candidate();r.branches[2].effects=[{kind:'consume',objectId:id,expectedRevision:1}];s.reply(r);await advance(s);const result=await advance(s);assert.equal(result.objects.find(o=>o.id===id).lifecycle,'consumed');}assert.deepEqual(s.counts(),{npc:3,judgments:3,dice:3});}finally{s.restore();}
});

test('a changed confirmed phase tool earns a new attempt while appended prerequisites cannot wash it',async()=>{
 const reply=candidate(); reply.branches[2].effects=[];
 reply.branches[0].effects=[];reply.branches[0].stages=[{afterMinutes:30,preconditions:[{objectId:'tool',revision:1,region:'cafe-front',holder:'owner',state:[{key:'condition',value:'basic'}]}],effects:[state('complete')]}];
 const s=await scenario({reply});try{
  const w=await s.read();w.objects.push({id:'tool',source:'fixture-tool',label:'加工工具',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{condition:'basic'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{condition:['basic','improved']}});store.replaceCommittedWorld(w);
  await advance(s);await advance(s);assert.equal(s.counts().dice,1);
  s.choose({...proposal,target:'tool',content:'改善工具的實際狀態',durationMinutes:15});s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'state',objectId:'tool',expectedRevision:1,key:'condition',value:'improved'}],stages:[],check:null,branches:null,routine:null});await advance(s);
  const improved=await s.read();assert.equal(improved.objects.find(o=>o.id==='tool').state.condition,'improved');
  reply.branches[0].stages[0].preconditions[0].revision=2;reply.branches[0].stages[0].preconditions[0].state[0].value='improved';s.reply(reply);s.choose(proposal);await advance(s);
  assert.equal(s.counts().dice,2,'a real changed required tool must not inherit the old failure');
  await advance(s);
  const beforeAppend=await s.read();beforeAppend.objects.push({...structuredClone(beforeAppend.objects.find(o=>o.id==='tool')),id:'unrelated-tool',source:'unrelated-tool'});store.replaceCommittedWorld(beforeAppend);
  reply.branches[0].stages[0].preconditions.push({objectId:'unrelated-tool',revision:2,region:'cafe-front',holder:'owner',state:[{key:'condition',value:'improved'}]});
  s.reply(reply);await advance(s);assert.equal(s.counts().dice,2,'appending a new prerequisite cannot expand the frozen attempt');
 }finally{s.restore();}
});
