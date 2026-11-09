import { entryPermission } from './city-access';
import { worldLocations, worldRegions } from './world-configuration';
import { regionOf } from './perception';
import { routineWorldLimits } from './routine-world-contract';
import { adjudicationRules } from './adjudication-contract';
import { redactDiagnosticText, sensitiveDiagnosticKey } from './diagnostic-redaction';
import { requestModel, type ModelService } from './model-adapter';
import type { Action, Character, World } from './world';

export const adjudicationContractVersion = 'world-adjudication.v1';
export type AdjudicationInput = {
  contractVersion: typeof adjudicationContractVersion;
  action: Pick<Action, 'type' | 'target' | 'content' | 'purpose'>;
  actor: { id: string; location: string; region?: string; abilityTags: string[]; checkSystem?:'d100-v1'; attributes?:Character['attributes'] };
  target?: { id: string; location: string; region?: string };
  rules: string[];
  entryPermission?: { regionId: string; allowed: boolean };
  durationMinutes?: number;
  knownActivityIdentities?: {version:1;key:string;label:string}[];
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
    // Candidates can encode credentials as {key:"authorization",value:"..."}.
    // Mask this structured form before applying the existing text snapshots.
    const scrub=(value:unknown,depth=0):unknown=>{
      // The ordinary nested effect schema reaches beyond depth 12. Keep it
      // intact; this guard is only for pathological diagnostic structures.
      if(depth>32){truncated=true;return '<OMITTED>';}
      if(typeof value==='string')return redactDiagnosticText(value,secrets);
      if(Array.isArray(value)){if(value.length>64)truncated=true;return value.slice(0,64).map(item=>scrub(item,depth+1));}
      if(value&&typeof value==='object'){
        const item=value as Record<string,unknown>;
        if(Object.keys(item).length>64)truncated=true;
        return Object.fromEntries(Object.entries(item).slice(0,64).map(([key,content])=>[redactDiagnosticText(key,secrets),sensitiveDiagnosticKey.test(key)||((key==='value'||key==='from')&&typeof item.key==='string'&&sensitiveDiagnosticKey.test(item.key))?'<REDACTED>':scrub(content,depth+1)]));
      }
      return value;
    };
    try{return JSON.stringify(scrub(JSON.parse(text)));}
    catch{return redactDiagnosticText(text,secrets);}
  };
  let truncated = false;
  // The model receives the contract itself, but a failure receipt needs the
  // dynamic decision context plus its version, not another copy of the static
  // prompt and schema. Declare that projection rather than treating it as lost
  // runtime evidence whenever the shared contract grows.
  const diagnosticInput = () => {
    let value:unknown=input;
    if(typeof value==='string'){try{value=JSON.parse(value);}catch{return value;}}
    if(!value||typeof value!=='object'||Array.isArray(value))return value;
    const staticFields=['rules','effectRules','effectContract'];
    const entries=Object.entries(value);
    return {...Object.fromEntries(entries.filter(([key])=>!staticFields.includes(key))),inputProjection:{version:1,omittedStaticFields:entries.filter(([key])=>staticFields.includes(key)).map(([key])=>key)}};
  };
  const snapshot = (value: unknown, limit: number) => {
    const text = redact(typeof value === 'string' ? value : JSON.stringify(value));
    if (text.length <= limit) return text;
    truncated = true;
    // Keep structured snapshots valid JSON when truncating. The old raw slice
    // could cut in the middle of a property and destroy all retained evidence.
    let parsed:unknown;
    try{parsed=JSON.parse(text);}catch{return text.slice(0,limit);}
    for(let strings=1024,items=32;strings>=1;strings=Math.floor(strings/2),items=Math.floor(items/2)){
      const clip=(item:unknown):unknown=>{
        if(typeof item==='string')return item.length>strings?item.slice(0,strings)+'…':item;
        if(Array.isArray(item))return item.slice(0,items).map(clip);
        if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,content])=>[key,clip(content)]));
        return item;
      };
      const clipped=JSON.stringify(clip(parsed));
      if(clipped.length<=limit)return clipped;
    }
    return limit>=24?'{"snapshotOmitted":true}':'null';
  };
  const validationText = snapshot(details, 4000);
  let validation: Record<string, unknown>;
  try { validation = JSON.parse(validationText); }
  catch { validation = { reason: details.reason, snapshot: validationText }; }
  const result: AdjudicationFailure = {
    ...context, actorId: snapshot(context.actorId, 120), contextId: context.contextId === undefined ? undefined : snapshot(context.contextId, 120),
    input: snapshot(diagnosticInput(), 9000), candidate: snapshot(raw, 8192), validation, truncated,
  };
  // Account for JSON escaping as well as the individual field bounds.
  while (JSON.stringify(result).length > 24000) {
    result.input = snapshot(result.input, Math.floor(result.input.length / 2));
    result.candidate = snapshot(result.candidate, Math.floor(result.candidate.length / 2));
    result.truncated = true;
  }
  return result;
}
export function buildAdjudicationInput(world: World, actor: Character, action: Action, routinePrograms=false): AdjudicationInput {
  const target = world.characters.find(character => character.id === action.target);
  const regions = worldRegions(world);
  const region = regions.find(item => item.id === action.target);
  const location = region?.location ?? worldLocations(world).find(item => item.id === action.target)?.id;
  const room = region?.id ?? (location && regions.find(item => item.location === location)?.id);
  const permission = (action.type === 'move' || action.type === 'propose') && location && room
    ? entryPermission(world, actor.id, location, room)
    : action.type === 'propose' ? entryPermission(world, actor.id, actor.location, regionOf(actor)) : undefined;
  return {
    contractVersion: adjudicationContractVersion,
    knownActivityIdentities:[...new Map((actor.habitEvidence||[]).filter(item=>item.confirmedIdentity).map(item=>[item.confirmedIdentity!.key,item.confirmedIdentity!])).values()].slice(-24),
    action: { type: action.type, target: action.target, content: action.content, ...(action.purpose?{purpose:action.purpose}:{}) },
    actor: { id: actor.id, location: actor.location, region: actor.region, abilityTags: [...(actor.abilityTags || [])], ...(actor.attributes?{checkSystem:'d100-v1' as const,attributes:structuredClone(actor.attributes)}:{}) },
    ...(target ? { target: { id: target.id, location: target.location, region: target.region } } : {}),
    ...(permission ? {entryPermission:permission} : {}),
    rules: [
      ...adjudicationRules(routinePrograms),
      ...(actor.attributes ? ['本人物的新確認 check 使用 system=d100-v1；attribute 從 strength/endurance/dexterity/perception 或 null 擇與具體方法相關的一項，sense 從 sight/hearing/touch 或 null 擇相關感官；ability 是實際領域。只有 actor.attributes 已確認的專長／感官數字可用，不能從角色名、職業或文字現場賦權。環境噪音只影響 difficulty，同一弱點不重複降低屬性及感官／專長；沒有機會或確定行為用 check=null，不用骰子替人物同意。舊規則保持原版，新確認結果仍使用受限五段分支，不指定骰點、門檻或最終結果。'] : []),
      ...(permission ? ['entryPermission 是此區域的實際進出授權。授權不代表門已開啟或其他人同意協助；未獲授權也不等於物理上無法進入。'] : []),
    ],
  };
}
// Separate task transcript and service configuration; NPC chat history is never reused.
// The caller owns the candidate schema, validation, dispatch budget and commit authority.
export function requestAdjudication(input: AdjudicationInput, service: ModelService, schema: object, options: Parameters<typeof requestModel>[3]): Promise<string> {
  return requestModel(service, [
    { role: 'system', content: '你負責世界主持的行動解讀。依本次契約提出候選；不直接修改世界，不擲骰、不指定最終結果，只輸出 JSON。' },
    { role: 'user', content: JSON.stringify(input) },
  ], schema, {...options,...('routineOffer' in input&&input.routineOffer?{maxOutputTokens:routineWorldLimits.maxOutputTokens}:{})});
}
export function validateExistingAdjudication(candidate: unknown): void {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).length !== 1 || !('status' in candidate) || candidate.status !== 'accepted') {
    throw Error('裁定候選不適用於既有程式行動。');
  }
}
