import type { PursuitSelectionEvidence } from '@/lib/pursuit-selection';

export default function PursuitSelectionDetails({value,outcome}:{value:unknown;outcome:string}){
 const evidence=value as Partial<PursuitSelectionEvidence>|null;
 if(!evidence||!Array.isArray(evidence.candidates)||!Array.isArray(evidence.adopted)||!evidence.selection||!Array.isArray(evidence.selection.adoptions)||!Array.isArray(evidence.selection.declinedCandidateIds))return <p>候選／收斂內容有保存缺口，不能當作空候選集合，也不能由其他痕跡補造。</p>;
 const {candidates,selection,adopted}=evidence;
 return <section aria-label="本次候選追求與收斂">
  <h4>本次候選追求與收斂</h4>
  <p>模型在同次決策中的短自述；程式已核對引用與結構，沒有驗證完整心理因果或自然語言目的。{outcome==='committed'?'世界已提交；實際成果仍須對照活動及世界結果。':'此回合尚無已提交世界證據；以下候選與承接不能當作正式成果。'}</p>
  {!candidates.length?<p>明示空候選集合；仍可選既有追求、等待或續做。</p>:<ol>{candidates.map(candidate=>{
   const match=adopted.find(a=>a.candidate.id===candidate.id),declined=selection.declinedCandidateIds.includes(candidate.id);
   return <li key={candidate.id}><p>{candidate.content} · {match?'明示承接':declined?'明示拒絕承接':'未承接（不等於拒絕）'}</p><p>候選範圍：{candidate.scope}</p><p>候選滿足標準：{candidate.satisfaction??'開放'}</p>{match&&<p>正式追求：{match.pursuit.id} · v{match.pursuit.version}<br/>承接後範圍：{match.pursuit.scope}<br/>承接後主觀標準：{match.pursuit.satisfaction??'開放'}</p>}</li>;
  })}</ol>}
  <p>當下焦點：{selection.focus?`${selection.focus.kind==='candidate'?'本次候選':'既有追求'} ${selection.focus.id} · 原版本 ${selection.focus.version}`:'明示空焦點'}；{selection.reason||'沒有附加選擇說明。'}</p>
  <p className="hint">未承接候選不進入角色待辦、記憶或下一次提示；未表達某方向不證明模型內部沒有想到。</p>
 </section>;
}
