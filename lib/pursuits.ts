import type { Character, Intent, World } from './world';
import { memoryBytes, MemoryValidationError } from './memory';

export const pursuitLimits = { nodes:12, edges:16, depth:4, updates:4, stateBytes:12*1024, updateBytes:4*1024, trace:24, traceBytes:16*1024 } as const;
export type PursuitReference={kind:'short'|'long'|'belief'|'relationship';id:string;version:number};
export type PursuitParent={id:string;version:number};
export type PursuitFields={version:number;kind:'direction'|'intent'|'task';scope:string;satisfaction:string|null;parents:PursuitParent[];references:PursuitReference[];status:'active'|'dropped';reason:string};
export type PursuitTrace={id:string;time:number;operation:string;reason:string;before?:Intent;after?:Intent};
export type PursuitUpdate={operation:'upsert'|'drop';id:string;version:number;node:Omit<Intent,keyof PursuitFields>&Pick<PursuitFields,'kind'|'scope'|'satisfaction'|'parents'>|null;references:PursuitReference[];reason:string};
const text=(value:unknown,max:number,nonempty=false):value is string=>typeof value==='string'&&value.length<=max&&(!nonempty||!!value.trim());
const fields=(value:unknown,keys:string[])=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
function fail(message:string):never{throw new MemoryValidationError(message);}
export function initialDirection(c:Character):Intent{return {id:`${c.id}:direction`,content:c.goal,intensity:'medium',importance:'medium',urgency:'low',context:'',version:1,kind:'direction',scope:c.goal,satisfaction:null,parents:[],references:[],status:'active',reason:'角色設定提供的初始方向'};}
export function currentDirections(c:Character){return (c.intents||[]).filter(i=>i.kind==='direction'&&i.status==='active').map(i=>i.content).join('；');}


const level={type:'string',enum:['low','medium','high']};
const parentSchema={type:'object',properties:{id:{type:'string',minLength:1,maxLength:64},version:{type:'integer',minimum:0}},required:['id','version'],additionalProperties:false};
export const pursuitNodeSchema={type:'object',properties:{id:{type:'string',minLength:1,maxLength:64},content:{type:'string',minLength:1,maxLength:200},intensity:level,importance:level,urgency:level,context:{type:'string',maxLength:160},kind:{type:'string',enum:['direction','intent','task']},scope:{type:'string',minLength:1,maxLength:200},satisfaction:{type:['string','null'],maxLength:160},parents:{type:'array',maxItems:1,items:parentSchema}},required:['id','content','intensity','importance','urgency','context','kind','scope','satisfaction','parents'],additionalProperties:false};
export const pursuitUpdatesSchema={type:'array',maxItems:pursuitLimits.updates,items:{type:'object',properties:{operation:{type:'string',enum:['upsert','drop']},id:{type:'string',minLength:1,maxLength:64},version:{type:'integer',minimum:0},node:{anyOf:[pursuitNodeSchema,{type:'null'}]},references:{type:'array',maxItems:4,items:{type:'object',properties:{kind:{type:'string',enum:['short','long','belief','relationship']},id:{type:'string',minLength:1,maxLength:128},version:{type:'integer',minimum:1}},required:['kind','id','version'],additionalProperties:false}},reason:{type:'string',minLength:1,maxLength:160}},required:['operation','id','version','node','references','reason'],additionalProperties:false}};
export const pursuitPrompt='本版 npc-decision.v3 使用唯一 self.intents 分層追求，不回傳舊 intents 完整陣列。pursuitContext 原樣回傳本次輸入值。pursuitUpdates 是明示增量，空陣列或未提及均保留；不得靠漏寫放下。每項 operation=upsert 或 drop、id、version（新=0，舊=本次版本）、node、references、reason。upsert.node 含 id、content、intensity/importance/urgency（low/medium/high）、context（自己的簡短背景）、kind（direction/intent/task）、scope（願意承接到哪個程度）、satisfaction（本人認為什麼算夠，可null開放）、parents（上層id/version，新上層version=0）；drop.node=null。id 以自己id加冒號開頭。direction 可新增、改寫或放下，依現行保存方向判斷，不重設為初始goal。新想法無歷史可用references=[]，否則只引用本次實際可見short/long/belief/relationship的id/version。reason 是短變更理由，不要求長篇心理過程。先只支援單一上層，不支援有下層或活動關聯的複雜退出，須先合法處置。focusIntentId 指本次唯一活動焦點的有效追求id，無焦點用null；methodAssessment.intentIds 與焦點一致，沒有則[]。一個行動不自動結束追求，也不產生另一份進度。追求更新和原心理更新合計最多4項／8KiB，追求更新本身最多4KiB；共用全角色每人12節點而非各層12個。';

