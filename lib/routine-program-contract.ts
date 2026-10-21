import { adjudicationLimits, routineOperations } from './adjudication-limits';
import type { RoutineOperation } from './routine-rules';
import type { Outcome, Difficulty } from './d20';
export type RoutineStep = {kind:'materialize';role:'vesselSupply'|'materialSupply'|'productSupply'} | {kind:'consume';role:'material'|'drink'} | {kind:'transfer';role:'vessel'|'drink';toHolder:'actor'|null} | {kind:'state';role:'vessel';key:'contents'|'clean';value:string};
export type RoutinePath = {effects?:RoutineStep[];stages:{afterMinutes:number;effects:RoutineStep[]}[]};
export type RoutineProgram = RoutinePath & {operation:RoutineOperation;check?:{difficulty:Difficulty;ability:string}|null;branches?:(RoutinePath & {outcomes:Outcome[]})[]|null};
const outcomes:readonly Outcome[]=adjudicationLimits.outcomes;
const object=<T extends Record<string,unknown>>(properties:T)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const stagedProgramSchema=object({operation:{type:'string',enum:routineOperations},stages:{type:'array',minItems:1,maxItems:adjudicationLimits.maxStages,items:object({afterMinutes:{type:'integer',enum:[...adjudicationLimits.phaseMinutes]},effects:{type:'array',minItems:1,maxItems:adjudicationLimits.maxProgramSteps,items:{anyOf:[object({kind:{type:'string',const:'materialize'},role:{type:'string',enum:['vesselSupply','materialSupply','productSupply']}}),object({kind:{type:'string',const:'consume'},role:{type:'string',enum:['material','drink']}}),object({kind:{type:'string',const:'transfer'},role:{type:'string',enum:['vessel','drink']},toHolder:{type:['string','null'],enum:['actor',null]}}),object({kind:{type:'string',const:'state'},role:{type:'string',const:'vessel'},key:{type:'string',enum:['contents','clean']},value:{type:'string',maxLength:40}})]}}})}});
const certainProgramSchema={...stagedProgramSchema,properties:{...stagedProgramSchema.properties,effects:{...stagedProgramSchema.properties.stages.items.properties.effects,minItems:0,maxItems:adjudicationLimits.maxEffects}},required:[...stagedProgramSchema.required,'effects']};
const pathSchema=object({effects:certainProgramSchema.properties.effects,stages:{...stagedProgramSchema.properties.stages,minItems:0,items:{...stagedProgramSchema.properties.stages.items,properties:{...stagedProgramSchema.properties.stages.items.properties,effects:{...stagedProgramSchema.properties.stages.items.properties.effects,minItems:0}}}}});
export const routineProgramSchema={...certainProgramSchema,properties:{...certainProgramSchema.properties,stages:{...certainProgramSchema.properties.stages,minItems:0},check:{anyOf:[{type:'null'},object({difficulty:{type:'integer',enum:[...adjudicationLimits.difficulties]},ability:{type:'string',minLength:1,maxLength:adjudicationLimits.maxValueLength}})]},branches:{anyOf:[{type:'null'},{type:'array',minItems:1,maxItems:adjudicationLimits.maxBranches,items:object({...pathSchema.properties,outcomes:{type:'array',minItems:1,maxItems:adjudicationLimits.maxBranches,items:{type:'string',enum:outcomes}}})}]}},required:[...certainProgramSchema.required,'check','branches']};

