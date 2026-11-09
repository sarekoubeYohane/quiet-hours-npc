import { z } from 'zod';
import type { Character } from './world';

export const attributeLabels = { strength:'力量', endurance:'耐力', dexterity:'靈巧', perception:'感知能力' } as const;
export type AttributeName = keyof typeof attributeLabels;
export const attributeNames = Object.keys(attributeLabels) as AttributeName[];
const level = z.number().int().min(1).max(5);
const range = z.object({ value:level.optional(), min:level.optional(), max:level.optional() }).strict().refine(value =>
  (value.min ?? 1) <= (value.max ?? 5) && (value.value === undefined || value.value >= (value.min ?? 1) && value.value <= (value.max ?? 5)), '指定值與背景範圍矛盾');
const modifier = z.union([z.literal(-20),z.literal(-10),z.literal(0),z.literal(10),z.literal(20)]);
const expertise = z.object({scope:z.string().trim().min(1).max(80),modifier}).strict();
const sense = z.object({scope:z.enum(['sight','hearing','touch']),modifier}).strict();
export const characterSetupSchema = z.object({
  attributes:z.object({strength:range.optional(),endurance:range.optional(),dexterity:range.optional(),perception:range.optional()}).strict().optional(),
  blockedSenses:z.array(z.enum(['sight','hearing','touch'])).max(3).optional(),
  expertise:z.array(expertise).max(16).optional(), senses:z.array(sense).max(3).optional(),
}).strict().superRefine((value,ctx)=>{
  for (const key of ['expertise','senses'] as const) {
    const scopes=(value[key]??[]).map(item=>item.scope.normalize('NFKC').toLowerCase());
    if(new Set(scopes).size!==scopes.length)ctx.addIssue({code:'custom',path:[key],message:'同一範圍只能確認一個修正'});
  }
});
export type CharacterSetup = z.infer<typeof characterSetupSchema>;
export type CharacterAttributes = {
  version:1|2; activatedAt:number; authority:'owner-confirmed'|'formed-card'; values:Record<AttributeName,number>&{appearance?:number};
  blockedSenses?:('sight'|'hearing'|'touch')[];
  constraints:NonNullable<CharacterSetup['attributes']>;
  expertise:NonNullable<CharacterSetup['expertise']>; senses:NonNullable<CharacterSetup['senses']>;
};

function sample(random:()=>number):number {
  const value=random();
  if(!Number.isFinite(value)||value<0||value>=1)throw Error('人物建角亂數來源無效。');
  return value;
}

/** Only a successful explicit world write may call this; reads never form values. */
export function formCharacterAttributes(actor:Character, setup:CharacterSetup, minute:number, random:()=>number=Math.random):void {
  if(actor.attributes)throw Error('人物基本屬性已形成，不能重新抽取。');
  const accepted=characterSetupSchema.parse(setup);
  const values={} as Record<AttributeName,number>;
  for(const name of attributeNames){
    const constraint=accepted.attributes?.[name];
    if(constraint?.value!==undefined){values[name]=constraint.value;continue;}
    const min=constraint?.min??1,max=constraint?.max??5;
    if(min===1&&max===5){values[name]=Math.floor(sample(random)*3)+Math.floor(sample(random)*3)+1;continue;}
    // Conditional original 2d3−1 distribution, not rejection sampling or uniform levels.
    const supported=[1,2,3,4,5].filter(value=>value>=min&&value<=max);
    const weights=[1,2,3,2,1];
    let target=sample(random)*supported.reduce((sum,value)=>sum+weights[value-1],0);
    values[name]=supported.at(-1)!;
    for(const value of supported){target-=weights[value-1];if(target<0){values[name]=value;break;}}
  }
  actor.attributes={blockedSenses:[...new Set(accepted.blockedSenses??[])],version:1,activatedAt:minute,authority:'owner-confirmed',values,constraints:structuredClone(accepted.attributes??{}),expertise:structuredClone(accepted.expertise??[]),senses:structuredClone(accepted.senses??[])};
}
