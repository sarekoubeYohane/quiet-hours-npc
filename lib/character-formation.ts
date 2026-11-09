import { requestModel, type ModelService } from './model-adapter';
import { characterDraftFieldNames, missingCharacterText, type CharacterDraft } from './character-drafts';
import { cardAttributeNames, type CardAttribute, type CardFormation, type CardValues } from './character-cards';
export type BonusCandidate={target:CardAttribute|'capacity';source:string;quote:string;substantive:boolean};
export type CardAssessment={bonuses:BonusCandidate[]};
const targets=[...cardAttributeNames,'capacity'];
const sources=['concept',...characterDraftFieldNames];
const normalized=(text:string)=>text.normalize('NFKC').toLocaleLowerCase('und').replace(/[\p{P}\p{Z}\p{S}\p{Cf}\s]/gu,'');
export function characterFormationIssue(draft:CharacterDraft):string|undefined {
 const missing=missingCharacterText(draft.fields);
 if(missing.length)return '形成前請完成：'+missing.join('、')+'。適用時可明示沒有特殊設定。';
 const text=[draft.concept,...characterDraftFieldNames.map(field=>draft.fields[field])].join('\n').normalize('NFKC');
 const numeric=/(?:力量|耐力|靈巧|敏捷|感知(?:能力)?|外觀|精神容量|精神電量容量)(?:[^\d\n，。；,;.]{0,16})([\d一二三四五六七八九十百零〇]+)([^\n，。；,;.]*)/gu;
 for(const match of text.matchAll(numeric)) {
   // Age, height, physical measurements and durations remain background facts.
   if(/^\s*(?:歲|岁|年|月|天|小時|分鐘|分鍾|公分|厘米|cm\b|公斤|kg\b|公里|次|週|周)/i.test(match[2]))continue;
   return '人物文字不能直接指定遊戲屬性或精神容量的數字／範圍；年齡、身高等背景數字可以保留。';
 }
}
export async function assessCharacterCard(draft:CharacterDraft,service:ModelService,options:Parameters<typeof requestModel>[3]):Promise<CardAssessment> {
 const schema={type:'object',properties:{bonuses:{type:'array',maxItems:18,items:{type:'object',properties:{target:{type:'string',enum:targets},source:{type:'string',enum:sources},quote:{type:'string',maxLength:2400},substantive:{type:'boolean'}},required:['target','source','quote','substantive'],additionalProperties:false}}},required:['bonuses'],additionalProperties:false};
 const raw=await requestModel(service,[
  {role:'system',content:'你只判讀人物已確認文字的有界背景候選。不得決定骰式、骰點、數值、配點或新增規則。可提出 strength/endurance/dexterity/perception/appearance/capacity 的正向背景候選，每項至多一項；沒有充分依據就留空。每項必須引用一個 source 的原文 quote。使用者概念也是使用者來源。AI 自行補入、未知來源的原文不因採納而獲得獎勵；AI／未知原文只有使用者實質新增或改變該項意義，且引文承接實際新增意義才可標 substantive=true。只改標點、格式、同義字、錯字、名字或無關背景數字不算實質修改。不要從AI未改片段取得候選，也不要因其他欄位有修改就替未改內容加權。容量指穩定心理餘裕，與當前心情／需求分開。不提出負向或需求特性獎勵。只回JSON。'},
  {role:'user',content:JSON.stringify({task:'character-card-assessment-v1',concept:draft.concept,fields:draft.fields,provenance:draft.provenance})},
 ],schema,{...options,maxOutputTokens:2048});
 let parsed:unknown;try{if(raw.length>24000)throw Error();parsed=JSON.parse(raw);}catch{throw Error('人物背景判讀未回傳有效候選，原輸入已保留。');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).join(',')!=='bonuses'||!Array.isArray((parsed as CardAssessment).bonuses)||(parsed as CardAssessment).bonuses.length>18)throw Error('人物背景判讀未回傳有效候選，原輸入已保留。');
 const bonuses:BonusCandidate[]=[];
 for(const value of (parsed as CardAssessment).bonuses){
  if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='quote,source,substantive,target'||!targets.includes(value.target)||!sources.includes(value.source)||typeof value.quote!=='string'||!value.quote.trim()||value.quote.length>2400||typeof value.substantive!=='boolean')throw Error('人物背景判讀未回傳有效候選，原輸入已保留。');
  const text=value.source==='concept'?draft.concept:draft.fields[value.source as keyof typeof draft.fields];
  if(!text.includes(value.quote))continue;
  if(value.source!=='concept'){
   const origin=draft.provenance[value.source];
   if(!origin||origin.kind==='empty')continue;
   if(origin.kind!=='user'){
    if(!origin.materiallyEdited||!value.substantive||!origin.aiText||normalized(text)===normalized(origin.aiText)||normalized(origin.aiText).includes(normalized(value.quote)))continue;
   }
  }
  if(!bonuses.some(item=>item.target===value.target))bonuses.push({...value});
 }
 return {bonuses};
}
function die():number {const sample=Math.random();if(!Number.isFinite(sample)||sample<0||sample>=1)throw Error('人物骰源無效。');return Math.floor(sample*6)+1;}
export function formCardValues(assessment:CardAssessment):CardFormation {
 const bonus=new Set(assessment.bonuses.map(value=>value.target));
 const values={} as CardValues,minimums={} as CardValues,rolls={} as NonNullable<CardFormation['private']>['rolls'];
 for(const name of cardAttributeNames){rolls[name]=Array.from({length:bonus.has(name)?2:3},()=>die());values[name]=rolls[name].reduce((a,b)=>a+b,bonus.has(name)?6:0);minimums[name]=bonus.has(name)?8:3;}
 rolls.capacity=Array.from({length:bonus.has('capacity')?1:2},()=>die());
 const capacity=(rolls.capacity.reduce((a,b)=>a+b,bonus.has('capacity')?12:6))*5;
 const traits=[.8,1,1.2];const needTraits={hunger:traits[Math.floor((die()-1)/2)],thirst:traits[Math.floor((die()-1)/2)],sleep:traits[Math.floor((die()-1)/2)]};
 return {version:'character-card-v1',attributeVersion:2,values,initialTotal:cardAttributeNames.reduce((sum,name)=>sum+values[name],0),minimums,capacity,needTraits,private:{rolls,initialValues:{...values},bonuses:[...bonus]}};
}
