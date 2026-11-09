/* eslint-disable @typescript-eslint/no-require-imports -- Real world API/SQLite, controlled clock, model transport and die. */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
async function branches(){
 const w=seedWorld();w.contextId='timed-branch-review';w.characters=[w.characters.find(c=>c.id==='owner')];const actor=w.characters[0];actor.control={mode:'autonomous'};w.adjudication={provider:'openai',model:'fixture'};
 w.objects=[{id:'cup-review',source:'known-cup',label:'杯',region:actor.region,holder:'owner',owner:'owner',revision:1,state:{clean:'no'},stateTransitions:{clean:['no','yes']},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner']}];store.install(w);
 const clock=Date.now;let now=clock();Date.now=()=>now;
 const post=b=>{now+=1000;return POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:now+':'+crypto.randomUUID(),mode:'openai',model:'gpt-6-luna',worldContext:w.contextId,...b})}));};
 const read=async()=>(await(await GET()).json()).world;
 await post({operation:'set-model-key',key:'bounded-timing-provider'});
 const view=await(await GET()).json();await post({operation:'adopt-character-attributes',target:'owner',expectedVersion:view.version,operationScope:view.operationScope,characterSetup:{attributes:Object.fromEntries(['strength','endurance','dexterity','perception'].map(name=>[name,{value:3}]))}});
 const original=global.fetch,random=Math.random;let calls=0,draws=0;
 global.fetch=async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);const value=input.contractVersion==='world-adjudication.v1'?{status:'accepted',completionMinutes:15,effects:[],stages:[],check:{difficulty:12,ability:'清潔'},branches:[{outcomes:['critical-success','success','mixed','failure','critical-failure'],effects:[{kind:'state',objectId:'cup-review',expectedRevision:1,key:'clean',value:'yes'}],stages:[]}],routine:null}:{type:'propose',target:'cup-review',content:'花十五分鐘擦乾淨杯子',purpose:'清潔',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(input,value))}}]});};
 Math.random=()=>{draws++;return .495;};
 return {post,read,step:operationId=>post({operation:'advance',minutes:5,timeContract:'five-minute-v1',...(operationId?{operationId}:{})}),calls:()=>calls,draws:()=>draws,restore(){global.fetch=original;Math.random=random;Date.now=clock;}};
}
test('new d100 branch waits its full confirmed time and survives API replay and SQLite reads without a second die',async()=>{
 const s=await branches();try{
 const operationId=Date.now()+':'+crypto.randomUUID();const first=await s.step(operationId),body=await first.json();assert.equal(first.status,200,body.error);let w=await s.read(),start=w.minute;
 assert.equal(w.objects[0].state.clean,'no','selection has zero elapsed work');assert.equal(w.characters[0].plan.until,start+15);assert.equal(w.characters[0].plan.selectedResult.resolution.system,'d100-v1');assert.equal(s.draws(),1);
 assert.deepEqual(await(await s.step(operationId)).json(),body);assert.equal((await s.read()).minute,start);assert.equal(s.calls(),2);
 await s.step();w=await s.read();assert.equal(w.minute,start+5);assert.equal(w.objects[0].state.clean,'no');assert.equal(w.events.some(e=>e.kind==='work'&&e.text.includes('clean=yes')),false);
 await s.step();assert.equal((await s.read()).objects[0].state.clean,'no');await s.step();w=await s.read();assert.equal(w.minute,start+15);assert.equal(w.objects[0].state.clean,'yes');assert.equal(w.objects[0].revision,2);assert.equal(w.characters[0].plan,undefined);assert.equal(s.calls(),2);assert.equal(s.draws(),1);
 }finally{s.restore();}
});
test('a changed branch prerequisite blocks the due result without reverting the unrelated change or rerolling',async()=>{
 const s=await branches();try{await s.step();await s.step();await s.step();let w=await s.read();w.objects[0].revision=2;w.objects[0].state.clean='no';store.replaceCommittedWorld(w);const response=await s.step();assert.equal(response.status,200,await response.clone().text());w=await s.read();assert.equal(w.objects[0].state.clean,'no');assert.equal(w.objects[0].revision,2);assert.equal(w.characters[0].plan,undefined);assert.ok(w.events.some(e=>e.kind==='blocked'&&e.text.includes('條件已改變')));assert.equal(s.draws(),1);assert.equal(s.calls(),2);}finally{s.restore();}
});
for(const fault of ['before','conflict','after'])test('timed branch selection is atomic under '+fault+' save and original-ID replay',async()=>{
 const s=await branches();try{const before=await s.read();if(fault==='before')store.throwBeforeNextSave();if(fault==='conflict')store.conflictOnNextSave();if(fault==='after')store.throwAfterNextSave();const operationId=Date.now()+':'+crypto.randomUUID(),r=await s.step(operationId),body=await r.json();let w=await s.read();assert.equal(w.objects[0].state.clean,'no');if(fault==='after'){assert.equal(w.minute,before.minute+5);assert.equal(w.characters[0].plan.selectedResult.resolution.system,'d100-v1');}else{assert.equal(w.minute,before.minute);assert.equal(w.characters[0].plan,undefined);assert.deepEqual(w.freeTrials,before.freeTrials);}assert.deepEqual(await(await s.step(operationId)).json(),body);assert.equal(s.draws(),1);assert.equal(s.calls(),2);assert.equal((await s.read()).objects[0].state.clean,'no');}finally{s.restore();}
});
test('demo without timeIntent keeps its confirmed sixty-minute rest after five-minute adoption',async()=>{
 const w=seedWorld();w.contextId='demo-confirmed-duration';w.characters=[w.characters.find(c=>c.id==='cass')];store.install(w);
 const post=()=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),operation:'advance',mode:'demo',minutes:5,timeContract:'five-minute-v1',worldContext:w.contextId})}));
 let response=await post();assert.equal(response.status,200,await response.clone().text());let after=(await(await GET()).json()).world;const start=after.minute;assert.equal(after.characters[0].plan.action.type,'rest');assert.equal(after.characters[0].plan.until,start+60);assert.equal(after.characters[0].plan.startedAt,start);
 for(let i=0;i<11;i++){response=await post();assert.equal(response.status,200,await response.clone().text());}after=(await(await GET()).json()).world;assert.equal(after.minute,start+55);assert.equal(after.characters[0].plan.until,start+60);
 response=await post();assert.equal(response.status,200,await response.clone().text());after=(await(await GET()).json()).world;assert.equal(after.minute,start+60);assert.equal(after.characters[0].plan,undefined);
});
for(const fault of ['before','conflict','after'])test('due branch result is atomic under '+fault+' save and retains its saved die',async()=>{
 const s=await branches();try{await s.step();await s.step();await s.step();const before=await s.read();if(fault==='before')store.throwBeforeNextSave();if(fault==='conflict')store.conflictOnNextSave();if(fault==='after')store.throwAfterNextSave();const operationId=Date.now()+':'+crypto.randomUUID(),r=await s.step(operationId),body=await r.json();let w=await s.read();if(fault==='after'){assert.equal(w.objects[0].state.clean,'yes');assert.equal(w.characters[0].plan,undefined);assert.equal(w.minute,before.minute+5);}else{assert.equal(w.objects[0].state.clean,'no');assert.deepEqual(w.characters[0].plan,before.characters[0].plan);assert.equal(w.minute,before.minute);}assert.deepEqual(await(await s.step(operationId)).json(),body);assert.equal(s.draws(),1);assert.equal(s.calls(),2);assert.deepEqual((await s.read()).freeTrials,before.freeTrials);}finally{s.restore();}
});
