/* eslint-disable @typescript-eslint/no-require-imports -- 實驗腳本，由 tests/run-activities.mjs 以 node:test 執行；不登記到 pnpm test。 */
// 製作工作回覆大小量測：直接呼叫各項製作工作的正式函式，記下模型回覆的字元數、位元組數與輸出 token 數。
// 用來決定格式修正時回送原回覆的上限。用法見同資料夾的 README.md。只觀察，不修改產品程式。
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));

const dry = process.env.TRIAL_DRY === '1';
const provider = process.env.TRIAL_PROVIDER || 'openai';
const model = process.env.TRIAL_MODEL || 'gpt-6.1-sol';
const runs = Number(process.env.TRIAL_RUNS || 3);
const only = (process.env.TRIAL_TASKS || '').split(',').map(name => name.trim()).filter(Boolean);
const dir = process.env.TRIAL_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'setup-reply-size-'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const base = path.join(dir, `setup-${dry ? 'dry-' : ''}${stamp}`);
const bytes = text => new TextEncoder().encode(text).length;
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0; };

test('setup reply size trial', { timeout: 2 * 60 * 60 * 1000 }, async () => {
  const key = dry ? 'dry-run-key-000000000000000000' : process.env.OPENAI_API_KEY || (process.env.TRIAL_KEY_FILE ? fs.readFileSync(process.env.TRIAL_KEY_FILE, 'utf8').trim() : '');
  if (!key) throw new Error('找不到 Key：請設定 OPENAI_API_KEY 或 TRIAL_KEY_FILE（TRIAL_DRY=1 則不連網）');
  const service = { provider, model, key };

  // 攔截點：各製作工作呼叫的 requestModel。回傳值就是該工作拿去解析的原回覆。
  const adapter = load('model-adapter'), original = adapter.requestModel;
  let current = null;
  adapter.requestModel = async (svc, messages, schema, options) => {
    const record = current;
    record.maxOutputTokens = options.maxOutputTokens ?? null;
    record.requestBytes = bytes(JSON.stringify(messages));
    const started = Date.now();
    try {
      const raw = await original(svc, messages, schema, { ...options, onUsage: async tokens => { record.usage = tokens; await options.onUsage?.(tokens); } });
      record.raw = raw; record.chars = raw.length; record.bytes = bytes(raw);
      return raw;
    } finally { record.ms = Date.now() - started; }
  };
  const dryFetch = async () => Response.json({ usage: { prompt_tokens: 1, completion_tokens: 1 }, choices: [{ message: { content: '{}' } }] });
  const options = label => ({ signal: AbortSignal.timeout(180000), label, ...(dry ? { fetcher: dryFetch } : {}) });

  // ── 輸入：內建範例人物卡與範例場景 ──
  const examples = load('example-content'), { seedWorld } = load('world');
  const { characterTemplateFieldNames } = load('character-templates');
  const cards = ['cass', 'vera', 'kris', 'owner'].map(id => examples.exampleCharacterCards.find(card => card.id === 'card-example-' + id));
  const scenes = ['example-kris-home', 'example-vera-home', 'example-cafe'].map(id => examples.exampleSceneTemplates.find(scene => scene.id === id));
  const place = (id, scene) => ({ id, templateId: scene.id, version: scene.version, name: scene.name });
  const person = (card, rest) => ({ templateId: card.id, version: card.version, ...rest });
  const city = () => ({
    places: [place('kris', scenes[0]), place('vera', scenes[1]), place('cafe', scenes[2])],
    characters: [
      person(cards[0], { placeId: 'kris', roomId: 'main', homeId: 'kris' }),
      person(cards[1], { placeId: 'vera', roomId: 'main', homeId: 'vera' }),
      person(cards[2], { placeId: 'kris', roomId: 'main', homeId: 'kris' }),
      person(cards[3], { placeId: 'cafe', roomId: 'front', ownedPlaceIds: ['cafe'], workplaceIds: ['cafe'] }),
    ],
  });
  const description = '傍晚的小鎮。Cass 暫住在 Kris 家，Vera 一個人住，店主在街角咖啡館準備打烊。三個地方走路都到得了。';
  const openingDraft = () => ({ body: { description, city: city() }, sources: { cards, scenes } });
  const openingWorld = async () => {
    const { world, preview } = await load('city-creation').prepareCity('trial', city(), seedWorld(), { scenes, cards });
    if (!world) throw new Error('範例開局建不起來：' + JSON.stringify(preview?.issues ?? []).slice(0, 400));
    delete world.openingResources;
    return world;
  };
  const fieldsOf = (card, keep) => Object.fromEntries(characterTemplateFieldNames.map(field => [field, !keep || keep.includes(field) ? String(card.fields[field] ?? '') : '']));
  const resourceRequest = '請為每個場所備妥住戶、主人與工作者日常生活所需、可直接取用的即食食物與可直接飲用的水，並確認他們對場所內既有日常陳設的使用權。';

  const tasks = {
    // 人物欄位補寫：只給名字與一句概念，其餘欄位全部留白，是輸出最長的情況。
    'character-generation': async run => {
      const card = cards[run % cards.length];
      const input = load('character-generation').readCharacterGeneration({ description: `${card.fields.name}：${String(card.fields.personality ?? '').slice(0, 80)}`, fields: fieldsOf(card, ['name']), purpose: 'character-card' });
      if (!input) throw new Error('人物補寫輸入不合規定');
      return load('character-generation').generateCharacterFields(input, service, options('人物欄位補寫'));
    },
    // 人物卡判讀：完整的範例人物卡文字，全部標為使用者來源。
    'card-assessment': async run => {
      const card = cards[run % cards.length], fields = fieldsOf(card);
      const provenance = Object.fromEntries(characterTemplateFieldNames.map(field => [field, { kind: fields[field] ? 'user' : 'empty', materiallyEdited: false }]));
      return load('character-formation').assessCharacterCard({ id: 'trial-draft', version: 1, concept: String(card.fields.name), fields, provenance }, service, options('人物卡判讀'));
    },
    'opening-arrangement': async () => load('opening-arrangement-model').arrangeOpening(openingDraft(), service, options('AI 開局整理')),
    // 逐房配物加上建議道路，是開局整理輸出最長的情況。
    'opening-arrangement-rooms': async () => load('opening-arrangement-model').arrangeOpening(openingDraft(), service, options('AI 開局整理（逐房配物＋道路）'), { supplyRooms: true, recommendRoads: true }),
    'opening-road-repair': async () => load('opening-road-repair').repairOpeningRoads(city(), service, options('補路建議')),
    'opening-resources': async () => load('opening-resources').suggestOpeningResources(await openingWorld(), resourceRequest, service, options('開局備料')),
  };
  const selected = Object.keys(tasks).filter(name => !only.length || only.includes(name));
  if (!selected.length) throw new Error('TRIAL_TASKS 沒有對到任何工作；可用：' + Object.keys(tasks).join(', '));

  const records = [];
  try {
    for (const task of selected) for (let run = 0; run < runs; run++) {
      const record = current = { task, run: run + 1, provider, model };
      try { await tasks[task](run); record.valid = true; }
      catch (error) { record.valid = false; record.error = String(error?.message || error).slice(0, 400); }
      records.push(record);
      fs.appendFileSync(base + '-calls.jsonl', JSON.stringify(record) + '\n');
      console.log(`${task} #${run + 1}：${record.chars ?? '無回覆'} 字元｜輸出 ${record.usage?.outputTokens ?? '?'} token｜${record.valid ? '通過驗證' : '未通過：' + record.error}`);
      // 第一次真實呼叫就連不上或被拒時不再繼續花錢。
      if (!dry && records.length === 1 && record.chars === undefined) throw new Error('第一次真實呼叫沒有取得回覆：' + record.error);
    }
  } finally { adapter.requestModel = original; }

  const lines = [`製作工作回覆大小量測｜${provider}／${model}｜每項 ${runs} 次${dry ? '｜DRY（不連網，固定回覆，只確認接線，數字無意義）' : ''}`, '',
    '| 工作 | 有回覆／次數 | 通過驗證 | 字元 最小／中位／最大 | 最大位元組 | 輸出 token 最大 | 輸出 token 上限 | 字元÷輸出 token 最小–最大 | 上限×4 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const task of selected) {
    const rows = records.filter(record => record.task === task), replied = rows.filter(record => record.chars !== undefined);
    const chars = replied.map(record => record.chars), ratios = replied.filter(record => record.usage?.outputTokens).map(record => record.chars / record.usage.outputTokens);
    const limit = rows.find(record => record.maxOutputTokens)?.maxOutputTokens;
    lines.push(`| ${task} | ${replied.length}／${rows.length} | ${rows.filter(record => record.valid).length} | ${chars.length ? `${Math.min(...chars)}／${median(chars)}／${Math.max(...chars)}` : '—'} | ${replied.length ? Math.max(...replied.map(record => record.bytes)) : '—'} | ${replied.some(record => record.usage) ? Math.max(...replied.map(record => record.usage?.outputTokens ?? 0)) : '—'} | ${limit ?? '—'} | ${ratios.length ? `${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)}` : '—'} | ${limit ? limit * 4 : '—'} |`);
  }
  lines.push('', '註：輸出 token 數由供應商回報，推理型模型可能把思考 token 也算在內，這時「字元÷輸出 token」會偏低。', '輸出 token 最大值等於上限時，回覆可能被截斷。', `逐筆紀錄（含原回覆全文，不含 Key）：${base}-calls.jsonl`);
  fs.writeFileSync(base + '-summary.md', lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n') + `\n摘要：${base}-summary.md`);
});
