import { bindWorldRoutine } from './routine-world-programs';
import type { RoutineWorldProgram } from './routine-world-contract';
import { bindRoutineProgram } from './routine-programs';
import type { RoutineProgram } from './routine-program-contract';
import { parseAdjudicationCandidate, type RoutineApproval } from './adjudication-contract';
export { routineCandidateSchema } from './adjudication-contract';
export type { RoutineApproval } from './adjudication-contract';
import { routineObstacle, blockedRoutine } from './routine-obstacles';
import type { Action, Character, World } from './world';
import type { EffectCandidate, SceneSupply, WorldObject, Effect } from './world-effects';
import { scheduleCompletionMinutes, EffectValidationError } from './world-effects';
import { regionOf } from './perception';
import { rawRoutineMaterial, supportsRoutineDrink, usableRoutineObject, emptyRoutineVessel } from './routine-materials';

// Declarative interpreter versions, never model-authored code or world patches.
export type RoutineOperation='tea'|'coffee'|'food'|'drink'|'wash'|'return';
// Persisted data: selectors and bounded result steps, no executable model code.
export type RoutineTemplate={operation:RoutineOperation;verbs:string[];subjects:string[];purposes:string[];result:{kind:'brew'|'serve'|'consume'|'clean'|'release';contents?:string;minutes:number}};
const templates:RoutineTemplate[]=[
 {operation:'tea',verbs:['泡','準備','製作','沖泡'],subjects:['茶','紅茶','綠茶'],purposes:['泡茶','喝茶','準備茶','飲用','日常泡茶','招待客人','提供茶飲'],result:{kind:'brew',contents:'tea',minutes:30}},
 {operation:'coffee',verbs:['泡','準備','製作','沖泡','沖'],subjects:['咖啡'],purposes:['泡咖啡','喝咖啡','準備咖啡','飲用','招待客人'],result:{kind:'brew',contents:'coffee',minutes:30}},
 {operation:'food',verbs:['準備','製作','取得','取用','拿取'],subjects:['簡餐','蛋糕','三明治'],purposes:['用餐','食用','招待客人','準備簡餐'],result:{kind:'serve',minutes:15}},
 {operation:'drink',verbs:['喝','喝掉','飲用'],subjects:['茶','紅茶','綠茶','咖啡','飲品'],purposes:['飲用','解渴','喝茶','喝咖啡'],result:{kind:'consume',minutes:15}},
 {operation:'wash',verbs:['清洗','洗','洗淨'],subjects:['杯子','茶杯','咖啡杯','餐具'],purposes:['清洗餐具','清潔','清洗'],result:{kind:'clean',contents:'empty',minutes:15}},
 {operation:'return',verbs:['歸還','放回'],subjects:['杯子','茶杯','咖啡杯','餐具'],purposes:['歸還','歸還餐具','歸還杯子'],result:{kind:'release',minutes:15}},
];
export type RoutineRule={id:string;version:1|2|3;programs?:(RoutineProgram|RoutineWorldProgram)[];worldTimings?:{operation:string;minutes:number}[];worldSubject?:string|null;finiteSourceBindings?:{operation:string;roles:string[]}[];family:'cafe-service';operations:string[];templates?:RoutineTemplate[];origin:string;knownTo:string[]};
export type RoutineSelectionObserver=(data:unknown)=>void;
const observeSelection=(observe:RoutineSelectionObserver|undefined,data:unknown)=>{try{observe?.(data);}catch{/* Private diagnostics cannot alter rule selection. */}};
export type RoutinePlace={location:string;purpose:'cafe'|'home';operators:string[];confirmedOperations?:RoutineOperation[]};

