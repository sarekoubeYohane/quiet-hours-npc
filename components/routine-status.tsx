import type { World } from '@/lib/world';
import { locations } from '@/lib/world';
import { regions } from '@/lib/perception';
const operations:Record<string,string>={tea:'泡茶',coffee:'咖啡',food:'簡餐',drink:'飲用',wash:'清洗',return:'歸還'};
const states:Record<string,string>={empty:'空',water:'準備中',tea:'茶',coffee:'咖啡',dirty:'待清洗',broken:'損壞',sound:'完好',active:'可用',consumed:'已消耗',destroyed:'已損毀',food:'食物',utensil:'器具'};
export function RoutineStatus({world}:{world:World}) {
 const person=(id:string|null)=>id?world.characters.find(c=>c.id===id)?.name||id:'已放下';
 const place=(id:string)=>{const region=regions.find(r=>r.id===id);return region?`${locations.find(l=>l.id===region.location)?.name||region.location}・${region.name}`:locations.find(l=>l.id===id)?.name||id;};
 return <section className="panel routine-status" aria-label="日常規則與成果"><h2>日常規則與成果</h2>
 <p>首次確認後可沿用；活動仍須花時間完成。NPC 決策仍計入玩家用量。</p>
 {(world.routineRules||[]).map(rule=><p key={rule.id}>已確認：{rule.operations.map(op=>`${operations[op]||op}${rule.templates?.find(t=>t.operation===op)?.result.minutes?` ${rule.templates.find(t=>t.operation===op)!.result.minutes} 分鐘`:''}`).join('、')} · 版本 {rule.version}</p>)}
 {world.characters.filter(c=>c.plan).map(c=><p key={c.id}>{c.name}：{c.plan!.timeIntent?.kind==='open-ended'?'自行選定時段':'完成目標安排'} {c.plan!.until-c.plan!.startedAt} 分鐘，尚餘 {Math.max(0,c.plan!.until-world.minute)} 分鐘。</p>)}
 {(world.routineAudit||[]).slice(-8).reverse().map((item,index)=><p key={index}>回合 {item.turn+1} · {person(item.actorId)}{item.location?` · ${place(item.location)}`:''} · {item.result==='approved'?`首次裁定確認${item.reason?`，當前受阻：${item.reason}`:''}`:item.result==='confirmed'?'當地日常背景確認，已計入實際用量':item.result==='exception'?'新方法／用途的例外裁定，已計入實際用量':item.result==='blocked'?`規則受阻，無新增裁定：${item.reason||'當前條件不成立'}`:`沿用日常規則，無新增裁定${item.reason?`：${item.reason}`:''}`}</p>)}
 {(world.supplies||[]).filter(s=>s.background).map(s=><p key={s.id}>{s.label}：已確認日常背景，具體產物分別保存。</p>)}
 {(world.supplies||[]).filter(s=>!s.background).map(s=><p key={s.id}>{s.label}：{s.pending?'尚在準備，未形成成品':`有限供應 ${s.remaining}`}  · {place(s.region)}</p>)}
 {(world.objects||[]).map(o=><p key={o.id}>{o.label} · {states[o.lifecycle]||o.lifecycle} · {states[o.state.contents]||states[o.state.beverage]||states[o.kind]||o.kind}{o.state.condition?` · ${states[o.state.condition]||o.state.condition}`:''} · {place(o.region)} · 持有：{person(o.holder)} · 所有：{person(o.owner)} · 版本 {o.revision}</p>)}
 {!(world.routineRules?.length)&&<p>尚未確認日常規則。</p>}
 </section>;
}
