import type { Character } from './world';
import type { MentalEnergy, MentalInterval } from './mental-energy';
import { appendMentalHistory } from './mental-history';

export const formalMentalPolicyId='mental-energy-271-v1';
export type FormalDraw={level?:number;direction?:string;reason?:string;revision?:number;slot?:number;source:string;die:number;face:number;rawDelta:number};
export type FormalCoverage={slot:number;from:number;to:number;awake:number;sleep:number;processes:{id:string;revision:number;direction:string;level:number;reason:string;minutes:number}[]};
export type FormalSettlement={capacityDice?:[number,number];sleepUnits:number;coverage?:FormalCoverage};
export type FormalOpening={capacity?:number;minimum?:number;maximum?:number;current?:number;stage?:'充沛'|'有餘'|'尚可'|'吃緊'|'見底';seed?:number};
const clamp=(value:number,maximum:number)=>Math.max(0,Math.min(maximum,value));
export function formalEnergyStageIndex(value:number,capacity:number):number{if(!Number.isSafeInteger(value)||!Number.isSafeInteger(capacity)||capacity<=0||value<0||value>capacity)throw Error('正式電量比例需要合法整數。');return Math.min(4,Number(BigInt(value)*BigInt(5)/BigInt(capacity)));}
/** Persist the seed once; identities, rather than transport order, select each die. */
export function formalDie(actor:Character,source:string,slot:number,die:number):number{
 let h=actor.mentalEnergy!.policy.process!.seed>>>0;
 for(const c of `${actor.id}\0${source}\0${slot}`)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;
 const limit=Math.floor(0x100000000/die)*die;
 for(;;){h=(h+0x9e3779b9)>>>0;let z=h;z=Math.imul(z^(z>>>16),0x21f0aaad);z=Math.imul(z^(z>>>15),0x735a2d97);z=(z^(z>>>15))>>>0;if(z<limit)return z%die+1;}
}
export function createFormalMentalEnergy(actor:Pick<Character,'id'|'mentalEnergy'>,minute:number,opening:FormalOpening={}):MentalEnergy{
 if(!opening||typeof opening!=='object'||Array.isArray(opening)||typeof actor.id!=='string'||!actor.id||!Number.isFinite(minute)||Object.keys(opening).some(key=>!['capacity','minimum','maximum','current','stage','seed'].includes(key)))throw Error('正式精神電量開局格式無效。');
 if(['capacity','minimum','maximum','current','seed'].some(key=>opening[key as keyof FormalOpening]!==undefined&&!Number.isSafeInteger(opening[key as keyof FormalOpening])))throw Error('正式開局數值必須明示整數。');
 if(actor.mentalEnergy!==undefined)throw Error('既有精神電量不得由開局工廠重抽或轉換測試政策。');
 const min=opening.minimum??40,max=opening.maximum??90;
 if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||min<40||max>90||min>max)throw Error('一般容量限制必須位於40至90。');
 let capacity=opening.capacity,capacityDice:[number,number]|undefined;
 if(capacity===undefined){
  if(opening.minimum===undefined&&opening.maximum===undefined){capacityDice=[Math.floor(Math.random()*6)+1,Math.floor(Math.random()*6)+1];}
  else{const pairs:[number,number][]=[];for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){const n=(a+b+6)*5;if(n>=min&&n<=max)pairs.push([a,b]);}if(!pairs.length)throw Error('容量範圍沒有合法建角結果。');capacityDice=pairs[Math.floor(Math.random()*pairs.length)];}
  capacity=(capacityDice[0]+capacityDice[1]+6)*5;
 }
 if(!Number.isSafeInteger(capacity)||capacity<=0||opening.minimum!==undefined&&capacity<min||opening.maximum!==undefined&&capacity>max)throw Error('特殊容量必須明示正整數且不違反背景範圍。');
 const ratios={'充沛':90,'有餘':70,'尚可':50,'吃緊':30,'見底':10};
 if(opening.stage!==undefined&&!Object.hasOwn(ratios,opening.stage))throw Error('開局電量階段無效。');
 const initial=opening.current??(Math.floor(capacity!/100)*(opening.stage?ratios[opening.stage]:70)+Math.floor(((capacity!%100)*(opening.stage?ratios[opening.stage]:70)+50)/100));
 if(!Number.isSafeInteger(initial)||initial<0||initial>capacity!)throw Error('正式目前電量必須是容量內整數。');
 if(opening.current!==undefined&&opening.stage!==undefined&&['見底','吃緊','尚可','有餘','充沛'][formalEnergyStageIndex(initial,capacity!)]!==opening.stage)throw Error('明示目前電量與階段互相矛盾。');
 const seed=opening.seed??Math.floor(Math.random()*0x100000000);
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('正式骰源無效。');
 return {version:1,policy:{version:1,kind:'formal',id:formalMentalPolicyId,initial,maximum:capacity!,awakePerHour:2,regulationCost:5,lowAt:capacity!*0.2,process:{seed,slotMinutes:5,levels:[0,1,2,3],multipliers:[1]},experience:{levels:[0,1,2,3]}},value:initial,activatedAt:minute,updatedAt:minute,history:[],dropped:0,formal:{sleepUnits:0,...(capacityDice?{capacityDice}:{})}};
}
export function assertFormalMentalPolicy(state:MentalEnergy):void{
 const p=state.policy;
 const dice=state.formal?.capacityDice;
 if(dice&&(!Array.isArray(dice)||dice.length!==2||dice.some(face=>!Number.isInteger(face)||face<1||face>6)||(dice[0]+dice[1]+6)*5!==p.maximum))throw Error('正式容量建角證據無效。');
 if(p.id!==formalMentalPolicyId||p.kind!=='formal'||p.version!==1||!Number.isSafeInteger(p.maximum)||p.maximum<=0||!Number.isSafeInteger(p.initial)||p.initial<0||p.initial>p.maximum||p.awakePerHour!==2||p.regulationCost!==5||p.lowAt!==p.maximum*0.2||Object.keys(p).some(key=>!['version','kind','id','initial','maximum','awakePerHour','regulationCost','lowAt','process','experience'].includes(key))||!p.process||Object.keys(p.process).sort().join(',')!=='levels,multipliers,seed,slotMinutes'||!Array.isArray(p.process.levels)||!Array.isArray(p.process.multipliers)||!p.experience||Object.keys(p.experience).join(',')!=='levels'||!Array.isArray(p.experience.levels)||p.process.slotMinutes!==5||!Number.isSafeInteger(p.process.seed)||p.process.seed<0||p.process.seed>0xffffffff||JSON.stringify(p.process.levels)!=='[0,1,2,3]'||JSON.stringify(p.process.multipliers)!=='[1]'||JSON.stringify(p.experience?.levels)!=='[0,1,2,3]'||!state.formal||!Number.isSafeInteger(state.formal.sleepUnits)||state.formal.sleepUnits<0||state.formal.sleepUnits>=12)throw Error('正式精神電量政策或實睡進度無效。');
}
/** Read-only validation for #263 preserving an already formal actor. */
export function assertFormalMentalEnergy(actor:Pick<Character,'id'|'mentalEnergy'|'plan'>):void{
 const state=actor.mentalEnergy;if(!state)throw Error('正式精神電量尚未形成。');assertFormalMentalPolicy(state);
 if(state.version!==1||!Number.isFinite(state.activatedAt)||!Number.isFinite(state.updatedAt)||state.updatedAt<state.activatedAt||!Array.isArray(state.history)||state.history.length>32||!Number.isSafeInteger(state.dropped)||state.dropped<0)throw Error('正式精神電量保存狀態無效。');
 const saved=state.formal!.coverage;
 if(saved&&(saved.to!==state.updatedAt||saved.slot!==Math.floor(state.updatedAt/5)||!Number.isSafeInteger(saved.slot)||![saved.from,saved.to,saved.awake,saved.sleep].every(Number.isFinite)||saved.from<saved.slot*5||saved.to>=saved.slot*5+5||saved.from>saved.to||saved.awake<0||saved.sleep<0||Math.abs(saved.awake+saved.sleep-(saved.to-saved.from))>1e-8||!Array.isArray(saved.processes)||saved.processes.length>32||saved.processes.some(p=>typeof p.id!=='string'||!p.id||p.id.length>128||typeof p.reason!=='string'||!p.reason.trim()||new TextEncoder().encode(p.reason).length>256||!Number.isSafeInteger(p.revision)||p.revision<0||!Number.isFinite(p.minutes)||p.minutes<0||p.minutes>saved.to-saved.from||!['positive','negative','neutral'].includes(p.direction)||!(p.direction==='neutral'?[0]:[1,2,3]).includes(p.level))))throw Error('正式精神電量格內覆蓋資料無效。');
 if(!Number.isSafeInteger(state.value)||state.value<0||state.value>state.policy.maximum)throw Error('正式精神電量餘額必須是容量內整數。');
 const balance=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=state.policy.maximum;
 const validDraw=(d:FormalDraw)=>d&&typeof d.source==='string'&&d.source.length>0&&d.source.length<=128&&[3,4,6].includes(d.die)&&Number.isInteger(d.face)&&d.face>=1&&d.face<=d.die&&Number.isSafeInteger(d.rawDelta)&&Math.abs(d.rawDelta)<=8;
 if(state.history.some(h=>!h||!['natural','process','experience','regulation'].includes(h.kind)||!balance(h.before)||!balance(h.after)||!Number.isFinite(h.from)||!Number.isFinite(h.minute)||h.from>h.minute||h.minute>state.updatedAt||!Number.isFinite(h.awakeMinutes)||h.awakeMinutes<0||h.awakeMinutes>5||h.draws&&(!Array.isArray(h.draws)||h.draws.length>33||h.draws.some(d=>!validDraw(d)))))throw Error('正式精神電量收支證據無效。');
 const ledger=state.experiences;
 if(ledger){
  if(!Number.isSafeInteger(ledger.dropped)||ledger.dropped<0||!Array.isArray(ledger.receipts)||ledger.receipts.length>256||new Set(ledger.receipts.map(r=>r.source)).size!==ledger.receipts.length)throw Error('正式主觀來源收據無效。');
  for(const r of ledger.receipts){
   if(!r||typeof r.source!=='string'||!r.source||r.source.length>128||!balance(r.before)||!balance(r.after)||!Number.isFinite(r.at)||r.at>state.updatedAt||!Number.isFinite(r.expiresAt)||r.expiresAt<=r.at||!['positive','negative','neutral'].includes(r.direction)||!(r.direction==='neutral'?[0]:[1,2,3]).includes(r.level)||!Number.isSafeInteger(r.rawDelta)||Math.abs(r.rawDelta!)>8||r.draw&&!validDraw(r.draw))throw Error('正式主觀來源收據無效。');
  }
 }
 const control=state.controlAssessments;
 if(control){
  if(!Number.isSafeInteger(control.dropped)||control.dropped<0)throw Error('正式接管評估收據無效。');
  for(const items of [control.sources,control.activities]){
   if(!Array.isArray(items)||items.length>256||new Set(items.map(r=>r.id)).size!==items.length||items.some(r=>!r||typeof r.id!=='string'||!r.id||r.id.length>128||!Number.isFinite(r.at)||r.at>state.updatedAt))throw Error('正式接管評估收據無效。');
  }
 }
 const p=actor.plan?.mentalProcess;
 if(p&&(p.version!==1||typeof p.id!=='string'||!p.id||p.id.length>128||!Number.isSafeInteger(p.revision)||p.revision<0||!Number.isFinite(p.effectiveAt)||!Number.isFinite(p.updatedAt)||p.effectiveAt>p.updatedAt||p.updatedAt>state.updatedAt||!Number.isFinite(p.activeMinutes)||p.activeMinutes<0||!Number.isSafeInteger(p.draws)||p.draws<0||!Number.isSafeInteger(p.randomState)||p.randomState<0||p.randomState>0xffffffff||p.assessment&&(!['positive','negative','neutral'].includes(p.assessment.direction)||!(p.assessment.direction==='neutral'?[0]:[1,2,3]).includes(p.assessment.level)||typeof p.assessment.reason!=='string'||!p.assessment.reason.trim()||new TextEncoder().encode(p.assessment.reason).length>256)))throw Error('正式活動精神時間資料無效。');
}
export function settleFormalMentalInterval(actor:Character,interval:MentalInterval):void{
 const state=actor.mentalEnergy!;assertFormalMentalEnergy(actor);
 if(state.updatedAt===interval.to)return;
 if(state.updatedAt!==interval.from)throw Error('正式精神電量候選時間已過期。');
 const progress=state.formal!;

 const sleepStart=interval.sleepFrom??interval.from,sleepEnd=sleepStart+interval.sleepMinutes;
 let at=interval.from;
 while(at<interval.to){
  const slot=Math.floor(at/5),end=Math.min(interval.to,(slot+1)*5);
  let coverage=progress.coverage;
  if(!coverage||coverage.slot!==slot)coverage={slot,from:at,to:at,awake:0,sleep:0,processes:[]};
  if(coverage.to!==at)throw Error('正式精神電量時間覆蓋不連續。');
  const slept=Math.max(0,Math.min(end,sleepEnd)-Math.max(at,sleepStart));
  coverage.sleep+=slept;coverage.awake+=end-at-slept;coverage.to=end;
  for(const p of interval.formalProcesses??[]){const minutes=Math.max(0,Math.min(end,p.to)-Math.max(at,p.from));if(!minutes)continue;let source=coverage.processes.find(s=>s.id===p.id&&s.revision===p.revision);if(!source){if(coverage.processes.length>=32)throw Error('同格精神來源超過容量。');source={id:p.id,revision:p.revision,direction:p.direction,level:p.level,reason:p.reason,minutes:0};coverage.processes.push(source);}source.minutes+=minutes;}
  progress.coverage=coverage;at=end;
  if(end!==(slot+1)*5)continue;
  const draws:FormalDraw[]=[];let natural=0,process=0,sleep=0;
  if(coverage.awake===5){const face=formalDie(actor,'natural',slot,6);natural=face===1?-1:0;draws.push({slot,source:'natural',die:6,face,rawDelta:natural});}
  if(coverage.sleep===5){progress.sleepUnits++;if(progress.sleepUnits===12){progress.sleepUnits=0;sleep=1;}}
  for(const p of coverage.processes){if(p.minutes!==5||p.direction==='neutral')continue;const face=formalDie(actor,p.id,slot,3),delta=(face+p.level-2)*(p.direction==='negative'?-1:1);process+=delta;if(actor.plan?.mentalProcess?.id===p.id)actor.plan.mentalProcess.draws++;draws.push({level:p.level,direction:p.direction,reason:p.reason,revision:p.revision,slot,source:p.id,die:3,face,rawDelta:delta});}
  const before=state.value;state.value=clamp(before+natural+process+sleep,state.policy.maximum);
  appendMentalHistory(state,{kind:process||draws.some(d=>d.die===3)?'process':'natural',from:coverage.from,minute:end,reason:'正式五分鐘時間來源共同結算',before,after:state.value,awakeMinutes:coverage.awake,naturalDelta:natural,processDelta:process,processMinutes:coverage.processes.filter(p=>p.minutes===5).length*5,processSlots:draws.filter(d=>d.die===3).map(d=>({id:d.source,slot,draw:d.face})),sleepDelta:sleep,draws});
  delete progress.coverage;
 }
 if(actor.plan?.mentalProcess){actor.plan.mentalProcess.activeMinutes+=(interval.formalProcesses??[]).reduce((sum,p)=>sum+Math.max(0,p.to-p.from),0);actor.plan.mentalProcess.updatedAt=interval.to;}
 state.updatedAt=interval.to;
}

