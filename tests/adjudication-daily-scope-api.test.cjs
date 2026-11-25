/* eslint-disable @typescript-eslint/no-require-imports -- Adjudication input contract and the effects it points the model at (#384). */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {configuredWorld}=require('./fixtures/world-configuration.cjs');
const {routineOffer}=load('routine-rules');
const {buildAdjudicationInput}=load('adjudication');
const {parseAdjudicationCandidate,effectRules}=load('adjudication-contract');
const {commitActivityPhase}=load('world-effects');
const {activateBodyNeeds}=load('needs');
const {customRoutinePlaces}=load('daily-place-context');

// 住戶在自己的自訂場所：工作桌沒有使用許可紀錄，兩種開局備妥的有限物資。
const supply=(id,label,kind,remaining)=>({id,label,region:'lobby',remaining,owner:'river',knownTo:['river','cedar'],allowedTo:['river','cedar'],kind,consumable:true,quantity:{amount:1,unit:'serving'},initialState:{ready:'yes'}});
function world(){
 const w=structuredClone(configuredWorld());
 w.objects=[{id:'desk',source:'desk',label:'工作桌',region:'lobby',holder:null,owner:'world',revision:1,state:{桌面:'攤著未完成的草稿'},lifecycle:'active',kind:'furnishing',knownTo:['river'],allowedTo:[]}];
 w.supplies=[supply('water','杯裝過濾水','drink',8),supply('cookie','試吃小餅乾','food',12)];
 w.configuration.access={lobby:{rule:'public',allowedActorIds:[]},loft:{rule:'residents',allowedActorIds:['river']}};
 w.routinePlaces=customRoutinePlaces(w);
 activateBodyNeeds(w);return w;
}
const drawing={type:'propose',target:'desk',content:'坐回工作桌，接著畫那張未完成的草稿。',purpose:'把稿子往前推。'};
const serving={type:'propose',target:'lobby',content:'倒一杯過濾水、拿一份小餅乾遞給杉，跟他說前面有間麵店還開著。',purpose:'招呼客人。'};
const rulesFor=(w,action)=>buildAdjudicationInput(w,w.characters[0],action,!!routineOffer(w,w.characters[0],action)).rules.join('\n');
const accepted=extra=>JSON.stringify({status:'accepted',activityIdentity:null,resumable:false,bodyActivity:null,explanation:null,branches:null,completionMinutes:15,stages:[],effects:[],check:null,routine:null,...extra});
const parse=(w,action,raw)=>{const offer=routineOffer(w,w.characters[0],action);return parseAdjudicationCandidate(raw,{routineOperations:offer?.operations||[],allowGenericMethods:!!offer?.genericMethods});};

test('自訂場所的日常範圍：family 是固定識別碼而非場所類型，operations 為空不是禁止',()=>{
 const w=world(),offer=routineOffer(w,w.characters[0],drawing);
 // 現行輸入的事實：住家也拿到 cafe-service 與空的 operations。
 assert.equal(offer.family,'cafe-service');assert.deepEqual(offer.operations,[]);assert.equal(offer.place.purpose,'custom');assert.ok(offer.genericMethods);
 const rules=rulesFor(w,drawing);
 assert.match(rules,/routineOffer\.family[^。]*固定識別碼/,'規則須說明 family 只是識別碼');
 assert.match(rules,/不代表場所是咖啡館/);
 assert.match(rules,/routineOffer\.place/,'場所類型要指向 place');
 assert.match(rules,/operations[^。]*空陣列[^。]*不是禁止/,'空的 operations 不能讀成禁止');
 assert.match(rules,/genericMethods[^。]*名額/,'genericMethods 是名額而不是方法清單');
 assert.match(rules,/不得以[^。]*family[^。]*operations[^。]*(denied|unsupported)/);
});

test('多件事的提案：核准契約表達得了的物理部分，說話不由裁定落實',()=>{
 const w=world(),rules=rulesFor(w,serving);
 assert.match(rules,/多個動作或多個對象/);
 assert.match(rules,/物理部分照常核准/);
 assert.match(rules,/說話、告知[^。]*不是世界效果/);
 assert.match(rules,/不因此否決整個提案/);
 assert.match(rules,/toHolder=null/,'沒有對方同意時，核准到放在當前區域為止');
 assert.match(rules,/不代對方同意/,'不能藉此放寬接收同意');
});

