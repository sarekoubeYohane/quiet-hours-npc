'use client';
import type { World } from '@/lib/world';
import { timeLabel } from '@/lib/world';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

type SceneOperation = 'enter-acceptance' | 'exit-acceptance';
export function AcceptanceSceneControls({ world, disabled, onSwitch }: {
  world: World; disabled: boolean; onSwitch: (operation: SceneOperation) => Promise<boolean>;
}) {
  const active = !!world.acceptance;
  return <section className="panel acceptance-controls" aria-label="最小日常驗收">
    <h2>最小日常驗收</h2>
    <p>四人在咖啡館前台，有一份餐點、一只需借用的杯子，以及可共用的茶具、熱水與茶包。角色自行選擇吃東西、借還杯子或分階段泡茶。</p>
    <p>{active ? '原世界已暫存。重新整理可繼續本次驗收；結束後回到原本時間與角色經歷。' : '進入時暫存原世界，在獨立的驗收故事中測試；原世界會暫停，之後可以返回。'}</p>
    <p>沿用目前的模型、裁定與玩家預算，真實 AI 呼叫照常計費。請先暫停自動並等目前回合完成。此場景使用角色本地記憶，暫不使用向量回想。</p>
    <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={disabled}>{active ? '結束驗收並返回原世界' : '進入最小驗收場景'}</Button></AlertDialogTrigger>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{active ? '結束這次驗收？' : '進入獨立驗收場景？'}</AlertDialogTitle>
        <AlertDialogDescription>{active ? '本次驗收的故事進度會捨棄，返回已暫存的原世界。已發生用量、價格、預算與裁定設定保留。' : '原世界會暫存並停止推進。驗收提供有限餐點、杯子與茶具；不會自動啟動 AI，之後的模型呼叫仍計入你的玩家預算。'}</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => void onSwitch(active ? 'exit-acceptance' : 'enter-acceptance')}>{active ? '確認結束驗收' : '確認進入驗收'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <p className="hint">先確認餐點取得與消耗，再測借杯→攜帶→洗淨→歸還；泡茶中途可透過既有互動邀請角色回應，觀察她選擇繼續或中斷。角色沒有照指定次序行動，不能單憑這點判為故障。</p>
  </section>;
}

const stateLabel: Record<string, string> = { contents: '內容物', clean: '清潔', available: '可使用', empty: '空杯', water: '已加水', tea: '茶已泡好', yes: '是', no: '否' };
export function AcceptanceSceneStatus({ world }: { world: World }) {
  if (!world.acceptance) return null;
  const person = (id: string | null) => id === null ? '放在場景中' : world.characters.find(c => c.id === id)?.name || id;
  return <section className="panel acceptance-status" aria-label="驗收場景狀態">
    <p><strong>目前在獨立驗收場景</strong> · 原世界已暫存；可在設定頁結束驗收並返回。</p>
    <details><summary>供應、物件與活動階段</summary>
      <p className="hint">以下只顯示目前保存的結果。台詞不代表物件已變更；未到時間的階段也不算完成。</p>
      <div className="acceptance-state-grid">
        {(world.supplies || []).map(supply => <article key={supply.id} aria-label={supply.label + '供應'}><h3>{supply.label}</h3><p>{supply.background?'已確認日常背景':`剩餘 ${supply.remaining} 份 · 不自動補貨`}</p><p>可使用：{supply.allowedTo.map(person).join('、') || '尚未授權'}</p><small>識別：{supply.id}</small></article>)}
        {(world.objects || []).map(object => <article key={object.id} aria-label={object.label + '物件'}><h3>{object.label}</h3><p>狀態：{({ active: '可用', consumed: '已消耗', destroyed: '已損毀' })[object.lifecycle]}</p><p>持有：{person(object.holder)} · 所有：{person(object.owner)}</p><p>位置：{object.region}</p>{Object.entries(object.state).map(([key, value]) => <p key={key}>{stateLabel[key] || key}：{stateLabel[value] || value}</p>)}<p>可使用：{object.allowedTo.map(person).join('、') || '尚未授權'}</p><small>識別：{object.id} · 版本 {object.revision}</small></article>)}
      </div>
      <h3>分階段活動</h3>
      {world.characters.some(c => c.plan?.phases) ? world.characters.filter(c => c.plan?.phases).map(c => <article key={c.id}><p>{c.name} · 已完成 {c.plan!.phases!.cursor}／{c.plan!.phases!.stages.length} 階段</p><ol>{c.plan!.phases!.stages.map((stage, index) => <li key={index}>{timeLabel(c.plan!.startedAt + stage.afterMinutes)} · {index < c.plan!.phases!.cursor ? '已完成' : '尚未完成'}</li>)}</ol></article>) : <p>目前沒有保存的分階段活動；請對照物件狀態及生活紀錄。</p>}
    </details>
  </section>;
}
