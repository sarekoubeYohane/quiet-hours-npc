import { requestModel, type ModelService } from './model-adapter';
import type { Action, Character, World } from './world';

export const adjudicationContractVersion = 'world-adjudication.v1';
export type AdjudicationInput = {
  contractVersion: typeof adjudicationContractVersion;
  action: Pick<Action, 'type' | 'target' | 'content' | 'purpose'>;
  actor: { id: string; location: string; region?: string; abilityTags: string[] };
  target?: { id: string; location: string; region?: string };
  rules: string[];
  durationMinutes?: number;
};
export type WorldTaskServices = {
  // Dependency injection at the server handler, never selectable by a JSON request.
  adjudicateExistingAction?: (input: AdjudicationInput) => Promise<unknown>;
};
export type AdjudicationFailure = {
  operationId: string;
  requestId: string;
  contextId?: string;
  actorId: string;
  stage: 'parse' | 'effects';
  input: string;
  candidate: string;
  validation: Record<string, unknown>;
  truncated: boolean;
};

// A bounded failure receipt, stored with the operation rather than in story
// events or NPC memory. Only the already-filtered adjudication input is accepted.
export function captureAdjudicationFailure(
  context: Pick<AdjudicationFailure, 'operationId' | 'requestId' | 'contextId' | 'actorId' | 'stage'>,
  input: unknown, raw: string, details: Record<string, unknown>, secrets: string[],
): AdjudicationFailure {
  const redact = (text: string) => {
    for (const secret of secrets.filter(Boolean)) text = text.split(JSON.stringify(secret).slice(1, -1)).join('<REDACTED>');
    return text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <REDACTED>')
      .replace(/sk-[A-Za-z0-9_-]+/g, '<REDACTED>')
      .replace(/("(?:authorization|api[_-]?key)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"<REDACTED>"');
  };
  let truncated = false;
  const snapshot = (value: unknown, limit: number) => {
    const text = redact(typeof value === 'string' ? value : JSON.stringify(value));
    if (text.length <= limit) return text;
    truncated = true;
    return text.slice(0, limit);
  };
  const validationText = snapshot(details, 4000);
  let validation: Record<string, unknown>;
  try { validation = JSON.parse(validationText); }
  catch { validation = { reason: details.reason, snapshot: validationText }; }
  const result: AdjudicationFailure = {
    ...context, actorId: snapshot(context.actorId, 120), contextId: context.contextId === undefined ? undefined : snapshot(context.contextId, 120),
    input: snapshot(input, 9000), candidate: snapshot(raw, 8192), validation, truncated,
  };
  // Account for JSON escaping as well as the individual field bounds.
  while (JSON.stringify(result).length > 24000) {
    result.input = result.input.slice(0, Math.floor(result.input.length / 2));
    result.candidate = result.candidate.slice(0, Math.floor(result.candidate.length / 2));
    result.truncated = true;
  }
  return result;
}
export function buildAdjudicationInput(world: World, actor: Character, action: Action): AdjudicationInput {
  const target = world.characters.find(character => character.id === action.target);
  return {
    contractVersion: adjudicationContractVersion,
    action: { type: action.type, target: action.target, content: action.content, ...(action.purpose?{purpose:action.purpose}:{}) },
    actor: { id: actor.id, location: actor.location, region: actor.region, abilityTags: [...(actor.abilityTags || [])] },
    ...(target ? { target: { id: target.id, location: target.location, region: target.region } } : {}),
    rules: [
      '只裁定當前提案，不產生背景事件。日常核准與一般效果互斥：routineOffer 非空且普通活動符合時，選一個模板 operation，回傳 routine={family:routineOffer.family,version:1,operation,subject,timings}；accepted、check=null、effects=[]、stages=[]、completionMinutes=null。核准不是已執行效果，程式依當前合法物件及背景承接。完整 routine.timings 是唯一耗時來源，必須恰好涵蓋 routineOffer.operations 各一次，每項 {operation,minutes} 為正數且至多90；依方法及場所確認，不固定茶或咖啡時間。NPC durationMinutes 只是估時，程式向上對齊15分鐘。subject 選模板 subjects；餐點須指明種類、飲用須區分茶／咖啡／泛指飲品，其他可 null。按語義解讀單份普通活動，不要求範例原句。物資留白可依場所確認普通背景，但明確缺貨、損壞、權限優先。特殊方法、大量規模、授權、交付不屬日常核准；不適用則 routine=null，沿一般受限效果契約。禁止額外規則、背景或 world patch。',
      '不得擲骰、指定骰值、最終級別或他人意願；程式驗證、判定並提交。',
    ],
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
