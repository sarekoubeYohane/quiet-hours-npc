import { validIngestEffect, ingestSchema, validBodyActivity, bodyActivitySchema } from './needs';
import { routineWorldProgramSchema, symbolicEffectSchema, validateRoutineWorldPrograms, routineWorldRules, routineWorldLimits, type RoutineWorldApproval } from './routine-world-contract';
import type { ScheduleNaturalEffect } from './natural-changes';
import { formationSchemas, formationRules, validFormationEffect } from './world-formation-contract';
import type { StateCondition } from './world-state';
import { validateRoutinePrograms, routineProgramSchema, routineProgramRules, type RoutineProgram } from './routine-program-contract';
import type { RoutineOperation } from './routine-rules';
import type { Effect, EffectCandidate, ActivityPhase, ResultBranch, ChangeStateEffect, DisplaceBodyEffect, PhysicalEffect } from './world-effects';
import type { Outcome } from './d20';

// Shared bounds drive prompt, provider schema and local candidate validation.
// This module accepts no World and performs no binding, randomness or effects.
import { adjudicationLimits, routineOperations, effectKinds, naturalChangeLimits, stateChangeLimits, externalStateLimits, physicalEffectLimits } from './adjudication-limits';
export { adjudicationLimits, routineOperations, effectKinds, naturalChangeLimits, stateChangeLimits, externalStateLimits, physicalEffectLimits } from './adjudication-limits';

// An explanation is bounded, self-reported output, never an execution premise.
// Missing/null is deliberately distinct from a reconstructed or inferred reason.
export const adjudicationExplanationLimits = {maxSummaryLength:512,maxFacts:8,maxReferenceLength:160,maxFactValueLength:256} as const;
export type AdjudicationExplanation = {summary:string;facts:{reference:string;value:string}[]};
function parseExplanation(value:unknown):AdjudicationExplanation|undefined {
 if(value===undefined||value===null)return undefined;
 const text=(item:unknown,max:number):item is string=>typeof item==='string'&&!!item.trim()&&item.length<=max;
 if(!exact(value,['summary','facts'])||!text(value.summary,adjudicationExplanationLimits.maxSummaryLength)||!Array.isArray(value.facts)||value.facts.length>adjudicationExplanationLimits.maxFacts||value.facts.some(fact=>!exact(fact,['reference','value'])||!text(fact.reference,adjudicationExplanationLimits.maxReferenceLength)||!text(fact.value,adjudicationExplanationLimits.maxFactValueLength)))throw Error('裁定結果說明超出有界契約。');
 return structuredClone(value) as AdjudicationExplanation;
}