// World binding is deliberately separate from pure candidate parsing.
export function resolveRoutineCandidate(raw:string,w:World,c:Character,a:Action,duration:number,elapsedMinutes=15,maxMinutes:number|null=null,observe?:RoutineSelectionObserver,onParsed?:(value:ReturnType<typeof parseAdjudicationCandidate>)=>void):EffectCandidate {
 const offer=routineOffer(w,c,a);const parsed=parseAdjudicationCandidate(raw,{routineOperations:offer?.operations||[],allowGenericMethods:!!offer?.genericMethods});
 try{onParsed?.(parsed);}catch{/* Observer cannot change candidate semantics. */}
 if(parsed.kind==='routine')return bindRoutine(w,c,a,duration,parsed.approval,elapsedMinutes,maxMinutes,observe)!;
 const rule=w.routineRules?.find(r=>r.knownTo.includes(c.id));if(rule)audit(w,c,rule,'exception');
 return parsed.candidate;
}

const escapePattern=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function validTemplate(t:RoutineTemplate):boolean {
 if(!t||typeof t!=='object'||!t.result||typeof t.result!=='object')return false;
 const slots=(xs:unknown,max:number)=>Array.isArray(xs)&&xs.length>0&&xs.length<=16&&xs.every(x=>typeof x==='string'&&x.length>0&&x.length<=max);
 if(!slots(t.verbs,24)||!slots(t.subjects,40)||!slots(t.purposes,60))return false;
 const kinds:Record<RoutineOperation,RoutineTemplate['result']['kind']>={tea:'brew',coffee:'brew',food:'serve',drink:'consume',wash:'clean',return:'release'};
 if(kinds[t.operation]!==t.result.kind||!Number.isSafeInteger(t.result.minutes)||t.result.minutes<15||t.result.minutes>90||t.result.minutes%15!==0)return false;
 if(t.result.kind==='brew')return (t.result.contents==='tea'||t.result.contents==='coffee');
 return (t.result.kind==='clean'?t.result.contents==='empty':t.result.contents===undefined);
}
function requestTemplate(a:Action,scope:RoutineTemplate[]=templates,observe?:RoutineSelectionObserver,rule?:RoutineRule):RoutineTemplate|undefined {
 if(a.type!=='work'&&a.type!=='propose')return;
 const text=(a.content||(a.type==='work'&&a.target==='tea'?'泡一杯茶':'')).trim().replace(/[。！!\s]+$/,'');
 if(!Array.isArray(scope)||scope.length>16)return;
 for(const t of scope.filter(validTemplate)){
  const purpose=!a.purpose||t.purposes.includes(a.purpose.trim());
  if(!purpose){observeSelection(observe,{source:'program-check',check:'template',ruleId:rule?.id,version:rule?.version,operation:t.operation,purpose:false,wording:'not-evaluated'});continue;}
  // Compose an ordinary single-serving request from independent selector slots.
  for(const verb of t.verbs)for(const subject of t.subjects){
   const wording=new RegExp(`^${escapePattern(verb)}(一杯|一壺|一份|普通|熱|溫|一般|這個|這份|這杯|那個|那杯|一些|\\s)*${escapePattern(subject)}$`).test(text);
   if(wording){observeSelection(observe,{source:'program-check',check:'template',ruleId:rule?.id,version:rule?.version,operation:t.operation,verb,subject,purpose:true,wording:true});return t;}
  }
  observeSelection(observe,{source:'program-check',check:'template',ruleId:rule?.id,version:rule?.version,operation:t.operation,purpose:true,wording:false});
 }
}
function requestedDrink(a:Action,t:RoutineTemplate):string|undefined {
 const subject=t.subjects.find(s=>(a.content||'').trim().replace(/[。！!\s]+$/,'').endsWith(s));
 return subject==='咖啡'?'coffee':subject&&/茶/.test(subject)?'tea':undefined;
}
export function routineOperation(a:Action,scope:RoutineTemplate[]=templates):RoutineOperation|undefined {return requestTemplate(a,scope)?.operation;}
function localPlace(w:World,c:Character){return w.routinePlaces?.find(p=>p.location===c.location);}
function capable(w:World,c:Character,op:RoutineOperation){
 // Old café operator configurations remain compatible. Explicit [] means unable.
 return c.routineCapabilities?c.routineCapabilities.includes(op):!!localPlace(w,c)?.operators.includes(c.id);
}
function localRight(w:World,c:Character,op:RoutineOperation){
 const place=localPlace(w,c);if(place?.operators.includes(c.id))return true;
 const region=regionOf(c);
 const permitted=(o:WorldObject|SceneSupply)=>o.region===region&&o.knownTo.includes(c.id)&&(o.owner===c.id||o.allowedTo.includes(c.id));
 const utensil=[...w.objects||[],...w.supplies||[]].some(o=>o.kind==='utensil'&&permitted(o));
 if(['drink','wash','return'].includes(op))return utensil;
 const material=(w.supplies||[]).some(s=>rawRoutineMaterial(s,op)&&permitted(s));
 return material&&(op==='food'||utensil);
}
function localComplete(w:World,c:Character,op:RoutineOperation){
 const place=localPlace(w,c);
 if(place?.confirmedOperations?.includes(op))return true;
 const region=regionOf(c);
 const supplies=(w.supplies||[]).filter(s=>s.region===region&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id)&&s.remaining>0&&!s.pending);
 const utensil=(w.objects||[]).some(o=>o.region===region&&o.knownTo.includes(c.id)&&(o.owner===c.id||o.allowedTo.includes(c.id))&&o.kind==='utensil'&&o.lifecycle==='active');
 if(['drink','wash','return'].includes(op))return utensil;
 return utensil&&supplies.some(s=>rawRoutineMaterial(s,op));
}
export function routineOffer(w:World,c:Character,a:Action){
 const place=localPlace(w,c),scope=w.routineRules?.find(r=>r.family==='cafe-service'&&r.knownTo.includes(c.id))?.templates||templates;
 const op=routineOperation(a,scope);
 if(!place||!place.operators.includes(c.id))return null;
 // First interpretation belongs to the existing adjudication slot. Exact
 // wording is needed for free deterministic reuse, not to offer interpretation.
 const selected=(place.purpose==='cafe'?templates:op?templates.filter(t=>t.operation===op):scope).filter(t=>validTemplate(t)&&capable(w,c,t.operation));
 if(!selected.length||op&&!capable(w,c,op))return null;
 return {family:'cafe-service',version:2,genericMethods:{maxPrograms:8},operations:selected.map(t=>t.operation),templates:selected.map(t=>{const copy=structuredClone(t);return {...copy,result:{kind:copy.result.kind,...(copy.result.contents?{contents:copy.result.contents}:{})}};}),background:'ordinary local materials and utensils only; explicit finite supplies and object facts take precedence',place};
}
export function matchingRoutine(w:World,c:Character,a:Action,observe?:RoutineSelectionObserver):RoutineRule|undefined {
 const matches=(w.routineRules||[]).filter(r=>(r.version===1||r.version===2)&&r.family==='cafe-service'&&!!requestTemplate(a,r.templates||templates.filter(t=>Array.isArray(r.operations)&&r.operations.includes(t.operation)),observe,r));
 const selected=matches.find(r=>r.origin===c.location&&r.knownTo.includes(c.id))||matches.find(r=>r.knownTo.includes(c.id))||matches[0];
 for(const rule of matches)observeSelection(observe,{source:'program-check',check:'legacy-scope',ruleId:rule.id,version:rule.version,scope:rule.origin===c.location,known:rule.knownTo.includes(c.id),selected:rule===selected});
 return selected;
}
export function bindRoutine(w:World,c:Character,a:Action,duration:number,approval?:RoutineApproval,elapsedMinutes=15,maxMinutes:number|null=null,observe?:RoutineSelectionObserver):EffectCandidate|undefined {
 if(approval?.version===3)return bindWorldRoutine(w,c,a,approval,maxMinutes,observe);
 if(!approval){const generic=bindWorldRoutine(w,c,a,undefined,maxMinutes,observe);if(generic)return generic;}
 let rule=matchingRoutine(w,c,a,observe);
 if(!rule&&!approval){observeSelection(observe,{source:'program-check',branch:'adjudication-required',reason:'no-matching-rule'});return;}
 const offer=approval?routineOffer(w,c,a):null;
 const literal=requestTemplate(a,rule?.templates||templates,observe,rule);
 const template=approval?.operation?templates.find(t=>t.operation===approval.operation&&offer?.operations.includes(t.operation)):literal;
 if(!template||literal&&template.operation!==literal.operation||approval&&(!offer||approval.family!=='cafe-service'||![1,2].includes(approval.version))||approval?.subject&&!template.subjects.includes(approval.subject))throw new EffectValidationError('日常規則不適用於當前提案。',{reason:'routine_scope'});
 if(!rule&&approval?.operation)rule=w.routineRules?.find(r=>(r.version===1||r.version===2)&&r.family==='cafe-service'&&r.knownTo.includes(c.id)&&(r.templates||[]).some(t=>validTemplate(t)&&t.operation===template.operation));
 if(rule){
  audit(w,c,rule,'reused');
  const knowledge=rule.knownTo.includes(c.id),ability=knowledge?capable(w,c,template.operation):undefined,right=ability?localRight(w,c,template.operation):undefined;
  observeSelection(observe,{source:'program-check',check:'legacy-right',ruleId:rule.id,version:rule.version,known:knowledge,capable:ability??'not-evaluated',permission:right??'not-evaluated'});
  if(!knowledge||!ability||!right)return blockedRoutine(w,c,'目前尚不具備這次方法所需的知識、能力或使用條件。');
  const obstruction=routineObstacle(w,c,a,template.operation);if(obstruction){observeSelection(observe,{source:'program-check',ruleId:rule.id,branch:'blocked',check:'obstacle',reason:obstruction});return blockedRoutine(w,c,obstruction);}
  if(rule.origin!==c.location&&!localComplete(w,c,template.operation)){
   observeSelection(observe,{source:'program-check',ruleId:rule.id,version:rule.version,check:'local-completeness',passed:false});
   if(!approval){if(routineOffer(w,c,a)){w.routineAudit?.pop();return;}return blockedRoutine(w,c,'目前尚未確認這裡可使用的材料與器具。');}
  }
 }
 if(approval){
  const expected=offer!.operations;
  if(!Array.isArray(approval.timings)||approval.timings.length!==expected.length||new Set(approval.timings.map(t=>t?.operation)).size!==expected.length||approval.timings.some(t=>!t||Object.keys(t).sort().join(',')!=='minutes,operation'||!expected.includes(t.operation)))throw new EffectValidationError('日常範圍須確認每項活動的合法耗時。',{reason:'routine_timing'});
 }
 const confirmedTemplates=approval?templates.filter(t=>(localPlace(w,c)?.purpose==='home'?[template.operation]:offer!.operations).includes(t.operation)).map(t=>({...structuredClone(t),result:{...t.result,minutes:scheduleCompletionMinutes(approval.timings.find(time=>time.operation===t.operation)!.minutes)}})):undefined;
 const confirmed=confirmedTemplates?.find(t=>t.operation===template.operation)||template;
 const confirmedDurationMinutes=confirmed.result.minutes;

 if(approval&&rule&&rule.origin!==c.location){
  // A new local scope is a separate confirmation, not a rewrite of the source
  // home's narrower procedure or its method/condition-specific completion time.
  if(w.routineAudit?.at(-1)?.ruleId===rule.id)w.routineAudit.pop();
  rule=undefined;
 }
 if(!rule){
  if((w.routineRules?.length||0)>=32)throw new EffectValidationError('日常規則已達容量。',{reason:'routine_capacity'});
  // A home confirms only this interpreted procedure, never the entire café role.
  const selected=confirmedTemplates!;
  rule={id:crypto.randomUUID(),version:approval?.version||1,...(approval?.programs?{programs:structuredClone(approval.programs)}:{}),family:'cafe-service',operations:selected.map(t=>t.operation),templates:structuredClone(selected),origin:c.location,knownTo:[c.id]};(w.routineRules??=[]).push(rule);
  audit(w,c,rule,'approved');
 }else if(confirmedTemplates){
  // Legacy confirmations may retain an unchanged model program, but cannot
  // replace its time/scope without supplying the matching v2 program too.
  const savedTemplates=rule.templates;
  const incompatibleLegacy=rule.version===2&&approval?.version===1&&(
   confirmedTemplates.length!==savedTemplates?.length||
   confirmedTemplates.some(template=>savedTemplates?.find(saved=>saved.operation===template.operation)?.result.minutes!==template.result.minutes)
  );
  if(incompatibleLegacy)throw new EffectValidationError('舊版核准不能改寫既有新版程序的範圍或耗時。',{reason:'routine_version_conflict'});
  if(approval?.version===2){rule.version=2;rule.programs=structuredClone(approval.programs);}
  rule.operations=confirmedTemplates.map(t=>t.operation);
  rule.templates=structuredClone(confirmedTemplates);
 }
 if(approval){
  const place=localPlace(w,c)!;
  const operations=place.purpose==='home'?[template.operation]:rule.operations as RoutineOperation[];
  place.confirmedOperations=[...new Set([...(place.confirmedOperations||[]),...operations])];
  if(rule.origin!==c.location&&w.routineAudit?.at(-1))w.routineAudit.at(-1)!.result='confirmed';
 }
 const literalSubject=template.subjects.find(subject=>(a.content||'').includes(subject));
 const subject=approval?.subject||literalSubject;
 if(template.result.kind==='serve'&&(!subject||literalSubject&&subject!==literalSubject))throw new EffectValidationError('日常餐點種類未確認或與提案不符。',{reason:'routine_subject'});
 const literalDrink=template.result.kind==='consume'?requestedDrink(a,template):undefined;
 const interpretedDrink=approval?.subject==='咖啡'?'coffee':approval?.subject&&/茶/.test(approval.subject)?'tea':undefined;
 if(template.result.kind==='consume'&&literalDrink&&interpretedDrink&&literalDrink!==interpretedDrink)throw new EffectValidationError('飲品種類與提案不符。',{reason:'routine_subject'});
 if(maxMinutes!==null && confirmedDurationMinutes>maxMinutes){
  const reason=`完成這項活動需要安排 ${confirmedDurationMinutes} 分鐘，超過本次明確投入上限 ${maxMinutes} 分鐘；尚未啟動。`;
  const item=w.routineAudit?.at(-1);if(item&&item.actorId===c.id&&item.turn===w.turn)item.reason=reason;
  observeSelection(observe,{source:'program-check',ruleId:rule?.id,version:rule?.version,check:'time-limit',confirmedDurationMinutes,maxMinutes,passed:false});
  return {status:'denied',effects:[],stages:[],check:null,blockedReason:reason};
 }
 const finish=(candidate:EffectCandidate)=>{observeSelection(observe,{source:'program-check',ruleId:rule?.id,version:rule?.version,branch:approval?'approved':'reused',status:candidate.status,operation:template.operation});return rule?.version===2?bindRoutineProgram(w,c,candidate,rule.programs!.find(p=>p.operation===template.operation)! as RoutineProgram):candidate;};
 const contents=template.result.contents||'tea';
 const obstacle=routineObstacle(w,c,a,template.operation);if(obstacle){observeSelection(observe,{source:'program-check',ruleId:rule?.id,version:rule?.version,check:'obstacle',branch:'blocked',reason:obstacle});return blockedRoutine(w,c,obstacle);}
 const region=regionOf(c),denied:EffectCandidate={status:'denied',effects:[],stages:[],check:null};
 const reject=(reason:string)=>{observeSelection(observe,{source:'program-check',ruleId:rule?.id,version:rule?.version,branch:'blocked',reason});return denied;};
 const target=a.type==='propose'&&a.target&&a.target!==c.location&&a.target!==region?a.target:undefined;
 const visible=(w.objects||[]).filter(o=>o.knownTo.includes(c.id)&&o.region===region);
 const targetObject=target?visible.find(o=>o.id===target):undefined;
 const targetSupply=target?w.supplies?.find(s=>s.id===target&&s.knownTo.includes(c.id)&&s.region===region):undefined;
 if(target&&!targetObject&&!targetSupply)return reject('target-not-known-locally');
 const canUse=(o:WorldObject)=>usableRoutineObject(o,c.id);
 const targetCup=targetObject?.kind==='utensil'&&'contents' in targetObject.state?targetObject:undefined;
 const targetTool=targetObject?.kind==='utensil'&&!targetCup?targetObject:undefined;
 if((targetObject&&!targetCup&&!targetTool)||(targetTool&&!canUse(targetTool)))return blockedRoutine(w,c,'目前沒有可使用的指定工具。');
 if(['consume','clean','release'].includes(template.result.kind)){
  const requested=template.result.kind==='consume'?literalDrink||interpretedDrink:undefined;
  const availableDrink=(v:WorldObject)=>visible.find(o=>o.kind==='food'&&o.state.vessel===v.id&&canUse(o)&&o.state.beverage===v.state.contents&&(!requested||o.state.beverage===requested));
  const vessel=targetCup||(!target?visible.find(o=>o.kind==='utensil'&&canUse(o)&&(template.result.kind!=='consume'||availableDrink(o))):undefined);
  if(!vessel||!canUse(vessel))return blockedRoutine(w,c,'目前沒有符合這次方法的可用器具或飲品。');
  const effects:Effect[]=[];let revision=vessel.revision;
  if(vessel.holder!==c.id){effects.push({kind:'transfer',objectId:vessel.id,expectedRevision:revision++,toHolder:c.id,toRegion:region});}
  if(template.result.kind==='consume'){
   const drink=availableDrink(vessel);
   if(!drink||!['tea','coffee'].includes(vessel.state.contents))return blockedRoutine(w,c,'目前沒有符合這次方法的可用飲品。');
   if(drink.holder!==c.id)effects.push({kind:'transfer',objectId:drink.id,expectedRevision:drink.revision,toHolder:c.id,toRegion:region});
   effects.push({kind:'consume',objectId:drink.id,expectedRevision:drink.revision+(drink.holder!==c.id?1:0)},{kind:'state',objectId:vessel.id,expectedRevision:revision,key:'contents',value:'dirty'});
  }else if(template.result.kind==='clean'){
   if(vessel.state.contents!=='dirty'&&!(vessel.state.contents==='empty'&&vessel.state.clean==='no'))return reject('vessel-does-not-need-cleaning');
   if(vessel.state.clean==='no'&&!vessel.stateTransitions?.clean?.includes('yes'))return reject('clean-transition-unsupported');
   if(vessel.state.contents!=='empty')effects.push({kind:'state',objectId:vessel.id,expectedRevision:revision++,key:'contents',value:'empty'});
   if(vessel.state.clean==='no')effects.push({kind:'state',objectId:vessel.id,expectedRevision:revision,key:'clean',value:'yes'});
  }else{
   if(vessel.state.contents!=='empty')return reject('release-requires-empty-vessel');
   effects.push({kind:'transfer',objectId:vessel.id,expectedRevision:revision,toHolder:null,toRegion:region});
  }
  return finish({status:'accepted',confirmedDurationMinutes,effects:[],check:null,stages:[{afterMinutes:confirmedDurationMinutes,preconditions:[{objectId:vessel.id,revision:vessel.revision,region,holder:vessel.holder,state:{contents:vessel.state.contents}}],effects}]});
 }
 if(template.result.kind==='serve'){
  const explicit=(w.supplies||[]).filter(s=>!s.background&&s.region===region&&s.kind==='food'&&(target?s.id===target:s.label.includes(subject!)));
  let supply=explicit.find(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id));
  if(targetObject||target&&!targetSupply||explicit.length&&!supply)return reject('explicit-food-source-not-usable');
  // A specific limited named dish cannot be invented as ordinary materials.
  if(!supply&&subject==='蛋糕')return reject('cake-requires-explicit-source');
  supply??=backgroundSupply(w,c,rule,region,subject!,'food',{});
  return finish({status:'accepted',confirmedDurationMinutes,effects:[],check:null,stages:[{afterMinutes:confirmedDurationMinutes,preconditions:[],effects:[{kind:'materialize',supplyId:supply.id,expectedRemaining:supply.remaining}]}]});
 }

 const vesselTarget=targetTool?undefined:target;
 const teaObjects=visible.filter(o=>(!vesselTarget||o.id===vesselTarget)&&o.kind==='utensil'&&'contents' in o.state);
 // A concrete utensil is never repaired, replenished or teleported by background.
 let cup:WorldObject|undefined=teaObjects.find(o=>supportsRoutineDrink(o.stateTransitions?.contents,contents)&&emptyRoutineVessel(o.state)&&usableRoutineObject(o,c.id));
 const explicit=(w.supplies||[]).filter(s=>s.region===region&&!s.background&&(!vesselTarget||s.id===vesselTarget)&&s.kind==='utensil'&&'contents' in s.initialState);
 const effects:Effect[]=[],preparationSupplies:string[]=[];
 const materials=(w.supplies||[]).filter(s=>!s.background&&s.region===region&&rawRoutineMaterial(s,contents));
 if(materials.length){const material=materials.find(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id));if(!material)return reject('finite-material-not-usable');preparationSupplies.push(material.id);effects.push({kind:'materialize',supplyId:material.id,expectedRemaining:material.remaining},{kind:'consume',objectId:`${material.id}:${material.remaining}`,expectedRevision:1});}
 if(!cup){
  if(targetCup)return reject('target-vessel-not-usable-empty-or-supported');
  if(teaObjects.some(o=>!canUse(o)))return reject('existing-vessel-not-usable');
  if(teaObjects.some(o=>o.lifecycle!=='active'||o.state.condition==='broken')&&!teaObjects.some(o=>o.lifecycle==='active'&&o.state.condition!=='broken'))return reject('all-existing-vessels-inactive-or-broken');
  let supply:SceneSupply|undefined=explicit.find(s=>s.remaining>0&&emptyRoutineVessel(s.initialState)&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id)&&supportsRoutineDrink(s.stateTransitions?.contents,contents));
  if(explicit.length&&!supply)return reject('explicit-vessel-source-not-usable');
  if(!supply){
   if((w.objects?.length||0)>=512||(w.supplies?.length||0)>=512)throw new EffectValidationError('具體物件已達保存容量。',{reason:'object_capacity'});
   supply=w.supplies?.find(s=>s.background?.ruleId===rule!.id&&s.region===region&&s.kind==='utensil'&&'contents' in s.initialState);
   if(!supply){supply={id:`supply:${crypto.randomUUID()}`,label:'日常茶杯',region,remaining:1,owner:c.id,knownTo:[c.id],allowedTo:[c.id],kind:'utensil',initialState:{contents:'empty'},stateTransitions:{contents:['empty','water','tea','coffee','dirty']},background:{ruleId:rule.id,sequence:0}};(w.supplies??=[]).push(supply);}
  }
  const objectId=supply.background?`${supply.id}:${supply.background.sequence}`:`${supply.id}:${supply.remaining}`;
  effects.push({kind:'materialize',supplyId:supply.id,expectedRemaining:supply.remaining});
  cup={id:objectId,revision:1,holder:c.id,state:{...supply.initialState}} as WorldObject;
 }else if(cup.holder!==c.id)effects.push({kind:'transfer',objectId:cup.id,expectedRevision:cup.revision,toHolder:c.id,toRegion:region});
 const revision=cup.revision+(effects.some(e=>e.kind==='transfer')?1:0);
 effects.push({kind:'state',objectId:cup.id,expectedRevision:revision,key:'contents',value:'water'});
 const beverage=backgroundSupply(w,c,rule,region,contents==='coffee'?'一份咖啡':'一份茶','food',{vessel:cup.id,beverage:contents});
 delete beverage.background; // One prepared serving, never a replenishing product generator.
 beverage.pending=true;
 beverage.availableAt=w.minute+Math.max(0,confirmedDurationMinutes-elapsedMinutes);

 return finish({status:'accepted',preparationSupplies,confirmedDurationMinutes,check:null,effects,stages:[{afterMinutes:confirmedDurationMinutes,...(targetTool?{requiredTools:[targetTool.id]}:{}),preconditions:[{objectId:cup.id,revision:revision+1,region,holder:c.id,state:{contents:'water'}},...(targetTool?[{objectId:targetTool.id,revision:targetTool.revision,region,holder:targetTool.holder,state:{...targetTool.state}}]:[])],effects:[{kind:'state',objectId:cup.id,expectedRevision:revision+1,key:'contents',value:contents},{kind:'materialize',supplyId:beverage.id,expectedRemaining:beverage.remaining}]}]});
}

