/* eslint-disable @typescript-eslint/no-require-imports -- Controlled transport at the real decision boundary. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=load('world'),{aiDecision}=load('models');
const {decision}=require('./pursuit-selection-fixture.cjs');
const fixturePath=path.join(__dirname,'fixtures/npc-input-before-235.json.gz');

async function sample(variant,provider='openai'){
 const w=seedWorld();w.pursuitContext='npc-input-equivalence-fixed-context';const c=w.characters.find(c=>c.id==='owner');c.control={mode:'autonomous'};c.memories=[];
 c.shortTerm=Array.from({length:variant==='escaped'?80:3},(_,i)=>({id:`owner:short:${i}`.padEnd(128,'x'),characterId:c.id,version:i+1,time:i,text:variant==='escaped'?'"\\'.repeat(120):`自己的主觀經歷 ${i}`,source:{kind:'experience'}}));
 c.longTerm=Array.from({length:variant==='escaped'?0:12},(_,i)=>({id:`owner:long:${i}`,characterId:c.id,version:1,time:i,text:`據說是自己的印象 ${i}。`+'甲'.repeat(300),source:{kind:'experience'},origin:{id:`old:${i}`,version:1},reason:'私人理由不得回灌'}));
 if(variant==='cues'){
  const item={id:'owner:arrangement',characterId:c.id,version:1,status:'active',text:'想起自己的安排',condition:{kind:'time',minute:1200},time:1100,memory:{id:'owner:arr-source',version:1},references:[]};
  c.arrangements={schemaVersion:1,items:[item]};c.shortTerm.push({id:item.memory.id,characterId:c.id,version:1,time:1100,text:load('arrangements').arrangementExperience(item),source:{kind:'experience'}});
 }
 if(variant==='overlimit')c.personality='無法省略的角色設定'.repeat(5000);
 const recall=variant.endsWith('recall');
 const bodies=[];const fetcher=async(_url,init)=>{const body=JSON.parse(init.body);bodies.push(body);const input=JSON.parse(body.messages[1].content),value=recall&&bodies.length===1?{type:'recall',questions:['以前的印象？']}:decision(input);return Response.json({choices:[{message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:1,completion_tokens:1}});};
 try{
  const result=await aiDecision(w,c,'fixture-secret','gpt-6-luna',provider,fetcher,undefined,recall?{enabled:true,signal:()=>AbortSignal.timeout(25000),beforeContinuation:async()=>{},search:async()=>variant==='empty-recall'?[]:[c.longTerm[11]]}:undefined);
  return {bodies,result};
 }catch(error){if(variant!=='overlimit')throw error;return {bodies,error:error.message};}
}

test('fixed decisions preserve the exact pre-refactor provider transcript, schema, receipts and accepted result',async()=>{
 const actual={};for(const variant of ['ordinary','escaped','cues','recall','empty-recall','overlimit'])for(const provider of ['openai','openrouter'])actual[`${variant}:${provider}`]=await sample(variant,provider);
 // Full, lossless pre-refactor output; compression only reduces repository size.
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(fixturePath))));
});

test('the complete preparation entry returns the final request and only its actual reference scope without writing the world',()=>{
 const {prepareNpcDecision}=load('npc-decision-preparation');const {modelRequestBody}=load('model-adapter');
 const w=seedWorld(),c=w.characters.find(c=>c.id==='owner');w.pursuitContext='preparation-contract';c.control={mode:'autonomous'};
 c.shortTerm=[{id:'shown',characterId:c.id,version:3,time:1,text:'自己的經歷',source:{kind:'experience'}}];
 const before=JSON.stringify(w),messages=[{role:'system',content:'固定系統訊息'},{role:'user',content:''}];
 const prepared=prepareNpcDecision(w,c,{model:'gpt-6-luna',provider:'openai',modelKey:'openai:gpt-6-luna',allowedTypes:['rest','propose'],messages});
 assert.deepEqual(JSON.parse(prepared.messages[1].content),JSON.parse(JSON.stringify(prepared.input)));
 assert.deepEqual(prepared.context.visible.shortTerm,c.shortTerm);
 assert.deepEqual(prepared.context.visible.longTerm.map(m=>({id:m.id,version:m.version})),prepared.input.self.longTerm.map(m=>({id:m.id,version:m.version})));
 assert.deepEqual(prepared.context.phoneReferences,prepared.input.phones);
 assert.deepEqual(prepared.phoneNotificationReceipts,prepared.input.self.noticeOpportunities.map(n=>n.id));
 assert.ok(Buffer.byteLength(modelRequestBody({model:'gpt-6-luna',provider:'openai'},prepared.messages,prepared.schema))<164000);
 assert.equal(JSON.stringify(w),before);
});
