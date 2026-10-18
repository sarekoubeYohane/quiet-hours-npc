import type { Action, Character, World } from './world';
import type { EffectCandidate, SceneSupply, WorldObject, Effect } from './world-effects';
import { effectCandidateSchema, parseEffectCandidate, EffectValidationError } from './world-effects';
import { regionOf } from './perception';

// Declarative interpreter versions, never model-authored code or world patches.
export type RoutineRule={id:string;version:1;family:'cafe-service';operations:('tea')[];origin:string;knownTo:string[]};
export type RoutinePlace={location:string;purpose:'cafe';operators:string[]};

export const routineCandidateSchema={...effectCandidateSchema,properties:{...effectCandidateSchema.properties,routine:{anyOf:[{type:'null'},{type:'object',properties:{family:{type:'string',enum:['cafe-service']},version:{type:'integer',enum:[1]}},required:['family','version'],additionalProperties:false}]}},required:[...effectCandidateSchema.required,'routine']};
export function parseRoutineCandidate(raw:string,w:World,c:Character,a:Action,duration:number):EffectCandidate {
 if(raw.length>8192)throw Error('裁定候選超出容量。');
 const parsed=JSON.parse(raw),approval=parsed?.routine;
 if(approval===undefined||approval===null){if(parsed&&typeof parsed==='object')delete parsed.routine;return parseEffectCandidate(JSON.stringify(parsed));}
 if(Object.keys(parsed).sort().join(',')!=='check,effects,routine,stages,status'||parsed.status!=='accepted'||parsed.check!==null||!Array.isArray(parsed.effects)||parsed.effects.length||!Array.isArray(parsed.stages)||parsed.stages.length||!approval||typeof approval!=='object'||Object.keys(approval).sort().join(',')!=='family,version'||approval.family!=='cafe-service'||approval.version!==1)throw Error('日常規則核准格式無效。');
 return bindRoutine(w,c,a,duration,approval)!;
}

