/* eslint-disable @typescript-eslint/no-require-imports -- 診斷腳本，由 tests/run-activities.mjs 以 node:test 執行。 */
// Issue #384 的裁定重放：把已保存的裁定請求（測試站 decision_traces 的 requestBody）重新送給真實模型，
// 比較「原輸入」與「換成目前程式的規則文字」兩種契約下，核准／拒絕／不合法各幾次。
// 只重放裁定這一次派送：不推進回合、不經 NPC 決策、不寫任何世界。
// 回覆只做純格式解析（parseAdjudicationCandidate）。沒有完整世界，所以**不驗證效果在當前世界能否執行**。
// 「原輸入」只保留當時的規則文字；回覆格式的 schema 一律來自目前程式，所以要比較 schema 修改前後，須在修改前的提交上各跑一次。
// **REPLAY_DRY=1 以外會呼叫付費的模型 API。** 不在 pnpm test 內。輸入含私有實錄，放在 repo 以外的目錄。
//
//   乾跑（不連網，核對重建的請求與保存的請求逐位元相同，並列出規則差異）：
//   REPLAY_DRY=1 REPLAY_INPUTS=<輸入目錄> REPLAY_DIR=<已存在的輸出目錄> NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" \
//     node tests/run-activities.mjs tooling/diagnostics/adjudication-replay-384.test.cjs
//   真實呼叫：
//   REPLAY_PROVIDER=deepseek REPLAY_MODEL=deepseek-flash TRIAL_KEY_FILE=<Key 檔> REPLAY_INPUTS=<輸入目錄> REPLAY_DIR=<輸出目錄> \
//     node tests/run-activities.mjs tooling/diagnostics/adjudication-replay-384.test.cjs
//
// | 環境變數 | 說明 | 預設 |
// | REPLAY_INPUTS | 內含 `<名稱>.request.json` 的目錄，每檔是一次裁定派送的 requestBody | 必填 |
// | REPLAY_DIR | 輸出目錄（需已存在） | 必填 |
// | REPLAY_PROVIDER／REPLAY_MODEL | 供應商與模型 | deepseek／deepseek-flash |
// | REPLAY_CONTRACT | stored（原輸入）、current（目前程式的規則）、both | both |
// | REPLAY_RUNS | 每筆輸入、每種契約各幾次 | 5 |
// | REPLAY_REPAIR | 1：格式驗證失敗時讓模型修正一次（測試站的設定） | 關 |
// | REPLAY_CONCURRENCY | 同時送出的請求數 | 4 |
// | REPLAY_TIMEOUT_MS | 單次請求逾時；產品的模型期限是 25 秒，超過會另外標示 | 120000 |
// Key 只讀環境變數（OPENAI_API_KEY、DEEPSEEK_API_KEY、OPENROUTER_API_KEY）或 TRIAL_KEY_FILE，不寫到任何地方。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { requestAdjudication } = load('adjudication');
const { adjudicationRules, effectRules, parseAdjudicationCandidate, routineCandidateSchema } = load('adjudication-contract');

const dry = process.env.REPLAY_DRY === '1', inputs = process.env.REPLAY_INPUTS, out = process.env.REPLAY_DIR;
const provider = process.env.REPLAY_PROVIDER || 'deepseek', model = process.env.REPLAY_MODEL || 'deepseek-flash';
const contracts = (process.env.REPLAY_CONTRACT || 'both') === 'both' ? ['stored', 'current'] : [process.env.REPLAY_CONTRACT];
const runs = Number(process.env.REPLAY_RUNS || 5), repair = process.env.REPLAY_REPAIR === '1';
const concurrency = Number(process.env.REPLAY_CONCURRENCY || 4), timeoutMs = Number(process.env.REPLAY_TIMEOUT_MS || 120000);
const productDeadlineMs = 25000;
const keyEnv = { openai: 'OPENAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', openrouter: 'OPENROUTER_API_KEY' };

