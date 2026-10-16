/** Existing shipped art. #88 may replace each use independently without changing character IDs. */
export type CharacterAsset = { pixel: string; portrait: string; source: string; fallback: 'initial' };
const shipped = (id: string, extension = 'png'): CharacterAsset => ({
  pixel: `/pixel/${id}.${extension}`,
  portrait: `/pixel/${id}.${extension}`,
  source: '既有專案像素人物；新人物圖由 #88 接續',
  fallback: 'initial',
});
export const characterAssets: Record<string, CharacterAsset> = {
  cass: shipped('cass'), vera: shipped('vera'), kris: shipped('kris'), owner: shipped('owner', 'svg'),
};
export function assetsForCharacter(id: string): CharacterAsset | undefined { return Object.hasOwn(characterAssets,id) ? characterAssets[id] : undefined; }
