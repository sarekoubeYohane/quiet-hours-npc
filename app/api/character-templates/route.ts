import {authoringScope,matchesScope,matchesReadScope,accountScopeMismatch} from '@/lib/account-scope';
import { initialMemoryCapacityError } from '@/lib/character-templates';
import { getGitHubUser } from '@/lib/auth';
import { characterPresets, listCharacterTemplates, readCharacterTemplateSave, saveCharacterTemplate } from '@/lib/character-template-store';

export const dynamic = 'force-dynamic';

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request?:Request) {
  try {
    const user = await getGitHubUser();
    if (!user) return reply({ error: '請先登入觀察室。' }, 401);
    if(!matchesReadScope(authoringScope(user.userId),request))return reply(accountScopeMismatch,409);
    const templates = await listCharacterTemplates(user.userId);
    return reply({ accountScope:authoringScope(user.userId), presets: characterPresets(), templates });
  } catch {
    return reply({ error: '暫時無法讀取人物範本。' }, 503);
  }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '請從觀察室操作。' }, 403);
  try {
    const user = await getGitHubUser();
    if (!user) return reply({ error: '請先登入觀察室。' }, 401);
    const submitted = await request.json().catch(() => undefined);
    if(!matchesScope(authoringScope(user.userId),(submitted as {accountScope?:unknown}|null)?.accountScope))return reply(accountScopeMismatch,409);
    const fields = submitted && typeof submitted === 'object' && 'fields' in submitted ? submitted.fields : undefined;
    const memoryError = initialMemoryCapacityError(fields && typeof fields === 'object' && 'initialMemories' in fields ? fields.initialMemories : undefined);
    if (memoryError) return reply({ error: memoryError, field: 'initialMemories' }, 400);
    const input = readCharacterTemplateSave(submitted);
    if (!input) return reply({ error: '請確認姓名、欄位長度及範本版本。' }, 400);
    const template = await saveCharacterTemplate(user.userId, input);
    if (!template) return reply({ error: '範本已變更，請重新讀取後再編輯。' }, 409);
    return reply({accountScope:authoringScope(user.userId),template});
  } catch {
    return reply({ error: '暫時無法保存人物範本，請用相同內容重試。' }, 503);
  }
}
