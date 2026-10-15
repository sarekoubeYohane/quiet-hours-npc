import type { AIUsage, World } from './world';
import type { TokenUsage } from './activities';

export type ModelPrice = { id: string; provider: 'openai' | 'openrouter'; model: string; input: number; output: number; cachedInput?: number; source: string; date: string; custom: true; savedAt: number };
export type PriceInput = Omit<ModelPrice, 'id' | 'custom' | 'savedAt'>;
export type CostCohort = { provider: string; model: string; price: ModelPrice | null; calls: number; input: number; output: number; cachedInput: number; knownUsd: number; unknownCalls: number; lastDispatchAt: number };
export type CostLedger = { total: Record<string, CostCohort>; hour: Record<string, CostCohort> };
export type CostEstimate = { knownUsd: number; unknownCalls: number; calls: number; complete: boolean; cohorts: CostCohort[] };
export function validPrice(value: unknown): value is PriceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as PriceInput;
  const amount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return ['openai', 'openrouter'].includes(p.provider) && typeof p.model === 'string' && p.model.trim().length > 0 && p.model.length <= 200 && amount(p.input) && amount(p.output) && (p.cachedInput === undefined || amount(p.cachedInput)) && typeof p.source === 'string' && p.source.trim().length > 0 && p.source.length <= 200 && typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(Date.parse(`${p.date}T00:00:00Z`)) && new Date(`${p.date}T00:00:00Z`).toISOString().slice(0,10) === p.date;
}
export function savePrice(world: World, input: PriceInput) {
  const price: ModelPrice = { provider: input.provider, model: input.model.trim(), input: input.input, output: input.output, ...(input.cachedInput === undefined ? {} : {cachedInput:input.cachedInput}), source: input.source.trim(), date:input.date, id:crypto.randomUUID(),custom:true,savedAt:Date.now() };
  world.modelPrices = [...(world.modelPrices || []).filter(p => p.provider !== price.provider || p.model !== price.model), price];
}
export function beginCost(usage: AIUsage, provider: string, model: string, price: ModelPrice | undefined) {
  usage.costs ??= {total:{},hour:{}};
  const key = price?.id || `unknown:${encodeURIComponent(provider)}:${encodeURIComponent(model)}`;
  const now = Date.now();
  for (const group of [usage.costs.total,usage.costs.hour]) {
    const c = group[key] ??= {provider,model,price:price ? {...price} : null,calls:0,input:0,output:0,cachedInput:0,knownUsd:0,unknownCalls:0,lastDispatchAt:now};
    c.calls++; c.unknownCalls++; c.lastDispatchAt=now;
  }
  return (tokens: TokenUsage) => {
    const cache=tokens.cachedInputTokens;
    const cacheValid=cache === undefined || (Number.isFinite(cache) && cache >= 0 && cache <= tokens.inputTokens);
    const cached=cacheValid ? cache || 0 : 0;
    let complete=!!price && cacheValid && (!cached || price.cachedInput !== undefined);
    // A reported cache split removes cached tokens from normal input; unknown cache
    // rates remain unknown rather than charging them twice or assuming free.
    let amount = price && cacheValid ? ((tokens.inputTokens-cached)/1e6*price.input+tokens.outputTokens/1e6*price.output+cached/1e6*(price.cachedInput??0)) : 0;
    if(!Number.isFinite(amount)){amount=0;complete=false;}
    for (const group of [usage.costs!.total,usage.costs!.hour]) {
      const c=group[key]; c.input+=tokens.inputTokens;c.output+=tokens.outputTokens;c.cachedInput+=cached;const safe=Number.isFinite(c.knownUsd+amount);if(safe)c.knownUsd+=amount;if(complete&&safe)c.unknownCalls--;
    }
  };
}
export function costSummary(usage: AIUsage) {
  const estimate=(group:Record<string,CostCohort>|undefined,calls:number):CostEstimate=>{
    const cohorts=Object.values(group||{}), recorded=cohorts.reduce((n,c)=>n+c.calls,0);
    let unknownCalls=Math.max(0,calls-recorded)+cohorts.reduce((n,c)=>n+c.unknownCalls,0);
    let knownUsd=cohorts.reduce((n,c)=>n+c.knownUsd,0);
    if(!Number.isFinite(knownUsd)){knownUsd=0;unknownCalls=Math.max(1,unknownCalls);}
    return {knownUsd,unknownCalls,calls,complete:unknownCalls===0,cohorts};
  };
  return {currency:'USD' as const,hour:estimate(usage.costs?.hour,usage.calls),total:estimate(usage.costs?.total,usage.totalCalls)};
}
