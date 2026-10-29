/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const response=(v,_fixtureInput)=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(_fixtureInput,v))}}]});
const action=(overrides={})=>({type:'rest',target:'',content:'稍微休息',mood:'平靜',durationMinutes:15,intents:[],...overrides});
async function setup(reply={status:'denied',effects:[],stages:[],check:null},choice=action({type:'propose',target:'cafe',purpose:'飲用',content:'泡一杯茶'})){
 const w=seedWorld();w.contextId='life-habits';w.adjudication={provider:'openai',model:'fixture-judge'};w.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});const old=global.fetch;let calls=0,inputs=[];
 global.fetch=async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(input);return response(input.contractVersion==='world-adjudication.v1'?reply:typeof choice==='function'?choice(input):choice,JSON.parse(JSON.parse(init.body).messages[1].content));};
 return {post,read:async()=>(await(await GET()).json()).world,restore:()=>{global.fetch=old;},setChoice:v=>{choice=v;},setReply:v=>{reply=v;},calls:()=>calls,inputs};
}
const owner=w=>w.characters.find(c=>c.id==='owner');
async function advance(s,body={}){const r=await s.post({operation:'advance',minutes:15,...body});assert.equal(r.status,200,await r.clone().text());return s.read();}

test('denied and unstarted free proposals never accumulate autonomous habit evidence after SQLite reload',async()=>{
 const s=await setup();try{const w=await advance(s);assert.equal(owner(w).habits?.length||0,0);assert.equal(owner(w).habitEvidence?.length||0,0);assert.equal(w.turn,1);}finally{s.restore();}
});

test('committed starts survive interruption; continuation and same-operation replay do not add evidence',async()=>{
 const s=await setup(undefined,action({durationMinutes:60}));try{
 const operation={operationId:Date.now()+':'+crypto.randomUUID()};let w=await advance(s,operation);assert.equal(owner(w).habitEvidence.length,1);assert.equal(owner(w).habitEvidence[0].started,true);assert.ok(owner(w).habitEvidence[0].memory);assert.equal(owner(w).plan.until-owner(w).plan.startedAt,60);
 const first=structuredClone(owner(w).habitEvidence);await advance(s,operation);assert.deepEqual(owner(await s.read()).habitEvidence,first);assert.equal(s.calls(),1);
 w=await advance(s);assert.deepEqual(owner(w).habitEvidence,first);assert.equal(s.calls(),1);
 assert.equal((await s.post({operation:'intervene',target:'owner',text:'想和你聊一會兒'})).status,200);s.setChoice(action({type:'say',target:'observer',content:'可以，先休息一下。'}));w=await advance(s);assert.deepEqual(owner(w).habitEvidence,first);assert.equal(owner(w).habits[0].observedDays.length,1);
 }finally{s.restore();}
});

test('free method identity follows confirmed operations rather than wording or concrete object identity',async()=>{
 const s=await setup({status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings:['tea','coffee','food','drink','wash','return'].map(operation=>({operation,minutes:15}))}});
 try{let w=await advance(s);assert.equal(owner(w).habits[0].activityKey,'routine:tea');const cup=w.objects.find(o=>o.kind==='utensil');s.setChoice(action({type:'propose',target:cup.id,purpose:'飲用',content:'沖泡一杯茶'}));w=await advance(s);assert.equal(owner(w).habits.length,1);assert.equal(owner(w).habits[0].observedDays.length,1);
 s.setChoice(action({type:'propose',target:cup.id,purpose:'飲用',content:'喝茶'}));w=await advance(s);assert.equal(owner(w).habits.length,2);assert.deepEqual(owner(w).habits.map(h=>h.activityKey).sort(),['routine:drink','routine:tea']);assert.equal(w.objects.find(o=>o.kind==='food').lifecycle,'consumed');
 }finally{s.restore();}
});

test('three controlled world days establish a relevant tendency; evidence and decay survive serialized reads',async()=>{
 const s=await setup(undefined,action({type:'work',target:'tidy',content:'整理桌面'}));try{
 for(let day=0;day<3;day++){const w=await s.read();w.minute=1260+day*1440;store.replaceCommittedWorld(w);await advance(s);}
 let w=await s.read();const views=load('habits').habitViews(w,owner(w));assert.equal(views[0].established,true);assert.equal(views[0].days,3);assert.equal(owner(w).habitEvidence.length,3);s.setChoice(action());await advance(s);const input=s.inputs.filter(i=>i.self).at(-1);assert.match(input.learnedHabits[0].tendency,/整理/);assert.equal(input.self.habitEvidence,undefined);assert.equal(input.self.habits,undefined);
 w=await s.read();w.minute+=21*1440;store.replaceCommittedWorld(w);assert.equal(load('habits').habitsForDecision(await s.read(),owner(await s.read())).length,0);
 }finally{s.restore();}
});

