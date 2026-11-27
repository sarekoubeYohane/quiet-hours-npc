/* eslint-disable @typescript-eslint/no-require-imports -- #414：其餘製作工作經模型任務派送；經 route、替身資料庫與腳本模型。 */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const origin='https://test.invalid',owner='test-owner',workspace='/api/world?workspace=account';
const operationId=()=>Date.now()+':'+crypto.randomUUID();
const usage={inputTokens:20,outputTokens:10};
const fields={name:'柳生',appearance:'深色外套',personality:'安靜',abilities:'沒有特殊設定',background:'在河畔跟長輩學修鐘',initialMemories:'雨停了',beliefs:'重視承諾',preferences:'沒有特殊設定',directions:'找到老鐘',startLocation:''};

// 帳號製作操作空間：已保存 Key 與裁定模型。回傳經各 route 讀寫的工具。
async function account(){
 const routes={'/api/world':load('route'),'/api/character-drafts':load('character-drafts-route'),'/api/character-drafts/form':load('character-form-route'),'/api/character-cards':load('character-cards-route'),'/api/opening-drafts':load('opening-drafts-route'),'/api/opening-drafts/arrange':load('opening-arrange-route'),'/api/scene-templates':load('scene-templates-route')};
 const store=load('store');store.install(load('world').seedWorld());
 const request=async(target,payload,services)=>{
  const route=routes[target.split('?')[0]];
  const response=payload===undefined?await route.GET(new Request(origin+target)):await route.POST(new Request(origin+target,{method:'POST',headers:{origin,'Content-Type':'application/json','X-World-Time-Policy':'round-v2'},body:JSON.stringify(payload)}),services);
  return {status:response.status,body:await response.json()};
 };
 const ok=async(target,payload,services)=>{const result=await request(target,payload,services);assert.ok(result.status>=200&&result.status<300,JSON.stringify(result));return result.body;};
 const scope=await ok(workspace);
 await ok(workspace,{operationScope:scope.operationScope,operation:'set-model-key',mode:'openai',key:'controlled-authoring-key'});
 // 製作操作：帶上帳號操作空間的原始身分。
 const operate=(body,services)=>request(workspace,{operationScope:scope.operationScope,worldContext:scope.world.contextId,mode:'demo',...body},services);
 assert.equal((await operate({operation:'set-adjudication',operationId:operationId(),adjudication:{provider:'openai',model:'gpt-6.1-sol'}})).status,200);
 // 帶操作身分讀取時，回應另附該操作的私有決策實錄；operationScope 用 GET 回應裡的那一個。
 const read=async id=>ok(workspace+(id?'&operationId='+encodeURIComponent(id)+'&operationScope='+encodeURIComponent(scope.operationScope):''));
 // 草稿 route 建立待恢復紀錄後立刻自己派送；讓它在受理前讀取失敗，紀錄留著、操作尚未受理。
 const leavePending=async(target,payload)=>{store.failNextOperationRead();const result=await request(target,payload);assert.equal(result.status,502,JSON.stringify(result));return result.body;};
 return {store,scope,request,ok,operate,read,leavePending};
}

// 這次派送在帳號累計用量與私有決策實錄留下的紀錄。
async function dispatched(a,before,id,task){
 const after=await a.read(id);
 assert.equal(after.accountPlayer.usage.calls,before.accountPlayer.usage.calls+1);
 assert.equal(after.accountPlayer.usage.inputTokens,before.accountPlayer.usage.inputTokens+usage.inputTokens);
 assert.equal(after.accountPlayer.usage.outputTokens,before.accountPlayer.usage.outputTokens+usage.outputTokens);
 assert.equal(after.decisionTrace.dispatches.length,1);
 const [dispatch]=after.decisionTrace.dispatches;
 assert.equal(dispatch.task,'adjudication');
 assert.equal(dispatch.requestId,id+':'+task);
 return {after,dispatch};
}

const generation=id=>({operation:'generate-character-template',operationId:id,characterGeneration:{description:'她在河邊長大。',fields:{...fields,background:'',directions:''}}});

