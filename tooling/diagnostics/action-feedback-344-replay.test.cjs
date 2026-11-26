/* eslint-disable @typescript-eslint/no-require-imports -- 診斷腳本，由 tests/run-activities.mjs 以 node:test 執行。 */
// Issue #344 推論 1 的單次決策重放：成功後那一次決策的 request，原文與「只拿掉『，非已發生成果』」各送 N 次給真實模型。
// 前半用替身模型經正式 world route 產生 request（不連網）；後半才連網，只有 NPC 呼叫，沒有裁定。
// **REPLAY_DRY=1 以外會呼叫付費的模型 API。** 不在 pnpm test 內。
//
//   乾跑（不連網）：
//   REPLAY_DRY=1 REPLAY_DIR=<已存在的目錄> NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" \
//     node tests/run-activities.mjs tooling/diagnostics/action-feedback-344-replay.test.cjs
//   真實呼叫（每種 REPLAY_RUNS 次，預設 10）：
//   TRIAL_KEY_FILE=<Key 檔> REPLAY_DIR=<已存在的目錄> node tests/run-activities.mjs tooling/diagnostics/action-feedback-344-replay.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { fixtureDecision } = require(path.join(process.cwd(), 'tests/pursuit-fixture.cjs'));
const { GET, POST } = load('route'), store = load('store'), { seedWorld } = load('world');
const dry = process.env.REPLAY_DRY === '1', runs = Number(process.env.REPLAY_RUNS || 10), out = process.env.REPLAY_DIR;
const realFetch = global.fetch;
const read = async () => (await (await GET()).json()).world;
const completion = (value, input) => Response.json({ usage: { prompt_tokens: 30, completion_tokens: 10 }, choices: [{ message: { content: JSON.stringify(fixtureDecision(input, value)) } }] });
const marker = '（原提案，非已發生成果：', replacement = '（原提案：';

