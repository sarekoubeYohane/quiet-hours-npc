import type { UsageRecoveryView } from '@/lib/usage-recovery';

export function UnresolvedUsageNotice() {
  return <p role="status">中斷操作的用量仍待核對；已知小計以外另有未確認範圍，不能視為零成本。找不到實錄不表示沒有派送，累計與本小時資料都可能不完整。</p>;
}

export default function UsageRecoveryStatus({value}:{value?:UsageRecoveryView}) {
  if(!value)return null;
  const labels={
    accounted:'已保存的正常用量已入帳',
    pending:'已知用量待核對；尚未完成恢復入帳',
    unavailable:'儲存暫時不可讀或不可寫，暫時無法核對用量',
    'legacy-unverifiable':'舊紀錄缺少可靠去重或歷史價格依據，不能無依據補算',
  };
  return <div aria-label="本操作用量核對" role="status">
    <p>{labels[value.status]}；可核對的已知派送 {value.knownCalls} 次。</p>
    {value.unknownRange&&<p>未保存或無法核對的派送仍有未確認範圍，不能視為零成本；已知小計不是完整總額。</p>}
    <p>此核對與原操作結果分開，不代表世界已提交；遲到用量另存證據，不改寫原費用定案。</p>
  </div>;
}