test('人物欄位補寫：補寫結果隨回應交回，帳號累計用量增加一次派送，私有決策實錄有這次派送',async()=>{
 const {scriptedModel}=load('scripted-model');
 const a=await account(),before=await a.read(),id=operationId();
 const model=scriptedModel(()=>({reply:{background:'在河邊跟長輩學修鐘。',directions:'修好鎮上的老鐘'},usage}));
 const result=await a.operate(generation(id),{modelTransport:model});
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.deepEqual(result.body.generatedCharacter,{...fields,background:'在河邊跟長輩學修鐘。',directions:'修好鎮上的老鐘'});
 assert.equal(model.dispatches.length,1);
 const [seen]=model.dispatches;
 assert.equal(seen.task,'character-generation');
 assert.equal(seen.label,'人物欄位補寫');
 assert.equal(seen.maxOutputTokens,4096);
 assert.deepEqual(seen.input.blank,['background','directions','startLocation']);
 const {dispatch}=await dispatched(a,before,id,'character-generation');
 assert.match(JSON.parse(dispatch.requestBody).messages.at(-1).content,/她在河邊長大/);
 assert.equal(JSON.parse(dispatch.rawCandidate).directions,'修好鎮上的老鐘');
 // 同一操作身分重送時回放原結果，不再派送。
 const again=await a.operate(generation(id),{modelTransport:model});
 assert.deepEqual(again.body.generatedCharacter,result.body.generatedCharacter);
 assert.equal(model.dispatches.length,1);
});

test('預算用完時製作工作不派送：回應說明預算已達上限，帳號的累計用量沒有增加',async()=>{
 const {scriptedModel}=load('scripted-model');
 const a=await account();
 const first=scriptedModel(()=>({reply:{background:'河邊',directions:'修鐘'},usage}));
 assert.equal((await a.operate(generation(operationId()),{modelTransport:first})).status,200);
 const spent=(await a.read()).accountPlayer.usage;
 assert.equal((await a.operate({operation:'set-budget',operationId:operationId(),limits:{calls:spent.calls,tokens:10000000}})).status,200);
 const before=await a.read();
 const model=scriptedModel(()=>({reply:{background:'河邊',directions:'修鐘'},usage}));
 const result=await a.operate(generation(operationId()),{modelTransport:model});
 assert.equal(result.status,429,JSON.stringify(result.body));
 assert.match(result.body.error,/已達玩家 AI 用量上限/);
 assert.equal(result.body.limitReached,true);
 assert.equal(model.dispatches.length,0);
 assert.deepEqual((await a.read()).accountPlayer.usage,before.accountPlayer.usage);
});

// 人物卡判讀：形成 route 第一次在受理前失敗，再以同一操作身分經 world route 帶腳本模型送出，最後由形成 route 回放並形成數值。
async function assessCard(a,reply={bonuses:[{target:'strength',source:'background',quote:'在河畔跟長輩學修鐘',substantive:false}]}){
 const {scriptedModel}=load('scripted-model');
 const draft=(await a.ok('/api/character-drafts',{id:crypto.randomUUID(),version:0,concept:'修鐘的人',fields,accountScope:a.scope.operationScope})).draft;
 const input={id:draft.id,version:draft.version,operationId:operationId(),operationScope:a.scope.operationScope,worldContext:a.scope.world.contextId};
 await a.leavePending('/api/character-drafts/form',input);
 const before=await a.read(),model=scriptedModel(()=>({reply,usage}));
 const sent=await a.operate({operation:'assess-character-card',operationId:input.operationId,target:draft.id},{modelTransport:model});
 assert.equal(sent.status,200,JSON.stringify(sent.body));
 const formed=(await a.ok('/api/character-drafts/form',input)).draft;
 return {input,before,model,sent,formed};
}

test('人物卡判讀：判讀結果用來形成數值，帳號累計用量增加一次派送，私有決策實錄只留這次派送的收據',async()=>{
 const a=await account();
 const {input,before,model,sent,formed}=await assessCard(a);
 assert.equal(model.dispatches.length,1);
 const [seen]=model.dispatches;
 assert.equal(seen.task,'card-assessment');
 assert.equal(seen.label,'人物卡判讀');
 assert.equal(seen.maxOutputTokens,2048);
 assert.equal(seen.input.task,'character-card-assessment-v1');
 // 有背景獎勵的屬性下限是 8，沒有的是 3：判讀結果確實被保存並用來形成。
 assert.equal(formed.formation.minimums.strength,8);
 assert.equal(formed.formation.minimums.endurance,3);
 assert.equal(formed.pendingFormation,undefined);
 const {after,dispatch}=await dispatched(a,before,input.operationId,'card-assessment');
 // 判讀內容不給使用者看：回應、讀取到的實錄與保存的實錄都沒有送出內容與回覆。
 assert.ok(!JSON.stringify([sent.body.operationEvidence,after.decisionTrace,formed]).includes('bonuses'));
 assert.equal(dispatch.requestBody,undefined);
 const saved=await load('decision-traces').readDecisionTrace(a.store.database(),a.scope.operationScope,input.operationId);
 assert.equal(saved.dispatches.length,1);
 for(const key of ['requestBody','responseBody','rawCandidate'])assert.equal(saved.dispatches[0][key],undefined,key);
 assert.deepEqual(saved.dispatches[0].usage,usage);
});

