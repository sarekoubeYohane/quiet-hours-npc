/* eslint-disable @typescript-eslint/no-require-imports */
// Compatibility-only setup for cities saved before #281. This does NOT create a
// world through a product flow and must never be used as new-opening evidence.
const path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
exports.installHistoricalCity=async city=>{
 const store=load('store'),previous=store.snapshot(),owner=(await load('auth').getGitHubUser()).userId;
 const candidate=await load('city-creation').prepareCity(owner,city,previous);
 if(!candidate.world)throw Error('Invalid historical fixture: '+candidate.preview.issues.join(' '));
 const world=candidate.world;
 for(const actor of world.characters){const selection=city.characters.find(item=>item.templateId===actor.profileSource?.id);if(!actor.attributes)load('character-attributes').formCharacterAttributes(actor,selection?.characterSetup??{},world.minute);load('formal-mental-enablement').formFormalMentalEnergy(actor,world.minute,selection?.mentalOpening??{});}
 world.timeContract='five-minute-v1';store.replaceCommittedWorld(world);
 return (await load('route').GET()).json();
};
