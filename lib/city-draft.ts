import type { OpeningKnowledge } from './opening-knowledge';
import type { CharacterTemplateFields } from './character-templates';
import type { EntryGrant, EntryPreview } from './entry-rules';

export const openingDescriptionMaxLength = 1600;
export const cityLimits = { places: 8, characters: 8, objects: 512, backgroundPeople: 8, relationships: 32 };
export type OpeningRelationship = { from: string; to: string; targetType: 'character' | 'background'; description: string };
export type FinalizedRoom = { id:string; name:string; privateFor?:string };
export type FinalizedObject = { id:string; roomId:string; name:string; state:Record<string,string>; hidden?:boolean };
export type FinalizedConnection = { id:string; name:string; rooms:[string,string]; state:'open'|'closed'|'blocked' };
export type CityWalk = { places:[string,string]; minutes:number|null };
export type CitySpace = { placeId:string; rooms:FinalizedRoom[]; objects:FinalizedObject[]; connections:FinalizedConnection[] };
export type CityFinalization = { spaces:CitySpace[]; walks:CityWalk[] };
export type CityDraft = {
  places: { id: string; templateId: string; version: number; name: string }[];
  characters: {
    templateId: string; version: number; placeId: string; roomId: string; homeId?: string; homeRoomId?: string;
    ownedPlaceIds?: string[]; workplaceIds?: string[]; homeDescription?: string; workDescription?: string;
  }[];
  backgroundPeople?: { id: string; name: string }[];
  relationships?: OpeningRelationship[];
  finalization?: CityFinalization;
  accessGrants?: EntryGrant[];
};
export type CityPreview = {
  places: { id:string; name:string; templateName:string; rooms:FinalizedRoom[]; objects:(FinalizedObject & {room:string})[]; connections:FinalizedConnection[] }[];
  walks?: CityWalk[];
  characters: {
    templateId: string; name: string; place: string; room: string; home?: string; fields: CharacterTemplateFields;
    bedroom?: string; bedroomId?:string; openingKnowledge?:OpeningKnowledge; ownedPlaces?: string[]; workplaces?: string[];
  }[];
  backgroundPeople?: { id: string; name: string }[];
  relationships?: { from: string; to: string; description: string }[];
  access?: EntryPreview[];
  issues: string[];
  missingStarts?: number;
};
