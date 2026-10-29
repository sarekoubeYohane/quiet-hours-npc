import type { Character } from '@/lib/world';
import { currentDirections, orderedPursuits, pursuitLimits, type PursuitReference } from '@/lib/pursuits';

export default function PursuitsAnalysis({character}:{character:Character}){
 const nodes=character.intents||[];
 const names={direction:'持續方向',intent:'意圖',task:'任務'};
 const progressNames={ready:'可重新取捨',waiting:'等待',deferred:'延期',blocked:'受阻',enough:'暫時足夠'};
 const referenceAvailable=(reference:PursuitReference)=>{
  const sources=reference.kind==='short'?character.shortTerm:reference.kind==='long'?character.longTerm:reference.kind==='belief'?character.cognition?.beliefs:character.cognition?.relationshipTags;
  return !!sources?.some(source=>source.id===reference.id&&source.version===reference.version&&source.characterId===character.id);
 };
 return <section className="detail" aria-label="分層追求">
  <h3>分層追求 <span>由角色明示承接與調整</span></h3>
  <p className="hint">{nodes.some(n=>n.kind)?`當前方向：${currentDirections(character)||'目前沒有保留的持續方向'}`:'舊版平面意圖；需明示重置測試世界才能使用新版推進。'}</p>
  <p className="hint">{nodes.length}/{pursuitLimits.nodes} 個追求；未提及保持原狀。主觀範圍與滿足標準是角色自述，實際結果沿活動與世界紀錄核對。</p>
  {nodes.some(node=>node.kind)&&<details className="system-trace" open><summary>各層順序與共享關係</summary>
   <p className="hint">各層由角色局部排序；排序不代表必須先做，也不取代實際世界前提。共享項目仍只有下方一份追求與活動進度。</p>
   <p>根追求順序：{orderedPursuits(nodes,null).map(node=>node.content).join(' → ')||'目前無有效根追求'}</p>
   {nodes.filter(parent=>orderedPursuits(nodes,parent.id).length).map(parent=><p key={parent.id}>{parent.content} 的下層順序：{orderedPursuits(nodes,parent.id).map(node=>`${node.content}${(node.parents?.length||0)>1?'（共享）':''}`).join(' → ')}</p>)}
  </details>}
  <ol className="intent-list">{nodes.map(node=><li key={node.id}>
   <h4>{node.kind?names[node.kind]:'舊版意圖'} · {node.content}{character.focusIntentId===node.id?' · 當下焦點':''}</h4>
   <small>{node.id} · v{node.version??'未分類'} · {node.status==='dropped'?'已明示放下':node.status==='satisfied'?'本人認為已滿足':'仍承接'} · 強度 {node.intensity} · 重要 {node.importance} · 急迫 {node.urgency}</small>
   {node.kind&&<p>推進情況：{progressNames[node.progress??'ready']}；這不是活動完成或世界成果的自動判斷。</p>}
   {node.scope&&<p>承接範圍：{node.scope}</p>}
   {node.kind&&<p>主觀滿足標準：{node.satisfaction??'開放，尚無固定終點'}</p>}
   {node.assessment&&<div className="hint"><p>本人短評（{node.assessment.kind==='known-result'?'依當時可知結果':'主觀感受／理解'}）：{node.assessment.text}</p><p>評估世界時間：{node.assessment.time}；依據身份 {node.assessment.references.length} 項；目前保存來源缺口 {node.assessment.references.filter(reference=>!referenceAvailable(reference)).length} 項。短評不等同已提交的世界成果，原文是否仍可知須沿記憶核對。</p></div>}
   <p className="hint">上層：{node.parents?.length?node.parents.map(parent=>`${nodes.find(n=>n.id===parent.id)?.content||`關係缺口（${parent.id}）`}（本層第 ${orderedPursuits(nodes,parent.id).findIndex(item=>item.id===node.id)+1} 位）`).join('、'):'無上層／獨立追求'}{(node.parents?.length||0)>1?' · 共享同一工作':''}</p>
   {!!node.references?.length&&<p className="hint">形成來源身份：{node.references.map(r=>`${r.kind}:${r.id} v${r.version}`).join('、')}。引用不保證原文仍可知，未讀或已忘內容不從追求恢復。</p>}
   {character.plan?.pursuitIds?.includes(node.id)&&<p>連結目前活動：{character.plan.action.content||character.activity}（沿用同一份活動進度）</p>}
  </li>)}</ol>
  {!nodes.length&&<p className="hint">目前沒有保留的追求。</p>}
  <details className="system-trace"><summary>追求變更痕跡（觀察者）</summary><p className="hint">有限模型自述與程式保存紀錄，不送入角色提示。已釋放 {character.pursuitTraceDropped||0} 筆；不是完整心理歷史。</p>{[...(character.pursuitTrace||[])].reverse().map((trace,index)=><article key={`${trace.id}:${index}`}><h4>{trace.operation} · {trace.id}</h4><p>{trace.reason}</p><p>{trace.before?`v${trace.before.version} ${trace.before.scope}`:'新承接'} → {trace.after?`v${trace.after.version} ${trace.after.scope}`:'明示放下'}</p></article>)}</details>
 </section>;
}
