/* eslint-disable @typescript-eslint/no-require-imports -- Native provider fixtures through real World API and SQLite. */
const test=require('node:test'),assert=require('node:assert/strict');
const {scenario}=require('./pursuit-graph-fixture.cjs');
const {assess,decision,upsert}=require('./pursuit-lifecycle-fixture.cjs');
const actor=world=>world.characters.find(c=>c.id==='vera');

test('a creative pursuit survives talking, research, another method and real progress before separate subjective satisfaction',async()=>{
 let round=0;const inputs=[];
 const s=await scenario(input=>{inputs.push(input);const task=input.self.intents.find(n=>n.id==='vera:design');
  if(round===0)return decision(input,{updates:[upsert('vera:design',[{id:'vera:direction',version:1}],{scope:'研究後完成一份自己的設計',satisfaction:'有一份我願意採用的設計'})],focus:'vera:design',type:'say',target:'observer',content:'我想先研究再做一份自己的設計。'});
  assert.equal(task.scope,'研究後完成一份自己的設計');if(round<=4)assert.equal(task.status,'active');
  if(round===1)return decision(input,{focus:task.id,type:'work',target:'study-craft',content:'先看眼前的布料和髮飾參考',choice:'switch'});
  if(round===2)return decision(input,{focus:task.id,type:'work',target:'craft-challenge',content:'依參考構思一份自己的設計',duration:30,choice:'switch'});
  if(round===4)return decision(input,{updates:[assess(input,task.id,'satisfied','ready'),assess(input,'vera:direction','active','enough')]});
  return decision(input);
 });try{
  for(round=0;round<5;round++){
   const response=await s.advance();assert.equal(response.status,200,await response.clone().text());const w=await s.read(),c=actor(w);
   if(round===0){assert.equal(c.projects,undefined);assert.equal(c.intents.find(n=>n.id==='vera:design').status,'active');}
   if(round===1){assert.ok(c.craftInsights.includes('髮飾參考'));assert.equal(c.intents.find(n=>n.id==='vera:design').version,1);}
   if(round===2){assert.equal(c.projects.length,1);assert.equal(c.intents.find(n=>n.id==='vera:design').status,'active');assert.deepEqual(c.plan.pursuitIds,['vera:design']);}
   if(round===3){assert.equal(c.projects.length,1);assert.equal(c.plan,undefined);assert.equal(s.frames.length,3,'pure progress does not dispatch a decision');}
  }
  const saved=actor(await s.read());assert.equal(saved.projects.length,1);assert.equal(saved.intents.find(n=>n.id==='vera:design').status,'satisfied');assert.equal(saved.intents.find(n=>n.id==='vera:design').scope,'研究後完成一份自己的設計');assert.equal(saved.intents.find(n=>n.id==='vera:direction').progress,'enough');assert.equal(s.frames.length,4);
  round++;assert.equal((await s.advance()).status,200);const final=actor(await s.read());assert.equal(final.projects.length,1);assert.equal(final.intents.find(n=>n.id==='vera:design').status,'satisfied');assert.equal(inputs.at(-1).self.intents.find(n=>n.id==='vera:direction').progress,'enough');
 }finally{s.restore();}
});