// 一份選了一位人物、數個場所的開局草稿。
async function openingDraft(a,placeIds=['home'],extra={}){
 const {formed}=await assessCard(a,{bonuses:[]});
 const card=(await a.ok('/api/character-cards',{id:formed.id,version:formed.version,operationScope:a.scope.operationScope})).card;
 const scene=(await a.ok('/api/scene-templates',{accountScope:a.scope.operationScope,id:crypto.randomUUID(),version:0,name:'工房',note:'',rooms:[{id:'front',name:'工作間'}],objects:[],connections:[]})).template;
 const city={places:placeIds.map(id=>({id,templateId:scene.id,version:scene.version,name:id})),characters:[{templateId:card.id,version:card.version,placeId:'home',roomId:'front'}],...extra};
 return (await a.ok('/api/opening-drafts',{operationScope:owner,id:crypto.randomUUID(),version:0,body:{name:'AI配置世界',step:3,description:'在工房生活，增加一張桌子',city}})).draft;
}
// 開局整理：整理 route 第一次在受理前失敗，再以同一操作身分經 world route 帶腳本模型送出，最後由整理 route 回放並結算。
async function arrange(a,draft,work,script){
 const {scriptedModel}=load('scripted-model');
 const input={operationScope:owner,id:draft.id,version:draft.version,operationId:operationId(),worldContext:a.scope.world.contextId,...work};
 await a.leavePending('/api/opening-drafts/arrange',input);
 const before=await a.read(),model=scriptedModel(task=>({reply:script(task.input),usage}));
 const sent=await a.operate({operation:'arrange-opening',operationId:input.operationId,target:draft.id},{modelTransport:model});
 assert.equal(sent.status,200,JSON.stringify(sent.body));
 const stored=await a.ok('/api/opening-drafts/arrange',input);
 assert.equal(model.dispatches.length,1);
 return {input,before,seen:model.dispatches[0],arrangement:stored.arrangement,draft:stored.draft};
}
const proposal=(input,objects=[],extra={})=>({characters:input.city.characters.map(actor=>({templateId:actor.templateId,placeId:'home',roomId:'front',homeId:'home',homeRoomId:null,workplaceIds:[],ownedPlaceIds:[]})),backgroundPeople:[],relationships:[],accessGrants:[],finalization:{spaces:[{placeId:'home',rooms:[],objects,connections:[]}],walks:[]},...extra});
const table={id:'table',roomId:'front',name:'木桌',state:[{key:'condition',value:'良好'}],hidden:false};

test('AI 開局整理：建議保存為待採納的建議、草稿不變，帳號累計用量增加一次派送，私有決策實錄有這次派送',async()=>{
 const a=await account(),draft=await openingDraft(a);
 const {input,before,seen,arrangement,draft:kept}=await arrange(a,draft,{},task=>proposal(task,[table]));
 assert.equal(seen.task,'opening-arrangement');
 assert.equal(seen.label,'AI 開局整理');
 assert.equal(seen.maxOutputTokens,8192);
 assert.equal(seen.input.task,'opening-arrangement-v1');
 assert.equal(arrangement.state,'complete');
 assert.equal(arrangement.city.characters[0].homeId,'home');
 assert.deepEqual(arrangement.city.finalization.spaces[0].objects.map(item=>item.name),['木桌']);
 assert.deepEqual(kept.body.city,draft.body.city);
 const {dispatch}=await dispatched(a,before,input.operationId,'opening-arrangement');
 assert.equal(JSON.parse(JSON.parse(dispatch.requestBody).messages.at(-1).content).description,'在工房生活，增加一張桌子');
 assert.equal(JSON.parse(dispatch.rawCandidate).finalization.spaces[0].objects[0].name,'木桌');
});

test('逐房配物：缺少的物品與已核對的房間保存為待採納的建議，帳號累計用量增加一次派送，私有決策實錄有這次派送',async()=>{
 const a=await account(),draft=await openingDraft(a);
 const {input,before,seen,arrangement}=await arrange(a,draft,{supplyRooms:true},task=>proposal(task,[table],{checkedRooms:[{placeId:'home',roomId:'front'}]}));
 assert.equal(seen.task,'opening-arrangement');
 assert.equal(seen.input.supplyRooms,true);
 assert.ok('checkedRooms' in seen.contract.properties);
 assert.equal(arrangement.state,'complete');
 assert.deepEqual(arrangement.city.finalization.spaces[0].objects.map(item=>item.name),['木桌']);
 assert.ok(arrangement.roomItems,'逐房配物的核對結果隨建議保存');
 const {dispatch}=await dispatched(a,before,input.operationId,'opening-arrangement');
 assert.deepEqual(JSON.parse(dispatch.rawCandidate).checkedRooms,[{placeId:'home',roomId:'front'}]);
});

