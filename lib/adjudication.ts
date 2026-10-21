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
    rules: ['僅回應當前行動，不產生背景事件。若 routineOffer 非空且當前普通活動符合，依提案語義從 routineOffer.templates 選擇一個 operation，回傳 routine={family: routineOffer.family,version:1,operation,subject,timings}；timings 必須一次涵蓋 routineOffer.operations 全部項目，每項 {operation,minutes}，依方法與場所條件確認合理完成分鐘，正數且至多90，不能預設茶或咖啡固定時間。NPC durationMinutes 僅為一般估時，不限制完成時間，程式會向上對齊15分鐘，同時 accepted、check=null、effects=[]、stages=[]；由程式綁定當前合法物件與背景。subject 從所選模板的 subjects 選擇；餐點須明示是哪種，飲用須區分茶、咖啡或泛指飲品，其他活動可用 null。這是有界單份普通活動的解讀，不要求 NPC 使用範例原句；supplies/objects 留白不等於已耗盡或不存在，可依場所定位確認普通背景。明確缺貨、損壞、物件權限仍優先；特殊方法、大量規模、授權與交付不屬普通背景核准。不適用時 routine=null，沿既有受限效果。不接受額外規則、背景或 world patch。', '不得擲骰、指定骰值、最終級別或他人意願；程式驗證、判定並提交。'],
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
