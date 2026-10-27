import type { Character, World } from '@/lib/world';
import { arrangementsForDecision } from '@/lib/arrangements';
import { timeLabel } from '@/lib/world';
const status={active:'尚未完成',completed:'本人明示完成',dropped:'本人明示放下'};
export default function ArrangementsAnalysis({character,world}:{character:Character;world:World}){
 const remembered=arrangementsForDecision(character).items;
 return <details><summary>柔性安排</summary><p className="hint">觀察者唯讀索引；不是強制作息，不替角色閱讀或想起。已過時間只表示客觀到期，不能代表角色知道錯過。最多16筆，包含已完成／放下身份。</p>{(character.arrangements?.items||[]).map(item=><article className="detail" key={item.id}><h4>{item.id} · v{item.version} · {status[item.status]}</h4><p>{item.text}</p><p className="hint">{item.condition.kind==='time'?`D${Math.floor(item.condition.minute/1440)+1} ${timeLabel(item.condition.minute)} · ${world.minute>item.condition.minute?'客觀時間已過，主觀知情另查經歷':'尚未越過時間'}`:item.condition.kind==='context'?`情境：${item.condition.region}`:`可知事件：${item.condition.clueKind} · ${item.condition.source||'未指定來源'} · ${item.condition.region||'未指定區域'}`}</p><p className="hint">{item.cue?.trigger?`條件已喚起 · ${item.cue.trigger.handledAt===undefined?'待正常決策處理':'已獲一次正常決策機會（不等於完成）'}`:'未喚起或未取得可知條件'}。相同條件不反覆觸發。</p><small>{remembered.some(i=>i.id===item.id&&i.version===item.version)?'完整安排經歷仍可回憶；實際輸入另受當次預算與回想限制':'完整內在內容已不可回憶；此索引不會補回角色'}</small></article>)}{!character.arrangements?.items.length&&<p className="hint">沒有明示保存的安排；舊世界不補造安排史。</p>}</details>;
}
