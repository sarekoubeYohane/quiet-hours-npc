import type { AdjudicationFailure } from '@/lib/adjudication';

export default function AdjudicationFailureDetails({ failure }: { failure: AdjudicationFailure }) {
  const snapshotStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '20rem', overflow: 'auto', fontSize: '0.85rem' } as const;
  return <details className="panel" data-adjudication-failure>
    <summary>裁定候選不合法：查看失敗診斷（本回合未提交）</summary>
    <p>角色：{failure.actorId} · 階段：{failure.stage === 'parse' ? '候選格式' : '效果驗證'}。世界已回復，已發生的用量保留。</p>
    <p>操作：{failure.operationId}<br/>請求：{failure.requestId}</p>
    {failure.truncated && <p>診斷已達長度上限，部分內容已截短。</p>}
    <p>以下是觀察者診斷，不會寫入角色的記憶。敏感資料會以 &lt;REDACTED&gt; 遮蔽。</p>
    <h3>拒絕原因與執行當下前提</h3><pre style={snapshotStyle}>{JSON.stringify(failure.validation, null, 2)}</pre>
    <h3>裁定候選</h3><pre style={snapshotStyle}>{failure.candidate}</pre>
    <h3>當時送出的裁定輸入</h3><pre style={snapshotStyle}>{failure.input}</pre>
  </details>;
}
