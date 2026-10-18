import type { World } from '@/lib/world';
export function RoutineStatus({world}:{world:World}) {
 return <section className="panel" aria-label="日常規則與成果"><h2>日常規則與成果</h2>
 <p>首次確認後可沿用；活動仍須花時間完成。NPC 決策仍計入玩家用量。</p>
 {(world.routineRules||[]).map(rule=><p key={rule.id}>已確認：{rule.operations.join('、')} · 版本 {rule.version}</p>)}
 {(world.routineAudit||[]).slice(-8).reverse().map((item,index)=><p key={index}>回合 {item.turn+1} · {world.characters.find(c=>c.id===item.actorId)?.name} · {item.result==='approved'?'首次裁定確認':'沿用日常規則，無新增裁定'}</p>)}
 {(world.supplies||[]).filter(s=>s.background).map(s=><p key={s.id}>{s.label}：已確認日常背景，具體產物分別保存。</p>)}
 {(world.objects||[]).map(o=><p key={o.id}>{o.label} · {o.state.contents||o.lifecycle} · {o.region} · 版本 {o.revision}</p>)}
 {!(world.routineRules?.length)&&<p>尚未確認日常規則。</p>}
 </section>;
}