export type RoutineApproval={family:'cafe-service';version:1};
export function routineOperation(a:Action):'tea'|undefined {
 if(a.purpose&&!/^(泡茶|喝茶|準備茶|飲用|日常泡茶|招待客人|提供茶飲)[。！!\s]*$/.test(a.purpose.trim()))return;
 if(a.type==='work'&&a.target==='tea')return 'tea';
 if(a.type==='propose'&&/^(泡|準備|製作|沖泡)(一杯|一壺|普通|熱|溫|一般|一些|\s)*(茶|紅茶|綠茶)[。！!\s]*$/.test(a.content?.trim()||''))return 'tea';
}
export function routineOffer(w:World,c:Character,a:Action){
 const place=w.routinePlaces?.find(p=>p.location===c.location&&p.operators.includes(c.id));
 return routineOperation(a)&&place?{family:'cafe-service',version:1,operations:['tea'],background:'ordinary tea materials and utensils only; explicit finite supplies and object facts take precedence',place}:null;
}
export function matchingRoutine(w:World,c:Character,a:Action){
 const op=routineOperation(a);if(!op||!routineOffer(w,c,a))return undefined;
 return w.routineRules?.find(r=>r.version===1&&r.family==='cafe-service'&&r.origin===c.location&&r.knownTo.includes(c.id)&&r.operations.includes(op));
}
export function bindRoutine(w:World,c:Character,a:Action,duration:number,approval?:RoutineApproval):EffectCandidate|undefined {
 let rule=matchingRoutine(w,c,a);
 if(!rule&&!approval)return;
 if(!routineOperation(a)||!routineOffer(w,c,a)||approval&&(approval.family!=='cafe-service'||approval.version!==1))throw new EffectValidationError('日常規則不適用於當前提案。',{reason:'routine_scope'});
 if(duration<30)throw new EffectValidationError('泡茶活動至少需要三十分鐘。',{reason:'routine_duration'});
 if(!rule){
  if((w.routineRules?.length||0)>=32)throw new EffectValidationError('日常規則已達容量。',{reason:'routine_capacity'});
  rule={id:crypto.randomUUID(),version:1,family:'cafe-service',operations:['tea'],origin:c.location,knownTo:[c.id]};(w.routineRules??=[]).push(rule);
  audit(w,c,rule,'approved');
 }else audit(w,c,rule,'reused');
 const region=regionOf(c),denied:EffectCandidate={status:'denied',effects:[],stages:[],check:null};
 const target=a.type==='propose'&&a.target&&a.target!==c.location&&a.target!==region?a.target:undefined;
 const visible=(w.objects||[]).filter(o=>o.knownTo.includes(c.id)&&o.region===region);
 const targetObject=target?visible.find(o=>o.id===target):undefined;
 const targetSupply=target?w.supplies?.find(s=>s.id===target&&s.knownTo.includes(c.id)&&s.region===region):undefined;
 if(target&&!targetObject&&!targetSupply)return denied;
 const teaObjects=visible.filter(o=>(!target||o.id===target)&&o.kind==='utensil'&&'contents' in o.state);
 // A concrete utensil is never repaired, replenished or teleported by background.
 let cup:WorldObject|undefined=teaObjects.find(o=>o.lifecycle==='active'&&o.state.contents==='empty'&&o.state.condition!=='broken'&&(o.holder===null||o.holder===c.id)&&o.knownTo.includes(c.id)&&(o.owner===c.id||o.allowedTo.includes(c.id)));
 const explicit=(w.supplies||[]).filter(s=>s.region===region&&!s.background&&(!target||s.id===target)&&s.kind==='utensil'&&'contents' in s.initialState);
 const effects:Effect[]=[];
 const materials=(w.supplies||[]).filter(s=>!s.background&&s.region===region&&s.kind==='food'&&/(茶葉|茶包|tea)/i.test(s.label));
 if(materials.length){const material=materials.find(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id));if(!material)return denied;effects.push({kind:'materialize',supplyId:material.id,expectedRemaining:material.remaining},{kind:'consume',objectId:`${material.id}:${material.remaining}`,expectedRevision:1});}
 if(!cup){
  if(targetObject)return denied;
  if(teaObjects.some(o=>!(w.supplies||[]).find(s=>s.id===o.source)?.background))return denied;
  if(teaObjects.some(o=>o.lifecycle!=='active'||o.state.condition==='broken')&&!teaObjects.some(o=>o.lifecycle==='active'&&o.state.condition!=='broken'))return denied;
  let supply:SceneSupply|undefined=explicit.find(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id));
  if(explicit.length&&!supply)return denied;
  if(!supply){
   if((w.objects?.length||0)>=512)throw new EffectValidationError('具體物件已達保存容量。',{reason:'object_capacity'});
   supply=w.supplies?.find(s=>s.background?.ruleId===rule!.id&&s.region===region);
   if(!supply){supply={id:`routine:${rule.id}:${region}`,label:'日常茶杯',region,remaining:1,owner:c.id,knownTo:[c.id],allowedTo:[c.id],kind:'utensil',initialState:{contents:'empty'},stateTransitions:{contents:['empty','water','tea']},background:{ruleId:rule.id,sequence:0}};(w.supplies??=[]).push(supply);}
  }
  const objectId=supply.background?`${supply.id}:${supply.background.sequence}`:`${supply.id}:${supply.remaining}`;
  effects.push({kind:'materialize',supplyId:supply.id,expectedRemaining:supply.remaining});
  cup={id:objectId,revision:1,holder:c.id,state:{...supply.initialState}} as WorldObject;
 }else if(cup.holder!==c.id)effects.push({kind:'transfer',objectId:cup.id,expectedRevision:cup.revision,toHolder:c.id,toRegion:region});
 const revision=cup.revision+(effects.some(e=>e.kind==='transfer')?1:0);
 effects.push({kind:'state',objectId:cup.id,expectedRevision:revision,key:'contents',value:'water'});
 return {status:'accepted',check:null,effects,stages:[{afterMinutes:30,preconditions:[{objectId:cup.id,revision:revision+1,region,holder:c.id,state:{contents:'water'}}],effects:[{kind:'state',objectId:cup.id,expectedRevision:revision+1,key:'contents',value:'tea'}]}]};
}

function audit(w:World,c:Character,r:RoutineRule,result:'approved'|'reused'){w.routineAudit=[...(w.routineAudit||[]),{turn:w.turn,actorId:c.id,ruleId:r.id,result}].slice(-64);}
