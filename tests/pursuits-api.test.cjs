/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const build=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=build('world');
const {GET,POST}=build('route');
const store=build('store');
const request=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',...body})});
const read=async()=> (await (await GET()).json()).world;
const decision=data=>({contractVersion:'npc-decision.v3',pursuitContext:data.pursuitContext,focusIntentId:null,pursuitUpdates:[],action:{type:'rest',target:'',content:'休息一會兒',purpose:''},mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},methodAssessment:{purpose:'',knownResults:[],choice:'new',method:'',change:{kind:'not-applicable',detail:''},reason:'',selectedAction:{type:'rest',target:''},intentIds:[]},reconfirmBodyConsequences:false,attentionConditions:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],interpretation:'',preferenceUpdates:[],habitCandidates:[],arrangementUpdates:[]});
const node=(id,parents=[])=>({id,content:'先確認自己想做什麼',intensity:'medium',importance:'medium',urgency:'low',context:'',kind:'intent',scope:'只先安靜想一會兒',satisfaction:null,parents});
const update=(id,version=0,parents=[])=>({operation:'upsert',id,version,node:node(id,parents),references:[],reason:'我想先照顧自己'});
async function setup(){const w=seedWorld();w.adjudication={provider:'openai',model:'gpt-6-luna'};store.install(w);await POST(request({operation:'set-model-key',key:'fixture-key'}));return w;}
const advance=(extra={})=>POST(request({operation:'advance',minutes:15,model:'gpt-6-luna',...extra}));
async function transport(respond,run){const original=global.fetch;global.fetch=async(url,init)=>{assert.match(String(url),/api\.openai\.com/);const payload=JSON.parse(init.body),data=JSON.parse(payload.messages[1].content);return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify(respond(data,payload))}}]});};try{return await run();}finally{global.fetch=original;}}

test('new world admits explicit child pursuit, preserves omission through SQLite and next actual request',async()=>{
 const initial=await setup();let round=0,calls=0;
 await transport((data,payload)=>{calls++;assert.match(payload.messages[0].content,/contractVersion回傳npc-decision.v3/);assert.doesNotMatch(payload.messages[0].content,/省略表示放下|回傳npc-decision.v2/);const value=decision(data);assert.equal(data.contractVersion,'npc-decision.v3');assert.equal(data.pursuitContext,initial.pursuitContext);
  if(data.self.id==='cass'){
   assert.equal(data.self.intents[0].kind,'direction');
   if(round===0){value.pursuitUpdates=[update('cass:thinking',0,[{id:'cass:direction',version:1}])];value.focusIntentId='cass:thinking';value.methodAssessment.intentIds=['cass:thinking'];}
   else {assert.equal(data.self.intents.find(i=>i.id==='cass:thinking').scope,'只先安靜想一會兒');value.focusIntentId='cass:thinking';value.methodAssessment.intentIds=['cass:thinking'];}
  }return value;},async()=>{
  assert.equal((await advance()).status,200);const saved=await read();assert.equal(saved.characters[0].intents.length,2);assert.equal(saved.characters[0].intents[1].version,1);
  round++;assert.equal((await advance()).status,200);assert.deepEqual((await read()).characters[0].intents,saved.characters[0].intents);assert.equal(calls,8);
 });
});

test('current direction evolves explicitly and omitted directions survive without seed reinjection',async()=>{
 const initial=await setup();let round=0;
 await transport(data=>{const value=decision(data);if(data.self.id==='cass'){
  if(round===0){const u=update('cass:direction',1);u.node={...node('cass:direction'),kind:'direction',content:'我想先獨處學習',scope:'保留自己的生活空間'};value.pursuitUpdates=[u];}
  else if(round===1){assert.equal(data.self.goal,'我想先獨處學習');assert.equal(data.self.intents[0].version,2);value.pursuitUpdates=[{operation:'drop',id:'cass:direction',version:2,node:null,references:[],reason:'我現在想放下這個方向'}];}
  else {assert.equal(data.self.goal,'');assert.equal(data.self.intents[0].status,'dropped');}
 }return value;},async()=>{for(round=0;round<3;round++)assert.equal((await advance()).status,200);const saved=await read();assert.equal(saved.characters[0].personality,initial.characters[0].personality);assert.equal(saved.characters[0].intents[0].version,3);assert.equal(saved.characters[0].goal,initial.characters[0].goal);});
});

