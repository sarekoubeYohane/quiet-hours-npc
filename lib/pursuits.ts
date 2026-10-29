import type { Character, Intent, World } from './world';
import { memoryBytes, MemoryValidationError } from './memory';

export const pursuitLimits = { nodes:12, edges:16, depth:4, updates:4, stateBytes:12*1024, updateBytes:4*1024, trace:24, traceBytes:16*1024 } as const;
export type PursuitReference={kind:'short'|'long'|'belief'|'relationship';id:string;version:number};
export type PursuitParent={id:string;version:number;order?:number};
export type PursuitProgress='ready'|'waiting'|'deferred'|'blocked'|'enough';
export type PursuitAssessment={kind:'subjective'|'known-result';text:string;references:PursuitReference[];time:number};
export type PursuitFields={version:number;kind:'direction'|'intent'|'task';scope:string;satisfaction:string|null;parents:PursuitParent[];references:PursuitReference[];status:'active'|'satisfied'|'dropped';reason:string;progress?:PursuitProgress;assessment?:PursuitAssessment};
export type PursuitTrace={id:string;time:number;operation:string;reason:string;before?:Intent;after?:Intent};
export type PursuitExit={id:string;version:number;endedVersion:number;status:'satisfied'|'dropped'};
type PursuitNode=Omit<Intent,keyof PursuitFields>&Pick<PursuitFields,'kind'|'scope'|'satisfaction'|'parents'>;
type PursuitOrder={scope:'roots'|'children';members:{id:string;version:number}[]};
type PursuitEvaluation={status:'active'|'satisfied';progress:PursuitProgress;basis:{kind:PursuitAssessment['kind'];text:string}};
export type PursuitUpdate={operation:'upsert'|'drop'|'reorder'|'assess';id:string;version:number;node:PursuitNode|PursuitOrder|PursuitEvaluation|null;references:PursuitReference[];reason:string};
const text=(value:unknown,max:number,nonempty=false):value is string=>typeof value==='string'&&value.length<=max&&(!nonempty||!!value.trim());
const fields=(value:unknown,keys:string[])=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
function fail(message:string):never{throw new MemoryValidationError(message);}
export function initialDirection(c:Character):Intent{return {id:`${c.id}:direction`,content:c.goal,intensity:'medium',importance:'medium',urgency:'low',context:'',version:1,kind:'direction',scope:c.goal,satisfaction:null,parents:[],references:[],status:'active',reason:'角色設定提供的初始方向'};}
export function currentDirections(c:Character){return (c.intents||[]).filter(i=>i.kind==='direction'&&i.status==='active').map(i=>i.content).join('；');}
export function orderedPursuits(nodes:Intent[],parentId:string|null){
 const items=nodes.filter(node=>node.status==='active'&&(parentId===null?!node.parents?.length:node.parents?.some(parent=>parent.id===parentId)));
 return parentId===null?items:items.sort((a,b)=>(a.parents?.find(p=>p.id===parentId)?.order??nodes.indexOf(a))-(b.parents?.find(p=>p.id===parentId)?.order??nodes.indexOf(b)));
}