function audit(w:World,c:Character,r:RoutineRule,result:'approved'|'reused'|'exception'|'confirmed'){w.routineAudit=[...(w.routineAudit||[]),{turn:w.turn,actorId:c.id,location:c.location,ruleId:r.id,result}].slice(-64);}

function backgroundSupply(w:World,c:Character,r:RoutineRule,region:string,label:string,kind:SceneSupply['kind'],state:Record<string,string>):SceneSupply {
 // Background supply is a generator identity, not a fabricated finite inventory.
 const id=`supply:${crypto.randomUUID()}`;
 let supply=kind==='food'&&state.vessel?undefined:w.supplies?.find(s=>s.background?.ruleId===r.id&&s.region===region&&s.label===label&&s.kind===kind&&s.allowedTo.includes(c.id));
 if(!supply){
  if((w.objects?.length||0)>=512||(w.supplies?.length||0)>=512)throw new EffectValidationError('具體物件已達保存容量。',{reason:'object_capacity'});
  supply={id,label,region,remaining:1,owner:c.id,knownTo:[c.id],allowedTo:[c.id],kind,initialState:state,background:{ruleId:r.id,sequence:0}};
  (w.supplies??=[]).push(supply);
 }
 return supply;
}

// Ordinary usable method choices for NPC projection; no rule/audit identifiers.
export function knownRoutineMethods(w:World,c:Character){
 const methods:{content:string;purpose:string;durationMinutes:number}[]=[];
 // This is learned knowledge, not an authority-side feasibility oracle. In
 // particular hidden state and permission changes cannot add/remove a method.
 for(const rule of [...(w.routineRules||[])].reverse()){
  if(!rule.knownTo.includes(c.id))continue;
  if(rule.version===3){
   for(const program of rule.programs as RoutineWorldProgram[]||[])for(const method of program.methods){const minutes=rule.worldTimings?.find(time=>time.operation===program.operation)?.minutes||15;if(!methods.some(known=>known.content===method.content&&known.purpose===method.purpose))methods.push({...method,durationMinutes:Math.ceil(minutes/15)*15});}
   continue;
  }
  if(![1,2].includes(rule.version)||!Array.isArray(rule.templates))continue;
  for(const template of rule.templates.filter(validTemplate)){
   const portion=template.result.kind==='brew'?'一杯':template.result.kind==='serve'?'一份':'';
   const subjects=template.result.kind==='consume'?template.subjects.filter(subject=>['茶','咖啡'].includes(subject)):template.subjects.slice(0,1);
   for(const subject of subjects){const method={content:`${template.verbs[0]}${portion}${subject}`,purpose:template.purposes[0],durationMinutes:template.result.minutes};if(!methods.some(known=>known.content===method.content&&known.purpose===method.purpose))methods.push(method);}
  }
 }
 return methods.slice(0,16);
}
