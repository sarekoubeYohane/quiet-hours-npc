'use client';
import { useEffect, useState } from 'react';
import { cardAttributeLabels, cardAttributeNames, type CharacterCard } from '@/lib/character-cards';

/** Read-only view of the built-in example cards; they are chosen in the opening flow, never edited here. */
export default function ExampleCharacterCards({ originalAccountScope }: { originalAccountScope: string }) {
 const [cards, setCards] = useState<CharacterCard[]>();
 const [error, setError] = useState('');
 useEffect(() => {
  let alive = true;
  void (async () => {
   try {
    const response = await fetch('/api/character-cards?accountScope=' + encodeURIComponent(originalAccountScope));
    const body = await response.json() as { accountScope?: string; cards?: CharacterCard[] };
    if (!response.ok || body.accountScope !== originalAccountScope) throw Error();
    if (alive) setCards((body.cards ?? []).filter(card => card.shared));
   } catch { if (alive) setError('暫時無法讀取範例人物卡。'); }
  })();
  return () => { alive = false; };
 }, [originalAccountScope]);
 if (error) return <p role="alert" className="error">{error}</p>;
 if (!cards?.length) return null;
 return <section aria-label="範例人物卡" className="space-y-3">
  <h2>範例人物卡</h2>
  <p className="hint">內建的完成人物卡，可在開局時選用，也能和自己的人物卡混用。範例由系統提供，不能修改或刪除。</p>
  <div className="grid gap-3 md:grid-cols-2">{cards.map(card => <article key={card.id} className="panel">
   <h3>{card.fields.name}</h3>
   <p>{card.fields.personality}</p>
   <p>{cardAttributeNames.map(name => cardAttributeLabels[name] + ' ' + card.values[name]).join('／')}</p>
   <p>精神容量 {card.capacity}；需求特性：飢餓 {card.needTraits.hunger}、口渴 {card.needTraits.thirst}、睡意 {card.needTraits.sleep}</p>
  </article>)}</div>
 </section>;
}