test('storage failure rolls back new habit evidence and original operation replay does not dispatch again',async()=>{
 const s=await setup(undefined,action());try{store.throwBeforeNextSave();const body={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};const r=await s.post(body);assert.equal(r.status,502);assert.equal(owner(await s.read()).habitEvidence,undefined);assert.equal((await s.post(body)).status,502);assert.equal(s.calls(),1);}finally{s.restore();}
});

const pair=w=>{const evidence=owner(w).habitEvidence;return {trigger:evidence.at(-2).memory,action:evidence.at(-1).memory};};
async function performedPair(s){s.setChoice(action({type:'work',target:'tidy',content:'整理桌面'}));await advance(s);s.setChoice(action());return advance(s);}

test('normal decisions propose event associations from visible starts; three different world days form a tendency',async()=>{
 const s=await setup(undefined,action());try{
 for(let day=0;day<3;day++){
 const before=await s.read();before.minute=1260+1440*day;delete owner(before).plan;store.replaceCommittedWorld(before);
 const w=await performedPair(s);const candidate=pair(w);s.setChoice(action({habitCandidates:[candidate]}));let saved=await advance(s);assert.equal(owner(saved).eventHabits[0].observedDays.length,day+1);assert.equal(load('habits').eventHabitViews(saved,owner(saved))[0].established,day===2);
 if(day===0){const original=structuredClone(owner(saved).eventHabits);await advance(s);assert.deepEqual(owner(await s.read()).eventHabits,original);const input=s.inputs.filter(i=>i.self).at(-1);assert.equal(input.learnedHabits.some(h=>h.tendency.includes('之後')),false);}
 }
 s.setChoice(action({type:'work',target:'tidy',content:'再次整理'}));await advance(s);s.setChoice(action());await advance(s);const input=s.inputs.filter(i=>i.self).at(-1);assert.ok(input.learnedHabits.some(h=>/整理之後，常會休息/.test(h.tendency)));assert.equal(input.self.eventHabits,undefined);
 }finally{s.restore();}
});

test('event candidates reject unavailable versions, nonautonomous, reversed and distant sources atomically',async()=>{
 for(const mutate of [p=>({...p,trigger:{id:'foreign-secret',version:1}}),p=>({...p,trigger:{...p.trigger,version:99}}),p=>({trigger:p.action,action:p.trigger})]){
 const s=await setup(undefined,action());try{const w=await performedPair(s);s.setChoice(action({habitCandidates:[mutate(pair(w))]}));const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,502);assert.equal(owner(await s.read()).eventHabits?.length||0,0);assert.equal((await s.read()).turn,w.turn);}finally{s.restore();}
 }
 const s=await setup(undefined,action());try{let w=await performedPair(s);const candidate=pair(w);owner(w).habitEvidence[0].time-=180;store.replaceCommittedWorld(w);s.setChoice(action({habitCandidates:[candidate]}));assert.equal((await s.post({operation:'advance',minutes:15})).status,502);assert.equal(owner(await s.read()).eventHabits?.length||0,0);}finally{s.restore();}
});

test('a failed event-candidate save leaves no association and replay never repeats its model dispatch',async()=>{
 const s=await setup(undefined,action());try{const before=await performedPair(s);s.setChoice(action({habitCandidates:[pair(before)]}));store.throwBeforeNextSave();const body={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(body)).status,502);const failed=await s.read();assert.equal(owner(failed).eventHabits?.length||0,0);assert.deepEqual(owner(failed).habitEvidence,owner(before).habitEvidence);const calls=s.calls();assert.equal((await s.post(body)).status,502);assert.equal(s.calls(),calls);}finally{s.restore();}
});