/** Known source times retain order; contemporaneous sources share one clamp. */
export function applyFormalFeelingUpdates(actor:Character,updates:import('./mental-experiences').PreparedFeelingUpdate[],minute:number):void{
 const state=actor.mentalEnergy!,ledger=state.experiences!;
 const sorted=[...updates].sort((a,b)=>a.originAt-b.originAt||a.source.localeCompare(b.source));
 const times=[...new Set(sorted.map(u=>u.originAt))];
 for(const time of times){const group=sorted.filter(u=>u.originAt===time),before=state.value,groupId=`experience:${minute}:${time}`;
  const draws=group.map(update=>{const face=update.direction==='neutral'?0:formalDie(actor,`experience:${update.source}`,0,4),rawDelta=face?(face+(update.level-1)*2)*(update.direction==='negative'?-1:1):0;return {source:update.source,die:4,face,rawDelta};});
  state.value=clamp(before+draws.reduce((sum,d)=>sum+d.rawDelta,0),state.policy.maximum);
  group.forEach((prepared,index)=>{const {originAt,...update}=prepared,moodBefore=actor.mood;if(update.mood!==null)actor.mood=update.mood;
   ledger.receipts.push({...update,at:minute,expiresAt:originAt+7*1440,before,after:state.value,moodBefore,moodAfter:actor.mood,...(draws[index].face?{draw:draws[index]}:{}),rawDelta:draws[index].rawDelta,groupId});
   appendMentalHistory(state,{kind:'experience',from:minute,minute,reason:update.reason,before,after:state.value,awakeMinutes:0,source:update.source,moodBefore,moodAfter:actor.mood,draws:draws[index].face?[draws[index]]:[],rawDelta:draws[index].rawDelta,groupId});
  });
 }
}