const storedInput = body => JSON.parse(JSON.parse(body).messages.find(message => message.role === 'user').content);
// 靜態規則以開頭文字對應：保存的那一段換成目前程式的整份清單，人物與場所專屬的規則原樣保留。
const prefix = rule => rule.slice(0, 14);
function withCurrent(stored, current, label) {
  const matched = stored.map((rule, index) => current.some(item => prefix(item) === prefix(rule)) ? index : -1).filter(index => index >= 0);
  assert.ok(matched.length, `${label}：保存的輸入找不到可對應的靜態規則`);
  const first = matched[0], last = matched.at(-1);
  assert.equal(matched.length, last - first + 1, `${label}：靜態規則在保存的輸入中不連續，無法安全替換`);
  return [...stored.slice(0, first), ...current, ...stored.slice(last + 1)];
}
function currentInput(input) {
  return { ...input, rules: withCurrent(input.rules, adjudicationRules(!!input.routineOffer), 'rules'), ...(input.effectRules ? { effectRules: withCurrent(input.effectRules, effectRules, 'effectRules') } : {}) };
}
function ruleDiff(before, after) {
  const changed = [];
  for (const rule of after) if (!before.includes(rule)) changed.push({ kind: before.some(item => prefix(item) === prefix(rule)) ? '改寫' : '新增', text: rule });
  for (const rule of before) if (!after.some(item => prefix(item) === prefix(rule))) changed.push({ kind: '移除', text: rule });
  return changed;
}
function classify(raw, input) {
  const offer = input.routineOffer;
  try {
    const parsed = parseAdjudicationCandidate(raw, { routineOperations: offer?.operations || [], allowGenericMethods: !!offer?.genericMethods });
    if (parsed.kind === 'routine') return { outcome: 'accepted', path: 'routine.v' + parsed.approval.version };
    const candidate = parsed.candidate, effects = [...(candidate.effects || []), ...(candidate.stages || []).flatMap(stage => stage.effects)];
    return { outcome: candidate.status, path: candidate.status === 'accepted' ? 'effects' : undefined, effects: effects.map(effect => effect.kind + (effect.operation ? ':' + effect.operation : '')), bodyActivity: candidate.bodyActivity?.kind, check: !!candidate.check };
  } catch (error) { return { outcome: 'invalid', error: error instanceof Error ? error.message : String(error) }; }
}
const summaryOf = raw => { try { return JSON.parse(raw).explanation?.summary; } catch { return undefined; } };