test('generic world-confirmed activity identities survive wording and target changes without merging distinct methods',async()=>{
 const s=await setup();try{
 let w=await s.read();w.objects=['cup-a','cup-b'].map(id=>({id,source:id,label:'杯子',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{contents:'water'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['water','tea','empty']}}));store.replaceCommittedWorld(w);
 const choose=(target,content,purpose,key,label,value)=>{s.setChoice(action({type:'propose',target,content,purpose}));s.setReply({status:'accepted',completionMinutes:15,activityIdentity:{version:1,key,label},effects:[{kind:'state',objectId:target,expectedRevision:1,key:'contents',value}],stages:[],check:null});};
 choose('cup-a','把這杯水沖成茶','準備熱茶','prepare-tea','泡茶','tea');w=await advance(s);assert.equal(owner(w).habits[0].activityKey,'confirmed.v1:prepare-tea');
 choose('cup-b','換個杯子沖一份茶','做點茶','prepare-tea','泡茶','tea');w=await advance(s);assert.equal(owner(w).habits.length,1);assert.equal(owner(w).habits[0].observedDays.length,1);assert.equal(owner(w).habitEvidence.length,2);const input=s.inputs.findLast(i=>i.contractVersion==='world-adjudication.v1');assert.deepEqual(input.knownActivityIdentities,[{version:1,key:'prepare-tea',label:'泡茶'}]);
 s.setChoice(action({type:'propose',target:'cup-a',content:'喝這份茶',purpose:'品飲'}));s.setReply({status:'accepted',completionMinutes:15,activityIdentity:{version:1,key:'drink-tea',label:'飲茶'},effects:[{kind:'state',objectId:'cup-a',expectedRevision:2,key:'contents',value:'empty'}],stages:[],check:null});w=await advance(s);assert.equal(owner(w).habits.length,2);assert.deepEqual(owner(w).habits.map(h=>h.activityKey).sort(),['confirmed.v1:drink-tea','confirmed.v1:prepare-tea']);
 }finally{s.restore();}
});

test('a perceived event can precede an autonomous activity without borrowing hidden world information',async()=>{
 const s=await setup(undefined,input=>input.self.id==='cass'?action({type:'say',target:'owner',content:'這裡現在很安靜。'}):action());try{
 let w=await s.read();const cass=w.characters.find(c=>c.id==='cass');cass.location='cafe';cass.region='cafe-front';cass.control={mode:'autonomous'};store.replaceCommittedWorld(w);w=await advance(s);
 const observed=owner(w).shortTerm.find(memory=>memory.source.kind==='observation'&&memory.observation?.kind==='speech');assert.ok(observed,'actual NPC speech must create a subjective source');
 w=await advance(s);const after=owner(w).habitEvidence.at(-1).memory;s.setChoice(input=>input.self.id==='cass'?action():action({habitCandidates:[{trigger:{id:observed.id,version:observed.version},action:after}]}));w=await advance(s);assert.equal(owner(w).eventHabits.length,1);assert.match(owner(w).eventHabits[0].triggerKey,/^observed.v1:/);assert.equal(load('habits').eventHabitViews(w,owner(w))[0].established,false);
 }finally{s.restore();}
});

test('habit candidates share the existing four-update envelope instead of gaining an independent model budget',async()=>{
 const s=await setup(undefined,action());try{const before=await performedPair(s),refs=owner(before).shortTerm.slice(0,3).map(({id,version})=>({id,version,reason:'保留經歷'}));assert.equal(refs.length,3);s.setChoice(action({memorySelections:refs,habitCandidates:[pair(before),pair(before)]}));assert.equal((await s.post({operation:'advance',minutes:15})).status,502);assert.equal(owner(await s.read()).eventHabits?.length||0,0);}finally{s.restore();}
});

