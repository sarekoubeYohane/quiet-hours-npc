import type { CharacterTemplateFields } from './character-templates';
import type { NeedTraits } from './body-needs-policy';
export const cardAttributeLabels = { strength:'力量', endurance:'耐力', dexterity:'靈巧', perception:'感知', appearance:'外觀' } as const;
export const cardAttributeNames = Object.keys(cardAttributeLabels) as (keyof typeof cardAttributeLabels)[];
export type CardAttribute = keyof typeof cardAttributeLabels;
export type CardValues = Record<CardAttribute, number>;
export type CardFormation = {
  version:'character-card-v1'; attributeVersion:2; values:CardValues; initialTotal:number; minimums:CardValues;
  capacity:number; needTraits:NeedTraits;
  operationId?:string; inputVersion?:number;
  private?:{rolls:Record<CardAttribute|'capacity',number[]>;initialValues:CardValues;bonuses:(CardAttribute|'capacity')[]};
};
export type CharacterCard = {
 id:string;version:1;fields:CharacterTemplateFields;formationVersion:'character-card-v1';attributeVersion:2;
 values:CardValues;initialTotal:number;minimums:CardValues;capacity:number;needTraits:NeedTraits;sourceDraftId:string;
};
export function publicFormation(value:CardFormation):CardFormation {
 const {version,attributeVersion,values,initialTotal,minimums,capacity,needTraits}=value;
 return {version,attributeVersion,values,initialTotal,minimums,capacity,needTraits};
}
export function validCardAllocation(value:unknown, formed:CardFormation):value is CardValues {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...cardAttributeNames].sort().join(','))return false;
 const values=value as CardValues;
 return cardAttributeNames.every(name=>Number.isInteger(values[name])&&values[name]>=formed.minimums[name]&&values[name]<=18)&&cardAttributeNames.reduce((sum,name)=>sum+values[name],0)===formed.initialTotal;
}
