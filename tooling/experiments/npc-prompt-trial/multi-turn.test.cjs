/* eslint-disable @typescript-eslint/no-require-imports -- 實驗腳本，由 tests/run-activities.mjs 以 node:test 執行。 */
// 多回合試驗：在最小日常驗收場景裡，經正式的 world route 連續推進世界。
// NPC 決策與天上意志裁定都打真實模型；TRIAL_PROMPT=draft 時把 NPC 的 system prompt 換成草稿。
// 由 tests/run-activities.mjs 啟動（它負責把 lib 與 route 編譯到暫存目錄）。用法見同資料夾的 README.md。
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const os = require('node:os');
const { assemble } = require('./assemble.cjs');
const dir = process.env.TRIAL_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'npc-prompt-trial-')), promptKind = process.env.TRIAL_PROMPT || 'current', rounds = Number(process.env.TRIAL_ROUNDS || 6);
const model = process.env.TRIAL_MODEL || 'gpt-6-luna', adjModel = process.env.TRIAL_ADJ_MODEL || 'gpt-6.1-sol', dry = process.env.TRIAL_DRY === '1';
const stamp = process.env.TRIAL_STAMP || new Date().toISOString().replace(/[:.]/g, '-');
const base = path.join(dir, `multi-${promptKind}${process.env.TRIAL_FEEDBACK === '1' ? '-fb' : ''}-${stamp}`);
// TRIAL_FEEDBACK=1：回合被 parser 擋下後，下一次把拒絕原因告訴同一個角色（原型，產品目前沒有這個行為，見 #340）
const feedback = process.env.TRIAL_FEEDBACK === '1'; const rejection = {};
const hints = {
  '收斂與當下正式焦點不一致': 'pursuitSelection.focus 和 focusIntentId 必須指向同一個仍在進行的追求。這回合被你評為滿足（satisfied）或放下（drop）的追求不能當焦點：把焦點改指另一個還在進行的追求，或把 focus、focusIntentId 填 null、methodAssessment.intentIds 填空陣列。',
  '方法與追求焦點不一致': 'methodAssessment.intentIds 必須和 focusIntentId 一致；沒有焦點時兩者分別是空陣列和 null。',
  '方法評估與本次行動或意圖引用不一致。': 'methodAssessment.selectedAction 的 type、target 必須和 action 相同；choice 只有在 action.type 也是 continue 時才能填 continue；intentIds 只能列仍在進行的追求。',
};
const feedbackText = reason => '\n\n【上一次的回覆沒有被接受】原因：' + reason + (hints[reason] ? '\n怎麼修正：' + hints[reason] : '') + '\n請修正這一點，重新給出完整的回覆；其餘的決定可以維持原樣。';

