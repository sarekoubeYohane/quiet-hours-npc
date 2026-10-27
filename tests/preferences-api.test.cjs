/* eslint-disable @typescript-eslint/no-require-imports -- API transport fixtures. */
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = build('world'), { GET, POST } = build('route'), store = build('store');
const world = require('./fixtures/ai-world.cjs')(seedWorld);
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin:'https://test.invalid', 'X-World-Time-Policy':'round-v1' }, body:JSON.stringify({ operationId:`${Date.now()}:${crypto.randomUUID()}`, mode:'demo', ...body }) });
const read = async () => (await (await GET()).json()).world;
const reference = input => ({kind:'short',id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version});
const preference = input => ({operation:'upsert',id:'quiet-tea',version:0,topic:'喝茶',context:'獨自整理思緒時',text:'即使剛才不順利，我仍喜歡茶的香氣。',references:[reference(input)],reason:'這次感受到的香氣對我很有意義。'});
async function withModel(choose, run) {
 const previous=global.fetch, inputs=[];
 global.fetch=async (_url,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);inputs.push(input);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[],cognitiveUpdates:[],interpretation:'',...choose(input)})}}]});};
 try {await POST(request({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(request({operation:'set-budget',limits:{calls:120,tokens:500000}}));await run(inputs,body=>POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,...body})));} finally {global.fetch=previous;}
}
test('normal decisions save subjective preferences from visible experiences and reload them without extra calls or forced intentions',async()=>{
 store.install(world());let update=true;
 await withModel(input=>input.self.id==='cass'&&update?{preferenceUpdates:[preference(input)]}:{},async(inputs,advance)=>{
  const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId});assert.equal(response.status,200);const result=await response.json(),saved=await read();
  assert.equal(saved.characters[0].preferences.items[0].text,'即使剛才不順利，我仍喜歡茶的香氣。');
  assert.equal(saved.characters[0].preferences.items[0].version,1);assert.deepEqual(saved.characters[0].intents,[]);assert.equal(inputs.length,4);
  assert.deepEqual(await(await advance({operationId})).json(),result);assert.equal(inputs.length,4);
  update=false;assert.equal((await advance()).status,200);const next=inputs.findLast(input=>input.self.id==='cass');assert.equal(next.self.preferences.items[0].id,'quiet-tea');
  assert.equal(JSON.stringify(next).includes('preferenceTrace'),false);assert.equal(inputs.findLast(input=>input.self.id==='vera').self.preferences.items.length,0);
 });
});
test('preferences can be revised, kept and withdrawn without retaining old views in NPC input',async()=>{
 store.install(world());let stage=0;
 await withModel(input=>input.self.id!=='cass'?{}:{preferenceUpdates:stage===0?[preference(input)]:stage===1?[{...preference(input),version:1,text:'現在我比較想用別的方法放鬆。',reason:'我對剛才的體會改觀了。'}]:stage===2||stage===3?[{operation:stage===2?'keep':'withdraw',id:'quiet-tea',version:2,references:[reference(input)],reason:stage===2?'暫時仍保留這個偏好。':'我想放下這個偏好。'}]:[]},async(inputs,advance)=>{
  for(stage=0;stage<5;stage++){
   assert.equal((await advance()).status,200);const saved=(await read()).characters[0];
   if(stage===1||stage===2){assert.equal(saved.preferences.items[0].version,2);assert.equal(saved.preferences.items[0].text,'現在我比較想用別的方法放鬆。');}
   if(stage>=3)assert.equal(saved.preferences.items.length,0);
   if(stage>=2)assert.equal(JSON.stringify(inputs.findLast(input=>input.self.id==='cass')).includes('即使剛才不順利，我仍喜歡茶的香氣。'),false);
  }
  assert.deepEqual((await read()).characters[0].preferences.trace.map(item=>item.operation),['upsert','upsert','keep','withdraw']);
 });
});
test('foreign, stale, hidden and fabricated preference sources or combined update overflow roll back the entire round',async()=>{
 for(const invalid of ['foreign','stale','fabricated','hidden','combined-count']){
  const initial=world();if(invalid==='combined-count')for(const c of initial.characters)c.shortTerm=Array.from({length:4},(_,i)=>({id:`${c.id}-own-${i}`,version:1,time:i,text:'本人可知經歷',source:{kind:'experience'},characterId:c.id}));store.install(initial);const before=await read();let calls=0;
  await withModel(input=>{
   const update=preference(input);calls++;
   if(calls===1)return {preferenceUpdates:[update]};
   if(invalid==='foreign')update.references[0].id=before.characters[0].shortTerm[0].id;
   if(invalid==='stale')update.references[0].version=999;
   if(invalid==='fabricated')update.references[0].id='never-known';
   if(invalid==='hidden')update.references=[{kind:'world',id:'secret-event',version:1}];
   return {preferenceUpdates:[update],...(invalid==='combined-count'?{memorySelections:input.self.shortTerm.slice(0,4).map(item=>({id:item.id,version:item.version,reason:'保留這個經歷'})),cognitiveUpdates:[{kind:'belief',operation:'upsert',id:'extra',version:0,topic:'理解',text:'暫時的理解',conviction:'leaning',contradictions:[],references:[reference(input)],reason:'這次理解'}]}:{})};
  },async(inputs,advance)=>{
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId});assert.equal(response.status,502,invalid);const failure=await response.json();
   const after=await read();assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.events,before.events);assert.equal(after.minute,before.minute);
   assert.deepEqual(await(await advance({operationId})).json(),failure);assert.equal(inputs.length,2);
  });
 }
});
test('save conflicts and uncertain commits preserve preference atomicity and replay the same operation',async()=>{
 for(const fault of ['before','after','conflict']){
  store.install(world());const before=await read();
  await withModel(input=>input.self.id==='cass'?{preferenceUpdates:[preference(input)]}:{},async(inputs,advance)=>{
   if(fault==='before')store.throwBeforeNextSave();
   if(fault==='after')store.throwAfterNextSave();
   if(fault==='conflict')store.conflictOnNextSave();
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId}),result=await response.json(),saved=await read();
   if(fault==='after'){assert.equal(saved.characters[0].preferences.items[0].version,1);assert.deepEqual(await(await advance({operationId})).json(),result);assert.equal(inputs.length,4);}
   else {assert.deepEqual(saved.characters,before.characters);assert.deepEqual(saved.events,before.events);}
  });
 }
});
test('legacy worlds keep missing preferences and temporary interpretation does not create persistent liking',async()=>{
 const initial=world();store.install(initial);assert.equal((await read()).characters[0].preferences,undefined);
 await withModel(()=>({interpretation:'我現在喜歡這樣休息，但沒有選擇保存偏好。'}),async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const after=await read();assert.ok(after.characters.every(character=>character.preferences===undefined));assert.ok(inputs.every(input=>input.self.preferences.items.length===0));
 });
});
test('capacity requires explicit preference withdrawal and bounded observer traces disclose released entries',async()=>{
 const initial=world(),c=initial.characters[0],ref={kind:'short',id:c.shortTerm[0].id,version:c.shortTerm[0].version};
 c.preferences={schemaVersion:1,items:Array.from({length:16},(_,i)=>({id:`saved-${i}`,characterId:c.id,version:1,time:0,topic:`主題${i}`,context:'日常',text:'現行主觀偏愛',references:[ref],reason:'本人經驗'})),trace:Array.from({length:24},(_,i)=>({id:`past-${i}`,version:1,time:0,operation:'withdraw',references:[ref],reason:'已放下'})),droppedTrace:0};
 store.install(initial);let replace=false;
 await withModel(input=>input.self.id==='cass'?{preferenceUpdates:[preference(input),...(replace?[{operation:'withdraw',id:'saved-0',version:1,references:[reference(input)],reason:'我選擇放下這個偏愛，保留新的體會。'}]:[])]}:{},async(inputs,advance)=>{
  assert.equal((await advance()).status,502);assert.equal((await read()).characters[0].preferences.items.length,16);
  replace=true;assert.equal((await advance()).status,200);const prefs=(await read()).characters[0].preferences;
  assert.equal(prefs.items.length,16);assert.ok(prefs.items.some(item=>item.id==='quiet-tea'));assert.equal(prefs.items.some(item=>item.id==='saved-0'),false);assert.equal(prefs.trace.length,24);assert.equal(prefs.droppedTrace,2);
 });
});
test('the same legal world action supports different subjective evaluations and no automatic preference',async()=>{
 store.install(world());
 await withModel(input=>['cass','vera'].includes(input.self.id)?{preferenceUpdates:[{...preference(input),topic:'休息',text:input.self.id==='cass'?'我喜歡這樣安靜休息。':'我不喜歡這樣待著，雖然休息有幫助。'}]}:{},async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const saved=await read();assert.match(saved.characters.find(c=>c.id==='cass').preferences.items[0].text,/喜歡這樣/);assert.match(saved.characters.find(c=>c.id==='vera').preferences.items[0].text,/不喜歡/);assert.equal(saved.characters.find(c=>c.id==='kris').preferences,undefined);assert.equal(inputs.length,4);
 });
});
