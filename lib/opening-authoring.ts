import { openingReturnPath } from './bound-navigation';
import type { CityDraft } from './city-draft';
import type { SceneTemplate } from './scene-templates';

/** Prefill only unambiguous, empty starts after an explicit setup edit. */
export function fillUniqueStarts(city: CityDraft, scenes: SceneTemplate[]): CityDraft {
  return { ...city, characters: city.characters.map(actor => {
    const placeId = actor.placeId || (city.places.length === 1 ? city.places[0].id : '');
    const place = city.places.find(value => value.id === placeId);
    const scene = scenes.find(value => value.id === place?.templateId && value.version === place.version);
    const rooms = [...(scene?.rooms ?? []), ...(city.finalization?.spaces.find(value => value.placeId === placeId)?.rooms ?? [])];
    return { ...actor, placeId, roomId: actor.roomId || (rooms.length === 1 ? rooms[0].id : '') };
  }) };
}

/** Attach a completed asset through the existing versioned opening API. Retry is idempotent. */
export async function returnOpeningAsset(returnTo: string, accountScope: string, asset:
  { kind: 'card'; id: string; version: number } | { kind: 'scene'; scene: SceneTemplate }) {
  const owner = accountScope.replace(/^account-operations:/, '');
  const path = openingReturnPath(returnTo, owner);
  if (!path) throw Error('無法核對本次開局，已完成的內容仍保存在資料庫。');
  const id = new URL(path, 'https://navigation.invalid').searchParams.get('draft')!;
  const response = await fetch('/api/opening-drafts?id=' + id + '&operationScope=' + encodeURIComponent(owner));
  const data = await response.json() as { operationScope?: string; draft?: { version: number; body: { city: CityDraft }; finalizedSaveId?: string }; error?: string };
  if (!response.ok || data.operationScope !== owner || !data.draft || data.draft.finalizedSaveId) throw Error(data.error || '開局已變更，請返回核對；製作的內容已保存。');
  const draft = data.draft;
  let city = draft.body.city;
  if (asset.kind === 'card') {
    if (city.characters.some(value => value.templateId === asset.id)) return path;
    city = { ...city, characters: [...city.characters, { templateId: asset.id, version: asset.version, placeId: '', roomId: '' }] };
  } else {
    // A stable handoff identity deduplicates a lost reply, while the wizard can
    // still explicitly add this source multiple times as independent places.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(asset.scene.id + ':' + asset.scene.version));
    const placeId = 'p-' + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 20);
    const existing = city.places.find(value => value.id === placeId);
    if (existing) {
      if (existing.templateId !== asset.scene.id || existing.version !== asset.scene.version) throw Error('場所識別衝突；場景已保存，請從開局手動加入。');
      return path;
    }
    if (city.places.length >= 8) throw Error('場景已保存；本次已有 8 個場所，請返回開局調整後再加入。');
    city = fillUniqueStarts({ ...city, places: [...city.places, { id: placeId, templateId: asset.scene.id, version: asset.scene.version, name: asset.scene.name }] }, [asset.scene]);
  }
  const saved = await fetch('/api/opening-drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, version: draft.version, operationScope: owner, body: { ...draft.body, city } }) });
  const result = await saved.json() as { operationScope?: string; error?: string };
  if (!saved.ok || result.operationScope !== owner) throw Error(result.error || '內容已保存，但尚未選入開局。請重試帶回，原本安排不會被覆寫。');
  return path;
}
