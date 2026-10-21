import type { RoutineOperation } from './routine-rules';
export type RoutineStep = {kind:'materialize';role:'vesselSupply'|'materialSupply'|'productSupply'} | {kind:'consume';role:'material'|'drink'} | {kind:'transfer';role:'vessel'|'drink';toHolder:'actor'|null} | {kind:'state';role:'vessel';key:'contents'|'clean';value:string};
export type RoutineProgram = {operation:RoutineOperation;effects?:RoutineStep[];stages:{afterMinutes:number;effects:RoutineStep[]}[]};
const object=<T extends Record<string,unknown>>(properties:T)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const stagedProgramSchema=object({operation:{type:'string',enum:['tea','coffee','food','drink','wash','return']},stages:{type:'array',minItems:1,maxItems:4,items:object({afterMinutes:{type:'integer',enum:[15,30,45,60,75,90]},effects:{type:'array',minItems:1,maxItems:8,items:{anyOf:[object({kind:{type:'string',const:'materialize'},role:{type:'string',enum:['vesselSupply','materialSupply','productSupply']}}),object({kind:{type:'string',const:'consume'},role:{type:'string',enum:['material','drink']}}),object({kind:{type:'string',const:'transfer'},role:{type:'string',enum:['vessel','drink']},toHolder:{type:['string','null'],enum:['actor',null]}}),object({kind:{type:'string',const:'state'},role:{type:'string',const:'vessel'},key:{type:'string',enum:['contents','clean']},value:{type:'string',maxLength:40}})]}}})}});
export const routineProgramSchema={...stagedProgramSchema,properties:{...stagedProgramSchema.properties,effects:{...stagedProgramSchema.properties.stages.items.properties.effects,minItems:0,maxItems:4}},required:[...stagedProgramSchema.required,'effects']};
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function validateRoutinePrograms(programs:unknown,times:{operation:RoutineOperation;minutes:number}[]):asserts programs is RoutineProgram[]{
 if(!Array.isArray(programs)||programs.length!==times.length||new Set(programs.map(p=>p?.operation)).size!==times.length)throw Error('日常程序須完整涵蓋核准範圍。');
 for(const p of programs){
  const time=times.find(t=>t.operation===p?.operation);if(!time||!(exact(p,['operation','stages'])||exact(p,['operation','effects','stages']))||!Array.isArray(p.stages)||!p.stages.length||p.stages.length>4)throw Error('日常程序格式無效。');
  if(p.stages.some(stage=>!stage||![15,30,45,60,75,90].includes(stage.afterMinutes)))throw Error('日常階段時點無效。');
  let last=-1;
  if(p.effects!==undefined&&(!Array.isArray(p.effects)||p.effects.length>4))throw Error('日常起始效果超出範圍。');
  for(const stage of [...(Array.isArray(p.effects)&&p.effects.length?[{afterMinutes:0,effects:p.effects}]:[]),...p.stages]){
   if(!exact(stage,['afterMinutes','effects'])||typeof stage.afterMinutes!=='number'||![0,15,30,45,60,75,90].includes(stage.afterMinutes)||stage.afterMinutes<=last||!Array.isArray(stage.effects)||!stage.effects.length||stage.effects.length>8)throw Error('日常階段格式無效。');last=stage.afterMinutes;
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
  if((p.effects as RoutineStep[]|undefined)?.some(terminal)||p.stages.some(stage=>stage.afterMinutes!==last&&stage.effects.some(terminal)))throw Error('日常完整成果只能在確認完成階段。');
  const steps=[...(Array.isArray(p.effects)?p.effects:[]),...p.stages.flatMap(s=>s.effects)] as RoutineStep[];
  const has=(kind:RoutineStep['kind'],role:string,value?:string|null)=>steps.some(e=>e.kind===kind&&e.role===role&&(value===undefined||('value' in e?e.value:'toHolder' in e?e.toHolder:undefined)===value));
  const brew=['tea','coffee'].includes(p.operation as string);
  for(const role of ['vesselSupply','materialSupply','productSupply','material','drink'])if(steps.filter(e=>e.role===role&&['materialize','consume'].includes(e.kind)).length>1)throw Error('日常供應或消耗不能重複。');
  for(const batch of [p.effects||[],...p.stages.map(s=>s.effects)] as RoutineStep[][]){
   const acquisition=brew&&batch.some(e=>e.kind==='materialize'&&e.role==='vesselSupply')&&batch.some(e=>e.kind==='transfer'&&e.role==='vessel')?1:0;
   if(batch.length-acquisition>4)throw Error('日常程序無法在既有批次容量內安全重綁。');
  }
  const complete=brew?has('materialize','vesselSupply')&&has('transfer','vessel','actor')&&has('materialize','materialSupply')&&has('consume','material')&&has('state','vessel',p.operation as string)&&has('materialize','productSupply'):
   p.operation==='food'?has('materialize','productSupply'):p.operation==='drink'?has('transfer','vessel','actor')&&has('transfer','drink','actor')&&has('consume','drink')&&has('state','vessel','dirty'):
   p.operation==='wash'?has('transfer','vessel','actor')&&has('state','vessel','empty')&&has('state','vessel','yes'):has('transfer','vessel',null);
  if(!complete)throw Error('日常程序缺少普通活動所需的物件與成果承接。');
  if(last!==Math.ceil(time.minutes/15)*15)throw Error('日常程序最後階段與確認時間不一致。');
 }
}

export const routineProgramRules = [
 '新日常核准使用 routine.version=2：family、operation、subject、timings 沿日常範圍，另提供 programs，恰好涵蓋 routineOffer.operations 各一次。頂層 accepted、check=null、effects=[]、stages=[]、branches=null、completionMinutes=null；時間唯一來自 timings。version=1 的空效果程序只是舊契約相容，不表示模型確認了效果。',
 '每項 program={operation,effects,stages}；此program內的effects是最多4項起始準備（不等於routine=null自由分支的頂層最終成果），完整食物或飲品只能列在最後stages，不能提前產生成品；階段={afterMinutes,effects}，15分鐘遞增，最多4階段，最後階段等於該項timing向上對齊15分鐘。只確認有意義時點與既有 materialize/consume/transfer/state 效果，不產生程式、ID、revision、任意patch或新能力；程式綁定當前合法角色並檢查每階段前提。',
 '符號角色：vessel為本次合法杯子，vesselSupply是確有需要時的合法杯子供應；materialSupply/material為明確原料供應/該份原料，沒有明確原料時為核准背景；productSupply為此次合法成品供應，drink為杯內當前飲品。選用當前物件/供應由程式按權限及短缺處理，規則不保存歷史ID。可選供應未綁定時略過其步驟；transfer到actor已持有時略過；state已是所需值時略過，clean未宣告時略過。這些略過不放寬缺貨、特定杯子、工具、知情或使用權。',
 '效果格式：{kind:materialize,role:vesselSupply|materialSupply|productSupply}；{kind:consume,role:material|drink}；{kind:transfer,role:vessel|drink,toHolder:actor|null}；{kind:state,role:vessel,key:contents|clean,value:字串}。null放下只適用return，不允許第三方、grant、consent或destroy。',
 'tea/coffee 程序須明列取得可選原料(materialize materialSupply、consume material)、取得本次杯子(materialize vesselSupply、transfer vessel到actor)、contents轉tea/coffee及materialize productSupply；可明列water準備。完整成品只能在最後階段。drink須拿取vessel及drink、consume drink及contents=dirty同批；wash須拿取vessel、contents=empty及clean=yes（只在有該欄位時）；return須放下vessel；food須materialize productSupply。這些是合法成果的必要承接，時點和有意義階段由模型確認。確定日常不擲骰；不增加每階段或擲骰後呼叫。',
];
