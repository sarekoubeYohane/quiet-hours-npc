import { locations, type Action, type Character, type Habit, type EventHabit, type World } from './world';
import { routineOperation } from './routine-rules';
import type { ShortMemory } from './memory';
import type { EffectCandidate } from './world-effects';
import { regions } from './perception';

export const habitPeriods = ['深夜', '上午', '下午', '晚上'];
const dayOf = (minute: number) => Math.floor(minute / 1440) + 1;
const periodOf = (minute: number) => Math.floor((minute % 1440) / 360);

// Only call after a valid, autonomous AI action. Continuation and user requests are excluded.
export function learnHabit(world: World, character: Character, action: Action, from: string, candidate?: EffectCandidate): void {
  if (action.target === 'observer' || action.type === 'door') return;
  const day = dayOf(world.minute), period = periodOf(world.minute);
  const target = ['move', 'say', 'shout', 'persuade', 'message', 'work'].includes(action.type) ? action.target || '' : '';
  const identity=activityIdentity(world,action,candidate,character);
  const key = `activity.v1:${period}:${from}:${identity.key}`;
  const event=world.events.findLast(event=>event.actor===character.id&&event.time===world.minute&&event.kind!=='continue'&&event.kind!=='blocked');
  // A successful dispatcher return can still be a cached same-project continue.
  // Without an actual start/attempt event, preserve the prior evidence unchanged.
  if(!event)return;
  const memory=character.shortTerm?.find(memory=>memory.eventId===event.id);
  const evidence={id:event.id,version:1 as const,time:world.minute,location:from,activityKey:identity.key,activityLabel:identity.label,...(identity.semanticGap?{semanticGap:true}:{}),...(candidate?.activityIdentity?{confirmedIdentity:structuredClone(candidate.activityIdentity)}:{}),...(event?{eventId:event.id}:{}),...(memory?{memory:{id:memory.id,version:memory.version}}:{}),started:true as const};
  if(character.habitEvidence?.some(item=>item.id===evidence.id))return;
  const retained=[...(character.habitEvidence||[]).filter(item=>world.minute-item.time<=30*1440),evidence];
  character.habitEvidenceDropped=(character.habitEvidenceDropped||0)+Math.max(0,(character.habitEvidence||[]).length+1-Math.min(96,retained.length));
  character.habitEvidence=retained.slice(-96);
  if(identity.semanticGap)return;
  const habits = (character.habits || []).filter(habit => world.minute - habit.lastSeen <= 30 * 1440);
  let habit = habits.find(habit => habit.key === key);
  if (!habit) {
    habit = { activityKey:identity.key,activityLabel:identity.label,evidenceIds:[],key, type: action.type, target, location: from, period, observedDays: [], lastSeen: world.minute };
    habits.push(habit);
  }
  // Repeating ten times in one day is still one day of evidence.
  habit.observedDays = [...new Set([...habit.observedDays.filter(d => d >= day - 20), day])].slice(-14);
  habit.lastSeen = world.minute;
  habit.evidenceIds=[...(habit.evidenceIds||[]).filter(id=>character.habitEvidence!.some(item=>item.id===id)),evidence.id].slice(-14);
  character.habits = habits.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 24);
}

function habitEvidenceState(habit:Pick<Habit,'observedDays'|'lastSeen'>,minute:number){
 const days=habit.observedDays.filter(day=>day>=dayOf(minute)-20).length;
 const age=Math.max(0,minute-habit.lastSeen);
 const strength=Math.min(1,days/6)*Math.pow(0.5,age/1440/7);
 return {days,strength,established:days>=3&&strength>=0.2,fading:days>=3&&age>=7*1440};
}

export function habitStrength(habit: Habit, minute: number): number {
 return habitEvidenceState(habit,minute).strength;
}

export function habitLabel(habit: Habit, characters: Character[]): string {
  const place = locations.find(place => place.id === habit.location)?.name || habit.location;
  const destination = locations.find(place => place.id === habit.target)?.name || habit.target;
  const person = characters.find(character => character.id === habit.target)?.name || '朋友';
  const activity = habit.activityLabel || (habit.type === 'move' ? `前往${destination}` : habit.type === 'say' ? `與 ${person} 聊聊` :
    habit.type === 'shout' ? `向 ${person} 大聲說話` : habit.type === 'persuade' ? `嘗試說服 ${person}` : habit.type === 'message' ? `傳訊息給 ${person}` : habit.type === 'work' ? ({ tea: '泡茶', tidy: '整理', craft: '畫髮飾' }[habit.target] || '工作') :
    ({ pause:'暫停活動',resume:'恢復活動',abandon:'放棄活動',propose:'自由方法', door: '操作門', rest: '休息', reflect: '留些時間給自己', observe: '觀察周圍' }[habit.type] || '活動'));
  return `${habitPeriods[habit.period]}在${place}，常會${activity}`;
}