// Keys remain data in a state bag; identity, rights and lifecycle have their
// own restricted effects and may never be shadowed by a state descriptor.
const reservedStateKeys = new Set(['__proto__','constructor','prototype','id','source','sources','owner','holder','region','location','revision','kind','lifecycle','quantity','coowners','consumable','formation','endedbyformation','physicalhistory','physicalhistorydropped','unpermittedcount','knownto','allowedto','acceptedby','statetransitions','stateexposure','exposure','physical','external','state','authorization','api_key','apikey','cookie','access_token','refresh_token']);
export function validStateKey(value:unknown):value is string {
 return typeof value==='string'&&value.length>0&&value.length<=stateChangeLimits.maxKeyLength&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value)&&!value.split('.').some(part=>reservedStateKeys.has(part.toLowerCase()));
}
export function validObjectKind(value:unknown):value is string {
 return typeof value==='string'&&!!value.trim()&&value.trim()===value&&value.length<=stateChangeLimits.maxKindLength&&!/[\u0000-\u001f\u007f]/.test(value);
}
export function assertBoundedState(value:unknown):asserts value is Record<string,string> {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>stateChangeLimits.maxEntries||Object.entries(value).some(([key,item])=>!validStateKey(key)||typeof item!=='string'||item.length>stateChangeLimits.maxValueLength)||new TextEncoder().encode(JSON.stringify(value)).length>stateChangeLimits.maxStateBytes)throw Error('外在狀態超出有界資料契約。');
}
// These rules are sent with the schema: JSON shape alone cannot teach the model
// identity, sequential revisions or the authority required by applyEffects.
export const effectRules = [
 'bodyConsequencesReconfirmation=true表示角色明示想重新確認既有方法對自己身體的實際影響，本次沿原普通裁定slot處理；accepted時必須以獨立routine.version=3範圍保存包含真正ingest或bodyActivity的程序。舊範圍與既有成果保留，不改寫歷史、不從consume名稱猜恢復量。尚無明示有界身體後果可承接時可denied/unsupported，不假裝已確認；已確認且仍適用的範圍不應再次裁定。',
 'bodyActivity version=1 是本次活動每實際世界小時的額外需求變化，與程式的 fatigue+1/時、sleep+4/時清醒基線合成後執行。kind=rest：fatiguePerHour=-20..0，sleepPerHour必須0，清醒休息不恢復睡眠需求；kind=exertion：fatiguePerHour=0..20，sleepPerHour必須0，體力活動不能產生疲勞或睡眠需求恢復；kind=sleep：fatiguePerHour=-20..0，sleepPerHour至少-20且嚴格小於-4，睡眠需求淨變化必須為負。所有值必須有限，不能跨kind挪用恢復能力。只算真正開始後的已發生分鐘，不預支完整時段；sleep只在確實入睡時確認，嘗試入睡不等於已睡著。缺省/null表示沒有新確認，不從活動文字推論；日常核准頂層bodyActivity=null，逐program.bodyActivity沿相同kind界線保存確認，舊program缺欄位不補造。',
 'ingest version=1：真正攝取本人持有且可消耗的同一物件，objectId/expectedRevision沿consume前提，hungerRelief/thirstRelief各0至60且至少一項大於0；完整消耗這份具體物件並同步緩解需求。部分攝取先separate出明示份量；不能以形成食物、敘述成功或普通body狀態代替。一般consume舊原義不自動取得未確認的需求效果。',
 `explanation是有界的模型自述結果說明，不是程式已驗證的根因或角色已知事實；請用summary（1至${adjudicationExplanationLimits.maxSummaryLength}字）簡述允許、否決或無進展的可核對結果，facts最多${adjudicationExplanationLimits.maxFacts}筆{reference,value}引用當次輸入中既有事實（reference至多${adjudicationExplanationLimits.maxReferenceLength}字，value至多${adjudicationExplanationLimits.maxFactValueLength}字）。不要求或輸出內部思考過程，不創造不存在的事實；無可用說明時explanation=null。此說明只供觀察者，不可自動作為NPC回饋。`,
 `schedule-natural version=${naturalChangeLimits.version}：在同次裁定確認已形成外在狀態的自然後續。delayMinutes是從該狀態正式提交起算的${naturalChangeLimits.minuteStep}分鐘倍數，${naturalChangeLimits.minDelay}至${naturalChangeLimits.maxDelay}；不是從回溯phase進展時間起算，不同回合追溯觸發。conditions為1至${naturalChangeLimits.maxConditions}個state-condition，僅綁必要state及可選region/holder guard，沒有guard的條件須有state。effects為1至${naturalChangeLimits.maxEffects}個{target,changes,exposure}，同target可分不同鍵的曝光，同鍵不能重複寫入，只允許同change-state受限狀態後果，不含revision或遞迴安排；每筆changes.from亦為持續前提。exposure明示object/environment public或hidden，body public/subject/hidden。每次正式批次後必要條件或from破壞即永久失效，即使後來恢復也不復活；無關state/revision不影響。reason只供證據，不是角色已知理由。pending最多${naturalChangeLimits.maxPending}、已結算紀錄最多${naturalChangeLimits.maxSettled}；安排與世界同批保存，執行不追加模型或骰子。`,
 ...formationRules,
 `共同界線：effects kinds=${Object.values(effectKinds).join("/")}；status=${adjudicationLimits.statuses.join('/')}；effects 至多${adjudicationLimits.maxEffects}；stages 至多${adjudicationLimits.maxStages}；completionMinutes 必須是正數且至多${adjudicationLimits.maxMinutes}，向上對齊${adjudicationLimits.minuteStep}分鐘；階段時點=${adjudicationLimits.phaseMinutes.join('/')}；不確定難度=${adjudicationLimits.difficulties.join('/')}。`,
 'activityIdentity：一般 accepted 新方法可確認 {version:1,key:穩定語義代碼,label:短活動名稱}；key以小寫英文字開頭、僅英數._-、最多64字，label最多64字。不以物件實例ID、原句hash或成敗級別分類。同語義換措辭／換杯子應沿用 knownActivityIdentities 的 key/label；不同方法不得共用。找不到等義才新增身份。routine非null或未核准時填null，舊缺欄位不補造。這只分類已執行選擇，不是喜歡、成功或強制意圖。',
 '一般效果分支（routine=null）的 accepted 必須包含至少一個可執行效果或活動階段，或以非 null branches 確認結果分支；舊版日常核准分支（routine.version=1）只能 accepted、effects=[]、stages=[]、check=null、completionMinutes=null、branches=null，由完整 routine.timings 提供唯一耗時並交程式承接；前提不成立回傳 denied，目前效果無法表達的方法回傳 unsupported。兩者 effects/stages 為空且 check=null，不虛構成功。',
 'effects 依陣列順序執行，後一效果使用前一效果產生的狀態。expectedRevision 必須等於該步執行前的版本；state、transfer、consume、destroy 每次加一，grant、consent 不改版本。',
 'materialize：僅使用本地、已知、allowedTo 含 actor.id 且 remaining>0 的供應，expectedRemaining 等於當前庫存。產生 supplies.materializedObjectId，revision=1、holder=actor.id、owner 保留供應所有者，庫存減一。供應 id 不能當作 objectId。',
 'consume：明示 consumable=true 的物件且 holder=actor.id 才可食用；consumable=false 不可，只有舊資料缺 consumable 才以 kind=food 相容，不以新kind名稱決定。之後 lifecycle=consumed、holder=null、已保存quantity歸零，不會補貨。桌上可食用物件先 transfer 拿取再 consume，第二步版本加一。容器本身不能因裝有飲品而被食用；杯中獨立飲品按其可消耗能力consume，並在同批更新原杯contents，保留飲品與容器連續性。',
 '舊kind state/transfer/consume/destroy的授權模式及change-state access=authorized：物件必須已知、active、本地且獲准，並由actor持有或無人持有。這是舊核准方法的適用範圍，不代表所有物理方法都不可能；需要未經許可或對他人持有物件的外在後果時明示新physical契約。',
 'transfer：toRegion 必須是 actor 當前 region；toHolder=null 是放下，toHolder=actor.id 是拿取。交給其他角色需要同區域、allowedTo 與該角色先前 consent 形成的 acceptedBy；不能代對方同意。移動另用 NPC move，不得遠端轉移。',
 'grant：僅物件或供應的 owner 角色自己提出，且目標已知、可見、本地，recipient 須在場可見。只增加使用權與知情，不轉移 holder 或 owner。口頭台詞不等於 grant，借用者不能代所有者授權。',
 'consent：當前角色對已知、可見、active 且 allowedTo 允許的物件同意接收；增加 actor.id 至 acceptedBy。舊destroy只允許處理自己的物件；借用意外或未經許可的外在損毀須明示physical destroy，不能偽造grant。',
 `change-state version=${stateChangeLimits.version}、access=${stateChangeLimits.accesses.join('/')}：target={type:object,id}、exposure=${stateChangeLimits.exposures.join('/')}，public是有感知機會才可知、hidden只供權威條件。舊物件缺曝光元資料的舊state保留原可知原義，不補歷史；expectedRevision為當前正整數版本，changes最多${stateChangeLimits.maxChanges}筆{key,from,value}；from=null明示原本無該鍵，否則須等於當前值。key最多${stateChangeLimits.maxKeyLength}字、value最多${stateChangeLimits.maxValueLength}字；物件state最多${stateChangeLimits.maxEntries}鍵及${stateChangeLimits.maxStateBytes} UTF-8 bytes。允許未預列的新外在狀態；reason必須提供（最多${stateChangeLimits.maxReasonLength}字），僅供觀察者裁定證據，不是NPC已知內情。不能寫核心身份、來源、數量、位置、歸屬、許可、生命週期或prototype鍵；資料文字不作為指令執行。每項效果增加一次revision，不能以狀態複製物件或復活成果。`,
 `change-state另承接target.type=${externalStateLimits.targets.join('/')}，access=${externalStateLimits.access}；環境id是本地區域，身體id是在場角色，沒有新欄位的當前狀況為空state、revision=0。body必填exposure=${externalStateLimits.exposures.join('/')}、environment必填exposure=${externalStateLimits.environmentExposures.join('/')}：public是可見外在表徵，subject是本人有依據能感到的身體狀況，hidden只是權威事實（連本人也不自動知悉），不可把看得到區域當成知道該區所有內情；禁止情緒、意願、記憶、信念與反應。理由不進NPC。物理後果不等於對方同意。`,
 'displace-body version=1：targetId為在場可接觸的角色，expectedRegion/expectedRevision為當前外在位置及版本，toRegion限同場所相鄰且通路開啟；reason只供觀察者查證。只改外在位置並同步攜物，不產生同意、選擇、情緒或後續反應。需要不確定判定時沿原D20結果分支。',
 'state-condition version=1：target可為object/environment/body，state是1至4個必要key/value（null表示不存在），只檢查相關鍵，無關狀態不使其失效。可選guard={region:null或區域id,holder:{check:boolean,value:null或角色id}}；缺guard或region=null不檢查位置，holder.check=false只許value=null；check=true僅object可用並明確檢查持有（null是要求無人持有）。條件不補造世界事實，不用全revision替代相關條件。',
 `physical version=${physicalEffectLimits.version}：operation=materialize引用supplyId/expectedRemaining；operation=${physicalEffectLimits.objectOperations.join('/')}引用objectId/expectedRevision。reason必填且至多${physicalEffectLimits.maxReasonLength}字，只供觀察者證據。已知、本地、可見、active及正確版本/有限供應仍必須成立；物主許可與物理可行性分開，允許確認的意外或未經許可後果，包括其他在場角色持有的物件。take只改為actor持有，place只放在actor當前區域；不能直接強迫第三者接收、grant或consent。consume仍需本身可食用且先在actor手上；destroy不復活、不轉移owner。change-state access=physical沿同一物理邊界，不改角色意願。物件保留有界事前許可歷史，原權利不因後果改寫。`,
 'state：key/value 必須在物件 stateTransitions 內且改變目前值，不得新增任意欄位。所有效果均不能更換物件 kind、owner 或隱含生成替代物。',
 `resumable：只有世界確認活動可停下並保留工序時為true，不可暫停或日常核准封套填false；暫停不凍結材料與外界。`,
 `completionMinutes：一般效果分支（routine=null）有完成目標且 accepted 時，依方法與當下條件確認完成所需合理分鐘（有限正數，至多${adjudicationLimits.maxMinutes}）；一般 durationMinutes 只是角色估時。程式向上對齊${adjudicationLimits.minuteStep}。denied/unsupported 或開放式時段回傳 null。授權與同意是一次性選擇，耗時${adjudicationLimits.minuteStep}。stages：只列少數有意義的進度；afterMinutes 依序遞增且不超過對齊後完成時間，最後一階段在完成時間；完整成品不能提前產生。完成契約的頂層 effects 是最終成果，即使已有 stages 也在完成時間執行；準備工作須列在明確時點的 stages。食物 materialize 會生成可食用的完整物件，只能在確認完成時點；不以早期階段冒充部分食物。最終階段連同頂層 effects 合計最多${adjudicationLimits.maxEffects}項。preconditions 使用當階段執行前的版本、region、holder 與 state（key/value 陣列）；後續階段引用先前效果遞增後的版本。階段不能包含 grant、consent 或需要其他角色新同意的交付。`,
 `結果分支：routine=null 的完成活動可用 branches 確認 1 至 ${adjudicationLimits.maxBranches} 組 {outcomes,effects,stages}，此時頂層 effects/stages 必須空。outcomes 必須恰好各涵蓋 ${adjudicationLimits.outcomes.join("/")} 一次，可共用後果；每組沿相同受限效果及時間契約，失敗可消耗、部分成果用合法狀態表示，不能自動套用成功效果。確定活動 check=null 時僅一組涵蓋全部級別；不擲骰。無變化的失敗分支允許空效果，仍消耗確認時間。所有分支在擲骰前驗證。不確定自由活動 target 必須是當前可知具體物件／供應，或本地可接觸角色／區域；改措辭、難度或分支表示不取得重擲資格。branches=null 保留舊效果契約。`,
 '例如供應 meal 的 materializedObjectId="meal:1"：effects=[{kind:"materialize",supplyId:"meal",expectedRemaining:1},{kind:"consume",objectId:"meal:1",expectedRevision:1}]。桌上 revision=1 的 food 則先 transfer(expectedRevision=1,toHolder=actor.id,toRegion=actor.region)，再 consume(expectedRevision=2)。',
 `確定可行的日常活動 check=null。只有合法且結果不確定的嘗試可提出 difficulty=${adjudicationLimits.difficulties.join("/")} 與相關 ability；不得擲骰或指定結果。`,
];
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>k in value);
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const reference=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=adjudicationLimits.maxReferenceLength;
const variant=(properties:Record<string,object>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const mentalStateKeys=new Set(['preference','preferences','喜好','偏好','habit','habits','習慣','needs','hunger','thirst','fatigue','sleep','飢餓','口渴','體力疲勞','睡眠需求','mood','emotion','emotions','cognition','belief','beliefs','intent','intents','will','willingness','consent','forgiveness','personality','memory','memories','relationships','意願','情緒','信念','同意','原諒','性格','記憶','意圖']);
export const validBodyStateKey=(key:unknown):key is string=>validStateKey(key)&&!key.split('.').some(part=>mentalStateKeys.has(part.toLowerCase()));
const stateValueSchema={type:'string',maxLength:stateChangeLimits.maxValueLength};
const physicalEnvelope={kind:{type:'string',const:effectKinds.physical},version:{type:'integer',const:physicalEffectLimits.version},reason:{type:'string',minLength:1,maxLength:physicalEffectLimits.maxReasonLength}};
export const physicalEffectSchema={anyOf:[variant({...physicalEnvelope,operation:{type:'string',const:'materialize'},supplyId:{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength},expectedRemaining:{type:'integer',minimum:1}}),variant({...physicalEnvelope,operation:{type:'string',enum:[...physicalEffectLimits.objectOperations]},objectId:{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength},expectedRevision:{type:'integer',minimum:1}})]};
export function validPhysicalEffect(value:unknown):value is PhysicalEffect {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const effect=value as Record<string,unknown>;
 if(effect.kind!==effectKinds.physical||effect.version!==physicalEffectLimits.version||typeof effect.reason!=='string'||!effect.reason.trim()||effect.reason.length>physicalEffectLimits.maxReasonLength)return false;
 return effect.operation==='materialize'
  ?exact(effect,['kind','version','operation','supplyId','expectedRemaining','reason'])&&reference(effect.supplyId)&&integer(effect.expectedRemaining)&&(effect.expectedRemaining as number)>0
  :exact(effect,['kind','version','operation','objectId','expectedRevision','reason'])&&(physicalEffectLimits.objectOperations as readonly unknown[]).includes(effect.operation)&&reference(effect.objectId)&&integer(effect.expectedRevision)&&(effect.expectedRevision as number)>0;
}
export const changeStateSchema=variant({exposure:{type:'string',enum:[...stateChangeLimits.exposures]},kind:{type:'string',const:effectKinds.changeState},version:{type:'integer',const:stateChangeLimits.version},access:{type:'string',enum:[...stateChangeLimits.accesses]},target:variant({type:{type:'string',enum:[...stateChangeLimits.targets]},id:{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength}}),expectedRevision:{type:'integer',minimum:1},changes:{type:'array',minItems:1,maxItems:stateChangeLimits.maxChanges,items:variant({key:{type:'string',minLength:1,maxLength:stateChangeLimits.maxKeyLength},from:{anyOf:[{type:'null'},stateValueSchema]},value:stateValueSchema})},reason:{type:'string',minLength:1,maxLength:stateChangeLimits.maxReasonLength}});
const externalStateSchemas=externalStateLimits.targets.map(type=>variant({...changeStateSchema.properties,access:{type:'string',const:externalStateLimits.access},target:variant({type:{type:'string',const:type},id:{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength}}),expectedRevision:{type:'integer',minimum:0},exposure:{type:'string',enum:[...(type==='body'?externalStateLimits.exposures:externalStateLimits.environmentExposures)]}}));
export function validStateChange(value:unknown):value is ChangeStateEffect {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>,target=v.target as Record<string,unknown>|undefined;
 const body=target?.type==='body',external=(externalStateLimits.targets as readonly unknown[]).includes(target?.type);
 if(!exact(value,['kind','version','access','target','expectedRevision','changes','reason','exposure'])||value.kind!==effectKinds.changeState||value.version!==stateChangeLimits.version||!exact(value.target,['type','id'])||!reference(value.target.id)||(!external&&!(stateChangeLimits.targets as readonly unknown[]).includes(value.target.type))||!(external?value.access===externalStateLimits.access:(stateChangeLimits.accesses as readonly unknown[]).includes(value.access))||!(external?(body?externalStateLimits.exposures as readonly unknown[]:externalStateLimits.environmentExposures as readonly unknown[]):stateChangeLimits.exposures as readonly unknown[]).includes(value.exposure)||!integer(value.expectedRevision)||(value.expectedRevision as number)<(external?0:1)||typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>stateChangeLimits.maxReasonLength||!Array.isArray(value.changes)||!value.changes.length||value.changes.length>stateChangeLimits.maxChanges)return false;
 const keys=new Set<string>();
 return value.changes.every(entry=>{
  if(!exact(entry,['key','from','value'])||!validStateKey(entry.key)||body&&!validBodyStateKey(entry.key)||keys.has(entry.key)||entry.from!==null&&(typeof entry.from!=='string'||entry.from.length>stateChangeLimits.maxValueLength)||typeof entry.value!=='string'||entry.value.length>stateChangeLimits.maxValueLength||entry.from===entry.value)return false;
  keys.add(entry.key);return true;
 });
}

export const displaceBodySchema=variant({kind:{type:'string',const:effectKinds.displaceBody},version:{type:'integer',const:1},targetId:{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength},expectedRegion:{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength},expectedRevision:{type:'integer',minimum:0},toRegion:{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength},reason:{type:'string',minLength:1,maxLength:stateChangeLimits.maxReasonLength}});
export function validBodyDisplacement(value:unknown):value is DisplaceBodyEffect {
 return exact(value,['kind','version','targetId','expectedRegion','expectedRevision','toRegion','reason'])&&value.kind===effectKinds.displaceBody&&value.version===1&&reference(value.targetId)&&reference(value.expectedRegion)&&reference(value.toRegion)&&value.expectedRegion!==value.toRegion&&integer(value.expectedRevision)&&typeof value.reason==='string'&&!!value.reason.trim()&&value.reason.length<=stateChangeLimits.maxReasonLength;
}
const legacyPhaseConditionSchema=variant({objectId:{type:'string'},revision:{type:'integer'},region:{type:'string'},holder:{anyOf:[{type:'null'},{type:'string'}]},state:{type:'array',maxItems:adjudicationLimits.maxStateEntries,items:variant({key:{type:'string'},value:{type:'string'}})}});
export const stateConditionSchema=variant({kind:{type:'string',const:'state-condition'},version:{type:'integer',const:1},target:variant({type:{type:'string',enum:[...stateChangeLimits.targets,...externalStateLimits.targets]},id:{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength}}),state:{type:'array',minItems:1,maxItems:stateChangeLimits.maxChanges,items:variant({key:{type:'string',minLength:1,maxLength:stateChangeLimits.maxKeyLength},value:{anyOf:[{type:'null'},stateValueSchema]}})}});
const stateGuardSchema=variant({region:{anyOf:[{type:'null'},{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength}]},holder:variant({check:{type:'boolean'},value:{anyOf:[{type:'null'},{type:'string',minLength:1,maxLength:adjudicationLimits.maxReferenceLength}]}})});
export const guardedStateConditionSchema=variant({...stateConditionSchema.properties,state:{...stateConditionSchema.properties.state,minItems:0},guard:stateGuardSchema});
export function validStateCondition(value:unknown):value is StateCondition {
 if(!(exact(value,['kind','version','target','state'])||exact(value,['kind','version','target','state','guard']))||value.kind!=='state-condition'||value.version!==1||!exact(value.target,['type','id'])||![...stateChangeLimits.targets,...externalStateLimits.targets].includes(value.target.type as 'object')||!reference(value.target.id)||!Array.isArray(value.state)||value.state.length>stateChangeLimits.maxChanges)return false;
 if('guard' in value){const guard=value.guard;if(!exact(guard,['region','holder'])||guard.region!==null&&!reference(guard.region)||!exact(guard.holder,['check','value'])||typeof guard.holder.check!=='boolean'||guard.holder.value!==null&&!reference(guard.holder.value)||!guard.holder.check&&guard.holder.value!==null||guard.holder.check&&value.target.type!=='object')return false;}
 const guard=value.guard as StateCondition['guard'];
 if(!value.state.length&&(!guard||guard.region===null&&!guard.holder.check))return false;
 const body=value.target.type==='body';
 const keys=new Set<string>();return value.state.every(entry=>{
  if(!exact(entry,['key','value'])||!validStateKey(entry.key)||body&&!validBodyStateKey(entry.key)||keys.has(entry.key)||entry.value!==null&&(typeof entry.value!=='string'||entry.value.length>stateChangeLimits.maxValueLength))return false;
  keys.add(entry.key);return true;
 });
}
export function parseStateCondition(value:unknown):StateCondition {
 if(!validStateCondition(value))throw Error('外在狀態條件格式無效。');return structuredClone(value);
}
const naturalStateSchemas=[changeStateSchema,...externalStateSchemas].map(schema=>variant({target:schema.properties.target,changes:schema.properties.changes,exposure:schema.properties.exposure}));
export const scheduleNaturalSchema=variant({kind:{type:'string',const:effectKinds.scheduleNatural},version:{type:'integer',const:naturalChangeLimits.version},delayMinutes:{type:'integer',enum:Array.from({length:naturalChangeLimits.maxDelay/naturalChangeLimits.minuteStep},(_,index)=>(index+1)*naturalChangeLimits.minuteStep)},conditions:{type:'array',minItems:1,maxItems:naturalChangeLimits.maxConditions,items:{anyOf:[stateConditionSchema,guardedStateConditionSchema]}},effects:{type:'array',minItems:1,maxItems:naturalChangeLimits.maxEffects,items:{anyOf:naturalStateSchemas}},reason:{type:'string',minLength:1,maxLength:stateChangeLimits.maxReasonLength}});
export function validScheduleNatural(value:unknown):value is ScheduleNaturalEffect {
 if(!exact(value,['kind','version','delayMinutes','conditions','effects','reason'])||value.kind!==effectKinds.scheduleNatural||value.version!==naturalChangeLimits.version||!integer(value.delayMinutes)||(value.delayMinutes as number)<naturalChangeLimits.minDelay||(value.delayMinutes as number)>naturalChangeLimits.maxDelay||(value.delayMinutes as number)%naturalChangeLimits.minuteStep!==0||typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>stateChangeLimits.maxReasonLength||!Array.isArray(value.conditions)||!value.conditions.length||value.conditions.length>naturalChangeLimits.maxConditions||!value.conditions.every(validStateCondition)||!Array.isArray(value.effects)||!value.effects.length||value.effects.length>naturalChangeLimits.maxEffects)return false;
 return value.effects.every(effect=>exact(effect,['target','changes','exposure'])&&exact(effect.target,['type','id'])&&validStateChange({...effect,kind:'change-state',version:1,access:effect.target.type==='object'?'authorized':'physical',expectedRevision:effect.target.type==='object'?1:0,reason:'自然變化狀態後果'}));
}
export const effectSchema={anyOf:[ingestSchema,scheduleNaturalSchema,...formationSchemas,...physicalEffectSchema.anyOf,changeStateSchema,...externalStateSchemas,displaceBodySchema,variant({kind:{const:effectKinds.transfer,type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'},toHolder:{anyOf:[{type:'null'},{type:'string'}]},toRegion:{type:'string'}}),variant({kind:{const:effectKinds.state,type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'},key:{type:'string'},value:{type:'string'}}),variant({kind:{const:effectKinds.grant,type:'string'},targetId:{type:'string'},recipient:{type:'string'}}),variant({kind:{const:effectKinds.consent,type:'string'},objectId:{type:'string'}}),variant({kind:{const:effectKinds.destroy,type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'}}),variant({kind:{const:effectKinds.materialize,type:'string'},supplyId:{type:'string'},expectedRemaining:{type:'integer'}}),variant({kind:{const:effectKinds.consume,type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'}})]};
const phaseConditionSchema={anyOf:[legacyPhaseConditionSchema,stateConditionSchema,guardedStateConditionSchema]};
const effectReference={$ref:'#/$defs/effect'};
const phaseReference={$ref:'#/$defs/phase'};
const phaseSchema=variant({afterMinutes:{type:'integer',enum:[...adjudicationLimits.phaseMinutes]},preconditions:{type:'array',maxItems:adjudicationLimits.maxConditions,items:phaseConditionSchema},effects:{type:'array',minItems:1,maxItems:adjudicationLimits.maxEffects,items:effectReference}});
const outcomes:readonly Outcome[]=adjudicationLimits.outcomes;
const branchSchema=variant({outcomes:{type:'array',minItems:1,maxItems:adjudicationLimits.maxBranches,items:{type:'string',enum:outcomes}},effects:{type:'array',maxItems:adjudicationLimits.maxEffects,items:effectReference},stages:{type:'array',maxItems:adjudicationLimits.maxStages,items:phaseReference}});
export const explanationSchema={anyOf:[{type:'null'},variant({summary:{type:'string',minLength:1,maxLength:adjudicationExplanationLimits.maxSummaryLength},facts:{type:'array',maxItems:adjudicationExplanationLimits.maxFacts,items:variant({reference:{type:'string',minLength:1,maxLength:adjudicationExplanationLimits.maxReferenceLength},value:{type:'string',minLength:1,maxLength:adjudicationExplanationLimits.maxFactValueLength}})}})]};
export const activityIdentitySchema={anyOf:[{type:'null'},variant({version:{type:'integer',enum:[1]},key:{type:'string',minLength:1,maxLength:64,pattern:'^[a-z][a-z0-9._-]*$'},label:{type:'string',minLength:1,maxLength:64}})]};
export const effectCandidateSchema={...variant({resumable:{type:'boolean'},activityIdentity:activityIdentitySchema,bodyActivity:{anyOf:[{type:'null'},bodyActivitySchema]},explanation:explanationSchema,branches:{anyOf:[{type:'null'},{type:'array',minItems:1,maxItems:adjudicationLimits.maxBranches,items:branchSchema}]},completionMinutes:{anyOf:[{type:'null'},{type:'number',exclusiveMinimum:0,maximum:adjudicationLimits.maxMinutes}]},stages:{type:'array',maxItems:adjudicationLimits.maxStages,items:phaseReference},status:{type:'string',enum:[...adjudicationLimits.statuses]},effects:{type:'array',maxItems:adjudicationLimits.maxEffects,items:effectReference},check:{anyOf:[{type:'null'},variant({difficulty:{type:'integer',enum:[...adjudicationLimits.difficulties]},ability:{type:'string',maxLength:adjudicationLimits.maxValueLength}})]}}),$defs:{effect:effectSchema,phase:phaseSchema}};
export function scheduleCompletionMinutes(value:unknown):number {
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>adjudicationLimits.maxMinutes)throw Error(`完成耗時必須是至多${adjudicationLimits.maxMinutes}分鐘的有限正數。`);
 return Math.ceil(value/adjudicationLimits.minuteStep)*adjudicationLimits.minuteStep;
}
export function parseEffectCandidate(raw:string):EffectCandidate & {explanation?:AdjudicationExplanation}{
 let v:unknown;try{v=JSON.parse(raw);}catch{throw Error('裁定未回傳有效候選。');}
 let resumable:boolean|undefined;
 if(v&&typeof v==='object'&&!Array.isArray(v)&&'resumable' in v){const candidate=v as Record<string,unknown>;if(typeof candidate.resumable!=='boolean')throw Error('可暫停確認格式無效。');resumable=candidate.resumable;delete candidate.resumable;}
 let activityIdentity:EffectCandidate['activityIdentity'];
 if(v&&typeof v==='object'&&!Array.isArray(v)&&'activityIdentity' in v){const value=(v as Record<string,unknown>).activityIdentity;if(value!==null){if(!exact(value,['version','key','label'])||value.version!==1||typeof value.key!=='string'||!/^[a-z][a-z0-9._-]{0,63}$/.test(value.key)||typeof value.label!=='string'||!value.label.trim()||value.label.length>64)throw Error('活動語義身份格式無效。');activityIdentity=value as EffectCandidate['activityIdentity'];}delete (v as Record<string,unknown>).activityIdentity;}
 let bodyActivity:import('./needs').BodyActivity|undefined;
 if(v&&typeof v==='object'&&!Array.isArray(v)&&'bodyActivity' in v){const profile=(v as Record<string,unknown>).bodyActivity;if(profile!==null){if(!validBodyActivity(profile))throw Error('活動需求後果格式無效。');bodyActivity=profile;}delete (v as Record<string,unknown>).bodyActivity;}
 const explanation=parseExplanation(v&&typeof v==='object'&&!Array.isArray(v)?(v as Record<string,unknown>).explanation:undefined);
 if(v&&typeof v==='object'&&!Array.isArray(v))delete (v as Record<string,unknown>).explanation;
 if(v&&typeof v==='object'&&!Array.isArray(v)&&'branches' in v){
  const envelope=v as Record<string,unknown>,branches=envelope.branches;
  delete envelope.branches;
  if(branches!==null){
   if(raw.length>adjudicationLimits.maxCandidateLength||!exact(envelope,['status','effects','stages','check','completionMinutes'])||envelope.status!=='accepted'||!Array.isArray(envelope.effects)||envelope.effects.length||!Array.isArray(envelope.stages)||envelope.stages.length||!Array.isArray(branches)||!branches.length||branches.length>adjudicationLimits.maxBranches)throw Error('結果分支契約無效。');
   const duration=scheduleCompletionMinutes(envelope.completionMinutes),seen:Outcome[]=[];
   const parsed=branches.map((branch:unknown):ResultBranch=>{
    if(!exact(branch,['outcomes','effects','stages'])||!Array.isArray(branch.outcomes)||!branch.outcomes.length||branch.outcomes.some(value=>!outcomes.includes(value as Outcome))||!Array.isArray(branch.effects)||!Array.isArray(branch.stages))throw Error('結果分支格式無效。');
    seen.push(...branch.outcomes as Outcome[]);
    let effects:Effect[],stages:ActivityPhase[];
    if(!branch.effects.length&&!branch.stages.length){effects=[];stages=[];}
    else {const parsed=parseEffectCandidate(JSON.stringify({status:'accepted',effects:branch.effects,stages:branch.stages,check:null,completionMinutes:envelope.completionMinutes}));effects=parsed.effects;stages=parsed.stages||[];}
    if(stages.some(stage=>stage.afterMinutes>duration)||stages.length&&stages.at(-1)!.afterMinutes!==duration)throw Error('分支最後階段須與確認完成時間一致。');
    if(!stages.length&&duration>adjudicationLimits.minuteStep){stages=[{afterMinutes:duration,preconditions:[],effects}];effects=[];}
    return {outcomes:branch.outcomes as Outcome[],effects,stages};
   });
   if(seen.length!==outcomes.length||new Set(seen).size!==outcomes.length||envelope.check===null&&branches.length!==1)throw Error('結果分支須唯一涵蓋五段判定；確定活動只用一組後果。');
   if(envelope.check!==null&&(!exact(envelope.check,['difficulty','ability'])||!(adjudicationLimits.difficulties as readonly number[]).includes(envelope.check.difficulty as number)||(!reference(envelope.check.ability)||envelope.check.ability.length>adjudicationLimits.maxValueLength)))throw Error('裁定不可指定骰值或結果。');
   return {...(resumable===undefined?{}:{resumable}),...(bodyActivity?{bodyActivity}:{}),status:'accepted',effects:[],stages:[],check:envelope.check as EffectCandidate['check'],confirmedDurationMinutes:duration,branches:parsed,...(activityIdentity?{activityIdentity}:{}),...(explanation?{explanation}:{})};
  }
 }
 let confirmedDurationMinutes:number|undefined;
 if(v&&typeof v==='object'&&!Array.isArray(v)&&'completionMinutes' in v){
  const completion=(v as Record<string,unknown>).completionMinutes;
  if(completion!==null)confirmedDurationMinutes=scheduleCompletionMinutes(completion);
  delete (v as Record<string,unknown>).completionMinutes;
 }
 if(raw.length>adjudicationLimits.maxCandidateLength||!((exact(v,['status','effects','check']))||(exact(v,['status','effects','check','stages'])))||!(adjudicationLimits.statuses as readonly string[]).includes(v.status as string)||!Array.isArray(v.effects)||v.effects.length>adjudicationLimits.maxEffects)throw Error('裁定候選格式無效。');
 if(v.stages!==undefined){
  if(!Array.isArray(v.stages)||v.stages.length>adjudicationLimits.maxStages)throw Error('活動階段超出範圍。');
  let previous=0;
  for(const stage of v.stages){
   if(!exact(stage,['afterMinutes','preconditions','effects'])||!(adjudicationLimits.phaseMinutes as readonly number[]).includes(stage.afterMinutes as number)||(stage.afterMinutes as number)<=previous||!Array.isArray(stage.preconditions)||stage.preconditions.length>adjudicationLimits.maxConditions||!Array.isArray(stage.effects)||!stage.effects.length)throw Error('活動階段格式無效。');
   previous=stage.afterMinutes as number;
   for(const p of stage.preconditions){
    if(validStateCondition(p))continue;
    if(p&&typeof p==='object'&&Array.isArray(p.state)){const entries=p.state;if(entries.some((entry:unknown)=>!exact(entry,['key','value'])||!reference(entry.key)||typeof entry.value!=='string'||entry.value.length>adjudicationLimits.maxValueLength)||new Set(entries.map((entry:{key:string})=>entry.key)).size!==entries.length)throw Error('活動狀態前提格式無效。');p.state=Object.fromEntries(entries.map((entry:{key:string;value:string})=>[entry.key,entry.value]));}
    if(!exact(p,['objectId','revision','region','holder','state'])||!reference(p.objectId)||!integer(p.revision)||!reference(p.region)||(p.holder!==null&&!reference(p.holder))||!p.state||typeof p.state!=='object'||Array.isArray(p.state)||Object.keys(p.state).length>adjudicationLimits.maxStateEntries||Object.entries(p.state).some(([k,val])=>!reference(k)||typeof val!=='string'||val.length>adjudicationLimits.maxValueLength))throw Error('活動前提格式無效。');
   }
   parseEffectCandidate(JSON.stringify({status:'accepted',effects:stage.effects,check:null}));
   if(stage.effects.some((e:Effect)=>e.kind===effectKinds.grant||e.kind===effectKinds.consent))throw Error('活動階段不能代替他人作新選擇。');
  }
 }
 if(v.status==='accepted'&&!bodyActivity&&!v.effects.length&&!(Array.isArray(v.stages)&&v.stages.length))throw Error('通過候選必須包含可執行世界效果。');
 if(v.status!=='accepted'&&(v.effects.length||(Array.isArray(v.stages)&&v.stages.length)))throw Error('否決候選不能含世界效果。');
 if(v.status!=='accepted'&&v.check!==null)throw Error('否決候選不能要求判定。');
 if(v.check!==null&&(!exact(v.check,['difficulty','ability'])||!(adjudicationLimits.difficulties as readonly number[]).includes(v.check.difficulty as number)||(!reference(v.check.ability)||v.check.ability.length>adjudicationLimits.maxValueLength)))throw Error('裁定不可指定骰值或結果。');
 for(const e of v.effects){if(!validIngestEffect(e)&&!validScheduleNatural(e)&&!validFormationEffect(e,assertBoundedState)&&!validPhysicalEffect(e)&&!validStateChange(e)&&!validBodyDisplacement(e)&&!(exact(e,['kind','supplyId','expectedRemaining'])&&e.kind===effectKinds.materialize&&reference(e.supplyId)&&integer(e.expectedRemaining))&&!(exact(e,['kind','objectId','expectedRevision'])&&([effectKinds.consume,effectKinds.destroy] as readonly string[]).includes(e.kind as string)&&reference(e.objectId)&&integer(e.expectedRevision))&&!(exact(e,['kind','objectId','expectedRevision','toHolder','toRegion'])&&e.kind===effectKinds.transfer&&reference(e.objectId)&&integer(e.expectedRevision)&&(e.toHolder===null||reference(e.toHolder))&&reference(e.toRegion))&&!(exact(e,['kind','objectId','expectedRevision','key','value'])&&e.kind===effectKinds.state&&reference(e.objectId)&&integer(e.expectedRevision)&&reference(e.key)&&typeof e.value==='string'&&e.value.length<=adjudicationLimits.maxValueLength)&&!(exact(e,['kind','targetId','recipient'])&&e.kind===effectKinds.grant&&reference(e.targetId)&&reference(e.recipient))&&!(exact(e,['kind','objectId'])&&e.kind===effectKinds.consent&&reference(e.objectId)))throw Error('裁定效果格式無效。');}
 if(v.status!=='accepted'&&bodyActivity)throw Error('未核准活動不能確認身體後果。');
 if(v.status!=='accepted'&&confirmedDurationMinutes!==undefined)throw Error('未核准活動不能宣稱完成耗時。');
 if(activityIdentity&&v.status!=='accepted')throw Error('未核准活動不能確認活動身份。');
 const candidate={...v,...(activityIdentity?{activityIdentity}:{}),...(resumable===undefined?{}:{resumable}),...(confirmedDurationMinutes===undefined?{}:{confirmedDurationMinutes})} as unknown as EffectCandidate;
 // Under the completion contract top-level effects are final results. A model
 // must put meaningful preparation in an explicitly timed stage instead.
 if(confirmedDurationMinutes!==undefined&&confirmedDurationMinutes>adjudicationLimits.minuteStep&&candidate.effects.length){
  const stages=candidate.stages||[],last=stages.at(-1);
  if(last&&last.afterMinutes>confirmedDurationMinutes)throw Error('活動階段超出確認完成時間。');
  if(last?.afterMinutes===confirmedDurationMinutes){
   if(last.effects.length+candidate.effects.length>adjudicationLimits.maxEffects)throw Error('完成階段效果超出範圍。');
   last.effects=[...candidate.effects,...last.effects];
  }else{
   if(stages.length>=adjudicationLimits.maxStages)throw Error('活動階段超出範圍。');
   stages.push({afterMinutes:confirmedDurationMinutes,preconditions:[],effects:candidate.effects});
  }
  candidate.effects=[];candidate.stages=stages;
 }
 if(confirmedDurationMinutes!==undefined&&candidate.stages?.length&&candidate.stages.at(-1)!.afterMinutes!==confirmedDurationMinutes)throw Error('最後階段須與確認完成時間一致。');
 return {...candidate,...(bodyActivity?{bodyActivity}:{}),...(explanation?{explanation}:{})};
}

