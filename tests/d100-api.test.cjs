/* eslint-disable @typescript-eslint/no-require-imports */
const { originalWorldInput } = require('./original-scope-fixture.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const post=async body=>{const r=await POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(originalWorldInput({operationId:id(),mode:'demo',...body}, 'test-owner'))}));const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
const read=async()=>(await(await GET()).json());
async function craft(roll,{dexterity=3,expertise=[],tags=[],task='craft-challenge'}={}){
 const w=seedWorld();w.characters.find(c=>c.id==='owner').abilityTags=tags;store.install(w);const original=await read();
 await post({operation:'adopt-character-attributes',target:'owner',operationScope:original.operationScope,expectedVersion:original.version,worldContext:original.world.contextId,characterSetup:{attributes:{strength:{value:3},endurance:{value:3},dexterity:{value:dexterity},perception:{value:3}},expertise}});
 const random=Math.random;let draws=0;Math.random=()=>{draws++;return(roll-.5)/100;};
 try{await post({operation:'direct',target:'owner',action:{type:'work',target:task,content:'星月'}});assert.equal(draws,0,'direct preflight does not spend a die');await post({operation:'advance',minutes:15});const world=(await read()).world;return {world,result:world.events.findLast(e=>e.kind==='attempt'&&e.actor==='owner'),draws};}finally{Math.random=random;}
}
test('adopted character uses fixed d100 extremes through direct-control world API and saved craft result',async()=>{
 const {result,world,draws}=await craft(5);assert.equal(result.resolution.system,'d100-v1');assert.equal(result.resolution.roll,5);assert.equal(result.resolution.threshold,55);assert.equal(result.resolution.outcome,'critical-success');assert.equal(draws,1);assert.equal(world.characters.find(c=>c.id==='owner').projects[0].status,'finished-with-variation');
});
test('d100 endpoints and middle boundaries are complete, with stable ability differences and confirmed modifiers only',async()=>{
 for(const [roll,expected] of [[1,'critical-success'],[5,'critical-success'],[6,'success'],[55,'success'],[56,'mixed'],[75,'mixed'],[76,'failure'],[95,'failure'],[96,'critical-failure'],[100,'critical-failure']])assert.equal((await craft(roll)).result.resolution.outcome,expected);
 assert.equal((await craft(50,{dexterity:2})).result.resolution.outcome,'mixed');assert.equal((await craft(50,{dexterity:4})).result.resolution.outcome,'success');
 const expert=await craft(65,{expertise:[{scope:'髮飾設計',modifier:10}]});assert.equal(expert.result.resolution.threshold,65);assert.equal(expert.result.resolution.outcome,'success');
 assert.equal((await craft(65,{tags:['精通髮飾設計','力量驚人']})).result.resolution.threshold,55,'unconfirmed prose never grants a numeric modifier');
 assert.equal((await craft(30,{dexterity:1,task:'craft-expert-challenge',expertise:[{scope:'髮飾設計',modifier:-20}]})).result.resolution.threshold,10);
 assert.equal((await craft(95,{dexterity:5,task:'craft-easy-challenge',expertise:[{scope:'髮飾設計',modifier:20}]})).result.resolution.outcome,'mixed');
});
const {fixtureDecision}=require('./pursuit-fixture.cjs');
async function freeScenario({roll=50,branches=true,check={difficulty:12,ability:'加工',system:'d100-v1',attribute:'dexterity',sense:null},dexterity=3,adopt=true,expertise=[],senses=[]}={}){
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-world'};w.contextId='d100-free';w.objects=[{id:'workpiece',source:'source',label:'作品',kind:'utensil',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{progress:'raw'},lifecycle:'active',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{progress:['raw','partial','complete']}}];store.install(w);
 if(adopt){const before=await read();await post({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:w.contextId,characterSetup:{attributes:{strength:{value:3},endurance:{value:3},dexterity:{value:dexterity},perception:{value:3}},expertise,senses}});}
 await post({operation:'set-model-key',mode:'openai',key:'isolated-d100-provider-key-277'});
 const effect=value=>({kind:'state',objectId:'workpiece',expectedRevision:1,key:'progress',value});
 let reply={status:'accepted',routine:null,completionMinutes:15,effects:branches?[]:[effect('complete')],stages:[],check,branches:branches?[{outcomes:['critical-success','success'],effects:[effect('complete')],stages:[]},{outcomes:['mixed'],effects:[effect('partial')],stages:[]},{outcomes:['failure','critical-failure'],effects:[],stages:[]}]:null};
 let choice={type:'propose',target:'workpiece',content:'加工這件作品',purpose:'製作',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}};
 const fetch=global.fetch,random=Math.random;let draws=0;const inputs=[];
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(input);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(input.contractVersion==='world-adjudication.v1'?reply:fixtureDecision(input,choice))}}]});};
 Math.random=()=>{draws++;return(roll-.5)/(adopt?100:20);};
 return {advance:async extra=>post({operation:'advance',worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',minutes:15,...extra}),read:async()=>(await read()).world,inputs,draws:()=>draws,reply:r=>reply=r,current:()=>reply,choose:c=>choice=c,restore:()=>{global.fetch=fetch;Math.random=random;}};
}
test('fresh world-confirmed branches and simple checks use the saved ability then reach the next true NPC request without dice leakage',async()=>{
 for(const branches of [true,false]){const s=await freeScenario({branches,dexterity:4});try{let w=(await s.advance()).world;assert.equal(Object.values(w.freeTrials)[0].system,'d100-v1');assert.equal(Object.values(w.freeTrials)[0].threshold,65);assert.equal(w.objects[0].state.progress,'complete');assert.equal(s.draws(),1);const receipt=Object.values(w.freeTrials)[0];s.choose({type:'rest',target:'',content:'休息'});await s.advance();const input=s.inputs.filter(i=>i.contractVersion==='npc-decision.v3').at(-1);assert.ok(input.self.shortTerm.length);assert.doesNotMatch(JSON.stringify(input),/threshold|d100-v1|critical-success|critical-failure/);assert.deepEqual(Object.values((await s.read()).freeTrials)[0],receipt);}finally{s.restore();}}
});
test('the same frozen physical attempt reuses old D20 across adoption, schema version, DC, ability and wording changes',async()=>{
 const s=await freeScenario({roll:2,adopt:false,check:{difficulty:12,ability:'加工'}});try{await s.advance();let w=await s.read(),old=Object.values(w.freeTrials)[0];assert.equal(old.system,undefined);assert.equal(s.draws(),1);
 const before=await read();await post({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:w.contextId,characterSetup:{attributes:{strength:{value:5},endurance:{value:5},dexterity:{value:5},perception:{value:5}}}});
 s.reply({...s.current(),check:{difficulty:8,ability:'新的描述',system:'d100-v1',attribute:'strength',sense:null}});s.choose({type:'propose',target:'workpiece',content:'重述同一個方法',purpose:'製作',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});await s.advance();w=await s.read();assert.equal(s.draws(),1);assert.deepEqual(Object.values(w.freeTrials)[0],old);assert.equal(w.objects[0].state.progress,'raw');
 w.objects[0].state.progress='partial';w.objects[0].revision=2;store.replaceCommittedWorld(w);const revised=s.current();revised.branches[0].effects[0].expectedRevision=2;revised.branches[1].effects[0].expectedRevision=2;revised.branches[1].effects[0].value='complete';s.reply(revised);await s.advance();assert.equal(s.draws(),2);assert.equal(Object.values((await s.read()).freeTrials).at(-1).system,'d100-v1');
 }finally{s.restore();}
});
test('owner-confirmed absent sight blocks direct visibility, active probes and new uncertain opportunities even on 01',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>['owner','vera'].includes(c.id));w.characters.forEach(c=>{c.location='cafe';c.region='cafe-front';});store.install(w);let before=await read();
 await post({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,characterSetup:{attributes:{strength:{value:3},endurance:{value:3},dexterity:{value:3},perception:{value:5}},blockedSenses:['sight'],senses:[{scope:'sight',modifier:20}]}});
 const formed=(await read()).world.characters.find(c=>c.id==='owner').attributes,random=Math.random;let draws=0;Math.random=()=>{draws++;return .005;};try{
 await post({operation:'takeover',target:'owner'});await post({operation:'direct',action:{type:'observe',target:'cafe-front',content:'sight'}});await post({operation:'advance',minutes:15});let saved=(await read()).world,actor=saved.characters.find(c=>c.id==='owner');assert.equal(actor.observations.some(o=>o.sense==='sight'),false);assert.equal(draws,0);
 await post({operation:'direct',action:{type:'move',target:'cafe-storeroom'}});await post({operation:'advance',minutes:15});saved=(await read()).world;assert.equal(saved.characters.find(c=>c.id==='owner').observations.some(o=>o.sense==='sight'),false);
 before=await read();await post({operation:'set-character-sense-limits',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,characterSetup:{blockedSenses:[]}});assert.deepEqual((await read()).world.characters.find(c=>c.id==='owner').attributes.values,formed.values);
 await post({operation:'direct',action:{type:'observe',target:'vera',content:'sight'}});await post({operation:'advance',minutes:15});assert.ok((await read()).world.characters.find(c=>c.id==='owner').observations.some(o=>o.sense==='sight'));assert.equal(draws,0,'clear visibility never rolls');
 }finally{Math.random=random;}
});
async function perceptionScenario({perception=3,senseModifier=0,adopt=true,blockedSenses=[]}={}){
 const w=seedWorld();w.characters=w.characters.filter(c=>['owner','vera'].includes(c.id));w.adjudication={provider:'openai',model:'fixture-world'};const owner=w.characters.find(c=>c.id==='owner');owner.region='cafe-storeroom';owner.control={mode:'taken-over'};const vera=w.characters.find(c=>c.id==='vera');vera.location='cafe';vera.region='cafe-front';w.scene.doors['cafe-door']='closed';store.install(w);
 if(adopt){const before=await read();await post({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,characterSetup:{attributes:{strength:{value:3},endurance:{value:3},dexterity:{value:3},perception:{value:perception}},senses:[{scope:'hearing',modifier:senseModifier}],blockedSenses}});}
 await post({operation:'set-model-key',mode:'openai',key:'isolated-d100-provider-key-277'});
 const fetch=global.fetch,random=Math.random;let draws=0;const inputs=[];let choice={type:'work',target:'tidy',content:'',durationMinutes:90};
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(input);return Response.json({choices:[{message:{content:JSON.stringify(fixtureDecision(input,choice))}}]});};Math.random=()=>{draws++;return .495;};
 return {read:async()=>(await read()).world,choose:c=>choice=c,inputs,draws:()=>draws,advance:async()=>post({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}),probe:async()=>{await post({operation:'direct',action:{type:'observe',target:'cafe-front',content:'hearing'}});return post({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15});},restore:()=>{global.fetch=fetch;Math.random=random;}};
}
test('uncertain active hearing combines perception, confirmed sensory conditions and attention, preserving same-opportunity results',async()=>{
 for(const [level,modifier,threshold,outcome] of [[2,0,55,'success'],[1,-10,35,'mixed'],[4,10,75,'success']]){
 const s=await perceptionScenario({perception:level,senseModifier:modifier});try{await s.advance();await s.probe();let w=await s.read();const trace=w.events.findLast(e=>e.actor==='owner'&&e.kind==='observe').perception[0];assert.equal(trace.resolution.system,'d100-v1');assert.equal(trace.resolution.threshold,threshold);assert.equal(trace.resolution.outcome,outcome);assert.equal(trace.resolution.factors.attention,10);assert.equal(s.draws(),1);
 await s.probe();assert.equal(s.draws(),1);assert.deepEqual((await s.read()).perceptionTrials,w.perceptionTrials);
 await post({operation:'return-control'});s.choose({type:'rest',target:'',content:''});await s.advance();const input=s.inputs.find(i=>i.self.id==='owner');assert.ok(input);assert.doesNotMatch(JSON.stringify(input),/threshold|d100-v1|resolution|critical-success/);
 }finally{s.restore();}}
});
test('hearing explicitly disabled before real work has neither passive nor active opportunities',async()=>{
 const s=await perceptionScenario({blockedSenses:['hearing']});try{await s.advance();await s.probe();const w=await s.read();assert.equal(s.draws(),0);assert.equal(w.characters.find(c=>c.id==='owner').observations.some(o=>o.sense==='hearing'),false);}finally{s.restore();}
});
test('a retained active perception remains D20 across adoption until a real interference change creates a fresh opportunity',async()=>{
 const s=await perceptionScenario({adopt:false});try{await s.advance();await s.probe();const original=await s.read(),trial=Object.values(original.perceptionTrials)[0];assert.equal(trial.resolution.system,undefined);assert.equal(s.draws(),1);
 const before=await read();await post({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,characterSetup:{attributes:{strength:{value:5},endurance:{value:5},dexterity:{value:5},perception:{value:5}}}});await s.probe();assert.equal(s.draws(),1);assert.deepEqual(Object.values((await s.read()).perceptionTrials)[0],trial);
 const changed=await s.read();changed.scene.noise['cafe-storeroom']='loud';store.replaceCommittedWorld(changed);await s.probe();assert.equal(s.draws(),2);assert.equal(Object.values((await s.read()).perceptionTrials).at(-1).resolution.system,'d100-v1');
 }finally{s.restore();}
});
test('new routine confirmation stores its d100 check while an already saved legacy rule stays D20 on a genuinely new vessel',async()=>{
 const {scenario,advance,proposal}=require('./routine-program-fixture.cjs'),{uncertain,raw}=require('./routine-results-fixture.cjs');
 const s=await scenario({reply:uncertain(),random:.495,supplies:raw()});try{const before=await read();await post({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,characterSetup:{attributes:{strength:{value:3},endurance:{value:3},dexterity:{value:3},perception:{value:3}},expertise:[{scope:'泡茶',modifier:10}]}});
 let w=await advance(s);assert.equal(w.characters[0].plan.selectedResult.resolution.system,'d100-v1');assert.equal(w.characters[0].plan.selectedResult.resolution.threshold,65);assert.equal(w.routineRules[0].programs[0].check.system,'d100-v1');w=await advance(s);assert.equal(w.objects.find(o=>o.id==='cup-a').state.contents,'tea');
 w.routineRules[0].programs[0].check={difficulty:12,ability:'泡茶'};store.replaceCommittedWorld(w);s.choose({...proposal,target:'cup-b',content:'泡一杯茶'});w=await advance(s);assert.equal(w.characters[0].plan.selectedResult.resolution.system,undefined);assert.equal(w.characters[0].plan.selectedResult.resolution.roll,10);assert.equal(w.characters[0].plan.selectedResult.resolution.outcome,'mixed');assert.equal(s.counts().judgments,1);
 }finally{s.restore();}
});
test('d100 effects, receipts and known paid usage share the existing save-before, lost-response and conflict recovery boundary',async()=>{
 for(const fault of ['throwBeforeNextSave','throwAfterNextSave','conflictOnNextSave']){
 const s=await freeScenario({roll:5});try{store[fault]();const body={operation:'advance',operationId:id(),worldContext:'d100-free',mode:'openai',model:'gpt-6-luna',minutes:15};const request=()=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(originalWorldInput(body, 'test-owner'))});const response=await POST(request());assert.equal(response.status,fault==='throwAfterNextSave'?200:502);const w=await s.read();assert.equal(w.objects[0].state.progress,fault==='throwAfterNextSave'?'complete':'raw');assert.equal(!!w.freeTrials,fault==='throwAfterNextSave');assert.equal(w.aiUsage.totalCalls,2);const draws=s.draws();assert.equal((await POST(request())).status,response.status);assert.equal(s.draws(),draws);assert.deepEqual((await s.read()).objects,w.objects);
 }finally{s.restore();}}
});
test('social expression uses d100 without forcing the listener to agree, while unchanged persuasion reuses its opportunity',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>['owner','vera'].includes(c.id));const vera=w.characters.find(c=>c.id==='vera');vera.location='cafe';vera.region='cafe-front';vera.relationships.owner='拒絕配合';store.install(w);const before=await read();await post({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,characterSetup:{attributes:{strength:{value:5},endurance:{value:5},dexterity:{value:5},perception:{value:5}},expertise:[{scope:'說服',modifier:10}]}});
 const random=Math.random;let draws=0;Math.random=()=>{draws++;return .005;};try{await post({operation:'direct',action:{type:'persuade',target:'vera',content:'能一起喝茶嗎'}});assert.equal(draws,0);await post({operation:'advance',minutes:15});let saved=(await read()).world;const event=saved.events.findLast(e=>e.actor==='owner'&&e.resolution);assert.equal(event.resolution.system,'d100-v1');assert.equal(event.resolution.threshold,45);assert.equal(event.resolution.factors.attribute,null);assert.equal(event.resolution.outcome,'critical-success');assert.equal(saved.characters.find(c=>c.id==='vera').relationships.owner,'拒絕配合');assert.doesNotMatch(event.text,/已同意/);
 await post({operation:'direct',action:{type:'persuade',target:'vera',content:'重述同一請求'}});await post({operation:'advance',minutes:15});saved=(await read()).world;assert.equal(saved.events.filter(e=>e.actor==='owner'&&e.resolution).length,1);assert.equal(draws,1);
 }finally{Math.random=random;}
});
test('all one hundred d100 faces have exactly five-percent extremes and the approved middle frequencies',async()=>{
 const counts={'critical-success':0,success:0,mixed:0,failure:0,'critical-failure':0};for(let roll=1;roll<=100;roll++)counts[(await craft(roll)).result.resolution.outcome]++;assert.deepEqual(counts,{'critical-success':5,success:50,mixed:20,failure:20,'critical-failure':5});
});
test('a specialization cannot double-count a basic attribute or the same sensory channel by renaming its scope',async()=>{
 for(const ability of ['dexterity','靈巧']){const s=await freeScenario({check:{difficulty:12,ability,system:'d100-v1',attribute:'dexterity',sense:null},expertise:[{scope:ability,modifier:20}]});try{const w=(await s.advance()).world;assert.equal(Object.values(w.freeTrials)[0].threshold,55);assert.equal(Object.values(w.freeTrials)[0].factors.expertise,0);}finally{s.restore();}}
 const s=await freeScenario({check:{difficulty:12,ability:'hearing',system:'d100-v1',attribute:null,sense:'hearing'},expertise:[{scope:'hearing',modifier:20}],senses:[{scope:'hearing',modifier:10}]});try{const w=(await s.advance()).world;assert.equal(Object.values(w.freeTrials)[0].threshold,65);assert.equal(Object.values(w.freeTrials)[0].factors.expertise,0);assert.equal(Object.values(w.freeTrials)[0].factors.sense,10);}finally{s.restore();}
});
test('passive multi-sensory arrival selects the strongest stable sensory route and does not reveal the weaker route',async()=>{
 const w=seedWorld();w.adjudication={provider:'openai',model:'fixture-world'};w.characters=w.characters.filter(c=>['owner','vera'].includes(c.id));const owner=w.characters.find(c=>c.id==='owner');owner.region='cafe-storeroom';owner.control={mode:'taken-over'};w.scene.doors['cafe-door']='open';w.scene.occluded=['cafe-front'];w.scene.noise['cafe-storeroom']='loud';store.install(w);const before=await read();await post({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,characterSetup:{attributes:{strength:{value:3},endurance:{value:3},dexterity:{value:3},perception:{value:3}},senses:[{scope:'sight',modifier:-20},{scope:'hearing',modifier:10}]}});await post({operation:'set-model-key',mode:'openai',key:'isolated-multisense-key-277'});
 const fetch=global.fetch,random=Math.random;let draws=0;global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json({choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'move',target:'cafe',content:''}))}}]});};Math.random=()=>{draws++;return .495;};try{const result=await post({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15});const arrival=result.world.events.find(e=>e.actor==='vera'&&e.kind==='move'),trace=arrival.perception.find(t=>t.characterId==='owner');assert.equal(trace.resolution.system,'d100-v1');assert.equal(trace.resolution.threshold,65);assert.equal(trace.resolution.factors.senseName,'hearing');assert.equal(trace.observations.every(o=>o.sense==='hearing'),true);assert.equal(trace.observations.some(o=>o.source==='vera'),false);assert.equal(draws,1);}finally{global.fetch=fetch;Math.random=random;}
});
test('file SQLite close/reopen preserves the d100 receipt and original operation without a second die',async()=>{
 const {mkdtemp,rm}=require('node:fs/promises'),{tmpdir}=require('node:os'),{createRuntime}=await import('../tooling/experiments/pursuit-runtime-228.mjs');const directory=await mkdtemp(path.join(tmpdir(),'checks-277-')),databasePath=path.join(directory,'world.sqlite');let runtime;const random=Math.random;
 try{runtime=await createRuntime({databasePath,legacySeed:true});const before=await(await runtime.get()).json();const send=async body=>{const response=await runtime.post({operationId:id(),mode:'demo',worldContext:before.world.contextId,...body});assert.equal(response.status,200,await response.clone().text());return response.json();};await send({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,characterSetup:{attributes:{strength:{value:3},endurance:{value:3},dexterity:{value:3},perception:{value:3}}}});await send({operation:'direct',action:{type:'work',target:'craft-challenge',content:'蕾絲'}});Math.random=()=>.545;const operationId=id(),result=await send({operation:'advance',operationId,minutes:15}),saved=result.world.events.find(e=>e.actor==='owner'&&e.resolution).resolution;assert.equal(saved.system,'d100-v1');assert.equal(saved.roll,55);await runtime.close();runtime=undefined;runtime=await createRuntime({databasePath,legacySeed:true});Math.random=()=>{throw Error('reopen must not draw');};const reopened=await(await runtime.get()).json();assert.deepEqual(reopened.world.events.find(e=>e.actor==='owner'&&e.resolution).resolution,saved);const replay=await runtime.post({operationId,mode:'demo',worldContext:before.world.contextId,operation:'advance',minutes:15});assert.equal(replay.status,200);assert.deepEqual((await replay.json()).world.events.find(e=>e.actor==='owner'&&e.resolution).resolution,saved);
 }finally{Math.random=random;await runtime?.close();await rm(directory,{recursive:true,force:true});}
});
test('an already started legacy deferred craft keeps D20 when the owner adopts attributes before completion',async()=>{
 const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.timeContract='five-minute-v1';store.install(w);await post({operation:'direct',action:{type:'work',target:'craft-challenge',content:'緞帶'}});await post({operation:'advance',minutes:5,timeContract:'five-minute-v1'});let before=await read();assert.equal(before.world.characters[0].plan.checkSystem,'d20-v1');await post({operation:'adopt-character-attributes',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,characterSetup:{attributes:{strength:{value:5},endurance:{value:5},dexterity:{value:5},perception:{value:5}}}});
 const random=Math.random;Math.random=()=>.995;try{for(let step=0;step<3;step++)await post({operation:'advance',minutes:5,timeContract:'five-minute-v1'});const saved=(await read()).world.events.find(e=>e.actor==='owner'&&e.resolution);assert.equal(saved.resolution.system,undefined);assert.equal(saved.resolution.roll,20);assert.equal(saved.resolution.outcome,'critical-success');}finally{Math.random=random;}
});
test('a newly confirmed absent sense excludes an old successful trial before its cached result could be reused',async()=>{
 const s=await freeScenario({roll:5,check:{difficulty:12,ability:'觀察細節',system:'d100-v1',attribute:'perception',sense:'sight'}});try{const reply=s.current();reply.branches.forEach(branch=>{branch.effects=[];});s.reply(reply);await s.advance();const before=await read();await post({operation:'set-character-sense-limits',target:'owner',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,characterSetup:{blockedSenses:['sight']}});const current=await s.read(),draws=s.draws();const response=await POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(originalWorldInput({operation:'advance',operationId:id(),worldContext:current.contextId,mode:'openai',model:'gpt-6-luna',minutes:15}, 'test-owner'))}));assert.equal(response.status,502);assert.equal(s.draws(),draws);assert.equal((await s.read()).turn,current.turn);assert.deepEqual((await s.read()).freeTrials,current.freeTrials);
 }finally{s.restore();}
});

