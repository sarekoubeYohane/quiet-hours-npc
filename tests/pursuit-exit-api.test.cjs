/* eslint-disable @typescript-eslint/no-require-imports -- World API, SQLite, real activity and actual next provider messages. */
const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./pursuit-graph-fixture.cjs');
const {decision,upsert,scenario,edit,drop,assess,ownerOnly,workWorld,judgment,startWork}=require('./pursuit-exit-fixture.cjs');
const owner=world=>world.characters.find(c=>c.id==='owner');
for(const reverse of [false,true])test(`scope can narrow before subjective satisfaction in one decision, independent of update ordering (${reverse})`,async()=>{
 let round=0;const s=await scenario(input=>{
  if(round===0)return decision(input,{updates:[upsert('owner:meal',[{id:'owner:direction',version:1}],{content:'照顧這次餐點需求',scope:'準備一份讓對方可取用的餐點',satisfaction:'實際有一份可取用的餐點'})],focus:'owner:meal',type:'say',target:'observer',content:'我現在先只能告訴你這裡有什麼可能的選擇。'});
  if(round===1){const updates=[edit(input,'owner:meal',{scope:'只回答目前可提供的資訊',satisfaction:'已說明自己現在知道的選擇'}),assess(input,'owner:meal','satisfied','ready')];updates[0].reason='我現在只願意提供資訊，不繼續準備';return decision(input,{updates:reverse?updates.reverse():updates});}
  const task=input.self.intents.find(node=>node.id==='owner:meal');assert.equal(task.scope,'只回答目前可提供的資訊');assert.equal(task.status,'satisfied');return decision(input);
 },ownerOnly);try{
  assert.equal((await s.advance()).status,200);round++;const response=await s.advance();assert.equal(response.status,200,await response.clone().text());const receipt=await response.json(),trace=(await(await load('route').GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(receipt.operationEvidence.operationId)))).json()).decisionTrace;const links=trace.steps.find(step=>step.kind==='pursuit-exit-links');assert.equal(links.source,'program');assert.deepEqual(links.data.currentIntentIds,[]);assert.deepEqual(links.data.exits,[{id:'owner:meal',version:1,endedVersion:3,status:'satisfied'}]);const saved=await s.read(),actor=owner(saved),task=actor.intents.find(node=>node.id==='owner:meal');assert.equal(task.version,3);assert.equal(task.status,'satisfied');assert.equal(saved.objects.some(object=>object.kind==='meal'),false);const changes=actor.pursuitTrace.filter(trace=>trace.id===task.id).slice(-2);assert.equal(changes[0].before.scope,'準備一份讓對方可取用的餐點');assert.equal(changes[0].after.scope,'只回答目前可提供的資訊');assert.equal(changes[1].before.scope,'只回答目前可提供的資訊');assert.equal(changes[1].after.status,'satisfied');round++;assert.equal((await s.advance()).status,200);
 }finally{s.restore();}
});

for(const invalid of ['double-assess','double-upsert','stale-paired-version','ended-focus','ended-method'])test(`the same-decision extension rejects ${invalid} without partial updates`,async()=>{
 let round=0;const s=await scenario(input=>{
  if(!round)return decision(input,{updates:[upsert('owner:work')]});
  let updates=[edit(input,'owner:work',{scope:'這次想縮小的範圍'}),assess(input,'owner:work','active','deferred')];
  if(invalid==='double-assess')updates=[assess(input,'owner:work'),assess(input,'owner:work')];
  if(invalid==='double-upsert')updates=[edit(input,'owner:work'),edit(input,'owner:work')];
  if(invalid==='stale-paired-version')updates[1].version++;
  if(invalid==='ended-focus'||invalid==='ended-method')updates=[drop(input,'owner:work')];
  const value=decision(input,{updates,focus:invalid==='ended-focus'?'owner:work':null});if(invalid==='ended-method')value.methodAssessment.intentIds=['owner:work'];return value;
 },ownerOnly);try{assert.equal((await s.advance()).status,200);round++;const before=await s.read();assert.equal((await s.advance()).status,502);assert.deepEqual((await s.read()).characters,before.characters);}finally{s.restore();}
});

