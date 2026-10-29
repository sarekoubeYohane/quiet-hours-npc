import { awaitSignal, signalTiming, signalExpired, checkSignal } from './round-time-policy';
import type { TokenUsage } from './activities';
export const candidateFailureReasons = ['json-parse', 'memory-selection-reference', 'field-format', 'memory-constraint'] as const;
export type CandidateFailureReason = typeof candidateFailureReasons[number];
export function isCandidateFailureReason(value: unknown): value is CandidateFailureReason {
  return candidateFailureReasons.includes(value as CandidateFailureReason);
}
export type ModelFailureKind = 'candidate-format' | 'candidate-validation' | 'transport' | 'timeout' | 'response-body' | 'provider-body' | 'http' | 'request-mismatch' | 'refusal' | 'output-limit' | 'sensitive-response';
export type ModelObservation = {kind:'prepared'|'dispatch';requestId?:string;requestBody?:string;timing?:unknown}|{kind:'fetch-start';at:number}|{kind:'headers';httpStatus:number}|{kind:'response'|'late-response';responseBody:string;httpStatus:number;at?:number;usage?:TokenUsage}|{kind:'failure';failure:ModelFailureKind;stage:string;reason?:CandidateFailureReason}|{kind:'usage';usage:TokenUsage;at?:number}|{kind:'candidate';raw:string};
export type ModelObserver = (event:ModelObservation)=>void|Promise<void>;
export type ModelService = { key: string; model: string; provider: 'openai' | 'openrouter' };
export type ModelMessage = { role: string; content: string };
type ProviderBody={usage?:{prompt_tokens?:number;completion_tokens?:number;prompt_tokens_details?:{cached_tokens?:number}};choices?:{message?:{content?:string;refusal?:string};finish_reason?:string}[]};
function providerFailure(status:number){
  return status<200||status>=300?Object.assign(Error(status===401?'API Key 無效，請確認它屬於所選服務。':status===402?'模型服務額度不足，請先儲值。':status===429?'模型服務暫時限流或 API 額度不足，請檢查帳號額度後再試。':status===404?'帳號無法使用此模型，請更換模型再試。':`模型服務回應 ${status}，本回合沒有儲存。`), { code: status === 429 || status === 402 ? 'provider_limit' : 'technical_failure' }):undefined;
}
// Transport sees only the already filtered transcript and task schema, never World.
export function modelRequestBody(service:Pick<ModelService,'model'|'provider'>,messages:ModelMessage[],schema:object,options:{maxOutputTokens?:number;allowRecall?:boolean}={}){
 const {model,provider}=service;
 return JSON.stringify({model,messages,...(provider==='openai'?{store:false,max_completion_tokens:options.maxOutputTokens??(model==='gpt-6-luna'?2048:4096),reasoning_effort:model==='gpt-6-luna'?'none':'low',response_format:options.allowRecall?{type:'json_object'}:{type:'json_schema',json_schema:{name:'npc_action',strict:true,schema}}}:{temperature:.8,max_tokens:options.maxOutputTokens??2048})});
}
export async function requestModel(service: ModelService, messages: ModelMessage[], schema: object, options: { signal: AbortSignal; observer?: ModelObserver; maxOutputTokens?: number; allowRecall?: boolean; onUsage?: (tokens: TokenUsage) => void; fetcher?: typeof fetch; requestId?: string }): Promise<string> {
const {key, provider} = service;
const direct = provider === 'openai', fetcher = options.fetcher || fetch;
let r:Response;
const requestSignal = options.signal;
const observe=async(event:ModelObservation)=>{try{await options.observer?.(event);}catch{/* Evidence errors do not change model behavior. */}};
const checkpoint=(event:ModelObservation)=>awaitSignal(observe(event),requestSignal);
const fail=async(kind:ModelFailureKind,stage:string)=>{try{await awaitSignal(observe({kind:'failure',failure:kind,stage}),requestSignal);}catch{if(!requestSignal.aborted)throw Error('實錄保存失敗。');}};
const requestBody=modelRequestBody(service,messages,schema,options);
// Persist the actual bytes before crossing the provider boundary. A crash here
// means dispatch is unknown, not absent. No header or service key is observed.
checkSignal(requestSignal);
await checkpoint({kind:'prepared',requestId:options.requestId,requestBody,timing:signalTiming(requestSignal)});
checkSignal(requestSignal);
let receivedHeaders:Response|undefined;
let knownUsage:TokenUsage|undefined,bodyReceivedAt:number|undefined;
let parsedBody:ProviderBody|undefined,bodyParseFailed=false;
const work=(async()=>{
  // The event is synchronous up to the observer's first await; this is the
  // actual invocation boundary, distinct from durable prepared.
  void observe({kind:'fetch-start',at:Date.now()});
  checkSignal(requestSignal);
  const response=await fetcher(direct?'https://api.openai.com/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(options.requestId?{'X-Decision-Request-Id':options.requestId}:{})},signal:requestSignal,body:requestBody});
  receivedHeaders=response;
  await observe({kind:'headers',httpStatus:response.status});
  const body=await response.text();
  // A provider ignoring abort may arrive after the round has stopped. Capture
  // evidence only; it never resumes parsing, accounting, dice or world effects.
  bodyReceivedAt=Date.now();
  if(!signalExpired(requestSignal)){
    try{parsedBody=JSON.parse(body);}catch{bodyParseFailed=true;}
    const u=parsedBody?.usage;
    if(typeof u?.prompt_tokens==='number'&&typeof u?.completion_tokens==='number'&&Number.isFinite(u.prompt_tokens)&&Number.isFinite(u.completion_tokens)&&u.prompt_tokens>=0&&u.completion_tokens>=0){
      knownUsage={inputTokens:u.prompt_tokens,outputTokens:u.completion_tokens,...(u.prompt_tokens_details?.cached_tokens===undefined?{}:{cachedInputTokens:u.prompt_tokens_details.cached_tokens})};
      options.onUsage?.(knownUsage);
    }
  }
  await observe({kind:signalExpired(requestSignal)?'late-response':'response',responseBody:body,httpStatus:response.status,at:bodyReceivedAt,usage:knownUsage});
  return {response,body};
})();
const bounded=awaitSignal(work,requestSignal);
// Attach a rejection handler before awaiting the checkpoint, even if a local
// service rejects synchronously while SQLite is writing dispatch evidence.
bounded.catch(()=>{});
await checkpoint({kind:'dispatch',requestId:options.requestId,requestBody});
try { const received=await bounded;r=received.response; }
catch(e) {
  const timeout=signalExpired(requestSignal)||e instanceof Error&&e.name==='TimeoutError';
  await fail(timeout?'timeout':receivedHeaders?'response-body':'transport',receivedHeaders?'response-body':'dispatch');
  const knownFailure=receivedHeaders&&providerFailure(receivedHeaders.status);
  if(knownFailure)throw knownFailure;
  if(timeout)throw new DOMException('模型回應逾時。','TimeoutError');
  throw Error('無法連線至模型服務，本回合沒有推進。');
}
const providerError=providerFailure(r.status);
if(bodyParseFailed){await fail(providerError?'http':'provider-body','provider-parse');if(providerError)throw providerError;throw Error('模型服務未回傳有效資料，本回合沒有推進。');}
if(!parsedBody||typeof parsedBody!=='object'){await fail('provider-body','provider-parse');if(providerError)throw providerError;throw Error('模型服務未回傳有效資料，本回合沒有推進。');}
const choice=parsedBody.choices?.[0];
if(knownUsage)await checkpoint({kind:'usage',usage:knownUsage,at:bodyReceivedAt});
if(typeof choice?.message?.content==='string')await checkpoint({kind:'candidate',raw:choice.message.content});
if(providerError){await fail('http','provider-response');throw providerError;}
const responseRequestId = r.headers.get('x-decision-request-id');
if(responseRequestId && responseRequestId !== options.requestId){await fail('request-mismatch','response-association');throw Error('模型回覆不屬於本次請求。');}
checkSignal(requestSignal);
if(choice?.message?.refusal){await fail('refusal','provider-response');throw Error('模型未接受這次場景請求，本回合沒有儲存。');}
if(choice?.finish_reason==='length'){await fail('output-limit','provider-response');throw Error('模型回覆超過長度限制，本回合沒有儲存。');}
const raw=choice?.message?.content||'';
if(typeof raw==='string'&&raw.includes(key)){await fail('sensitive-response','response-validation');throw Error('模型回覆包含敏感資料，本回合沒有推進。');}
return raw;
}