test('multi-turn trial', { timeout: 60 * 60 * 1000 }, async () => {
  // 只改暫存編譯目錄裡的副本，不動 repo：讓 parser 的拒絕原因出現在錯誤訊息裡，方便診斷。
  { const p = path.join(process.env.QUIET_HOURS_TEST_BUILD, 'models.cjs'); let m = fs.readFileSync(p, 'utf8'); const k = "throw Error('模型未回傳有效的意圖與行動格式。請換個模型再試。')"; if (m.includes(k)) fs.writeFileSync(p, m.replace(k, "throw Error('模型未回傳有效的意圖與行動格式。｜原因：'+(e&&e.message)+'｜階段：'+candidateStage)")); }
  const { GET, POST } = load('route'), store = load('store'), { seedWorld } = load('world');
  const key = dry ? 'dry-run-key-000000000000000000' : process.env.OPENAI_API_KEY || (process.env.TRIAL_KEY_FILE ? fs.readFileSync(process.env.TRIAL_KEY_FILE, 'utf8').trim() : '');
  if (!key) throw new Error('找不到 Key：請設定 OPENAI_API_KEY 或 TRIAL_KEY_FILE（TRIAL_DRY=1 則不連網）');
  const read = async () => (await (await GET()).json()).world;
  const world = seedWorld(); world.adjudication = { provider: 'openai', model: adjModel }; world.playerBudget = { calls: 2000, tokens: 50000000 };
  store.install(world);
  const post = async body => POST(new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy': 'round-v1' }, body: JSON.stringify({ operationScope: 'test-owner', operationId: Date.now() + ':' + crypto.randomUUID(), worldContext: (await read()).contextId, mode: 'openai', model, ...body }) }));
  const must = async (label, body) => { const r = await post(body); if (r.status !== 200) throw new Error(`${label} 失敗：${r.status} ${(await r.text()).slice(0, 300)}`); };
  await must('set-model-key', { operation: 'set-model-key', key });
  await must('enter-acceptance', { operation: 'enter-acceptance' });

  let round = 0; const calls = [];
  const realFetch = global.fetch;
  const fixture = dry ? require(path.join(process.cwd(), 'tests/pursuit-fixture.cjs')).fixtureDecision : null;
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body); let input; try { input = JSON.parse(body.messages[1].content); } catch { input = {}; }
    const kind = input.contractVersion === 'world-adjudication.v1' ? 'adjudication' : String(body.messages[0].content).startsWith('你是生活模擬中的一名 NPC') ? 'npc' : 'other';
    const rec = { round, kind, who: input.self?.name ?? null, model: body.model };
    if (kind === 'npc') {
      rec.currentActivity = input.currentActivity ? true : false; rec.shortTerm = input.self.shortTerm?.length; rec.longTerm = input.self.longTerm?.length; rec.intents = input.self.intents?.length;
      if (promptKind === 'draft') { const a = assemble(input, input.self); body.messages[0].content = a.text; rec.included = a.included; delete input.self.personality; delete input.self.goal; body.messages[1].content = JSON.stringify(input); }
    }
    if (kind === 'npc' && feedback && rejection[rec.who]) { body.messages[0].content += feedbackText(rejection[rec.who]); rec.feedback = rejection[rec.who]; }
    rec.systemChars = body.messages[0].content.length;
    calls.push(rec);
    if (dry) {
      const value = kind === 'npc' ? fixture(input, { type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 30, intents: [] }) : { status: 'rejected' };
      rec.content = JSON.stringify(value); fs.appendFileSync(base + '-calls.jsonl', JSON.stringify(rec) + '\n');
      return Response.json({ usage: { prompt_tokens: 1, completion_tokens: 1 }, choices: [{ message: { content: rec.content } }] });
    }
    const t = Date.now(); const res = await realFetch(url, { ...init, body: JSON.stringify(body) }); rec.ms = Date.now() - t; rec.status = res.status;
    const text = await res.text();
    try { const j = JSON.parse(text); rec.usage = j.usage && { in: j.usage.prompt_tokens, out: j.usage.completion_tokens }; rec.finish = j.choices?.[0]?.finish_reason; rec.content = j.choices?.[0]?.message?.content; } catch { rec.raw = text.slice(0, 1500); }
    if (res.status !== 200) rec.raw = text.slice(0, 1500);
    fs.appendFileSync(base + '-calls.jsonl', JSON.stringify(rec) + '\n');
    return new Response(text, { status: res.status, headers: res.headers });
  };

  const lines = []; const say = s => { lines.push(s); fs.writeFileSync(base + '-summary.txt', lines.join('\n') + '\n'); };
  say(`多回合測試｜prompt=${promptKind}｜NPC 模型=${model}｜裁定模型=${adjModel}｜回饋拒絕原因=${feedback ? '開' : '關'}｜回合數=${rounds}${dry ? '｜DRY（不連網）' : ''}`);
  let before = await read(), eventsSeen = before.events.length, ok = 0, failed = 0;
  try {
    for (round = 1; round <= rounds; round++) {
      const t = Date.now(); const from = calls.length;
      let status, error;
      try { const r = await post({ operation: 'advance', minutes: 15 }); status = r.status; if (status !== 200) error = (await r.json().catch(() => ({}))).error; } catch (e) { status = 'throw'; error = e.message; }
      const w = await read(); const mine = calls.slice(from);
      if (status === 200) ok++; else failed++; if (status === 200) { for (const k of Object.keys(rejection)) delete rejection[k]; } else { const r = /原因：([^｜]+)/.exec(String(error || '')), lastNpc = [...mine].reverse().find(c => c.kind === 'npc'); if (r && lastNpc?.who && String(error).includes('npc-candidate')) rejection[lastNpc.who] = r[1]; } if (status !== 200 && mine.length) { const last = mine[mine.length - 1]; error = `${error}｜最後一次呼叫：${last.kind} ${last.who ?? ''}`; }
      say(`\n── 第 ${round} 回合｜${status === 200 ? '成功' : '失敗 ' + status}｜世界時間 ${String(Math.floor(w.minute / 60) % 24).padStart(2, '0')}:${String(w.minute % 60).padStart(2, '0')}｜${Math.round((Date.now() - t) / 1000)} 秒｜NPC 呼叫 ${mine.filter(c => c.kind === 'npc').length}、裁定 ${mine.filter(c => c.kind === 'adjudication').length}${error ? '｜' + error : ''}`);
      for (const c of mine.filter(c => c.kind === 'npc')) { let d; try { d = JSON.parse(c.content); } catch {} say(`   ${c.who}：${d?.action ? `${d.action.type}${d.action.target ? '→' + d.action.target : ''}「${(d.action.content || '').slice(0, 50)}」${d.durationMinutes}分` : '（回覆無法解析）'}${c.feedback ? '　〔已回饋上次原因〕' : ''}`); }
      for (const e of w.events.slice(eventsSeen)) say(`   • ${String(e.text || '').slice(0, 110)}`);
      eventsSeen = w.events.length;
      say(`   狀態：餐點剩 ${w.supplies?.find(s => s.id === 'acceptance-meal')?.remaining ?? '?'}｜杯子 ${JSON.stringify(w.objects.find(o => o.id === 'acceptance-cup')?.state)} 持有 ${w.objects.find(o => o.id === 'acceptance-cup')?.holder ?? '無'}｜物件數 ${w.objects.length}`);
      for (const c of w.characters) say(`   ${c.name}＠${c.region || c.location}：${c.activity}${c.plan ? `（進行到 ${c.plan.until}）` : ''}`);
      fs.appendFileSync(base + '-rounds.jsonl', JSON.stringify({ round, status, error, minute: w.minute, characters: w.characters.map(c => ({ name: c.name, activity: c.activity, region: c.region, intents: (c.intents || []).map(i => ({ id: i.id, content: i.content, status: i.status })), shortTerm: c.shortTerm?.length, longTerm: c.longTerm?.length })), objects: w.objects, supplies: w.supplies }) + '\n');
    }
  } finally { global.fetch = realFetch; }
  const npc = calls.filter(c => c.kind === 'npc'), adj = calls.filter(c => c.kind === 'adjudication'); const sum = (a, k) => a.reduce((x, c) => x + (c.usage?.[k] || 0), 0);
  say(`\n══ 總結 ══\n回合：成功 ${ok}、失敗 ${failed}\nNPC 呼叫 ${npc.length} 次｜平均輸入 ${Math.round(sum(npc, 'in') / (npc.length || 1))} tokens、輸出 ${Math.round(sum(npc, 'out') / (npc.length || 1))} tokens\n裁定呼叫 ${adj.length} 次｜平均輸入 ${Math.round(sum(adj, 'in') / (adj.length || 1))} tokens、輸出 ${Math.round(sum(adj, 'out') / (adj.length || 1))} tokens\n總 token：輸入 ${sum(calls, 'in')}、輸出 ${sum(calls, 'out')}`);
  if (promptKind === 'draft') { const t = {}; for (const c of npc) for (const s of c.included || []) t[s] = (t[s] || 0) + 1; say(`條件段落觸發次數：${JSON.stringify(t)}`); }
  console.log(`紀錄：${base}-summary.txt`);
});
