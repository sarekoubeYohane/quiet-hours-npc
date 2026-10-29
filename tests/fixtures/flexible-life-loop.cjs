/* eslint-disable @typescript-eslint/no-require-imports -- External transport fixture shared by API and browser. */
const {fixturePursuitDecision}=require('../pursuit-fixture.cjs');
const assert=require('node:assert/strict');
const action=(type='reflect',extra={})=>({type,target:'',content:'依自己所知重新考慮生活',mood:'平靜',durationMinutes:15,timeIntent:{kind:['reflect','rest','continue'].includes(type)?'open-ended':'completion',maxMinutes:null},intents:[],attentionConditions:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],preferenceUpdates:[],habitCandidates:[],arrangementUpdates:[],interpretation:'',...extra});
const intent=(id,content)=>({id,content,intensity:'medium',importance:'medium',urgency:'low',context:'由我自行決定順序'});
function initialWorld(seedWorld,ids=['owner']){
 const w=seedWorld();w.minute=480;w.turn=0;w.contextId='flexible-life-193';w.events=[];w.characters=w.characters.filter(c=>ids.includes(c.id));w.adjudication={provider:'openai',model:'fixture-world'};w.playerBudget={calls:500,tokens:2000000};
 for(const c of w.characters){c.memories=[{time:480,text:'我想自行安排今天的生活。'}];delete c.shortTerm;c.location='cafe';c.region='cafe-front';c.control={mode:'autonomous'};c.needs={version:1,activatedAt:480,updatedAt:480,values:{hunger:0,thirst:0,fatigue:70,sleep:80},assessed:{hunger:0,thirst:0,fatigue:2,sleep:2},history:[],dropped:0};}
 return w;
}
function transport(){let choose=()=>action(),npc=0,adjudication=0;const inputs=[],requests=[];return {inputs,requests,choose:fn=>{choose=fn;},counts:()=>({npc,adjudication}),respond:request=>{
 const input=JSON.parse(request.messages[1].content);inputs.push(input);requests.push(request);let value;
 if(input.contractVersion==='world-adjudication.v1'){adjudication++;value={status:'accepted',completionMinutes:480,check:null,effects:[],stages:[],routine:null,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}};}
 else {npc++;value=choose(input);}
 return Response.json({usage:{prompt_tokens:20,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixturePursuitDecision(JSON.parse(request.messages[1].content),value))}}]});
 }};}
