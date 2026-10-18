import { routineObstacle, blockedRoutine } from './routine-obstacles';
import type { Action, Character, World } from './world';
import type { EffectCandidate, SceneSupply, WorldObject, Effect } from './world-effects';
import { effectCandidateSchema, parseEffectCandidate, EffectValidationError } from './world-effects';
import { regionOf } from './perception';
import { rawRoutineMaterial, supportsRoutineDrink, usableRoutineObject } from './routine-materials';

// Declarative interpreter versions, never model-authored code or world patches.
export type RoutineOperation='tea'|'coffee'|'food'|'drink'|'wash'|'return';
// Persisted data: selectors and bounded result steps, no executable model code.
export type RoutineTemplate={operation:RoutineOperation;verbs:string[];subjects:string[];purposes:string[];result:{kind:'brew'|'serve'|'consume'|'clean'|'release';contents?:string;minutes:15|30}};
const templates:RoutineTemplate[]=[
 {operation:'tea',verbs:['泡','準備','製作','沖泡'],subjects:['茶','紅茶','綠茶'],purposes:['泡茶','喝茶','準備茶','飲用','日常泡茶','招待客人','提供茶飲'],result:{kind:'brew',contents:'tea',minutes:30}},
 {operation:'coffee',verbs:['泡','準備','製作','沖泡','沖'],subjects:['咖啡'],purposes:['泡咖啡','喝咖啡','準備咖啡','飲用','招待客人'],result:{kind:'brew',contents:'coffee',minutes:30}},
 {operation:'food',verbs:['準備','製作','取得','取用','拿取'],subjects:['簡餐','蛋糕','三明治'],purposes:['用餐','食用','招待客人','準備簡餐'],result:{kind:'serve',minutes:15}},
 {operation:'drink',verbs:['喝','喝掉','飲用'],subjects:['茶','紅茶','綠茶','咖啡','飲品'],purposes:['飲用','解渴','喝茶','喝咖啡'],result:{kind:'consume',minutes:15}},
 {operation:'wash',verbs:['清洗','洗','洗淨'],subjects:['杯子','茶杯','咖啡杯','餐具'],purposes:['清洗餐具','清潔','清洗'],result:{kind:'clean',contents:'empty',minutes:15}},
 {operation:'return',verbs:['歸還','放回'],subjects:['杯子','茶杯','咖啡杯','餐具'],purposes:['歸還','歸還餐具','歸還杯子'],result:{kind:'release',minutes:15}},
];
export type RoutineRule={id:string;version:1;family:'cafe-service';operations:RoutineOperation[];templates?:RoutineTemplate[];origin:string;knownTo:string[]};
export type RoutinePlace={location:string;purpose:'cafe'|'home';operators:string[];confirmedOperations?:RoutineOperation[]};

export const routineCandidateSchema={...effectCandidateSchema,properties:{...effectCandidateSchema.properties,routine:{anyOf:[{type:'null'},{type:'object',properties:{family:{type:'string',enum:['cafe-service']},version:{type:'integer',enum:[1]}},required:['family','version'],additionalProperties:false}]}},required:[...effectCandidateSchema.required,'routine']};
export function parseRoutineCandidate(raw:string,w:World,c:Character,a:Action,duration:number,elapsedMinutes=15):EffectCandidate {
 if(raw.length>8192)throw Error('裁定候選超出容量。');
 const parsed=JSON.parse(raw),approval=parsed?.routine;
 if(approval===undefined||approval===null){if(parsed&&typeof parsed==='object')delete parsed.routine;const candidate=parseEffectCandidate(JSON.stringify(parsed));const rule=w.routineRules?.find(r=>r.knownTo.includes(c.id));if(rule)audit(w,c,rule,'exception');return candidate;}
 if(Object.keys(parsed).sort().join(',')!=='check,effects,routine,stages,status'||parsed.status!=='accepted'||parsed.check!==null||!Array.isArray(parsed.effects)||parsed.effects.length||!Array.isArray(parsed.stages)||parsed.stages.length||!approval||typeof approval!=='object'||Object.keys(approval).sort().join(',')!=='family,version'||approval.family!=='cafe-service'||approval.version!==1)throw Error('日常規則核准格式無效。');
 return bindRoutine(w,c,a,duration,approval,elapsedMinutes)!;
}

