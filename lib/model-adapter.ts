import type { TokenUsage } from './activities';
export type ModelService = { key: string; model: string; provider: 'openai' | 'openrouter' };
export type ModelMessage = { role: string; content: string };
function withDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('模型回應逾時。', 'TimeoutError'));
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
// Transport sees only the already filtered transcript and task schema, never World.
export async function requestModel(service: ModelService, messages: ModelMessage[], schema: object, options: { signal: AbortSignal; allowRecall?: boolean; onUsage?: (tokens: TokenUsage) => void; fetcher?: typeof fetch; requestId?: string }): Promise<string> {
const {key, model, provider} = service;
const direct = provider === 'openai', fetcher = options.fetcher || fetch;
let r:Response;
const requestSignal = options.signal;
const dispatch: typeof fetch = (...args) => { requestSignal.throwIfAborted(); return withDeadline(fetcher(...args), requestSignal); };
try { r=await dispatch(direct?'https://api.openai.com/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions',{
method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(options.requestId ? {'X-Decision-Request-Id':options.requestId} : {})},signal:requestSignal,body:JSON.stringify({model,messages,...(direct?{
store:false,max_completion_tokens:model==='gpt-6-luna'?2048:4096,reasoning_effort:model==='gpt-6-luna'?'none':'low',response_format:options.allowRecall?{type:'json_object'}:{type:'json_schema',json_schema:{name:'npc_action',strict:true,schema}},
}:{temperature:.8,max_tokens:2048})})}); }
catch(e) { if(e instanceof Error&&e.name==='TimeoutError')throw new DOMException('模型回應逾時。','TimeoutError');throw Error('無法連線至模型服務，本回合沒有推進。'); }
const providerError=!r.ok?Object.assign(Error(r.status===401?'API Key 無效，請確認它屬於所選服務。':r.status===402?'模型服務額度不足，請先儲值。':r.status===429?'模型服務暫時限流或 API 額度不足，請檢查帳號額度後再試。':r.status===404?'帳號無法使用此模型，請更換模型再試。':`模型服務回應 ${r.status}，本回合沒有儲存。`), { code: r.status === 429 || r.status === 402 ? 'provider_limit' : 'technical_failure' }):undefined;
let d:{usage?:{prompt_tokens?:number;completion_tokens?:number;prompt_tokens_details?:{cached_tokens?:number}};choices?:{message?:{content?:string;refusal?:string};finish_reason?:string}[]};
try { d=await withDeadline(r.json(), requestSignal); } catch { if(providerError)throw providerError;throw Error('模型服務未回傳有效資料，本回合沒有推進。'); }
if(!d||typeof d!=='object'){if(providerError)throw providerError;throw Error('模型服務未回傳有效資料，本回合沒有推進。');}
const choice=d?.choices?.[0];
if(typeof d.usage?.prompt_tokens==='number'&&typeof d.usage?.completion_tokens==='number'&&Number.isFinite(d.usage.prompt_tokens)&&Number.isFinite(d.usage.completion_tokens)&&d.usage.prompt_tokens>=0&&d.usage.completion_tokens>=0)options.onUsage?.({inputTokens:d.usage.prompt_tokens,outputTokens:d.usage.completion_tokens,...(d.usage.prompt_tokens_details?.cached_tokens === undefined ? {} : {cachedInputTokens:d.usage.prompt_tokens_details.cached_tokens})});
if(providerError)throw providerError;
const responseRequestId = r.headers.get('x-decision-request-id');
if(responseRequestId && responseRequestId !== options.requestId) throw Error('模型回覆不屬於本次請求。');
requestSignal.throwIfAborted();
if(choice?.message?.refusal)throw Error('模型未接受這次場景請求，本回合沒有儲存。');
if(choice?.finish_reason==='length')throw Error('模型回覆超過長度限制，本回合沒有儲存。');
const raw=choice?.message?.content||'';
if(typeof raw==='string'&&raw.includes(key))throw Error('模型回覆包含敏感資料，本回合沒有推進。');
return raw;
}
