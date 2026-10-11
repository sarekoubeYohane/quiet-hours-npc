/* eslint-disable @typescript-eslint/no-require-imports -- API fixtures. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const build=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=build('world');
const {GET,POST}=build('route');
const store=build('store');
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({mode:'demo',...body})});
const read=async()=>(await (await GET()).json()).world;
const owner=w=>w.characters.find(c=>c.id==='owner');
const act=async action=>{assert.equal((await POST(req({operation:'direct',action}))).status,200);assert.equal((await POST(req({operation:'advance',minutes:15}))).status,200);return read();};
test('cafe region and door operations persist and a closed door blocks movement without historical observations',async()=>{
 store.install(seedWorld());
 const initial=await read();
 assert.equal(owner(initial).region,'cafe-front');
 assert.equal(initial.scene.doors['cafe-door'],'open');
 assert.deepEqual(owner(initial).observations,[]);
 await POST(req({operation:'takeover'}));
 const closed=await act({type:'door',target:'cafe-door',content:'close'});
 assert.equal(closed.scene.doors['cafe-door'],'closed');
 assert.equal((await POST(req({operation:'direct',action:{type:'move',target:'cafe-storeroom'}}))).status,400);
 await act({type:'door',target:'cafe-door',content:'open'});
 const moved=await act({type:'move',target:'cafe-storeroom'});
 assert.equal(owner(moved).region,'cafe-storeroom');
 assert.equal(owner(moved).location,'cafe');
 assert.deepEqual((await read()).characters,moved.characters);
});
const withModel=async(actions,run)=>{
 const old=global.fetch,inputs=[];
 global.fetch=async(_url,init)=>{const data=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(data);return Response.json({choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:15,intents:[],...actions[data.self.id]})}}]});};
 try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await run(inputs,()=>POST(req({operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna',limits:{calls:120,tokens:500000}})));}finally{global.fetch=old;}
};
test('closed-door arrival gives a waiting owner only anonymous footsteps, persists once and stays subjective after return',async()=>{
 const w=seedWorld();owner(w).region='cafe-storeroom';w.scene={doors:{'cafe-door':'closed'},noise:{},occluded:[]};store.install(w);
 await POST(req({operation:'takeover'}));
 await withModel({vera:{type:'move',target:'cafe'}},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);
  const saved=await read(),c=owner(saved),arrival=saved.events.find(e=>e.actor==='vera'&&e.kind==='move');
  assert.ok(c.observations.some(o=>o.kind==='sound'&&o.sense==='hearing'&&!o.source));
  assert.equal(c.memories.some(m=>m.text.includes('Vera')),false);
  assert.ok(c.control.experiences.some(m=>m.text.includes('腳步')));
  assert.equal(arrival.perception.find(t=>t.characterId==='owner').status,'direct');
  assert.deepEqual(owner(await read()).observations,c.observations);
  await POST(req({operation:'return-control'}));
  assert.equal((await advance()).status,200);
  const input=inputs.find(p=>p.self.id==='owner');
  assert.deepEqual(input.visiblePeople,[]);
  assert.ok(input.knownControlExperiences.some(m=>m.text.includes('腳步')));
  assert.equal(JSON.stringify(input).includes('步行前往'),false);
  assert.equal(JSON.stringify(input).includes('characterId'),false);
 });
});
test('opening a door reveals current people without replaying speech or private content; clear speech uses no dice',async()=>{
 const w=seedWorld();owner(w).region='cafe-storeroom';
 for(const id of ['cass','vera']){const c=w.characters.find(c=>c.id===id);c.location='cafe';c.region='cafe-front';}
 w.scene.doors['cafe-door']='closed';store.install(w);await POST(req({operation:'takeover'}));
 const actions={vera:{type:'say',target:'cass',content:'門外先前的私下話'},cass:{type:'reflect',content:'不能流出的內心'},kris:{type:'message',target:'cass',content:'遠方的私人訊息'}};
 await withModel(actions,async(inputs,advance)=>{
  assert.equal((await advance()).status,200);
  const before=await read();assert.equal(JSON.stringify(owner(before)).includes('門外先前的私下話'),false);
  assert.equal((await POST(req({operation:'direct',action:{type:'door',target:'cafe-door',content:'open'}}))).status,200);
  actions.vera={type:'rest'};actions.cass={type:'rest'};actions.kris={type:'rest'};
  assert.equal((await advance()).status,200);
  const opened=owner(await read());assert.ok(opened.observations.some(o=>o.source==='vera'&&o.sense==='sight'));
  assert.equal(JSON.stringify(opened).includes('門外先前的私下話'),false);
  assert.equal(JSON.stringify(opened).includes('不能流出的內心'),false);
  assert.equal(JSON.stringify(opened).includes('遠方的私人訊息'),false);
  actions.vera={type:'say',target:'cass',content:'開門後清楚聽到'};
  const random=Math.random;Math.random=()=>{throw Error('direct perception must not roll');};
  try{assert.equal((await advance()).status,200);}finally{Math.random=random;}
  assert.ok(owner(await read()).observations.some(o=>o.text.includes('開門後清楚聽到')&&o.source==='vera'));
  await POST(req({operation:'return-control'}));assert.equal((await advance()).status,200);
  const input=inputs.find(p=>p.self.id==='owner');
  assert.equal(JSON.stringify(input).includes('不能流出的內心'),false);
  assert.equal(JSON.stringify(input).includes('門外先前的私下話'),false);
  assert.equal(JSON.stringify(input).includes('遠方的私人訊息'),false);
 });
});
test('old-world migration and free text cannot fabricate door state or replay historical events',async()=>{
 const w=seedWorld();delete w.scene;for(const c of w.characters){delete c.region;delete c.observations;}
 w.events.push({id:'hidden-history',time:1200,actor:'vera',kind:'say',text:'不能補發的歷史',audience:['vera'],scene:{from:'cafe',to:'cafe',target:'cass',content:'不能補發的歷史'}});
 store.install(w);const initial=await read();assert.equal(initial.scene.doors['cafe-door'],'open');
 assert.ok(initial.characters.every(c=>c.observations.length===0));
 assert.equal((await POST(req({operation:'intervene',target:'owner',text:'儲藏室門已經關好了'}))).status,200);
 const saved=await read();assert.equal(saved.scene.doors['cafe-door'],'open');assert.deepEqual(owner(saved).observations,[]);
 assert.equal(JSON.stringify(owner(saved)).includes('不能補發的歷史'),false);
});
test('scene and subjective observations roll back with a failed round or conflicting save',async()=>{
 const w=seedWorld();w.turn=3;store.install(w);
 const old=global.fetch;let calls=0;
 global.fetch=async()=>{if(++calls===2)throw Error('provider unavailable');return Response.json({choices:[{message:{content:JSON.stringify({type:'door',target:'cafe-door',content:'close',mood:'',durationMinutes:15,intents:[]})}}]});};
 try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));assert.equal((await POST(req({operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna'}))).status,502);}finally{global.fetch=old;}
 let saved=await read();assert.deepEqual(saved.scene,w.scene);assert.deepEqual(saved.characters,w.characters);assert.deepEqual(saved.events,w.events);
 await POST(req({operation:'direct',action:{type:'door',target:'cafe-door',content:'close'}}));const before=await read();store.conflictOnNextSave();
 assert.equal((await POST(req({operation:'advance',minutes:15}))).status,502);saved=await read();
 assert.deepEqual(saved.scene,before.scene);assert.deepEqual(saved.characters,before.characters);assert.deepEqual(saved.events,before.events);
});
test('a closed internal door also blocks leaving through the public entrance',async()=>{
 const w=seedWorld();owner(w).region='cafe-storeroom';w.scene.doors['cafe-door']='closed';store.install(w);
 assert.equal((await POST(req({operation:'direct',action:{type:'move',target:'kris-home'}}))).status,400);
 assert.equal(owner(await read()).region,'cafe-storeroom');
});
