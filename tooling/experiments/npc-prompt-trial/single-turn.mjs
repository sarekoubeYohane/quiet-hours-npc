// 單回合試驗：同一份輸入，分別用現行 prompt 與草稿打真實模型，回覆經正式的 aiDecision 驗證。
// 只測每位人物的第一個決定，不推進世界。用法見同資料夾的 README.md。
import { mkdtemp, readFile, writeFile, appendFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, '../../..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf('--' + name); return index >= 0 ? args[index + 1] : fallback; };
const dry = args.includes('--dry');
const mode = option('mode', 'both'), model = option('model', 'gpt-6-luna'), runs = Number(option('runs', '1'));
const who = option('who', 'all'), scenario = option('scenario', 'calm'), variant = option('variant', ''), worldKind = option('world', 'cafe');
const out = option('out') ?? await mkdtemp(join(tmpdir(), 'npc-prompt-trial-'));

const provider = process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY ? 'openrouter' : 'openai';
let key = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || '';
if (!key && option('key-file')) key = (await readFile(option('key-file'), 'utf8')).trim();
if (!key && !dry) { console.error('找不到 Key：請設定 OPENAI_API_KEY／OPENROUTER_API_KEY，或用 --key-file 指定檔案（加 --dry 則不連網）'); process.exit(2); }

// 把 lib 轉成 CommonJS 放到暫存目錄，做法與 tests/run-activities.mjs 相同
const build = await mkdtemp(join(tmpdir(), 'npc-prompt-trial-build-'));
const repoRequire = createRequire(join(repo, 'package.json'));
for (const file of (await readdir(join(repo, 'lib'))).filter(file => file.endsWith('.ts'))) {
  const result = ts.transpileModule(await readFile(join(repo, 'lib', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
  await writeFile(join(build, file.slice(0, -3) + '.cjs'), result.outputText
    .replace(/require\("(?:@\/lib\/|\.\/)([^"/]+)"\)/g, 'require("./$1.cjs")')
    .replace('require("cloudflare:workers")', 'require("./cloudflare-workers.cjs")')
    .replace('require("zod")', `require(${JSON.stringify(repoRequire.resolve('zod'))})`));
}
await writeFile(join(build, 'cloudflare-workers.cjs'), 'exports.env={APP_ENV:"local"};');
const load = createRequire(join(build, 'index.cjs'));
const { seedWorld } = load('./world.cjs'), { aiDecision } = load('./models.cjs'), { prepareCity } = load('./city-creation.cjs');
const examples = load('./example-content.cjs');
const { assemble, draftPath } = createRequire(import.meta.url)('./assemble.cjs');

// 單一變因的變體：每個只改草稿的一個地方，用來找行為差異的原因
let draft = (await readFile(draftPath, 'utf8')).replace(/\r\n/g, '\n');
const cut = text => { if (!draft.includes(text)) throw new Error('變體找不到要拿掉的文字，草稿可能已改：' + text.slice(0, 30)); draft = draft.replace(text, ''); };
if (variant === 'no-goal') cut('這場遊戲沒有主線，你的目標只有一個：**好好過日子**。這包括照顧自己的身體（餓、渴、累、睏）和心（心情與心力），也包括追求你在乎的事。做自己想做的事、享受過程或得到在意的結果，都可能讓心力恢復。怎麼取捨、先顧哪一樣，由你的性格決定。\n\n');
if (variant === 'no-findit') cut('不確定有什麼時，向場所提出「找找看」。');
if (variant === 'full-playbook') {
  const start = draft.indexOf('## 怎麼判斷'), end = draft.indexOf('\n# ', start);
  if (start < 0 || end < 0) throw new Error('找不到「怎麼判斷」小節');
  draft = draft.slice(0, start) + '## 怎麼判斷\n' + load('./playbook.cjs').npcPlaybook + '\n' + draft.slice(end);
}
if (variant && !['no-goal', 'no-findit', 'full-playbook', 'no-hints'].includes(variant)) { console.error('--variant 只接受 no-goal、no-findit、full-playbook、no-hints'); process.exit(2); }

async function buildWorld() {
  if (worldKind === 'minimal') {
    // 最小日常驗收場景：四人在咖啡館前台，有餐點、杯子、茶具。舊規則世界，沒有身體需求與精神電量。
    const world = await load('./acceptance-scene.cjs').enterAcceptanceScene(seedWorld());
    for (const character of world.characters) character.control = { mode: 'autonomous' };
    return world;
  }
  // 內建範例「街角咖啡館」：新規則世界（屬性、身體需求、精神電量），場景沒有物件。
  const placeIds = ['kris', 'vera', 'cafe'];
  const home = { 'card-example-cass': 'cafe', 'card-example-owner': 'cafe', 'card-example-vera': 'vera', 'card-example-kris': 'kris' };
  const cityDraft = {
    places: examples.exampleSceneTemplates.map((scene, index) => ({ id: placeIds[index], templateId: scene.id, version: scene.version, name: scene.name })),
    characters: examples.exampleCharacterCards.map(card => ({ templateId: card.id, version: card.version, placeId: home[card.id], roomId: home[card.id] === 'cafe' ? 'front' : 'main' })),
  };
  const { world, preview } = await prepareCity('trial', cityDraft, seedWorld(), { scenes: [...examples.exampleSceneTemplates], cards: [...examples.exampleCharacterCards] });
  if (preview.issues.length) throw new Error('範例世界建立失敗：' + preview.issues.join('；'));
  world.timeContract = 'five-minute-v1';
  for (const character of world.characters) {
    character.control = { mode: 'autonomous' };
    if (scenario === 'needy') {
      // 直接改數值做出「又餓又渴又睏、心力見底」，不是世界自然推進到的狀態
      const values = { hunger: 88, thirst: 86, fatigue: 70, sleep: 90 };
      Object.assign(character.needs.values, values);
      for (const need of Object.keys(values)) character.needs.personal.units[need] = values[need] * 60000000;
      character.mentalEnergy.value = Math.max(1, Math.floor(character.mentalEnergy.policy.lowAt / 2));
    }
  }
  return world;
}

const log = join(out, `single-${worldKind}-${variant || mode}-${scenario}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
async function once(prompt, name, run) {
  const world = await buildWorld(), character = world.characters.find(candidate => candidate.name === name);
  const record = { prompt, who: name, run, scenario, variant, world: worldKind, model, provider };
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    if (prompt === 'draft') {
      const input = JSON.parse(body.messages[1].content);
      if (variant === 'no-hints') delete input.activityHints;
      const assembled = assemble(input, character, { draft });
      body.messages[0].content = assembled.text; record.included = assembled.included;
      delete input.self.personality; delete input.self.goal; body.messages[1].content = JSON.stringify(input);
    }
    record.systemChars = body.messages[0].content.length;
    if (run === 1) {
      await writeFile(join(out, `single-${prompt}-${name}-system.txt`), body.messages[0].content);
      await writeFile(join(out, `single-${prompt}-${name}-input.json`), JSON.stringify(JSON.parse(body.messages[1].content), null, 2));
    }
    if (dry) throw new Error('dry run');
    const started = Date.now(), response = await fetch(url, { ...init, body: JSON.stringify(body) });
    record.ms = Date.now() - started; record.status = response.status;
    const text = await response.text();
    try { const json = JSON.parse(text); record.usage = json.usage; record.finish = json.choices?.[0]?.finish_reason; record.content = json.choices?.[0]?.message?.content; } catch { record.raw = text.slice(0, 2000); }
    if (response.status !== 200) record.raw = text.slice(0, 2000);
    return new Response(text, { status: response.status, headers: response.headers });
  };
  try {
    const decision = await aiDecision(world, character, key || 'dry-run-key-000000000000', model, provider, fetcher);
    Object.assign(record, { ok: true, action: decision.action, durationMinutes: decision.durationMinutes, interpretation: decision.interpretation, mood: decision.mood });
  } catch (error) { record.ok = false; record.error = `${error.name}: ${error.message}`; }
  await appendFile(log, JSON.stringify(record) + '\n');
  return record;
}

const names = { cass: 'Cass', vera: 'Vera', kris: 'Kris', owner: '店主' };
const people = who === 'all' ? Object.values(names) : [names[who]];
if (people.includes(undefined)) { console.error('--who 只接受 all、cass、vera、kris、owner'); process.exit(2); }
const prompts = mode === 'both' ? ['current', 'draft'] : [mode];
if (prompts.some(prompt => !['current', 'draft'].includes(prompt))) { console.error('--mode 只接受 both、current、draft'); process.exit(2); }
console.log(`模型 ${model}（${provider}）｜世界 ${worldKind}｜情境 ${scenario}${variant ? '｜變體 ' + variant : ''}｜${prompts.length} 種 prompt × ${people.length} 位人物 × ${runs} 次 = ${prompts.length * people.length * runs} 次呼叫${dry ? '（--dry，不連網）' : ''}\n`);

const records = [];
for (const name of people) for (const prompt of prompts) for (let run = 1; run <= runs; run++) {
  const record = await once(prompt, name, run); records.push(record);
  const tail = dry ? `條件段落：${(record.included || []).join('、') || '—'}`
    : record.ok ? `✓ ${record.action.type}${record.action.target ? '→' + record.action.target : ''} ${record.durationMinutes}分 「${(record.action.content || record.interpretation || '').slice(0, 40)}」`
      : `✗ ${record.error.slice(0, 120)}`;
  console.log(`${name.padEnd(5)} ${prompt.padEnd(7)} #${run}  system ${String(record.systemChars).padStart(5)} 字  ${dry ? '' : `${record.ms ?? '-'}ms in=${record.usage?.prompt_tokens ?? '-'} out=${record.usage?.completion_tokens ?? '-'}  `}${tail}`);
}
if (!dry) {
  console.log('\n摘要');
  for (const prompt of prompts) {
    const mine = records.filter(record => record.prompt === prompt), average = field => Math.round(mine.reduce((sum, record) => sum + (record.usage?.[field] || 0), 0) / mine.length);
    console.log(`${prompt.padEnd(7)} 通過 ${mine.filter(record => record.ok).length}/${mine.length}｜平均輸入 ${average('prompt_tokens')} tokens、輸出 ${average('completion_tokens')} tokens｜平均 ${Math.round(mine.reduce((sum, record) => sum + (record.ms || 0), 0) / mine.length)} ms`);
  }
}
console.log(`\n紀錄與實際送出的 prompt：${out}`);