export function habitViews(world: World, character: Character) {
  return (character.habits || []).map(habit => {
    return { ...habit, ...habitEvidenceState(habit,world.minute), label: habitLabel(habit, world.characters) };
  }).filter(habit => habit.days > 0).sort((a, b) => Number(b.established) - Number(a.established) || b.strength - a.strength || b.lastSeen - a.lastSeen);
}

export function habitsForDecision(world: World, character: Character) {
  return habitViews(world, character).filter(habit => habit.established && habit.period === periodOf(world.minute) && habit.location === character.location)
    .slice(0, 5).map(habit => ({ tendency: habit.label, strength: Math.round(habit.strength * 100), observedDays: habit.days })).concat(eventHabitViews(world,character).filter(habit=>habit.established&&habit.location===character.location&&character.shortTerm?.some(memory=>{const trigger=triggerIdentity(character,memory);return !!trigger&&trigger.key===habit.triggerKey&&world.minute-trigger.time<=120&&world.minute>=trigger.time;})).slice(0,3).map(habit=>({tendency:habit.label,strength:Math.round(habit.strength*100),observedDays:habit.days}))).slice(0,5);
}


// Only stable, confirmed methods are grouped; free text or effect shapes cannot
// prove equivalent semantics. Unknown methods retain their factual start only.
export function activityIdentity(world:World,action:Action,candidate:EffectCandidate|undefined,character:Character):{key:string;label:string;semanticGap?:boolean}{
 if(candidate?.activityIdentity){
  const identity=candidate.activityIdentity;
  const prior=(character.habitEvidence||[]).find(e=>e.confirmedIdentity?.key===identity.key)?.confirmedIdentity;
  if(prior&&prior.label!==identity.label)throw Error('既有活動語義身份名稱不一致。');
  if(identity.key===action.target||world.objects?.some(object=>object.id===identity.key)||world.supplies?.some(supply=>supply.id===identity.key))throw Error('活動身份不能是具體物件ID。');
  const knownLabel=character.habits?.find(habit=>habit.activityKey===`confirmed.v${identity.version}:${identity.key}`)?.activityLabel;
  return {key:`confirmed.v${identity.version}:${identity.key}`,label:knownLabel||(action.purpose||action.content||'自由活動').slice(0,64)};
 }
 const operation=candidate?.trialBinding?.operation||routineOperation(action,world.routineRules?.flatMap(rule=>rule.templates||[]))||routineOperation(action);
 if(operation)return {key:`routine:${operation}`,label:({tea:'泡茶',coffee:'準備咖啡',food:'準備食物',drink:'飲用',wash:'清洗餐具',return:'歸還餐具'} as Record<string,string>)[operation]||operation};
 if(action.type!=='propose')return {key:`${action.type}:${['move','say','shout','persuade','message','work'].includes(action.type)?action.target||'':''}`,label:action.type==='work'?({tidy:'整理',craft:'畫髮飾'}[action.target||'']||'工作'):({pause:'暫停活動',resume:'恢復活動',abandon:'放棄活動',rest:'休息',reflect:'留些時間給自己',observe:'觀察周圍',move:'移動',say:'聊天',shout:'大聲說話',persuade:'嘗試說服',message:'傳訊息',door:'操作門'}[action.type]||'活動')};
 return {key:'unclassified',label:(action.purpose||'自由活動').slice(0,80),semanticGap:true};
}

function triggerIdentity(character:Character,memory:ShortMemory){
 const evidence=character.habitEvidence?.find(item=>item.memory?.id===memory.id&&item.memory.version===memory.version&&!item.semanticGap);
 if(evidence)return {key:evidence.activityKey,label:evidence.activityLabel,time:evidence.time,location:evidence.location};
 if(memory.source.kind!=='observation'||!memory.observation)return;
 const region=memory.observation.region||memory.source.region;
 const location=regions.find(item=>item.id===region)?.location;
 if(!location)return;
 const observed=memory.observation;
 // Text is the subjective event itself, never the hidden source/world event.
 const text=observed.text.normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,256);
 return {key:`observed.v1:${observed.kind}:${observed.sense}:${memory.source.person||''}:${text}`,label:observed.text.slice(0,64),time:memory.time,location};
}


