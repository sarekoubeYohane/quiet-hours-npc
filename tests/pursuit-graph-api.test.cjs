/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict');
const {upsert,reorder,decision,scenario}=require('./pursuit-graph-fixture.cjs');
const vera=world=>world.characters.find(c=>c.id==='vera');
test('creative work can support two directions with one actual activity and survive SQLite into the next request',async()=>{
 let round=0;const s=await scenario(input=>{
  if(round===0)return decision(input,{updates:[upsert('vera:shared',[{id:'vera:direction',version:1},{id:'vera:gift',version:0}]),upsert('vera:gift',[],{kind:'direction',scope:'為朋友準備一份自己喜歡的心意',satisfaction:null})],focus:'vera:shared',type:'work',target:'craft-challenge',content:'構思一份兼具創作與送禮意義的設計'});
  const shared=input.self.intents.find(n=>n.id==='vera:shared');assert.equal(shared.parents.length,2);assert.equal(input.self.intents.filter(n=>n.id==='vera:shared').length,1);return decision(input,{focus:'vera:shared'});
 });try{
  const first=await s.advance();assert.equal(first.status,200,await first.clone().text());const saved=await s.read(),actor=vera(saved);assert.equal(actor.projects.length,1);assert.equal(actor.intents.filter(n=>n.id==='vera:shared').length,1);assert.deepEqual(actor.intents.find(n=>n.id==='vera:shared').parents.map(p=>p.id),['vera:direction','vera:gift']);
  round++;assert.equal((await s.advance()).status,200);assert.equal(vera(await s.read()).projects.length,1);assert.equal(s.frames.length,2);assert.deepEqual(vera(await s.read()).intents,actor.intents);
 }finally{s.restore();}
});

for(const [name,change] of [
 ['duplicate support edge',()=>[upsert('vera:bad',[{id:'vera:direction',version:1},{id:'vera:direction',version:1}])]],
 ['foreign support endpoint',()=>[upsert('vera:bad',[{id:'owner:direction',version:1}])]],
 ['expired support endpoint',()=>[upsert('vera:bad',[{id:'vera:direction',version:0}])]],
 ['wire order without explicit scope',()=>[upsert('vera:bad',[{id:'vera:direction',version:1,order:999}])]],
 ['duplicate reorder member',()=>[reorder('vera:roots',0,[{id:'vera:direction',version:1},{id:'vera:direction',version:1}],'roots')]],
 ['stale reorder member',()=>[reorder('vera:roots',0,[{id:'vera:direction',version:0}],'roots')]],
 ['unrelated reorder member',()=>[reorder('vera:roots',0,[{id:'owner:direction',version:1}],'roots')]],
 ['root passed as child',()=>[reorder('vera:direction',1,[{id:'vera:direction',version:1}])]],
 ['duplicate reorder scope',()=>[reorder('vera:roots',0,[{id:'vera:direction',version:1}],'roots'),reorder('vera:roots',0,[{id:'vera:direction',version:1}],'roots')]],
])test(`invalid shared topology or priority: ${name} rolls back as a whole`,async()=>{
 const s=await scenario(input=>decision(input,{updates:change()}));try{const before=await s.read(),operationId=Date.now()+':'+crypto.randomUUID();const response=await s.post({operation:'advance',minutes:15,operationId});assert.equal(response.status,502);const after=await s.read();assert.deepEqual(after.characters,before.characters);assert.equal(after.turn,before.turn);assert.equal(after.aiUsage.totalCalls,1);assert.equal((await s.post({operation:'advance',minutes:15,operationId})).status,502);assert.equal(s.frames.length,1);}finally{s.restore();}
});

test('valid same-batch parents and shared child do not depend on update ordering',async()=>{
 const results=[];for(const reverse of [false,true]){const s=await scenario(input=>{const updates=[upsert('vera:child',[{id:'vera:a',version:0},{id:'vera:b',version:0}]),upsert('vera:a',[],{kind:'direction'}),upsert('vera:b',[],{kind:'direction'})];return decision(input,{updates:reverse?updates.reverse():updates,focus:'vera:child'});});try{assert.equal((await s.advance()).status,200);results.push(vera(await s.read()).intents.map(n=>({id:n.id,parents:n.parents.map(p=>({id:p.id,version:p.version}))})).sort((a,b)=>a.id.localeCompare(b.id)));}finally{s.restore();}}assert.deepEqual(results[0],results[1]);
});

