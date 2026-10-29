/* eslint-disable @typescript-eslint/no-require-imports -- Public route, SQLite and external transport fixtures. */
const {fixturePursuitDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${n}.cjs`));
const {GET,POST}=load('route'),{seedWorld}=load('world'),store=load('store'),{env}=load('cloudflare-workers'),auth=load('auth'),fixture=require('./fixtures/flexible-life-loop.cjs');
const request=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',model:'gpt-6-luna',...body})});
const read=async()=>{const r=await GET();assert.equal(r.status,200);return(await r.json()).world;};
async function setup(initial=fixture.initialWorld(seedWorld)){
 store.install(initial);const transport=fixture.transport(),oldFetch=global.fetch,oldRandom=Math.random;global.fetch=async(_url,init)=>transport.respond(JSON.parse(init.body));Math.random=()=>0.8;
 const post=body=>POST(request({worldContext:initial.contextId,...body}));await post({operation:'set-model-key',key:'fixture-key'});await post({operation:'set-budget',limits:{calls:500,tokens:2000000}});
 return {transport,read,post,advance:async(minutes=15,extra={})=>{const r=await post({operation:'advance',minutes,...extra});const body=await r.json();assert.equal(r.status,200,body.error);return body.world;},intervene:async text=>{const r=await post({operation:'intervene',mode:'demo',target:'owner',text});assert.equal(r.status,200,await r.clone().text());},restore:()=>{global.fetch=oldFetch;Math.random=oldRandom;}};
}
async function withRecall(s,run){
 const previous=global.fetch,vectors=new Map(),embeddingInputs=[];let search=()=>[...vectors.values()];
 env.RECALL_ENABLED='true';env.RECALL_USAGE_DB=store.database();env.OWNER_EMBEDDING_KEY='owner-fixture-key';
 env.MEMORY_VECTOR_INDEX={upsert:async rows=>{for(const row of rows)vectors.set(row.id,row);return{mutationId:'fixture'};},deleteByIds:async ids=>{for(const id of ids)vectors.delete(id);return{mutationId:'deleted'};},getByIds:async ids=>ids.flatMap(id=>vectors.has(id)?[vectors.get(id)]:[]),queryById:async id=>({matches:vectors.has(id)?[vectors.get(id)]:[]}),query:async()=>({matches:search(vectors)})};
 global.fetch=async(url,init)=>{if(String(url).includes('embeddings')){const input=JSON.parse(init.body).input;embeddingInputs.push(input);return Response.json({usage:{total_tokens:7},data:input.map((_,index)=>({index,embedding:Array(1536).fill(.1)}))});}return previous(url,init);};
 try{return await run({vectors,embeddingInputs,search:fn=>{search=fn;}});}finally{global.fetch=previous;for(const key of ['RECALL_ENABLED','RECALL_USAGE_DB','OWNER_EMBEDDING_KEY','MEMORY_VECTOR_INDEX'])delete env[key];}
}
test('同一世界從自主安排到手機、真睡眠漏提醒、晚讀、延期、續做與放下，全部沿API與SQLite提交',async()=>{
 const s=await setup();try{const evidence=await fixture.run(s);assert.ok(evidence.sleepingRounds>3);assert.equal(evidence.counts.adjudication,1);assert.ok(evidence.counts.npc<15);const before=s.transport.counts(),w=await read();assert.equal(w.phones.devices[0].calendar[0].readers.length,1);const lastEvent=w.events.at(-1);assert.ok(lastEvent);assert.deepEqual(s.transport.counts(),before);}finally{s.restore();}
});
test('真API一次Vector Recall使初次省略的安排可見；合法forget後舊向量不能復活安排正文',async()=>{
 const initial=fixture.initialWorld(seedWorld),c=initial.characters[0];c.longTerm=Array.from({length:9},(_,i)=>({id:`prehistory-${i}`,characterId:c.id,version:1,time:100,text:'已保存的主觀背景。'.repeat(130),source:{kind:'experience'},origin:{id:`past-${i}`,version:1},reason:'此前已選留'}));
 const s=await setup(initial);try{
  s.transport.choose(input=>fixture.action('reflect',{arrangementUpdates:[{operation:'upsert',id:'recall-plan',version:0,text:'ONLY_RECALLABLE_ARRANGEMENT '+'想'.repeat(156),condition:{kind:'time',minute:10000},references:[{kind:'short',id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version}],reason:'我想保留未來打算'}]}));await s.advance();
  let anchor;s.transport.choose(input=>{anchor=input.self.shortTerm.find(m=>m.text.includes('我的柔性安排 recall-plan'));assert.ok(anchor);return fixture.action('reflect',{memorySelections:[{id:anchor.id,version:anchor.version,reason:'我想記住這個打算'}]});});await s.advance();
  for(let i=0;i<82;i++)await s.intervene(`後來的可知經歷 ${i}：`+'新'.repeat(460));
  const before=await read(),memory=fixture.actor(before).longTerm.find(m=>m.origin.id===anchor.id);assert.ok(memory);assert.equal(fixture.actor(before).shortTerm.some(m=>m.text.includes('ONLY_RECALLABLE_ARRANGEMENT')),false);
  await withRecall(s,async recall=>{
   let chat=0,forget=false;s.transport.choose(input=>{
    if(++chat%2===1){if(chat===1){assert.equal(input.self.longTerm.some(m=>m.id===memory.id),false);assert.equal(input.self.arrangements.items.length,0);}return{type:'recall',questions:['我之前想稍後做什麼？']};}
    assert.equal(input.self.arrangements.items[0].id,'recall-plan');assert.equal(input.self.arrangements.items[0].version,1);assert.ok(input.self.longTerm.some(m=>m.id===memory.id));assert.ok(Buffer.byteLength(JSON.stringify({input,recalledMemories:[{id:memory.id,version:1}]}))<=88*1024);
    return fixture.action('reflect',forget?{memoryOperations:[{type:'forget',targets:[{id:memory.id,version:1}],text:'',unresolved:[],reason:'我現在明示忘記這段內在記憶'}]}:{arrangementUpdates:[{operation:'keep',id:'recall-plan',version:1,text:input.self.arrangements.items[0].text,condition:{kind:'time',minute:10000},references:[{kind:'long',id:memory.id,version:1}],reason:'回想後仍保留這個期待'}]});
   });
   recall.search(vectors=>[...vectors.values()].filter(v=>v.metadata.memoryId===memory.id));await s.advance();assert.equal(chat,2);assert.equal(fixture.actor(await read()).arrangements.items[0].version,1);
   const stale=structuredClone([...recall.vectors.values()].find(v=>v.metadata.memoryId===memory.id));assert.ok(stale);forget=true;await s.advance();assert.equal(chat,4);assert.equal(fixture.actor(await read()).longTerm.some(m=>m.id===memory.id),false);
   recall.search(()=>[stale]);s.transport.choose(input=>{assert.equal(JSON.stringify(input).includes('ONLY_RECALLABLE_ARRANGEMENT'),false);return{type:'recall',questions:['還能想起那個安排嗎？']};});const count=s.transport.counts().npc;
   const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,502);assert.equal(s.transport.counts().npc,count+1);assert.equal(fixture.actor(await read()).arrangements.items[0].status,'active');
  });
 }finally{s.restore();}
});
test('真實備忘錄原文在合法forget與API短期FIFO後保持精確，空回想不補文，真正重讀才取得新經歷',async()=>{
 const s=await setup(),raw='MEMO_EXACT_AFTER_LEGAL_FORGET 我當時只是猜測，不是客觀事實。';try{
  s.transport.choose(input=>fixture.action('phone',{target:input.phones[0].objectId,content:JSON.stringify(fixturePursuitDecision(input,{collection:'memos',operation:'create',id:'external-memo',version:0,text:raw}))}));await s.advance();
  s.transport.choose(input=>fixture.action('reflect',{memorySelections:input.self.shortTerm.filter(m=>m.text.includes(raw)).map(m=>({id:m.id,version:m.version,reason:'這是當時在意的想法'}))}));await s.advance();
  s.transport.choose(input=>fixture.action('reflect',{memoryOperations:input.self.longTerm.filter(m=>m.text.includes(raw)).map(m=>({type:'forget',targets:[{id:m.id,version:m.version}],text:'',unresolved:[],reason:'我明示忘記這段內在文字'}))}));await s.advance();
  for(let i=0;i<82;i++)await s.intervene(`與原文無關的新經歷 ${i}`);
  s.transport.choose(input=>{assert.equal(JSON.stringify(input).includes(raw),false);return fixture.action('reflect');});await s.advance();
  await withRecall(s,async recall=>{let chats=0;s.transport.choose(input=>{assert.equal(JSON.stringify(input).includes(raw),false);return++chats===1?{type:'recall',questions:['之前的備忘內容是什麼？']}:fixture.action('reflect');});recall.search(()=>[]);await s.advance();assert.equal(chats,2);assert.equal(JSON.stringify(recall.embeddingInputs).includes(raw),false);});
  s.transport.choose(input=>fixture.action('phone',{target:input.phones[0].objectId,content:JSON.stringify(fixturePursuitDecision(input,{collection:'memos',operation:'list'}))}));await s.advance();
  s.transport.choose(input=>{assert.equal(JSON.stringify(input).includes(raw),false);return fixture.action('phone',{target:input.phones[0].objectId,content:JSON.stringify(fixturePursuitDecision(input,{collection:'memos',operation:'read',id:'external-memo',version:1}))});});await s.advance();
  const saved=await read();assert.equal(fixture.device(saved).memos[0].text,raw);assert.ok(fixture.actor(saved).shortTerm.some(m=>m.text.includes(raw)));assert.equal(fixture.device(saved).memos[0].readers.length,1);assert.deepEqual(fixture.actor(saved).intents.filter(node=>node.kind!=='direction'),[]);
 }finally{s.restore();}
});
test('舊手機目前物主與原收訊人不同時，真正物主閱讀不把原收訊人顯示為已讀',async()=>{
 const initial=fixture.initialWorld(seedWorld,['owner','cass','vera']);initial.objects=[{id:'transferred-historical-phone',source:'legacy-device',label:'已有的手機',kind:'phone',region:'cafe-front',holder:'cass',owner:'cass',revision:3,state:{condition:'sound'},lifecycle:'active',knownTo:['owner','cass','vera'],allowedTo:['cass']}];
 initial.phones={schemaVersion:1,activatedAt:400,devices:[{objectId:'transferred-historical-phone',memos:[],inboxActivatedAt:400,inbox:[{id:'legacy-inbox',version:1,text:'只屬於過去收件資料的原文',from:'owner',to:'vera',deliveredAt:420,createdAt:420,updatedAt:420,sharedWith:[],readers:[]}],screen:[]}]};
 const s=await setup(initial);try{let stage=0;s.transport.choose(input=>input.self.id==='cass'?fixture.action('phone',{target:'transferred-historical-phone',content:JSON.stringify(fixturePursuitDecision(input,{collection:'inbox',operation:stage===1?'read':'list',...(stage===1?{id:'legacy-inbox',version:1}:{})}))}):fixture.action('reflect'));
  for(stage=0;stage<3;stage++)await s.advance();const saved=await read(),message=saved.phones.devices[0].inbox[0],cass=saved.characters.find(c=>c.id==='cass');assert.equal(message.to,'vera');assert.deepEqual(message.readers.map(r=>r.actorId),['cass']);assert.ok(cass.shortTerm.findLast(m=>m.text.includes('我查看手機收件匣列表')).text.includes('收訊人未讀'));assert.equal(saved.characters.find(c=>c.id==='vera').shortTerm.some(m=>m.text.includes(message.text)),false);
 }finally{s.restore();}
});
test('安排、手機、通知、閱讀與意圖在較後invalid／逾時、保存及租約故障同輪回復；提交不明只查原journal',async()=>{
 const story=w=>({...w,aiUsage:undefined});
 for(const operation of ['read','send'])for(const fault of ['later-invalid','later-timeout','save-before','save-after','cas','lease','save-unknown']){
  const initial=fixture.initialWorld(seedWorld,['owner','cass']);initial.characters.sort((a,b)=>['cass','owner'].indexOf(a.id)-['cass','owner'].indexOf(b.id));const s=await setup(initial),clock=Date.now;let instant=clock(),stage=0;
  try{
   s.transport.choose(input=>{
    if(input.self.id!=='owner'){
     if(stage===3&&fault==='later-invalid')return{type:'not-a-valid-action'};
     if(stage===3&&fault==='later-timeout')instant+=401000;
     return fixture.action('reflect');
    }
    if(stage===0)return fixture.action('reflect',{arrangementUpdates:[{operation:'upsert',id:'atomic-plan',version:0,text:'稍後再看手機安排',condition:{kind:'time',minute:540},references:[{kind:'short',id:input.self.shortTerm[0].id,version:1}],reason:'自己的未來期待'}]});
    if(stage===1)return fixture.phoneAction(input,{operation:'create',id:'atomic-record',version:0,text:'ATOMIC_EXTERNAL_READING',condition:{kind:'time',minute:540},reminder:true});
    if(stage===2)return fixture.phoneAction(input,{operation:'list'});
    const chosen=operation==='read'?fixture.phoneAction(input,{operation:'read',id:'atomic-record',version:1}):fixture.action('message',{target:'cass',content:'ATOMIC_NEW_UNREAD_MESSAGE'});
    return {...chosen,arrangementUpdates:[{operation:'upsert',id:'atomic-plan',version:1,text:'收到新線索後稍後再考慮',condition:{kind:'time',minute:600},references:[{kind:'short',id:input.self.shortTerm.at(-1).id,version:input.self.shortTerm.at(-1).version}],reason:'我自主修改安排'}],intents:[fixture.intent('after-new-info','稍後重新考慮') ]};
   });
   for(stage=0;stage<3;stage++)await s.advance();const before=await read();Date.now=()=>instant;
   if(fault==='save-before')store.throwBeforeNextSave();if(fault==='save-after')store.throwAfterNextSave();if(fault==='cas')store.conflictOnNextSave();if(fault==='lease')store.conflictOnNextSave(before,{lockedUntil:instant+60000});
   if(fault==='save-unknown')store.onStorage(async sql=>{if(sql.startsWith('UPDATE worlds SET state = ?')){store.onStorage(undefined);store.throwAfterNextSave();store.failNextOperationRead();}});
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await s.post({operation:'advance',minutes:15,operationId}),body=await response.json(),after=await read(),calls=s.transport.counts();
   const committed=['save-after','save-unknown'].includes(fault);
   if(committed){assert.equal(fixture.actor(after).arrangements.items[0].version,2);assert.equal(fixture.actor(after).intents[0].id,'after-new-info');assert.ok(fixture.device(after).notifications.length);if(operation==='read')assert.equal(fixture.device(after).calendar[0].readers[0].actorId,'owner');else assert.equal(after.phones.devices.find(d=>after.objects.find(o=>o.id===d.objectId).owner==='cass').inbox.length,1);}
   else assert.deepEqual(story(after),story(before),`${operation}/${fault} story must roll back together`);
   assert.ok(after.aiUsage.totalCalls>=before.aiUsage.totalCalls+1,`${fault} retains known dispatch usage`);
   if(fault==='save-unknown'){assert.equal(response.status,502);assert.equal(body.operationUncertain,true);const queried=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(operationId)))).json();assert.equal(queried.operation.state,'settled');}
   else assert.equal(response.status,committed?200:502,`${operation}/${fault}`);
   const replay=await s.post({operation:'advance',minutes:15,operationId});assert.deepEqual(s.transport.counts(),calls);assert.deepEqual(story(await read()),story(after));if(body.operationSettled)assert.deepEqual(await replay.json(),body);
  }finally{store.onStorage(undefined);Date.now=clock;s.restore();}
 }
});
test('真API跨帳號、跨世界與場景舊引用被拒絕，另一世界與角色輸入不取得私人原文',async()=>{
 const s=await setup();try{
  s.transport.choose(input=>fixture.action('phone',{target:input.phones[0].objectId,content:JSON.stringify(fixturePursuitDecision(input,{collection:'memos',operation:'create',id:'private-a',version:0,text:'ACCOUNT_A_ONLY_PRIVATE_ORIGINAL'}))}));await s.advance();const first=await read(),foreignPhone=fixture.device(first).objectId,firstScope=(await(await GET()).json()).operationScope;
  const other=fixture.initialWorld(seedWorld);other.contextId='other-world-193';store.installForOwner('other-owner',other);auth.setUserId('other-owner');await s.post({operation:'set-model-key',key:'other-fixture-key',worldContext:other.contextId});
  const starts=s.transport.inputs.length;s.transport.choose(()=>fixture.action('phone',{target:foreignPhone,content:JSON.stringify({collection:'memos',operation:'read',id:'private-a',version:1})}));
  assert.equal((await s.post({operation:'advance',minutes:15,worldContext:other.contextId})).status,502);assert.equal(JSON.stringify(s.transport.inputs.slice(starts)).includes('ACCOUNT_A_ONLY_PRIVATE_ORIGINAL'),false);assert.equal((await read()).phones,undefined);
  const calls=s.transport.counts();assert.equal((await s.post({operation:'advance',minutes:15,worldContext:'flexible-life-193'})).status,409);assert.equal((await s.post({operation:'advance',minutes:15,worldContext:other.contextId,operationScope:firstScope})).status,409);assert.deepEqual(s.transport.counts(),calls);
  auth.setUserId('test-owner');assert.deepEqual(await read(),first);
 }finally{auth.setUserId('test-owner');s.restore();}
});
test('缺欄位與既有／損毀手機舊世界保留已知、睡眠活動與歷史，audience或已忘原文不回填新收件匣',async()=>{
 for(const lifecycle of ['active','destroyed']){
  const initial=fixture.initialWorld(seedWorld,['owner','cass']),owner=initial.characters.find(c=>c.id==='owner');owner.memories=[{time:400,text:'LEGACY_ALREADY_KNOWN 我當時已知道的訊息'}];owner.longTerm=[{id:'legacy-forgotten',version:1,characterId:'owner',time:300,text:'LEGACY_FORGOTTEN_BODY',state:'forgotten',source:{kind:'experience'},origin:{id:'old-forgotten',version:1},reason:'既有遺忘狀態'}];owner.plan={action:{type:'rest'},startedAt:480,until:960,attention:'',modelKey:'openai:gpt-6-luna',bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14},sleep:{elapsedMinutes:0}};
  initial.events=[{id:'historical-message',time:390,actor:'cass',kind:'message',audience:['cass','owner'],text:'LEGACY_AUDIENCE_ONLY_UNKNOWN'},{id:'forgotten-event',time:300,actor:'cass',kind:'message',audience:['owner'],text:'LEGACY_FORGOTTEN_BODY'}];initial.objects=[{id:'existing-old-phone',source:'legacy-existing',label:'原有手機',kind:'phone',region:'cafe-front',holder:'owner',owner:'owner',revision:7,state:{condition:lifecycle==='active'?'sound':'broken'},lifecycle,knownTo:['owner'],allowedTo:['owner']}];
  const s=await setup(initial);try{const before=await read();assert.equal(before.phones,undefined);s.transport.choose(()=>fixture.action('reflect'));const w=await s.advance(),o=fixture.actor(w),d=fixture.device(w);assert.equal(d.objectId,'existing-old-phone');assert.equal(w.objects.filter(p=>p.owner==='owner'&&p.kind==='phone').length,1);assert.deepEqual(d.inbox,[]);assert.equal(d.inboxActivatedAt,480);assert.equal(d.notifications,undefined);assert.deepEqual(w.events.slice(0,2),initial.events);assert.equal(o.plan.startedAt,480);assert.equal(o.plan.bodyActivity.kind,'sleep');assert.ok(o.shortTerm.some(m=>m.text.includes('LEGACY_ALREADY_KNOWN')));assert.equal(o.shortTerm.some(m=>/LEGACY_AUDIENCE_ONLY_UNKNOWN|LEGACY_FORGOTTEN_BODY/.test(m.text)),false);assert.equal(s.transport.inputs.some(input=>JSON.stringify(input).includes('LEGACY_AUDIENCE_ONLY_UNKNOWN')),false);assert.deepEqual((await read()).phones,w.phones);}
  finally{s.restore();}
 }
});
test('相同真送達與閱讀正文可由正常決策相信、存疑、拒絕或延後；閱讀本身不答覆或接受安排',async()=>{
 for(const variant of ['believe','doubt','refuse','defer']){
  const s=await setup(fixture.initialWorld(seedWorld,['owner','cass'])),raw='INVITATION_SHARED_BODY 你願意之後聊聊嗎？';let stage=0,messageId;
  try{s.transport.choose(input=>{
   if(input.self.id==='cass')return stage===0?fixture.action('message',{target:'owner',content:raw}):fixture.action('reflect');
   if(stage===0)return fixture.action('reflect');
   if(stage===1)return fixture.action('phone',{target:input.phones.find(p=>p.owner==='owner').objectId,content:JSON.stringify(fixturePursuitDecision(input,{collection:'inbox',operation:'list'}))});
   if(stage===2)return fixture.action('phone',{target:input.phones.find(p=>p.owner==='owner').objectId,content:JSON.stringify(fixturePursuitDecision(input,{collection:'inbox',operation:'read',id:messageId,version:1}))});
   const experience=input.self.shortTerm.find(m=>m.text.includes(raw));assert.ok(experience);const cognitiveUpdates=['believe','doubt'].includes(variant)?[{kind:'belief',operation:'upsert',id:'invitation-interpretation',version:0,topic:'這則邀請',text:variant==='believe'?'我傾向相信這是關心的邀請。':'我對這則邀請仍有疑問。',conviction:variant==='believe'?'leaning':'doubtful',references:[{kind:'short',id:experience.id,version:experience.version}],contradictions:[],reason:'這是實際閱讀後我自己的解讀'}]:[];
   return fixture.action(variant==='believe'?'message':'reflect',{...(variant==='believe'?{target:'cass',content:'明示自主回覆：之後可以再聊。'}:{content:variant==='refuse'?'我暫時不接受這個邀請。':'我還想再考慮。'}),cognitiveUpdates,intents:variant==='defer'?[fixture.intent('evaluate-later','稍後再考慮這則邀請')]:[]});
  });
   for(stage=0;stage<3;stage++){const w=await s.advance();messageId=fixture.device(w).inbox[0].id;assert.equal(JSON.stringify(s.transport.inputs.findLast(i=>i.self?.id==='owner')).includes(raw),false);}
   let w=await read();assert.equal(w.events.filter(e=>e.kind==='message').length,1);assert.deepEqual(fixture.actor(w).intents.filter(node=>node.kind!=='direction'),[]);assert.equal(fixture.actor(w).cognition?.beliefs.length||0,0);assert.equal(fixture.actor(w).arrangements,undefined);
   w=await s.advance();assert.equal(fixture.device(w).inbox[0].readers[0].actorId,'owner');assert.equal(w.events.filter(e=>e.kind==='message').length,variant==='believe'?2:1);assert.equal(fixture.actor(w).arrangements,undefined);if(variant==='defer')assert.equal(fixture.actor(w).intents[0].id,'evaluate-later');if(variant==='doubt')assert.equal(fixture.actor(w).cognition.beliefs[0].conviction,'doubtful');assert.equal(s.transport.inputs.filter(i=>i.self?.id==='cass').some(i=>JSON.stringify(i).includes('readers')),false);
  }finally{s.restore();}
 }
});
test('共同輸入壓力省略手機handle時不可修改；明示整理本人可見記憶後才可合法修改，原文不靜默淘汰',async()=>{
 const initial=fixture.initialWorld(seedWorld),c=initial.characters[0],records=Array.from({length:32},(_,i)=>({id:`bounded-${i}`,version:1,text:`CAPACITY_PRIVATE_ORIGINAL_${i}`,createdAt:400,updatedAt:400,sharedWith:[],readers:[]}));
 c.longTerm=[{id:'known-list',characterId:'owner',version:1,time:400,text:records.map(r=>`${r.id} v1`).join('、'),source:{kind:'experience'},origin:{id:'known-list-experience',version:1},reason:'過去實際查看的有限列表'},...Array.from({length:9},(_,i)=>({id:`pressure-${i}`,characterId:'owner',version:1,time:100,text:'既有可整理的本人片段。'.repeat(115),source:{kind:'experience'},origin:{id:`old-pressure-${i}`,version:1},reason:'此前已保存'}))];
 initial.objects=[{id:'pressure-phone',source:'existing-device',label:'本人已有手機',kind:'phone',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{condition:'sound'},lifecycle:'active',knownTo:['owner'],allowedTo:['owner']}];initial.phones={schemaVersion:1,activatedAt:400,devices:[{objectId:'pressure-phone',memos:records,inbox:[],inboxActivatedAt:400,screen:[],presentations:records.map(r=>({actorId:'owner',memoryId:'known-list-experience',collection:'memos',id:r.id,version:1}))}]};
 const s=await setup(initial);try{
  for(let i=0;i<82;i++)await s.intervene(`新經歷 ${i}：`+'新'.repeat(460));const before=await read();
  s.transport.choose(input=>{assert.ok(input.phoneReferenceGap>0);assert.equal(input.phones[0].records.some(r=>r.id==='bounded-31'),false);assert.equal(JSON.stringify(input).includes('CAPACITY_PRIVATE_ORIGINAL_31'),false);return fixture.action('phone',{target:'pressure-phone',content:JSON.stringify(fixturePursuitDecision(input,{collection:'memos',operation:'update',id:'bounded-31',version:1,text:'尚未合法展示不得寫入'}))});});
  assert.equal((await s.post({operation:'advance',minutes:15})).status,502);assert.deepEqual((await read()).phones,before.phones);assert.deepEqual((await read()).characters,before.characters);
  s.transport.choose(input=>fixture.action('reflect',{memoryOperations:input.self.longTerm.filter(m=>m.id.startsWith('pressure-')).slice(0,3).map(m=>({type:'forget',targets:[{id:m.id,version:m.version}],text:'',unresolved:[],reason:'我明示整理已展示的舊片段'}))}));for(let i=0;i<4;i++)await s.advance();
  s.transport.choose(input=>{assert.ok(input.phones[0].records.some(r=>r.id==='bounded-31'));return fixture.action('phone',{target:'pressure-phone',content:JSON.stringify(fixturePursuitDecision(input,{collection:'memos',operation:'update',id:'bounded-31',version:1,text:'明示改寫本人紀錄'}))});});const saved=await s.advance();assert.equal(fixture.device(saved).memos.length,32);assert.equal(fixture.device(saved).memos[31].version,2);assert.equal(fixture.device(saved).memos[0].text,'CAPACITY_PRIVATE_ORIGINAL_0');
 }finally{s.restore();}
});