test('a newly formed candidate cannot claim same-decision satisfaction before its first action',async()=>{
 const s=await scenario(input=>decision(input,{updates:[upsert('owner:new'),assess(input,'owner:new','satisfied','ready',0)]}),ownerOnly);try{const before=await s.read();assert.equal((await s.advance()).status,502);assert.deepEqual((await s.read()).characters,before.characters);assert.equal(((await s.read()).objects||[]).length,(before.objects||[]).length);}finally{s.restore();}
});

for(const missing of ['drop','scope-change','stale-child','dangling-shared'])test(`a parent change rejects ${missing} without a complete valid child disposition`,async()=>{
 let round=0;const s=await scenario(input=>{
  if(!round)return decision(input,{updates:[upsert('owner:parent',[],{kind:'direction'}),upsert('owner:child',[{id:'owner:parent',version:0},{id:'owner:direction',version:1}])]});
  if(missing==='scope-change')return decision(input,{updates:[edit(input,'owner:parent',{scope:'已經改成完全不同的承接範圍'})]});
  if(missing==='stale-child'){const child=edit(input,'owner:child',{parents:[]});child.version=999;return decision(input,{updates:[drop(input,'owner:parent'),child]});}
  if(missing==='dangling-shared')return decision(input,{updates:[drop(input,'owner:parent'),assess(input,'owner:child','active','waiting')]});
  return decision(input,{updates:[drop(input,'owner:parent')]});
 },ownerOnly);try{assert.equal((await s.advance()).status,200);round++;const before=await s.read();assert.equal((await s.advance()).status,502);assert.deepEqual((await s.read()).characters,before.characters);assert.deepEqual((await s.read()).objects,before.objects);}finally{s.restore();}
});

test('a full twelve-node graph can explicitly detach affected children in bounded decisions and then exit the parent',async()=>{
 let round=0,stage='create';const names=Array.from({length:11},(_,i)=>'owner:child'+i);const s=await scenario(input=>{
  if(stage==='create')return decision(input,{updates:names.slice(round*4,round*4+4).map(id=>upsert(id,[{id:'owner:direction',version:1}],{content:'一項承接',scope:'保持自己的工作範圍',satisfaction:null}))});
  if(stage==='missing')return decision(input,{updates:[drop(input,'owner:direction')]});
  if(stage==='detach')return decision(input,{updates:names.slice(round*4,round*4+4).map(id=>edit(input,id,{parents:[]}))});
  if(stage==='exit')return decision(input,{updates:[drop(input,'owner:direction')]});
  assert.equal(input.self.intents.filter(node=>node.status==='active').length,11);return decision(input);
 },ownerOnly);try{
  for(round=0;round<3;round++)assert.equal((await s.advance()).status,200);const full=await s.read();assert.equal(owner(full).intents.length,12);stage='missing';assert.equal((await s.advance()).status,502);assert.deepEqual((await s.read()).characters,full.characters);
  stage='detach';for(round=0;round<3;round++){assert.equal((await s.advance()).status,200);assert.equal(owner(await s.read()).intents.length,12);}
  stage='exit';assert.equal((await s.advance()).status,200);const saved=owner(await s.read());assert.equal(saved.intents.find(node=>node.id==='owner:direction').status,'dropped');assert.deepEqual(saved.intents.filter(node=>node.status==='active').map(node=>node.id),names);assert.ok(saved.intents.filter(node=>node.status==='active').every(node=>node.version===2&&node.parents.length===0&&node.scope==='保持自己的工作範圍'));stage='read';assert.equal((await s.advance()).status,200);assert.equal(s.frames.length,9);assert.ok(s.frames.every(frame=>Buffer.byteLength(JSON.stringify(frame.input),'utf8')<88*1024));
 }finally{s.restore();}
});

