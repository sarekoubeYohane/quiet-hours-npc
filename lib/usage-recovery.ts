import type { AIUsage, World } from './world';
import { beginCost, type CostCohort } from './costs';
import { readDecisionTrace, type DecisionTrace } from './decision-traces';

export type UsageRecovery = {status:'accounted'|'pending'|'unavailable'|'legacy-unverifiable';knownCalls:number;unknownRange:boolean};
export type UsageRecoveryView = UsageRecovery;
export type UsageReceipt = {applied:AIUsage; finalized:boolean};
export type UsageJournal = {floor:number;results:Record<string,unknown>;usage?:Record<string,UsageReceipt>};
const zero=(windowStartedAt:number):AIUsage=>({windowStartedAt,calls:0,inputTokens:0,outputTokens:0,unknownCalls:0,totalCalls:0,totalInputTokens:0,totalOutputTokens:0,totalUnknownCalls:0,savedDecisions:0,costs:{total:{},hour:{}}});
const fields=['calls','input','output','cachedInput','knownUsd','unknownCalls'] as const;
export function paidDelta(before:AIUsage|undefined,after:AIUsage):AIUsage {
  const delta=zero(after.windowStartedAt);
  for(const field of ['totalCalls','totalInputTokens','totalOutputTokens','totalUnknownCalls'] as const)delta[field]=after[field]-(before?.[field]||0);
  delta.calls=delta.totalCalls;delta.inputTokens=delta.totalInputTokens;delta.outputTokens=delta.totalOutputTokens;delta.unknownCalls=delta.totalUnknownCalls;
  for(const [key,cohort] of Object.entries(after.costs?.total||{})){
    const old=before?.costs?.total[key];
    if(cohort.calls===(old?.calls||0))continue;
    const copy={...cohort};for(const field of fields)copy[field]-=old?.[field]||0;
    delta.costs!.total[key]=copy;delta.costs!.hour[key]={...copy};
  }
  return delta;
}
function mergePaid(world:World,desired:AIUsage,applied:AIUsage|undefined) {
  const usage=world.aiUsage??=zero(desired.windowStartedAt);
  const window=desired.windowStartedAt;
  const sameWindow=usage.windowStartedAt===window;
  if(usage.windowStartedAt<window){usage.windowStartedAt=window;usage.calls=0;usage.inputTokens=0;usage.outputTokens=0;usage.unknownCalls=0;usage.costs??={total:{},hour:{}};usage.costs.hour={};}
  for(const [total,hour] of [['totalCalls','calls'],['totalInputTokens','inputTokens'],['totalOutputTokens','outputTokens'],['totalUnknownCalls','unknownCalls']] as const){
    const difference=desired[total]-(applied?.[total]||0);usage[total]+=difference;
    if(sameWindow||usage.windowStartedAt===window)usage[hour]+=difference;
  }
  usage.costs??={total:{},hour:{}};
  for(const [key,cohort] of Object.entries(desired.costs?.total||{}))for(const group of ['total','hour'] as const){
    if(group==='hour'&&usage.windowStartedAt!==window)continue;
    const previous=applied?.costs?.total[key];
    const target=usage.costs[group][key]??={...cohort,calls:0,input:0,output:0,cachedInput:0,knownUsd:0,unknownCalls:0};
    for(const field of fields)target[field]+=cohort[field]-(previous?.[field]||0);
    target.lastDispatchAt=Math.max(target.lastDispatchAt,cohort.lastDispatchAt);
    if(!Number.isFinite(target.knownUsd)){target.knownUsd=0;target.unknownCalls=Math.max(1,target.calls);}
  }
}
function usageFromTrace(trace:DecisionTrace,storedWindow?:number):AIUsage|null {
  const metadata=trace.accounting as {windowStartedAt?:number}|undefined;
  const fallback=trace.acceptedAt;
  const window=metadata?.windowStartedAt??(typeof fallback==='number'&&storedWindow!==undefined&&storedWindow<=fallback&&fallback-storedWindow<3600000?storedWindow:fallback);
  if(typeof window!=='number'||!Number.isFinite(window))return null;
  const result=zero(window);
  for(const value of trace.dispatches){
    if(!value||typeof value!=='object')continue;
    const d=value as Record<string,unknown>,tokens=d.usage as {inputTokens:number;outputTokens:number;cachedInputTokens?:number}|undefined;
    // A prepared checkpoint is not proof of a fetch. Once dispatch/response
    // is durable, the attempt is known even when its token usage is missing.
    const known=!!tokens&&['inputTokens','outputTokens'].every(k=>typeof tokens[k as keyof typeof tokens]==='number'&&Number.isFinite(tokens[k as keyof typeof tokens])&&Number(tokens[k as keyof typeof tokens])>=0);
    if(!known&&d.stage==='dispatch-prepared'&&!d.fetchStartedAt)continue;
    result.calls++;result.totalCalls++;
    if(known){result.inputTokens+=tokens!.inputTokens;result.totalInputTokens+=tokens!.inputTokens;result.outputTokens+=tokens!.outputTokens;result.totalOutputTokens+=tokens!.outputTokens;}
    else{result.unknownCalls++;result.totalUnknownCalls++;}
    const price=d.price as CostCohort['price']|undefined;
    const report=beginCost(result,typeof d.provider==='string'?d.provider:'unknown',typeof d.model==='string'?d.model:'unknown',price??undefined,d.task==='adjudication'?'adjudication':'npc');if(known)report(tokens!);
    const cohortKey=`${d.task==='adjudication'?'adjudication':'npc'}:${price?.id||`unknown:${encodeURIComponent(typeof d.provider==='string'?d.provider:'unknown')}:${encodeURIComponent(typeof d.model==='string'?d.model:'unknown')}`}`;
    for(const group of [result.costs!.total,result.costs!.hour])group[cohortKey].lastDispatchAt=typeof d.startedAt==='number'?d.startedAt:window;
  }
  return result;
}
export function recoveryStatus(journal:UsageJournal,operationId:string,trace:DecisionTrace|null,unavailable=false):UsageRecovery|undefined {
  const receipt=journal.usage?.[operationId];
  const result=journal.results[operationId] as {body?:{operationUncertain?:boolean};pending?:number}|undefined;
  if(receipt?.finalized)return {status:'accounted',knownCalls:receipt.applied.totalCalls-receipt.applied.totalUnknownCalls,unknownRange:false};
  if(!receipt&&!result?.body?.operationUncertain&&!(result?.pending!==undefined&&result.pending<=Date.now()))return undefined;
  return {status:unavailable?'unavailable':!trace||result?.pending!==undefined&&result.pending>Date.now()||receipt&&receipt.applied.totalCalls===0?'pending':receipt?'accounted':'legacy-unverifiable',knownCalls:receipt?receipt.applied.totalCalls-receipt.applied.totalUnknownCalls:0,unknownRange:true};
}
export async function recoverPaidUsage(db:Pick<D1Database,'prepare'>,owner:string,operationId:string,desired?:AIUsage,finalized=false) {
  for(let attempt=0;attempt<4;attempt++){
    const row=await db.prepare('SELECT state, version, operations FROM worlds WHERE owner = ?').bind(owner).first<{state:string;version:number;operations:string}>();
    if(!row)return;
    const journal=JSON.parse(row.operations) as UsageJournal;
    const previous=journal.usage?.[operationId];
    if(previous?.finalized)return;
    if(Number(operationId.split(':')[0])<=journal.floor)return;
    let paid=desired;
    if(paid&&paid.totalCalls<=0)return;
    if(!paid){
      const trace=await readDecisionTrace(db,owner,operationId);
      // For pre-contract operations, an unchanged story version proves that no
      // old world-save or retainPaidUsage (both incremented version) committed.
      if(!trace||(!previous&&trace.baseVersion!==row.version))return;
      paid=usageFromTrace(trace,(JSON.parse(row.state) as World).aiUsage?.windowStartedAt)??undefined;
      if(!paid)return;
    }
    if(!finalized&&previous&&paid.totalCalls<previous.applied.totalCalls)return;
    const world=JSON.parse(row.state) as World;
    mergePaid(world,paid,previous?.applied);
    journal.usage??={};journal.usage[operationId]={applied:paid,finalized};
    const saved=await db.prepare('UPDATE worlds SET state = ?, operations = ?, version = version + ? WHERE owner = ? AND state = ? AND operations = ? AND version = ?')
      .bind(JSON.stringify(world),JSON.stringify(journal),finalized&&!previous?1:0,owner,row.state,row.operations,row.version).run();
    if(saved.meta.changes)return;
  }
  throw Error('用量核對遇到競爭，請沿原操作重新讀取。');
}
export function emptyUsageReceipt(window:number):UsageReceipt{return {applied:zero(window),finalized:false};}
