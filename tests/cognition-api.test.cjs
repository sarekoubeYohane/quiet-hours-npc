/* eslint-disable @typescript-eslint/no-require-imports -- API fixtures. */
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = build('world'), { GET, POST } = build('route'), store = build('store');
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy':'round-v1' }, body: JSON.stringify({ operationId: `${Date.now()}:${crypto.randomUUID()}`, mode: 'demo', ...body }) });
const read = async () => (await (await GET()).json()).world;
const evidence = input => [{ kind: 'short', id: input.self.shortTerm[0].id, version: input.self.shortTerm[0].version }];
const belief = (input, extra = {}) => ({ kind: 'belief', operation: 'upsert', id: 'personal-space', version: 0, topic: '相處距離', text: '我可以在乎別人，同時保有自己的空間。', conviction: 'leaning', references: evidence(input), contradictions: [], reason: '這件事會影響我之後怎麼相處。', ...extra });
async function withModel(choose, run) {
  const previous = global.fetch, inputs = [];
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body), input = JSON.parse(body.messages[1].content); inputs.push(input);
    return Response.json({ usage: { prompt_tokens: 10, completion_tokens: 5 }, choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 15, intents: [], attentionConditions: [], memorySelections: [], cognitiveUpdates: [], interpretation: '', ...choose(input) }) } }] });
  };
  try {
    await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
    await POST(request({ operation: 'set-budget', limits: { calls: 120, tokens: 500000 } }));
    await run(inputs, body => POST(request({ operation: 'advance', mode: 'openai', model: 'gpt-6-luna', minutes: 15, limits: { calls: 120, tokens: 500000 }, ...body })));
  } finally { global.fetch = previous; }
}
const worldWithAdjudication = require('./fixtures/ai-world.cjs')(seedWorld);

