/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const fixture=require('./fixtures/life-loop.cjs');
const id=()=>Date.now()+':'+crypto.randomUUID();
const owner=w=>w.characters.find(c=>c.id==='owner');
async function scenario(secondActor=false,prepare=()=>{}){
 const world=fixture.initialWorld(seedWorld,secondActor);prepare(world);store.install(world);const transport=fixture.model(),old=global.fetch,oldRandom=Math.random;Math.random=()=>0.65;
 global.fetch=async(_url,init)=>transport.respond(JSON.parse(init.body));
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});
 const read=async()=>(await(await GET()).json()).world;
 const advance=async(minutes=15,extra={})=>{const r=await post({operation:'advance',minutes,...extra});assert.equal(r.status,200,await r.clone().text());return read();};
 return {post,read,advance,transport,restore:()=>{global.fetch=old;Math.random=oldRandom;}};
}
test('one saved world lives through need pressure, actual ingestion, paused long work, sleep and three days of subjective habits',async()=>{
 const s=await scenario();try{
  await require('./fixtures/life-loop-flow.cjs')(s,load('habits'));
 }finally{s.restore();}
});

test('combined living state shares later-actor and before/after-save recovery boundaries without repeating original operations',async()=>{
 for(const failure of ['later-actor','before-save','after-save']){
  const s=await scenario(true);try{
   await s.advance();s.transport.choose(fixture.choose('pause'));await s.advance();const before=await s.read();assert.ok(owner(before).pausedActivity);
   s.transport.choose(input=>({...fixture.ingest,preferenceUpdates:[{operation:'upsert',id:'eat-before-work',version:0,topic:'工作與吃飯',context:'餓著做長工作時',text:'我比較願意先吃一點再繼續。',references:[{kind:'short',id:input.self.shortTerm.at(-1).id,version:input.self.shortTerm.at(-1).version}],reason:'剛才暫停與飢餓的可知經驗令我想保留這個偏愛。'}]}));
   if(failure==='later-actor')s.transport.failLater(true);if(failure==='before-save')store.throwBeforeNextSave();if(failure==='after-save')store.throwAfterNextSave();
   const body={operation:'advance',minutes:15,operationId:id()},response=await s.post(body),result=await response.json(),saved=await s.read(),calls=s.transport.counts();
   const story=world=>{const copy=structuredClone(world);delete copy.aiUsage;return copy;};
   if(failure==='after-save'){assert.equal(owner(saved).preferences.items[0].id,'eat-before-work');assert.equal(saved.objects.find(o=>o.id==='meal').lifecycle,'consumed');assert.equal(owner(saved).needs.values.hunger,16.25);assert.equal(owner(saved).pausedActivity.elapsedMinutes,30);assert.equal(saved.objects.find(o=>o.id==='material').revision,2);}else{assert.equal(response.status,502);assert.deepEqual(story(saved),story(before));}
   const replay=await s.post(body);assert.equal(replay.status,response.status);assert.deepEqual(await replay.json(),result);assert.deepEqual(s.transport.counts(),calls);assert.deepEqual(story(await s.read()),story(saved));assert.ok(saved.aiUsage.totalCalls>before.aiUsage.totalCalls);
  }finally{s.restore();}
 }
});

