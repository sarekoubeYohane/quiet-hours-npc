'use client';
import type { Character, World } from '@/lib/world';
import { timeLabel } from '@/lib/world';
import { cognitiveProjection, type CognitiveReference } from '@/lib/cognition';
import { recallableMemoryProjection, type MemorySource } from '@/lib/memory';

const conviction = { doubtful: '仍有疑問', leaning: '傾向相信', certain: '確信' };
const operation = { upsert: '更正／建立', keep: '重新確認', withdraw: '撤回', rewrite: '濃縮', merge: '合併', forget: '遺忘', 'forget-source': '遺忘來源' };
const kindLabel = { short: '短期', long: '長期', belief: '信念', relationship: '關係' };
const stamp = (time: number) => `D${Math.floor(time / 1440) + 1} · ${timeLabel(time)}`;

export default function CognitionAnalysis({ character, world }: { character: Character; world: World }) {
  const cognition = cognitiveProjection(character);
  const long = recallableMemoryProjection(character);
  const short = (character.shortTerm || []).filter(item => item.characterId === character.id);
  const person = (id: string) => world.characters.find(c => c.id === id)?.name || (id === 'observer' ? '觀察者' : id);
  const source = (value: MemorySource) => [value.kind === 'legacy-unclassified' ? '舊版來源未分類' : value.kind === 'observation' ? '主觀觀察' : '主觀經歷', value.person ? `記得的人物：${person(value.person)}` : '', value.region ? `記得的區域：${value.region}` : '', value.sense === 'sight' ? '視覺' : value.sense === 'hearing' ? '聽覺' : '', value.clarity === 'vague' ? '模糊線索' : value.clarity === 'clear' ? '清楚線索' : ''].filter(Boolean).join(' · ');
  function reference(ref: CognitiveReference, index: number) {
    const list = ref.kind === 'short' ? short : ref.kind === 'long' ? long : ref.kind === 'belief' ? cognition.beliefs.filter(item => item.characterId === character.id) : cognition.relationshipTags.filter(item => item.characterId === character.id);
    const exact = list.find(item => item.id === ref.id && item.version === ref.version);
    const changed = list.some(item => item.id === ref.id);
    return <li key={`${ref.kind}:${ref.id}:${ref.version}:${index}`}><small>{kindLabel[ref.kind]} · {ref.id} · v{ref.version}</small>{exact ? <p>{exact.text}</p> : <p className="hint">{changed ? '版本已變更；此引用的原文未保留。' : '來源已缺失、已遺忘或不在現有可回憶範圍。'}不還原原文。</p>}</li>;
  }
  function evidence(refs: CognitiveReference[], reason?: string) {
    return <details><summary>來源與理由</summary>{reason && <p>已保存理由：{reason}</p>}{refs.length ? <ul className="analysis-references">{refs.map(reference)}</ul> : <p className="hint">沒有保存可查的來源引用。</p>}</details>;
  }
  return <section className="cognition-analysis detail" aria-label={`${character.name} 的記憶與信念`}>
    <h3>記憶與信念</h3><p className="hint">以下是角色現在保留的主觀內容，可能不完整或互相矛盾；不是世界事實。僅閱讀已有資料，不呼叫模型或改寫信念。</p>
    <details open><summary>短期記憶</summary><div className="memories" tabIndex={0} role="region" aria-label="短期記憶列表">{short.length ? [...short].reverse().map(item => <article key={`${item.id}:${item.version}`}><time>{stamp(item.time)}</time><p>{item.text}</p><small>{source(item.source)} · v{item.version}</small></article>) : <p className="hint">沒有保留的短期記憶。</p>}</div></details>
    <details open><summary>長期記憶與摘要</summary><div className="memories" tabIndex={0} role="region" aria-label="長期記憶與摘要列表">{long.length ? [...long].reverse().map(item => <article key={`${item.id}:${item.version}`}><time>{stamp(item.time)} · {item.kind === 'summary' ? '摘要' : '片段'} · v{item.version}</time><p>{item.text}</p>{item.rememberedSources.length ? item.rememberedSources.map((ref, i) => <p className="hint" key={i}>仍記得：{source(ref.source)}</p>) : <p className="hint">只餘印象，未保留可回憶的來源。</p>}{!!item.unresolved?.length && <details><summary>未解矛盾來源</summary><ul className="analysis-references">{item.unresolved.map((ref, i) => reference({kind:'long',...ref}, i))}</ul></details>}</article>) : <p className="hint">尚無選留的長期記憶或摘要。</p>}</div></details>
    <details><summary>現行信念</summary>{cognition.beliefs.filter(item => item.characterId === character.id).map(item => <article className="detail" key={item.id}><h4>{item.topic} · {conviction[item.conviction]}</h4><p>{item.text}</p><small>{stamp(item.time)} · v{item.version}</small>{!!item.contradictions.length && <p className="hint">未解矛盾：{item.contradictions.map(id => cognition.beliefs.find(other => other.id === id && other.characterId === character.id)?.topic || `來源已缺失（${id}）`).join('、')}。仍並存，尚未解決。</p>}{evidence(item.references,item.reason)}</article>)}{!cognition.beliefs.length && <p className="hint">尚無保存的現行信念；不從記憶代為推測。</p>}</details>
    <details><summary>自由關係標籤</summary>{cognition.relationshipTags.filter(item => item.characterId === character.id).map(item => <article className="detail" key={item.id}><h4>{person(item.person)}{item.topic && ` · ${item.topic}`}</h4><p>{item.text}</p>{item.origin === 'legacy-unclassified' ? <p className="hint">舊版關係文字，來源未分類；未推測確信程度。</p> : <small>{stamp(item.time)} · v{item.version}</small>}{evidence(item.references,item.reason)}</article>)}{!cognition.relationshipTags.length && <p className="hint">尚無保留的關係標籤。</p>}</details>
    <details className="system-trace"><summary>系統更正與來源追溯</summary><p className="hint">觀察者專用，只保存有限身份與短理由，並非完整歷史或角色仍記得的原文；不會送入角色的模型上下文。資料未保留時不從生活紀錄補造。</p>{[...(character.cognition?.trace || [])].reverse().map(trace => <article className="detail" key={trace.traceId}><h4>{kindLabel[trace.kind]} · {operation[trace.operation]}</h4><p>{trace.reason}</p><small>{stamp(trace.time)} · {trace.id} · v{trace.version}{trace.nextVersion && ` → v${trace.nextVersion}`}</small>{evidence(trace.references)}</article>)}{[...(character.memoryTrace || [])].reverse().map(trace => <article className="detail" key={trace.id}><h4>記憶 · {operation[trace.type]}</h4><p>{trace.reason}</p><p className="hint">來源身份</p><ul className="analysis-references">{trace.from.map((ref, i) => reference({kind:'long',...ref}, i))}</ul>{trace.to && <><p className="hint">結果身份</p><ul className="analysis-references">{reference({kind:'long',...trace.to},0)}</ul></>}</article>)}{!character.cognition?.trace.length && !character.memoryTrace?.length && <p className="hint">目前沒有保留的更正或來源追溯。</p>}</details>
  </section>;
}
