import {z} from 'zod';
import type {Character,World} from './world';
import {createFormalMentalEnergy,assertFormalMentalEnergy,formalEnergyStageIndex,type FormalOpening} from './formal-mental-policy';
export const mentalOpeningSchema=z.object({capacity:z.number().int().positive().safe().optional(),minimum:z.number().int().min(40).max(90).optional(),maximum:z.number().int().min(40).max(90).optional(),current:z.number().int().nonnegative().safe().optional(),stage:z.enum(['充沛','有餘','尚可','吃緊','見底']).optional()}).strict().superRefine((o,ctx)=>{
 const min=o.minimum??40,max=o.maximum??90;
 if(min>max||(o.capacity!==undefined&&(o.minimum!==undefined&&o.capacity<min||o.maximum!==undefined&&o.capacity>max)))ctx.addIssue({code:'custom',message:'容量與背景範圍矛盾。'});
 if(o.capacity===undefined&&!Array.from({length:11},(_,i)=>40+i*5).some(n=>n>=min&&n<=max))ctx.addIssue({code:'custom',message:'容量範圍沒有合法建角結果。'});
 if(o.current!==undefined&&Number.isSafeInteger(o.current)&&o.current>=0){
  const support=o.capacity!==undefined?[o.capacity]:Array.from({length:11},(_,i)=>40+i*5).filter(n=>n>=min&&n<=max);
  if(support.some(capacity=>Number.isSafeInteger(capacity)&&capacity>0&&(o.current!>capacity||o.stage!==undefined&&['見底','吃緊','尚可','有餘','充沛'][formalEnergyStageIndex(o.current!,capacity)]!==o.stage)))ctx.addIssue({code:'custom',message:'明示目前電量／階段不適用所有允許容量；請指定固定容量或收緊背景容量範圍。'});
 }
});
export type MentalOpeningInput=z.infer<typeof mentalOpeningSchema>;
export const mentalAdoptionSchema=z.array(z.object({id:z.string().min(1).max(128),opening:mentalOpeningSchema.optional()}).strict()).min(1).max(32);
export type MentalAdoption=z.infer<typeof mentalAdoptionSchema>;
export function validateMentalAdoption(world:World,input:unknown):MentalAdoption{
 const parsed=mentalAdoptionSchema.safeParse(input);if(!parsed.success)throw Error(parsed.error.issues[0]?.message||'請確認精神電量開局設定。');
 if(world.pursuitVersion!==1||typeof world.pursuitContext!=='string')throw Error('此世界使用舊意圖契約；保留原資料，請沿既有相容處置後再啟用。');
 if(world.characters.some(c=>c.mentalEnergy?.policy?.kind==='test'))throw Error('隔離測試精神電量不能轉成正式資料；請使用相容且尚未啟用的世界。');
 const ids=new Set<string>();
 for(const item of parsed.data){const actor=world.characters.find(c=>c.id===item.id);if(!actor||ids.has(item.id))throw Error('精神電量人物不存在或重複。');ids.add(item.id);
  if(Object.hasOwn(actor,'mentalEnergy')&&actor.mentalEnergy!==undefined){assertFormalMentalEnergy(actor);if(actor.mentalEnergy.updatedAt>world.minute)throw Error('精神電量時點晚於目前世界。');if(Object.keys(item.opening??{}).length)throw Error('既有正式精神電量保持原值，不能重新建角或改寫初值。');}
 }
 return parsed.data;
}
export function formFormalMentalEnergy(actor:Character,minute:number,opening:MentalOpeningInput={}):void{
 if(Object.hasOwn(actor,'mentalEnergy')&&actor.mentalEnergy!==undefined){assertFormalMentalEnergy(actor);if(actor.mentalEnergy.updatedAt>minute)throw Error('精神電量時點晚於目前世界。');return;}
 actor.mentalEnergy=createFormalMentalEnergy(actor,minute,opening as FormalOpening);
}
export function adoptFormalMentalEnergy(world:World,items:MentalAdoption):void{
 const validated=validateMentalAdoption(world,items);
 for(const item of validated)formFormalMentalEnergy(world.characters.find(c=>c.id===item.id)!,world.minute,item.opening);
 world.timeContract='five-minute-v1';
}