test('a legacy drinking method can explicitly reconfirm bodily consequences once and then reuse its new scope for free',async()=>{
 const legacy={id:'legacy-drink',version:1,family:'cafe-service',origin:'cafe',knownTo:['owner'],operations:['drink'],templates:[{operation:'drink',verbs:['喝'],subjects:['茶'],purposes:['飲用'],result:{kind:'consume',minutes:15}}]};
 const s=await scenario(false,w=>{delete owner(w).needs;w.routineRules=[structuredClone(legacy)];w.objects=['a','b','c'].flatMap(suffix=>{const base={source:'initial-fixture',region:'cafe-front',holder:'owner',owner:'owner',revision:1,lifecycle:'active',knownTo:['owner'],allowedTo:['owner']};return [{...base,id:`cup-${suffix}`,label:'原杯子',kind:'utensil',consumable:false,state:{contents:'tea'},stateTransitions:{contents:['empty','tea','dirty']}},{...base,id:`tea-${suffix}`,label:'原杯中茶',kind:'food',consumable:true,quantity:{amount:1,unit:'serving'},state:{vessel:`cup-${suffix}`,beverage:'tea'}}];});});try{
  const choose=(suffix,reconfirm)=>fixture.choose('propose',{target:`cup-${suffix}`,content:'喝茶',purpose:'飲用',...(reconfirm?{reconfirmBodyConsequences:true}:{})});
  s.transport.choose(choose('a',false));let w=await s.advance();assert.equal(w.objects.find(o=>o.id==='tea-a').lifecycle,'consumed');assert.equal(owner(w).needs.values.thirst,21.5);assert.equal(s.transport.counts().adjudication,0);assert.deepEqual(w.routineRules[0],legacy);
  s.transport.judge(()=>({status:'accepted',effects:[],stages:[],check:null,completionMinutes:null,routine:{version:3,family:'cafe-service',operation:'drink-with-body-impact',subject:'茶',timings:[{operation:'drink-with-body-impact',minutes:15}],programs:[{operation:'drink-with-body-impact',methods:[{content:'喝茶',purpose:'飲用'}],bindings:[{role:'vessel',type:'object',select:'target',kind:'utensil',label:null,state:[{key:'contents',value:'tea'}],access:'authorized',link:null,background:null,quantity:null,sourceRole:null,sourceSubject:null},{role:'serving',type:'object',select:'linked',kind:'food',label:null,state:[{key:'beverage',value:'tea'}],access:'authorized',link:{role:'vessel',key:'vessel'},background:null,quantity:null,sourceRole:null,sourceSubject:null}],effects:[],check:null,branches:null,stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'ingest',version:1,objectId:'$serving',expectedRevision:0,hungerRelief:0,thirstRelief:15},{kind:'state',objectId:'$vessel',expectedRevision:0,key:'contents',value:'empty'}]}]}]}}));
  s.transport.choose(choose('b',true));w=await s.advance();assert.equal(w.objects.find(o=>o.id==='tea-b').lifecycle,'consumed');assert.equal(owner(w).needs.values.thirst,8);assert.equal(s.transport.counts().adjudication,1);assert.equal(w.routineRules.length,2);assert.deepEqual(w.routineRules[0],legacy);assert.equal(w.routineRules[1].version,3);
  s.transport.choose(choose('c',true));w=await s.advance();assert.equal(w.objects.find(o=>o.id==='tea-c').lifecycle,'consumed');assert.equal(owner(w).needs.values.thirst,0);assert.equal(s.transport.counts().adjudication,1);assert.equal(w.routineRules.length,2);assert.deepEqual(w.routineRules[0],legacy);
 }finally{s.restore();}
});

test('an unconfirmed body review is not paid again for the same method and facts, while original legacy behavior remains available',async()=>{
 const s=await scenario(false,w=>{delete owner(w).needs;w.routineRules=[{id:'old-drink',version:1,family:'cafe-service',origin:'cafe',knownTo:['owner'],operations:['drink'],templates:[{operation:'drink',verbs:['喝'],subjects:['茶'],purposes:['飲用'],result:{kind:'consume',minutes:15}}]}];const base={source:'initial-fixture',region:'cafe-front',holder:'owner',owner:'owner',revision:1,lifecycle:'active',knownTo:['owner'],allowedTo:['owner']};w.objects=[{...base,id:'cup',label:'原杯',kind:'utensil',state:{contents:'tea'},stateTransitions:{contents:['tea','dirty']}},{...base,id:'tea',label:'原茶',kind:'food',consumable:true,state:{vessel:'cup',beverage:'tea'}}];});try{
  s.transport.judge(()=>({status:'unsupported',effects:[],stages:[],check:null,routine:null,completionMinutes:null}));s.transport.choose(fixture.choose('propose',{target:'cup',content:'喝茶',purpose:'飲用',reconfirmBodyConsequences:true}));
  let w=await s.advance();assert.equal(s.transport.counts().adjudication,1);assert.equal(w.bodyReconfirmation.attempts.length,1);assert.equal(w.objects[1].lifecycle,'active');w=await s.advance();assert.equal(s.transport.counts().adjudication,1);assert.equal(w.objects[1].lifecycle,'active');assert.equal(owner(w).needs.values.thirst,23);assert.match(owner(w).activity,/先前還未能確認/);
  s.transport.choose(fixture.choose('propose',{target:'cup',content:'喝茶',purpose:'飲用'}));w=await s.advance();assert.equal(w.objects[1].lifecycle,'consumed');assert.equal(owner(w).needs.values.thirst,24.5);assert.equal(s.transport.counts().adjudication,1);
 }finally{s.restore();}
});