test('補路建議：只補上分組之間的道路並保存為待採納的建議，帳號累計用量增加一次派送，私有決策實錄有這次派送',async()=>{
 const a=await account(),manual={places:['home','kris'],minutes:6};
 const draft=await openingDraft(a,['home','kris','cafe'],{finalization:{spaces:[],walks:[manual]}});
 // 第一輪要求道路建議，但模型沒有把 cafe 接上。
 const first=await arrange(a,draft,{recommendRoads:true},task=>proposal(task));
 const repairOf={operationId:first.arrangement.operationId,version:first.arrangement.version};
 const {input,before,seen,arrangement}=await arrange(a,draft,{repairOf},()=>({walks:[{places:['kris','cafe'],minutes:10},{places:['home','cafe'],minutes:11}]}));
 assert.equal(seen.task,'opening-road-repair');
 assert.equal(seen.label,'補路建議');
 assert.equal(seen.maxOutputTokens,2048);
 assert.equal(seen.input.task,'opening-road-repair-v1');
 assert.deepEqual(seen.input.groups,[['home','kris'],['cafe']]);
 assert.equal(arrangement.state,'complete');
 assert.deepEqual(arrangement.city.finalization.walks,[manual,{places:['kris','cafe'],minutes:10}]);
 const {dispatch}=await dispatched(a,before,input.operationId,'opening-road-repair');
 assert.deepEqual(JSON.parse(dispatch.rawCandidate).walks.length,2);
});

test('製作工作寫決策實錄超過工作期限：工作期限到達時操作失敗、不等實錄寫完，原設定保留且已付用量保留',async()=>{
 const {scriptedModel}=load('scripted-model');
 const a=await account(),before=await a.read(),id=operationId(),originalTimeout=AbortSignal.timeout;
 const deadlines=[];let release,held=false,finished=false,movedOn=false;
 const written=new Promise(resolve=>{release=resolve;});
 // 工作期限由測試控制；租約與 HTTP 回應的期限（較長）維持原樣。
 AbortSignal.timeout=ms=>{if(ms>610000)return originalTimeout(ms);const controller=new AbortController();deadlines.push(controller);return controller.signal;};
 a.store.onStorage(async(sql,values)=>{
  const traceWrite=sql.startsWith('INSERT INTO decision_traces')||sql.startsWith('UPDATE decision_traces');
  if(!held&&traceWrite&&JSON.parse(values[sql.startsWith('INSERT')?5:0]).dispatches[0]?.stage==='received'){
   // 收到回覆後的這次實錄寫入卡住；等用量結算完，工作期限到達，寫入仍未完成。
   // 寫入卡住期間若還有別的資料庫存取，代表操作沒有等它、已經往下收尾。
   held=true;
   await new Promise(resolve=>setTimeout(resolve,150));
   for(const controller of deadlines)controller.abort(new DOMException('工作期限已到期。','TimeoutError'));
   setTimeout(release,1500);
   await written;
   finished=true;
  }else if(held&&!finished&&deadlines[0].signal.aborted){movedOn=true;finished=true;release();}
 });
 try{
  const model=scriptedModel(()=>({reply:{background:'河邊',directions:'修鐘'},usage}));
  const result=await a.operate(generation(id),{modelTransport:model});
  assert.equal(held,true,'實錄寫入確實卡住過');
  assert.equal(movedOn,true,'工作期限到達後操作繼續收尾，沒有等實錄寫完');
  assert.equal(result.status,502,JSON.stringify(result.body));
  assert.equal(result.body.error,'人物草稿未能生成，原設定已保留。');
  assert.equal(result.body.generatedCharacter,undefined);
  assert.equal(model.dispatches.length,1);
 }finally{a.store.onStorage(undefined);AbortSignal.timeout=originalTimeout;}
 const after=await a.read();
 assert.equal(after.accountPlayer.usage.calls,before.accountPlayer.usage.calls+1);
 assert.equal(after.accountPlayer.usage.inputTokens,before.accountPlayer.usage.inputTokens+usage.inputTokens);
 assert.equal(after.accountPlayer.usage.outputTokens,before.accountPlayer.usage.outputTokens+usage.outputTokens);
 assert.deepEqual(after.world.characters,before.world.characters);
});
