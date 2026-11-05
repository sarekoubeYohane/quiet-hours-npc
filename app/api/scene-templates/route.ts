import { getGitHubUser } from '@/lib/auth';
import { database } from '@/lib/store';
import { sceneTemplateSave } from '@/lib/scene-templates';

import { listSceneTemplates, readSceneTemplate, type StoredSceneTemplate } from '@/lib/scene-template-store';

export const dynamic = 'force-dynamic';

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  try {
    const user = await getGitHubUser();
    if (!user) return reply({ error: '請先登入觀察室。' }, 401);
    return reply({ templates: await listSceneTemplates(user.userId) });
  } catch {
    return reply({ error: '暫時無法讀取場景範本。' }, 503);
  }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return reply({ error: '請從觀察室操作。' }, 403);
  }
  try {
    const user = await getGitHubUser();
    if (!user) return reply({ error: '請先登入觀察室。' }, 401);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 128 * 1024) return reply({ error: '場景範本資料過大。' }, 413);
    const parsed = sceneTemplateSave.safeParse(parseJson(text));
    if (!parsed.success) return reply({ error: '請確認場所名稱、房間、連接及物件資料。' }, 400);

    const { id, version, ...draft } = parsed.data;
    const body = JSON.stringify(draft);
    const db = database();
    const row = version === 0
      ? await db.prepare(
        'INSERT OR IGNORE INTO scene_templates (owner, id, version, body) VALUES (?, ?, 1, ?) RETURNING id, version, body'
      ).bind(user.userId, id, body).first<StoredSceneTemplate>()
      : await db.prepare(
        'UPDATE scene_templates SET version = version + 1, body = ? WHERE owner = ? AND id = ? AND version = ? RETURNING id, version, body'
      ).bind(body, user.userId, id, version).first<StoredSceneTemplate>();
    const status = version === 0 ? 201 : 200;
    if (row) return reply({ template: readSceneTemplate(row) }, status);
    const current = await db.prepare(
      'SELECT id, version, body FROM scene_templates WHERE owner = ? AND id = ?'
    ).bind(user.userId, id).first<StoredSceneTemplate>();
    if (current?.version === version + 1 && current.body === body) {
      return reply({ template: readSceneTemplate(current) }, status);
    }
    return reply({ error: '場景範本已變更或無法編輯，請重新讀取。' }, 409);
  } catch {
    return reply({ error: '暫時無法保存場景範本。' }, 503);
  }
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}