for(const disposition of ['resume','abandon'])test(`ending a motive while pausing can later ${disposition} the same real work without replaying results`,async()=>{
 let phase='start',npc=0,judgments=0;const s=await scenario(input=>{
  if(input.contractVersion==='world-adjudication.v1'){judgments++;return judgment();}npc++;
  if(phase==='start')return startWork(input);
  if(phase==='pause')return decision(input,{updates:[drop(input,'owner:work')],type:'pause',content:'我放下原本的理由，明示先暫停這份進度'});
  if(phase==='control')return decision(input,{updates:disposition==='resume'?[upsert('owner:replacement',[],{scope:'現在以新的決定接回同一份實物工作'})]:[],focus:disposition==='resume'?'owner:replacement':null,type:disposition,target:input.self.pausedActivity.id,content:'依新的決定處置原活動'});
  return decision(input);
 },workWorld);try{
  assert.equal((await s.advance()).status,200);const origin=owner(await s.read()).plan.pursuitOrigin;phase='pause';assert.equal((await s.post({operation:'intervene',target:'owner',text:'可以停下來重新決定是否還要繼續。'})).status,200);const pausedResponse=await s.advance();assert.equal(pausedResponse.status,200,await pausedResponse.clone().text());const paused=owner(await s.read()).pausedActivity;assert.ok(paused);assert.deepEqual(paused.plan.pursuitIds,[]);assert.deepEqual(paused.plan.pursuitOrigin,origin);assert.equal(owner(await s.read()).intents.find(node=>node.id==='owner:work').status,'dropped');assert.equal((await s.read()).objects[0].revision,2);
  phase='control';assert.equal((await s.advance()).status,200);const controlled=owner(await s.read());assert.equal(controlled.pausedActivity,undefined);
  if(disposition==='resume'){assert.deepEqual(controlled.plan.pursuitOrigin,origin);assert.deepEqual(controlled.plan.pursuitIds,['owner:replacement']);assert.equal(controlled.plan.phases.cursor,1);assert.equal(controlled.plan.until-controlled.plan.startedAt,60);}
  else assert.equal(controlled.plan,undefined);
  phase='after';const beforeCalls=npc;assert.equal((await s.advance()).status,200);assert.equal((await s.advance()).status,200);const final=await s.read();assert.equal(final.objects[0].revision,disposition==='resume'?3:2);assert.equal(final.objects[0].state.progress,disposition==='resume'?'complete':'partial');assert.equal(judgments,1);if(disposition==='resume')assert.equal(npc,beforeCalls,'resumed phases do not ask another NPC decision');
 }finally{s.restore();}
});

test('dropping a paused motive without choosing its lifecycle disposition rejects the whole candidate',async()=>{
 let phase='start';const s=await scenario(input=>{
  if(input.contractVersion==='world-adjudication.v1')return judgment();
  if(phase==='start')return startWork(input);
  if(phase==='pause')return decision(input,{focus:'owner:work',type:'pause',content:'先保留這份進度'});
  return decision(input,{updates:[drop(input,'owner:work')],content:'沒有處置原暫停活動'});
 },workWorld);try{assert.equal((await s.advance()).status,200);phase='pause';await s.post({operation:'intervene',target:'owner',text:'先停一停。'});assert.equal((await s.advance()).status,200);phase='bad';const before=await s.read(),count=s.frames.length,operationId=Date.now()+':'+crypto.randomUUID();assert.equal((await s.post({operation:'advance',minutes:15,operationId})).status,502);assert.deepEqual((await s.read()).characters,before.characters);assert.deepEqual((await s.read()).objects,before.objects);assert.equal((await s.post({operation:'advance',minutes:15,operationId})).status,502);assert.equal(s.frames.length,count+1);}finally{s.restore();}
});

