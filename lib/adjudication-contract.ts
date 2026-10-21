import type { Effect, EffectCandidate, ActivityPhase, ResultBranch } from './world-effects';
import type { Outcome } from './d20';

// Shared bounds drive prompt, provider schema and local candidate validation.
// This module accepts no World and performs no binding, randomness or effects.
export const adjudicationLimits = {
 statuses: ['accepted','denied','unsupported'],
 difficulties: [8,12,16],
 outcomes: ['critical-success','success','mixed','failure','critical-failure'],
 phaseMinutes: [15,30,45,60,75,90],
 maxMinutes: 90,
 minuteStep: 15,
 maxEffects: 4,
 maxStages: 4,
 maxBranches: 5,
 maxConditions: 4,
 maxStateEntries: 8,
 maxCandidateLength: 8192,
 maxReferenceLength: 120,
 maxValueLength: 100,
} as const;
// These rules are sent with the schema: JSON shape alone cannot teach the model
// identity, sequential revisions or the authority required by applyEffects.
export const effectRules = [
 `共同界線：status=${adjudicationLimits.statuses.join('/')}；effects 至多${adjudicationLimits.maxEffects}；stages 至多${adjudicationLimits.maxStages}；completionMinutes 必須是正數且至多${adjudicationLimits.maxMinutes}，向上對齊${adjudicationLimits.minuteStep}分鐘；階段時點=${adjudicationLimits.phaseMinutes.join('/')}；不確定難度=${adjudicationLimits.difficulties.join('/')}。`,
 '一般效果分支（routine=null）的 accepted 必須包含至少一個可執行效果或活動階段，或以非 null branches 確認結果分支；舊版日常核准分支（routine.version=1）只能 accepted、effects=[]、stages=[]、check=null、completionMinutes=null、branches=null，由完整 routine.timings 提供唯一耗時並交程式承接；前提不成立回傳 denied，目前效果無法表達的方法回傳 unsupported。兩者 effects/stages 為空且 check=null，不虛構成功。',
 'effects 依陣列順序執行，後一效果使用前一效果產生的狀態。expectedRevision 必須等於該步執行前的版本；state、transfer、consume、destroy 每次加一，grant、consent 不改版本。',
 'materialize：僅使用本地、已知、allowedTo 含 actor.id 且 remaining>0 的供應，expectedRemaining 等於當前庫存。產生 supplies.materializedObjectId，revision=1、holder=actor.id、owner 保留供應所有者，庫存減一。供應 id 不能當作 objectId。',
 'consume：僅 food 且 holder=actor.id 才可食用，之後 lifecycle=consumed、holder=null，不會補貨。桌上食物必須先 transfer 拿取再 consume，第二步版本加一。不能 consume 杯子或茶具；飲用杯中液體須用支援的 state 轉換，無法表達時 unsupported。',
 '物件效果必須使用已知、active、本地、owner=actor.id 或 allowedTo 含 actor.id 的物件；物件須由 actor 持有，或無人持有且 actor 看得到。不可操作其他角色持有的物件。',
 'transfer：toRegion 必須是 actor 當前 region；toHolder=null 是放下，toHolder=actor.id 是拿取。交給其他角色需要同區域、allowedTo 與該角色先前 consent 形成的 acceptedBy；不能代對方同意。移動另用 NPC move，不得遠端轉移。',
 'grant：僅物件或供應的 owner 角色自己提出，且目標已知、可見、本地，recipient 須在場可見。只增加使用權與知情，不轉移 holder 或 owner。口頭台詞不等於 grant，借用者不能代所有者授權。',
 'consent：當前角色對已知、可見、active 且 allowedTo 允許的物件同意接收；增加 actor.id 至 acceptedBy。destroy 只能毀壞自己所有的物件，不能毀壞借來物品。',
 'state：key/value 必須在物件 stateTransitions 內且改變目前值，不得新增任意欄位。所有效果均不能更換物件 kind、owner 或隱含生成替代物。',
 `completionMinutes：一般效果分支（routine=null）有完成目標且 accepted 時，依方法與當下條件確認完成所需合理分鐘（有限正數，至多${adjudicationLimits.maxMinutes}）；一般 durationMinutes 只是角色估時。程式向上對齊${adjudicationLimits.minuteStep}。denied/unsupported 或開放式時段回傳 null。授權與同意是一次性選擇，耗時${adjudicationLimits.minuteStep}。stages：只列少數有意義的進度；afterMinutes 依序遞增且不超過對齊後完成時間，最後一階段在完成時間；完整成品不能提前產生。完成契約的頂層 effects 是最終成果，即使已有 stages 也在完成時間執行；準備工作須列在明確時點的 stages。食物 materialize 會生成可食用的完整物件，只能在確認完成時點；不以早期階段冒充部分食物。最終階段連同頂層 effects 合計最多${adjudicationLimits.maxEffects}項。preconditions 使用當階段執行前的版本、region、holder 與 state（key/value 陣列）；後續階段引用先前效果遞增後的版本。階段不能包含 grant、consent 或需要其他角色新同意的交付。`,
 `結果分支：routine=null 的完成活動可用 branches 確認 1 至 ${adjudicationLimits.maxBranches} 組 {outcomes,effects,stages}，此時頂層 effects/stages 必須空。outcomes 必須恰好各涵蓋 ${adjudicationLimits.outcomes.join("/")} 一次，可共用後果；每組沿相同受限效果及時間契約，失敗可消耗、部分成果用合法狀態表示，不能自動套用成功效果。確定活動 check=null 時僅一組涵蓋全部級別；不擲骰。無變化的失敗分支允許空效果，仍消耗確認時間。所有分支在擲骰前驗證。不確定自由活動 target 必須是當前可知具體物件／供應；改措辭、難度或分支表示不取得重擲資格。branches=null 保留舊效果契約。`,
 '例如供應 meal 的 materializedObjectId="meal:1"：effects=[{kind:"materialize",supplyId:"meal",expectedRemaining:1},{kind:"consume",objectId:"meal:1",expectedRevision:1}]。桌上 revision=1 的 food 則先 transfer(expectedRevision=1,toHolder=actor.id,toRegion=actor.region)，再 consume(expectedRevision=2)。',
 `確定可行的日常活動 check=null。只有合法且結果不確定的嘗試可提出 difficulty=${adjudicationLimits.difficulties.join("/")} 與相關 ability；不得擲骰或指定結果。`,
];
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>k in value);
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const reference=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=adjudicationLimits.maxReferenceLength;
const variant=(properties:Record<string,object>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const effectSchema={anyOf:[variant({kind:{const:'transfer',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'},toHolder:{anyOf:[{type:'null'},{type:'string'}]},toRegion:{type:'string'}}),variant({kind:{const:'state',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'},key:{type:'string'},value:{type:'string'}}),variant({kind:{const:'grant',type:'string'},targetId:{type:'string'},recipient:{type:'string'}}),variant({kind:{const:'consent',type:'string'},objectId:{type:'string'}}),variant({kind:{const:'destroy',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'}}),variant({kind:{const:'materialize',type:'string'},supplyId:{type:'string'},expectedRemaining:{type:'integer'}}),variant({kind:{const:'consume',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'}})]};
const phaseConditionSchema=variant({objectId:{type:'string'},revision:{type:'integer'},region:{type:'string'},holder:{anyOf:[{type:'null'},{type:'string'}]},state:{type:'array',maxItems:adjudicationLimits.maxStateEntries,items:variant({key:{type:'string'},value:{type:'string'}})}});
const effectReference={$ref:'#/$defs/effect'};
const phaseReference={$ref:'#/$defs/phase'};
const phaseSchema=variant({afterMinutes:{type:'integer',enum:[...adjudicationLimits.phaseMinutes]},preconditions:{type:'array',maxItems:adjudicationLimits.maxConditions,items:phaseConditionSchema},effects:{type:'array',minItems:1,maxItems:adjudicationLimits.maxEffects,items:effectReference}});
const outcomes:readonly Outcome[]=adjudicationLimits.outcomes;
const branchSchema=variant({outcomes:{type:'array',minItems:1,maxItems:adjudicationLimits.maxBranches,items:{type:'string',enum:outcomes}},effects:{type:'array',maxItems:adjudicationLimits.maxEffects,items:effectReference},stages:{type:'array',maxItems:adjudicationLimits.maxStages,items:phaseReference}});
export const effectCandidateSchema={...variant({branches:{anyOf:[{type:'null'},{type:'array',minItems:1,maxItems:adjudicationLimits.maxBranches,items:branchSchema}]},completionMinutes:{anyOf:[{type:'null'},{type:'number',exclusiveMinimum:0,maximum:adjudicationLimits.maxMinutes}]},stages:{type:'array',maxItems:adjudicationLimits.maxStages,items:phaseReference},status:{type:'string',enum:[...adjudicationLimits.statuses]},effects:{type:'array',maxItems:adjudicationLimits.maxEffects,items:effectReference},check:{anyOf:[{type:'null'},variant({difficulty:{type:'integer',enum:[...adjudicationLimits.difficulties]},ability:{type:'string',maxLength:adjudicationLimits.maxValueLength}})]}}),$defs:{effect:effectSchema,phase:phaseSchema}};
export function scheduleCompletionMinutes(value:unknown):number {
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>adjudicationLimits.maxMinutes)throw Error('完成耗時必須是至多九十分鐘的有限正數。');
 return Math.ceil(value/adjudicationLimits.minuteStep)*adjudicationLimits.minuteStep;
}
export function parseEffectCandidate(raw:string):EffectCandidate{
 let v:unknown;try{v=JSON.parse(raw);}catch{throw Error('裁定未回傳有效候選。');}
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
   if(envelope.check!==null&&(!exact(envelope.check,['difficulty','ability'])||!(adjudicationLimits.difficulties as readonly number[]).includes(envelope.check.difficulty as number)||!reference(envelope.check.ability)))throw Error('裁定不可指定骰值或結果。');
   return {status:'accepted',effects:[],stages:[],check:envelope.check as EffectCandidate['check'],confirmedDurationMinutes:duration,branches:parsed};
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
    if(p&&typeof p==='object'&&Array.isArray(p.state)){const entries=p.state;if(entries.some((entry:unknown)=>!exact(entry,['key','value'])||!reference(entry.key)||typeof entry.value!=='string'||entry.value.length>adjudicationLimits.maxValueLength)||new Set(entries.map((entry:{key:string})=>entry.key)).size!==entries.length)throw Error('活動狀態前提格式無效。');p.state=Object.fromEntries(entries.map((entry:{key:string;value:string})=>[entry.key,entry.value]));}
    if(!exact(p,['objectId','revision','region','holder','state'])||!reference(p.objectId)||!integer(p.revision)||!reference(p.region)||(p.holder!==null&&!reference(p.holder))||!p.state||typeof p.state!=='object'||Array.isArray(p.state)||Object.keys(p.state).length>adjudicationLimits.maxStateEntries||Object.entries(p.state).some(([k,val])=>!reference(k)||typeof val!=='string'||val.length>adjudicationLimits.maxValueLength))throw Error('活動前提格式無效。');
   }
   parseEffectCandidate(JSON.stringify({status:'accepted',effects:stage.effects,check:null}));
   if(stage.effects.some((e:Effect)=>e.kind==='grant'||e.kind==='consent'))throw Error('活動階段不能代替他人作新選擇。');
  }
 }
 if(v.status==='accepted'&&!v.effects.length&&!(Array.isArray(v.stages)&&v.stages.length))throw Error('通過候選必須包含可執行世界效果。');
 if(v.status!=='accepted'&&(v.effects.length||(Array.isArray(v.stages)&&v.stages.length)))throw Error('否決候選不能含世界效果。');
 if(v.check!==null&&(!exact(v.check,['difficulty','ability'])||!(adjudicationLimits.difficulties as readonly number[]).includes(v.check.difficulty as number)||!reference(v.check.ability)))throw Error('裁定不可指定骰值或結果。');
 for(const e of v.effects){if(!(exact(e,['kind','supplyId','expectedRemaining'])&&e.kind==='materialize'&&reference(e.supplyId)&&integer(e.expectedRemaining))&&!(exact(e,['kind','objectId','expectedRevision'])&&['consume','destroy'].includes(e.kind as string)&&reference(e.objectId)&&integer(e.expectedRevision))&&!(exact(e,['kind','objectId','expectedRevision','toHolder','toRegion'])&&e.kind==='transfer'&&reference(e.objectId)&&integer(e.expectedRevision)&&(e.toHolder===null||reference(e.toHolder))&&reference(e.toRegion))&&!(exact(e,['kind','objectId','expectedRevision','key','value'])&&e.kind==='state'&&reference(e.objectId)&&integer(e.expectedRevision)&&reference(e.key)&&typeof e.value==='string'&&e.value.length<=adjudicationLimits.maxValueLength)&&!(exact(e,['kind','targetId','recipient'])&&e.kind==='grant'&&reference(e.targetId)&&reference(e.recipient))&&!(exact(e,['kind','objectId'])&&e.kind==='consent'&&reference(e.objectId)))throw Error('裁定效果格式無效。');}
 if(v.status!=='accepted'&&confirmedDurationMinutes!==undefined)throw Error('未核准活動不能宣稱完成耗時。');
 const candidate={...v,...(confirmedDurationMinutes===undefined?{}:{confirmedDurationMinutes})} as unknown as EffectCandidate;
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
 return candidate;
}
