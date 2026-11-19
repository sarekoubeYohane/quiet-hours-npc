/* eslint-disable @typescript-eslint/no-require-imports -- 診斷腳本，由 tests/run-activities.mjs 以 node:test 執行。 */
// Issue #344 的重現與輸入紀錄：Cass 取得並吃掉驗收餐點之後，下一次決策實際收到什麼。
// 不連網：NPC 與裁定都是固定回覆。只印出並保存實際送給 NPC 模型的輸入，不斷言產品行為對錯。
//
//   NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" \
//     node tests/run-activities.mjs tooling/diagnostics/action-feedback-344.test.cjs
//
// FEEDBACK_344_DIR=<已存在的目錄> 時，另外把每次 Cass 決策的完整輸入與 system prompt 寫成檔案。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { fixtureDecision } = require(path.join(process.cwd(), 'tests/pursuit-fixture.cjs'));
const { GET, POST } = load('route'), store = load('store'), { seedWorld } = load('world');
const out = process.env.FEEDBACK_344_DIR;
const read = async () => (await (await GET()).json()).world;
const completion = (value, input) => Response.json({ usage: { prompt_tokens: 30, completion_tokens: 10 }, choices: [{ message: { content: JSON.stringify(fixtureDecision(input, value)) } }] });

async function run(label, minutes, rounds) {
  const world = seedWorld(); world.adjudication = { provider: 'openai', model: 'fixture-adjudicator' }; world.playerBudget = { calls: 2000, tokens: 50000000 };
  store.install(world);
  const post = async body => POST(new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy': 'round-v1' }, body: JSON.stringify({ operationScope: 'test-owner', operationId: Date.now() + ':' + crypto.randomUUID(), worldContext: (await read()).contextId, mode: 'openai', model: 'gpt-6-luna', ...body }) }));
  assert.equal((await post({ operation: 'set-model-key', key: 'fixture-key' })).status, 200);
  assert.equal((await post({ operation: 'enter-acceptance' })).status, 200);
  const cass = [], verdicts = []; let round = 0; const previous = global.fetch;
  global.fetch = async (_url, init) => {
    const messages = JSON.parse(init.body).messages, input = JSON.parse(messages[1].content);
    if (input.contractVersion === 'world-adjudication.v1') {
      const supply = input.supplies?.find(item => item.id === 'acceptance-meal');
      const ok = input.actor.id === 'cass' && supply?.remaining === 1;
      verdicts.push({ round, actor: input.actor.id, status: ok ? 'accepted' : 'denied', supply: supply ?? null });
      return completion(ok
        ? { status: 'accepted', completionMinutes: minutes, check: null, stages: [], effects: [{ kind: 'materialize', supplyId: supply.id, expectedRemaining: 1 }, { kind: 'consume', objectId: supply.materializedObjectId, expectedRevision: 1 }] }
        : { status: 'denied', effects: [], stages: [], check: null }, input);
    }
    if (input.self.id !== 'cass') return completion({ type: 'rest', target: '', content: '安靜休息', mood: '平靜', durationMinutes: 15, intents: [] }, input);
    cass.push({ round, input, system: messages[0].content });
    return completion({ type: 'propose', target: 'acceptance-meal', content: '取得並吃掉眼前的驗收餐點', purpose: '吃飯', mood: '平靜', durationMinutes: minutes, timeIntent: { kind: 'completion', maxMinutes: null }, intents: [] }, input);
  };
  const say = text => console.log(text);
  say(`\n################ ${label}（Cass 選 ${minutes} 分鐘，每回合推進 15 分鐘）################`);
  try {
    for (round = 1; round <= rounds; round++) {
      const from = cass.length, response = await post({ operation: 'advance', minutes: 15 });
      const w = await read(), self = w.characters.find(c => c.id === 'cass');
      say(`\n── 第 ${round} 回合｜HTTP ${response.status}｜世界時間 ${w.minute}｜餐點剩 ${w.supplies.find(s => s.id === 'acceptance-meal').remaining}｜物件 ${JSON.stringify(w.objects.filter(o => o.source === 'acceptance-meal').map(o => ({ id: o.id, lifecycle: o.lifecycle, holder: o.holder })))}`);
      say(`   裁定：${JSON.stringify(verdicts.filter(v => v.round === round && v.actor === 'cass').map(v => v.status))}｜Cass 本回合決策次數 ${cass.length - from}`);
      for (const call of cass.slice(from)) {
        const i = call.input, text = JSON.stringify(i);
        say('   ▼ 這次決策實際送出的輸入（節錄）');
        say(`     self.activity = ${JSON.stringify(i.self.activity)}`);
        say(`     self.plan = ${JSON.stringify(i.self.plan ?? null)}｜currentActivity = ${JSON.stringify(i.currentActivity ?? null)}`);
        say(`     self.shortTerm 共 ${i.self.shortTerm.length} 筆；其中本人經歷（source.person 是 cass）：`);
        for (const [index, entry] of i.self.shortTerm.entries()) if (entry.source?.person === 'cass') say(`       [${index}] time ${entry.time}：${entry.text}`);
        say(`     含「行動回饋」的欄位：${JSON.stringify(Object.entries(i.self).filter(([, value]) => JSON.stringify(value ?? null).includes('行動回饋')).map(([key]) => 'self.' + key))}`);
        say(`     objects 中的餐點 = ${JSON.stringify((i.objects || []).filter(o => /meal/.test(o.id)))}`);
        say(`     supplies = ${JSON.stringify(i.supplies ?? null)}`);
        say(`     self.bodyFeelings = ${JSON.stringify(i.self.bodyFeelings ?? null)}｜self.physical = ${JSON.stringify(i.self.physical ?? null)}`);
        say(`     全文出現次數：「非已發生成果」${text.split('非已發生成果').length - 1}、「消耗」${text.split('消耗').length - 1}、「吃」${text.split('吃').length - 1}、「活動已完成」${text.split('活動已完成').length - 1}、「未確認本次受阻的原因」${text.split('未確認本次受阻的原因').length - 1}`);
        if (out) { const base = path.join(out, `${label}-round${call.round}-${cass.indexOf(call)}`); fs.writeFileSync(base + '-input.json', JSON.stringify(i, null, 1)); fs.writeFileSync(base + '-system.txt', call.system); }
      }
      say(`   回合後 Cass.activity = ${JSON.stringify(self.activity)}`);
    }
  } finally { global.fetch = previous; }
}

test('#344 立即完成：15 分鐘內取得並吃掉餐點後的下一次決策輸入', async () => { await run('immediate', 15, 4); });
test('#344 分階段：30 分鐘活動完成後的下一次決策輸入', async () => { await run('staged', 30, 5); });