const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function validateRoutinePrograms(programs:unknown,times:{operation:RoutineOperation;minutes:number}[],requireComplete=true):asserts programs is RoutineProgram[]{
 if(!Array.isArray(programs)||programs.length!==times.length||new Set(programs.map(p=>p?.operation)).size!==times.length)throw Error('日常程序須完整涵蓋核准範圍。');
 for(const p of programs){
  const time=times.find(t=>t.operation===p?.operation);
  if(p&&typeof p==='object'&&(p.branches!==undefined&&p.branches!==null)){
   if(!time||!exact(p,['operation','effects','stages','check','branches'])||!Array.isArray(p.effects)||p.effects.length||!Array.isArray(p.stages)||p.stages.length||!Array.isArray(p.branches)||!p.branches.length||p.branches.length>adjudicationLimits.maxBranches)throw Error('日常結果分支契約無效。');
   if(p.check!==null&&(!exact(p.check,['difficulty','ability'])||!(adjudicationLimits.difficulties as readonly number[]).includes(p.check.difficulty as number)||typeof p.check.ability!=='string'||!p.check.ability.length||p.check.ability.length>adjudicationLimits.maxValueLength))throw Error('日常判定不可指定骰值或結果。');
   const seen:Outcome[]=[];
   for(const branch of p.branches){
    if(!exact(branch,['outcomes','effects','stages'])||!Array.isArray(branch.outcomes)||!branch.outcomes.length||branch.outcomes.some(o=>!outcomes.includes(o as Outcome)))throw Error('日常結果級別無效。');
    seen.push(...branch.outcomes as Outcome[]);
    const complete=p.check===null||branch.outcomes.some(o=>o==='success'||o==='critical-success');
    validateRoutinePrograms([{operation:p.operation,effects:branch.effects,stages:branch.stages}],[time],complete);
    if(p.check!==null&&branch.outcomes.some(o=>o==='failure'||o==='critical-failure')&&[...(branch.effects as RoutineStep[]),...(branch.stages as RoutinePath['stages']).flatMap(s=>s.effects)].some(e=>e.kind==='materialize'&&e.role==='productSupply'||e.kind==='state'&&['tea','coffee'].includes(e.value)))throw Error('失敗分支不能套用完整成品。');
   }
   if(seen.length!==outcomes.length||new Set(seen).size!==outcomes.length||p.check===null&&p.branches.length!==1)throw Error('日常結果分支須唯一涵蓋五段判定。');
   continue;
  }
  const value=p&&typeof p==='object'?{...p}:p;
  if(value&&typeof value==='object'){if('check' in value){if(value.check!==null)throw Error('判定需求必須提供結果分支。');delete value.check;}if('branches' in value){if(value.branches!==null)throw Error('結果分支無效。');delete value.branches;}}
  if(!time||!(exact(value,['operation','stages'])||exact(value,['operation','effects','stages']))||!Array.isArray(p.stages)||(requireComplete&&!p.stages.length)||p.stages.length>adjudicationLimits.maxStages)throw Error('日常程序格式無效。');
  if(p.stages.some((stage:RoutinePath['stages'][number])=>!stage||!(adjudicationLimits.phaseMinutes as readonly number[]).includes(stage.afterMinutes)))throw Error('日常階段時點無效。');
  let last=-1;
  if(p.effects!==undefined&&(!Array.isArray(p.effects)||p.effects.length>adjudicationLimits.maxEffects))throw Error('日常起始效果超出範圍。');
  for(const stage of [...(Array.isArray(p.effects)&&p.effects.length?[{afterMinutes:0,effects:p.effects}]:[]),...p.stages]){
   if(!exact(stage,['afterMinutes','effects'])||typeof stage.afterMinutes!=='number'||!([0,...adjudicationLimits.phaseMinutes] as readonly number[]).includes(stage.afterMinutes)||stage.afterMinutes<=last||!Array.isArray(stage.effects)||(requireComplete&&!stage.effects.length)||stage.effects.length>adjudicationLimits.maxProgramSteps)throw Error('日常階段格式無效。');last=stage.afterMinutes;
   for(const e of stage.effects){
    const brew=['tea','coffee'].includes(p.operation as string);
    const valid=exact(e,['kind','role'])&&e.kind==='materialize'&&(e.role==='productSupply'&&(brew||p.operation==='food')||['vesselSupply','materialSupply'].includes(e.role as string)&&brew)
     ||exact(e,['kind','role'])&&e.kind==='consume'&&(e.role==='material'&&brew||e.role==='drink'&&p.operation==='drink')
     ||exact(e,['kind','role','toHolder'])&&e.kind==='transfer'&&(e.role==='vessel'&&p.operation!=='food'||e.role==='drink'&&p.operation==='drink')&&(e.toHolder==='actor'||e.toHolder===null&&p.operation==='return')
     ||exact(e,['kind','role','key','value'])&&e.kind==='state'&&e.role==='vessel'&&(e.key==='contents'&&(brew&&['water',p.operation].includes(e.value as string)||p.operation==='drink'&&e.value==='dirty'||p.operation==='wash'&&e.value==='empty')||e.key==='clean'&&p.operation==='wash'&&e.value==='yes');
    if(!valid)throw Error('日常程序包含不受支援的效果或角色。');
   }
  }
  const terminal=(e:RoutineStep)=>e.kind==='materialize'&&e.role==='productSupply'||e.kind==='consume'&&e.role==='drink'||e.kind==='state'&&(e.value==='tea'||e.value==='coffee'||p.operation==='wash'||p.operation==='drink');
  if((p.effects as RoutineStep[]|undefined)?.some(terminal)||p.stages.some((stage:RoutinePath['stages'][number])=>stage.afterMinutes!==last&&stage.effects.some(terminal)))throw Error('日常完整成果只能在確認完成階段。');
  const steps=[...(Array.isArray(p.effects)?p.effects:[]),...p.stages.flatMap((s:RoutinePath['stages'][number])=>s.effects)] as RoutineStep[];
  const has=(kind:RoutineStep['kind'],role:string,value?:string|null)=>steps.some(e=>e.kind===kind&&e.role===role&&(value===undefined||('value' in e?e.value:'toHolder' in e?e.toHolder:undefined)===value));
  const brew=['tea','coffee'].includes(p.operation as string);
  const index=(kind:RoutineStep['kind'],role:string)=>steps.findIndex(e=>e.kind===kind&&e.role===role);
  if(index('consume','material')>=0&&(index('materialize','materialSupply')<0||index('materialize','materialSupply')>index('consume','material')))throw Error('原料須先取得再消耗。');
  if(brew&&steps.some(e=>e.role==='vessel')&&(index('materialize','vesselSupply')<0||steps.findIndex(e=>e.role==='vessel')<index('materialize','vesselSupply')||index('transfer','vessel')<0))throw Error('杯子須先確認取得再操作。');
  for(const role of ['vesselSupply','materialSupply','productSupply','material','drink'])if(steps.filter(e=>e.role===role&&['materialize','consume'].includes(e.kind)).length>1)throw Error('日常供應或消耗不能重複。');
  for(const batch of [p.effects||[],...p.stages.map((s:RoutinePath['stages'][number])=>s.effects)] as RoutineStep[][]){
   const acquisition=brew&&batch.some(e=>e.kind==='materialize'&&e.role==='vesselSupply')&&batch.some(e=>e.kind==='transfer'&&e.role==='vessel')?1:0;
   if(batch.length-acquisition>adjudicationLimits.maxEffects)throw Error('日常程序無法在既有批次容量內安全重綁。');
  }
  const complete=brew?has('materialize','vesselSupply')&&has('transfer','vessel','actor')&&has('materialize','materialSupply')&&has('consume','material')&&has('state','vessel',p.operation as string)&&has('materialize','productSupply'):
   p.operation==='food'?has('materialize','productSupply'):p.operation==='drink'?has('transfer','vessel','actor')&&has('transfer','drink','actor')&&has('consume','drink')&&has('state','vessel','dirty'):
   p.operation==='wash'?has('transfer','vessel','actor')&&has('state','vessel','empty')&&has('state','vessel','yes'):has('transfer','vessel',null);
  if(requireComplete&&!complete)throw Error('日常程序缺少普通活動所需的物件與成果承接。');
  if(p.stages.length&&last!==Math.ceil(time.minutes/adjudicationLimits.minuteStep)*adjudicationLimits.minuteStep)throw Error('日常程序最後階段與確認時間不一致。');
 }
}