test('a meal stays unfinished through inquiry and approval, materializes once, then returns as known evidence for layered satisfaction',async()=>{
 let round=0,npc=0,judgments=0;const s=await scenario(input=>{
  if(input.contractVersion==='world-adjudication.v1'){judgments++;return {status:'accepted',completionMinutes:30,effects:[{kind:'materialize',supplyId:'bread',expectedRemaining:1}],stages:[],check:null,branches:null,routine:null};}
  npc++;
  if(round===0)return decision(input,{updates:[upsert('owner:meal',[{id:'owner:direction',version:1}],{scope:'為自己取得一份餐點',satisfaction:'眼前實際有一份可取用的餐點'})],focus:'owner:meal',type:'say',target:'observer',content:'我先確認這裡能準備什麼。'});
  if(round===1){const value=decision(input,{focus:'owner:meal',type:'propose',target:'bread',content:'從這份麵包準備一份自己的餐點',duration:30,choice:'switch'});value.action.purpose='取得餐點';value.timeIntent={kind:'completion',maxMinutes:null};return value;}
  if(round===3){assert.ok(input.objects.some(o=>o.id==='bread:1'&&o.holder==='owner'));assert.equal(input.self.intents.find(n=>n.id==='owner:meal').scope,'為自己取得一份餐點');return decision(input,{updates:[assess(input,'owner:meal','satisfied','ready'),assess(input,'owner:direction','active','enough')]});}
  return decision(input);
 },w=>{w.characters=w.characters.filter(c=>c.id==='owner');w.characters[0].control.mode='autonomous';w.supplies=[{id:'bread',label:'自己的麵包',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];});
 try{
  for(round=0;round<4;round++){const response=await s.advance();assert.equal(response.status,200,await response.clone().text());const w=await s.read(),owner=w.characters[0];
   if(round<2){assert.equal(w.objects.filter(o=>o.id==='bread:1').length,0);assert.equal(owner.intents.find(n=>n.id==='owner:meal').status,'active');}
   if(round===2){assert.equal(w.objects.filter(o=>o.id==='bread:1').length,1);assert.equal(owner.intents.find(n=>n.id==='owner:meal').status,'active');assert.equal(npc,2);}
  }
  const final=await s.read(),owner=final.characters[0];assert.equal(final.objects.filter(o=>o.id==='bread:1').length,1);assert.equal(final.supplies[0].remaining,0);assert.equal(owner.intents.find(n=>n.id==='owner:meal').status,'satisfied');assert.equal(owner.intents.find(n=>n.id==='owner:direction').progress,'enough');assert.equal(judgments,1);assert.equal(npc,3);
  round++;assert.equal((await s.advance()).status,200);assert.equal((await s.read()).objects.filter(o=>o.id==='bread:1').length,1);assert.equal(judgments,1,'enough direction does not generate another meal');
 }finally{s.restore();}
});

test('shared work has one real result while each upper direction makes its own satisfaction judgment',async()=>{
 let round=0;const s=await scenario(input=>{
  if(!round)return decision(input,{updates:[upsert('vera:gift',[],{kind:'direction',scope:'為朋友準備心意',satisfaction:null}),upsert('vera:shared',[{id:'vera:direction',version:1},{id:'vera:gift',version:0}],{scope:'一份同時有創作和送禮意義的設計'})],focus:'vera:shared',type:'work',target:'craft-challenge',content:'構思一份設計'});
  if(round===1)return decision(input,{updates:[assess(input,'vera:shared','satisfied','ready'),assess(input,'vera:direction','active','enough')]});
  if(round===2){assert.equal(input.self.intents.find(n=>n.id==='vera:gift').status,'active');assert.equal(input.self.intents.find(n=>n.id==='vera:gift').progress,undefined);return decision(input,{updates:[assess(input,'vera:gift','satisfied','ready')]});}
  return decision(input);
 });try{
  for(round=0;round<3;round++){const response=await s.advance();assert.equal(response.status,200,await response.clone().text());}
  const saved=actor(await s.read());assert.equal(saved.projects.length,1);assert.equal(saved.intents.find(n=>n.id==='vera:shared').status,'satisfied');assert.equal(saved.intents.find(n=>n.id==='vera:gift').status,'satisfied');assert.equal(saved.intents.find(n=>n.id==='vera:direction').status,'active');assert.equal(saved.intents.find(n=>n.id==='vera:direction').progress,'enough');
 }finally{s.restore();}
});

test('subjective satisfaction may follow a mistaken visible memory without creating the claimed external result',async()=>{
 let round=0;const s=await scenario(input=>{
  if(!round)return decision(input,{updates:[upsert('vera:mistaken',[],{scope:'保留自己認為足夠的構想'})]});
  const reference=input.self.shortTerm.find(m=>m.id==='mistaken-memory');assert.ok(reference);return decision(input,{updates:[assess(input,'vera:mistaken','satisfied','ready','known-result',[{kind:'short',id:reference.id,version:reference.version}])]});
 },w=>{const c=actor(w);c.shortTerm=[{id:'mistaken-memory',version:1,characterId:'vera',time:w.minute,text:'我以為先前那份設計已經完成，這可能是我的誤解。',source:{kind:'experience'}}];});
 try{assert.equal((await s.advance()).status,200);round++;assert.equal((await s.advance()).status,200);const saved=actor(await s.read());assert.equal(saved.intents.find(n=>n.id==='vera:mistaken').status,'satisfied');assert.equal(saved.projects,undefined);assert.equal((await s.read()).objects.some(o=>o.kind==='design'),false);}finally{s.restore();}
});

test('a continuing direction can be enough from personal feelings and later become ready without being recreated',async()=>{
 let round=0;const s=await scenario(input=>decision(input,{updates:[assess(input,'vera:direction','active',round?'ready':'enough','subjective',[])]}));
 try{assert.equal((await s.advance()).status,200);const first=actor(await s.read()).intents[0];assert.equal(first.progress,'enough');assert.equal(first.status,'active');round++;assert.equal((await s.advance()).status,200);const next=actor(await s.read()).intents[0];assert.equal(next.id,first.id);assert.equal(next.progress,'ready');assert.equal(next.version,first.version+1);assert.equal(actor(await s.read()).projects,undefined);}finally{s.restore();}
});

for(const [name,mutate] of [
 ['unknown result without source',(_input,u)=>{u.node.basis.kind='known-result';u.references=[];}],
 ['future action as evidence',(_input,u)=>{u.node.basis.kind='known-result';u.references=[{kind:'short',id:'this-action-will-create-a-result',version:1}];}],
 ['stale visible source',(input,u)=>{u.references=[{kind:'short',id:input.self.shortTerm[0].id,version:999}];}],
 ['foreign source',(_input,u)=>{u.references=[{kind:'short',id:'owner:private',version:1}];}],
 ['waiting completed pursuit',(_input,u)=>{u.node.status='satisfied';u.node.progress='waiting';}],
 ['unknown progress',(_input,u)=>{u.node.progress='automatically-finished';}],
 ['oversized short basis',(_input,u)=>{u.node.basis.text='字'.repeat(161);}],
])test(`invalid subjective assessment rejects ${name} without partial world changes`,async()=>{
 const s=await scenario(input=>{const update=assess(input,'vera:direction','active','enough','subjective',[]);mutate(input,update);return decision(input,{updates:[update]});});
 try{const before=await s.read(),response=await s.advance();assert.equal(response.status,502);const after=await s.read();assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.objects,before.objects);assert.equal(after.aiUsage.totalCalls,1);}finally{s.restore();}
});