function applyPursuitOrder(c:Character,next:Intent[],item:PursuitUpdate,visible:Character,trace:PursuitTrace[],time:number){
 const order=item.node as PursuitOrder;
 if(!order||!fields(order,['scope','members'])||!['roots','children'].includes(order.scope)||!Array.isArray(order.members)||!order.members.length||order.members.length>pursuitLimits.nodes||new Set(order.members.map(member=>member.id)).size!==order.members.length)fail('追求重排範圍無效');
 const parentId=order.scope==='roots'?null:item.id;
 if(parentId===null){if(item.id!==`${c.id}:roots`||item.version!==0)fail('追求根重排範圍無效');}
 else {
  const original=c.intents?.find(node=>node.id===parentId);
  if(!next.some(node=>node.id===parentId&&node.status==='active')||(original?.version??0)!==item.version||original&&!visible.intents?.some(node=>node.id===parentId))fail('追求重排上層版本失效');
 }
 const siblings=orderedPursuits(next,parentId);
 if(siblings.some(node=>c.intents?.some(original=>original.id===node.id)&&!visible.intents?.some(shown=>shown.id===node.id)))fail('追求重排範圍未完整展示');
 for(const member of order.members){
  if(!fields(member,['id','version'])||!text(member.id,64,true)||!member.id.startsWith(c.id+':')||!Number.isSafeInteger(member.version)||member.version<0||!siblings.some(node=>node.id===member.id)||(c.intents?.find(node=>node.id===member.id)?.version??0)!==member.version)fail('追求重排項目或版本失效');
 }
 const selected=new Set(order.members.map(member=>member.id)),slots=siblings.map((node,index)=>selected.has(node.id)?index:-1).filter(index=>index>=0),ordered=[...siblings];
 for(let index=0;index<slots.length;index++)ordered[slots[index]]=siblings.find(node=>node.id===order.members[index].id)!;
 const ranks=siblings.map(node=>parentId===null?next.indexOf(node):node.parents!.find(parent=>parent.id===parentId)!.order??next.indexOf(node));
 const before=new Map(order.members.map(member=>[member.id,structuredClone(siblings.find(node=>node.id===member.id)!)]));
 if(parentId===null){for(let index=0;index<ordered.length;index++)next[ranks[index]]=ordered[index];}
 else for(let index=0;index<ordered.length;index++)if(selected.has(ordered[index].id))ordered[index].parents!.find(parent=>parent.id===parentId)!.order=ranks[index];
 for(let index=0;index<ordered.length;index++)if(selected.has(ordered[index].id)&&siblings[index].id!==ordered[index].id){const node=ordered[index];node.version=(node.version||0)+1;trace.push({id:node.id,time,operation:'reorder',reason:item.reason,before:before.get(node.id),after:node});}
}


