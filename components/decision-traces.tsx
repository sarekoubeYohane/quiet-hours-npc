'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { readWorldResponse } from '@/lib/world-response';

// Read-only observer view. These records never become part of World or NPC input.
type Trace = {
  operationId:string; requestId:string; outcome:string; lastKnownStage:string;
  baseVersion:number; resultVersion?:number; redacted:boolean; gaps:string[];
  dispatches:Array<{sequence:number;task:string;actorId:string;requestId:string;provider:string;model:string;
    startedAt:number;requestBody?:string;responseBody?:string;httpStatus?:number;stage:string;
    worldSnapshot?:unknown;rawCandidate?:unknown;parsedCandidate?:unknown;validation?:unknown;usage?:unknown}>;
  steps:Array<{kind:string;actorId?:string;source:string;data:unknown}>;
  result?:unknown;
};
type TraceIndex = { records:Array<{operationId:string;requestId:string;outcome:string;lastKnownStage:string;createdAt:number;bytes:number;gap?:string}>;
  retention:{count:number;bytes:number;evicted:number;firstAvailableAt?:number;lastAvailableAt?:number;limits:unknown};gap?:string };
type TraceResponse = {error?:string;decisionTrace?:Trace|null;decisionTraces?:TraceIndex};
const contentStyle = {whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'28rem',overflow:'auto',fontSize:'.85rem',fontFamily:'ui-monospace, SFMono-Regular, Consolas, "Noto Sans TC", monospace'} as const;
const outcomes:Record<string,string> = {committed:'世界已提交','rolled-back':'回合已回復', 'not-committed':'世界未提交',unknown:'世界提交狀態未知'};
const sources:Record<string,string> = {program:'程式檢查／紀錄','model-self-report':'模型自述（不代表真實因果）','maintainer-hypothesis':'維護者假設（尚待驗證）'};
function JsonDetails({label,value}:{label:string;value:unknown}) {
  return <details><summary>{label}</summary><pre style={contentStyle}>{typeof value==='string'?value:JSON.stringify(value,null,2)}</pre></details>;
}
async function readTrace(operationId?:string,signal?:AbortSignal) {
  const response=await fetch(`/api/world${operationId?`?operationId=${encodeURIComponent(operationId)}`:''}`,{credentials:'same-origin',signal});
  const body=await readWorldResponse<TraceResponse>(response);
  if(!response.ok)throw Error(body.error||'暫時無法讀取決策追溯。');
  return body;
}
export default function DecisionTraces({operationId}:{operationId?:string}) {
  const [index,setIndex]=useState<TraceIndex>();
  const [shown,setShown]=useState<Trace|null>();
  const [selected,setSelected]=useState('');
  const [message,setMessage]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      try {
        const body=await readTrace(undefined,controller.signal);
        if(controller.signal.aborted)return;
        setIndex(body.decisionTraces);
        const id=operationId||body.decisionTraces?.records[0]?.operationId;
        if(id){const detail=await readTrace(id,controller.signal);if(!controller.signal.aborted){setShown(detail.decisionTrace??null);setSelected(id);}}
        else setShown(null);
      } catch(error) { if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'暫時無法讀取決策追溯。'); }
      finally {if(!controller.signal.aborted)setLoading(false);}
    }
    void load();return ()=>controller.abort();
  },[operationId]);
  async function select(id:string) {
    setLoading(true);setMessage('');setSelected(id);setShown(undefined);
    try { const body=await readTrace(id,AbortSignal.timeout(15000));setShown(body.decisionTrace??null); }
    catch(error) {setMessage(error instanceof Error?error.message:'暫時無法讀取決策追溯。');}
    finally {setLoading(false);}
  }
  return <section className="panel" aria-label="決策追溯" style={{padding:'clamp(18px,3vw,24px)',display:'grid',gap:14,marginBottom:24,minWidth:0}}>
    <h2>決策追溯</h2>
    <p>私有觀察者實錄，與 NPC 現在的記憶分開。只讀已發生的派送，不會呼叫模型或推進世界。遮蔽或缺失的內容不能視為完整原件，也不能事後補造理由。</p>
    {index&&<><p>目前保留 {index.retention?.count??0} 筆 · {(index.retention?.bytes??0).toLocaleString()} bytes · 已淘汰 {index.retention?.evicted??0} 筆。不按日數到期；完整實錄與八筆操作快取各自淘汰。</p>
      <JsonDetails label="保存範圍與容量限制" value={index.retention}/>
      {index.gap&&<p role="status">資料缺口：{index.gap}</p>}
      {index.records.length>0&&<label style={{display:'grid',gap:8}}>選擇追溯操作<select aria-label="追溯操作" style={{width:'100%',minWidth:0,padding:10,background:'#18232f',color:'inherit'}} value={selected} disabled={loading} onChange={event=>void select(event.target.value)}>
        {!index.records.some(item=>item.operationId===selected)&&<option value={selected}>{selected||'選擇操作'}</option>}
        {index.records.map(item=><option key={item.operationId} value={item.operationId}>{outcomes[item.outcome]||item.outcome} · {item.operationId}</option>)}
      </select></label>}</>}
    {loading&&<p role="status">正在讀取實錄…</p>}
    {message&&<p role="alert">{message}<Button variant="link" disabled={loading||!selected} onClick={()=>void select(selected)}>重新讀取實錄</Button></p>}
    {shown===null&&!loading&&!message&&<p>沒有保存這筆實錄：可能是舊操作、已淘汰、未捕獲或寫入失敗。找不到紀錄不代表沒有派送；舊版未保存的輸入及理由無法重建。</p>}
    {shown&&<>
      <p>操作：{shown.operationId}<br/>原請求：{shown.requestId}<br/>{outcomes[shown.outcome]||shown.outcome} · 最後已知階段：{shown.lastKnownStage}<br/>世界版本：{shown.baseVersion} → {shown.resultVersion??'未確認'}</p>
      <p>下列解析、效果及分支可能只是候選；世界是否提交以本操作提交狀態為準。</p>
      {shown.redacted&&<p>包含憑證遮蔽；顯示內容不是逐位元原件。</p>}
      {(shown.gaps??[]).length>0&&<div role="status"><h3>資料缺口</h3><ul>{(shown.gaps??[]).map((gap,i)=><li key={i}>{gap}</li>)}</ul></div>}
      <h3>實際模型派送</h3>
      {!shown.dispatches.length&&<p>沒有已保存的模型派送。程式續做不會捏造模型呼叫。</p>}
      {shown.dispatches.map(dispatch=><article key={dispatch.sequence} style={{display:'grid',gap:10,minWidth:0,borderTop:'1px solid #445365',paddingTop:12}}>
        <h4>#{dispatch.sequence} · {dispatch.task==='npc'?'NPC 決策':'世界裁定'} · {dispatch.actorId}</h4>
        <p>{dispatch.provider} / {dispatch.model}<br/>請求：{dispatch.requestId}<br/>階段：{dispatch.stage} · HTTP {dispatch.httpStatus??'未記錄'}</p>
        {dispatch.requestBody===undefined?<p>當次請求本文未保存。</p>:<JsonDetails label="實際送出的請求本文" value={dispatch.requestBody}/>}
        {dispatch.responseBody===undefined?<p>當次回覆本文缺失；不推定模型沒有回覆。</p>:<JsonDetails label="實際收到的回覆本文" value={dispatch.responseBody}/>}
        {dispatch.worldSnapshot!==undefined&&<JsonDetails label="當次權威世界快照（包含相關未變狀態；不代表 NPC 可知）" value={dispatch.worldSnapshot}/>}
        {dispatch.rawCandidate!==undefined&&<JsonDetails label="模型候選原文" value={dispatch.rawCandidate}/>}
        {dispatch.parsedCandidate!==undefined&&<JsonDetails label="解析候選（尚非提交證據）" value={dispatch.parsedCandidate}/>}
        {dispatch.validation!==undefined&&<JsonDetails label="程式驗證" value={dispatch.validation}/>}
        {dispatch.usage!==undefined&&<JsonDetails label="供應商已知用量" value={dispatch.usage}/>}
      </article>)}
      <h3>規則、驗證、執行與回饋</h3>
      {(shown.steps??[]).map((step,i)=><div key={i}><p>{sources[step.source]||step.source} · {step.kind}{step.actorId?` · ${step.actorId}`:''}</p><JsonDetails label={`查看 ${step.kind}`} value={step.data}/></div>)}
      <p>模型說明只代表當次自述；未記錄的理由保持未知。下一次上下文僅在下一次真正派送且仍在保存範圍內時可於其請求本文核對。</p>
      {shown.result!==undefined&&<JsonDetails label="本操作世界結果" value={shown.result}/>}
      <JsonDetails label="查看完整決策實錄" value={shown}/>
    </>}
  </section>;
}
