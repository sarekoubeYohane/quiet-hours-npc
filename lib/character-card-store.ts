import { database } from './store';
import { loadCharacterDraft } from './character-draft-store';
import { publicFormation, validCardAllocation, type CharacterCard } from './character-cards';
import type { CardAssessment } from './character-formation';
export async function saveCardAssessment(owner:string,draftId:string,operationId:string,value:CardAssessment) {
 await database().prepare('INSERT OR IGNORE INTO character_card_assessments (owner,draft_id,operation_id,body) VALUES (?,?,?,?)').bind(owner,draftId,operationId,JSON.stringify(value)).run();
}
export async function readCardAssessment(owner:string,draftId:string,operationId:string):Promise<CardAssessment|undefined> {
 const row=await database().prepare('SELECT body FROM character_card_assessments WHERE owner = ? AND draft_id = ? AND operation_id = ?').bind(owner,draftId,operationId).first<{body:string}>();return row?JSON.parse(row.body):undefined;
}
export async function listCharacterCards(owner:string):Promise<CharacterCard[]> {
 const {results}=await database().prepare('SELECT id,version,body FROM character_cards WHERE owner = ? ORDER BY id').bind(owner).all<{id:string;version:number;body:string}>();
 return results.map(row=>JSON.parse(row.body) as CharacterCard);
}
export async function completeCharacterCard(owner:string,draftId:string,version:number):Promise<CharacterCard|undefined> {
 const draft=await loadCharacterDraft(owner,draftId);if(!draft?.formation)return;
 const id='card-'+draftId;
 if(draft.completedCard){if(draft.completedCard.id!==id)return;return (await listCharacterCards(owner)).find(card=>card.id===id);}
 if(draft.version!==version||!validCardAllocation(draft.formation.values,draft.formation))return;
 const formed=publicFormation(draft.formation);
 const card:CharacterCard={id,version:1,fields:{...draft.fields},formationVersion:formed.version,attributeVersion:2,values:formed.values,initialTotal:formed.initialTotal,minimums:formed.minimums,capacity:formed.capacity,needTraits:formed.needTraits,sourceDraftId:draftId};
 const {id:unusedId,version:unusedVersion,...body}=draft;void unusedId;void unusedVersion;
 const completed=JSON.stringify({...body,completedCard:{id,version:1}});
 await database().batch([
  database().prepare('INSERT OR IGNORE INTO character_cards (owner,id,version,body) SELECT ?,?,1,? FROM character_drafts WHERE owner = ? AND id = ? AND version = ? AND json_type(body,\'$.formation\') = \'object\' AND json_type(body,\'$.completedCard\') IS NULL').bind(owner,id,JSON.stringify(card),owner,draftId,version),
  database().prepare('UPDATE character_drafts SET body = ?, version = version + 1 WHERE owner = ? AND id = ? AND version = ? AND EXISTS (SELECT 1 FROM character_cards WHERE owner = ? AND id = ? AND body = ?)').bind(completed,owner,draftId,version,owner,id,JSON.stringify(card)),
 ]);
 const after=await loadCharacterDraft(owner,draftId);if(after?.completedCard?.id===id)return card;
}
