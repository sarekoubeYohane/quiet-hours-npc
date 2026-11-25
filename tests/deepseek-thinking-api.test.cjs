/* eslint-disable @typescript-eslint/no-require-imports -- DeepSeek thinking opt-in at the provider seam. */
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { modelRequestBody, requestModel } = load('model-adapter');
const { providerReasoning } = load('provider-api');
const messages = [{role:'system',content:'規則'},{role:'user',content:'{}'}];
const body = (provider, options) => JSON.parse(modelRequestBody({provider,model:'test'}, messages, {type:'object'}, options));
const withThinking = (value, run) => { globalThis.__DEEPSEEK_THINKING__ = value; try { return run(); } finally { delete globalThis.__DEEPSEEK_THINKING__; } };

test('DeepSeek thinking stays disabled unless the build names a supported effort', () => {
 for (const value of [undefined, '', 'none', 'true', 'ultra']) {
  const request = withThinking(value, () => body('deepseek'));
  assert.deepEqual(request.thinking, {type:'disabled'}, String(value));
  assert.equal(Object.hasOwn(request, 'reasoning_effort'), false);
  assert.equal(request.max_tokens, 4096);
 }
});

test('an opted-in build enables DeepSeek thinking at that effort and leaves room for reasoning tokens', () => {
 for (const effort of ['low', 'high', 'max']) {
  const request = withThinking(effort, () => body('deepseek'));
  assert.deepEqual(request.thinking, {type:'enabled'});
  assert.equal(request.reasoning_effort, effort);
  assert.equal(request.max_tokens, 8192);
  assert.deepEqual(request.response_format, {type:'json_object'});
 }
 assert.equal(withThinking('low', () => body('deepseek', {maxOutputTokens:1000})).max_tokens, 5096);
 for (const provider of ['openai', 'openrouter', 'gemini', 'anthropic']) {
  const request = withThinking('low', () => body(provider));
  assert.equal(Object.hasOwn(request, 'thinking'), false, provider);
  assert.deepEqual(request, body(provider), provider);
 }
});

test('provider reasoning is kept as observer evidence and never becomes the decision candidate', async () => {
 const reply = {usage:{prompt_tokens:10,completion_tokens:20},choices:[{finish_reason:'stop',message:{role:'assistant',reasoning_content:'先確認必填欄位，再決定去倒水。',content:'{"ok":true}'}}]};
 const observed = [];
 const raw = await withThinking('low', () => requestModel({provider:'deepseek',model:'deepseek-flash',key:'fixture-key'}, messages, {type:'object'}, {
  signal:AbortSignal.timeout(15000), observer:event => { observed.push(event); },
  fetcher:async () => Response.json(reply),
 }));
 assert.equal(raw, '{"ok":true}');
 const response = observed.find(event => event.kind === 'response');
 assert.equal(providerReasoning(response.responseBody), '先確認必填欄位，再決定去倒水。');
 assert.equal(observed.find(event => event.kind === 'candidate').raw, '{"ok":true}');
});

test('responses without usable reasoning show no reasoning instead of an invented one', () => {
 for (const value of [undefined, '', 'not json', '{}', JSON.stringify({choices:[{message:{content:'{}'}}]}), JSON.stringify({choices:[{message:{reasoning_content:'   '}}]}), JSON.stringify({choices:[{message:{reasoning_content:7}}]})])
  assert.equal(providerReasoning(value), undefined, String(value));
});
