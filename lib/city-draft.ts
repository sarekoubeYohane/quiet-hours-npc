import type { CharacterTemplateFields } from './character-templates';
import type { EntryGrant, EntryPreview } from './entry-rules';

export const openingDescriptionMaxLength = 1600;
export const cityLimits = { places: 8, characters: 8, objects: 512, backgroundPeople: 8, relationships: 32 };
export type OpeningRelationship = { from: string; to: string; targetType: 'character' | 'background'; description: string };
export type CityDraft = {
  places: { id: string; templateId: string; version: number; name: string }[];
  characters: {
    templateId: string; version: number; placeId: string; roomId: string; homeId?: string; homeRoomId?: string;
    ownedPlaceIds?: string[]; workplaceIds?: string[]; homeDescription?: string; workDescription?: string;
  }[];
  backgroundPeople?: { id: string; name: string }[];
  relationships?: OpeningRelationship[];
  accessGrants?: EntryGrant[];
};
export type CityPreview = {
  places: { id: string; name: string; templateName: string; rooms: { id: string; name: string }[]; objects: { name: string; room: string }[] }[];
  characters: {
    templateId: string; name: string; place: string; room: string; home?: string; fields: CharacterTemplateFields;
    bedroom?: string; ownedPlaces?: string[]; workplaces?: string[];
  }[];
  backgroundPeople?: { id: string; name: string }[];
  relationships?: { from: string; to: string; description: string }[];
  access?: EntryPreview[];
  issues: string[];
};
