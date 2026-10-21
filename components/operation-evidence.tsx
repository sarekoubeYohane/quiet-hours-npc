'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { readWorldResponse } from '@/lib/world-response';
import type { OperationEvidence, OperationSummary, ReplayAdvance } from '@/lib/operation-evidence';

export default function OperationEvidenceDetails({ evidence, recent, disabled, onReplay }: {
  evidence?: OperationEvidence; recent: OperationSummary[]; disabled:boolean; onReplay:(payload:ReplayAdvance)=>Promise<boolean>;
}) {
  const [selected,setSelected]=useState<OperationEvidence|null>();
  const [message,setMessage]=useState(''),[loading,setLoading]=useState(false);
  const shown=selected===undefined?evidence:selected;
  const style={whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'24rem',overflow:'auto',fontSize:'0.85rem'} as const;
  async function select(operationId:string) {
    setLoading(true);setMessage('');
    try {
      const response=await fetch(`/api/world?operationId=${encodeURIComponent(operationId)}`,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
      const body=await readWorldResponse<{error?:string;operation?:{state:string;evidence?:OperationEvidence|null}}>(response);
      if(!response.ok)throw Error(body.error||'暫時無法讀取操作證據。');
      setSelected(body.operation?.evidence||null);
      if(!body.operation?.evidence)setMessage('這筆操作沒有保留證據，或已超出保留範圍；不能重建原始候選。');
    }catch(error){setMessage(error instanceof Error?error.message:'暫時無法讀取操作證據。');}
    finally{setLoading(false);}
  }
  return <section className="panel" aria-label="操作驗收證據" style={{padding:'clamp(18px, 3vw, 24px)',display:'grid',gap:'14px',marginBottom:'24px'}}>
    <h2>操作驗收證據</h2>
    <p>僅供觀察者檢查，不會交給 NPC。保留最近最多八筆操作；被淘汰或未捕獲的內容不能重建。</p>
    {recent.length>0&&<label style={{display:'grid',gap:'8px',minWidth:0}}>已保存操作<select style={{width:'100%',minWidth:0,padding:'10px',border:'1px solid #445365',borderRadius:'6px',background:'#18232f',color:'inherit'}} aria-label="已保存操作" defaultValue="" disabled={loading||disabled} onChange={event=>void select(event.target.value)}>
      <option value="" disabled>選擇操作</option>
      {recent.map(item=><option value={item.operationId} key={item.operationId}>{item.operation||'舊操作'} · HTTP {item.status} · {item.operationId}{!item.evidenceAvailable?' · 無證據':''}</option>)}
    </select></label>}
    {message&&<p role="status">{message}</p>}
    {!shown&&!message&&<p>尚無操作證據；舊回合不能事後補回原始提案或裁定。</p>}
    {shown&&<>
      <p>{shown.deployment.name} · 版本 {shown.deployment.commit}<br/>操作：{shown.operationId}<br/>請求：{shown.requestId}</p>
      <p>結果：{({committed:'已提交', 'rolled-back':'回合已回復，保留已知用量', 'not-committed':'未確認世界提交'})[shown.outcome]} · NPC 派送 {shown.counts.npc} 次 · 裁定派送 {shown.counts.adjudication} 次</p>
      {(shown.truncated||shown.redacted)&&<p>部分證據已省略、截短或遮蔽，不能視為完整原文。</p>}
      <details><summary>查看操作驗收證據</summary><pre style={style}>{JSON.stringify(shown,null,2)}</pre></details>
      {shown.replay&&<Button variant="outline" disabled={disabled||loading} onClick={()=>void onReplay(shown.replay!)}>重送同一操作（不新增回合）</Button>}
    </>}
  </section>;
}
