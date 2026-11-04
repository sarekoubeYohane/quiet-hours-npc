import { database } from '@/lib/store';
import { sceneTemplateDraft, sharedSceneTemplates, type SceneTemplate } from '@/lib/scene-templates';

export type StoredSceneTemplate = { id: string; version: number; body: string };

export function readSceneTemplate({ id, version, body }: StoredSceneTemplate): SceneTemplate {
  return { ...sceneTemplateDraft.parse(JSON.parse(body)), id, version, shared: false };
}

export async function listSceneTemplates(owner: string): Promise<SceneTemplate[]> {
  const { results } = await database().prepare(
    'SELECT id, version, body FROM scene_templates WHERE owner = ? ORDER BY id',
  ).bind(owner).all<StoredSceneTemplate>();
  return [...sharedSceneTemplates, ...results.map(readSceneTemplate)];
}
