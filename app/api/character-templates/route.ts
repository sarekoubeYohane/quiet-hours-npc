import { getGitHubUser } from '@/lib/auth';
import { characterPresets, listCharacterTemplates, readCharacterTemplateSave, saveCharacterTemplate } from '@/lib/character-template-store';

export const dynamic = 'force-dynamic';

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  try {
    const user = await getGitHubUser();
    if (!user) return reply({ error: '請先登入觀察室。' }, 401);
    const templates = await listCharacterTemplates(user.userId);
    return reply({ presets: characterPresets(), templates });
  } catch {
    return reply({ error: '暫時無法讀取人物範本。' }, 503);
  }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '請從觀察室操作。' }, 403);
  try {
    const user = await getGitHubUser();
    if (!user) return reply({ error: '請先登入觀察室。' }, 401);
    const input = readCharacterTemplateSave(await request.json().catch(() => undefined));
    if (!input) return reply({ error: '請確認姓名、欄位長度及範本版本。' }, 400);
    const template = await saveCharacterTemplate(user.userId, input);
    if (!template) return reply({ error: '範本已變更，請重新讀取後再編輯。' }, 409);
    return reply({ template });
  } catch {
    return reply({ error: '暫時無法保存人物範本，請用相同內容重試。' }, 503);
  }
}