test('a satisfied identity cannot be resurrected and a selected current action cannot manufacture its own completed evidence',async()=>{
 let round=0;const s=await scenario(input=>{
  if(!round)return decision(input,{updates:[upsert('vera:ended')]});
  if(round===1)return decision(input,{updates:[assess(input,'vera:ended','satisfied','ready','subjective',[])]});
  return decision(input,{updates:[upsert('vera:ended',[],{},0)],focus:'vera:ended'});
 });try{assert.equal((await s.advance()).status,200);round++;assert.equal((await s.advance()).status,200);const before=await s.read();round++;assert.equal((await s.advance()).status,502);assert.deepEqual((await s.read()).characters,before.characters);assert.equal(actor(await s.read()).projects,undefined);}finally{s.restore();}
});

for(const disposition of ['resume','abandon'])test(`one real phased activity can pause and ${disposition} without duplicating pursuit progress or committed effects`,async()=>{
 let phase='start',npc=0,judgments=0;const s=await scenario(input=>{
  if(input.contractVersion==='world-adjudication.v1'){judgments++;return {status:'accepted',resumable:true,completionMinutes:60,effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:1,key:'progress',value:'partial'}]},{afterMinutes:60,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:2,key:'progress',value:'complete'}]}],check:null,branches:null,routine:null};}
  npc++;
  if(phase==='start'){const value=decision(input,{updates:[upsert('owner:work',[],{scope:'把同一份工作做完'})],focus:'owner:work',type:'propose',target:'work',content:'處理這份工作',duration:60});value.action.purpose='完成工作';value.timeIntent={kind:'completion',maxMinutes:null};return value;}
  if(phase==='pause')return decision(input,{updates:[assess(input,'owner:work','active','waiting','subjective',[])],focus:'owner:work',type:'pause',content:'先暫停'});
  if(phase==='rest')return decision(input);
  if(phase==='control')return decision(input,{updates:[assess(input,'owner:work','active',disposition==='resume'?'ready':'blocked','subjective',[])],focus:'owner:work',type:disposition,target:input.self.pausedActivity.id,content:'依我自己的選擇處置原進度'});
  if(phase==='finish')return decision(input,{updates:[assess(input,'owner:work','satisfied','ready')]});
  return decision(input);
 },w=>{w.characters=w.characters.filter(c=>c.id==='owner');w.characters[0].control.mode='autonomous';w.objects=[{id:'work',source:'fixture',label:'同一份工作',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{progress:'raw'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{progress:['raw','partial','complete']}}];});
 try{
  assert.equal((await s.advance()).status,200);assert.equal((await s.read()).objects.find(o=>o.id==='work').revision,2);
  phase='pause';await s.post({operation:'intervene',target:'owner',text:'先考慮一下別的事情。'});assert.equal((await s.advance()).status,200);const paused=(await s.read()).characters[0].pausedActivity;assert.equal(paused.plan.phases.cursor,1);assert.deepEqual(paused.plan.pursuitIds,['owner:work']);
  phase='rest';assert.equal((await s.advance()).status,200);assert.equal((await s.read()).objects.find(o=>o.id==='work').revision,2);
  phase='control';assert.equal((await s.advance()).status,200);assert.equal((await s.read()).characters[0].pausedActivity,undefined);
  if(disposition==='resume'){
   let w=await s.read();assert.equal(w.characters[0].plan.phases.cursor,1);assert.equal(w.objects.find(o=>o.id==='work').revision,2);const calls=npc;
   phase='progress';while((await s.read()).characters[0].plan)assert.equal((await s.advance()).status,200);
   w=await s.read();assert.equal(npc,calls);assert.equal(w.objects.find(o=>o.id==='work').revision,3);assert.equal(w.characters[0].intents.find(n=>n.id==='owner:work').status,'active');
   phase='finish';assert.equal((await s.advance()).status,200);assert.equal((await s.read()).characters[0].intents.find(n=>n.id==='owner:work').status,'satisfied');
  }else {const w=await s.read();assert.equal(w.objects.find(o=>o.id==='work').state.progress,'partial');assert.equal(w.characters[0].intents.find(n=>n.id==='owner:work').status,'active');assert.equal(w.characters[0].intents.find(n=>n.id==='owner:work').progress,'blocked');}
  assert.equal(judgments,1);
 }finally{s.restore();}
});