export type LegacyRoutineApproval={family:'cafe-service';version:1|2;programs?:RoutineProgram[];operation?:RoutineOperation|null;subject?:string|null;timings:{operation:RoutineOperation;minutes:number}[]};
// OpenAI strict schemas require an object root and do not support cross-field
// if/then constraints. Describe the two branches on the supported fields;
// parseAdjudicationCandidate remains the authority for their joint invariants.
const legacyRoutineCandidateSchema={...effectCandidateSchema,properties:{...effectCandidateSchema.properties,completionMinutes:{...effectCandidateSchema.properties.completionMinutes,description:'routine 非 null 時必須為 null，唯一耗時來源是完整 routine.timings；routine=null 的一般完成目標 accepted 時才填正數，denied/unsupported 或開放式時段為 null。'},effects:{...effectCandidateSchema.properties.effects,description:'routine 非 null 的日常核准必須為空陣列；routine=null 的一般 accepted 必須在 effects/stages 提供可執行效果，或用非 null branches 提供受限結果分支，此時頂層 effects/stages 為空。'},stages:{...effectCandidateSchema.properties.stages,description:'routine 非 null 的日常核准必須為空陣列；一般活動階段依完成耗時契約。'},check:{...effectCandidateSchema.properties.check,description:'routine 非 null、denied 或 unsupported 時必須為 null。'},routine:{anyOf:[{type:'null'},{type:'object',properties:{family:{type:'string',enum:['cafe-service']},version:{type:'integer',enum:[1]},operation:{type:['string','null'],enum:[...routineOperations,null]},subject:{type:['string','null'],maxLength:40},timings:{type:'array',minItems:1,maxItems:routineOperations.length,items:{type:'object',properties:{operation:{type:'string',enum:routineOperations},minutes:{type:'number',exclusiveMinimum:0,maximum:adjudicationLimits.maxMinutes}},required:['operation','minutes'],additionalProperties:false}}},required:['family','version','operation','subject','timings'],additionalProperties:false}]}},required:[...effectCandidateSchema.required,'routine']};
const legacyApprovalSchema=legacyRoutineCandidateSchema.properties.routine.anyOf[1];
const routineV2CandidateSchema={...legacyRoutineCandidateSchema,properties:{...legacyRoutineCandidateSchema.properties,routine:{anyOf:[...legacyRoutineCandidateSchema.properties.routine.anyOf,{...legacyApprovalSchema,properties:{...legacyApprovalSchema.properties,version:{type:'integer',enum:[2]},programs:{type:'array',minItems:1,maxItems:routineOperations.length,items:routineProgramSchema}},required:[...(legacyApprovalSchema.required||[]),'programs']}]}}};
const routineWorldApprovalSchema={...legacyApprovalSchema,properties:{...legacyApprovalSchema.properties,version:{type:'integer',enum:[3]},operation:{type:'string',minLength:1,maxLength:60},timings:{type:'array',minItems:1,maxItems:routineWorldLimits.maxPrograms,items:variant({operation:{type:'string',minLength:1,maxLength:60},minutes:{type:'number',exclusiveMinimum:0,maximum:adjudicationLimits.maxMinutes}})},programs:{type:'array',minItems:1,maxItems:routineWorldLimits.maxPrograms,items:routineWorldProgramSchema}},required:[...(legacyApprovalSchema.required||[]),'programs']};
export const routineCandidateSchema={...routineV2CandidateSchema,$defs:{...routineV2CandidateSchema.$defs,routineEffect:symbolicEffectSchema(effectSchema),routineCondition:symbolicEffectSchema({anyOf:[stateConditionSchema,guardedStateConditionSchema]})},properties:{...routineV2CandidateSchema.properties,routine:{anyOf:[...routineV2CandidateSchema.properties.routine.anyOf,routineWorldApprovalSchema]}}};
export type RoutineApproval=LegacyRoutineApproval|RoutineWorldApproval;
export type AdjudicationCandidate = ({kind:'routine';approval:RoutineApproval}|{kind:'effects';candidate:EffectCandidate}) & {explanation?:AdjudicationExplanation};
export function parseAdjudicationCandidate(raw:string,scope:{routineOperations?:readonly string[];allowGenericMethods?:boolean}={}):AdjudicationCandidate {
 if(new TextEncoder().encode(raw).byteLength>routineWorldLimits.maxCandidateBytes)throw Error('裁定候選超出容量。');
 const parsed=JSON.parse(raw),approval=parsed?.routine;
 if(approval!=null&&Object.hasOwn(parsed,'bodyActivity')){if(parsed.bodyActivity!==null)throw Error('日常身體後果須逐program確認。');delete parsed.bodyActivity;}
 const explanation=parseExplanation(parsed?.explanation);
 if(parsed&&typeof parsed==='object')delete parsed.explanation;
 if(approval?.version!==3&&raw.length>adjudicationLimits.maxCandidateLength)throw Error('裁定候選超出容量。');
 if(approval!=null&&'activityIdentity' in parsed){if(parsed.activityIdentity!==null)throw Error('日常活動身份由已確認 operation 承接。');delete parsed.activityIdentity;}
 if(approval!=null&&parsed.branches===null)delete parsed.branches;
 if(approval!=null&&parsed.completionMinutes!==undefined){if(parsed.completionMinutes!==null)throw Error('日常耗時須由整組規則確認。');delete parsed.completionMinutes;}
 if(approval===undefined||approval===null){if(parsed&&typeof parsed==='object')delete parsed.routine;return {kind:'effects',candidate:parseEffectCandidate(JSON.stringify({...parsed,...(explanation?{explanation}:{})})),...(explanation?{explanation}:{})};}
 if(approval!=null&&parsed.resumable!==undefined){if(parsed.resumable!==false)throw Error('日常可暫停須在方法程序確認。');delete parsed.resumable;}
 const approvalKeys=approval&&typeof approval==='object'?Object.keys(approval).sort().join(','):'';
 if(approval?.version===3){
  if(Object.keys(parsed).sort().join(',')!=='check,effects,routine,stages,status'||parsed.status!=='accepted'||parsed.check!==null||!Array.isArray(parsed.effects)||parsed.effects.length||!Array.isArray(parsed.stages)||parsed.stages.length||approvalKeys!=='family,operation,programs,subject,timings,version'||approval.family!=='cafe-service'||typeof approval.operation!=='string'||!approval.operation.trim()||approval.operation.length>60||approval.subject!==null&&(typeof approval.subject!=='string'||!approval.subject.length||approval.subject.length>40)||!Array.isArray(approval.timings)||!approval.timings.length||approval.timings.length>routineWorldLimits.maxPrograms||new Set(approval.timings.map((time:{operation:unknown})=>time?.operation)).size!==approval.timings.length)throw Error('通用日常核准格式無效。');
  for(const time of approval.timings){if(!exact(time,['operation','minutes'])||typeof time.operation!=='string'||!time.operation.trim()||time.operation.length>60)throw Error('通用日常耗時格式無效。');scheduleCompletionMinutes(time.minutes);}
  const offered=scope.routineOperations;
  if(offered){
   if(offered.includes(approval.operation)){if(approval.timings.length!==offered.length||approval.timings.some((time:{operation:string})=>!offered.includes(time.operation)))throw Error('日常範圍須完整涵蓋本次允許活動。');}
   else if(!scope.allowGenericMethods||approval.timings.length!==1||approval.timings[0].operation!==approval.operation)throw Error('新日常方法未在本次允許範圍。');
  }
  validateRoutineWorldPrograms(approval.programs,approval.timings);
  return {kind:'routine',approval:approval as RoutineWorldApproval,...(explanation?{explanation}:{})};
 }

 if(approval?.version===2){
  if(Object.keys(parsed).sort().join(',')!=='check,effects,routine,stages,status'||parsed.status!=='accepted'||parsed.check!==null||!Array.isArray(parsed.effects)||parsed.effects.length||!Array.isArray(parsed.stages)||parsed.stages.length||approvalKeys!=='family,operation,programs,subject,timings,version'||approval.family!=='cafe-service'||!Array.isArray(approval.timings))throw Error('日常模型程序核准格式無效。');
  validateRoutinePrograms(approval.programs,approval.timings);
 }else if(Object.keys(parsed).sort().join(',')!=='check,effects,routine,stages,status'||parsed.status!=='accepted'||parsed.check!==null||!Array.isArray(parsed.effects)||parsed.effects.length||!Array.isArray(parsed.stages)||parsed.stages.length||!['family,timings,version','family,operation,timings,version','family,operation,subject,timings,version'].includes(approvalKeys)||approval.family!=='cafe-service'||approval.version!==1||approval.operation!=null&&!routineOperations.includes(approval.operation)||approval.subject!=null&&(typeof approval.subject!=='string'||!approval.subject.length||approval.subject.length>40))throw Error('日常規則核准格式無效。');
 if(approval.operation!=null&&!routineOperations.includes(approval.operation)||approval.subject!=null&&(typeof approval.subject!=='string'||!approval.subject.length||approval.subject.length>40))throw Error('日常選擇格式無效。');
 if(!Array.isArray(approval.timings)||!approval.timings.length||approval.timings.length>routineOperations.length||new Set(approval.timings.map((t:{operation:unknown})=>t?.operation)).size!==approval.timings.length||approval.timings.some((t:unknown)=>!exact(t,['operation','minutes'])||!routineOperations.includes(t.operation as RoutineOperation)))throw Error('日常耗時格式無效。');
 for(const timing of approval.timings)scheduleCompletionMinutes(timing.minutes);
 if(scope.routineOperations&&(approval.timings.length!==scope.routineOperations.length||approval.timings.some((timing:{operation:RoutineOperation})=>!scope.routineOperations!.includes(timing.operation))))throw Error('日常範圍須完整涵蓋本次允許活動。');
 return {kind:'routine',approval:approval as RoutineApproval,...(explanation?{explanation}:{})};
}


