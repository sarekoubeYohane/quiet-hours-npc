/* eslint-disable @typescript-eslint/no-require-imports -- Controlled transport at the real decision boundary. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=load('world'),{aiDecision}=load('models');
const {decision}=require('./pursuit-selection-fixture.cjs');
const fixturePath=path.join(__dirname,'fixtures/npc-input-before-235.json.gz');
const fieldRule='最終決策的每一層都只輸出本次 schema 定義的欄名，拼寫須完全相同。未定義的欄位一律省略，即使值是 null 也要省略整個鍵。';

// Keep the historical captures intact and account for the intentional system prompt addition.
function expectedTranscripts(file, {includeLayout=true} = {}) {
 const expected=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(file)));
 const layout=[
  '輸出 JSON 時請核對欄位層級。以下是路徑說明，其他欄位照既有契約填寫。',
  'action 只含 type、target、content、purpose。reconfirmBodyConsequences 填在最外層，與 action 同層，使用布林值。',
  'methodAssessment.selectedAction 只含 type、target。methodAssessment.intentIds 與 selectedAction 同層，填當次焦點 ID 的陣列，無焦點填 []。',
].join('\n');
 const addition=(includeLayout ? '\n\n'+layout : '')+'\n'+fieldRule;
 for (const {bodies} of Object.values(expected)) {
  for (const body of bodies) body.messages[0].content += addition;
 }
 return expected;
}

async function sample(variant,provider='openai'){
 const w=seedWorld();w.pursuitContext='npc-input-equivalence-fixed-context';const c=w.characters.find(c=>c.id==='owner');c.control={mode:'autonomous'};c.memories=[];
 c.shortTerm=Array.from({length:variant.startsWith('escaped')?80:variant==='overflow-recall'?80:3},(_,i)=>({id:`owner:short:${i}`.padEnd(128,'x'),characterId:c.id,version:i+1,time:i,text:variant.startsWith('escaped')?'"\\'.repeat(120):variant==='overflow-recall'?'甲'.repeat(210):`自己的主觀經歷 ${i}`,source:{kind:'experience'}}));
 c.longTerm=Array.from({length:variant==='escaped'?0:variant==='overflow-recall'?8:12},(_,i)=>({id:`owner:long:${i}`,characterId:c.id,version:1,time:i,text:`據說是自己的印象 ${i}。`+'甲'.repeat(variant==='overflow-recall'?1250:300),source:{kind:'experience'},origin:{id:`old:${i}`,version:1},reason:'私人理由不得回灌'}));
 if(variant==='cues'){
  const item={id:'owner:arrangement',characterId:c.id,version:1,status:'active',text:'想起自己的安排',condition:{kind:'time',minute:1200},time:1100,memory:{id:'owner:arr-source',version:1},references:[]};
  c.arrangements={schemaVersion:1,items:[item]};c.shortTerm.push({id:item.memory.id,characterId:c.id,version:1,time:1100,text:load('arrangements').arrangementExperience(item),source:{kind:'experience'}});
 }
 if(variant==='overlimit')c.personality='無法省略的角色設定'.repeat(5000);
 const recall=variant.endsWith('recall');
 const bodies=[];const fetcher=async(_url,init)=>{const body=JSON.parse(init.body);bodies.push(body);const input=JSON.parse(body.messages[1].content),value=recall&&bodies.length===1?{type:'recall',questions:['以前的印象？']}:decision(input);return Response.json({choices:[{message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:1,completion_tokens:1}});};
 try{
  const result=await aiDecision(w,c,'fixture-secret','gpt-6-luna',provider,fetcher,undefined,recall?{enabled:true,signal:()=>AbortSignal.timeout(25000),beforeContinuation:async()=>{},search:async()=>variant==='empty-recall'?[]:variant==='invalid-recall'?[{...c.longTerm[0],version:99}]:variant==='overflow-recall'?c.longTerm:[c.longTerm[11]]}:undefined);
  return {bodies,result};
 }catch(error){if(!['overlimit','invalid-recall','overflow-recall'].includes(variant))throw error;return {bodies,error:error.message};}
}

// The transport now supplies the final decision schema alongside the optional
// recall branch. Keep comparing every other historical byte, including the
// continuation and the caller-visible result.
function beforeRecallContract(samples) {
 const prior=structuredClone(samples);
 for(const [variant,sample] of Object.entries(prior)){
  if(!variant.split(':')[0].endsWith('recall') || !sample.bodies.length)continue;
  const message=sample.bodies[0].messages[0];
  const boundary=message.content.indexOf('\n\n本次可直接做最終決定');
  assert.ok(boundary>0);
  const schema=JSON.parse(message.content.slice(boundary).split('\n').at(-1));
  assert.ok(schema.required.includes('pursuitSelection'));
  message.content=message.content.slice(0,boundary);
 }
 return JSON.parse(JSON.stringify(prior));
}

test('fixed decisions preserve the exact pre-refactor provider transcript, schema, receipts and accepted result',async()=>{
 const actual={};for(const variant of ['ordinary','escaped','cues','recall','empty-recall','overlimit'])for(const provider of ['openai','openrouter'])actual[`${variant}:${provider}`]=await sample(variant,provider);
 // Full, lossless pre-refactor output; compression only reduces repository size.
 assert.deepEqual(beforeRecallContract(actual),expectedTranscripts(fixturePath));
});

test('test-site dispatch uses v0.2.4 for the first decision and recall continuation, scoped to test',async()=>{
 const {env}=load('cloudflare-workers'), previous=env.APP_ENV;
 const {assemble,draftPath}=require('../tooling/experiments/npc-prompt-trial/assemble.cjs');
 const draft=fs.readFileSync(draftPath,'utf8');
 globalThis.__TEST_NPC_PROMPT__=draft;
 try {
  const environment=async()=> (await (await load('environment-route').GET()).json()).npcDecisionPrompt;
  for(const provider of ['openai','openrouter']){
   env.APP_ENV='production';
   assert.equal(await environment(),undefined);
   const legacy=await sample('recall',provider);
   env.APP_ENV='test';
   assert.equal(await environment(),'v0.2.4');
   const trial=await sample('recall',provider);
   assert.deepEqual(trial.result,legacy.result);
   assert.equal(trial.bodies.length,2);
   for(const [index,body] of trial.bodies.entries()){
    const source=JSON.parse(legacy.bodies[index].messages[1].content);
    const {text}=assemble(source,source.self,{draft,recall:index===0});
    assert.match(text,/^# 你是誰/);
    assert.ok(text.endsWith('無焦點填 []。'));
    assert.equal(text.includes('## 回想\n'),index===0);
    assert.doesNotMatch(legacy.bodies[index].messages[0].content,/^# 你是誰/);
    delete source.self.personality;
    delete source.self.goal;
    const expected=structuredClone(legacy.bodies[index]);
    const boundary=expected.messages[0].content.indexOf('\n'+fieldRule);
    assert.ok(boundary>0);
    expected.messages[0].content=text+expected.messages[0].content.slice(boundary);
    expected.messages[1].content=JSON.stringify(source);
    assert.deepEqual(body,expected);
   }
  }
 } finally { env.APP_ENV=previous; delete globalThis.__TEST_NPC_PROMPT__; }
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

test('recall under escape pressure preserves bounded projections, continuation and invalid or mandatory-overflow outcomes',async()=>{
 const actual={};for(const variant of ['escaped-recall','invalid-recall','overflow-recall'])for(const provider of ['openai','openrouter'])actual[`${variant}:${provider}`]=await sample(variant,provider);
 const file=path.join(__dirname,'fixtures/npc-input-recall-pressure.json.gz');
 assert.deepEqual(beforeRecallContract(actual),expectedTranscripts(file,{includeLayout:false}));
 for(const sample of Object.values(actual))for(const body of sample.bodies)assert.ok(Buffer.byteLength(JSON.stringify(body))<164000);
});

test('recall preparation pins a newly remembered source and produces one coherent final request without writing the world',()=>{
 const {prepareNpcDecision}=load('npc-decision-preparation');
 const w=seedWorld(),c=w.characters.find(c=>c.id==='owner');w.pursuitContext='recall-preparation-contract';c.control={mode:'autonomous'};c.memories=[];
 c.shortTerm=Array.from({length:80},(_,i)=>({id:`short-${i}`,characterId:c.id,version:1,time:0,text:'x'.repeat(600),source:{kind:'experience'}}));
 c.longTerm=Array.from({length:64},(_,i)=>({id:`long-${i}`,characterId:c.id,version:1,time:0,text:i===63?'回想完整獨有正文'+'y'.repeat(680):'y'.repeat(700),source:{kind:'experience',person:'remembered-person'},origin:{id:`old-${i}`,version:1},reason:'private reason'}));
 const before=JSON.stringify(w),messages=[{role:'system',content:'固定系統訊息'},{role:'user',content:''}];
 const options={model:'gpt-6-luna',provider:'openai',modelKey:'openai:gpt-6-luna',allowedTypes:['rest','propose'],messages};
 const initial=prepareNpcDecision(w,c,options);assert.equal(initial.input.self.longTerm.some(m=>m.id==='long-63'),false);
 const memory={id:'long-63',version:1,text:c.longTerm[63].text,source:{kind:'experience',person:'remembered-person'}};
 const continuation=initial.prepareRecall([memory]);
 messages.push({role:'assistant',content:'{"type":"recall","questions":["過去？"]}'},{role:'user',content:'{"recalledMemories":[{"id":"long-63","version":1}],"recallComplete":true}'});
 const final=prepareNpcDecision(w,c,{...options,continuation,allowRecall:false});
 assert.deepEqual(final.context.visible.longTerm.map(m=>`${m.id}:${m.version}`).sort(),final.input.self.longTerm.map(m=>`${m.id}:${m.version}`).sort());
 assert.ok(final.context.visible.longTerm.some(m=>m.id==='long-63'));
 assert.ok(final.context.knownPeople.includes('remembered-person'));
 assert.deepEqual(final.input.self.longTerm.find(m=>m.id==='long-63'),memory);
 assert.equal(messages.map(m=>m.content).join('').split(memory.text).length-1,1);
 assert.deepEqual(JSON.parse(final.messages[1].content),JSON.parse(JSON.stringify(final.input)));
 assert.equal(JSON.stringify(w),before);
});
