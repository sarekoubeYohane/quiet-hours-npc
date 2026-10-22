import { adjudicationLimits, stateChangeLimits } from './adjudication-limits';
import { quantitySchema, validQuantity, type Quantity } from './world-formation-contract';
import { assertBoundedState, parseEffectCandidate, parseStateCondition } from './adjudication-contract';
import type { Effect, ActivityPhase, ResultBranch } from './world-effects';
import type { StateCondition } from './world-state';
import type { Difficulty } from './d20';

export const routineWorldLimits={maxPrograms:8,maxBindings:8,maxMethods:8,maxStoredMethods:9,maxMethodLength:512,maxCandidateBytes:32768,maxOutputTokens:12000} as const;
export type RoutineMethod={content:string;purpose:string};
export type RoutineBackground={label:string;kind:string;consumable:boolean;quantity:Quantity;initialState:{key:string;value:string;exposure:'public'|'hidden'}[]};
export type RoutineBinding={role:string;type:'object'|'supply'|'body'|'environment';select:'target'|'local'|'actor'|'here'|'linked';kind:string|null;label:string|null;state:{key:string;value:string|null}[];access:'authorized'|'physical';link:{role:string;key:string}|null;background:RoutineBackground|null;quantity:Quantity|null;sourceRole:'material'|'equipment'|null;sourceSubject:string|null};
export type RoutineWorldProgram={operation:string;methods:RoutineMethod[];bindings:RoutineBinding[];effects:Effect[];stages:ActivityPhase[];check:{difficulty:Difficulty;ability:string}|null;branches:ResultBranch[]|null};
export type RoutineWorldApproval={family:'cafe-service';version:3;operation:string;subject:string|null;timings:{operation:string;minutes:number}[];programs:RoutineWorldProgram[]};
const object=(properties:Record<string,object>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const text=(maxLength:number)=>({type:'string',minLength:1,maxLength});
const nullable=(schema:object)=>({anyOf:[{type:'null'},schema]});
const stateEntry=object({key:text(stateChangeLimits.maxKeyLength),value:nullable({type:'string',maxLength:stateChangeLimits.maxValueLength})});
const initialStateEntry=object({key:text(stateChangeLimits.maxKeyLength),value:{type:'string',maxLength:stateChangeLimits.maxValueLength},exposure:{type:'string',enum:['public','hidden']}});
const symbolicEffect={$ref:'#/$defs/routineEffect'};
const symbolicCondition={$ref:'#/$defs/routineCondition'};
const stage=object({afterMinutes:{type:'integer',enum:[...adjudicationLimits.phaseMinutes]},preconditions:{type:'array',maxItems:adjudicationLimits.maxConditions,items:symbolicCondition},effects:{type:'array',maxItems:adjudicationLimits.maxEffects,items:symbolicEffect}});
const path={effects:{type:'array',maxItems:0,items:symbolicEffect},stages:{type:'array',minItems:1,maxItems:adjudicationLimits.maxStages,items:stage}};
export const routineWorldProgramSchema=object({operation:text(60),methods:{type:'array',minItems:1,maxItems:routineWorldLimits.maxMethods,items:object({content:text(routineWorldLimits.maxMethodLength),purpose:text(120)})},bindings:{type:'array',minItems:1,maxItems:routineWorldLimits.maxBindings,items:object({role:text(40),type:{type:'string',enum:['object','supply','body','environment']},select:{type:'string',enum:['target','local','actor','here','linked']},kind:nullable(text(stateChangeLimits.maxKindLength)),label:nullable(text(120)),state:{type:'array',maxItems:stateChangeLimits.maxChanges,items:stateEntry},access:{type:'string',enum:['authorized','physical']},link:nullable(object({role:text(40),key:text(stateChangeLimits.maxKeyLength)})),background:nullable(object({label:text(120),kind:text(stateChangeLimits.maxKindLength),consumable:{type:'boolean'},quantity:quantitySchema,initialState:{type:'array',maxItems:stateChangeLimits.maxEntries,items:initialStateEntry}})),quantity:nullable(quantitySchema),sourceRole:{type:['string','null'],enum:['material','equipment',null]},sourceSubject:nullable(text(60))})},...path,stages:{...path.stages,minItems:0},check:nullable(object({difficulty:{type:'integer',enum:[...adjudicationLimits.difficulties]},ability:text(adjudicationLimits.maxValueLength)})),branches:nullable({type:'array',minItems:1,maxItems:adjudicationLimits.maxBranches,items:object({outcomes:{type:'array',minItems:1,maxItems:adjudicationLimits.maxBranches,items:{type:'string',enum:[...adjudicationLimits.outcomes]}},...path})})});
// The wire placeholder is never an execution revision or permission. Only the
// trusted binder replaces it after resolving the current authority snapshot.
export function symbolicEffectSchema(schema:unknown):unknown {
 if(Array.isArray(schema))return schema.map(symbolicEffectSchema);
 if(!schema||typeof schema!=='object')return schema;
 return Object.fromEntries(Object.entries(schema).map(([key,value])=>[key,key==='expectedRevision'||key==='expectedRemaining'?{type:'integer',const:0}:['objectId','supplyId','targetId','outputId','id'].includes(key)?{type:'string',pattern:'^\\$[a-z][a-z0-9-]{0,39}$',minLength:2,maxLength:41}:key==='toHolder'?{anyOf:[{type:'null'},{type:'string',pattern:'^\\$[a-z][a-z0-9-]{0,39}$'}]}:symbolicEffectSchema(value)]));
}
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const bounded=(value:unknown,max:number):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=max;
export const normalizeRoutineMethod=(value:string)=>value.trim().replace(/[。！!\s]+$/u,'');
export function checkRoutineMethod(method:RoutineMethod,action:{content?:string;purpose?:string}):{wording:boolean;purpose:boolean} {
 const wording=normalizeRoutineMethod(action.content||'')===normalizeRoutineMethod(method.content);
 // Preserve the matching predicate's short circuit. A false wording means the
 // purpose comparison did not run; diagnostic callers must label it accordingly.
 const purpose=wording&&(action.purpose||'').trim()===method.purpose.trim();
 return {wording,purpose};
}
export function matchesRoutineMethod(method:RoutineMethod,action:{content?:string;purpose?:string}):boolean {
 const {wording,purpose}=checkRoutineMethod(method,action);return wording&&purpose;
}
const symbol=(value:unknown):value is string=>typeof value==='string'&&/^\$[a-z][a-z0-9-]{0,39}$/u.test(value);
function normalizeExecutionPlaceholders(value:unknown):unknown {
 if(Array.isArray(value))return value.map(normalizeExecutionPlaceholders);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,key==='expectedRevision'||key==='expectedRemaining'?1:normalizeExecutionPlaceholders(entry)]));
}
export function validateRoutineWorldPrograms(programs:unknown,timings:{operation:string;minutes:number}[]):asserts programs is RoutineWorldProgram[]{
 if(!Array.isArray(programs)||!programs.length||programs.length>routineWorldLimits.maxPrograms||programs.length!==timings.length||new Set(programs.map(program=>program?.operation)).size!==programs.length)throw Error('通用日常程序須完整涵蓋確認範圍。');
 for(const program of programs){
  if(!exact(program,['operation','methods','bindings','effects','stages','check','branches'])||!bounded(program.operation,60)||!timings.some(time=>time.operation===program.operation)||!Array.isArray(program.methods)||!program.methods.length||program.methods.length>routineWorldLimits.maxMethods||program.methods.some(method=>!exact(method,['content','purpose'])||!bounded(method.content,routineWorldLimits.maxMethodLength)||!bounded(method.purpose,120))||!Array.isArray(program.bindings)||!program.bindings.length||program.bindings.length>routineWorldLimits.maxBindings||!Array.isArray(program.effects)||program.effects.length)throw Error('通用日常程序格式無效。');
  const roles=new Map<string,RoutineBinding>();
  for(const binding of program.bindings){
   const base=['role','type','select','kind','label','state','access','link','background','quantity','sourceRole','sourceSubject'];
   if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).some(key=>![...base,'quantity','sourceRole'].includes(key))||base.some(key=>!Object.hasOwn(binding,key))||!bounded(binding.role,40)||!symbol('$'+binding.role)||['actor','here'].includes(binding.role)||roles.has(binding.role)||!['object','supply','body','environment'].includes(binding.type)||!['target','local','actor','here','linked'].includes(binding.select)||!['authorized','physical'].includes(binding.access)||binding.kind!==null&&!bounded(binding.kind,stateChangeLimits.maxKindLength)||binding.label!==null&&!bounded(binding.label,120)||!Array.isArray(binding.state)||binding.state.length>stateChangeLimits.maxChanges||binding.quantity!=null&&!validQuantity(binding.quantity)||binding.sourceRole!=null&&!['material','equipment'].includes(binding.sourceRole)||binding.sourceSubject!==null&&!bounded(binding.sourceSubject,60)||binding.sourceRole==='material'&&!bounded(binding.sourceSubject,60))throw Error('通用日常角色格式無效。');
   if(binding.state.some((entry:{key:string;value:unknown})=>entry.key==='vessel'&&(!symbol(entry.value)||!roles.has(entry.value.slice(1))&&!['$actor','$here'].includes(entry.value))))throw Error('日常容器條件必須引用角色。');
   if(binding.state.length)parseStateCondition({kind:'state-condition',version:1,target:{type:binding.type==='supply'?'object':binding.type,id:'$'+binding.role},state:binding.state});
   if(binding.link!==null&&(!exact(binding.link,['role','key'])||!roles.has(binding.link.role as string)||!bounded(binding.link.key,stateChangeLimits.maxKeyLength)))throw Error('日常關聯角色尚未宣告。');
   if(binding.select==='linked'&&!binding.link||binding.select!=='linked'&&binding.link||binding.select==='actor'&&binding.type!=='body'||binding.select==='here'&&binding.type!=='environment'||binding.type==='environment'&&binding.select!=='here'||binding.type==='supply'&&!['local','target'].includes(binding.select)||!['object','supply'].includes(binding.type)&&binding.background!==null)throw Error('日常角色選擇與種類矛盾。');
   if(binding.background!==null){
    const bg=binding.background;
    if(!['object','supply'].includes(binding.type)||binding.access!=='authorized'||!binding.sourceRole||!exact(bg,['label','kind','consumable','quantity','initialState'])||!bounded(bg.label,120)||!bounded(bg.kind,stateChangeLimits.maxKindLength)||typeof bg.consumable!=='boolean'||!validQuantity(bg.quantity)||!Array.isArray(bg.initialState)||bg.initialState.length>stateChangeLimits.maxEntries||bg.initialState.some(entry=>!exact(entry,['key','value','exposure'])||!['public','hidden'].includes(entry.exposure as string))||new Set(bg.initialState.map(entry=>entry.key)).size!==bg.initialState.length)throw Error('日常背景供應確認格式無效。');
    assertBoundedState(Object.fromEntries(bg.initialState.map(entry=>[entry.key,entry.value])));
    if(bg.initialState.some(entry=>entry.key==='vessel'&&(!symbol(entry.value)||!roles.has(entry.value.slice(1)))))throw Error('背景容器關聯必須引用先前角色。');
   }
   roles.set(binding.role,binding as RoutineBinding);
  }
  const paths=program.branches===null?[{outcomes:[...adjudicationLimits.outcomes],effects:program.effects,stages:program.stages}]:program.branches;
  if(!Array.isArray(paths)||!paths.length||paths.length>adjudicationLimits.maxBranches||program.branches!==null&&(!Array.isArray(program.stages)||program.stages.length)||program.check!==null&&(!exact(program.check,['difficulty','ability'])||!(adjudicationLimits.difficulties as readonly number[]).includes(program.check.difficulty as number)||!bounded(program.check.ability,adjudicationLimits.maxValueLength)))throw Error('通用日常結果分支無效。');
  const seen:string[]=[];
  for(const branch of paths){
   if(!exact(branch,['outcomes','effects','stages'])||!Array.isArray(branch.outcomes)||!branch.outcomes.length||branch.outcomes.some(outcome=>!(adjudicationLimits.outcomes as readonly unknown[]).includes(outcome))||!Array.isArray(branch.effects)||branch.effects.length||!Array.isArray(branch.stages)||!branch.stages.length||branch.stages.length>adjudicationLimits.maxStages)throw Error('通用日常分支路徑無效。');
   seen.push(...branch.outcomes as string[]);const declared=new Set([...roles.keys(),...program.bindings.filter(binding=>binding.type==='supply').map(binding=>binding.role+'-object'),...program.bindings.filter(binding=>binding.type==='object'&&binding.background).map(binding=>binding.role+'-supply'),'actor','here']);let last=0;
   for(const phase of branch.stages){
    if(!exact(phase,['afterMinutes','preconditions','effects'])||!(adjudicationLimits.phaseMinutes as readonly unknown[]).includes(phase.afterMinutes)||(phase.afterMinutes as number)<=last||!Array.isArray(phase.preconditions)||phase.preconditions.length>adjudicationLimits.maxConditions||!Array.isArray(phase.effects)||phase.effects.length>adjudicationLimits.maxEffects)throw Error('通用日常階段格式無效。');last=phase.afterMinutes as number;
    for(const condition of phase.preconditions)parseStateCondition(condition);
    for(const effect of phase.effects){
     // Outputs become declared only in their own stage, never earlier history.
     const e=effect as Effect;
     if(e.kind==='grant'||e.kind==='consent')throw Error('日常程序不能替其他角色作新選擇。');
     const refs:string[]=[];
     const walk=(value:unknown,key='')=>{if(Array.isArray(value)){value.forEach(item=>walk(item,key));return;}if(value&&typeof value==='object'){const entry=value as Record<string,unknown>;if(entry.key==='vessel'&&(typeof entry.value!=='string'||!symbol(entry.value)||entry.from!==undefined&&entry.from!==null&&!symbol(entry.from)))throw Error('容器關聯須使用當前角色，不能保存歷史身份。');for(const [name,item] of Object.entries(value))walk(item,name);return;}if(typeof value==='string'&&['objectId','supplyId','targetId','outputId','id','toHolder'].includes(key)&&!symbol(value))throw Error('日常程序必須使用角色引用，不保存歷史物件ID。');if(typeof value==='string'&&symbol(value))refs.push(value.slice(1));if((key==='expectedRevision'||key==='expectedRemaining')&&value!==0)throw Error('日常程序不能保存歷史版本。');};
     if(e.kind==='form'){for(const output of e.outputs){if(!symbol(output.id)||declared.has(output.id.slice(1)))throw Error('日常形成須宣告新的成果角色。');declared.add(output.id.slice(1));}}
     if(e.kind==='separate'){if(!symbol(e.outputId)||declared.has(e.outputId.slice(1)))throw Error('日常細分須宣告新的成果角色。');declared.add(e.outputId.slice(1));}
     walk(e);if(refs.some(role=>!declared.has(role)))throw Error('通用日常引用未宣告角色。');
     parseEffectCandidate(JSON.stringify({status:'accepted',effects:[normalizeExecutionPlaceholders(e)],check:null}));
    }
    for(const condition of phase.preconditions as StateCondition[])if(!symbol(condition.target.id)||!declared.has(condition.target.id.slice(1))||condition.state.some(entry=>entry.key==='vessel'&&entry.value!==null&&(!symbol(entry.value)||!declared.has(entry.value.slice(1))))||condition.guard?.holder.check&&condition.guard.holder.value!==null&&(!symbol(condition.guard.holder.value)||!declared.has(condition.guard.holder.value.slice(1))))throw Error('日常條件引用未宣告角色。');
   }
   const minutes=timings.find(time=>time.operation===program.operation)!.minutes;
   if(last!==Math.ceil(minutes/adjudicationLimits.minuteStep)*adjudicationLimits.minuteStep)throw Error('通用日常最後階段與確認時間矛盾。');
  }
  if(seen.length!==adjudicationLimits.outcomes.length||new Set(seen).size!==adjudicationLimits.outcomes.length||program.check===null&&paths.length!==1||program.branches===null&&program.check!==null)throw Error('通用日常須唯一涵蓋五段結果。');
 }
}
export const routineWorldRules=[
 '新通用日常使用routine.version=3：programs明示methods[{content,purpose}]、bindings與stages/check/branches。effects必須空，效果放15分鐘以上階段；已確認的原長提案會可靠保存為該方法，後續當前對象不同仍重新綁定，不重問。v1/v2保留舊原義，不冒稱曾確認新後果。',
 'bindings宣告role/type(object|supply|body|environment)/select(target|local|actor|here|linked)/kind與label(null或必要篩選)/state必要subset/access/link/background/quantity/sourceRole/sourceSubject。material須明示來源主題（如茶葉、蛋糕），食物同kind不代表同類，已知label／material／category符合該來源主題者優先；target是本次指定對象，不能找不到便替換；local限可知本地；linked按link.role/key連到既有物件。actor/here為系統角色。supply背景須明示來源用途material或equipment及label/kind/consumable/quantity/initialState逐key exposure，已知有限供應及指定物件優先，不用改名避開缺貨。',
 'program的效果沿本次相同封閉世界effect能力，所有物件/供應/身體引用與environment target使用$role；移動目的區域或guard.region可用既有地圖固定ID（仍驗可達），或$here；expectedRevision與expectedRemaining一律0佔位，程式在當前前提成立後綁定。form/separate新output用新$role，程式每活動產生fresh ID；state.vessel可引用$vessel，杯不作原料。保留每個外在effect與形成state的明示exposure，不把reason/hidden線索告知NPC。',
 'routineOffer.genericMethods允許同受限角色/場所的新明示方法ID（不是handler），例如擦桌面；若operation是原offered-family項目仍完整確認該組timings/programs。新method-only只確認自己的完整範圍。角色意願/記憶/信念不由世界程序改寫；physical不是同意，grant/consent仍由本人選擇。',
];
