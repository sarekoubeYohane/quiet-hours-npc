import { adjudicationLimits } from './adjudication-limits';
import { attributeLabels, attributeNames, type AttributeName } from './character-attributes';
import { judgeD20, rollD20, type Difficulty, type Advantage, type Resolution } from './d20';
import type { Character } from './world';
export type CheckSense = 'sight'|'hearing'|'touch';
export type CheckSystem = 'd20-v1'|'d100-v1'|'d100-v2';
/** A version is selected from declared authority, never from the magnitude of values. */
export function newCheckSystem(actor:Character):CheckSystem {
 if(!actor.attributes)return 'd20-v1';
 if(actor.attributes.version===2&&actor.attributes.authority==='formed-card')return 'd100-v2';
 if(actor.attributes.version===1&&actor.attributes.authority==='owner-confirmed')return 'd100-v1';
 throw Error('人物能力版本與來源無效。');
}
export type ActionCheck = {difficulty:Difficulty;ability:string;system?:Exclude<CheckSystem,'d20-v1'>;attribute?:AttributeName|null;sense?:CheckSense|null};
export type CheckFactors = {attribute:AttributeName|null;level:number|null;ability:number;difficulty:number;expertise:number;sense:number;senseName:CheckSense|null;attention:number};
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const baseProperties={difficulty:{type:'integer',enum:[...adjudicationLimits.difficulties]},ability:{type:'string',minLength:1,maxLength:adjudicationLimits.maxValueLength}};
export const actionCheckSchema={anyOf:[object(baseProperties),object({...baseProperties,system:{type:'string',enum:['d100-v1','d100-v2']},attribute:{type:['string','null'],enum:[...attributeNames,null]},sense:{type:['string','null'],enum:['sight','hearing','touch',null]}})]};
export function validActionCheck(value:unknown):value is ActionCheck {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as ActionCheck,keys=Object.keys(value).sort().join(',');
 return adjudicationLimits.difficulties.includes(v.difficulty)&&typeof v.ability==='string'&&!!v.ability.trim()&&v.ability.length<=adjudicationLimits.maxValueLength&&
 (keys==='ability,difficulty'||keys==='ability,attribute,difficulty,sense,system'&&(v.system==='d100-v1'||v.system==='d100-v2')&&(v.attribute===null||attributeNames.includes(v.attribute as AttributeName))&&(v.sense===null||['sight','hearing','touch'].includes(v.sense as string)));
}
/** Called only on a fresh adjudication, never when loading/reusing an old rule. */
export function confirmNewCheck(actor:Character,check:ActionCheck|null):ActionCheck|null {
 if(!check)return null;
 if(!actor.attributes)return {difficulty:check.difficulty,ability:check.ability};
 const attribute=attributeNames.find(name=>check.ability===name||check.ability===attributeLabels[name])??null;
 return {...check,system:newCheckSystem(actor) as 'd100-v1'|'d100-v2',attribute:check.attribute??attribute,sense:check.sense??null};
}
const normalized=(value:string)=>value.trim().normalize('NFKC').toLowerCase();
export function senseAvailable(actor:Character,sense:CheckSense):boolean {
 return !(actor.attributes?.blockedSenses??[]).includes(sense);
}
export function d100Parameters(actor:Character,check:ActionCheck,attention=0) {
 if(!actor.attributes)throw Error('人物基本屬性尚未導入。');
 const attribute=check.attribute??null,level=attribute?actor.attributes!.values[attribute]:null;
 const modern=check.system==='d100-v2';
 if(modern&&(actor.attributes.version!==2||actor.attributes.authority!=='formed-card'))throw Error('人物與檢定版本不相容。');
 const factors:CheckFactors={attribute,level,senseName:check.sense??null,ability:level===null?0:modern?level*5-55:(level-3)*10,difficulty:check.difficulty===8?20:check.difficulty===16?-20:0,
  expertise:actor.attributes!.expertise.find(item=>normalized(item.scope)===normalized(check.ability))?.modifier??0,
  sense:check.sense?actor.attributes!.senses.find(item=>item.scope===check.sense)?.modifier??0:0,attention};
 const aliases=[...attributeNames,...Object.values(attributeLabels),...(modern?['appearance','外觀']:[]),'sight','hearing','touch','視覺','聽覺','觸覺'];
 if(aliases.some(alias=>normalized(alias)===normalized(check.ability)))factors.expertise=0;
 if(level!==null&&(!Number.isInteger(level)||level<(modern?3:1)||level>(modern?18:5))||![factors.expertise,factors.sense].every(n=>[-20,-10,0,10,20].includes(n))||![-10,0,10].includes(attention))throw Error('人物檢定資料無效。');
 const modifier=factors.ability+factors.difficulty+factors.expertise+factors.sense+factors.attention;
 const threshold=Math.max(modern?5:10,Math.min(modern?95:75,55+modifier));
 return {factors,modifier,threshold};
}
export function resolveActionCheck(actor:Character,check:ActionCheck,legacy:Advantage=0,attention=0,random:()=>number=Math.random):Resolution {
 if(!actor.attributes||(check.system!=='d100-v1'&&check.system!=='d100-v2'))return judgeD20(rollD20(random),legacy,check.difficulty);
 if(check.sense&&!senseAvailable(actor,check.sense))throw Error('此感官沒有成立的感知機會。');
 const {factors,modifier,threshold}=d100Parameters(actor,check,attention);
 const sample=random();if(!Number.isFinite(sample)||sample<0||sample>=1)throw Error('無效的骰子亂數來源');
 const roll=Math.floor(sample*100)+1;
 const outcome=roll<=5?'critical-success':roll>=96?'critical-failure':roll<=threshold?'success':roll<=Math.min(threshold+20,95)?'mixed':'failure';
 return {system:check.system,...(check.system==='d100-v2'?{attributeVersion:2 as const}:{}),roll,modifier,dc:check.difficulty,total:threshold-roll,threshold,factors,outcome};
}