export function adjudicationRules(routinePrograms:boolean):string[]{
 return [
      ...(routinePrograms?[...routineProgramRules,...routineWorldRules]:[]),
      `只裁定當前提案，不產生背景事件。日常核准與一般效果互斥：routineOffer 非空且普通活動符合時，可依 version=2 舊程序或優先 version=3 通用程序確認本次 operation、subject、完整timings與programs；v3新方法在明示genericMethods受限範圍內一次確認。version=1空效果核准僅供舊候選相容，不用於新確認。日常封套皆accepted、check=null、effects=[]、stages=[]、completionMinutes=null、branches=null。核准不是已執行效果，程式依當前合法物件及背景承接。完整 routine.timings 是唯一耗時來源；v1/v2與v3使用原operation時必須恰好涵蓋 routineOffer.operations 各一次，v3 generic新方法則只列自己的operation一次，每項 {operation,minutes} 為正數且至多${adjudicationLimits.maxMinutes}；依方法及場所確認，不固定茶或咖啡時間。NPC durationMinutes 只是估時，程式向上對齊${adjudicationLimits.minuteStep}分鐘。v1/v2 subject 選模板 subjects；v3 subject 明示本次有界主題，餐點須指明種類、飲用須區分茶／咖啡／泛指飲品，其他可 null。按語義解讀單份普通活動，不要求範例原句。物資留白可依場所確認普通背景，但明確缺貨、損壞、權限優先。未確認的特殊方法、大量規模、代他人授權與強制交付不屬日常核准；不適用則 routine=null，沿一般受限效果契約。禁止額外規則、背景或 world patch。`,
      '不得擲骰、指定骰值、最終級別或他人意願；程式驗證、判定並提交。',
 ];
}