export type RoutineApproval={family:'cafe-service';version:1};
const escapePattern=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function validTemplate(t:RoutineTemplate):boolean {
 if(!t||typeof t!=='object'||!t.result||typeof t.result!=='object')return false;
 const slots=(xs:unknown,max:number)=>Array.isArray(xs)&&xs.length>0&&xs.length<=16&&xs.every(x=>typeof x==='string'&&x.length>0&&x.length<=max);
 if(!slots(t.verbs,24)||!slots(t.subjects,40)||!slots(t.purposes,60))return false;
 const kinds:Record<RoutineOperation,RoutineTemplate['result']['kind']>={tea:'brew',coffee:'brew',food:'serve',drink:'consume',wash:'clean',return:'release'};
 if(kinds[t.operation]!==t.result.kind)return false;
 if(t.result.kind==='brew')return t.result.minutes===30&&(t.result.contents==='tea'||t.result.contents==='coffee');
 return t.result.minutes===15&&(t.result.kind==='clean'?t.result.contents==='empty':t.result.contents===undefined);
}
function requestTemplate(a:Action,scope:RoutineTemplate[]=templates):RoutineTemplate|undefined {
 if(a.type!=='work'&&a.type!=='propose')return;
 const text=(a.content||'').trim().replace(/[。！!\s]+$/,'');
 if(!Array.isArray(scope)||scope.length>16)return;
 for(const t of scope.filter(validTemplate)){
  if(a.purpose&&!t.purposes.includes(a.purpose.trim()))continue;
  // Compose an ordinary single-serving request from independent selector slots.
  for(const verb of t.verbs)for(const subject of t.subjects){
   if(new RegExp(`^${escapePattern(verb)}(一杯|一壺|一份|普通|熱|溫|一般|這個|這份|這杯|那個|那杯|一些|\\s)*${escapePattern(subject)}$`).test(text))return t;
  }
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
 if(!op||!place||!place.operators.includes(c.id)||!capable(w,c,op))return null;
 // A home confirms only the requested domestic procedure, never a café job.
 const selected=place.purpose==='home'?templates.filter(t=>t.operation===op):templates;
 return {family:'cafe-service',version:1,operations:selected.map(t=>t.operation),templates:structuredClone(selected),background:'ordinary local materials and utensils only; explicit finite supplies and object facts take precedence',place};
}
export function matchingRoutine(w:World,c:Character,a:Action){
 const matches=(w.routineRules||[]).filter(r=>r.version===1&&r.family==='cafe-service'&&!!requestTemplate(a,r.templates||templates.filter(t=>Array.isArray(r.operations)&&r.operations.includes(t.operation))));
 return matches.find(r=>r.knownTo.includes(c.id))||matches[0];
}
export function bindRoutine(w:World,c:Character,a:Action,duration:number,approval?:RoutineApproval,elapsedMinutes=15):EffectCandidate|undefined {
 let rule=matchingRoutine(w,c,a);
 if(!rule&&!approval)return;
 if(!requestTemplate(a,rule?.templates||templates)||!rule&&!routineOffer(w,c,a)||approval&&(approval.family!=='cafe-service'||approval.version!==1))throw new EffectValidationError('日常規則不適用於當前提案。',{reason:'routine_scope'});
 const template=requestTemplate(a,rule?.templates||templates)!;
 if(rule){
  audit(w,c,rule,'reused');
  if(!rule.knownTo.includes(c.id)||!capable(w,c,template.operation)||!localRight(w,c,template.operation))return blockedRoutine(w,c,'目前尚不具備這次方法所需的知識、能力或使用條件。');
  const obstruction=routineObstacle(w,c,a,template.operation);if(obstruction)return blockedRoutine(w,c,obstruction);
  if(rule.origin!==c.location&&!localComplete(w,c,template.operation)){
   if(!approval){if(routineOffer(w,c,a)){w.routineAudit?.pop();return;}return blockedRoutine(w,c,'目前尚未確認這裡可使用的材料與器具。');}
  }
 }
 if(duration<template.result.minutes)throw new EffectValidationError('泡茶活動至少需要三十分鐘。',{reason:'routine_duration'});
 if(!rule){
  if((w.routineRules?.length||0)>=32)throw new EffectValidationError('日常規則已達容量。',{reason:'routine_capacity'});
  const offered=routineOffer(w,c,a)!;
  rule={id:crypto.randomUUID(),version:1,family:'cafe-service',operations:offered.operations,templates:offered.templates,origin:c.location,knownTo:[c.id]};(w.routineRules??=[]).push(rule);
  audit(w,c,rule,'approved');
 }
 if(approval){
  const place=localPlace(w,c)!;
  const operations=place.purpose==='home'?[template.operation]:rule.operations;
  place.confirmedOperations=[...new Set([...(place.confirmedOperations||[]),...operations])];
  if(rule.origin!==c.location&&w.routineAudit?.at(-1))w.routineAudit.at(-1)!.result='confirmed';
 }
 const contents=template.result.contents||'tea';
 const obstacle=routineObstacle(w,c,a,template.operation);if(obstacle)return blockedRoutine(w,c,obstacle);
 const region=regionOf(c),denied:EffectCandidate={status:'denied',effects:[],stages:[],check:null};
 const target=a.type==='propose'&&a.target&&a.target!==c.location&&a.target!==region?a.target:undefined;
 const visible=(w.objects||[]).filter(o=>o.knownTo.includes(c.id)&&o.region===region);
 const targetObject=target?visible.find(o=>o.id===target):undefined;
 const targetSupply=target?w.supplies?.find(s=>s.id===target&&s.knownTo.includes(c.id)&&s.region===region):undefined;
 if(target&&!targetObject&&!targetSupply)return denied;
 const canUse=(o:WorldObject)=>usableRoutineObject(o,c.id);
 const targetCup=targetObject?.kind==='utensil'?targetObject:undefined;
 if(['consume','clean','release'].includes(template.result.kind)){
  const requested=template.result.kind==='consume'?requestedDrink(a,template):undefined;
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
   if(vessel.state.contents!=='dirty')return denied;
   effects.push({kind:'state',objectId:vessel.id,expectedRevision:revision,key:'contents',value:'empty'});
  }else{
   if(vessel.state.contents!=='empty')return denied;
   effects.push({kind:'transfer',objectId:vessel.id,expectedRevision:revision,toHolder:null,toRegion:region});
  }
  return {status:'accepted',effects,check:null,stages:[]};
 }
 if(template.result.kind==='serve'){
  const subject=template.subjects.find(subject=>(a.content||'').includes(subject))!;
  const explicit=(w.supplies||[]).filter(s=>!s.background&&s.region===region&&s.kind==='food'&&(target?s.id===target:s.label.includes(subject)));
  let supply=explicit.find(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id));
  if(targetObject||target&&!targetSupply||explicit.length&&!supply)return denied;
  // A specific limited named dish cannot be invented as ordinary materials.
  if(!supply&&subject==='蛋糕')return denied;
  supply??=backgroundSupply(w,c,rule,region,subject,'food',{});
  return {status:'accepted',effects:[],check:null,stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'materialize',supplyId:supply.id,expectedRemaining:supply.remaining}]}]};
 }

 const teaObjects=visible.filter(o=>(!target||o.id===target)&&o.kind==='utensil'&&'contents' in o.state);
 // A concrete utensil is never repaired, replenished or teleported by background.
 let cup:WorldObject|undefined=teaObjects.find(o=>supportsRoutineDrink(o.stateTransitions?.contents,contents)&&o.state.contents==='empty'&&usableRoutineObject(o,c.id));
 const explicit=(w.supplies||[]).filter(s=>s.region===region&&!s.background&&(!target||s.id===target)&&s.kind==='utensil'&&'contents' in s.initialState);
 const effects:Effect[]=[];
 const materials=(w.supplies||[]).filter(s=>!s.background&&s.region===region&&rawRoutineMaterial(s,contents));
 if(materials.length){const material=materials.find(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id));if(!material)return denied;effects.push({kind:'materialize',supplyId:material.id,expectedRemaining:material.remaining},{kind:'consume',objectId:`${material.id}:${material.remaining}`,expectedRevision:1});}
 if(!cup){
  if(targetObject)return denied;
  if(teaObjects.some(o=>!(w.supplies||[]).find(s=>s.id===o.source)?.background))return denied;
  if(teaObjects.some(o=>o.lifecycle!=='active'||o.state.condition==='broken')&&!teaObjects.some(o=>o.lifecycle==='active'&&o.state.condition!=='broken'))return denied;
  let supply:SceneSupply|undefined=explicit.find(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id)&&supportsRoutineDrink(s.stateTransitions?.contents,contents));
  if(explicit.length&&!supply)return denied;
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
 beverage.availableAt=w.minute+Math.max(0,30-elapsedMinutes);

 return {status:'accepted',check:null,effects,stages:[{afterMinutes:30,preconditions:[{objectId:cup.id,revision:revision+1,region,holder:c.id,state:{contents:'water'}}],effects:[{kind:'state',objectId:cup.id,expectedRevision:revision+1,key:'contents',value:contents},{kind:'materialize',supplyId:beverage.id,expectedRemaining:beverage.remaining}]}]};
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
 for(const rule of w.routineRules||[]){
  if(rule.version!==1||!rule.knownTo.includes(c.id)||!Array.isArray(rule.templates))continue;
  for(const t of rule.templates.filter(validTemplate)){
   let subject=t.subjects[0];
   if(['consume','clean','release'].includes(t.result.kind)){
    const utensils=(w.objects||[]).filter(o=>o.kind==='utensil'&&o.region===regionOf(c)&&o.knownTo.includes(c.id)&&usableRoutineObject(o,c.id));
    if(t.result.kind==='consume'){
     const drink=(w.objects||[]).find(o=>o.kind==='food'&&o.region===regionOf(c)&&o.knownTo.includes(c.id)&&usableRoutineObject(o,c.id)&&utensils.some(v=>v.id===o.state.vessel&&v.state.contents===o.state.beverage)&&['tea','coffee'].includes(o.state.beverage));
     if(!drink)continue;
     subject=t.subjects.find(s=>s===(drink.state.beverage==='coffee'?'咖啡':'茶'))||t.subjects.find(s=>s==='飲品')||'';
     if(!subject)continue;
    }else if(!utensils.some(o=>o.state.contents===(t.result.kind==='clean'?'dirty':'empty')))continue;
   }
   const portion=t.result.kind==='brew'?'一杯':t.result.kind==='serve'?'一份':'';
   const method={content:`${t.verbs[0]}${portion}${subject}`,purpose:t.purposes[0],durationMinutes:t.result.minutes};
   if(rule.knownTo.includes(c.id)&&capable(w,c,t.operation)&&localRight(w,c,t.operation)&&!routineObstacle(w,c,{type:'propose',target:c.location,...method},t.operation)&&matchingRoutine(w,c,{type:'propose',target:c.location,...method})&&!methods.some(m=>m.content===method.content))methods.push(method);
  }
 }
 return methods.slice(0,16);
}
