import type { Character, World } from './world';
import { canSee, regionOf, regions } from './perception';
import { record } from './world';
import { judgeD20, rollD20, type Difficulty, type Advantage } from './d20';

export type SceneSupply={id:string;label:string;region:string;remaining:number;owner:string;knownTo:string[];allowedTo:string[];kind:'food'|'utensil';initialState:Record<string,string>;stateTransitions?:Record<string,string[]>};
export type WorldObject={id:string;source:string;label:string;region:string;holder:string|null;owner:string;revision:number;state:Record<string,string>;lifecycle:'active'|'consumed'|'destroyed';kind:'food'|'utensil';knownTo:string[];allowedTo:string[];stateTransitions?:Record<string,string[]>;acceptedBy?:string[]};
export type Effect={kind:'materialize';supplyId:string;expectedRemaining:number}|{kind:'consume';objectId:string;expectedRevision:number}|{kind:'destroy';objectId:string;expectedRevision:number}|{kind:'transfer';objectId:string;expectedRevision:number;toHolder:string|null;toRegion:string}|{kind:'state';objectId:string;expectedRevision:number;key:string;value:string}|{kind:'grant';targetId:string;recipient:string}|{kind:'consent';objectId:string};
export type PhaseCondition={objectId:string;revision:number;region:string;holder:string|null;state:Record<string,string>};
export type ActivityPhase={afterMinutes:number;preconditions:PhaseCondition[];effects:Effect[]};
export type EffectCandidate={stages?:ActivityPhase[];status:'accepted'|'denied'|'unsupported';effects:Effect[];check:{difficulty:Difficulty;ability:string}|null};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>k in value);
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const reference=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=120;
const variant=(properties:Record<string,object>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const effectSchema={anyOf:[variant({kind:{const:'transfer',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'},toHolder:{anyOf:[{type:'null'},{type:'string'}]},toRegion:{type:'string'}}),variant({kind:{const:'state',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'},key:{type:'string'},value:{type:'string'}}),variant({kind:{const:'grant',type:'string'},targetId:{type:'string'},recipient:{type:'string'}}),variant({kind:{const:'consent',type:'string'},objectId:{type:'string'}}),variant({kind:{const:'destroy',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'}}),variant({kind:{const:'materialize',type:'string'},supplyId:{type:'string'},expectedRemaining:{type:'integer'}}),variant({kind:{const:'consume',type:'string'},objectId:{type:'string'},expectedRevision:{type:'integer'}})]};
const phaseConditionSchema=variant({objectId:{type:'string'},revision:{type:'integer'},region:{type:'string'},holder:{anyOf:[{type:'null'},{type:'string'}]},state:{type:'array',maxItems:8,items:variant({key:{type:'string'},value:{type:'string'}})}});
const phaseSchema=variant({afterMinutes:{type:'integer',enum:[15,30,45,60,75,90]},preconditions:{type:'array',maxItems:4,items:phaseConditionSchema},effects:{type:'array',minItems:1,maxItems:4,items:effectSchema}});
export const effectCandidateSchema=variant({stages:{type:'array',maxItems:4,items:phaseSchema},status:{type:'string',enum:['accepted','denied','unsupported']},effects:{type:'array',maxItems:4,items:effectSchema},check:{anyOf:[{type:'null'},variant({difficulty:{type:'integer',enum:[8,12,16]},ability:{type:'string',maxLength:100}})]}});
export function parseEffectCandidate(raw:string):EffectCandidate{
 let v:unknown;try{v=JSON.parse(raw);}catch{throw Error('裁定未回傳有效候選。');}
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
 return v as unknown as EffectCandidate;
}
export function knownWorldObjects(w:World,c:Character){
 return (w.objects||[]).filter(o=>o.lifecycle==='active'&&(o.holder===c.id||o.knownTo.includes(c.id)&&canSee(w,c,o.region))).map(o=>({id:o.id,label:o.label,region:o.region,holder:o.holder,state:o.state,revision:o.revision,kind:o.kind}));
}
export function knownWorldSupplies(w:World,c:Character){
 return (w.supplies||[]).filter(s=>s.knownTo.includes(c.id)&&canSee(w,c,s.region)).map(s=>({id:s.id,label:s.label,region:s.region,kind:s.kind}));
}
export function authorityForProposal(w:World,c:Character){
 const objects=knownWorldObjects(w,c).map(o=>w.objects!.find(full=>full.id===o.id)!);
 const supplies=knownWorldSupplies(w,c).map(s=>w.supplies!.find(full=>full.id===s.id)!);
 return {objects,supplies,effectContract:effectCandidateSchema};
}
function applyEffects(w:World,c:Character,effects:Effect[]):string[]{
 const results:string[]=[];
 for(const e of effects){
  if(e.kind==='materialize'){
   const s=w.supplies?.find(s=>s.id===e.supplyId);
   if(!s||s.remaining!==e.expectedRemaining||!Number.isSafeInteger(s.remaining)||s.remaining<=0||!s.knownTo.includes(c.id)||!s.allowedTo.includes(c.id)||s.region!==regionOf(c))throw Error('裁定供應前提無效。');
   const id=`${s.id}:${s.remaining}`;
   if(w.objects?.some(o=>o.id===id))throw Error('供應身份已被使用。');
   const o:WorldObject={id,source:s.id,label:s.label,region:s.region,holder:c.id,owner:s.owner,revision:1,state:{...s.initialState},lifecycle:'active',kind:s.kind,knownTo:[...s.knownTo],allowedTo:[...s.allowedTo],...(s.stateTransitions?{stateTransitions:structuredClone(s.stateTransitions)}:{})};
   (w.objects??=[]).push(o);s.remaining--;results.push(`取得${o.label}`);
  }else if(e.kind==='grant'){
   const target=w.objects?.find(o=>o.id===e.targetId)||w.supplies?.find(s=>s.id===e.targetId);
   const recipient=w.characters.find(x=>x.id===e.recipient);
   if(!target||!target.knownTo.includes(c.id)||!canSee(w,c,target.region)||target.owner!==c.id||target.region!==regionOf(c)||!recipient||!canSee(w,c,regionOf(recipient))||('lifecycle' in target&&target.lifecycle!=='active'))throw Error('無權代替所有者同意。');
   if(!target.allowedTo.includes(recipient.id))target.allowedTo.push(recipient.id);
   if(!target.knownTo.includes(recipient.id))target.knownTo.push(recipient.id);
   results.push(`同意 ${recipient.name} 使用${target.label}`);
  }else if(e.kind==='consent'){
   const o=w.objects?.find(o=>o.id===e.objectId);
   if(!o||o.lifecycle!=='active'||!o.knownTo.includes(c.id)||!canSee(w,c,o.region)||!o.allowedTo.includes(c.id))throw Error('無法同意接收未知或未獲准物件。');
   o.acceptedBy=[...new Set([...(o.acceptedBy||[]),c.id])];results.push(`同意接收${o.label}`);
  }else{
   const o=w.objects?.find(o=>o.id===e.objectId);
   if(!o||o.revision!==e.expectedRevision||o.lifecycle!=='active'||o.region!==regionOf(c)||!(o.owner===c.id||o.allowedTo.includes(c.id))||!(o.holder===c.id||o.holder===null&&o.knownTo.includes(c.id)&&canSee(w,c,o.region)))throw Error('裁定物件前提無效。');
   if(e.kind==='consume'){
    if(o.kind!=='food'||o.holder!==c.id)throw Error('不能食用這件物品。');
    o.lifecycle='consumed';o.holder=null;results.push(`食用${o.label}`);
   }else if(e.kind==='destroy'){
    if(o.owner!==c.id)throw Error('不能毀壞借來的物品。');
    o.lifecycle='destroyed';o.holder=null;results.push(`處理了已損毀的${o.label}`);
   }else if(e.kind==='state'){
    if(!o.stateTransitions?.[e.key]?.includes(e.value)||o.state[e.key]===e.value)throw Error('物件不支援這個狀態轉換。');
    o.state[e.key]=e.value;results.push(`${o.label}：${e.key}=${e.value}`);
   }else{
    if(e.toRegion!==regionOf(c)||!regions.some(r=>r.id===e.toRegion))throw Error('不能跨地點遠端轉移物件。');
    if(e.toHolder!==null&&e.toHolder!==c.id){
     const recipient=w.characters.find(x=>x.id===e.toHolder);
     if(!recipient||regionOf(recipient)!==e.toRegion||!o.allowedTo.includes(recipient.id)||!o.acceptedBy?.includes(recipient.id))throw Error('對方尚未同意接收。');
     o.acceptedBy=o.acceptedBy.filter(id=>id!==recipient.id);
    }
    o.holder=e.toHolder;o.region=e.toRegion;results.push(`${o.label}${e.toHolder?'已交付持有人':'留在現場'}`);
   }
   o.revision++;

  }
 }
 return results;
}
export function commitFreeAction(w:World,c:Character,candidate:EffectCandidate):boolean{
 if(candidate.status!=='accepted'){
  c.activity=candidate.status==='denied'?'這次方法沒有成功。':'目前的方法無法落實。';
  record(w,c.id,`${c.name} ${c.activity}`,'blocked',[c.id]);return false;
 }
 // Validate complete effects on a copy before randomness or any world mutation.
 const clone=structuredClone(w),actor=clone.characters.find(x=>x.id===c.id)!;
 const results=applyEffects(clone,actor,candidate.effects);
 const predicted=structuredClone(clone),predictedActor=predicted.characters.find(x=>x.id===c.id)!;
 for(const phase of candidate.stages||[]){if(phase.effects.some(e=>e.kind==='transfer'&&e.toHolder!==null&&e.toHolder!==c.id))throw Error('階段需要接收者新的選擇。');checkPhase(predicted,predictedActor,phase);applyEffects(predicted,predictedActor,phase.effects);}
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
 for(const p of phase.preconditions){
  const o=w.objects?.find(o=>o.id===p.objectId);
  if(!o||o.lifecycle!=='active'||o.revision!==p.revision||o.region!==p.region||o.holder!==p.holder||Object.entries(p.state).some(([k,v])=>o.state[k]!==v))throw Error('活動前提已改變。');
 }
 if(phase.effects.some(e=>e.kind==='grant'||e.kind==='consent'))throw Error('活動需要新的角色選擇。');
 if(c.plan?.phases&&regionOf(c)!==c.plan.phases.origin)throw Error('角色已離開活動場景。');
}
export function advanceFreePhases(w:World,c:Character):void{
 const plan=c.plan,phases=plan?.phases;
 if(!plan||!phases)return;
 while(phases.cursor<phases.stages.length&&phases.stages[phases.cursor].afterMinutes<=w.minute-plan.startedAt){
  const phase=phases.stages[phases.cursor],clone=structuredClone(w),actor=clone.characters.find(x=>x.id===c.id)!;
  let results:string[];
  try{checkPhase(clone,actor,phase);results=applyEffects(clone,actor,phase.effects);}catch{
   c.activity='原活動的條件已改變，尚未完成。';
   record(w,c.id,`${c.name} ${c.activity}`,'blocked',[c.id]);delete c.plan;return;
  }
  w.objects=clone.objects;w.supplies=clone.supplies;phases.cursor++;
  c.activity=results.join('，');
  record(w,c.id,`${c.name} ${c.activity}。`,'work',[c.id],{from:c.location,to:c.location,fromRegion:regionOf(c),toRegion:regionOf(c)});
 }
 if(phases.cursor===phases.stages.length&&w.minute>=plan.until){c.activity+='；活動已完成。';delete c.plan;}
}
