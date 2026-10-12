import type { Character } from '@/lib/world';
import { timeLabel } from '@/lib/world';
export default function AttentionDetails({ character }: { character: Character }) {
  return <details><summary>關注與決策詳情（觀察者）</summary>
    <p>關注條件：{character.attentionConditions?.length || 0} 條 · 尚待決策的觀察：{Math.max(0, (character.observations?.length || 0) - (character.observationCursor || 0))} 則</p>
    {character.attentionConditions?.map((condition, index) => <p key={index}>{condition.kind} · {condition.source || '不限對象'} · {condition.region || '不限區域'}</p>)}
    {character.attentionDiagnostics?.slice(-8).map((entry, index) => <p key={index}>{timeLabel(entry.time)} · {entry.reason}</p>)}
  </details>;
}