test('saved v1 appearance-domain expertise keeps its original meaning, threshold and result across reload and replay',async()=>{
 for(const ability of ['外觀','appearance']){
  const s=await freeScenario({roll:70,check:{difficulty:12,ability,system:'d100-v1',attribute:null,sense:null},expertise:[{scope:ability,modifier:20}]});
  try{
   const operationId=id(),result=await s.advance({operationId});const resolution=Object.values(result.world.freeTrials)[0];
   assert.equal(resolution.system,'d100-v1');assert.equal(resolution.threshold,75);assert.equal(resolution.factors.expertise,20);assert.equal(resolution.factors.attribute,null);assert.equal(resolution.outcome,'success');assert.equal(s.draws(),1);
   assert.deepEqual(Object.values((await s.read()).freeTrials)[0],resolution);
   const calls=s.inputs.length,replayed=await s.advance({operationId});assert.deepEqual(Object.values(replayed.world.freeTrials)[0],resolution);assert.equal(s.inputs.length,calls);assert.equal(s.draws(),1);
  }finally{s.restore();}
 }
});


test('v2 continues to exclude appearance aliases from numeric expertise while v1 retains its separate domain',()=>{
 const {resolveActionCheck}=load('action-checks');
 for(const ability of ['外觀','appearance']){
  // Resolver-contract snapshot only; the real formed-card route journey is
  // covered separately by versioned-d100.test.mjs, not replaced by this object.
  const actor=seedWorld().characters[0];actor.attributes={version:2,authority:'formed-card',values:{strength:12,endurance:12,dexterity:12,perception:12,appearance:18},expertise:[{scope:ability,modifier:20}],senses:[],blockedSenses:[],activatedAt:0,constraints:{}};
  let draws=0;const resolution=resolveActionCheck(actor,{difficulty:12,ability,system:'d100-v2',attribute:null,sense:null},0,0,()=>{draws++;return .695;});
  assert.equal(resolution.system,'d100-v2');assert.equal(resolution.attributeVersion,2);assert.equal(resolution.threshold,55);assert.equal(resolution.factors.expertise,0);assert.equal(resolution.factors.attribute,null);assert.equal(resolution.outcome,'mixed');assert.equal(draws,1);
 }
});