test('one existing decision saves a belief before its intention and legal action, while merely heard claims need not become beliefs', async () => {
  const w = worldWithAdjudication(); store.install(w);
  await withModel(input => input.self.id === 'cass' ? {
    cognitiveUpdates: [belief(input)], interpretation: '這次我想先安排自己的生活。',
    intents: [{ id: 'visit-cafe', content: '找個地方安頓自己的節奏', intensity: 'medium', importance: 'high', urgency: 'low', context: '依目前對相處距離的看法' }], type: 'move', target: 'cafe', mood: '安心',
  } : {}, async (inputs, advance) => {
    const operationId = `${Date.now()}:${crypto.randomUUID()}`, response = await advance({ operationId });
    assert.equal(response.status, 200); const result = await response.json(), after = await read(), cass = after.characters[0];
    assert.equal(cass.cognition.beliefs.length, 1); assert.equal(cass.cognition.beliefs[0].conviction, 'leaning');
    assert.equal(cass.cognition.beliefs[0].characterId, 'cass'); assert.equal(cass.intents[0].id, 'visit-cafe');
    assert.equal(cass.location, 'cafe'); assert.equal(cass.mood, '安心');
    assert.ok(after.events.some(event => event.actor === 'cass' && event.kind === 'move'));
    assert.equal(after.characters[1].cognition?.beliefs.length || 0, 0);
    assert.equal(inputs.length, 4); assert.deepEqual(await (await advance({ operationId })).json(), result); assert.equal(inputs.length, 4);
  });
});
test('similar beliefs update in place, keep or withdraw with reasons, and old views stay out of later decision input', async () => {
  store.install(worldWithAdjudication()); let stage = 0;
  await withModel(input => input.self.id !== 'cass' ? {} : {
    cognitiveUpdates: stage === 0 ? [belief(input, { text: 'OLD_VIEW_ONLY', conviction: 'certain' })] : stage === 1 ? [belief(input, { version: 1, text: '新的看法仍有疑問', conviction: 'doubtful', reason: '新經歷使我重新理解。' })] : stage === 2 || stage === 3 ? [{ kind: 'belief', operation: stage === 2 ? 'keep' : 'withdraw', id: 'personal-space', version: 2, references: evidence(input), reason: stage === 2 ? '我聽見新說法，但目前還不願改觀。' : '我想先放下這個看法。' }] : [],
  }, async (inputs, advance) => {
    for (stage = 0; stage < 5; stage++) {
      assert.equal((await advance()).status, 200);
      const cass = (await read()).characters[0], current = inputs.findLast(input => input.self.id === 'cass');
      if (stage === 0) assert.equal(cass.cognition.beliefs[0].version, 1);
      if (stage === 1 || stage === 2) { assert.equal(cass.cognition.beliefs.length, 1); assert.equal(cass.cognition.beliefs[0].version, 2); assert.equal(cass.cognition.beliefs[0].conviction, 'doubtful'); }
      if (stage >= 2) assert.equal(JSON.stringify(current).includes('OLD_VIEW_ONLY'), false);
      if (stage >= 3) assert.equal(cass.cognition.beliefs.length, 0);
    }
    const trace = (await read()).characters[0].cognition.trace;
    assert.deepEqual(trace.map(item => item.operation), ['upsert', 'keep', 'withdraw']);
    assert.equal(trace[0].version, 1); assert.equal(trace[0].nextVersion, 2); assert.equal(trace[0].conviction, 'certain');
    assert.ok(trace.every(item => item.reason && !Object.hasOwn(item, 'text')));
  });
});
test('relationship tags express topic-dependent trust and explicitly replace legacy views without restoring withdrawn tags', async () => {
  const w = worldWithAdjudication(); w.characters[0].relationships.kris = 'LEGACY_RELATION_ONLY'; store.install(w); let stage = 0;
  const tag = (input, id, topic, text, version = 0) => ({ kind: 'relationship', operation: 'upsert', id, version, person: 'kris', topic, text, references: evidence(input), reason: '不同事情可以有不同程度的信任。' });
  await withModel(input => {
    if (input.self.id !== 'cass') return {};
    const legacy = input.self.cognition.relationshipTags.find(item => item.person === 'kris' && item.origin === 'legacy-unclassified');
    return { cognitiveUpdates: stage === 0 ? [tag(input, 'food-trust', '料理', '相信她能照顧好餐食。'), tag(input, 'secret-doubt', '私密談話', '我還不確定能不能把私事全說出來。'), { kind: 'relationship', operation: 'withdraw', id: legacy.id, version: legacy.version, references: evidence(input), reason: '整句舊印象改成按情境分開的看法。' }] : stage === 1 ? [tag(input, 'food-trust', '料理', '仍相信她的料理，但想自己安排飲食。', 1), { kind: 'relationship', operation: 'keep', id: 'secret-doubt', version: 1, references: evidence(input), reason: '我仍不願在這個話題上全盤相信。' }] : stage === 2 ? [{ kind: 'relationship', operation: 'withdraw', id: 'food-trust', version: 2, references: evidence(input), reason: '暫時放下這個標籤。' }] : [] };
  }, async (inputs, advance) => {
    for (stage = 0; stage < 4; stage++) {
      assert.equal((await advance()).status, 200); const cass = (await read()).characters[0];
      if (stage === 0) { assert.equal(cass.cognition.relationshipTags.filter(item => item.person === 'kris').length, 2); assert.equal(cass.cognition.beliefs.length, 0); }
      if (stage >= 1) assert.equal(JSON.stringify(inputs.findLast(input => input.self.id === 'cass')).includes('LEGACY_RELATION_ONLY'), false);
      if (stage >= 2) { assert.equal(cass.cognition.relationshipTags.some(item => item.id === 'food-trust'), false); assert.ok(cass.relationships.kris.includes('我還不確定')); assert.equal(cass.relationships.kris.includes('料理'), false); }
    }
    assert.equal((await read()).characters[0].cognition.trace.at(-1).operation, 'withdraw');
  });
});
test('mistaken certainty and unresolved contradictory beliefs coexist until the NPC explicitly changes them', async () => {
  store.install(worldWithAdjudication()); let stage = 0;
  await withModel(input => input.self.id !== 'cass' ? {} : { cognitiveUpdates: stage === 0 ? [belief(input, { text: '我深信對方今晚會聯絡我。', conviction: 'certain' })] : stage === 1 ? [belief(input, { id: 'contrary-view', text: '也許對方不會想聯絡我。', conviction: 'doubtful', contradictions: ['personal-space'], reason: '兩個看法仍衝突，我還不想決定。' })] : stage === 2 ? [{ kind: 'belief', operation: 'keep', id: 'personal-space', version: 1, references: evidence(input), reason: '我仍相信自己的判斷，雖然有另一個念頭。' }] : [] }, async (inputs, advance) => {
    for (stage = 0; stage < 4; stage++) assert.equal((await advance()).status, 200);
    const cass = (await read()).characters[0]; assert.equal(cass.cognition.beliefs.length, 2);
    assert.equal(cass.cognition.beliefs[0].conviction, 'certain'); assert.deepEqual(cass.cognition.beliefs[1].contradictions, ['personal-space']);
    assert.equal(inputs.findLast(input => input.self.id === 'cass').self.cognition.beliefs.length, 2);
    assert.ok((await read()).characters.every(character => character.intents.length === 0));
  });
});
test('only a bounded set of related relationship tags is visible and omitted tags cannot be changed', async () => {
  const w = worldWithAdjudication(), cass = w.characters[0];
  cass.intents = [{ id: 'contact-vera', content: '想和 Vera 商量聯絡方式', intensity: 'low', importance: 'medium', urgency: 'low', context: '' }];
  cass.cognition = { beliefs: [], relationshipTags: Array.from({ length: 20 }, (_, index) => ({ id: `topic-${index}`, characterId: 'cass', version: 1, time: 0, person: 'vera', topic: `話題${index}`, text: `話題${index}仍有自己的想法`, references: [], origin: 'legacy-unclassified' })), trace: [] }; store.install(w);
  const before = await read();
  await withModel(input => input.self.id === 'cass' ? { cognitiveUpdates: [{ kind: 'relationship', operation: 'withdraw', id: 'topic-19', version: 1, references: evidence(input), reason: '未展示的候選不能被修改。' }] } : {}, async (inputs, advance) => {
    assert.equal((await advance()).status, 502); const input = inputs.find(item => item.self.id === 'cass');
    assert.ok(input.self.cognition.relationshipTags.length <= 8); assert.ok(input.self.cognition.relationshipTags.every(item => item.person === 'vera'));
    assert.equal(input.self.cognition.relationshipTags.some(item => item.id === 'topic-19'), false);
    assert.equal(JSON.stringify(input.self.relationships).includes('話題19'), false);
    assert.deepEqual((await read()).characters, before.characters);
  });
});
test('the shared 88 KiB decision budget includes beliefs and tags without deleting omitted saved content', async () => {
  const w = worldWithAdjudication(), c = w.characters[0]; c.memories = [];
  c.shortTerm = Array.from({ length: 80 }, (_, i) => ({ id: `recent-${i}`, characterId: c.id, version: 1, time: i, text: '甲'.repeat(160), source: { kind: 'experience' } }));
  c.longTerm = Array.from({ length: 58 }, (_, i) => ({ id: `long-${i}`, characterId: c.id, version: 1, time: i, text: '乙'.repeat(280), source: { kind: 'experience' }, origin: { id: `past-${i}`, version: 1 }, reason: '重要' }));
  c.cognition = { beliefs: Array.from({ length: 24 }, (_, i) => ({ id: `belief-${i}`, characterId: c.id, version: 1, time: 0, topic: `主題${i}`, text: '丙'.repeat(125), conviction: 'leaning', references: [], contradictions: [], reason: '仍在乎' })), relationshipTags: [], trace: [] }; store.install(w);
  await withModel(() => ({}), async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const input = inputs.find(item => item.self.id === 'cass');
    const memory = { shortTerm: input.self.shortTerm, longTerm: input.self.longTerm, cognition: input.self.cognition, memories: input.self.memories, observations: input.self.observations, relationships: input.self.relationships, knownControlExperiences: input.knownControlExperiences, pendingInterventions: input.pendingInterventions };
    assert.ok(Buffer.byteLength(JSON.stringify(memory)) <= 88 * 1024); assert.equal(input.self.shortTerm.length, 80);
    const saved = (await read()).characters[0]; assert.equal(saved.cognition.beliefs.length, 24); assert.equal(saved.longTerm.length, 58);
  });
});
test('invalid cognitive references, versions and shared operation capacity restore the whole round and replay paid failure', async () => {
  for (const invalid of ['foreign-reference', 'stale-reference', 'unknown-person', 'combined-count', 'conviction', 'reason-bytes', 'extra-field']) {
    const w = worldWithAdjudication(); for (const c of w.characters) c.shortTerm = Array.from({ length: 4 }, (_, i) => ({ id: `${c.id}-recent-${i}`, characterId: c.id, version: 1, time: i, text: '自己的經歷', source: { kind: 'experience' } }));
    store.install(w); const before = await read(); let calls = 0;
    await withModel(input => {
      const candidate = belief(input); if (calls++ === 0) return { cognitiveUpdates: [candidate] };
      if (invalid === 'foreign-reference') candidate.references[0].id = before.characters[0].shortTerm[0].id;
      if (invalid === 'stale-reference') candidate.references[0].version = 999;
      if (invalid === 'conviction') candidate.conviction = 'objective-correct';
      if (invalid === 'reason-bytes') candidate.reason = '界'.repeat(86);
      if (invalid === 'extra-field') candidate.hiddenTruth = '不能新增世界真相欄位';
      if (invalid === 'unknown-person') return { cognitiveUpdates: [{ kind: 'relationship', operation: 'upsert', id: 'new-tag', version: 0, person: 'hidden-person', topic: '秘密', text: '無權引用未知人物', references: evidence(input), reason: '無效引用' }] };
      return { cognitiveUpdates: [candidate], ...(invalid === 'combined-count' ? { memorySelections: input.self.shortTerm.slice(0, 4).map(item => ({ id: item.id, version: item.version, reason: '共同工作量已滿' })) } : {}) };
    }, async (inputs, advance) => {
      const operationId = `${Date.now()}:${crypto.randomUUID()}`, response = await advance({ operationId }); assert.equal(response.status, 502, invalid); const failure = await response.json();
      const after = await read(); assert.deepEqual(after.characters, before.characters); assert.deepEqual(after.events, before.events);
      assert.equal(after.aiUsage.totalCalls, 2); assert.equal(after.aiUsage.totalInputTokens, 20);
      assert.deepEqual(await (await advance({ operationId })).json(), failure); assert.equal(inputs.length, 2);
    });
  }
});
test('explicit metadata-only history release allows further changes at capacity without reviving old views', async () => {
  const w = worldWithAdjudication(), c = w.characters[0];
  c.cognition = { beliefs: [], relationshipTags: [], trace: Array.from({ length: 24 }, (_, i) => ({ traceId: `history-${i}`, kind: 'belief', id: `past-${i}`, version: 1, operation: 'withdraw', time: i, reason: '曾經相信，後來撤回', references: [], conviction: 'certain' })) }; store.install(w); let stage = 0;
  await withModel(input => input.self.id !== 'cass' ? {} : { cognitiveUpdates: [{ kind: 'history', operation: 'forget', id: input.self.cognition.historyCandidates[0].traceId, version: 1, reason: '這段更正中介資料已無需保留。' }, belief(input, { version: stage, text: `目前第${stage + 1}次理解`, reason: '我又重新看待這件事。' })] }, async (inputs, advance) => {
    for (stage = 0; stage < 8; stage++) {
      assert.equal((await advance()).status, 200); const saved = (await read()).characters[0];
      assert.equal(saved.cognition.beliefs[0].version, stage + 1); assert.ok(saved.cognition.trace.length <= 24);
      const candidates = inputs.findLast(input => input.self.id === 'cass').self.cognition.historyCandidates;
      assert.ok(candidates.length <= 8); assert.ok(candidates.every(item => !Object.hasOwn(item, 'text') && !Object.hasOwn(item, 'reason') && !Object.hasOwn(item, 'references')));
    }
  });
});
test('saved cognitive state rejects duplicate identities and unbounded old-text history rather than leaking it into the model', async () => {
  for (const invalid of ['duplicate-belief', 'history-text', 'history-reason-bytes']) {
    const w = worldWithAdjudication(), c = w.characters[0], current = { id: 'b', characterId: c.id, version: 1, time: 0, topic: '自己的理解', text: '仍是目前的看法', conviction: 'leaning', references: [], contradictions: [], reason: '影響之後的意圖' };
    c.cognition = { beliefs: [current], relationshipTags: [], trace: [] };
    if (invalid === 'duplicate-belief') c.cognition.beliefs.push({ ...current });
    else c.cognition.trace.push({ traceId: 'history', kind: 'belief', id: 'past', version: 1, operation: 'withdraw', time: 0, reason: invalid === 'history-reason-bytes' ? '界'.repeat(86) : '已撤回', references: [], ...(invalid === 'history-text' ? { text: 'OLD_SECRET_FULL_TEXT' } : {}) });
    store.install(w); assert.equal((await GET()).status, 503, invalid);
  }
});
test('a reconsidered continuation can change present emotion without adding a separate cognitive call', async () => {
  store.install(worldWithAdjudication()); let reconsider = false;
  await withModel(input => input.self.id === 'cass' ? { type: reconsider ? 'continue' : 'rest', durationMinutes: 90, mood: reconsider ? '安心' : '難過', interpretation: reconsider ? '剛才的消息讓我理解自己仍有選擇。' : '我想先緩一緩。', cognitiveUpdates: reconsider ? [belief(input)] : [] } : { durationMinutes: 90 }, async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const before = await read(), plan = before.characters[0].plan;
    reconsider = true; assert.equal((await POST(request({ operation: 'intervene', target: 'cass', text: '你仍然可以自己決定休息多久。' }))).status, 200);
    assert.equal((await advance()).status, 200); const cass = (await read()).characters[0];
    assert.equal(cass.mood, '安心'); assert.equal(cass.plan.until, plan.until); assert.equal(cass.cognition.beliefs.length, 1);
    assert.equal(inputs.filter(input => input.self.id === 'cass').length, 2); assert.equal(inputs.length, 5);
  });
});
test('redundant keep metadata can be released at hard capacity while a referenced changed version remains protected', async () => {
  const w = worldWithAdjudication(), c = w.characters[0];
  const current = { id: 'personal-space', characterId: c.id, version: 1, time: 0, topic: '相處距離', text: '我仍相信能保留自己的空間', conviction: 'leaning', references: [{ kind: 'short', id: c.shortTerm[0].id, version: 1 }], contradictions: [], reason: '持續影響相處' };
  c.cognition = { beliefs: [current, { ...current, id: 'related-belief', topic: '接下來的生活', text: '另一個看法以目前的相處理解為依據', references: [{ kind: 'belief', id: 'personal-space', version: 1 }] }], relationshipTags: [], trace: Array.from({ length: 24 }, (_, i) => ({ traceId: `keep-${i}`, kind: 'belief', id: 'personal-space', version: 1, operation: 'keep', time: i, reason: '暫時仍然相信', references: [], conviction: 'leaning' })) }; store.install(w);
  let changedTrace;
  await withModel(input => input.self.id !== 'cass' ? {} : { cognitiveUpdates: changedTrace ? [{ kind: 'history', operation: 'forget', id: changedTrace, version: 1, reason: '仍被另一現行看法引用的舊版本不可刪除' }] : [{ kind: 'history', operation: 'forget', id: input.self.cognition.historyCandidates[0].traceId, version: 1, reason: '重複堅持紀錄不是必要來源鏈' }, belief(input, { version: 1, text: '我重新理解了自己需要的距離。' })] }, async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const saved = (await read()).characters[0];
    assert.equal(saved.cognition.beliefs[0].version, 2); assert.equal(saved.cognition.trace.length, 24);
    const candidates = inputs.find(item => item.self.id === 'cass').self.cognition.historyCandidates; assert.ok(candidates.length > 0);
    changedTrace = saved.cognition.trace.find(item => item.operation === 'upsert').traceId;
    const before = await read(); assert.equal((await advance()).status, 502);
    assert.deepEqual((await read()).characters, before.characters);
    assert.ok((await read()).characters[0].cognition.trace.some(item => item.traceId === changedTrace));
  });
});
test('at hard capacity a whole candidate can release a formerly required version after explicitly changing its last current reference', async () => {
  for (const historyFirst of [true, false]) {
    const w = worldWithAdjudication(), c = w.characters[0];
    c.cognition = { beliefs: Array.from({ length: 24 }, (_, i) => ({ id: `current-${i}`, characterId: c.id, version: 1, time: 0, topic: `主題${i}`, text: '依以前的理解形成目前看法', conviction: 'leaning', references: [{ kind: 'belief', id: `past-${i}`, version: 1 }], contradictions: [], reason: '目前仍有影響' })), relationshipTags: [], trace: Array.from({ length: 24 }, (_, i) => ({ traceId: `anchor-${i}`, kind: 'belief', id: `past-${i}`, version: 1, operation: 'upsert', nextVersion: 2, time: i, reason: '曾相信，後來改觀', references: [], conviction: 'certain' })) }; store.install(w);
    let invalid = false;
    await withModel(input => {
      if (input.self.id !== 'cass') return {};
      const update = belief(input, { id: 'current-0', version: invalid ? 2 : 1, topic: '主題0', text: '改為依近期經歷理解，不再依那個舊版本', reason: '明示改變來源依據' });
      const release = { kind: 'history', operation: 'forget', id: invalid ? 'anchor-1' : 'anchor-0', version: 1, reason: '最後引用者已明示更新後才可釋放' };
      return { cognitiveUpdates: historyFirst ? [release, update] : [update, release] };
    }, async (inputs, advance) => {
      assert.equal((await advance()).status, 200); const saved = await read(), cass = saved.characters[0];
      assert.equal(cass.cognition.beliefs[0].version, 2); assert.equal(cass.cognition.trace.length, 24); assert.equal(cass.cognition.trace.some(item => item.traceId === 'anchor-0'), false);
      const shown = inputs.find(input => input.self.id === 'cass').self.cognition.historyCandidates; assert.ok(shown.some(item => item.traceId === 'anchor-0' && item.required)); assert.ok(shown.length <= 8);
      invalid = true; assert.equal((await advance()).status, 502); assert.deepEqual((await read()).characters, saved.characters);
      assert.ok((await read()).characters[0].cognition.trace.some(item => item.traceId === 'anchor-1'));
    });
  }
});
test('an actually known message sender can receive contextual relationship tags without granting anonymous or diagnostic identities', async () => {
  store.install(worldWithAdjudication());
  assert.equal((await POST(request({ operation: 'intervene', target: 'cass', text: '我可以提供餐點建議，但你的私事不需要告訴我。' }))).status, 200);
  await withModel(input => {
    if (input.self.id !== 'cass' || input.self.cognition.relationshipTags.some(item => item.person === 'observer')) return {};
    const source = input.self.shortTerm.find(item => item.source.person === 'observer');
    return { cognitiveUpdates: [{ kind: 'relationship', operation: 'upsert', id: 'observer-food', version: 0, person: 'observer', topic: '餐食建議', text: '可以聽聽建議，但我仍自己決定。', references: [{ kind: 'short', id: source.id, version: source.version }], reason: '對已收到消息的來源形成有限情境信任。' }] };
  }, async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const cass = (await read()).characters[0]; assert.equal(cass.cognition.relationshipTags.find(item => item.id === 'observer-food').person, 'observer');
    assert.equal((await advance()).status, 200); assert.ok(inputs.findLast(input => input.self.id === 'cass').self.cognition.relationshipTags.some(item => item.person === 'observer'));
  });
  for (const person of ['world', 'system', 'hidden-person']) {
    const w = worldWithAdjudication(), c = w.characters[0]; c.shortTerm = [{ id: 'anonymous-sound', characterId: c.id, version: 1, time: 0, text: '似乎聽見有人說話', source: { kind: 'observation', ...(person === 'hidden-person' ? {} : { person }) } }]; store.install(w); const before = await read();
    await withModel(input => input.self.id === 'cass' ? { cognitiveUpdates: [{ kind: 'relationship', operation: 'upsert', id: 'unavailable-source', version: 0, person, topic: '信任', text: '無權補上來源身份', references: evidence(input), reason: '不能把診斷或未知身份當聯絡人' }] } : {}, async (_inputs, advance) => { assert.equal((await advance()).status, 502); assert.deepEqual((await read()).characters, before.characters); });
  }
});
test('pressure review candidates remain an actionable subset after the shared input budget selects visible beliefs', async () => {
  const w = worldWithAdjudication(), c = w.characters[0]; c.memories = [];
  c.shortTerm = Array.from({ length: 20 }, (_, i) => ({ id: `large-recent-${i}`, characterId: c.id, version: 1, time: i, text: '甲'.repeat(875), source: { kind: 'experience' } }));
  c.cognition = { beliefs: Array.from({ length: 24 }, (_, i) => ({ id: `b${i}`, characterId: c.id, version: 1, time: 0, topic: `主題${i}`, text: '乙'.repeat(133), conviction: 'leaning', references: [], contradictions: [], reason: '仍有影響' })), relationshipTags: [], trace: [] }; store.install(w); assert.equal((await GET()).status, 200);
  await withModel(input => input.self.id === 'cass' ? { cognitiveUpdates: [{ kind: 'belief', operation: 'withdraw', id: input.self.cognition.reviewCandidates.at(-1).id, version: 1, references: evidence(input), reason: '從本次展示的有限整理候選放下一個看法' }] } : {}, async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const input = inputs.find(item => item.self.id === 'cass'), cognition = input.self.cognition;
    assert.ok(cognition.beliefs.length < 24); assert.ok(cognition.reviewCandidates.length > 0 && cognition.reviewCandidates.length <= 8);
    assert.ok(cognition.reviewCandidates.every(candidate => (candidate.kind === 'belief' ? cognition.beliefs : cognition.relationshipTags).some(item => item.id === candidate.id && item.version === candidate.version)));
    assert.equal((await read()).characters[0].cognition.beliefs.length, 23);
  });
});
test('current review and metadata history handles share at most eight maintenance candidates under joint pressure', async () => {
  const w = worldWithAdjudication(), c = w.characters[0];
  c.cognition = { beliefs: Array.from({ length: 24 }, (_, i) => ({ id: `current-${i}`, characterId: c.id, version: 1, time: 0, topic: `主題${i}`, text: '目前理解', conviction: 'leaning', references: [], contradictions: [], reason: '仍影響意圖' })), relationshipTags: [], trace: Array.from({ length: 24 }, (_, i) => ({ traceId: `history-${i}`, kind: 'belief', id: `past-${i}`, version: 1, operation: 'withdraw', time: i, reason: '曾經相信後來放下', references: [] })) }; store.install(w);
  await withModel(() => ({}), async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const cognition = inputs.find(input => input.self.id === 'cass').self.cognition;
    assert.ok(cognition.reviewCandidates.length > 0); assert.ok(cognition.historyCandidates.length > 0);
    assert.ok(cognition.reviewCandidates.length + cognition.historyCandidates.length <= 8);
    const saved = (await read()).characters[0]; assert.equal(saved.cognition.beliefs.length, 24); assert.equal(saved.cognition.trace.length, 24);
  });
});
test('combined cognition and memory maintenance validates the net shared trace capacity', async () => {
  const w = worldWithAdjudication(), c = w.characters[0];
  c.longTerm = [{ id: 'key', characterId: c.id, version: 1, time: 0, text: '重要片段', source: { kind: 'experience' }, origin: { id: 'origin', version: 1 }, reason: '保留' }];
  c.cognition = { beliefs: [{ id: 'personal-space', characterId: c.id, version: 1, time: 0, topic: '相處距離', text: '目前看法', conviction: 'leaning', references: [], contradictions: [], reason: '在乎' }], relationshipTags: [], trace: [] };
  c.memoryTrace = Array.from({ length: 24 }, (_, i) => ({ id: `keep-${i}`, version: 1, type: 'keep', from: [{ id: 'key', version: 1 }], to: { id: 'key', version: 1 }, reason: '仍在乎' })); store.install(w);
  await withModel(input => input.self.id !== c.id ? {} : { cognitiveUpdates: [belief(input, { version: 1 })], memoryOperations: [{ type: 'compact-trace', targets: [{ id: 'keep-0', version: 1 }], text: '', unresolved: [], reason: '釋放重複保留記錄' }] }, async (_inputs, advance) => {
    assert.equal((await advance()).status, 200); const saved = (await read()).characters[0]; assert.equal(saved.cognition.beliefs[0].version, 2); assert.equal(saved.cognition.trace.length + saved.memoryTrace.length, 24);
  });
});
test('combined memory and cognition pressure exposes at most eight maintenance handles', async () => {
  const w = worldWithAdjudication(), c = w.characters[0];
  c.longTerm = Array.from({ length: 48 }, (_, i) => ({ id: `long-${i}`, characterId: c.id, version: 1, time: 0, text: '片段', source: { kind: 'experience' }, origin: { id: `o-${i}`, version: 1 }, reason: '保留' }));
  c.cognition = { beliefs: Array.from({ length: 18 }, (_, i) => ({ id: `belief-${i}`, characterId: c.id, version: 1, time: 0, topic: `主題${i}`, text: '想法', conviction: 'leaning', references: [], contradictions: [], reason: '在乎' })), relationshipTags: [], trace: Array.from({ length: 9 }, (_, i) => ({ traceId: `cog-${i}`, kind: 'belief', id: `past-${i}`, version: 1, operation: 'withdraw', time: 0, reason: '放下', references: [] })) };
  c.memoryTrace = Array.from({ length: 9 }, (_, i) => ({ id: `mem-${i}`, version: 1, type: 'forget', from: [{ id: `forgot-${i}`, version: 1 }], reason: '放下' })); store.install(w);
  await withModel(() => ({}), async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const self = inputs.find(input => input.self.id === c.id).self;
    assert.ok(self.memoryReview.length + (self.cognition.historyCandidates?.length || 0) + (self.cognition.reviewCandidates?.length || 0) <= 8);
    assert.ok(self.memoryReview.length && self.cognition.historyCandidates.length && self.cognition.reviewCandidates.length);
  });
});
test('invalid final cognition restores the whole world and replays failure after candidate composition', async () => {
  for (const invalid of ['unresolved-contradiction', 'belief-capacity']) {
    const w = worldWithAdjudication(), subject = w.characters[1];
    const current = { id: 'personal-space', characterId: subject.id, version: 1, time: 0, topic: '相處距離', text: '我仍需要自己的空間', conviction: 'leaning', references: [], contradictions: [], reason: '仍會影響未來選擇' };
    subject.cognition = { beliefs: invalid === 'belief-capacity'
      ? Array.from({ length: 24 }, (_, i) => ({ ...current, id: `current-${i}`, topic: `既有主題${i}` }))
      : [current, { ...current, id: 'other-view', topic: '另一個看法', contradictions: ['personal-space'] }], relationshipTags: [], trace: [] };
    store.install(w); const before = await read();
    await withModel(input => input.self.id === 'cass' ? { cognitiveUpdates: [belief(input)], type: 'move', target: 'cafe' } : input.self.id !== subject.id ? {} : {
      cognitiveUpdates: invalid === 'belief-capacity' ? [belief(input)] : [{ kind: 'belief', operation: 'withdraw', id: 'personal-space', version: 1, references: evidence(input), reason: '未同時處理仍指向此信念的未解矛盾' }],
      intents: [{ id: 'not-saved', content: '本回合候選意圖', intensity: 'medium', importance: 'medium', urgency: 'low', context: '' }], type: 'move', target: 'cafe',
    }, async (inputs, advance) => {
      const operationId = `${Date.now()}:${crypto.randomUUID()}`, response = await advance({ operationId });
      assert.equal(response.status, 502, invalid); const failure = await response.json(), after = await read();
      assert.deepEqual(after.characters, before.characters); assert.deepEqual(after.events, before.events);
      assert.equal(after.minute, before.minute); assert.equal(after.turn, before.turn);
      assert.equal(after.aiUsage.totalCalls, 2); assert.equal(after.aiUsage.totalInputTokens, 20);
      assert.deepEqual(await (await advance({ operationId })).json(), failure); assert.equal(inputs.length, 2);
    });
  }
});
test('all simultaneous memory pressures retain a trace handle for a legal shared-capacity tradeoff', async () => {
  const w = worldWithAdjudication(), c = w.characters[0];
  c.shortTerm = Array.from({ length: 80 }, (_, i) => ({ id: `short-${i}`, characterId: c.id, version: 1, time: i, text: '近期片段', source: { kind: 'experience' } }));
  c.longTerm = Array.from({ length: 48 }, (_, i) => ({ id: `long-${i}`, characterId: c.id, version: 1, time: 0, text: '長期片段', source: { kind: 'experience' }, origin: { id: `origin-${i}`, version: 1 }, reason: '保留' }));
  c.cognition = { beliefs: Array.from({ length: 18 }, (_, i) => ({ id: `belief-${i}`, characterId: c.id, version: 1, time: 0, topic: `topic-${i}`, text: '目前理解', conviction: 'leaning', references: [], contradictions: [], reason: '在乎' })), relationshipTags: [], trace: [] };
  c.memoryTrace = Array.from({ length: 24 }, (_, i) => ({ id: `keep-${i}`, version: 1, type: 'keep', from: [{ id: 'long-0', version: 1 }], to: { id: 'long-0', version: 1 }, reason: '仍然在乎' })); store.install(w);
  await withModel(input => input.self.id !== c.id ? {} : { cognitiveUpdates: [belief(input, { id: 'belief-0', version: 1, topic: 'topic-0' })], memoryOperations: [{ type: 'compact-trace', targets: [{ id: 'keep-0', version: 1 }], text: '', unresolved: [], reason: '釋放重複保留追溯' }] }, async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const self = inputs.find(input => input.self.id === c.id).self;
    for (const kind of ['short', 'long', 'trace']) assert.ok(self.memoryReview.some(item => item.kind === kind), kind);
    assert.ok(self.memoryReview.length + (self.cognition.historyCandidates?.length || 0) + (self.cognition.reviewCandidates?.length || 0) <= 8);
    const saved = (await read()).characters[0]; assert.equal(saved.cognition.beliefs[0].version, 2); assert.equal(saved.memoryTrace.length + saved.cognition.trace.length, 24);
  });
});