test('twelve-node sixteen-edge depth-four shared graph remains selectable and rejects the next node or edge',async()=>{
 const edges={gift:[],a:['direction','gift'],b:['direction','gift'],c:['direction','gift'],d:['a'],e:['b'],f:['c'],g:['d','e','f'],h:['d','e'],i:['e','f'],j:[]};
 const names=Object.keys(edges);let round=0,mutation;
 const s=await scenario(input=>{const updates=mutation?mutation(input):names.slice(round*4,round*4+4).map(name=>upsert('vera:'+name,edges[name].map(parent=>({id:'vera:'+parent,version:input.self.intents.find(n=>n.id==='vera:'+parent)?.version??0})),{scope:'一項工作',content:name,satisfaction:null}));return decision(input,{updates,focus:round<3?null:'vera:g'});});try{
  for(round=0;round<3;round++){const response=await s.advance();assert.equal(response.status,200,await response.clone().text());}
  const full=await s.read(),nodes=vera(full).intents;assert.equal(nodes.length,12);assert.equal(nodes.reduce((sum,node)=>sum+node.parents.length,0),16);assert.equal(s.frames.length,3);
  mutation=()=>[];assert.equal((await s.advance()).status,200);assert.equal(vera(await s.read()).focusIntentId,'vera:g');assert.ok(Buffer.byteLength(JSON.stringify(s.frames.at(-1).input),'utf8')<88*1024);
  mutation=()=>[upsert('vera:overflow',[],{scope:'另一項工作'})];assert.equal((await s.advance()).status,502);assert.equal(vera(await s.read()).intents.length,12);
  mutation=input=>{const original=input.self.intents.find(n=>n.id==='vera:h');return [upsert('vera:h',[...original.parents.map(({id,version})=>({id,version})),{id:'vera:f',version:input.self.intents.find(n=>n.id==='vera:f').version}],{scope:original.scope,content:original.content,satisfaction:original.satisfaction},original.version)];};assert.equal((await s.advance()).status,502);assert.equal(vera(await s.read()).intents.reduce((sum,node)=>sum+node.parents.length,0),16);
  mutation=input=>{const g=input.self.intents.find(n=>n.id==='vera:g'),j=input.self.intents.find(n=>n.id==='vera:j');const fields=n=>({scope:n.scope,content:n.content,satisfaction:n.satisfaction});return [upsert(j.id,[{id:g.id,version:g.version}],fields(j),j.version),upsert(g.id,g.parents.filter(p=>p.id!=='vera:f').map(({id,version})=>({id,version})),fields(g),g.version)];};assert.equal((await s.advance()).status,502,'a fifth level is rejected even with sixteen edges and twelve nodes');assert.deepEqual(vera(await s.read()).intents,nodes);
 }finally{s.restore();}
});

test('local root and sibling reordering preserves omitted work and one continuing activity, then permits a different branch',async()=>{
 let round=0;const s=await scenario(input=>{
  const ref=id=>({id,version:input.self.intents.find(n=>n.id===id).version});
  if(round===0)return decision(input,{updates:[upsert('vera:gift',[],{kind:'direction',context:'等待朋友回覆喜歡的樣式',importance:'high'}),upsert('vera:shared',[{id:'vera:direction',version:1},{id:'vera:gift',version:0}]),upsert('vera:other',[{id:'vera:direction',version:1}],{scope:'先整理自己的設計想法'}),upsert('vera:untouched',[{id:'vera:direction',version:1}],{scope:'保留另一個尚未開始的構想'})],focus:'vera:shared',type:'work',target:'craft-challenge',content:'構思設計',duration:60});
  if(round===1)return decision(input,{updates:[reorder('vera:roots',0,[ref('vera:gift'),ref('vera:direction')],'roots'),reorder('vera:direction',ref('vera:direction').version,[ref('vera:other'),ref('vera:shared')])],focus:'vera:shared',type:'continue',content:'繼續原設計',duration:60});
  if(round===2){assert.equal(input.self.intents.filter(n=>!n.parents.length)[0].id,'vera:gift');assert.ok(input.self.intents.find(n=>n.id==='vera:gift').context.includes('等待'));return decision(input,{focus:'vera:other',content:'先做另一分支，不替等待中的事情宣告完成'});}
  return decision(input,{focus:'vera:shared'});
 });try{
  assert.equal((await s.advance()).status,200);const first=vera(await s.read()),started=first.plan.startedAt,until=first.plan.until,untouched=first.intents.find(n=>n.id==='vera:untouched');round++;
  assert.equal((await s.post({operation:'intervene',target:'vera',text:'現在可以按自己的想法調整順序，無需換掉手上的進度。'})).status,200);
  const response=await s.advance();assert.equal(response.status,200,await response.clone().text());const second=vera(await s.read());assert.equal(second.plan.startedAt,started);assert.equal(second.plan.until,until);assert.equal(second.projects.length,1);assert.equal(second.intents.find(n=>n.id==='vera:untouched').version,untouched.version);assert.equal(second.intents.find(n=>n.id==='vera:untouched').scope,untouched.scope);
  const children=second.intents.filter(n=>n.parents.some(p=>p.id==='vera:direction')).sort((a,b)=>a.parents.find(p=>p.id==='vera:direction').order-b.parents.find(p=>p.id==='vera:direction').order);assert.deepEqual(children.map(n=>n.id),['vera:other','vera:shared','vera:untouched']);
  assert.equal(second.intents.find(n=>n.id==='vera:shared').parents.find(p=>p.id==='vera:gift').order,0,'the other parent has its own local order');
  round++;assert.equal((await s.post({operation:'intervene',target:'vera',text:'朋友還沒回覆；你也可以先做自己的事情。'})).status,200);assert.equal((await s.advance()).status,200);assert.equal(vera(await s.read()).focusIntentId,'vera:other');assert.equal(vera(await s.read()).intents.find(n=>n.id==='vera:shared').status,'active');
  round++;assert.equal((await s.advance()).status,200);assert.equal(vera(await s.read()).focusIntentId,'vera:shared');assert.equal(vera(await s.read()).projects.length,1);assert.equal(s.frames.length,4);
 }finally{s.restore();}
});
