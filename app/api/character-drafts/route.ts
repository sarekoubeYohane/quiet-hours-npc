import { getGitHubUser } from '@/lib/auth';
import { characterDraftForClient, readCharacterDraftInput } from '@/lib/character-drafts';
import { listCharacterDrafts, saveCharacterDraft } from '@/lib/character-draft-store';
export const dynamic = 'force-dynamic';
function reply(body: object, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function GET() {
  try {
    const user = await getGitHubUser();
    if (!user) return reply({ error: '請先登入。' }, 401);
    return reply({ drafts: (await listCharacterDrafts(user.userId)).map(draft=>characterDraftForClient(draft,user.userId)) });
  } catch { return reply({ error: '未同步：暫時無法讀取建角草稿。' }, 503); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '請從人物頁操作。' }, 403);
  try {
    const user = await getGitHubUser();
    if (!user) return reply({ error: '請先登入。' }, 401);
    const input = readCharacterDraftInput(await request.json().catch(() => null));
    if (!input) return reply({ error: '請確認人物欄位長度及草稿版本，原輸入已保留。' }, 400);
    const draft = await saveCharacterDraft(user.userId, input);
    if (!draft) return reply({ error: '未同步：另一頁已修改草稿。原輸入已保留，請重新核對。' }, 409);
    return reply({ draft: characterDraftForClient(draft,user.userId) });
  } catch { return reply({ error: '未同步：保存失敗。原輸入已保留，請恢復原操作。' }, 503); }
}
