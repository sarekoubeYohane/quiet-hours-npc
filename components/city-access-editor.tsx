import type { CityPreview } from '@/lib/city-draft';
import { entryRuleLabels } from '@/lib/entry-rules';

export function CityAccessPreview({ preview }: { preview: CityPreview }) {
  if (!preview.access?.length) return null;
  return <section aria-label="有效進出權限">
    <h3>有效進出權限</h3>
    <ul>{preview.access.map(entry => {
      const place = preview.places.find(item => item.id === entry.placeId);
      const scope = entry.roomId ? place?.rooms.find(room => room.id === entry.roomId)?.name : '建築';
      return <li key={JSON.stringify([entry.placeId, entry.roomId])}>
        {place?.name} · {scope} · {entry.inherited && '沿用建築 · '}{entryRuleLabels[entry.rule]} · {entry.allowed.map(actor => actor.name).join('、') || '目前無授權人物'}
      </li>;
    })}</ul>
  </section>;
}
