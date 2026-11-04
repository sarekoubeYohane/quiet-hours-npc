import type { CharacterTemplateFields } from './character-templates';

export const cityLimits = { places: 8, characters: 8, objects: 512 };
export type CityDraft = {
  places: { id: string; templateId: string; version: number; name: string }[];
  characters: { templateId: string; version: number; placeId: string; roomId: string; homeId?: string }[];
};
export type CityPreview = {
  places: { id: string; name: string; rooms: { id: string; name: string }[]; objects: { name: string; room: string }[] }[];
  characters: { name: string; place: string; room: string; home?: string; fields: CharacterTemplateFields }[];
  issues: string[];
};