export function updatePursuits(w:World,c:Character,value:unknown,visible:Character){
 if(value===undefined)value=[];
 if(!Array.isArray(value)||value.length>pursuitLimits.updates||memoryBytes(value)>pursuitLimits.updateBytes)fail('追求更新容量無效');
 const updates=value as PursuitUpdate[],next=structuredClone(c.intents||[]),seen=new Set<string>(),trace:PursuitTrace[]=[];
 for(const item of updates){
  if(!fields(item,['operation','id','version','node','references','reason'])||!['upsert','drop'].includes(item.operation)||!text(item.id,64,true)||!item.id.startsWith(c.id+':')||seen.has(item.id)||!Number.isSafeInteger(item.version)||item.version<0||!text(item.reason,160,true)||!Array.isArray(item.references)||item.references.length>4)fail('追求候選格式無效');
  seen.add(item.id);const old=c.intents?.find(i=>i.id===item.id);
  if(old?old.version!==item.version||old.status!=='active':item.version!==0||item.operation!=='upsert')fail('追求身份或版本失效');
  for(const ref of item.references){
   const sources=ref.kind==='short'?visible.shortTerm:ref.kind==='long'?visible.longTerm:ref.kind==='belief'?visible.cognition?.beliefs:ref.kind==='relationship'?visible.cognition?.relationshipTags:[];
   if(!fields(ref,['kind','id','version'])||!text(ref.id,128,true)||!Number.isSafeInteger(ref.version)||ref.version<1||!sources?.some(s=>s.id===ref.id&&s.version===ref.version&&s.characterId===c.id))fail('追求來源不屬於當次本人可見版本');
  }
  if(item.operation==='drop'){
   if(item.node!==null||!old||next.some(i=>i.status==='active'&&i.parents?.some(p=>p.id===old.id))||c.plan&&c.plan.pursuitIds?.includes(old.id)||c.pausedActivity?.plan.pursuitIds?.includes(old.id))fail('追求退出需先明示處置下層與活動');
   const ended:Intent={...old,version:item.version+1,status:'dropped',reason:item.reason};
   next[next.findIndex(i=>i.id===item.id)]=ended;
   trace.push({id:item.id,time:w.minute,operation:'drop',reason:item.reason,before:old,after:ended});continue;
  }
  const n=item.node;
  if(!n||!fields(n,pursuitNodeSchema.required)||n.id!==item.id||!text(n.content,200,true)||!text(n.context,160)||!text(n.scope,200,true)||n.satisfaction!==null&&!text(n.satisfaction,160)||!['direction','intent','task'].includes(n.kind)||!['intensity','importance','urgency'].every(k=>['low','medium','high'].includes(n[k as 'intensity']))||!Array.isArray(n.parents)||n.parents.length>1)fail('追求節點格式或上層容量無效');
  if(old&&next.some(i=>i.status==='active'&&i.parents?.some(p=>p.id===old.id))&&(old.scope!==n.scope||old.satisfaction!==n.satisfaction||old.content!==n.content||old.kind!==n.kind))fail('追求範圍改變需先明示處置下層');
  const updated:Intent={...(n as NonNullable<PursuitUpdate['node']>),version:item.version+1,references:item.references,status:'active' as const,reason:item.reason};
  const index=next.findIndex(i=>i.id===item.id);if(index<0)next.push(updated);else next[index]=updated;
  trace.push({id:item.id,time:w.minute,operation:'upsert',reason:item.reason,...(old?{before:old}:{}),after:updated});
 }
 for(const node of next.filter(i=>i.status==='active')){
  for(const parent of node.parents||[]){
   if(!fields(parent,['id','version'])||!text(parent.id,64,true)||parent.id===node.id||!Number.isSafeInteger(parent.version))fail('追求關係無效');
   const original=c.intents?.find(i=>i.id===parent.id),endpoint=next.find(i=>i.id===parent.id);
   if(!endpoint||endpoint.status!=='active'||!parent.id.startsWith(c.id+':'))fail('追求上層不存在');
   if(seen.has(node.id)&&(original?original.version!==parent.version:parent.version!==0))fail('追求上層版本失效');
  }
 }
 const visit=(id:string,path:string[]):number=>{if(path.includes(id))return fail('追求關係循環');const node=next.find(i=>i.id===id)!;return 1+Math.max(0,...(node.parents||[]).map(p=>visit(p.id,[...path,id])));};
 for(const node of next)for(const parent of node.parents||[]){const endpoint=next.find(i=>i.id===parent.id);if(endpoint?.version)parent.version=endpoint.version;}
 if(next.length>pursuitLimits.nodes||next.reduce((n,i)=>n+(i.parents?.length||0),0)>pursuitLimits.edges||next.some(i=>visit(i.id,[])>pursuitLimits.depth)||memoryBytes(next)>pursuitLimits.stateBytes)fail('追求狀態超過容量');
 const history=[...(c.pursuitTrace||[]),...trace];let dropped=c.pursuitTraceDropped||0;
 while(history.length>pursuitLimits.trace||memoryBytes(history)>pursuitLimits.traceBytes){history.shift();dropped++;}
 return {intents:next,pursuitTrace:history,pursuitTraceDropped:dropped};
}
