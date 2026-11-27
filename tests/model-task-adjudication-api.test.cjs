/* eslint-disable @typescript-eslint/no-require-imports -- #415：世界裁定經模型任務派送；經 route、替身資料庫與腳本模型。 */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {scenario,approval}=require('./routine-program-fixture.cjs');
const origin='https://test.invalid',usage={inputTokens:30,outputTokens:10};
// 不合契約：日常耗時須由整組規則確認，候選自己填了 completionMinutes。
const invalidApproval=()=>({...approval(),completionMinutes:15});
// 合乎契約，但效果指向當前世界沒有的物件，綁定當前世界時才會被拒絕。
const unbindableCandidate=()=>({status:'accepted',completionMinutes:15,effects:[{kind:'state',objectId:'no-such-object',expectedRevision:1,key:'contents',value:'water'}],stages:[],check:null});

// 一位會提出「泡茶」行動的人物：NPC 自主決策仍由 fixture 替換的 fetch 回覆（#417 才改），世界裁定由腳本模型回覆。
async function round({repair=true,judge=()=>approval()}={}){
 const {scriptedModel}=load('scripted-model'),{GET,POST}=load('route'),store=load('store');
 const s=await scenario(),first=await(await GET(new Request(origin+'/api/world'))).json();
 const model=scriptedModel(dispatch=>({reply:judge(model.dispatches.length,dispatch),usage}));
 const id=Date.now()+':'+crypto.randomUUID();
 // 帶操作身分讀取時另附該操作的私有決策實錄；operationScope 用 GET 回應裡的那一個。
 const read=async()=>(await GET(new Request(origin+'/api/world?operationScope='+encodeURIComponent(first.operationScope)+'&operationId='+encodeURIComponent(id)))).json();
 const advance=async()=>{
  const response=await POST(new Request(origin+'/api/world',{method:'POST',headers:{origin,'X-World-Time-Policy':'round-v2'},body:JSON.stringify({operationScope:first.operationScope,worldContext:first.world.contextId,mode:'openai',model:'gpt-6-luna',operation:'advance',minutes:15,operationId:id})}),{modelTransport:model});
  return {status:response.status,body:await response.json()};
 };
 const run=async()=>{
  if(repair)globalThis.__FORMAT_REPAIR__='1';
  try{return await advance();}finally{delete globalThis.__FORMAT_REPAIR__;}
 };
 return {s,store,model,before:first,read,run,advance,restore:()=>{store.onStorage(undefined);s.restore();}};
}
const unchanged=(world,before)=>{const actual=structuredClone(world),expected=structuredClone(before);delete actual.aiUsage;delete expected.aiUsage;assert.deepEqual(actual,expected);};
const tasks=trace=>trace.dispatches.map(dispatch=>dispatch.task+(dispatch.failure?':'+dispatch.failure.kind:''));
const accountCalls=body=>body.accountPlayer.usage.calls;