test('重放 #384 的裁定輸入', async () => {
  assert.ok(inputs && fs.statSync(inputs).isDirectory(), 'REPLAY_INPUTS 必須是內含 *.request.json 的目錄');
  assert.ok(out && fs.statSync(out).isDirectory(), 'REPLAY_DIR 必須是已存在的目錄');
  const key = dry ? 'dry-run-key-000000000000000000' : process.env[keyEnv[provider]] || (process.env.TRIAL_KEY_FILE ? fs.readFileSync(process.env.TRIAL_KEY_FILE, 'utf8').trim() : '');
  assert.ok(key, `找不到 Key：請設定 ${keyEnv[provider] || '對應的環境變數'} 或 TRIAL_KEY_FILE（REPLAY_DRY=1 則不連網）`);
  const cases = fs.readdirSync(inputs).filter(name => name.endsWith('.request.json')).sort().map(name => {
    const body = fs.readFileSync(path.join(inputs, name), 'utf8'), stored = storedInput(body);
    return { name: name.replace(/\.request\.json$/, ''), body, stored, current: currentInput(stored), sentModel: JSON.parse(body).model };
  });
  assert.ok(cases.length, 'REPLAY_INPUTS 內沒有 *.request.json');

  // 先不連網驗證工具本身：以保存的輸入經產品的 requestAdjudication 組出的請求，必須與保存的請求逐位元相同。
  for (const item of cases) {
    let captured;
    const fetcher = async (_url, init) => { captured = init.body; return Response.json({ usage: { prompt_tokens: 1, completion_tokens: 1 }, choices: [{ message: { content: '{"status":"denied","effects":[],"check":null}' } }] }); };
    const sameService = item.sentModel === model;
    await requestAdjudication(item.stored, { key: 'dry-run-key-000000000000000000', provider, model: sameService ? model : item.sentModel }, routineCandidateSchema, { signal: AbortSignal.timeout(10000), fetcher }).catch(() => {});
    const identical = captured === item.body;
    console.log(`[${item.name}] 以保存的輸入重建請求：${identical ? '與保存的請求逐位元相同' : '與保存的請求不同（保存時的供應商或程式版本與目前不同）'}`);
    if (dry && process.env.REPLAY_REQUIRE_IDENTICAL === '1') assert.ok(identical, item.name + ' 重建的請求與保存的不同');
    const diff = [...ruleDiff(item.stored.rules, item.current.rules).map(entry => ({ list: 'rules', ...entry })), ...ruleDiff(item.stored.effectRules || [], item.current.effectRules || []).map(entry => ({ list: 'effectRules', ...entry }))];
    for (const entry of diff) console.log(`  ${entry.list} ${entry.kind}：${entry.text.slice(0, 60)}…`);
    const untouched = Object.keys(item.stored).filter(field => !['rules', 'effectRules'].includes(field)).every(field => JSON.stringify(item.stored[field]) === JSON.stringify(item.current[field]));
    assert.ok(untouched, item.name + '：規則以外的輸入欄位不應被改動');
  }
  if (dry) return;

  const jobs = [];
  for (const item of cases) for (const contract of contracts) for (let run = 1; run <= runs; run++) jobs.push({ item, contract, run });
  const records = [], log = path.join(out, `384-replay-${provider}-${model}.jsonl`);
  fs.writeFileSync(log, '');
  const send = async (input, fix) => {
    const started = Date.now();
    try { return { raw: await requestAdjudication(input, { key, provider, model }, routineCandidateSchema, { signal: AbortSignal.timeout(timeoutMs), requestId: 'replay-384:' + crypto.randomUUID() }, fix), ms: Date.now() - started }; }
    catch (error) { return { failure: (error instanceof Error ? error.message : String(error)).split(key).join('[key]'), ms: Date.now() - started }; }
  };
  const work = async ({ item, contract, run }) => {
    const input = item[contract], first = await send(input);
    const record = { name: item.name, contract, run, provider, model, ms: first.ms, overProductDeadline: first.ms > productDeadlineMs };
    if (first.failure) Object.assign(record, { outcome: 'error', error: first.failure });
    else {
      Object.assign(record, classify(first.raw, input), { summary: summaryOf(first.raw), raw: first.raw });
      if (record.outcome === 'invalid' && repair) {
        const second = await send(input, { raw: first.raw, error: record.error });
        record.repair = second.failure ? { outcome: 'error', error: second.failure, ms: second.ms } : { ...classify(second.raw, input), summary: summaryOf(second.raw), raw: second.raw, ms: second.ms };
      }
    }
    records.push(record); fs.appendFileSync(log, JSON.stringify(record) + '\n');
    console.log(`${item.name} ${contract} #${run}: ${record.outcome}${record.path ? ' (' + record.path + ')' : ''}${record.repair ? ' → 修正後 ' + record.repair.outcome : ''} ${record.ms}ms${record.error ? ' ' + record.error : ''}`);
  };
  for (let index = 0; index < jobs.length; index += concurrency) await Promise.all(jobs.slice(index, index + concurrency).map(work));

  const outcomes = ['accepted', 'denied', 'unsupported', 'invalid', 'error'];
  const final = record => record.repair ? record.repair.outcome : record.outcome;
  const lines = [`# #384 裁定重放：${provider}／${model}`, '', `每筆每種契約 ${runs} 次。${repair ? '格式失敗時修正一次，表內為修正後的結論。' : '沒有修正重試。'}回覆只經格式解析，未驗證效果能否在世界執行。`, '',
    '| 輸入 | 契約 | 核准 | 拒絕 | 無法承接 | 不合法 | 呼叫失敗 | 超過 25 秒 |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const item of cases) for (const contract of contracts) {
    const group = records.filter(record => record.name === item.name && record.contract === contract);
    lines.push(`| ${item.name} | ${contract === 'stored' ? '原輸入' : '修改後'} | ${outcomes.map(outcome => group.filter(record => final(record) === outcome).length).join(' | ')} | ${group.filter(record => record.overProductDeadline).length} |`);
  }
  fs.writeFileSync(path.join(out, `384-replay-${provider}-${model}-summary.md`), lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n'));
});