export type HabitAssociationCandidate={trigger:{id:string;version:number};action:{id:string;version:number}};
const referenceSchema={type:'object',properties:{id:{type:'string',minLength:1,maxLength:160},version:{type:'integer',minimum:1}},required:['id','version'],additionalProperties:false};
export const habitCandidateSchema={type:'array',maxItems:2,items:{type:'object',properties:{trigger:referenceSchema,action:referenceSchema},required:['trigger','action'],additionalProperties:false}};
export const habitCandidatePrompt=' habitCandidates 可在同次正常決策提出最多2個事件→活動關聯候選，只填 trigger:{id,version}、action:{id,version}，兩者都是本次 self.shortTerm 實際可見的本人經歷引用。trigger 必須是自己真正做過的活動或本人已有的感官觀察，action 是其後真正開始的自主活動，不能用想法、否決、提案或控制經歷充當已做；沒有候選填[]。程式只核對有限已保存來源，至少跨3個世界日才形成情境習慣；自述不能補造歷史。形成中不代表已經有這個習慣，關聯不代表因果、成功或喜歡。habitCandidates、preferenceUpdates、memorySelections、memoryOperations、cognitiveUpdates 合計最多4項，與interpretation合計最多8KiB，不能各自用滿。';

export function updateEventHabits(world:World,character:Character,value:unknown,visible:ShortMemory[]):EventHabit[]|undefined{
 if(value===undefined)return;
 if(!Array.isArray(value)||value.length>2)throw Error('習慣關聯候選格式無效。');
 const habits=structuredClone((character.eventHabits||[]).filter(item=>world.minute-item.lastSeen<=30*1440));
 const ref=(value:unknown):{id:string;version:number}=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('習慣引用格式無效。');
  const r=value as {id:string;version:number};
  if(Object.keys(r).sort().join(',')!=='id,version'||typeof r.id!=='string'||!r.id||r.id.length>160||!Number.isSafeInteger(r.version)||r.version<1)throw Error('習慣引用格式無效。');
  return r;
 };
 for(const raw of value){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='action,trigger')throw Error('習慣候選格式無效。');
  const trigger=ref(raw.trigger),action=ref(raw.action);
  const known=(r:{id:string;version:number})=>visible.find(memory=>memory.characterId===character.id&&memory.id===r.id&&memory.version===r.version&&!memory.controlled&&memory.time<=world.minute);
  if(!known(trigger)||!known(action))throw Error('習慣來源不在本次本人可見經歷。');
  const prior=(r:{id:string;version:number})=>character.habitEvidence?.find(e=>e.version===1&&e.memory?.id===r.id&&e.memory.version===r.version);
  const before=triggerIdentity(character,known(trigger)!),after=prior(action);
  if(!before||!after||world.minute-after.time>21*1440||after.semanticGap||trigger.id===action.id||before.time>=after.time||after.time-before.time>120||before.location!==after.location||after.time>world.minute)throw Error('習慣來源不是時序合法的已開始自主行為。');
  const key=`event.v1:${before.key}:${after.activityKey}:${after.location}`;
  let habit=habits.find(item=>item.key===key);
  if(!habit){habit={key,triggerKey:before.key,triggerLabel:before.label,activityKey:after.activityKey,activityLabel:after.activityLabel,location:after.location,observedDays:[],lastSeen:after.time,proposedAt:world.minute,links:[]};habits.push(habit);}
  if(habit.links.some(link=>link.evidenceId===after.id&&link.trigger.id===trigger.id&&link.trigger.version===trigger.version))continue;
  const day=dayOf(after.time);
  habit.observedDays=[...new Set([...habit.observedDays.filter(d=>d>=dayOf(world.minute)-20),day])].sort((a,b)=>a-b).slice(-14);
  habit.lastSeen=Math.max(habit.lastSeen,after.time);
  habit.links=[...habit.links,{trigger,action,evidenceId:after.id}].slice(-14);
 }
 return habits.sort((a,b)=>b.lastSeen-a.lastSeen).slice(0,12);
}

export function eventHabitViews(world:World,character:Character){
 return (character.eventHabits||[]).map(habit=>{
  return {...habit,...habitEvidenceState(habit,world.minute),label:`${habit.triggerLabel}之後，常會${habit.activityLabel}`};
 }).filter(habit=>habit.days>0).sort((a,b)=>b.lastSeen-a.lastSeen);
}