test('observer analysis reads existing cognition and limited corrections without models, writes or cross-account disclosure', async () => {
  const auth = build('auth'), previous = global.fetch, originalNow = Date.now;
  const fixedTime = Date.now();Date.now = () => fixedTime;
  const w = worldWithAdjudication(), c = w.characters[0], short = c.shortTerm[0];
  c.longTerm = [{ id: 'summary', characterId: c.id, version: 2, time: w.minute, text: '只餘被尊重的印象', kind: 'summary', state: 'active', source: { kind: 'experience' }, origin: { id: short.id, version: 1 }, rememberedSources: [], reason: '留下印象' }];
  c.cognition = { beliefs: [{ id: 'space', characterId: c.id, version: 2, time: w.minute, topic: '距離', text: '我可以有自己的界線', conviction: 'leaning', references: [{ kind: 'long', id: 'summary', version: 1 }], contradictions: [], reason: '新的理解' }], relationshipTags: [], trace: [{ traceId: 'old', kind: 'belief', id: 'space', version: 1, nextVersion: 2, operation: 'upsert', time: w.minute, reason: '只有改觀理由，沒有舊原文', references: [{ kind: 'short', id: 'forgotten', version: 1 }] }] };
  store.install(w);
  const other = worldWithAdjudication();other.characters[0].shortTerm[0].text = 'OTHER_ACCOUNT_PRIVATE_MEMORY';other.characters[0].memories[0].text = 'OTHER_ACCOUNT_PRIVATE_MEMORY';
  store.installForOwner('other-owner', other);
  global.fetch = async () => { throw Error('analysis must never dispatch a model or index request'); };
  try {
    const before = await (await GET()).json();
    const scoped = await (await GET(new Request('https://test.invalid/api/world?owner=other-owner&character=cass'))).json();
    assert.deepEqual(scoped.world, before.world);assert.equal(scoped.version, before.version);
    assert.doesNotMatch(JSON.stringify(scoped), /OTHER_ACCOUNT_PRIVATE_MEMORY/);
    assert.equal(scoped.world.characters[0].cognition.beliefs[0].conviction, 'leaning');
    assert.equal(scoped.world.characters[0].longTerm[0].rememberedSources.length, 0);
    assert.equal(scoped.world.characters[0].cognition.trace[0].reason, '只有改觀理由，沒有舊原文');
    auth.setUserId('other-owner');
    const otherResponse = await (await GET(new Request('https://test.invalid/api/world?owner=test-owner'))).json();
    assert.match(JSON.stringify(otherResponse.world), /OTHER_ACCOUNT_PRIVATE_MEMORY/);
    assert.doesNotMatch(JSON.stringify(otherResponse.world), /只餘被尊重的印象/);
    auth.setUserId(null);assert.equal((await GET()).status, 401);
    auth.setUserId('test-owner');
    const denied = await POST(request({ operation: 'set-belief', target: 'cass', text: 'observer edited belief' }));
    assert.equal(denied.status, 400);
    const after = await (await GET()).json();assert.deepEqual(after.world, before.world);assert.equal(after.version, before.version);
  } finally { auth.setUserId('test-owner');global.fetch = previous;Date.now = originalNow; }
});