test('世界裁定的格式修正：模型收到原候選與不合契約的原因後重新回覆一次，修正後的候選綁定成功並隨回合提交，兩次派送都計入用量並留在私有決策實錄',async()=>{
 const r=await round({judge:call=>call===1?invalidApproval():approval()});
 try{
  const result=await r.run();
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(r.s.counts().judgments,0,'世界裁定不再經 fetch 派送');
  assert.equal(r.model.dispatches.length,2);
  const [first,second]=r.model.dispatches;
  assert.equal(first.task,'adjudication');assert.equal(first.actorId,'owner');assert.equal(first.attempt,1);assert.equal(second.attempt,2);
  assert.match(first.label,/^世界裁定（.+的行動）$/);
  assert.equal(first.maxOutputTokens,12000);
  assert.equal(first.messages.length,2);
  assert.equal(first.input.contractVersion,'world-adjudication.v1');
  assert.deepEqual(second.messages.slice(0,2),first.messages);
  assert.equal(second.messages[2].role,'assistant');
  assert.deepEqual(JSON.parse(second.messages[2].content),invalidApproval());
  assert.equal(second.messages[3].role,'user');
  assert.equal(second.input.validationFailed,true);
  assert.equal(second.input.validationError,'日常耗時須由整組規則確認。');
  const after=await r.read();
  // 修正後的候選綁定成功：日常規則隨回合保存。
  assert.equal(after.world.minute,r.before.world.minute+15);
  assert.ok(after.world.routineRules?.length>0);
  // 兩次派送都計次、計費（另一次是 NPC 自主決策）。
  assert.equal(after.world.aiUsage.totalCalls,3);
  assert.equal(accountCalls(after),accountCalls(r.before)+3);
  assert.equal(after.world.aiUsage.inputTokens,90);assert.equal(after.world.aiUsage.outputTokens,30);
  const costs=Object.values(after.world.aiUsage.costs.total).find(cost=>cost.task==='adjudication');
  assert.equal(costs.calls,2);assert.equal(costs.input,60);
  // 兩次派送都留在私有決策實錄，含送出內容與回覆。
  assert.equal(after.decisionTrace.outcome,'committed');
  assert.deepEqual(tasks(after.decisionTrace),['npc','adjudication','adjudication']);
  const [,one,two]=after.decisionTrace.dispatches;
  assert.equal(one.actorId,'owner');
  assert.match(one.requestId,/:owner:adjudication:/);assert.notEqual(one.requestId,two.requestId);
  assert.equal(JSON.parse(one.requestBody).messages.length,2);
  assert.equal(JSON.parse(two.requestBody).messages.length,4);
  assert.equal(JSON.parse(one.rawCandidate).completionMinutes,15);
  assert.equal(JSON.parse(two.rawCandidate).completionMinutes,null);
  const retry=after.decisionTrace.steps.filter(step=>step.kind==='adjudication-format-retry');
  assert.equal(retry.length,1);assert.deepEqual(retry[0].data,{message:'日常耗時須由整組規則確認。'});
  // 有對象人物的任務照舊留操作證據。
  assert.equal(result.body.operationEvidence.counts.adjudication,2);
  assert.equal(result.body.operationEvidence.dispatches.filter(dispatch=>dispatch.task==='adjudication'&&dispatch.actorId==='owner').length,2);
  // 同一操作身分重送時回放原結果，不再派送。
  assert.equal((await r.advance()).status,200);
  assert.equal(r.model.dispatches.length,2);
 }finally{r.restore();}
});

test('修正後仍不合契約時整回合回復：回合失敗且世界維持推進前的樣子，兩次派送都計入用量',async()=>{
 const r=await round({judge:()=>invalidApproval()});
 try{
  const result=await r.run();
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.equal(result.body.error,'日常耗時須由整組規則確認。');
  assert.equal(r.model.dispatches.length,2);
  const after=await r.read();
  unchanged(after.world,r.before.world);
  assert.equal(after.world.aiUsage.totalCalls,3);
  assert.equal(accountCalls(after),accountCalls(r.before)+3);
  assert.equal(after.decisionTrace.outcome,'rolled-back');
  assert.deepEqual(tasks(after.decisionTrace),['npc','adjudication','adjudication']);
  const failure=after.decisionTrace.steps.find(step=>step.kind==='round-failure');
  assert.equal(failure.data.validation.reason,'candidate_format');
  // 失敗收據留的是最後一份候選。
  assert.equal(JSON.parse(result.body.adjudicationFailure.candidate).completionMinutes,15);
  assert.equal(result.body.adjudicationFailure.stage,'parse');
 }finally{r.restore();}
});

test('綁定當前世界失敗時不重問：裁定候選合乎契約但無法綁定當前世界的對象，世界裁定只派送一次',async()=>{
 const r=await round({judge:()=>unbindableCandidate()});
 try{
  const result=await r.run();
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.equal(result.body.error,'裁定物件前提無效。');
  assert.equal(result.body.adjudicationFailure.stage,'effects');
  assert.equal(result.body.adjudicationFailure.validation.reason,'object_precondition');
  assert.equal(r.model.dispatches.length,1);
  const after=await r.read();
  unchanged(after.world,r.before.world);
  assert.equal(after.world.aiUsage.totalCalls,2);
  assert.deepEqual(tasks(after.decisionTrace),['npc','adjudication']);
  assert.equal(after.decisionTrace.steps.some(step=>step.kind==='adjudication-format-retry'),false);
 }finally{r.restore();}
});

