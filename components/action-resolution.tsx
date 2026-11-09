import type { Resolution } from '@/lib/d20';
const outcomeLabels={'critical-success':'大成功',success:'成功',mixed:'部分成功',failure:'失敗','critical-failure':'大失敗'};
export default function ActionResolution({resolution}:{resolution:Resolution}) {
 if(resolution.system==='d100-v1')return <small>🎲 d100 {String(resolution.roll).padStart(2,'0')} ／ 成功門檻 {resolution.threshold} · {outcomeLabels[resolution.outcome]}
  {resolution.factors&&<span> · 基本能力 {resolution.factors.ability}、難度 {resolution.factors.difficulty}、專長 {resolution.factors.expertise}、感官 {resolution.factors.sense}、關注 {resolution.factors.attention}</span>}</small>;
 return <small>🎲 D20 {resolution.roll} {resolution.modifier>=0?'+':''}{resolution.modifier} − DC {resolution.dc} = {resolution.total} · {outcomeLabels[resolution.outcome]}</small>;
}