for(const failure of ['save','before-save','lease','later-role'])test(`exit, relations and interrupted activity roll back on ${failure}, preserving prior physical progress and exact replay`,async()=>{
 let phase='start',clock=Date.now;const s=await scenario(input=>{
  if(input.contractVersion==='world-adjudication.v1')return judgment();
  if(input.self.id!=='owner')return phase==='exit'&&failure==='later-role'?{invalid:'later actor'}:decision(input,{duration:60});
  return phase==='start'?startWork(input):decision(input,{updates:[drop(input,'owner:work')],content:'明示改做別的事，中止未來階段'});
 },world=>{const vera=structuredClone(world.characters.find(actor=>actor.id==='vera'));workWorld(world);if(failure==='later-role')world.characters.unshift(vera);});try{
  assert.equal((await s.advance()).status,200);phase='exit';assert.equal((await s.post({operation:'intervene',target:failure==='later-role'?'all':'owner',text:'有新情況，可以重新決定是否繼續。'})).status,200);const before=await s.read(),count=s.frames.length;
  if(failure==='save')s.store.conflictOnNextSave();if(failure==='before-save')s.store.throwBeforeNextSave();if(failure==='lease'){const expired=clock()+500000;s.store.onStorage(sql=>{if(sql.startsWith('UPDATE worlds SET state'))Date.now=()=>expired;});}
  const operationId=Date.now()+':'+crypto.randomUUID(),response=await s.post({operation:'advance',minutes:15,operationId});assert.equal(response.status,502);Date.now=clock;const after=await s.read();assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.objects,before.objects);assert.equal(after.objects[0].state.progress,'partial');assert.equal(after.objects[0].revision,2);assert.ok(after.aiUsage.totalCalls>before.aiUsage.totalCalls);const calls=s.frames.length;assert.ok(calls>count);assert.equal((await s.post({operation:'advance',minutes:15,operationId})).status,502);assert.equal(s.frames.length,calls);
 }finally{Date.now=clock;s.restore();}
});

test('an explicit continuation can transfer the current motive while preserving the original activity origin and one physical progress',async()=>{
 let phase='start',npc=0,judgments=0;const s=await scenario(input=>{
  if(input.contractVersion==='world-adjudication.v1'){judgments++;return judgment();}npc++;
  if(phase==='start')return startWork(input);
  if(phase==='transfer')return decision(input,{updates:[drop(input,'owner:work'),upsert('owner:replacement',[],{scope:'我仍想完成同一件實物，但已改變自己的動機'})],focus:'owner:replacement',type:'continue',content:'不重做，依原活動繼續'});
  assert.equal(input.objects.find(object=>object.id==='work').state.progress,'complete');assert.equal(input.self.intents.find(node=>node.id==='owner:work').status,'dropped');return decision(input,{focus:'owner:replacement'});
 },workWorld);try{
  assert.equal((await s.advance()).status,200);const before=await s.read(),original=owner(before).plan;assert.deepEqual(original.pursuitOrigin.pursuits,[{id:'owner:work',version:1}]);assert.equal(before.objects[0].revision,2);
  phase='transfer';assert.equal((await s.post({operation:'intervene',target:'owner',text:'可以重新考慮自己為什麼還想繼續這件工作。'})).status,200);assert.equal((await s.advance()).status,200);const next=await s.read(),plan=owner(next).plan;assert.equal(plan.startedAt,original.startedAt);assert.equal(plan.until,original.until);assert.deepEqual(plan.pursuitIds,['owner:replacement']);assert.deepEqual(plan.pursuitOrigin,original.pursuitOrigin);assert.equal(owner(next).intents.find(node=>node.id==='owner:work').status,'dropped');assert.equal(next.objects[0].revision,2);
  phase='finish';assert.equal((await s.advance()).status,200);assert.equal((await s.advance()).status,200);assert.equal(npc,2,'pure phases add no decisions');assert.equal((await s.read()).objects[0].revision,3);assert.equal((await s.read()).objects[0].state.progress,'complete');assert.equal((await s.advance()).status,200);assert.equal(judgments,1);assert.equal(owner(await s.read()).intents.find(node=>node.id==='owner:replacement').status,'active');
 }finally{s.restore();}
});