test('未開啟格式修正時只派送一次：候選不合契約，回合失敗且已付用量保留',async()=>{
 const r=await round({repair:false,judge:()=>invalidApproval()});
 try{
  const result=await r.run();
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.equal(result.body.error,'日常耗時須由整組規則確認。');
  assert.equal(r.model.dispatches.length,1);
  const after=await r.read();
  unchanged(after.world,r.before.world);
  assert.equal(after.world.aiUsage.totalCalls,2);
  assert.equal(accountCalls(after),accountCalls(r.before)+2);
  assert.equal(after.world.aiUsage.inputTokens,60);
  assert.equal(after.decisionTrace.steps.some(step=>step.kind==='adjudication-format-retry'),false);
 }finally{r.restore();}
});

test('沒有送出的請求不計入用量：世界裁定在送出前因派送預留失敗而停下，重讀世界時世界內用量的呼叫次數沒有因這次世界裁定增加',async()=>{
 const r=await round();
 try{
  // 帳號帳本的派送預留是送出前的最後一關；讓世界裁定的那一筆寫入失敗。
  r.store.onStorage((sql,values)=>{if(sql.startsWith('INSERT OR IGNORE INTO player_dispatches')&&String(values[2]).includes(':adjudication:'))throw Error('fixture reservation unavailable');});
  const result=await r.run();
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.equal(result.body.error,'fixture reservation unavailable');
  assert.equal(r.model.dispatches.length,0,'世界裁定沒有送出');
  r.store.onStorage(undefined);
  const after=await r.read();
  unchanged(after.world,r.before.world);
  // 只有 NPC 自主決策那一次。
  assert.equal(after.world.aiUsage.totalCalls,1);
  assert.equal(after.world.aiUsage.calls,1);
  assert.equal(Object.values(after.world.aiUsage.costs.total).some(cost=>cost.task==='adjudication'),false);
  assert.equal(accountCalls(after),accountCalls(r.before)+1);
 }finally{r.restore();}
});

test('世界裁定寫決策實錄超過工作期限：工作期限到達時回合失敗並回復原狀、不等實錄寫完，已付用量保留',async()=>{
 const r=await round(),originalTimeout=AbortSignal.timeout;
 const deadlines=[];let release,held=false,finished=false,movedOn=false;
 const written=new Promise(resolve=>{release=resolve;});
 // 工作期限由測試控制；租約與 HTTP 回應的期限（較長）維持原樣。
 AbortSignal.timeout=ms=>{if(ms>610000)return originalTimeout(ms);const controller=new AbortController();deadlines.push(controller);return controller.signal;};
 r.store.onStorage(async(sql,values)=>{
  const traceWrite=sql.startsWith('INSERT INTO decision_traces')||sql.startsWith('UPDATE decision_traces');
  if(!held&&traceWrite&&JSON.parse(values[sql.startsWith('INSERT')?5:0]).dispatches.find(dispatch=>dispatch.task==='adjudication')?.stage==='received'){
   // 世界裁定收到回覆後的這次實錄寫入卡住；等用量結算完，工作期限到達，寫入仍未完成。
   // 寫入卡住期間若還有別的資料庫存取，代表回合沒有等它、已經往下收尾。
   held=true;
   await new Promise(resolve=>setTimeout(resolve,150));
   for(const controller of deadlines)controller.abort(new DOMException('工作期限已到期。','TimeoutError'));
   setTimeout(release,1500);
   await written;
   finished=true;
  }else if(held&&!finished&&deadlines.some(controller=>controller.signal.aborted)){movedOn=true;finished=true;release();}
 });
 try{
  const result=await r.run();
  assert.equal(held,true,'實錄寫入確實卡住過');
  assert.equal(movedOn,true,'工作期限到達後回合繼續收尾，沒有等實錄寫完');
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.equal(result.body.error,'模型回應逾時，本回合沒有推進。呼叫次數已記錄。');
  assert.equal(r.model.dispatches.length,1);
 }finally{AbortSignal.timeout=originalTimeout;r.store.onStorage(undefined);}
 try{
  const after=await r.read();
  unchanged(after.world,r.before.world);
  assert.equal(after.world.aiUsage.totalCalls,2);
  assert.equal(after.world.aiUsage.inputTokens,60);assert.equal(after.world.aiUsage.outputTokens,20);
  assert.equal(accountCalls(after),accountCalls(r.before)+2);
 }finally{r.restore();}
});