export const routineProgramRules = [
 '舊範圍的模型日常候選 routine.version=2：family、operation、subject、timings 沿日常範圍，另提供 programs，恰好涵蓋 routineOffer.operations 各一次。頂層 accepted、check=null、effects=[]、stages=[]、branches=null、completionMinutes=null；時間唯一來自 timings。version=1 的空效果程序只是舊契約相容，不表示模型確認了效果。',
 `不確定日常program={operation,effects:[],stages:[],check:{difficulty:${adjudicationLimits.difficulties.join("|")},ability},branches}，branches為1至${adjudicationLimits.maxBranches}組{outcomes,effects,stages}，outcomes恰好涵蓋${outcomes.join("/")}各一次，多級可共用；分支內effects是準備。成功須含完整合法成果；部分或失敗可僅消耗/留下water等合法中間成果，空分支仍花確認時間。失敗不生成完整茶或食物。程式用原D20選分支，規則不存骰值。確定program可check=null、branches=null沿effects/stages，或一組全部級別。`,
 `每項確定 program={operation,effects,stages,check:null,branches:null}；此program內的effects是最多${adjudicationLimits.maxEffects}項起始準備（不等於routine=null自由分支的頂層最終成果），完整食物或飲品只能列在最後stages，不能提前產生成品；階段={afterMinutes,effects}，${adjudicationLimits.minuteStep}分鐘遞增，最多${adjudicationLimits.maxStages}階段，最後階段等於該項timing向上對齊${adjudicationLimits.minuteStep}分鐘。只確認有意義時點與既有 materialize/consume/transfer/state 效果，不產生程式、ID、revision、任意patch或新能力；程式綁定當前合法角色並檢查每階段前提。`,
 '符號角色：vessel為本次合法杯子，vesselSupply是確有需要時的合法杯子供應；materialSupply/material為明確原料供應/該份原料，沒有明確原料時為核准背景；productSupply為此次合法成品供應，drink為杯內當前飲品。選用當前物件/供應由程式按權限及短缺處理，規則不保存歷史ID。可選供應未綁定時略過其步驟；transfer到actor已持有時略過；state已是所需值時略過，clean未宣告時略過。這些略過不放寬缺貨、特定杯子、工具、知情或使用權。',
 '效果格式：{kind:materialize,role:vesselSupply|materialSupply|productSupply}；{kind:consume,role:material|drink}；{kind:transfer,role:vessel|drink,toHolder:actor|null}；{kind:state,role:vessel,key:contents|clean,value:字串}。null放下只適用return，不允許第三方、grant、consent或destroy。',
 '確定程序及成功分支：tea/coffee 須明列取得可選原料(materialize materialSupply、consume material)、取得本次杯子(materialize vesselSupply、transfer vessel到actor)、contents轉tea/coffee及materialize productSupply；可明列water準備。完整成品只能在最後階段。drink須拿取vessel及drink、consume drink及contents=dirty同批；wash須拿取vessel、contents=empty及clean=yes（只在有該欄位時）；return須放下vessel；food須materialize productSupply。這些是合法成果的必要承接，時點和有意義階段由模型確認。確定日常不擲骰；不增加每階段或擲骰後呼叫。',
];