test('規則指向的部分核准確實可執行：取水、取餅乾、放在當前區域，程式扣存量',()=>{
 const w=world(),c=w.characters[0];
 const effects=[
  {kind:'materialize',supplyId:'water',expectedRemaining:8},{kind:'materialize',supplyId:'cookie',expectedRemaining:12},
  {kind:'transfer',objectId:'water:8',expectedRevision:1,toHolder:null,toRegion:'lobby'},{kind:'transfer',objectId:'cookie:12',expectedRevision:1,toHolder:null,toRegion:'lobby'},
 ];
 const parsed=parse(w,serving,accepted({effects}));assert.equal(parsed.kind,'effects');
 commitActivityPhase(w,c,{afterMinutes:0,preconditions:[],effects:parsed.candidate.stages?.at(-1)?.effects||parsed.candidate.effects},0);
 assert.deepEqual(w.supplies.map(s=>s.remaining),[7,11]);
 for(const id of ['water:8','cookie:12']){const o=w.objects.find(item=>item.id===id);assert.equal(o.holder,null);assert.equal(o.region,'lobby');assert.equal(o.lifecycle,'active');}
 // 交到另一人手上仍需對方同意：這張票不放寬。
 const handed=world();commitActivityPhase(handed,handed.characters[0],{afterMinutes:0,preconditions:[],effects:[effects[0]]},0);
 handed.characters[1].region='lobby';
 assert.throws(()=>commitActivityPhase(handed,handed.characters[0],{afterMinutes:0,preconditions:[],effects:[{kind:'transfer',objectId:'water:8',expectedRevision:1,toHolder:'cedar',toRegion:'lobby'}]},0));
});

test('沒有物件增減的持續活動：規則指向以 change-state 留下進度並確認耗時',()=>{
 const text=effectRules.join('\n');
 assert.match(text,/沒有物件增減的持續活動/);
 assert.match(text,/change-state[^。]*進度/);
 assert.match(text,/completionMinutes/);
 assert.match(text,/access=physical/,'沒有使用許可紀錄的自家陳設要指明 physical');
 assert.match(text,/不[^。]*「?無法表達逐步完成」?[^。]*unsupported/);
});

test('規則指向的進度狀態確實可執行：改寫工作桌的外在狀態，不新增物件',()=>{
 const w=world(),c=w.characters[0];
 const effect={kind:'change-state',version:1,access:'physical',exposure:'public',target:{type:'object',id:'desk'},expectedRevision:1,changes:[{key:'桌面',from:'攤著未完成的草稿',value:'草稿多畫了一段，構圖線大致定下'}],reason:'接著畫了一段時間的草稿'};
 const parsed=parse(w,drawing,accepted({completionMinutes:60,effects:[effect]}));assert.equal(parsed.kind,'effects');
 const effectsAtCompletion=parsed.candidate.stages?.at(-1)?.effects?.length?parsed.candidate.stages.at(-1).effects:parsed.candidate.effects;
 commitActivityPhase(w,c,{afterMinutes:0,preconditions:[],effects:effectsAtCompletion},0);
 assert.equal(w.objects.length,1);assert.equal(w.objects[0].state.桌面,'草稿多畫了一段，構圖線大致定下');assert.equal(w.objects[0].revision,2);
});

test('只確認身體後果的活動可以沒有效果：規則文字與解析器一致',()=>{
 const w=world();
 const sleep=accepted({bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-8,sleepPerHour:-8},completionMinutes:480});
 assert.equal(parse(w,{type:'propose',target:'lobby',content:'躺下睡覺',purpose:'睡到明早'},sleep).kind,'effects');
 assert.throws(()=>parse(w,drawing,accepted()),/可執行世界效果/,'沒有效果也沒有身體後果仍然不合法');
 const rule=effectRules.find(item=>item.includes('accepted 必須包含至少一個可執行效果'));
 assert.ok(rule);assert.match(rule,/bodyActivity/,'規則須列出解析器已接受的例外');
});