for(const progress of ['waiting','deferred','blocked'])test(`${progress} remains a saved active pursuit rather than satisfaction or abandonment`,async()=>{
 let round=0;const s=await scenario(input=>{if(!round)return decision(input,{updates:[assess(input,'vera:direction','active',progress,'subjective',[])]});assert.equal(input.self.intents[0].progress,progress);assert.equal(input.self.intents[0].status,'active');return decision(input);});
 try{assert.equal((await s.advance()).status,200);const original=actor(await s.read()).intents;round++;assert.equal((await s.advance()).status,200);assert.deepEqual(actor(await s.read()).intents,original);assert.equal(actor(await s.read()).projects,undefined);}finally{s.restore();}
});

for(const failure of ['later-role','save'])test(`subjective assessment and activity roll back atomically on ${failure} and exact replay dispatches nothing`,async()=>{
 let calls=0;const s=await scenario(input=>{calls++;if(input.self.id==='owner')return {invalid:'later role'};return decision(input,{updates:[assess(input,'vera:direction','active','enough','subjective',[])]});},w=>{if(failure==='later-role')w.characters.find(c=>c.id==='owner').control.mode='autonomous';});
 try{const before=await s.read();if(failure==='save')s.store.conflictOnNextSave();const operationId=Date.now()+':'+crypto.randomUUID();const response=await s.post({operation:'advance',minutes:15,operationId});assert.equal(response.status,502);const after=await s.read();assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.events,before.events);assert.equal(after.aiUsage.totalCalls,calls);const dispatched=calls;assert.equal((await s.post({operation:'advance',minutes:15,operationId})).status,502);assert.equal(calls,dispatched);}finally{s.restore();}
});
