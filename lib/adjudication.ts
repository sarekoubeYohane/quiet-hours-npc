import { requestModel, type ModelService } from './model-adapter';
import type { Action, Character, World } from './world';

export const adjudicationContractVersion = 'world-adjudication.v1';
export type AdjudicationInput = {
  contractVersion: typeof adjudicationContractVersion;
  action: Pick<Action, 'type' | 'target' | 'content' | 'purpose'>;
  actor: { id: string; location: string; region?: string; abilityTags: string[] };
  target?: { id: string; location: string; region?: string };
  rules: string[];
};
export type WorldTaskServices = {
  // Dependency injection at the server handler, never selectable by a JSON request.
  adjudicateExistingAction?: (input: AdjudicationInput) => Promise<unknown>;
};
export function buildAdjudicationInput(world: World, actor: Character, action: Action): AdjudicationInput {
  const target = world.characters.find(character => character.id === action.target);
  return {
    contractVersion: adjudicationContractVersion,
    action: { type: action.type, target: action.target, content: action.content, ...(action.purpose?{purpose:action.purpose}:{}) },
    actor: { id: actor.id, location: actor.location, region: actor.region, abilityTags: [...(actor.abilityTags || [])] },
    ...(target ? { target: { id: target.id, location: target.location, region: target.region } } : {}),
    rules: ['僅回應當前行動，不產生背景事件。', '不得擲骰、指定骰值、最終級別或他人意願；程式驗證、判定並提交。'],
  };
}
// Separate task transcript and service configuration; NPC chat history is never reused.
// The caller owns the candidate schema, validation, dispatch budget and commit authority.
export function requestAdjudication(input: AdjudicationInput, service: ModelService, schema: object, options: Parameters<typeof requestModel>[3]): Promise<string> {
  return requestModel(service, [
    { role: 'system', content: '你負責世界主持的行動解讀。依本次契約提出候選；不直接修改世界，不擲骰、不指定最終結果，只輸出 JSON。' },
    { role: 'user', content: JSON.stringify(input) },
  ], schema, options);
}
export function validateExistingAdjudication(candidate: unknown): void {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).length !== 1 || !('status' in candidate) || candidate.status !== 'accepted') {
    throw Error('裁定候選不適用於既有程式行動。');
  }
}