for(const disposition of ['drop','independent','transfer','shared'])for(const reverse of [false,true])test(`parent exit applies the explicit ${disposition} disposition without changing other work (${reverse})`,async()=>{
 let round=0;const s=await scenario(input=>{
  if(!round)return decision(input,{updates:[upsert('owner:parent',[],{kind:'direction',scope:'為來訪者完成一份心意'}),...(disposition==='shared'?[upsert('owner:other',[],{kind:'direction',scope:'仍然在乎的另一個方向'})]:[]),upsert('owner:child',[{id:'owner:parent',version:0},...(disposition==='shared'?[{id:'owner:other',version:0}]:[])],{scope:'同一項實際工作'})],focus:'owner:child'});
  if(round===1){const parents=disposition==='independent'?[]:[{id:disposition==='shared'?'owner:other':'owner:direction',version:1}];const updates=[drop(input,'owner:parent'),disposition==='drop'?drop(input,'owner:child'):edit(input,'owner:child',{parents})];return decision(input,{updates:reverse?updates.reverse():updates,focus:disposition==='drop'?null:'owner:child'});}
  assert.equal(input.self.intents.find(node=>node.id==='owner:parent').status,'dropped');return decision(input,{focus:disposition==='drop'?null:'owner:child'});
 },ownerOnly);try{
  assert.equal((await s.advance()).status,200);const before=owner(await s.read());round++;const response=await s.advance();assert.equal(response.status,200,await response.clone().text());const actor=owner(await s.read()),child=actor.intents.find(node=>node.id==='owner:child');assert.equal(actor.intents.find(node=>node.id==='owner:parent').status,'dropped');assert.equal(child.id,'owner:child');assert.equal(child.scope,'同一項實際工作');assert.equal(child.status,disposition==='drop'?'dropped':'active');assert.deepEqual(actor.intents.find(node=>node.id==='owner:direction'),before.intents.find(node=>node.id==='owner:direction'));assert.equal(actor.intents.length,before.intents.length);assert.ok(actor.pursuitTrace.some(trace=>trace.id===child.id&&trace.before?.parents.some(parent=>parent.id==='owner:parent')));round++;assert.equal((await s.advance()).status,200);
 }finally{s.restore();}
});

for(const reverse of [false,true])test(`a revised upper scope can retain an explicitly reviewed child in either wire order (${reverse})`,async()=>{
 let round=0;const s=await scenario(input=>{
  if(!round)return decision(input,{updates:[upsert('owner:parent',[],{kind:'direction',scope:'原本願意處理的範圍'}),upsert('owner:child',[{id:'owner:parent',version:0}],{scope:'原本的一份工作'})],focus:'owner:child'});
  const updates=[edit(input,'owner:parent',{scope:'現在只願意處理較小的一部分'}),edit(input,'owner:child')];updates[1].reason='這份原工作仍然支援修改後的範圍，我明示繼續保留';return decision(input,{updates:reverse?updates.reverse():updates,focus:'owner:child'});
 },ownerOnly);try{assert.equal((await s.advance()).status,200);round++;assert.equal((await s.advance()).status,200);const actor=owner(await s.read()),parent=actor.intents.find(node=>node.id==='owner:parent'),child=actor.intents.find(node=>node.id==='owner:child');assert.equal(parent.version,2);assert.equal(child.version,2);assert.equal(child.parents[0].version,2);assert.equal(child.scope,'原本的一份工作');assert.equal(child.status,'active');assert.ok(actor.pursuitTrace.some(trace=>trace.id===parent.id&&trace.before?.scope==='原本願意處理的範圍'&&trace.after.scope==='現在只願意處理較小的一部分'));}finally{s.restore();}
});
