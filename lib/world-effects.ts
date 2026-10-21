import type { Action, Character, World } from './world';
import { canSee, regionOf, regions } from './perception';
import { record } from './world';
import { usableRoutineObject } from './routine-materials';
import { judgeD20, rollD20, type Difficulty, type Advantage } from './d20';

// Legacy tea changes physical objects too; it must use the same verified effects.
export function requiresWorldEffects(action: Action): boolean {
 return action.type === 'propose' || action.type === 'work' && action.target === 'tea';
}

export type SceneSupply={pending?:boolean;availableAt?:number;background?:{ruleId:string;sequence:number};id:string;label:string;region:string;remaining:number;owner:string;knownTo:string[];allowedTo:string[];kind:'food'|'utensil';initialState:Record<string,string>;stateTransitions?:Record<string,string[]>};
export type WorldObject={id:string;source:string;label:string;region:string;holder:string|null;owner:string;revision:number;state:Record<string,string>;lifecycle:'active'|'consumed'|'destroyed';kind:'food'|'utensil';knownTo:string[];allowedTo:string[];stateTransitions?:Record<string,string[]>;acceptedBy?:string[]};
export type Effect={kind:'materialize';supplyId:string;expectedRemaining:number}|{kind:'consume';objectId:string;expectedRevision:number}|{kind:'destroy';objectId:string;expectedRevision:number}|{kind:'transfer';objectId:string;expectedRevision:number;toHolder:string|null;toRegion:string}|{kind:'state';objectId:string;expectedRevision:number;key:string;value:string}|{kind:'grant';targetId:string;recipient:string}|{kind:'consent';objectId:string};
export type PhaseCondition={objectId:string;revision:number;region:string;holder:string|null;state:Record<string,string>};
export type ActivityPhase={afterMinutes:number;preconditions:PhaseCondition[];effects:Effect[];requiredTools?:string[]};
export type EffectCandidate={preparationSupplies?:string[];confirmedDurationMinutes?:number;blockedReason?:string;stages?:ActivityPhase[];status:'accepted'|'denied'|'unsupported';effects:Effect[];check:{difficulty:Difficulty;ability:string}|null};
export class EffectValidationError extends Error {
 constructor(message:string, public readonly details:Record<string,unknown>) { super(message); }
}
// These rules are sent with the schema: JSON shape alone cannot teach the model
// identity, sequential revisions or the authority required by applyEffects.
const effectRules = [
 '一般效果分支（routine=null）的 accepted 必須包含至少一個可執行效果或活動階段；日常核准分支（routine 非 null）只能 accepted、effects=[]、stages=[]、check=null、completionMinutes=null，由完整 routine.timings 提供唯一耗時並交程式承接；前提不成立回傳 denied，目前效果無法表達的方法回傳 unsupported。兩者 effects/stages 為空且 check=null，不虛構成功。',
 'effects 依陣列順序執行，後一效果使用前一效果產生的狀態。expectedRevision 必須等於該步執行前的版本；state、transfer、consume、destroy 每次加一，grant、consent 不改版本。',
 'materialize：僅使用本地、已知、allowedTo 含 actor.id 且 remaining>0 的供應，expectedRemaining 等於當前庫存。產生 supplies.materializedObjectId，revision=1、holder=actor.id、owner 保留供應所有者，庫存減一。供應 id 不能當作 objectId。',
 'consume：僅 food 且 holder=actor.id 才可食用，之後 lifecycle=consumed、holder=null，不會補貨。桌上食物必須先 transfer 拿取再 consume，第二步版本加一。不能 consume 杯子或茶具；飲用杯中液體須用支援的 state 轉換，無法表達時 unsupported。',
 '物件效果必須使用已知、active、本地、owner=actor.id 或 allowedTo 含 actor.id 的物件；物件須由 actor 持有，或無人持有且 actor 看得到。不可操作其他角色持有的物件。',
 'transfer：toRegion 必須是 actor 當前 region；toHolder=null 是放下，toHolder=actor.id 是拿取。交給其他角色需要同區域、allowedTo 與該角色先前 consent 形成的 acceptedBy；不能代對方同意。移動另用 NPC move，不得遠端轉移。',
 'grant：僅物件或供應的 owner 角色自己提出，且目標已知、可見、本地，recipient 須在場可見。只增加使用權與知情，不轉移 holder 或 owner。口頭台詞不等於 grant，借用者不能代所有者授權。',
 'consent：當前角色對已知、可見、active 且 allowedTo 允許的物件同意接收；增加 actor.id 至 acceptedBy。destroy 只能毀壞自己所有的物件，不能毀壞借來物品。',
 'state：key/value 必須在物件 stateTransitions 內且改變目前值，不得新增任意欄位。所有效果均不能更換物件 kind、owner 或隱含生成替代物。',
 'completionMinutes：一般效果分支（routine=null）有完成目標且 accepted 時，依方法與當下條件確認完成所需合理分鐘（有限正數，至多90）；一般 durationMinutes 只是角色估時。程式向上對齊15。denied/unsupported 或開放式時段回傳 null。授權與同意是一次性選擇，耗時15。stages：只列少數有意義的進度；afterMinutes 依序遞增且不超過對齊後完成時間，最後一階段在完成時間；完整成品不能提前產生。完成契約的頂層 effects 是最終成果，即使已有 stages 也在完成時間執行；準備工作須列在明確時點的 stages。食物 materialize 會生成可食用的完整物件，只能在確認完成時點；不以早期階段冒充部分食物。最終階段連同頂層 effects 合計最多4項。preconditions 使用當階段執行前的版本、region、holder 與 state（key/value 陣列）；後續階段引用先前效果遞增後的版本。階段不能包含 grant、consent 或需要其他角色新同意的交付。',
 '例如供應 meal 的 materializedObjectId="meal:1"：effects=[{kind:"materialize",supplyId:"meal",expectedRemaining:1},{kind:"consume",objectId:"meal:1",expectedRevision:1}]。桌上 revision=1 的 food 則先 transfer(expectedRevision=1,toHolder=actor.id,toRegion=actor.region)，再 consume(expectedRevision=2)。',
 '確定可行的日常活動 check=null。只有合法且結果不確定的嘗試可提出 difficulty=8/12/16 與相關 ability；不得擲骰或指定結果。',
];
const materializedObjectId = (supply: SceneSupply) => `${supply.id}:${supply.background?.sequence??supply.remaining}`;
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>k in value);
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const reference=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=120;
const variant=(properties:Record<string,object>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const effectSchema={anyOf:[variant({kind:{const:'transfer',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'},toHolder:{anyOf:[{type:'null'},{type:'string'}]},toRegion:{type:'string'}}),variant({kind:{const:'state',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'},key:{type:'string'},value:{type:'string'}}),variant({kind:{const:'grant',type:'string'},targetId:{type:'string'},recipient:{type:'string'}}),variant({kind:{const:'consent',type:'string'},objectId:{type:'string'}}),variant({kind:{const:'destroy',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'}}),variant({kind:{const:'materialize',type:'string'},supplyId:{type:'string'},expectedRemaining:{type:'integer'}}),variant({kind:{const:'consume',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'}})]};
const phaseConditionSchema=variant({objectId:{type:'string'},revision:{type:'integer'},region:{type:'string'},holder:{anyOf:[{type:'null'},{type:'string'}]},state:{type:'array',maxItems:8,items:variant({key:{type:'string'},value:{type:'string'}})}});
const phaseSchema=variant({afterMinutes:{type:'integer',enum:[15,30,45,60,75,90]},preconditions:{type:'array',maxItems:4,items:phaseConditionSchema},effects:{type:'array',minItems:1,maxItems:4,items:effectSchema}});
export const effectCandidateSchema=variant({completionMinutes:{anyOf:[{type:'null'},{type:'number',exclusiveMinimum:0,maximum:90}]},stages:{type:'array',maxItems:4,items:phaseSchema},status:{type:'string',enum:['accepted','denied','unsupported']},effects:{type:'array',maxItems:4,items:effectSchema},check:{anyOf:[{type:'null'},variant({difficulty:{type:'integer',enum:[8,12,16]},ability:{type:'string',maxLength:100}})]}});
export function scheduleCompletionMinutes(value:unknown):number {
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>90)throw Error('完成耗時必須是至多九十分鐘的有限正數。');
 return Math.ceil(value/15)*15;
}
export function parseEffectCandidate(raw:string):EffectCandidate{
 let v:unknown;try{v=JSON.parse(raw);}catch{throw Error('裁定未回傳有效候選。');}
 let confirmedDurationMinutes:number|undefined;
 if(v&&typeof v==='object'&&!Array.isArray(v)&&'completionMinutes' in v){
  const completion=(v as Record<string,unknown>).completionMinutes;
  if(completion!==null)confirmedDurationMinutes=scheduleCompletionMinutes(completion);
  delete (v as Record<string,unknown>).completionMinutes;
 }
 if(raw.length>8192||!((exact(v,['status','effects','check']))||(exact(v,['status','effects','check','stages'])))||!['accepted','denied','unsupported'].includes(v.status as string)||!Array.isArray(v.effects)||v.effects.length>4)throw Error('裁定候選格式無效。');
 if(v.stages!==undefined){
  if(!Array.isArray(v.stages)||v.stages.length>4)throw Error('活動階段超出範圍。');
  let previous=0;
  for(const stage of v.stages){
   if(!exact(stage,['afterMinutes','preconditions','effects'])||![15,30,45,60,75,90].includes(stage.afterMinutes as number)||(stage.afterMinutes as number)<=previous||!Array.isArray(stage.preconditions)||stage.preconditions.length>4||!Array.isArray(stage.effects)||!stage.effects.length)throw Error('活動階段格式無效。');
   previous=stage.afterMinutes as number;
   for(const p of stage.preconditions){
    if(p&&typeof p==='object'&&Array.isArray(p.state)){const entries=p.state;if(entries.some((entry:unknown)=>!exact(entry,['key','value'])||!reference(entry.key)||typeof entry.value!=='string'||entry.value.length>100)||new Set(entries.map((entry:{key:string})=>entry.key)).size!==entries.length)throw Error('活動狀態前提格式無效。');p.state=Object.fromEntries(entries.map((entry:{key:string;value:string})=>[entry.key,entry.value]));}
    if(!exact(p,['objectId','revision','region','holder','state'])||!reference(p.objectId)||!integer(p.revision)||!reference(p.region)||(p.holder!==null&&!reference(p.holder))||!p.state||typeof p.state!=='object'||Array.isArray(p.state)||Object.keys(p.state).length>8||Object.entries(p.state).some(([k,val])=>!reference(k)||typeof val!=='string'||val.length>100))throw Error('活動前提格式無效。');
   }
   parseEffectCandidate(JSON.stringify({status:'accepted',effects:stage.effects,check:null}));
   if(stage.effects.some((e:Effect)=>e.kind==='grant'||e.kind==='consent'))throw Error('活動階段不能代替他人作新選擇。');
  }
 }
 if(v.status==='accepted'&&!v.effects.length&&!(Array.isArray(v.stages)&&v.stages.length))throw Error('通過候選必須包含可執行世界效果。');
 if(v.status!=='accepted'&&(v.effects.length||(Array.isArray(v.stages)&&v.stages.length)))throw Error('否決候選不能含世界效果。');
 if(v.check!==null&&(!exact(v.check,['difficulty','ability'])||![8,12,16].includes(v.check.difficulty as number)||!reference(v.check.ability)))throw Error('裁定不可指定骰值或結果。');
 for(const e of v.effects){if(!(exact(e,['kind','supplyId','expectedRemaining'])&&e.kind==='materialize'&&reference(e.supplyId)&&integer(e.expectedRemaining))&&!(exact(e,['kind','objectId','expectedRevision'])&&['consume','destroy'].includes(e.kind as string)&&reference(e.objectId)&&integer(e.expectedRevision))&&!(exact(e,['kind','objectId','expectedRevision','toHolder','toRegion'])&&e.kind==='transfer'&&reference(e.objectId)&&integer(e.expectedRevision)&&(e.toHolder===null||reference(e.toHolder))&&reference(e.toRegion))&&!(exact(e,['kind','objectId','expectedRevision','key','value'])&&e.kind==='state'&&reference(e.objectId)&&integer(e.expectedRevision)&&reference(e.key)&&typeof e.value==='string'&&e.value.length<=100)&&!(exact(e,['kind','targetId','recipient'])&&e.kind==='grant'&&reference(e.targetId)&&reference(e.recipient))&&!(exact(e,['kind','objectId'])&&e.kind==='consent'&&reference(e.objectId)))throw Error('裁定效果格式無效。');}
 if(v.status!=='accepted'&&confirmedDurationMinutes!==undefined)throw Error('未核准活動不能宣稱完成耗時。');
 const candidate={...v,...(confirmedDurationMinutes===undefined?{}:{confirmedDurationMinutes})} as unknown as EffectCandidate;
 // Under the completion contract top-level effects are final results. A model
 // must put meaningful preparation in an explicitly timed stage instead.
 if(confirmedDurationMinutes!==undefined&&confirmedDurationMinutes>15&&candidate.effects.length){
  const stages=candidate.stages||[],last=stages.at(-1);
  if(last&&last.afterMinutes>confirmedDurationMinutes)throw Error('活動階段超出確認完成時間。');
  if(last?.afterMinutes===confirmedDurationMinutes){
   if(last.effects.length+candidate.effects.length>4)throw Error('完成階段效果超出範圍。');
   last.effects=[...candidate.effects,...last.effects];
  }else{
   if(stages.length>=4)throw Error('活動階段超出範圍。');
   stages.push({afterMinutes:confirmedDurationMinutes,preconditions:[],effects:candidate.effects});
  }
  candidate.effects=[];candidate.stages=stages;
 }
 return candidate;
}
export function knownWorldObjects(w:World,c:Character){
 return (w.objects||[]).filter(o=>o.lifecycle==='active'&&(o.holder===c.id||o.knownTo.includes(c.id)&&canSee(w,c,o.region))).map(o=>({id:o.id,label:o.label,region:o.region,holder:o.holder,state:o.state,revision:o.revision,kind:o.kind}));
}
export function knownWorldSupplies(w:World,c:Character){
 return (w.supplies||[]).filter(s=>!s.pending&&(s.availableAt===undefined||w.minute>=s.availableAt)&&s.knownTo.includes(c.id)&&canSee(w,c,s.region)).map(s=>({id:s.id,label:s.label,region:s.region,kind:s.kind}));
}
export function authorityForProposal(w:World,c:Character){
 const objects=knownWorldObjects(w,c).map(o=>w.objects!.find(full=>full.id===o.id)!);
 const supplies=knownWorldSupplies(w,c).map(s=>w.supplies!.find(full=>full.id===s.id)!);
 return {objects,supplies:supplies.map(s=>({...s,materializedObjectId:s.remaining>0?materializedObjectId(s):null})),effectContractVersion:'world-effects.v2',effectRules,effectContract:effectCandidateSchema};
}
function applyEffects(w:World,c:Character,effects:Effect[],phaseIndex:number|null=null):string[]{
 const results:string[]=[];
 for(const [effectIndex,e] of effects.entries()){
  const fail:(reason:string,message:string)=>never=(reason,message)=>{
   const id='objectId' in e?e.objectId:'supplyId' in e?e.supplyId:e.targetId;
   throw new EffectValidationError(message,{reason,phaseIndex,effectIndex,effect:e,actorRegion:regionOf(c),actual:structuredClone(w.objects?.find(o=>o.id===id)||w.supplies?.find(s=>s.id===id)||null)});
  };
  if(e.kind==='materialize'){
   const s=w.supplies?.find(s=>s.id===e.supplyId);
   if(!s||s.remaining!==e.expectedRemaining||!Number.isSafeInteger(s.remaining)||s.remaining<=0||(s.pending&&phaseIndex===null)||(s.availableAt!==undefined&&w.minute<s.availableAt)||!s.knownTo.includes(c.id)||!s.allowedTo.includes(c.id)||s.region!==regionOf(c))fail('supply_precondition','裁定供應前提無效。');
   if((w.objects?.length||0)>=512)fail('object_capacity','具體物件已達保存容量。');
   const id=materializedObjectId(s);
   if(w.objects?.some(o=>o.id===id))fail('identity_used','供應身份已被使用。');
   const o:WorldObject={id,source:s.id,label:s.label,region:s.region,holder:c.id,owner:s.owner,revision:1,state:{...s.initialState},lifecycle:'active',kind:s.kind,knownTo:[...s.knownTo],allowedTo:[...s.allowedTo],...(s.stateTransitions?{stateTransitions:structuredClone(s.stateTransitions)}:{})};
   (w.objects??=[]).push(o);delete s.pending;if(s.background)s.background.sequence++;else s.remaining--;results.push(`取得${o.label}`);
  }else if(e.kind==='grant'){
   const target=w.objects?.find(o=>o.id===e.targetId)||w.supplies?.find(s=>s.id===e.targetId);
   const recipient=w.characters.find(x=>x.id===e.recipient);
   if(!target||!target.knownTo.includes(c.id)||!canSee(w,c,target.region)||target.owner!==c.id||target.region!==regionOf(c)||!recipient||!canSee(w,c,regionOf(recipient))||('lifecycle' in target&&target.lifecycle!=='active'))fail('owner_consent','無權代替所有者同意。');
   if(!target.allowedTo.includes(recipient.id))target.allowedTo.push(recipient.id);
   if(!target.knownTo.includes(recipient.id))target.knownTo.push(recipient.id);
   results.push(`同意 ${recipient.name} 使用${target.label}`);
  }else if(e.kind==='consent'){
   const o=w.objects?.find(o=>o.id===e.objectId);
   if(!o||o.lifecycle!=='active'||!o.knownTo.includes(c.id)||!canSee(w,c,o.region)||!o.allowedTo.includes(c.id))fail('receiving_consent','無法同意接收未知或未獲准物件。');
   o.acceptedBy=[...new Set([...(o.acceptedBy||[]),c.id])];results.push(`同意接收${o.label}`);
  }else{
   const o=w.objects?.find(o=>o.id===e.objectId);
   if(!o||o.revision!==e.expectedRevision||o.lifecycle!=='active'||o.region!==regionOf(c)||!(o.owner===c.id||o.allowedTo.includes(c.id))||!(o.holder===c.id||o.holder===null&&o.knownTo.includes(c.id)&&canSee(w,c,o.region)))fail('object_precondition','裁定物件前提無效。');
   if(e.kind==='consume'){
    if(o.kind!=='food'||o.holder!==c.id)fail('not_consumable','不能食用這件物品。');
    o.lifecycle='consumed';o.holder=null;results.push(`食用${o.label}`);
   }else if(e.kind==='destroy'){
    if(o.owner!==c.id)fail('not_owned','不能毀壞借來的物品。');
    o.lifecycle='destroyed';o.holder=null;results.push(`處理了已損毀的${o.label}`);
   }else if(e.kind==='state'){
    if(!o.stateTransitions?.[e.key]?.includes(e.value)||o.state[e.key]===e.value)fail('state_transition','物件不支援這個狀態轉換。');
    o.state[e.key]=e.value;results.push(`${o.label}：${e.key}=${e.value}`);
   }else{
    if(e.toRegion!==regionOf(c)||!regions.some(r=>r.id===e.toRegion))fail('remote_transfer','不能跨地點遠端轉移物件。');
    if(e.toHolder!==null&&e.toHolder!==c.id){
     const recipient=w.characters.find(x=>x.id===e.toHolder);
     if(!recipient||regionOf(recipient)!==e.toRegion||!o.allowedTo.includes(recipient.id)||!o.acceptedBy?.includes(recipient.id))fail('recipient_consent','對方尚未同意接收。');
     o.acceptedBy=o.acceptedBy.filter(id=>id!==recipient.id);
    }
    o.holder=e.toHolder;o.region=e.toRegion;results.push(`${o.label}${e.toHolder?'已交付持有人':'留在現場'}`);
   }
   o.revision++;

  }
 }
 // A linked serving is a concrete identity inside its vessel. Validate the
 // complete batch so explicit, separately authorized transfers can move both;
 // never manufacture an implicit transfer or recipient consent.
 const touched=new Set(effects.flatMap(e=>'objectId' in e?[e.objectId]:[]));
 for(const drink of w.objects||[]){
  if(drink.kind!=='food'||!drink.state.vessel||(!touched.has(drink.id)&&!touched.has(drink.state.vessel)))continue;
  const vessel=w.objects?.find(o=>o.id===drink.state.vessel);
  const active=drink.lifecycle==='active';
  const separated=active&&(!vessel||vessel.lifecycle!=='active'||vessel.region!==drink.region||vessel.holder!==drink.holder||vessel.state.contents!==drink.state.beverage);
  const consumedStillFull=drink.lifecycle==='consumed'&&touched.has(drink.id)&&vessel&&['tea','coffee'].includes(vessel.state.contents);
  if(separated||consumedStillFull){
   throw new EffectValidationError('飲品與容器的結果不一致。',{reason:'vessel_continuity',phaseIndex,objectId:drink.id});
  }
 }
 return results;
}
export function commitFreeAction(w:World,c:Character,candidate:EffectCandidate):boolean{
 if(candidate.status!=='accepted'){
  c.activity=candidate.blockedReason||(candidate.status==='denied'?'這次方法沒有成功。':'目前的方法無法落實。');
  record(w,c.id,`${c.name} ${c.activity}`,'blocked',[c.id]);return false;
 }
 const existingObjects=new Map((w.objects||[]).map(object=>[object.id,object.lifecycle]));
 const validateResultTime=(snapshot:World,afterMinutes:number)=>{
  // Only the routine factory can mark its verified raw-material supplies as
  // preparation. Consuming a generic completed product early is still a result.
  const completedFood=(object:WorldObject)=>{
   if(object.kind!=='food')return false;
   const newProduct=!existingObjects.has(object.id);
   const terminalChange=object.lifecycle!=='active'&&existingObjects.get(object.id)!==object.lifecycle;
   const rawPreparation=object.lifecycle==='consumed'&&candidate.preparationSupplies?.includes(object.source);
   return (newProduct||terminalChange)&&!rawPreparation;
  };
  if(candidate.confirmedDurationMinutes!==undefined&&afterMinutes<candidate.confirmedDurationMinutes&&snapshot.objects?.some(completedFood))throw new EffectValidationError('完整食物成果不能早於確認完成時間。',{reason:'completion_result_time'});
 };
 // Validate complete effects on a copy before randomness or any world mutation.
 const clone=structuredClone(w),actor=clone.characters.find(x=>x.id===c.id)!;
 const results=applyEffects(clone,actor,candidate.effects);
 validateResultTime(clone,15);
 const predicted=structuredClone(clone),predictedActor=predicted.characters.find(x=>x.id===c.id)!;
 for(const [phaseIndex,phase] of (candidate.stages||[]).entries()){
  try{
   if(phase.effects.some(e=>e.kind==='transfer'&&e.toHolder!==null&&e.toHolder!==c.id))throw Error('階段需要接收者新的選擇。');
   predicted.minute=Math.max(predicted.minute,w.minute+phase.afterMinutes);
   checkPhase(predicted,predictedActor,phase);applyEffects(predicted,predictedActor,phase.effects,phaseIndex);validateResultTime(predicted,phase.afterMinutes);
  }catch(error){
   if(error instanceof EffectValidationError)throw error;
   throw new EffectValidationError(error instanceof Error?error.message:'活動階段前提無效。',{reason:'phase_precondition',phaseIndex,preconditions:phase.preconditions,actual:phase.preconditions.map(p=>predicted.objects?.find(o=>o.id===p.objectId)||null)});
  }
 }
 let resolution;
 if(candidate.check){
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,val])=>[key,canonical(val)])):value;
  const allEffects=[...candidate.effects,...(candidate.stages||[]).flatMap(stage=>stage.effects)];
  const references=new Set(allEffects.map(e=>'objectId' in e?e.objectId:'supplyId' in e?e.supplyId:e.targetId));
  for(const stage of candidate.stages||[])for(const p of stage.preconditions)references.add(p.objectId);
  const conditions=[...references].sort().map(id=>w.objects?.find(o=>o.id===id)||w.supplies?.find(s=>s.id===id)||null);
  const phases=(candidate.stages||[]).map(stage=>({preconditions:stage.preconditions,effects:stage.effects}));
  const key=JSON.stringify(canonical(['free',c.id,regionOf(c),[...(c.abilityTags||[])].sort(),candidate.effects,phases,conditions]));
  const prior=w.freeTrials?.[key];
  if(!prior&&Object.keys(w.freeTrials||{}).length>=128)throw Error('行動判定保存已達上限，本回合未進行新的判定。');
  const relevant=(c.abilityTags||[]).filter(tag=>tag.replace(/^(非常擅長|非常不擅長|不擅長|擅長)/,'')===candidate.check!.ability);
  let advantage:Advantage=0;
  if(relevant.some(tag=>tag.startsWith('非常不擅長')))advantage=-4;
  else if(relevant.some(tag=>tag.startsWith('不擅長')))advantage=-2;
  else if(relevant.some(tag=>tag.startsWith('非常擅長')))advantage=4;
  else if(relevant.some(tag=>tag.startsWith('擅長')))advantage=2;
  resolution=prior||judgeD20(rollD20(),advantage,candidate.check.difficulty);
  if(!prior){(w.freeTrials??={})[key]=resolution;record(w,c.id,`${c.name} 嘗試目前的方法。`,'attempt',[c.id],undefined,resolution);w.events.at(-1)!.attemptKey=key;}
  if(!['success','critical-success'].includes(resolution.outcome)){c.activity='嘗試尚未完成。';return false;}
 }
 w.supplies=clone.supplies;w.objects=clone.objects;
 c.activity=(results.join('，')||(candidate.stages?.length?'開始進行這項活動':'完成這次行動'))+(candidate.stages?.length?'；活動尚未完成。':'');
 const here=regionOf(c);
 record(w,c.id,`${c.name} ${c.activity}。`,'work',[c.id],{from:c.location,to:c.location,fromRegion:here,toRegion:here},resolution);
 return true;
}