test('a generic adjudication preserves activity identity, body consequences and resumability together through the routine-offer route',async()=>{
 const s=await setup(undefined,action({type:'propose',target:'workpiece',content:'慢慢打磨眼前的木片',purpose:'打磨',timeIntent:{kind:'completion',maxMinutes:null}}));try{
 let w=await s.read();w.objects=[{id:'workpiece',source:'workpiece',label:'木片',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{finish:'raw'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{finish:['raw','smooth']}}];store.replaceCommittedWorld(w);
 s.setReply({status:'accepted',routine:null,resumable:true,activityIdentity:{version:1,key:'polish-wood',label:'打磨木片'},bodyActivity:{version:1,kind:'exertion',fatiguePerHour:8,sleepPerHour:0},completionMinutes:30,effects:[{kind:'state',objectId:'workpiece',expectedRevision:1,key:'finish',value:'smooth'}],stages:[],check:null});
 w=await advance(s);const plan=owner(w).plan;assert.equal(plan.resumable,true);assert.equal(plan.bodyActivity.kind,'exertion');assert.equal(owner(w).habitEvidence[0].confirmedIdentity.key,'polish-wood');assert.equal(w.objects[0].state.finish,'raw');assert.equal(s.inputs.find(i=>i.contractVersion==='world-adjudication.v1').routineOffer.genericMethods.maxPrograms,8);
 w=await advance(s);assert.equal(w.objects[0].state.finish,'smooth');assert.equal(owner(w).plan,undefined);assert.equal(owner(w).habitEvidence.length,1);assert.equal(s.calls(),2,'phase continuation must preserve the original model and adjudication dispatches');
 }finally{s.restore();}
});

test('activity identity labels are scoped to the acting NPC across committed rounds, while own identity relabeling rolls back',async()=>{
 const s=await setup();try{
 let w=await s.read();w.characters.forEach(c=>{c.control={mode:c.id==='cass'?'autonomous':'taken-over'};});w.objects=[['cass','cass-cup','kris-home-main'],['owner','owner-cup','cafe-front']].map(([actor,id,region])=>({id,source:id,label:'杯子',region,holder:actor,owner:actor,revision:1,state:{contents:'water'},lifecycle:'active',kind:'utensil',knownTo:[actor],allowedTo:[actor],stateTransitions:{contents:['water','tea']}}));store.replaceCommittedWorld(w);
 const proposal=actor=>action({type:'propose',target:actor+'-cup',content:'用眼前杯子準備一份茶',purpose:'準備自己的茶'});
 const candidate=(actor,label,revision=1,value='tea')=>({status:'accepted',routine:null,activityIdentity:{version:1,key:'prepare-tea',label},completionMinutes:15,effects:[{kind:'state',objectId:actor+'-cup',expectedRevision:revision,key:'contents',value}],stages:[],check:null});
 s.setChoice(input=>input.self.id==='cass'?proposal('cass'):action());s.setReply(candidate('cass','私有甲泡茶分類'));w=await advance(s);assert.equal(w.characters.find(c=>c.id==='cass').habitEvidence[0].confirmedIdentity.label,'私有甲泡茶分類');assert.equal(owner(w).habitEvidence,undefined);
 assert.equal((await s.post({operation:'return-control'})).status,200);s.setChoice(input=>input.self.id==='owner'?proposal('owner'):action());s.setReply(candidate('owner','準備茶'));w=await advance(s);assert.equal(owner(w).habitEvidence[0].confirmedIdentity.label,'準備茶');assert.equal(w.characters.find(c=>c.id==='cass').habitEvidence[0].confirmedIdentity.label,'私有甲泡茶分類');
 let input=s.inputs.findLast(i=>i.contractVersion==='world-adjudication.v1'&&i.actor.id==='owner');assert.deepEqual(input.knownActivityIdentities,[]);const npc=s.inputs.findLast(i=>i.self?.id==='owner');assert.equal(JSON.stringify(npc).includes('私有甲泡茶分類'),false);
 const before=structuredClone(w);s.setReply(candidate('owner','任意改名',2,'water'));const failed=await s.post({operation:'advance',minutes:15});assert.equal(failed.status,502);w=await s.read();assert.deepEqual(w.objects,before.objects);assert.deepEqual(owner(w).habitEvidence,owner(before).habitEvidence);assert.equal(w.turn,before.turn);
 input=s.inputs.findLast(i=>i.contractVersion==='world-adjudication.v1'&&i.actor.id==='owner');assert.deepEqual(input.knownActivityIdentities,[{version:1,key:'prepare-tea',label:'準備茶'}]);
 }finally{s.restore();}
});

test('same-project challenge continuation cannot fabricate a new autonomous start, but the first failed attempt remains evidence',async()=>{
 const s=await setup(undefined,action({type:'work',target:'craft-challenge',content:'花朵髮飾'}));const random=Math.random;let rolls=0;Math.random=()=>{rolls++;return 0.001;};try{
 let w=await advance(s);const first=structuredClone(owner(w).habitEvidence);assert.equal(first.length,1);assert.ok(first[0].eventId);assert.ok(first[0].memory);assert.equal(w.events.find(e=>e.id===first[0].eventId).resolution.outcome,'critical-failure');assert.equal(owner(w).projects[0].status,'spoiled');
 w=await advance(s);assert.equal(w.events.findLast(e=>e.actor==='owner').kind,'continue');assert.deepEqual(owner(w).habitEvidence,first);assert.equal(owner(w).habits[0].observedDays.length,1);assert.equal(rolls,1);
 }finally{Math.random=random;s.restore();}
});