test('old world remains readable and advance stops before dispatch until explicit reset, preserving usage',async()=>{
 const old=await setup();delete old.pursuitVersion;delete old.pursuitContext;old.characters[0].intents=[];old.aiUsage={windowStartedAt:Date.now(),calls:7,inputTokens:70,outputTokens:30,unknownCalls:0,totalCalls:9,totalInputTokens:90,totalOutputTokens:50,totalUnknownCalls:0,savedDecisions:4};store.install(old);
 let calls=0;await transport(data=>{calls++;return decision(data);},async()=>{
  const loaded=await read();assert.deepEqual(loaded.characters[0].intents,[]);assert.equal(loaded.pursuitVersion,undefined);
  const blocked=await advance();assert.equal(blocked.status,409);assert.equal((await blocked.json()).worldResetRequired,true);assert.equal(calls,0);
  assert.deepEqual((await read()).aiUsage,old.aiUsage);assert.equal((await read()).turn,0);
  assert.equal((await POST(request({operation:'reset'}))).status,200);const fresh=await read();assert.equal(fresh.pursuitVersion,1);assert.ok(fresh.pursuitContext);assert.equal(fresh.characters[0].intents[0].kind,'direction');assert.equal(fresh.aiUsage.totalCalls,9);assert.equal(fresh.aiUsage.savedDecisions,0);assert.equal(calls,0);
 });
});

for(const [name,mutate] of [
 ['old full-array response',(_d,v)=>{delete v.pursuitUpdates;v.intents=[];v.contractVersion='npc-decision.v2';}],
 ['foreign context',(_d,v)=>{v.pursuitContext='another-world';}],
 ['foreign actor id',(_d,v)=>{v.pursuitUpdates=[update('vera:foreign')];}],
 ['stale version',(_d,v)=>{v.pursuitUpdates=[update('cass:direction',0)];}],
 ['unknown endpoint',(_d,v)=>{v.pursuitUpdates=[update('cass:child',0,[{id:'cass:missing',version:1}])];}],
 ['self edge',(_d,v)=>{v.pursuitUpdates=[update('cass:child',0,[{id:'cass:child',version:0}])];}],
 ['cyclic endpoints',(_d,v)=>{v.pursuitUpdates=[update('cass:first',0,[{id:'cass:second',version:0}]),update('cass:second',0,[{id:'cass:first',version:0}])];}],
 ['duplicate identity',(_d,v)=>{v.pursuitUpdates=[update('cass:child'),update('cass:child')];}],
 ['unknown source',(_d,v)=>{const u=update('cass:child');u.references=[{kind:'short',id:'hidden',version:1}];v.pursuitUpdates=[u];}],
 ['missing action focus',(_d,v)=>{v.focusIntentId='cass:missing';}],
 ['method-focus contradiction',(_d,v)=>{v.focusIntentId='cass:direction';}],
 ['UTF-8 update overflow',(_d,v)=>{v.pursuitUpdates=Array.from({length:4},(_,i)=>{const u=update(`cass:item${i}`);u.node.content='你'.repeat(200);u.node.scope='我'.repeat(200);return u;});}],
 ['unsupported multi-parent',(_d,v)=>{v.pursuitUpdates=[update('cass:child',0,[{id:'cass:direction',version:1},{id:'cass:direction',version:1}])];}],
])test(`v3 rejects ${name} with original world and known usage preserved`,async()=>{
 const initial=await setup();let calls=0;await transport(data=>{calls++;const v=decision(data);if(data.self.id==='cass')mutate(data,v);return v;},async()=>{assert.equal((await advance()).status,502);const saved=await read();assert.equal(saved.turn,0);assert.deepEqual(saved.characters,initial.characters);assert.equal(calls,1);assert.equal(saved.aiUsage.totalCalls,1);assert.equal(saved.aiUsage.totalInputTokens,30);});
});

test('later actor failure rolls back earlier pursuit and world changes, and exact operation replay dispatches nothing',async()=>{
 const initial=await setup();let calls=0;const operationId=`${Date.now()}:${crypto.randomUUID()}`;
 await transport(data=>{calls++;const value=decision(data);if(data.self.id==='cass'){value.pursuitUpdates=[update('cass:uncommitted')];value.focusIntentId='cass:uncommitted';value.methodAssessment.intentIds=['cass:uncommitted'];}else {value.focusIntentId='missing';}return value;},async()=>{
  assert.equal((await advance({operationId})).status,502);const saved=await read();assert.deepEqual(saved.characters,initial.characters);assert.deepEqual(saved.events,initial.events);assert.equal(saved.aiUsage.totalCalls,2);
  assert.equal((await advance({operationId})).status,502);assert.equal(calls,2);assert.deepEqual((await read()).characters,initial.characters);
 });
});

test('storage conflict does not commit a pursuit or activity and retains four paid usage receipts',async()=>{
 const initial=await setup();store.conflictOnNextSave();let calls=0;
 await transport(data=>{calls++;const value=decision(data);value.pursuitUpdates=[update(`${data.self.id}:uncommitted`)];value.focusIntentId=`${data.self.id}:uncommitted`;value.methodAssessment.intentIds=[value.focusIntentId];return value;},async()=>{assert.equal((await advance()).status,502);const saved=await read();assert.equal(calls,4);assert.equal(saved.turn,0);assert.deepEqual(saved.characters,initial.characters);assert.equal(saved.aiUsage.totalCalls,4);});
});