const level={type:'string',enum:['low','medium','high']};
const parentSchema={type:'object',properties:{id:{type:'string',minLength:1,maxLength:64},version:{type:'integer',minimum:0}},required:['id','version'],additionalProperties:false};
export const pursuitNodeSchema={type:'object',properties:{id:{type:'string',minLength:1,maxLength:64},content:{type:'string',minLength:1,maxLength:200},intensity:level,importance:level,urgency:level,context:{type:'string',maxLength:160},kind:{type:'string',enum:['direction','intent','task']},scope:{type:'string',minLength:1,maxLength:200},satisfaction:{type:['string','null'],maxLength:160},parents:{type:'array',maxItems:pursuitLimits.nodes-1,items:parentSchema}},required:['id','content','intensity','importance','urgency','context','kind','scope','satisfaction','parents'],additionalProperties:false};
const pursuitOrderSchema={type:'object',properties:{scope:{type:'string',enum:['roots','children']},members:{type:'array',minItems:1,maxItems:pursuitLimits.nodes,items:parentSchema}},required:['scope','members'],additionalProperties:false};
const pursuitEvaluationSchema={type:'object',properties:{status:{type:'string',enum:['active','satisfied']},progress:{type:'string',enum:['ready','waiting','deferred','blocked','enough']},basis:{type:'object',properties:{kind:{type:'string',enum:['subjective','known-result']},text:{type:'string',minLength:1,maxLength:160}},required:['kind','text'],additionalProperties:false}},required:['status','progress','basis'],additionalProperties:false};
export const pursuitUpdatesSchema={type:'array',maxItems:pursuitLimits.updates,items:{type:'object',properties:{operation:{type:'string',enum:['upsert','drop','reorder','assess']},id:{type:'string',minLength:1,maxLength:64},version:{type:'integer',minimum:0},node:{anyOf:[pursuitNodeSchema,pursuitOrderSchema,pursuitEvaluationSchema,{type:'null'}]},references:{type:'array',maxItems:4,items:{type:'object',properties:{kind:{type:'string',enum:['short','long','belief','relationship']},id:{type:'string',minLength:1,maxLength:128},version:{type:'integer',minimum:1}},required:['kind','id','version'],additionalProperties:false}},reason:{type:'string',minLength:1,maxLength:160}},required:['operation','id','version','node','references','reason'],additionalProperties:false}};
export const pursuitPrompt='同一id在同次可各有一項upsert和assess，兩者都用當次原version（新=0），先套範圍再評估；每項仍各占原共同四項額度，前後差異分開保存。新承接可同次明示waiting/deferred/blocked，不可在第一步尚未執行前立即satisfied。上層退出或實質改寫範圍/標準時，每個原有效下層都須同批明示upsert（轉接其他parents、parents空陣列獨立保留，或確認仍支援修改後上層）/drop/assess；只處理受影響下層，沒有提及的無關分支保留。有效關係不可仍支援已結束上層，共享工作保留其他仍成立動機而不複製進度。滿圖可先在先前正常決策逐批明示轉接/獨立保留，再變更上層，不為此新增模型呼叫。活動仍須以本次明示continue/pause/resume/abandon或改做新行動處置；暫停進度若目的結束須當次resume或abandon處置，不能漏掉。已結束項目不能當current focus或methodAssessment.intentIds，退出只連到本次退出紀錄；原成果和活動開始動機不被轉接回寫。 assess 明示分開評估追求：node={status:active或satisfied,progress:ready或waiting或deferred或blocked或enough,basis:{kind:subjective或known-result,text:短依據}}，帶回當次節點id/version、references、reason。satisfied只配ready，表示本人認為已滿足；drop表示放下，與滿足不同。持續direction可active+enough表示目前已足夠，方向仍保留，不自動產生下一份同類任務；有新機會時可再明示ready。waiting/deferred/blocked仍是active，不是結束。known-result只能引用本次實際可見的既有經歷/信念版本，至少一個來源；當次尚未執行action不能當成果。subjective可依本人感受或理解，references可空；它不是已證實的世界成果，勿複製來源正文或把猜測說成世界核准。各層分別判斷，下層完成不自動滿足上層，已有可知依據時可同次評估多層。已滿足身份不復活；範圍與標準保留，追求不另存物理進度。 '+'reorder 是明示局部重排：id=本人id+:roots、version=0、node={scope:roots,members:[{id,version}]} 調整根之間；同一上層則 id=上層id、version=當次上層版本、node={scope:children,members:[{id,version}]}。members 只列本次要互換先後的子集，未列者保留位置與追求。重排仍是一項心理更新；支援關係不是世界前提或必做方法清單，優先不強迫行動，仍可跨分支選焦點。 本版 npc-decision.v3 使用唯一 self.intents 分層追求，不回傳舊 intents 完整陣列。pursuitContext 原樣回傳本次輸入值。pursuitUpdates 是明示增量，空陣列或未提及均保留；不得靠漏寫放下。每項 operation=upsert、drop、assess 或 reorder、id、version（新=0，舊=本次版本）、node、references、reason。upsert.node 含 id、content、intensity/importance/urgency（low/medium/high）、context（自己的簡短背景）、kind（direction/intent/task）、scope（願意承接到哪個程度）、satisfaction（本人認為什麼算夠，可null開放）、parents（上層id/version，新上層version=0）；drop.node=null。id 以自己id加冒號開頭。direction 可新增、改寫或放下，依現行保存方向判斷，不重設為初始goal。新想法無歷史可用references=[]，否則只引用本次實際可見short/long/belief/relationship的id/version。reason 是短變更理由，不要求長篇心理過程。支援有界共享下層，一個下層可連多個上層，只保留同一份進度；各上層不自動完成。有下層或活動關聯的複雜退出仍須先合法處置。focusIntentId 指本次唯一活動焦點的有效追求id，無焦點用null；methodAssessment.intentIds 與焦點一致，沒有則[]。一個行動不自動結束追求，也不產生另一份進度。追求更新和原心理更新合計最多4項／8KiB，追求更新本身最多4KiB；共用全角色每人12節點而非各層12個。';

