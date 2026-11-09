/* eslint-disable @typescript-eslint/no-require-imports */
const { originalWorldInput } = require('./original-scope-fixture.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
function setup(prepare=()=>{}){const w=seedWorld();w.contextId='needs-278';w.characters=w.characters.filter(c=>c.id==='owner');w.characters[0].control={mode:'taken-over',experiences:[]};prepare(w);store.install(w);return {post:b=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(originalWorldInput({operationId:id(),worldContext:w.contextId,mode:'demo',...b}, 'test-owner'))})),read:async()=>(await(await GET()).json()).world};}
const settings=(traits={hunger:[0.8],thirst:[1],sleep:[1.2]})=>({operation:'enable-body-needs',bodyNeeds:[{id:'owner',traits}]});
test('owner explicitly enables bounded need traits once; GET, SQLite reload and original operation replay preserve them',async()=>{
 const s=setup();assert.equal((await s.read()).characters[0].needs,undefined);
 const op={...settings(),operationId:id()};const response=await s.post(op);assert.equal(response.status,200,await response.clone().text());
 const c=(await s.read()).characters[0];assert.deepEqual(c.needs.personal.traits,{hunger:0.8,thirst:1,sleep:1.2});assert.deepEqual(c.needs.values,{hunger:20,thirst:20,fatigue:15,sleep:20});
 await s.post(op);assert.deepEqual((await s.read()).characters[0].needs,c.needs);
 const r=await s.post(settings({hunger:[1.2],thirst:[1],sleep:[1]}));assert.equal(r.status,400);assert.deepEqual((await s.read()).characters[0].needs,c.needs);
});
test('personalized actual time uses independent five-minute dice and survives SQLite split advances without reroll',async()=>{
 const s=setup(w=>{w.minute=482;});await s.post(settings());const start=await s.read();
 const first=await s.post({operation:'advance',minutes:30});assert.equal(first.status,200,await first.clone().text());const whole=(await s.read()).characters[0].needs;
 assert.notEqual(whole.values.hunger,21.5);assert.ok(whole.values.sleep>21.5);assert.ok(whole.history.some(h=>h.reason.includes('個人化')));
 store.install(start);await s.post({operation:'advance',minutes:15});await s.read();await s.post({operation:'advance',minutes:15});const split=(await s.read()).characters[0].needs;
 assert.deepEqual(split.values,whole.values);assert.deepEqual(split.personal,whole.personal);
});
test('invalid background bounds, precision or contradictory opening feelings cannot activate or reset needs',async()=>{
 for(const extra of [{traits:{hunger:[0.7]}},{initial:{sleep:1.234}},{initial:{hunger:0.291}},{initial:{sleep:0},feelings:{sleep:3}}]){
  const s=setup();const r=await s.post({operation:'enable-body-needs',bodyNeeds:[{id:'owner',...extra}]});assert.equal(r.status,400);assert.equal((await s.read()).characters[0].needs,undefined);
 }
 const s=setup();await s.post({operation:'enable-body-needs',bodyNeeds:[{id:'owner',initial:{hunger:0.29,thirst:100},feelings:{fatigue:2}}]});assert.deepEqual((await s.read()).characters[0].needs.values,{hunger:0.29,thirst:100,fatigue:75,sleep:20});
});
test('an already sleeping legacy actor keeps the entire old curve until actual wake and only then switches at commit',async()=>{
 const s=setup(w=>{const c=w.characters[0];c.needs={version:1,activatedAt:w.minute,updatedAt:w.minute,values:{hunger:20,thirst:20,fatigue:70,sleep:21},assessed:{hunger:0,thirst:0,fatigue:2,sleep:0},history:[],dropped:0};c.plan={action:{type:'rest',content:'既有已確認睡眠',mood:'平靜'},startedAt:w.minute,until:w.minute+1440,attention:'',modelKey:'demo',bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14},sleep:{elapsedMinutes:0}};});
 await s.post(settings());assert.equal((await s.read()).characters[0].needs.personal.status,'pending-sleep');
 const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const c=(await s.read()).characters[0];
 assert.equal(c.needs.values.hunger,20.75);assert.equal(c.needs.values.thirst,21.5);assert.equal(c.needs.values.sleep,20.6);assert.equal(c.needs.personal.status,'active');assert.equal(c.needs.personal.activatedAt,c.needs.updatedAt);assert.equal(c.needs.personal.grid,undefined);
});
test('new actual rest uses the real API interval and preserves separate sleep demand',async()=>{
 const s=setup(w=>{const c=w.characters[0];c.needs={version:1,activatedAt:w.minute,updatedAt:w.minute,values:{hunger:20,thirst:20,fatigue:70,sleep:21},assessed:{hunger:0,thirst:0,fatigue:2,sleep:0},history:[],dropped:0};});
 await s.post(settings());await s.post({operation:'direct',action:{type:'rest',content:'先安靜休息'}});await s.post({operation:'advance',minutes:15});
 // The real route must retain the actual first rest interval, not a detached helper result.
 const c=(await s.read()).characters[0];assert.ok(c.needs.values.fatigue<70);assert.ok(c.needs.values.sleep>21);assert.equal(c.plan.bodyActivity.kind,'rest');
});
test('corrupt persisted policy or saved time dice rejects advance without creating partial body history',async()=>{
 const s=setup();await s.post(settings());const original=await s.read();
 for(const corrupt of [p=>p.seed=0,p=>p.traits.hunger=2,p=>p.units.sleep=null,p=>p.grid={start:0,dice:{hunger:0,thirst:1,fatigue:1,sleep:1}},p=>p.version=99]){
  const damaged=structuredClone(original);corrupt(damaged.characters[0].needs.personal);store.install(damaged);const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,502);assert.deepEqual((await s.read()).characters[0].needs,damaged.characters[0].needs);
 }
});
test('confirmed actual sleep restores only elapsed randomized grids and does not hide ordinary hunger or private inputs',async()=>{
 const {fixtureDecision}=require('./pursuit-fixture.cjs');
 const s=setup(w=>{w.characters[0].control={mode:'autonomous'};w.adjudication={provider:'openai',model:'fixture-judge'};});
 const random=Math.random,old=global.fetch;Math.random=()=>0;
 try{
  await s.post({operation:'enable-body-needs',bodyNeeds:[{id:'owner',traits:{hunger:[1],thirst:[1],sleep:[1]},initial:{sleep:21,fatigue:70}}]});
  Math.random=random;await s.post({operation:'set-model-key',mode:'openai',key:'fixture-key'});
  let npc=0;global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);let v;
   if(input.contractVersion==='world-adjudication.v1')v={status:'accepted',effects:[],stages:[],check:null,routine:null,completionMinutes:480,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}};
   else{npc++;assert.ok(input.self.bodyFeelings);assert.equal(input.self.needs,undefined);assert.doesNotMatch(JSON.stringify(input.self),/personalSnapshot|constraints|requestedAt|seed/);v=npc===1?{type:'propose',target:'cafe',content:'在安全角落睡一覺',purpose:'睡眠恢復',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}}:{type:'reflect',target:'',content:'醒來安靜想想',mood:'平靜',durationMinutes:90,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};}
   return Response.json({usage:{prompt_tokens:10,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(input,v))}}]});};
  const post=minutes=>s.post({operation:'advance',minutes,mode:'openai',model:'gpt-6-luna'});const r=await post(15);assert.equal(r.status,200,await r.clone().text());
  let c=(await s.read()).characters[0];assert.ok(c.needs.values.sleep<=21);assert.ok(c.needs.values.fatigue<70);assert.ok(c.needs.values.hunger>20);assert.ok(c.needs.values.thirst>20);
  await post(15);c=(await s.read()).characters[0];assert.notEqual(c.plan?.bodyActivity?.kind,'sleep');assert.ok(c.needs.values.sleep>=19&&c.needs.values.sleep<23);assert.ok(npc<=2);
 }finally{Math.random=random;global.fetch=old;}
});
test('CAS failure or uncertain save cannot redraw an effective interval or leave a partial activation',async()=>{
 const s=setup();store.conflictOnNextSave();const enable={...settings(),operationId:id()};assert.equal((await s.post(enable)).status,502);assert.equal((await s.read()).characters[0].needs,undefined);await s.post(enable);assert.equal((await s.read()).characters[0].needs,undefined);
 await s.post(settings());const before=await s.read();store.conflictOnNextSave();const failed={operation:'advance',minutes:15,operationId:id()};assert.equal((await s.post(failed)).status,502);assert.deepEqual((await s.read()).characters[0].needs,before.characters[0].needs);await s.post(failed);assert.deepEqual((await s.read()).characters[0].needs,before.characters[0].needs);
 store.throwAfterNextSave();const uncertain={operation:'advance',minutes:15,operationId:id()};await s.post(uncertain);const committed=(await s.read()).characters[0].needs;await s.post(uncertain);assert.deepEqual((await s.read()).characters[0].needs,committed);
});
test('two explicitly bounded backgrounds use distinct traits and actual work loads without endurance or d100',async()=>{
 const s=setup(w=>{const other=seedWorld().characters.find(c=>c.id==='cass');other.control={mode:'taken-over',experiences:[]};w.characters.push(other);for(const [i,c] of w.characters.entries())c.plan={action:{type:'work',content:'已確認的持續工作',mood:'平靜'},startedAt:w.minute,until:w.minute+300,attention:'',modelKey:'demo',bodyActivity:{version:1,kind:'exertion',fatiguePerHour:i?9:3,sleepPerHour:0}};});
 const enabled=await s.post({operation:'enable-body-needs',bodyNeeds:[{id:'owner',source:'已確認：餓得較慢，睡意累積較慢',traits:{hunger:[0.8],thirst:[1],sleep:[0.8]}},{id:'cass',source:'已確認：餓渴睡意累積較快',traits:{hunger:[1.2],thirst:[1.2],sleep:[1.2]}}]});assert.equal(enabled.status,200,await enabled.clone().text());
 // Same controlled random-source seed isolates background and workload effects.
 const initial=await s.read();for(const c of initial.characters)c.needs.personal.seed=1;store.install(initial);
 for(let i=0;i<8;i++)assert.equal((await s.post({operation:'advance',minutes:30})).status,200);
 const [a,b]=(await s.read()).characters;assert.ok(a.needs.values.hunger<b.needs.values.hunger);assert.ok(a.needs.values.thirst<b.needs.values.thirst);assert.ok(a.needs.values.fatigue<b.needs.values.fatigue);assert.ok(a.needs.values.sleep<b.needs.values.sleep);assert.equal(a.attributes,undefined);assert.equal(b.attributes,undefined);
});
test('real confirmed ingestion consumes the serving once and keeps its explicit relief under the new time policy',async()=>{
 const {fixtureDecision}=require('./pursuit-fixture.cjs'),old=global.fetch;
 const s=setup(w=>{w.characters[0].control={mode:'autonomous'};w.adjudication={provider:'openai',model:'fixture-judge'};w.objects=[{id:'meal',source:'fixture',label:'有明示份量的餐點',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{},lifecycle:'active',kind:'food',quantity:{amount:1,unit:'serving'},consumable:true,knownTo:['owner'],allowedTo:['owner']}];});
 try{
  await s.post(settings());await s.post({operation:'set-model-key',mode:'openai',key:'fixture-key'});
  global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);const v=input.contractVersion==='world-adjudication.v1'?{status:'accepted',effects:[{kind:'ingest',version:1,objectId:'meal',expectedRevision:1,hungerRelief:15,thirstRelief:0}],stages:[],check:null,routine:null,completionMinutes:15}:{type:'propose',target:'meal',content:'吃這份餐點',purpose:'進食',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};return Response.json({usage:{prompt_tokens:10,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(input,v))}}]});};
  const op={operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna',operationId:id()},r=await s.post(op);assert.equal(r.status,200,await r.clone().text());const w=await s.read();assert.equal(w.objects.find(o=>o.id==='meal').lifecycle,'consumed');assert.equal(w.objects.find(o=>o.id==='meal').quantity.amount,0);assert.ok(w.characters[0].needs.values.hunger>=5.48&&w.characters[0].needs.values.hunger<=5.72);const before=structuredClone(w.characters[0].needs);await s.post(op);assert.deepEqual((await s.read()).characters[0].needs,before);
 }finally{global.fetch=old;}
});
test('all four needs remain bounded while real rest cannot substitute for sleep recovery',async()=>{
 const upper=setup();await upper.post({operation:'enable-body-needs',bodyNeeds:[{id:'owner',initial:{hunger:100,thirst:100,fatigue:100,sleep:100}}]});await upper.post({operation:'advance',minutes:30});assert.deepEqual((await upper.read()).characters[0].needs.values,{hunger:100,thirst:100,fatigue:100,sleep:100});
 const lower=setup();await lower.post({operation:'enable-body-needs',bodyNeeds:[{id:'owner',initial:{hunger:0,thirst:0,fatigue:0,sleep:0}}]});await lower.post({operation:'direct',action:{type:'rest',content:'安靜休息'}});await lower.post({operation:'advance',minutes:15});const c=(await lower.read()).characters[0];assert.equal(c.needs.values.fatigue,0);assert.ok(c.needs.values.hunger>0&&c.needs.values.thirst>0&&c.needs.values.sleep>0);
});
test('five-minute application sleep starts forward with zero prepaid recovery and later wakes at a real grid boundary',async()=>{
 const {fixtureDecision}=require('./pursuit-fixture.cjs'),old=global.fetch;
 const s=setup(w=>{w.characters[0].control={mode:'autonomous'};w.adjudication={provider:'openai',model:'fixture-judge'};});
 try{
  await s.post({operation:'enable-body-needs',bodyNeeds:[{id:'owner',traits:{hunger:[1],thirst:[1],sleep:[1]},initial:{sleep:21,fatigue:70}}]});await s.post({operation:'set-model-key',mode:'openai',key:'fixture-key'});
  let npc=0;global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);const v=input.contractVersion==='world-adjudication.v1'?{status:'accepted',effects:[],stages:[],check:null,routine:null,completionMinutes:480,bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}}:++npc===1?{type:'propose',target:'cafe',content:'在安全角落睡一覺',purpose:'睡眠恢復',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}}:{type:'reflect',target:'',content:'醒來安靜想想',mood:'平靜',durationMinutes:90,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};return Response.json({usage:{prompt_tokens:10,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(input,v))}}]});};
  const advance=async()=>{const r=await s.post({operation:'advance',minutes:5,timeContract:'five-minute-v1',mode:'openai',model:'gpt-6-luna'});assert.equal(r.status,200,await r.clone().text());return s.read();};
  let w=await advance(),c=w.characters[0];assert.equal(c.plan.startedAt,w.minute);assert.equal(c.plan.sleep.elapsedMinutes,0);assert.ok(c.needs.values.fatigue>=70&&c.needs.values.sleep>21);const first=c.needs.values;
  w=await advance();c=w.characters[0];assert.equal(c.plan.sleep.elapsedMinutes,5);assert.ok(c.needs.values.fatigue<first.fatigue&&c.needs.values.sleep<first.sleep);assert.ok(c.needs.values.hunger>first.hunger&&c.needs.values.thirst>first.thirst);
  for(let i=0;i<4&&c.plan?.bodyActivity?.kind==='sleep';i++){w=await advance();c=w.characters[0];}assert.notEqual(c.plan?.bodyActivity?.kind,'sleep');assert.ok(w.events.some(e=>e.text.includes('自然醒')));assert.equal(w.minute%5,0);assert.equal(npc,2);
 }finally{global.fetch=old;}
});