function checkPhase(w:World,c:Character,phase:ActivityPhase):void{
 // Internal routine plans retain tools separately from their result vessel.
 // They remain local, known and authorized at every scheduled phase.
 for(const id of phase.requiredTools||[]){
  const tool=w.objects?.find(o=>o.id===id);
  if(!tool||!usableRoutineObject(tool,c.id)||tool.region!==regionOf(c)||!tool.knownTo.includes(c.id))throw Error('活動工具已不可使用。');
 }
 for(const p of phase.preconditions){
  const o=w.objects?.find(o=>o.id===p.objectId);
  if(!o||o.lifecycle!=='active'||o.revision!==p.revision||o.region!==p.region||o.holder!==p.holder||Object.entries(p.state).some(([k,v])=>o.state[k]!==v))throw Error('活動前提已改變。');
  if(o.state.condition==='broken'&&phase.effects.some(e=>e.kind==='state'&&e.objectId===o.id&&e.key==='contents'))throw Error('活動器具已損壞。');
 }
 if(phase.effects.some(e=>e.kind==='grant'||e.kind==='consent'))throw Error('活動需要新的角色選擇。');
 if(c.plan?.phases&&regionOf(c)!==c.plan.phases.origin)throw Error('角色已離開活動場景。');
}
// Validate and commit one phase as a batch; lifecycle owns the phase cursor.
export function commitActivityPhase(w:World,c:Character,phase:ActivityPhase,index:number):string[] {
 const clone=structuredClone(w),actor=clone.characters.find(character=>character.id===c.id)!;
 checkPhase(clone,actor,phase);
 const results=applyEffects(clone,actor,phase.effects,index);
 w.objects=clone.objects;w.supplies=clone.supplies;
 return results;
}