export function updatePursuits(w:World,c:Character,value:unknown,visible:Character){
 if(value===undefined)value=[];
 if(!Array.isArray(value)||value.length>pursuitLimits.updates||memoryBytes(value)>pursuitLimits.updateBytes)fail('追求更新容量無效');
 const updates=value as PursuitUpdate[],next=structuredClone(c.intents||[]),seen=new Set<string>(),operations=new Map<string,Set<string>>(),orders=new Set<string>(),trace:PursuitTrace[]=[];
 // Earlier v3 slices carried parent identity/version without local order.
 // Their saved array position is the existing order, never a new NPC choice.
 for(const node of next)for(const parent of node.parents||[])parent.order??=next.indexOf(node);
 // Scope formation/revision precedes assessment, independent of wire order.
 const orderedUpdates=[...updates.filter(item=>item.operation==='upsert'),...updates.filter(item=>item.operation!=='upsert'&&item.operation!=='reorder'),...updates.filter(item=>item.operation==='reorder')];
 for(const item of orderedUpdates){
  if(!fields(item,['operation','id','version','node','references','reason'])||!['upsert','drop','reorder','assess'].includes(item.operation)||!text(item.id,64,true)||!item.id.startsWith(c.id+':')||!Number.isSafeInteger(item.version)||item.version<0||!text(item.reason,160,true)||!Array.isArray(item.references)||item.references.length>4)fail('追求候選格式無效');
  if(item.operation==='reorder'){if(orders.has(item.id))fail('重複追求重排範圍');orders.add(item.id);}
  else {const prior=operations.get(item.id)||new Set<string>();if(prior.has(item.operation)||prior.size&&(!['upsert','assess'].includes(item.operation)||[...prior].some(operation=>!['upsert','assess'].includes(operation)))||item.id===`${c.id}:roots`)fail('重複或保留的追求身份');prior.add(item.operation);operations.set(item.id,prior);seen.add(item.id);}
  const old=c.intents?.find(i=>i.id===item.id);
  const createdHere=!old&&updates.some(update=>update.operation==='upsert'&&update.id===item.id&&update.version===0);
  if(item.operation!=='reorder'&&(old?old.version!==item.version||old.status!=='active':item.version!==0||item.operation!=='upsert'&&!(item.operation==='assess'&&createdHere)))fail('追求身份或版本失效');
  for(const ref of item.references){
   const sources=ref.kind==='short'?visible.shortTerm:ref.kind==='long'?visible.longTerm:ref.kind==='belief'?visible.cognition?.beliefs:ref.kind==='relationship'?visible.cognition?.relationshipTags:[];
   if(!fields(ref,['kind','id','version'])||!text(ref.id,128,true)||!Number.isSafeInteger(ref.version)||ref.version<1||!sources?.some(s=>s.id===ref.id&&s.version===ref.version&&s.characterId===c.id))fail('追求來源不屬於當次本人可見版本');
  }
  if(item.operation==='reorder')continue;
  if(item.operation==='assess'){
   const current=next.find(node=>node.id===item.id);
   const evaluation=item.node as PursuitEvaluation|null;
   if(!current||current.status!=='active'||old&&!visible.intents?.some(shown=>shown.id===old.id&&shown.version===old.version)||!evaluation||!fields(evaluation,['status','progress','basis'])||!['active','satisfied'].includes(evaluation.status)||!['ready','waiting','deferred','blocked','enough'].includes(evaluation.progress)||!fields(evaluation.basis,['kind','text'])||!['subjective','known-result'].includes(evaluation.basis.kind)||!text(evaluation.basis.text,160,true))fail('追求評估格式或可見版本無效');
   if(createdHere&&evaluation.status==='satisfied')fail('本次才承接的追求不能立即當成已完成');
   if(evaluation.status==='satisfied'&&evaluation.progress!=='ready'||evaluation.progress==='enough'&&(current.kind!=='direction'||evaluation.status!=='active'))fail('滿足與推進狀態不一致');
   if(evaluation.basis.kind==='known-result'&&!item.references.length)fail('外在結果的滿足判斷需要本次可知來源');
   const assessed:Intent={...current,version:(current.version||0)+1,status:evaluation.status,progress:evaluation.progress,reason:item.reason,assessment:{...evaluation.basis,references:item.references,time:w.minute}};
   next[next.findIndex(node=>node.id===item.id)]=assessed;
   trace.push({id:item.id,time:w.minute,operation:'assess',reason:item.reason,before:current,after:assessed});continue;
  }
  if(item.operation==='drop'){
   if(item.node!==null||!old)fail('追求退出格式無效');
   const ended:Intent={...old,version:item.version+1,status:'dropped',reason:item.reason};
   next[next.findIndex(i=>i.id===item.id)]=ended;
   trace.push({id:item.id,time:w.minute,operation:'drop',reason:item.reason,before:old,after:ended});continue;
  }
  const n=item.node as PursuitNode|null;
  if(!n||!fields(n,pursuitNodeSchema.required)||n.id!==item.id||!text(n.content,200,true)||!text(n.context,160)||!text(n.scope,200,true)||n.satisfaction!==null&&!text(n.satisfaction,160)||!['direction','intent','task'].includes(n.kind)||!['intensity','importance','urgency'].every(k=>['low','medium','high'].includes(n[k as 'intensity']))||!Array.isArray(n.parents)||n.parents.length>=pursuitLimits.nodes||n.parents.some(parent=>!fields(parent,['id','version']))||new Set(n.parents.map(p=>p.id)).size!==n.parents.length)fail('追求節點格式或上層容量無效');
  const previous=next.find(node=>node.id===item.id);
  const parents=n.parents.map(parent=>({...parent,order:previous?.parents?.find(edge=>edge.id===parent.id)?.order??Math.max(-1,...next.filter(node=>node.status==='active').flatMap(node=>node.parents?.filter(p=>p.id===parent.id).map(p=>p.order??next.indexOf(node))||[]))+1}));
  const sameScope=old&&old.scope===n.scope&&old.satisfaction===n.satisfaction&&old.content===n.content&&old.kind===n.kind;
  const updated:Intent={...n,parents,version:item.version+1,references:item.references,status:'active' as const,reason:item.reason,...(sameScope?{progress:old.progress,assessment:old.assessment}:{})};
  const index=next.findIndex(i=>i.id===item.id);if(index<0)next.push(updated);else next[index]=updated;
  trace.push({id:item.id,time:w.minute,operation:'upsert',reason:item.reason,...(old?{before:old}:{}),after:updated});
 }
 // Review only the previously active children affected by a real scope change
 // or exit. Explicit child upsert/assessment/drop is the actor's disposition;
 // final active-edge validation below prevents support for an ended parent.
 for(const old of c.intents||[]){
  const current=next.find(node=>node.id===old.id);
  if(old.status!=='active'||!current||current.status==='active'&&old.scope===current.scope&&old.satisfaction===current.satisfaction&&old.content===current.content&&old.kind===current.kind)continue;
  for(const child of c.intents||[])if(child.status==='active'&&child.parents?.some(parent=>parent.id===old.id)&&!operations.has(child.id))fail('上層變更缺少受影響下層的明示處置');
 }
 for(const node of next.filter(i=>i.status==='active')){
  for(const parent of node.parents||[]){
   if(!text(parent.id,64,true)||parent.id===node.id||!Number.isSafeInteger(parent.version)||!Number.isSafeInteger(parent.order)||(parent.order??-1)<0||Object.keys(parent).some(key=>!['id','version','order'].includes(key)))fail('追求關係無效');
   const original=c.intents?.find(i=>i.id===parent.id),endpoint=next.find(i=>i.id===parent.id);
   if(!endpoint||endpoint.status!=='active'||!parent.id.startsWith(c.id+':'))fail('追求上層不存在');
   if(seen.has(node.id)&&(original?original.version!==parent.version:parent.version!==0))fail('追求上層版本失效');
  }
 }
 for(const item of updates.filter(update=>update.operation==='reorder'))applyPursuitOrder(c,next,item,visible,trace,w.minute);
 const visit=(id:string,path:string[]):number=>{if(path.includes(id))return fail('追求關係循環');const node=next.find(i=>i.id===id)!;return 1+Math.max(0,...(node.parents||[]).map(p=>visit(p.id,[...path,id])));};
 for(const node of next)for(const parent of node.parents||[]){const endpoint=next.find(i=>i.id===parent.id);if(endpoint?.version)parent.version=endpoint.version;}
 if(next.length>pursuitLimits.nodes||next.some(node=>!Number.isSafeInteger(node.version)||(node.version??0)<1)||next.reduce((n,i)=>n+(i.parents?.length||0),0)>pursuitLimits.edges||next.some(i=>visit(i.id,[])>pursuitLimits.depth)||memoryBytes(next)>pursuitLimits.stateBytes)fail('追求狀態超過容量');
 const history=[...(c.pursuitTrace||[]),...trace];let dropped=c.pursuitTraceDropped||0;
 while(history.length>pursuitLimits.trace||memoryBytes(history)>pursuitLimits.traceBytes){history.shift();dropped++;}
 const pursuitExits:PursuitExit[]=(c.intents||[]).flatMap(old=>{const current=next.find(node=>node.id===old.id);return old.status==='active'&&current&&(current.status==='satisfied'||current.status==='dropped')?[{id:old.id,version:old.version!,endedVersion:current.version!,status:current.status}]:[];});
 return {intents:next,pursuitTrace:history,pursuitTraceDropped:dropped,pursuitExits};
}