test('the same thirst pressure accepts drinking water, preparing tea, socializing or continuing work without forced intentions',async()=>{
 for(const choice of ['water','tea','social','continue']){
  const s=await scenario(false,w=>{owner(w).needs.values={hunger:20,thirst:70,fatigue:15,sleep:20};owner(w).needs.assessed={hunger:0,thirst:0,fatigue:0,sleep:0};w.objects.push({id:'tea-material',label:'本人茶葉',kind:'food',source:'initial-fixture',revision:1,region:'cafe-front',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],lifecycle:'active',state:{},consumable:false,quantity:{amount:1,unit:'bag'}});if(choice==='continue')owner(w).plan={action:{type:'work',target:'tidy',content:'持續整理'},startedAt:480,until:720,attention:'',modelKey:'openai:gpt-6-luna',timeIntent:{kind:'open-ended',maxMinutes:null}};});try{
  const intents=[{id:'own-priority',content:'先依自己的安排做事',intensity:'low',importance:'high',urgency:'low',context:'口渴可以稍後處理'}];
  s.transport.choose(fixture.choose(choice==='social'?'say':choice==='continue'?'continue':'propose',{target:choice==='social'?'observer':choice==='continue'?'':'water',content:choice==='water'?'喝本人飲水':choice==='tea'?'用本人飲水和茶葉準備茶':choice==='social'?'我想先聊一會兒':'繼續自己的工作',...(choice==='water'||choice==='tea'?{purpose:choice==='water'?'飲用':'準備茶'}:{}),intents}));
  s.transport.judge(()=>choice==='water'?{status:'accepted',routine:null,effects:[{kind:'ingest',version:1,objectId:'water',expectedRevision:1,hungerRelief:0,thirstRelief:25}],stages:[],check:null,completionMinutes:15}:{status:'accepted',routine:null,effects:[{kind:'form',version:1,access:'authorized',operation:'transform',inputs:[{objectId:'water',expectedRevision:1,quantity:{amount:1,unit:'serving'},disposition:'consumed'},{objectId:'tea-material',expectedRevision:1,quantity:{amount:1,unit:'bag'},disposition:'consumed'}],outputs:[{id:'choice-tea',label:'這次真正泡好的茶',kind:'drink',consumable:true,quantity:{amount:1,unit:'serving'},state:[{key:'beverage',value:'tea',exposure:'public'}]}],reason:'飲水與茶葉是真正投入來源，準備茶不等於已飲用。'}],stages:[],check:null,completionMinutes:15});
  const w=await s.advance();assert.deepEqual(owner(w).intents.filter(node=>node.kind!=='direction').map(node=>node.content),intents.map(node=>node.content));assert.equal(owner(w).needs.values.thirst,choice==='water'?46.5:71.5);
  if(choice==='tea'){assert.equal(w.objects.find(o=>o.id==='choice-tea').lifecycle,'active');assert.equal(w.objects.find(o=>o.id==='water').lifecycle,'consumed');}if(choice==='continue'){assert.equal(owner(w).plan.startedAt,480);assert.equal(owner(w).plan.until,720);}if(choice==='social')assert.ok(w.events.some(event=>event.text.includes('我想先聊一會兒')));
 }finally{s.restore();}
 }
});

test('reconfirmation probes a legacy background tea method without committing its pending supplies or objects',async()=>{
 const s=await scenario(false,w=>{delete owner(w).needs;w.objects=[];delete w.supplies;w.routineRules=[{id:'old-background-tea',version:1,family:'cafe-service',origin:'cafe',knownTo:['owner'],operations:['tea'],templates:[{operation:'tea',verbs:['泡'],subjects:['茶'],purposes:['飲用'],result:{kind:'brew',contents:'tea',minutes:30}}]}];});try{
  s.transport.judge(()=>({status:'unsupported',effects:[],stages:[],check:null,routine:null,completionMinutes:null}));const proposal=fixture.choose('propose',{target:'cafe',content:'泡茶',purpose:'飲用',durationMinutes:30,reconfirmBodyConsequences:true});s.transport.choose(proposal);
  let w=await s.advance();assert.deepEqual(nonPhoneObjects(w),[]);assert.equal(w.supplies,undefined);assert.equal(s.transport.counts().adjudication,1);assert.equal(w.bodyReconfirmation.attempts.length,1);
  w=await s.advance();assert.deepEqual(nonPhoneObjects(w),[]);assert.equal(w.supplies,undefined);assert.equal(s.transport.counts().adjudication,1);
  s.transport.choose({...proposal,reconfirmBodyConsequences:false});w=await s.advance();assert.equal(nonPhoneObjects(w).length,1);assert.equal(nonPhoneObjects(w)[0].state.contents,'water');assert.ok(w.supplies.some(supply=>supply.pending));assert.equal(s.transport.counts().adjudication,1);
 }finally{s.restore();}
});
