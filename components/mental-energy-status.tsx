import type { Character } from '@/lib/world';
import { timeLabel } from '@/lib/world';
import { mentalEnergyFeeling } from '@/lib/mental-energy';
export function MentalEnergyStatus({character}:{character:Character}) {
 const s=character.mentalEnergy;
 return <div className="detail"><h3>精神電量</h3><p>文字心情：{character.mood}</p>{s?<><progress aria-label="精神電量" value={s.value} max={s.policy.maximum}/><p>觀察者數值：{s.value}/{s.policy.maximum}</p><p>{mentalEnergyFeeling(character)?.feeling}</p><p className="hint">隔離測試政策 {s.policy.id}；非正式產品預設。角色只收到本人感受及是否能負擔一次調節。</p><p className="hint">從 D{Math.floor(s.activatedAt/1440)+1} · {timeLabel(s.activatedAt)} 啟用；未回填先前心理歷史。最近 {s.history.length} 筆，已省略 {s.dropped} 筆。自然來源收據 {s.experiences?.receipts.length||0} 筆，過期移除 {s.experiences?.dropped||0} 筆；超出保留範圍不代表可重新結算。</p><details><summary>最近的精神電量變化</summary>{[...s.history].reverse().slice(0,5).map((entry,index)=><p className="hint" key={`${entry.minute}:${index}`}>D{Math.floor(entry.minute/1440)+1} · {timeLabel(entry.minute)} · {entry.reason}{entry.kind==='natural'?`（清醒 ${entry.awakeMinutes} 分鐘）`:`（來源 ${entry.source}；心情 ${entry.moodBefore} → ${entry.moodAfter}）`}<br/>{entry.before} → {entry.after}</p>)}</details></>:<p className="hint">精神電量尚未啟用。沒有正式政策時不默認啟用；明示隔離測試政策後，首次成功推進建立起點。</p>}</div>;
}