async function capture() {
  const world = seedWorld(); world.adjudication = { provider: 'openai', model: 'fixture-adjudicator' }; world.playerBudget = { calls: 2000, tokens: 50000000 };
  store.install(world);
  const post = async body => POST(new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy': 'round-v2' }, body: JSON.stringify({ operationScope: 'test-owner', operationId: Date.now() + ':' + crypto.randomUUID(), worldContext: (await read()).contextId, mode: 'openai', model: 'gpt-6-luna', ...body }) }));
  assert.equal((await post({ operation: 'set-model-key', key: 'fixture-key' })).status, 200);
  assert.equal((await post({ operation: 'enter-acceptance' })).status, 200);
  const requests = [];
  global.fetch = async (url, init) => {
    const messages = JSON.parse(init.body).messages, input = JSON.parse(messages[1].content);
    if (input.contractVersion === 'world-adjudication.v1') {
      const supply = input.supplies?.find(item => item.id === 'acceptance-meal'), ok = input.actor.id === 'cass' && supply?.remaining === 1;
      return completion(ok
        ? { status: 'accepted', completionMinutes: 15, check: null, stages: [], effects: [{ kind: 'materialize', supplyId: supply.id, expectedRemaining: 1 }, { kind: 'consume', objectId: supply.materializedObjectId, expectedRevision: 1 }] }
        : { status: 'denied', effects: [], stages: [], check: null }, input);
    }
    if (input.self.id !== 'cass') return completion({ type: 'rest', target: '', content: '安靜休息', mood: '平靜', durationMinutes: 15, intents: [] }, input);
    requests.push({ url: String(url), body: init.body });
    return completion({ type: 'propose', target: 'acceptance-meal', content: '取得並吃掉眼前的驗收餐點', purpose: '吃飯', mood: '平靜', durationMinutes: 15, timeIntent: { kind: 'completion', maxMinutes: null }, intents: [] }, input);
  };
  try {
    assert.equal((await post({ operation: 'advance', minutes: 15 })).status, 200);
    assert.equal((await read()).supplies.find(s => s.id === 'acceptance-meal').remaining, 0);
    assert.equal((await post({ operation: 'advance', minutes: 15 })).status, 200);
  } finally { global.fetch = realFetch; }
  assert.equal(requests.length, 2);
  return requests[1];
}

test('#344 重放成功後的那一次決策', { timeout: 30 * 60 * 1000 }, async () => {
  const request = await capture(), original = JSON.parse(request.body);
  const occurrences = original.messages[1].content.split(marker).length - 1;
  assert.ok(occurrences > 0, '輸入裡找不到要替換的開頭');
  assert.equal(original.messages[0].content.includes(marker), false);
  const variant = structuredClone(original); variant.messages[1].content = original.messages[1].content.split(marker).join(replacement);
  JSON.parse(variant.messages[1].content);
  const arms = { original: JSON.stringify(original), variant: JSON.stringify(variant) };
  console.log(`\n網址 ${request.url}｜模型 ${original.model}｜輸入中「${marker}」出現 ${occurrences} 次，變體全部換成「${replacement}」`);
  console.log(`request 大小：原文 ${arms.original.length} 字元、變體 ${arms.variant.length} 字元（差 ${arms.original.length - arms.variant.length}，應為 ${occurrences} × ${marker.length - replacement.length}）`);
  const own = body => JSON.parse(JSON.parse(body).messages[1].content).self.shortTerm.filter(entry => entry.source?.person === 'cass').map(entry => entry.text);
  console.log(`原文的本人經歷：${JSON.stringify(own(arms.original))}`);
  console.log(`變體的本人經歷：${JSON.stringify(own(arms.variant))}`);
  if (out) for (const [name, body] of Object.entries(arms)) fs.writeFileSync(path.join(out, `replay-${name}-request.json`), body);
  if (dry) { console.log('REPLAY_DRY=1：沒有連網。'); return; }
  const key = process.env.TRIAL_KEY_FILE ? fs.readFileSync(process.env.TRIAL_KEY_FILE, 'utf8').trim() : '';
  if (!key) throw new Error('找不到 Key：請設定 TRIAL_KEY_FILE，或用 REPLAY_DRY=1 乾跑');
  const log = out ? path.join(out, 'replay-calls.jsonl') : null; let calls = 0;
  for (let run = 1; run <= runs; run++) for (const [arm, body] of Object.entries(arms)) {
    const started = Date.now();
    const response = await realFetch(request.url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(180000) });
    const text = await response.text(); calls++;
    const record = { arm, run, status: response.status, ms: Date.now() - started };
    if (response.status !== 200) { record.raw = text.slice(0, 600); if (log) fs.appendFileSync(log, JSON.stringify(record) + '\n'); throw new Error(`第 ${calls} 次呼叫回 ${response.status}，已停止：${record.raw}`); }
    const parsed = JSON.parse(text); record.usage = parsed.usage && { in: parsed.usage.prompt_tokens, out: parsed.usage.completion_tokens }; record.finish = parsed.choices?.[0]?.finish_reason; record.content = parsed.choices?.[0]?.message?.content;
    if (log) fs.appendFileSync(log, JSON.stringify(record) + '\n');
    let decision; try { decision = JSON.parse(record.content); } catch { decision = null; }
    const action = decision?.action, assessment = decision?.methodAssessment;
    console.log(`\n[${arm} #${run}] ${record.ms} ms｜token ${record.usage?.in}/${record.usage?.out}｜行動 ${action ? `${action.type}→${action.target}「${action.content}」` : '（無法解析）'}｜${decision?.durationMinutes} 分`);
    if (assessment) console.log(`   knownResults=${JSON.stringify(assessment.knownResults)}｜choice=${assessment.choice}｜reason=${assessment.reason}`);
    if (decision) console.log(`   interpretation=${decision.interpretation}｜追求更新=${JSON.stringify((decision.pursuitUpdates || []).map(update => ({ operation: update.operation, id: update.id, status: update.node?.status, basis: update.node?.basis })))}`);
  }
  console.log(`\n共 ${calls} 次真實 NPC 呼叫，0 次裁定。`);
});
