import manifest from '@/public/characters/manifest.json';
import { exampleCardAssetKeys } from './example-content';

/** Approved #88 artwork, keyed by saved-world IDs; manifest is the shared contract. */
export type CharacterAsset = { pixel: string; portrait: string; avatar: string; master: string; source: string; fallback: 'initial' };
export const characterAssets: Record<string, CharacterAsset> = Object.fromEntries(
  Object.entries(manifest.characters).map(([id, asset]) => [id, {
    pixel: asset.pixel.src, portrait: asset.portrait.src,
    avatar: asset.avatar.src, master: asset.master.src,
    source: 'GPT ImageGen；2026-10-16 使用者選定之外觀，來源與衍生規格見角色素材文件',
    fallback: 'initial' as const,
  }]),
);
const byKey = (key: string | undefined) => key && Object.hasOwn(characterAssets, key) ? characterAssets[key] : undefined;
/** World character ID first, then the card ID (`profileSource.id`); built-in example cards map back to the original artwork keys. */
export function assetsForCharacter(id: string, sourceId?: string): CharacterAsset | undefined {
  return byKey(id) ?? byKey(sourceId) ?? byKey(sourceId && Object.hasOwn(exampleCardAssetKeys, sourceId) ? exampleCardAssetKeys[sourceId] : undefined);
}
