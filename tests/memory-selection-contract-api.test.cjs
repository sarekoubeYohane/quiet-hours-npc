/* eslint-disable @typescript-eslint/no-require-imports -- World API and provider boundary fixtures. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const Ajv=createRequire(require.resolve('eslint'))('ajv');
const build=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {seedWorld}=build('world'),{GET,POST}=build('route'),store=build('store');
const aiWorld=require('./fixtures/ai-world.cjs')(seedWorld);
const req=b=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',...b})});
const read=async()=>(await(await GET()).json()).world;
const action={type:'reflect',target:'',content:'想一想。',mood:'平靜',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],interpretation:''};
function fixture(count=2){const w=aiWorld();for(const c of w.characters)c.control={mode:'taken-over'};const c=w.characters[0];c.control={mode:'autonomous'};c.memories=[];c.shortTerm=Array.from({length:count},(_,i)=>({id:`short-${i}`,characterId:c.id,version:i+1,time:i,text:`自己的經歷${i}`,source:{kind:'experience'}}));c.longTerm=[{id:'long-only',characterId:c.id,version:3,time:0,text:'可能聽過的事',source:{kind:'experience'},origin:{id:'past',version:1},reason:'在意'}];store.install(w);return w;}
async function run(choose,check,mode='openai'){const old=global.fetch,requests=[];global.fetch=async(_url,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);requests.push(body);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({...action,...choose(input,body)})}}]});};try{await POST(req({operation:'set-model-key',mode:'openai',key:'fixture-key'}));if(mode!=='openai')await POST(req({operation:'set-model-key',mode,key:'fixture-key'}));await check({requests,advance:b=>POST(req({operation:'advance',mode,model:'gpt-6-luna',minutes:15,...b}))});}finally{global.fetch=old;}}
function accepts(body,value){return new Ajv({strict:false}).compile(body.response_format.json_schema.schema.properties.memorySelections)(value);}
test('actual strict outbound schema accepts only paired visible short references and legal selection survives SQLite reread/replay',async()=>{
 fixture();await run(input=>({memorySelections:[{id:input.self.shortTerm[0].id,version:1,reason:'想留住'}]}),async({requests,advance})=>{
 const operationId=`${Date.now()}:${crypto.randomUUID()}`,r=await advance({operationId});assert.equal(r.status,200);const result=await r.json(),body=requests[0];
 assert.equal(accepts(body,[]),true);assert.equal(accepts(body,[{id:'short-0',version:1,reason:'重要'}]),true);assert.equal(accepts(body,[{id:'short-1',version:2,reason:'重要'}]),true);
 for(const ref of [{id:'long-only',version:3},{id:'unknown',version:1},{id:'foreign',version:1},{id:'short-0',version:2},{id:'short-1',version:1}])assert.equal(accepts(body,[{...ref,reason:'重要'}]),false,JSON.stringify(ref));
 const c=(await read()).characters[0];assert.equal(c.longTerm.length,2);assert.equal(c.longTerm[1].text,'自己的經歷0');assert.deepEqual(c.longTerm[1].origin,{id:'short-0',version:1});assert.deepEqual(c.longTerm[1].source,{kind:'experience'});
 assert.deepEqual(await(await advance({operationId})).json(),result);assert.equal(requests.length,1);assert.deepEqual((await read()).characters[0].longTerm,c.longTerm);
 });
});
test('empty and maximum eighty short-term choices remain bounded, optional and paired after input cropping',async()=>{
 for(const count of [0,80]){
  const w=fixture(count),c=w.characters[0];if(count){c.shortTerm.forEach((m,i)=>{m.id=m.id.padEnd(128,'x');m.version=Number.MAX_SAFE_INTEGER-i;m.text='甲'.repeat(160);});c.longTerm=Array.from({length:58},(_,i)=>({...c.longTerm[0],id:`long-${i}`,text:'乙'.repeat(280),origin:{id:`past-${i}`,version:1}}));store.install(w);}
  await run(()=>({}),async({requests,advance})=>{assert.equal((await advance()).status,200);const body=requests[0],input=JSON.parse(body.messages[1].content);
   assert.equal(input.self.shortTerm.length,count);assert.equal(accepts(body,[]),true);
   assert.equal(accepts(body,[{id:'unknown',version:1,reason:'重要'}]),false);
   if(count){assert.ok(input.self.longTerm.length<58);for(const ref of input.self.shortTerm)assert.equal(accepts(body,[{id:ref.id,version:ref.version,reason:'重要'}]),true);assert.equal((await read()).characters[0].longTerm.length,58);assert.equal((await read()).characters[0].shortTerm.some(m=>m.id==='short-1'.padEnd(128,'x')),true);}
   assert.ok(Buffer.byteLength(JSON.stringify(body))<160000);console.info('selection schema fixture bytes', {count,schema:Buffer.byteLength(JSON.stringify(body.response_format.json_schema.schema)),request:Buffer.byteLength(JSON.stringify(body))});assert.equal((await read()).turn,1);
  });
 }
});
test('provider substitutes cannot bypass paired selection validation or partially commit an earlier NPC',async()=>{
 for(const invalid of ['long','unknown','foreign','version','swapped']){
  const w=fixture();w.characters[1].control={mode:'autonomous'};store.install(w);const before=await read();
  await run(input=>{if(input.self.id===before.characters[0].id)return {memorySelections:[{id:'short-0',version:1,reason:'想留住'}]};const ref=invalid==='long'?{id:'long-only',version:3}:invalid==='unknown'?{id:'never-visible',version:1}:invalid==='foreign'?{id:'short-0',version:1}:invalid==='version'?{id:input.self.shortTerm[0].id,version:999}:{id:'short-1',version:1};return {memorySelections:[{...ref,reason:'想留住'}]};},async({advance,requests})=>{
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,r=await advance({operationId});assert.equal(r.status,502);const failure=await r.json(),after=await read();const world=structuredClone(after),original=structuredClone(before);delete world.aiUsage;delete original.aiUsage;assert.deepEqual(world,original);assert.equal(after.aiUsage.totalCalls,2);assert.equal(after.aiUsage.totalInputTokens,20);assert.deepEqual(await(await advance({operationId})).json(),failure);assert.equal(requests.length,2);
  });
 }
});

test('OpenRouter unconstrained generation still rejects illegal selection and keeps legal empty selection optional',async()=>{
 for(const source of ['empty','long']){fixture();await run(()=>({memorySelections:source==='empty'?[]:[{id:'long-only',version:3,reason:'想留住'}]}),async({advance,requests})=>{const response=await advance();assert.equal(response.status,source==='empty'?200:502);assert.equal(requests[0].response_format,undefined);assert.equal(requests.length,1);assert.equal((await read()).characters[0].longTerm.length,1);},'ai');}
});
