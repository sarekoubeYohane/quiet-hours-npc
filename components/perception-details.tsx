import { timeLabel, type World, type WorldEvent } from '@/lib/world';

export default function PerceptionDetails({ event, world }: { event: WorldEvent; world: World }) {
  if (!event.perception?.length) return null;
  return <details className="perception-details"><summary>感知詳情（觀察者）</summary>
    {event.perception.map(trace => <div key={trace.characterId}>
      <strong>{world.characters.find(c => c.id === trace.characterId)?.name}</strong>
      <span> · {trace.reason}</span>
      {trace.resolution && <p>感知 D20：{trace.resolution.roll} ＋ {trace.resolution.modifier} ／ DC {trace.resolution.dc} · {({ 'critical-success': '大成功', success: '成功', mixed: '部分成功', failure: '失敗', 'critical-failure': '大失敗' })[trace.resolution.outcome]}
        <small>能力 {trace.factors?.ability} · 注意力 {trace.factors?.attention} · 干擾 {trace.factors?.interference}</small>
      </p>}
      {trace.falsePerception && <p>
        錯誤感知：{trace.falsePerception.type === 'distortion' ? '扭曲現場線索' : '沒有對應外在刺激的主觀感受'}
        <small>錯誤主觀內容：{trace.falsePerception.subjectiveText}</small>
        <small>實際可接觸的線索：{trace.falsePerception.objectiveClues.join('；')}</small>
        <small>世界實際紀錄：{event.text}</small>
        <small>模板 {trace.falsePerception.templateId} · 候選權重 {trace.falsePerception.selectedWeight}／{trace.falsePerception.totalWeight} · 抽選 {trace.falsePerception.draw.toFixed(3)}</small>
      </p>}
      {trace.observations.map(observation => <p key={observation.id}>
        {observation.sense === 'sight' ? '看見' : '聽見'} · {observation.text}
        <small>觀察時間：D{Math.floor(observation.time/1440)+1} {timeLabel(observation.time)} · 來源：{observation.source ? world.characters.find(c => c.id === observation.source)?.name : '未知'} · {observation.clarity === 'clear' ? '清楚' : '模糊'}</small>
      </p>)}
    </div>)}
  </details>;
}
