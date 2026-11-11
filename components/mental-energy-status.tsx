import type {Character} from '@/lib/world';
import {timeLabel} from '@/lib/world';
import {mentalEnergyFeeling,assertMentalEnergyPolicy,type MentalEnergy} from '@/lib/mental-energy';
import {assertFormalMentalEnergy} from '@/lib/formal-mental-policy';
import {MentalMeter} from './character-status-board';
type Entry=MentalEnergy['history'][number];
function FormalHistory({state}:{state:MentalEnergy}){
 const groups=new Map<string,Entry[]>();
 state.history.forEach((entry,index)=>{const key=entry.groupId??`${entry.kind}:${entry.from}:${entry.minute}:${entry.kind==='regulation'?index:''}`;groups.set(key,[...(groups.get(key)??[]),entry]);});
 return <>{[...groups.entries()].reverse().slice(0,5).map(([id,entries])=>{
  const first=entries[0],last=entries.at(-1)!,draws=entries.flatMap(e=>e.draws??[]);
  const raw=first.kind==='regulation'?last.after-first.before:draws.reduce((sum,d)=>sum+d.rawDelta,0)+(first.sleepDelta??0);
  const actual=last.after-first.before,clipped=raw-actual;
  const signed=(n:number)=>n>0?`+${n}`:String(n);
  return <div className="hint" key={id}><p>D{Math.floor(first.minute/1440)+1} · {timeLabel(first.minute)} · {first.kind==='regulation'?'主動情緒調節':first.kind==='experience'?'獨立經歷感受':'五分鐘時間來源'}<br/>原始收支 {signed(raw)}；實際變化 {signed(actual)}；餘額 {first.before} → {last.after}{clipped?`（上下界限制 ${Math.abs(clipped)} 點，沒有保留溢出或欠額）`:''}</p>
   {draws.map((d,index)=><p key={`${d.source}:${index}`}>{d.die===6?'清醒自然消耗':d.reason??state.experiences?.receipts.find(r=>r.source===d.source)?.reason??'主觀經歷'}：d{d.die} 骰出 {d.face}，原始 {signed(d.rawDelta)}{d.level?`（${['','輕微','明顯','強烈'][d.level]}）`:''}</p>)}
   {!!first.sleepDelta&&<p>累積實際睡眠的固定回電 +{first.sleepDelta}（不擲骰）</p>}
   {first.kind==='experience'&&!draws.length&&<p>無影響，不擲骰。</p>}
   {first.kind==='regulation'&&<p>心理努力：{first.effort}；{first.reason}。心情 {first.moodBefore} → {first.moodAfter}</p>}
   {entries.filter(e=>e.kind==='experience').map((e,index)=><p key={index}>{e.reason}；心情 {e.moodBefore} → {e.moodAfter}</p>)}
  </div>;
 })}</>;
}
export function MentalEnergyStatus({character}:{character:Character}){
 const s=character.mentalEnergy;
 let error=false;
 if(s!==undefined)try{
  if(!s||!s.policy)throw Error('無效資料');
  if(s.policy.kind==='formal')assertFormalMentalEnergy(character);
  else{assertMentalEnergyPolicy(s.policy);if(!Array.isArray(s.history)||!Number.isFinite(s.value)||s.value<0||s.value>s.policy.maximum)throw Error('無效資料');}
 }catch{error=true;}
 if(error)return <div className="detail"><h3>精神電量</h3><p>文字心情：{character.mood}</p><p role="status">目前精神電量資料無法使用。原世界資料保持保存，請查看操作診斷及既有相容處置；未自動修復或重新建角。</p></div>;
 return <div className="detail"><h3>精神電量</h3><p>文字心情：{character.mood}</p>{s?<><MentalMeter character={character}/><p>{mentalEnergyFeeling(character)?.feeling}；{s.value>=s.policy.regulationCost?'可負擔一次主動調節':'目前不足以支付一次主動調節'}</p><details><summary>啟用與計算依據</summary><p className="hint">{s.policy.kind==='formal'?'正式生活規則；同組原始收支先合計，再限制於零與個人容量。':`隔離測試政策 ${s.policy.id}；非正式產品預設。`}角色只收到本人感受及是否能負擔一次調節。</p><p className="hint">從 D{Math.floor(s.activatedAt/1440)+1} · {timeLabel(s.activatedAt)} 啟用；未回填先前心理歷史。最近 {s.history.length} 筆，已省略 {s.dropped} 筆。自然來源收據 {s.experiences?.receipts.length||0} 筆，過期移除 {s.experiences?.dropped||0} 筆；超出保留範圍不代表可重新結算。</p>{character.plan?.mentalProcess&&<p className="hint">活動感受：{character.plan.mentalProcess.assessment?.reason||'尚未評估'}；本活動有效結算 {character.plan.mentalProcess.activeMinutes} 分鐘；新評估於 {timeLabel(character.plan.mentalProcess.effectiveAt)} 向後生效，既有時段不重抽。</p>}</details><details><summary>最近的精神電量變化</summary>{s.policy.kind==='formal'?<FormalHistory state={s}/>:<>{[...s.history].reverse().slice(0,5).map((entry,index)=><p className="hint" key={`${entry.minute}:${index}`}>D{Math.floor(entry.minute/1440)+1} · {timeLabel(entry.minute)} · {entry.reason}{entry.kind==='regulation'?`（主動情緒調節；心情 ${entry.moodBefore} → ${entry.moodAfter}；心理努力：${entry.effort}）`:entry.kind==='experience'?`（經歷來源 ${entry.source}；心情 ${entry.moodBefore} → ${entry.moodAfter}）`:''}<br/>{entry.before} → {entry.after}</p>)}</>}</details></>:<p className="hint">精神電量尚未啟用。請明示確認人物開局心力後開始；讀取不補值、不回填心理歷史。</p>}</div>;
}
