import type { World } from '@/lib/world';
import type { PhoneData } from '@/lib/phones';
import { timeLabel } from '@/lib/world';
export default function CalendarRecords({device,world}:{device:PhoneData;world:World}){
 const object=world.objects?.find(o=>o.id===device.objectId),owner=world.characters.find(c=>c.id===object?.owner);
 return <details><summary>行事曆與提醒（{device.calendar?.length||0}/32）</summary><p className="hint">外部原文不隨內在遺忘改寫；本面板是觀察者唯讀，不代表NPC已閱讀、接受邀請或完成安排。</p>{device.calendar?.map(record=>{
  const linked=record.arrangement&&owner?.arrangements?.items.find(i=>i.id===record.arrangement!.id&&i.version===record.arrangement!.version);
  const notices=device.notifications?.filter(n=>n.kind==='reminder'&&n.recordId===record.id)||[];
  return <article className="detail" key={record.id}><h4>{record.id} · v{record.version}</h4><p>{record.text}</p><p>行事曆條件：{record.schedule?JSON.stringify(record.schedule):'未另設條件'}</p><p>提醒：{record.reminder?.enabled?'已啟用':'未啟用或已取消'}{record.reminder&&` · v${record.reminder.version} · ${JSON.stringify(record.reminder.condition)}`}</p><small>{record.reminder?.cue?.trigger?`條件已成立 ${timeLabel(record.reminder.cue.trigger.at)}`:'尚未取得成立條件'} · 通知 {notices.length} 次（有效 {notices.filter(n=>n.cancelledAt===undefined).length}） · 當前版本真正讀者：{record.readers.filter(r=>r.version===record.version).map(r=>`${world.characters.find(c=>c.id===r.actorId)?.name||r.actorId} ${timeLabel(r.at)}`).join('、')||'尚未閱讀'}</small>{record.arrangement&&<p className="hint">保存時安排關聯：{record.arrangement.id} v{record.arrangement.version} · {linked?linked.status==='active'?'仍未完成':'本人已明示完成或放下':'目前版本已變更或內在索引不在；不從外部自動重建'}</p>}</article>;
 })}</details>;
}
