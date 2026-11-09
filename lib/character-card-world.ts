import type { CharacterCard } from './character-cards';
import type { Character,World } from './world';
import { attributeNames } from './character-attributes';
import { enablePersonalNeeds } from './body-needs-policy';
import { formFormalMentalEnergy, type MentalOpeningInput } from './formal-mental-enablement';
/** A completed card supplies stable values; only this world's living state is new. */
export function applyCharacterCard(actor:Character,card:CharacterCard,minute:number,opening:MentalOpeningInput={},initial?:import('./needs').NeedValues):void {
 if(actor.attributes||actor.mentalEnergy||actor.needs?.personal)throw Error('人物生活狀態已形成，不能用卡片重新抽取或覆寫。');
 if(['capacity','minimum','maximum'].some(key=>Object.hasOwn(opening,key)))throw Error('完成卡精神容量已固定，開局只能安排目前電量。');
 actor.attributes={version:2,activatedAt:minute,authority:'formed-card',values:{...card.values},constraints:Object.fromEntries(attributeNames.map(name=>[name,{min:card.minimums[name],max:18}])),expertise:[],senses:[],blockedSenses:[]};
 actor.profileSource={id:card.id,version:card.version,kind:'card'};
 const world:World={minute,turn:0,lastMode:'demo',characters:[actor],events:[]};
 enablePersonalNeeds(world,[{id:actor.id,source:'完成人物卡的穩定需求特性',initial,traits:{hunger:[card.needTraits.hunger],thirst:[card.needTraits.thirst],sleep:[card.needTraits.sleep]}}]);
 formFormalMentalEnergy(actor,minute,{...opening,capacity:card.capacity});
}
