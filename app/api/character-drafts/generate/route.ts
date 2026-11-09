import { getGitHubUser } from '@/lib/auth';
import { loadCharacterDraft, writeCharacterDraft } from '@/lib/character-draft-store';
import { characterDraftFieldNames } from '@/lib/character-drafts';
import { readCharacterTemplateFields } from '@/lib/character-templates';
import { POST as worldOperation } from '@/app/api/world/route';
import { roundTimePolicy, timePolicyHeader } from '@/lib/round-time-policy';
export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) return reply({ error: '請從人物頁操作。' }, 403);
  try {
    const user = await getGitHubUser();
    if (!user) return reply({ error: '請先登入。' }, 401);
    const input = await request.json() as Record<string, unknown>;
    if (typeof input.id !== 'string' || !Number.isSafeInteger(input.version)) return reply({ error: '草稿版本無效。' }, 400);
    let draft = await loadCharacterDraft(user.userId, input.id);
    if (!draft) return reply({ error: '找不到本帳號的草稿。' }, 404);
    if (input.discard === true) {
      if (draft.version !== input.version) return reply({ error: '另一頁已修改草稿，請重新核對。' }, 409);
      const next = { ...draft }; delete next.pendingGeneration;
      const saved = await writeCharacterDraft(user.userId, next);
      return saved ? reply({ draft: saved }) : reply({ error: '另一頁已修改草稿。' }, 409);
    }
    if (typeof input.operationId !== 'string' || input.operationId.length > 160 || typeof input.operationScope !== 'string' || (input.worldContext !== undefined && typeof input.worldContext !== 'string')) return reply({ error: 'AI 操作身分無效。' }, 400);
    if (draft.completedGeneration?.operationId === input.operationId && draft.completedGeneration.inputVersion === input.version) return reply({ draft });
    if (!draft.pendingGeneration) {
      if (draft.version !== input.version) return reply({ error: '未同步：另一頁已修改草稿，保留原輸入。' }, 409);
      const pendingGeneration = { operationId: input.operationId, operationScope: input.operationScope, worldContext: input.worldContext, baseVersion: draft.version, concept: draft.concept, fields: draft.fields };
      const saved = await writeCharacterDraft(user.userId, { ...draft, pendingGeneration });
      if (!saved) return reply({ error: '未同步：另一頁已修改草稿。' }, 409);
      draft = saved;
    }
    const pending = draft.pendingGeneration!;
    if (pending.operationId !== input.operationId || pending.baseVersion !== input.version) return reply({ error: '有先前 AI 操作尚待恢復，請先恢復原操作。', draft }, 409);
    if (draft.version !== pending.baseVersion + 1) return reply({ error: '未同步：原 AI 操作期間草稿已變更，請核對或放棄套用原結果。', draft }, 409);
    // The original accepted request owns the model receipt; never construct a new
    // operation ID after a lost response, reload, or model setting change.
    const modelResponse = await worldOperation(new Request(origin + '/api/world?workspace=account', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', [timePolicyHeader]: roundTimePolicy.version },
      body: JSON.stringify({ operation: 'generate-character-template', mode: 'demo', operationId: pending.operationId, operationScope: pending.operationScope, worldContext: pending.worldContext, characterGeneration: { description: pending.concept, fields: pending.fields, purpose: 'character-card' } }),
    }));
    const result = await modelResponse.json() as { generatedCharacter?: unknown; error?: string; retryable?: boolean; operationUncertain?: boolean };
    if (!modelResponse.ok) {
      if (!result.retryable && !result.operationUncertain) {
        const next = { ...draft }; delete next.pendingGeneration;
        const cleared = await writeCharacterDraft(user.userId, next);
        return reply({ ...result, ...(cleared ? { draft: cleared } : {}), error: result.error || 'AI 補完失敗，原輸入已保留。' }, modelResponse.status);
      }
      return reply({ ...result, draft, error: result.error || '結果尚未確認，請恢復原操作。' }, modelResponse.status);
    }
    const fields = readCharacterTemplateFields(result.generatedCharacter);
    if (!fields) return reply({ error: '模型結果無效，原輸入已保留。', draft }, 502);
    const next = { ...draft, fields: { ...draft.fields }, provenance: { ...draft.provenance }, completedGeneration: { operationId: pending.operationId, inputVersion: pending.baseVersion } };
    for (const field of characterDraftFieldNames) {
      if (pending.fields[field] !== '' || next.fields[field] !== '') continue;
      next.fields[field] = fields[field];
      if (fields[field].trim()) next.provenance[field] = { kind: 'ai', aiText: fields[field], materiallyEdited: false };
    }
    delete next.pendingGeneration;
    const saved = await writeCharacterDraft(user.userId, next);
    if (!saved) return reply({ error: '未同步：AI 回覆期間另一頁已修改草稿，未覆寫新內容。請重新核對或放棄原 AI 結果。' }, 409);
    return reply({ draft: saved });
  } catch { return reply({ error: '未同步：AI 結果尚未確認，原輸入已保留。請恢復原操作。', operationUncertain: true }, 503); }
}
