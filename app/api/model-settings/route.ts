import { getGitHubUser } from '@/lib/auth';
import { bindWorldSave, SaveAccessError } from '@/lib/world-saves';
import { readModelPreference } from '@/lib/model-settings';
import { modelSettingsView, saveModelPreference } from '@/lib/model-settings-store';
export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function scope(request: Request) {
  const user = await getGitHubUser();
  if (!user) return;
  const query = new URL(request.url).searchParams;
  if (query.has('workspace') || query.getAll('save').length > 1 || query.has('save') && !query.get('save')) throw new SaveAccessError('設定來源無效。', 400);
  return { owner: user.userId, binding: query.has('save') ? await bindWorldSave(user.userId, request) : undefined };
}
export async function GET(request: Request) {
  try { const context = await scope(request); return context ? reply(await modelSettingsView(context.owner, context.binding)) : reply({ error: '請先登入。' }, 401); }
  catch (error) { return reply({ error: error instanceof SaveAccessError ? error.message : '未同步：暫時無法讀取模型設定。' }, error instanceof SaveAccessError ? error.status : 503); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '請從本站保存模型設定。' }, 403);
  try {
    const context = await scope(request);
    if (!context) return reply({ error: '請先登入。' }, 401);
    const raw = await request.text();
    if (raw.length > 2000) return reply({ error: '設定內容過長。' }, 400);
    const input = JSON.parse(raw) as { version?: number };
    const preference = readModelPreference(input, !!context.binding?.saveId);
    if (!preference || !Number.isSafeInteger(input.version) || input.version! < 0 || input.version! >= Number.MAX_SAFE_INTEGER) return reply({ error: '請填寫 NPC 與天上意志的合法模型，原輸入已保留。' }, 400);
    if (!await saveModelPreference(context.owner, context.binding, input.version!, preference)) return reply({ error: '未同步：另一頁已修改模型設定。請核對已存版本，原輸入已保留。' }, 409);
    return reply(await modelSettingsView(context.owner, context.binding));
  } catch (error) { return reply({ error: error instanceof SaveAccessError ? error.message : '未同步：保存結果尚未確認，請保留原設定並恢復保存。' }, error instanceof SaveAccessError ? error.status : 503); }
}