const phoneAction=(input,command)=>action('phone',{target:input.phones.find(p=>p.owner===input.self.id).objectId,content:JSON.stringify(fixturePursuitDecision(input,{collection:'calendar',...command}))});
const actor=w=>w.characters.find(c=>c.id==='owner');
const device=w=>w.phones.devices.find(d=>w.objects.find(o=>o.id===d.objectId).owner==='owner');
async function run(s,checkpoint=async()=>{}){
 const beginning=await s.read(),firstDue=beginning.minute+90;
 s.transport.choose(input=>action('reflect',{arrangementUpdates:[{operation:'upsert',id:'later-conversation',version:0,text:'晚些時候再考慮與朋友談近況',condition:{kind:'time',minute:firstDue},references:[{kind:'short',id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version}],reason:'這是我目前的未來期待'}],intents:[intent('rest-first','先照顧自己的睡眠'),intent('talk-later','之後再談近況')]}));
 let w=await s.advance();assert.equal(actor(w).arrangements.items[0].version,1);assert.deepEqual(actor(w).intents.map(i=>i.id),['rest-first','talk-later']);
 s.transport.choose(input=>phoneAction(input,{operation:'create',id:'private-calendar',version:0,text:'原文：醒來後再考慮談近況，不代表已經答應。',arrangement:{id:'later-conversation',version:1},condition:{kind:'time',minute:firstDue},reminder:true}));
 w=await s.advance();assert.equal(device(w).calendar[0].readers.length,0);await checkpoint('recorded',w);
 s.transport.choose(()=>action('propose',{target:'cafe',content:'在安全角落真正睡一覺',purpose:'睡眠恢復',durationMinutes:480}));
 w=await s.advance();assert.equal(actor(w).plan.bodyActivity.kind,'sleep');const asleepCounts=s.transport.counts();let sleepingRounds=0,missed;
 s.transport.choose(input=>phoneAction(input,{operation:'list'}));
 while(actor(w).plan?.bodyActivity?.kind==='sleep'){
  w=await s.advance(30);sleepingRounds++;assert.ok(sleepingRounds<30,'natural waking must be bounded');
  if(actor(w).plan?.bodyActivity?.kind==='sleep')assert.deepEqual(s.transport.counts(),asleepCounts);
  if(!missed&&device(w).notifications?.length){missed=structuredClone(w);assert.equal(device(w).notifications[0].exposures.find(e=>e.actorId==='owner').status,'no-opportunity');assert.equal(device(w).calendar[0].readers.length,0);await checkpoint('missed-asleep',w);}
 }
 assert.ok(missed);assert.ok(w.minute>firstDue);assert.ok(w.events.some(e=>e.text.includes('自然醒')));assert.equal(device(w).calendar[0].readers.length,0);assert.equal(actor(w).arrangements.items[0].status,'active');
 const countBeforeRead=s.transport.counts();s.transport.choose(input=>phoneAction(input,{operation:'read',id:'private-calendar',version:1}));w=await s.advance();assert.equal(device(w).calendar[0].readers[0].actorId,'owner');assert.equal(s.transport.counts().npc,countBeforeRead.npc+1);await checkpoint('late-read',w);
 const postponed=w.minute+60;
 s.transport.choose(input=>({...phoneAction(input,{operation:'reminder',id:'private-calendar',version:1,condition:{kind:'time',minute:postponed}}),arrangementUpdates:[{operation:'upsert',id:'later-conversation',version:1,text:'先休息，稍後再考慮談近況',condition:{kind:'time',minute:postponed},references:[{kind:'short',id:input.self.shortTerm.at(-1).id,version:input.self.shortTerm.at(-1).version}],reason:'實際查看後我決定延期'}],intents:[intent('own-rest','先留時間休息'),intent('talk-later','稍後再考慮談近況')]}));
 w=await s.advance();assert.equal(actor(w).arrangements.items[0].version,2);assert.equal(device(w).calendar[0].reminder.condition.minute,postponed);assert.equal(device(w).calendar[0].text,'原文：醒來後再考慮談近況，不代表已經答應。');await checkpoint('postponed',w);
 s.transport.choose(()=>action('rest',{durationMinutes:180,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[intent('own-rest','先留時間休息'),intent('talk-later','稍後再考慮談近況')]}));w=await s.advance();const plan=structuredClone(actor(w).plan),beforeDue=s.transport.counts();
 s.transport.choose(()=>action('continue',{intents:[intent('own-rest','先完成休息'),intent('talk-later','之後再想談話')]}));
 while(w.minute<postponed)w=await s.advance(15);
 assert.equal(device(w).notifications.length,2);assert.equal(s.transport.counts().npc,beforeDue.npc+1);assert.equal(actor(w).plan.startedAt,plan.startedAt);assert.equal(actor(w).plan.until,plan.until);assert.equal(actor(w).arrangements.items[0].status,'active');await checkpoint('continue-after-reminder',w);
 const quiet=s.transport.counts();w=await s.advance(15);assert.deepEqual(s.transport.counts(),quiet);
 await s.intervene('我想聽聽你接下來如何安排；由你決定。');
 s.transport.choose(input=>action('continue',{arrangementUpdates:[{operation:'drop',id:'later-conversation',version:2,text:input.self.arrangements.items.find(a=>a.id==='later-conversation').text,condition:{kind:'time',minute:postponed},references:[{kind:'short',id:input.self.shortTerm.at(-1).id,version:input.self.shortTerm.at(-1).version}],reason:'我目前不想繼續保留這項期待'}],intents:[intent('own-rest','繼續照顧自己')]}));
 w=await s.advance();assert.equal(actor(w).arrangements.items[0].status,'dropped');assert.equal(device(w).calendar.length,1);assert.equal(actor(w).plan.startedAt,plan.startedAt);assert.deepEqual(actor(w).intents.map(i=>i.id),['own-rest']);await checkpoint('dropped',w);
 const latest=await s.read();assert.deepEqual(latest.phones,w.phones);assert.deepEqual(latest.characters,w.characters);
 return {world:w,counts:s.transport.counts(),sleepingRounds,elapsedMinutes:w.minute-beginning.minute};
}
module.exports={action,intent,initialWorld,transport,phoneAction,actor,device,run};
