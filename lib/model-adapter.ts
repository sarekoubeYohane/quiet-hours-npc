import { awaitSignal, signalTiming } from './round-time-policy';
import type { TokenUsage } from './activities';
export const candidateFailureReasons = ['json-parse', 'memory-selection-reference', 'field-format', 'memory-constraint'] as const;
export type CandidateFailureReason = typeof candidateFailureReasons[number];
export function isCandidateFailureReason(value: unknown): value is CandidateFailureReason {
  return candidateFailureReasons.includes(value as CandidateFailureReason);
}
export type ModelFailureKind = 'candidate-format' | 'candidate-validation' | 'transport' | 'timeout' | 'response-body' | 'provider-body' | 'http' | 'request-mismatch' | 'refusal' | 'output-limit' | 'sensitive-response';
export type ModelObservation = {kind:'prepared'|'dispatch';requestId?:string;requestBody?:string;timing?:unknown}|{kind:'fetch-start';at:number}|{kind:'headers';httpStatus:number}|{kind:'response'|'late-response';responseBody:string;httpStatus:number}|{kind:'failure';failure:ModelFailureKind;stage:string;reason?:CandidateFailureReason}|{kind:'usage';usage:TokenUsage}|{kind:'candidate';raw:string};
export type ModelObserver = (event:ModelObservation)=>void|Promise<void>;
export type ModelService = { key: string; model: string; provider: 'openai' | 'openrouter' };
export type ModelMessage = { role: string; content: string };
function providerFailure(status:number){
  return status<200||status>=300?Object.assign(Error(status===401?'API Key 無效，請確認它屬於所選服務。':status===402?'模型服務額度不足，請先儲值。':status===429?'模型服務暫時限流或 API 額度不足，請檢查帳號額度後再試。':status===404?'帳號無法使用此模型，請更換模型再試。':`模型服務回應 ${status}，本回合沒有儲存。`), { code: status === 429 || status === 402 ? 'provider_limit' : 'technical_failure' }):undefined;
}
// Transport sees only the already filtered transcript and task schema, never World.
export async function requestModel(service: ModelService, messages: ModelMessage[], schema: object, options: { signal: AbortSignal; observer?: ModelObserver; maxOutputTokens?: number; allowRecall?: boolean; onUsage?: (tokens: TokenUsage) => void; fetcher?: typeof fetch; requestId?: string }): Promise<string> {
const {key, model, provider} = service;
const direct = provider === 'openai', fetcher = options.fetcher || fetch;
let r:Response;
const requestSignal = options.signal;
const observe=async(event:ModelObservation)=>{try{await options.observer?.(event);}catch{/* Evidence errors do not change model behavior. */}};
const checkpoint=(event:ModelObservation)=>awaitSignal(observe(event),requestSignal);
const fail=async(kind:ModelFailureKind,stage:string)=>{const save=observe({kind:'failure',failure:kind,stage});if(!requestSignal.aborted)await awaitSignal(save,requestSignal);};
const requestBody=JSON.stringify({model,messages,...(direct?{
store:false,max_completion_tokens:options.maxOutputTokens??(model==='gpt-6-luna'?2048:4096),reasoning_effort:model==='gpt-6-luna'?'none':'low',response_format:options.allowRecall?{type:'json_object'}:{type:'json_schema',json_schema:{name:'npc_action',strict:true,schema}},
}:{temperature:.8,max_tokens:options.maxOutputTokens??2048})});
// Persist the actual bytes before crossing the provider boundary. A crash here
// means dispatch is unknown, not absent. No header or service key is observed.
requestSignal.throwIfAborted();
await checkpoint({kind:'prepared',requestId:options.requestId,requestBody,timing:signalTiming(requestSignal)});
requestSignal.throwIfAborted();
let responseBody:string;
let receivedHeaders:Response|undefined;
const work=(async()=>{
  // The event is synchronous up to the observer's first await; this is the
  // actual invocation boundary, distinct from durable prepared.
  void observe({kind:'fetch-start',at:Date.now()});
  requestSignal.throwIfAborted();
  const response=await fetcher(direct?'https://api.openai.com/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(options.requestId?{'X-Decision-Request-Id':options.requestId}:{})},signal:requestSignal,body:requestBody});
  receivedHeaders=response;
  await observe({kind:'headers',httpStatus:response.status});
  const body=await response.text();
  // A provider ignoring abort may arrive after the round has stopped. Capture
  // evidence only; it never resumes parsing, accounting, dice or world effects.
  if(!requestSignal.aborted){
    try{const d=JSON.parse(body);const u=d?.usage;if(typeof u?.prompt_tokens==='number'&&typeof u?.completion_tokens==='number'&&Number.isFinite(u.prompt_tokens)&&Number.isFinite(u.completion_tokens)&&u.prompt_tokens>=0&&u.completion_tokens>=0){
      const usage={inputTokens:u.prompt_tokens,outputTokens:u.completion_tokens,...(u.prompt_tokens_details?.cached_tokens===undefined?{}:{cachedInputTokens:u.prompt_tokens_details.cached_tokens})};
      options.onUsage?.(usage);
      // Keep the response/usage saves on the original ordered observer queue.
    }}catch{/* Invalid bodies are classified below. */}
  }
  await observe({kind:requestSignal.aborted?'late-response':'response',responseBody:body,httpStatus:response.status});
  return {response,body};
})();
const bounded=awaitSignal(work,requestSignal);
// Attach a rejection handler before awaiting the checkpoint, even if a local
// service rejects synchronously while SQLite is writing dispatch evidence.
bounded.catch(()=>{});
await checkpoint({kind:'dispatch',requestId:options.requestId,requestBody});
try { const received=await bounded;r=received.response;responseBody=received.body; }
catch(e) {
  const timeout=requestSignal.aborted||e instanceof Error&&e.name==='TimeoutError';
  await fail(timeout?'timeout':receivedHeaders?'response-body':'transport',receivedHeaders?'response-body':'dispatch');
  const knownFailure=receivedHeaders&&providerFailure(receivedHeaders.status);
  if(knownFailure)throw knownFailure;
  if(timeout)throw new DOMException('模型回應逾時。','TimeoutError');
  throw Error('無法連線至模型服務，本回合沒有推進。');
}
const providerError=providerFailure(r.status);
let d:{usage?:{prompt_tokens?:number;completion_tokens?:number;prompt_tokens_details?:{cached_tokens?:number}};choices?:{message?:{content?:string;refusal?:string};finish_reason?:string}[]};
try { d=JSON.parse(responseBody); } catch { await fail(providerError?'http':'provider-body','provider-parse');if(providerError)throw providerError;throw Error('模型服務未回傳有效資料，本回合沒有推進。'); }
if(!d||typeof d!=='object'){await fail('provider-body','provider-parse');if(providerError)throw providerError;throw Error('模型服務未回傳有效資料，本回合沒有推進。');}
const choice=d?.choices?.[0];
if(typeof d.usage?.prompt_tokens==='number'&&typeof d.usage?.completion_tokens==='number'&&Number.isFinite(d.usage.prompt_tokens)&&Number.isFinite(d.usage.completion_tokens)&&d.usage.prompt_tokens>=0&&d.usage.completion_tokens>=0){const usage={inputTokens:d.usage.prompt_tokens,outputTokens:d.usage.completion_tokens,...(d.usage.prompt_tokens_details?.cached_tokens === undefined ? {} : {cachedInputTokens:d.usage.prompt_tokens_details.cached_tokens})};await checkpoint({kind:'usage',usage});}
if(typeof choice?.message?.content==='string')await checkpoint({kind:'candidate',raw:choice.message.content});
if(providerError){await fail('http','provider-response');throw providerError;}
const responseRequestId = r.headers.get('x-decision-request-id');
if(responseRequestId && responseRequestId !== options.requestId){await fail('request-mismatch','response-association');throw Error('模型回覆不屬於本次請求。');}
requestSignal.throwIfAborted();
if(choice?.message?.refusal){await fail('refusal','provider-response');throw Error('模型未接受這次場景請求，本回合沒有儲存。');}
if(choice?.finish_reason==='length'){await fail('output-limit','provider-response');throw Error('模型回覆超過長度限制，本回合沒有儲存。');}
const raw=choice?.message?.content||'';
if(typeof raw==='string'&&raw.includes(key)){await fail('sensitive-response','response-validation');throw Error('模型回覆包含敏感資料，本回合沒有推進。');}
return raw;
}