test('successful original operation replay and GET retain exact pursuit versions with no new dispatch',async()=>{
 await setup();let calls=0;const operationId=`${Date.now()}:${crypto.randomUUID()}`;
 await transport(data=>{calls++;const v=decision(data);v.pursuitUpdates=[update(`${data.self.id}:step`)];return v;},async()=>{const first=await advance({operationId});assert.equal(first.status,200);const body=await first.json();const replay=await advance({operationId});assert.equal(replay.status,200);assert.deepEqual(await replay.json(),body);const saved=await read();assert.equal(saved.characters[0].intents[1].version,1);assert.equal(calls,4);await read();assert.equal(calls,4);});
});

test('same-batch parent creation is independent of update ordering and omitted increment is retention',async()=>{
 await setup();let round=0;
 await transport(data=>{const v=decision(data);if(data.self.id==='cass'&&round===0){v.pursuitUpdates=[update('cass:child',0,[{id:'cass:parent',version:0}]),update('cass:parent')];}else delete v.pursuitUpdates;return v;},async()=>{assert.equal((await advance()).status,200);const before=(await read()).characters[0].intents;assert.equal(before.find(i=>i.id==='cass:child').parents[0].version,1);round++;assert.equal((await advance()).status,200);assert.deepEqual((await read()).characters[0].intents,before);});
});

test('takeover, single direct action and return preserve autonomous pursuits and private actor input',async()=>{
 const initial=await setup();let ids=[];const owner=initial.characters.find(c=>c.id==='owner');
 await transport(data=>{ids.push(data.self.id);for(const other of initial.characters.filter(c=>c.id!==data.self.id))assert.equal(JSON.stringify(data).includes(other.intents[0].scope),false);return decision(data);},async()=>{
  assert.equal((await POST(request({operation:'takeover'}))).status,200);assert.equal((await advance()).status,200);assert.deepEqual(ids,['cass','vera','kris']);assert.deepEqual((await read()).characters.find(c=>c.id==='owner').intents,owner.intents);
  assert.equal((await POST(request({operation:'direct',action:{type:'reflect',content:'我自己想一會兒'}}))).status,200);ids=[];assert.equal((await advance()).status,200);assert.deepEqual((await read()).characters.find(c=>c.id==='owner').intents,owner.intents);assert.equal(ids.includes('owner'),false);
  assert.equal((await POST(request({operation:'return-control'}))).status,200);ids=[];assert.equal((await advance()).status,200);assert.equal(ids.includes('owner'),true);assert.deepEqual((await read()).characters.find(c=>c.id==='owner').intents,owner.intents);
 });
});

test('save failure retains original pursuit graph and known dispatch accounting',async()=>{
 const initial=await setup();store.throwBeforeNextSave();let calls=0;
 await transport(data=>{calls++;const v=decision(data);v.pursuitUpdates=[update(`${data.self.id}:unsaved`)];return v;},async()=>{const response=await advance();assert.equal(response.status,502);const saved=await read();assert.equal(saved.turn,0);assert.deepEqual(saved.characters,initial.characters);assert.equal(calls,4);assert.equal(saved.aiUsage.totalCalls,4);assert.equal(saved.aiUsage.totalInputTokens,120);});
});

for(const legacy of [false,true])test(`existing acceptance scene admits native v3 and restores ${legacy?'legacy':'v3'} original story`,async()=>{
 const initial=await setup();if(legacy){delete initial.pursuitVersion;delete initial.pursuitContext;initial.characters[0].intents=[];store.install(initial);await POST(request({operation:'set-model-key',key:'fixture-key'}));}
 let calls=0;
 assert.equal((await POST(request({operation:'enter-acceptance'}))).status,200);const scene=await read();assert.equal(scene.pursuitVersion,1);assert.notEqual(scene.pursuitContext,initial.pursuitContext);
 await transport(data=>{calls++;const v=decision(data);assert.ok(data.self.intents.some(i=>i.kind==='direction'));if(data.self.id==='cass'){const node=data.self.intents.find(i=>i.id==='cass:acceptance-food');assert.equal(node.version,1);assert.equal(node.status,'active');v.focusIntentId=node.id;v.methodAssessment.intentIds=[node.id];}return v;},async()=>{
  assert.equal((await advance({worldContext:scene.contextId})).status,200);assert.equal(calls,4);
  assert.equal((await POST(request({operation:'exit-acceptance',worldContext:scene.contextId}))).status,200);const restored=await read();assert.deepEqual(restored.characters,initial.characters);assert.equal(restored.pursuitVersion,initial.pursuitVersion);assert.equal(restored.pursuitContext,initial.pursuitContext);assert.equal(restored.aiUsage.totalCalls,4);
  if(legacy){assert.equal((await advance({worldContext:restored.contextId})).status,409);assert.equal(calls,4);}
 });
});

module.exports={request,read,decision,node,update,setup,advance,transport};
