import { adjudicationLimits, stateChangeLimits, effectKinds } from './adjudication-limits';

export const formationLimits={version:1,maxSources:8,maxOutputs:4,maxAmount:1000000,maxUnitLength:24,maxLabelLength:120} as const;
export type Quantity={amount:number;unit:string};
export type ObjectSource={type:'object'|'supply';id:string;revision:number|null;amount:number;unit:string;owner:string;disposition?:'consumed'|'destroyed'};
export type FormationFact={operation:'materialize'|'partition'|'transform'|'separate';at:number;inputs:string[]};
export type FormationInput={objectId:string;expectedRevision:number;quantity:Quantity;disposition:'consumed'|'destroyed'};
export type FormationOutput={id:string;label:string;kind:string;consumable:boolean;quantity:Quantity;state:{key:string;value:string;exposure:'public'|'hidden'}[]};
export type FormEffect={kind:'form';version:1;access:'authorized'|'physical';operation:'partition'|'transform';inputs:FormationInput[];outputs:FormationOutput[];reason:string};
export type SeparateEffect={kind:'separate';version:1;access:'authorized'|'physical';objectId:string;expectedRevision:number;quantity:Quantity;outputId:string;reason:string};
export type FormationEffect=FormEffect|SeparateEffect;
const object=(properties:Record<string,object>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const text=(maxLength:number)=>({type:'string',minLength:1,maxLength});
const ref=text(adjudicationLimits.maxReferenceLength),revision={type:'integer',minimum:1};
export const quantitySchema=object({amount:{type:'integer',minimum:1,maximum:formationLimits.maxAmount},unit:text(formationLimits.maxUnitLength)});
export const formationSchemas=[object({kind:{type:'string',const:effectKinds.form},version:{type:'integer',const:formationLimits.version},access:{type:'string',enum:['authorized','physical']},operation:{type:'string',enum:['partition','transform']},inputs:{type:'array',minItems:1,maxItems:formationLimits.maxSources,items:object({objectId:ref,expectedRevision:revision,quantity:quantitySchema,disposition:{type:'string',enum:['consumed','destroyed']}})},outputs:{type:'array',minItems:1,maxItems:formationLimits.maxOutputs,items:object({id:ref,label:text(formationLimits.maxLabelLength),kind:text(stateChangeLimits.maxKindLength),consumable:{type:'boolean'},quantity:quantitySchema,state:{type:'array',maxItems:stateChangeLimits.maxEntries,items:object({key:text(stateChangeLimits.maxKeyLength),value:{type:'string',maxLength:stateChangeLimits.maxValueLength},exposure:{type:'string',enum:['public','hidden']}})}})},reason:text(stateChangeLimits.maxReasonLength)}),object({kind:{type:'string',const:effectKinds.separate},version:{type:'integer',const:formationLimits.version},access:{type:'string',enum:['authorized','physical']},objectId:ref,expectedRevision:revision,quantity:quantitySchema,outputId:ref,reason:text(stateChangeLimits.maxReasonLength)})];
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const boundedText=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
const positive=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
export function validQuantity(value:unknown):value is Quantity{return exact(value,['amount','unit'])&&positive(value.amount)&&(value.amount as number)<=formationLimits.maxAmount&&boundedText(value.unit,formationLimits.maxUnitLength);}
export function validFormationEffect(value:unknown,assertState:(state:unknown)=>void):value is FormationEffect {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const e=value as Record<string,unknown>;
 if(e.version!==formationLimits.version||!['authorized','physical'].includes(e.access as string)||!boundedText(e.reason,stateChangeLimits.maxReasonLength))return false;
 if(e.kind===effectKinds.separate)return exact(e,['kind','version','access','objectId','expectedRevision','quantity','outputId','reason'])&&boundedText(e.objectId,adjudicationLimits.maxReferenceLength)&&positive(e.expectedRevision)&&validQuantity(e.quantity)&&boundedText(e.outputId,adjudicationLimits.maxReferenceLength)&&e.outputId!==e.objectId;
 if(e.kind!==effectKinds.form||!exact(e,['kind','version','access','operation','inputs','outputs','reason'])||!['partition','transform'].includes(e.operation as string)||!Array.isArray(e.inputs)||!e.inputs.length||e.inputs.length>formationLimits.maxSources||!Array.isArray(e.outputs)||!e.outputs.length||e.outputs.length>formationLimits.maxOutputs||e.operation==='partition'&&e.inputs.length!==1)return false;
 if(e.inputs.some(input=>!exact(input,['objectId','expectedRevision','quantity','disposition'])||!boundedText(input.objectId,adjudicationLimits.maxReferenceLength)||!positive(input.expectedRevision)||!validQuantity(input.quantity)||!['consumed','destroyed'].includes(input.disposition as string))||new Set(e.inputs.map(input=>input.objectId)).size!==e.inputs.length)return false;
 const inputs=e.inputs;
 if(e.outputs.some(output=>{
  if(!exact(output,['id','label','kind','consumable','quantity','state'])||!boundedText(output.id,adjudicationLimits.maxReferenceLength)||!boundedText(output.label,formationLimits.maxLabelLength)||!boundedText(output.kind,stateChangeLimits.maxKindLength)||typeof output.consumable!=='boolean'||!validQuantity(output.quantity)||!Array.isArray(output.state)||output.state.length>stateChangeLimits.maxEntries||output.state.some(entry=>!exact(entry,['key','value','exposure'])||!['public','hidden'].includes(entry.exposure as string))||new Set(output.state.map(entry=>entry.key)).size!==output.state.length)return true;
  try{assertState(Object.fromEntries(output.state.map(entry=>[entry.key,entry.value])));return false;}catch{return true;}
 })||new Set(e.outputs.map(output=>output.id)).size!==e.outputs.length||e.outputs.some(output=>inputs.some(input=>input.objectId===output.id)))return false;
 return true;
}
export const formationRules=[
 `form version=${formationLimits.version}：operation=partition或transform，access=authorized或physical；inputs最多${formationLimits.maxSources}個{objectId,expectedRevision,quantity:{amount,unit},disposition:consumed|destroyed}，outputs最多${formationLimits.maxOutputs}個{id,label,kind,consumable,quantity,state:[{key,value,exposure:public|hidden}]}。id必須是尚未使用的新身份，不能替換／復活既有物件或供應。數量為正安全整數且至多${formationLimits.maxAmount}、unit最多${formationLimits.maxUnitLength}字；reason最多${stateChangeLimits.maxReasonLength}字只入觀察者證據。`,
 'partition把一個完整原物切開／碎裂，當下終止原物active並產生一組有份量的整體；已有重要差異可列少數不同output。transform明示扣除每個當前active來源的量，剩餘量保留，不能先consume來源再form。各來源單位必須與現場相符；全部輸入輸出同單位時，總產量不可大於消耗量。不同單位轉化由模型確認，不模擬完整質量守恆。舊缺quantity物件按1 item承接；只有新操作才保存數量，不追補歷史。',
 'separate version=1：{access,objectId,expectedRevision,quantity,outputId,reason}從已有整體扣出小於其餘量的一部分，保存新child及原物來源；child保持原kind、狀態、消耗能力、所有權及使用權，不複製已發生的歷史。全量拿取沿transfer，不因細分複製完整原物。',
 '來源扣至零時依模型明示disposition保存消耗／轉化或損毀，不按物件kind或行動動詞硬猜。authorized須有現場使用權及可操作持有；physical可承接未經許可及他人持有的外在後果，但不改owner、coOwners、allowedTo或acceptedBy，仍須已知可見本地active與當前份量。',
 '形成不接受模型指定owner、allowedTo或同意；保存全部來源owner/coOwners並沿既有權利交集，不能由其中一位單方代其餘共有人授權。新成果明示consumable布林，舊缺欄位才以food相容；容器只是state.vessel關聯，不作為泡茶原料消耗。新飲品與杯的contents、位置、持有仍須同批一致。',
];
