/* eslint-disable @typescript-eslint/no-require-imports -- World API fixtures. */
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { seedWorld } = build('world'), { GET, POST } = build('route'), store = build('store');
const read = async () => (await (await GET()).json()).world;
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid' }, body: JSON.stringify({ operationId: `${Date.now()}:${crypto.randomUUID()}`, mode: 'demo', ...body }) });
const retained = (c, id, text, source = { kind: 'experience' }) => ({ id, characterId: c.id, version: 1, time: 1, text, source, origin: { id: `origin-${id}`, version: 1 }, reason: '我想記住' });
const operation = (type, targets, text = '', unresolved = []) => ({ type, targets, text, unresolved, reason: '重新考慮這些經歷' });
async function withModel(choose, run) {
  const old = global.fetch, inputs = [];
  global.fetch = async (_, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content); inputs.push(input);
    return Response.json({ usage: { prompt_tokens: 10, completion_tokens: 5 }, choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '', mood: '', durationMinutes: 15, intents: [], attentionConditions: [], memorySelections: [], memoryOperations: [], ...choose(input) }) } }] });
  };
  try {
    await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
    await run(inputs, body => POST(request({ operation: 'advance', mode: 'openai', model: 'gpt-6-luna', minutes: 15, limits: { calls: 120, tokens: 500000 }, ...body })));
  } finally { global.fetch = old; }
}
test('subjective summary is saved, versioned, and remembered on the next decision with both opposing sources', async () => {
  const w = seedWorld(), c = w.characters[0];
  c.longTerm = [retained(c, 'heard', 'Vera 說那個房間是安全的。', { kind: 'observation', person: 'vera', sense: 'hearing', clarity: 'clear' }), retained(c, 'saw', '我覺得房間裡好像有危險。', { kind: 'observation', sense: 'sight', clarity: 'vague' })]; store.install(w);
  let summarize = true;
  await withModel(input => input.self.id === c.id && summarize ? { memoryOperations: [operation('merge', input.self.longTerm.map(({ id, version }) => ({ id, version })), 'Vera 說房間安全，但我看著仍覺得可能有危險；兩種感受還沒有一致。', input.self.longTerm.map(({ id, version }) => ({ id, version })))] } : {}, async (inputs, advance) => {
    const first = await advance(); assert.equal(first.status, 200); const saved = (await read()).characters[0];
    assert.equal(saved.longTerm.length, 1); assert.equal(saved.longTerm[0].id, 'heard'); assert.equal(saved.longTerm[0].version, 2); assert.equal(saved.longTerm[0].kind, 'summary'); assert.equal(saved.longTerm[0].state, 'active');
    assert.deepEqual(saved.longTerm[0].rememberedSources.map(item => item.source), c.longTerm.map(item => item.source)); assert.equal(saved.longTerm[0].unresolved.length, 2);
    summarize = false; assert.equal((await advance()).status, 200); const next = inputs.findLast(input => input.self.id === c.id);
    assert.equal(next.self.longTerm[0].text, saved.longTerm[0].text); assert.equal(next.self.longTerm[0].version, 2); assert.equal(JSON.stringify(next).includes('memoryTrace'), false); assert.equal(JSON.stringify(next).includes('origin-heard'), false);
  });
});
test('hard-full memory accepts an explicit merge and new selection by evaluating the final net capacity', async () => {
  const w = seedWorld(), c = w.characters[0]; c.longTerm = Array.from({ length: 64 }, (_, i) => retained(c, `kept-${i}`, `重要片段${i}`)); store.install(w);
  await withModel(input => input.self.id === c.id ? { memorySelections: [{ id: input.self.shortTerm[0].id, version: 1, reason: '新的重要片段' }], memoryOperations: [operation('merge', input.self.longTerm.slice(0, 2).map(({ id, version }) => ({ id, version })), '這兩次普通日常留給我的印象相近。')] } : {}, async (_inputs, advance) => {
    assert.equal((await advance()).status, 200); const saved = (await read()).characters[0]; assert.equal(saved.longTerm.length, 64); assert.equal(saved.longTerm.find(item => item.id === 'kept-0').version, 2); assert.equal(saved.longTerm.some(item => item.id === 'kept-1'), false); assert.deepEqual(saved.longTerm.find(item => item.id === 'kept-63'), c.longTerm[63]); assert.ok(saved.longTerm.some(item => item.text === c.shortTerm[0].text));
  });
});
test('forgetting remembered source preserves an impression but removes original short, observation, control and pending aliases', async () => {
  const w = seedWorld(), c = w.characters[0], origin = { id: 'source-detail', version: 1 };
  const observation = { id: origin.id, time: 1260, text: 'SOURCE_DETAIL 由 Vera 告訴我這個地點。', sense: 'hearing', kind: 'speech', clarity: 'vague', source: 'vera', region: 'kris-home-main' };
  c.shortTerm.push({ ...origin, characterId: c.id, time: observation.time, text: observation.text, source: { kind: 'observation', person: 'vera', region: observation.region, sense: 'hearing', clarity: 'vague' }, observation, eventId: 'pending-source-detail', controlled: true });
  c.control = { mode: 'autonomous', experiences: [{ id: origin.id, time: observation.time, text: observation.text }] }; c.longTerm = [{ ...retained(c, 'impression', '我仍感到不安。', c.shortTerm.at(-1).source), origin }];
  w.events.push({ id: 'pending-source-detail', time: 1260, actor: 'observer', kind: 'intervention', audience: [c.id], text: observation.text }); store.install(w); let forget = true;
  await withModel(input => input.self.id === c.id && forget ? { memoryOperations: [operation('forget-source', [{ id: 'impression', version: 1 }])] } : {}, async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const saved = (await read()).characters[0]; assert.equal(saved.longTerm[0].text, '我仍感到不安。'); assert.equal(saved.longTerm[0].version, 2); assert.equal(saved.longTerm[0].source.person, undefined); assert.deepEqual(saved.longTerm[0].rememberedSources, []); assert.equal(saved.shortTerm.some(item => item.id === origin.id), false); assert.equal(saved.observations.some(item => item.id === origin.id), false); assert.equal(saved.memoryTrace[0].from[0].id, 'impression'); assert.equal(JSON.stringify(saved.memoryTrace).includes('SOURCE_DETAIL'), false);
    forget = false; assert.equal((await advance()).status, 200); const next = inputs.findLast(input => input.self.id === c.id); assert.equal(JSON.stringify(next).includes('SOURCE_DETAIL'), false); assert.equal(next.self.longTerm[0].source.person, undefined); assert.equal(JSON.stringify(next.self.longTerm).includes('source-detail'), false);
  });
});
test('explicit rewrite and forgetting remove original prose while an older important memory stays intact', async () => {
  const w = seedWorld(), c = w.characters[0]; c.shortTerm[0].text = 'FORGOTTEN_PROSE 最近幾天的詳細日常。';
  c.longTerm = [{ ...retained(c, 'daily', c.shortTerm[0].text), origin: { id: c.shortTerm[0].id, version: 1 } }, retained(c, 'forgotten', 'FORGOTTEN_EPISODE 那次短暫的經歷。'), retained(c, 'important', '這件舊事對我很重要。')]; store.install(w); let maintain = true;
  await withModel(input => input.self.id === c.id && maintain ? { memoryOperations: [operation('rewrite', [{ id: 'daily', version: 1 }], '最近的日常使我比較安心。'), operation('forget', [{ id: 'forgotten', version: 1 }])] } : {}, async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const saved = (await read()).characters[0]; assert.equal(saved.longTerm.length, 2); assert.deepEqual(saved.longTerm.find(item => item.id === 'important'), c.longTerm[2]); assert.equal(saved.longTerm.find(item => item.id === 'daily').version, 2); assert.equal(saved.longTerm.find(item => item.id === 'daily').kind, 'summary'); assert.equal(JSON.stringify(saved).includes('FORGOTTEN_PROSE'), false); assert.equal(JSON.stringify(saved).includes('FORGOTTEN_EPISODE'), false);
    maintain = false; assert.equal((await advance()).status, 200); const next = inputs.findLast(input => input.self.id === c.id); assert.equal(JSON.stringify(next).includes('FORGOTTEN_PROSE'), false); assert.equal(JSON.stringify(next).includes('FORGOTTEN_EPISODE'), false);
  });
});
test('75-percent pressure offers at most eight review handles inside the actual input without dedicated model calls', async () => {
  for (const count of [47, 48]) {
    const w = seedWorld(), c = w.characters[0]; c.longTerm = Array.from({ length: count }, (_, i) => retained(c, `long-${i}`, `主觀片段${i}`)); store.install(w);
    await withModel(() => ({}), async (inputs, advance) => {
      assert.equal((await advance()).status, 200); assert.equal(inputs.length, 4); const input = inputs.find(item => item.self.id === c.id);
      assert.equal(input.self.memoryReview.length, count === 48 ? 8 : 0); assert.ok(input.self.memoryReview.every(ref => input.self.longTerm.some(item => ref.kind === 'long' && item.id === ref.id && item.version === ref.version))); assert.deepEqual((await read()).characters[0].longTerm, c.longTerm);
    });
  }
});
test('rewriting a summary preserves its explicit unresolved sources and cannot silently settle an existing contradiction', async () => {
  const w = seedWorld(), c = w.characters[0], refs = [{ id: 'heard-before', version: 1 }, { id: 'seen-before', version: 1 }];
  c.longTerm = [{ ...retained(c, 'summary', '我聽聞安全，但看著覺得可能危險。'), kind: 'summary', state: 'active', unresolved: refs, rememberedSources: refs.map(ref => ({ ...ref, source: { kind: 'observation', sense: 'hearing', clarity: 'vague' } })) }];
  for (const preserve of [false, true]) {
    store.install(w);
    await withModel(input => input.self.id === c.id ? { memoryOperations: [operation('rewrite', [{ id: 'summary', version: 1 }], preserve ? '兩種感受仍未一致，我暫時留意。' : '這房間確定安全。', preserve ? refs : [])] } : {}, async (_inputs, advance) => {
      assert.equal((await advance()).status, preserve ? 200 : 502); const saved = (await read()).characters[0]; assert.deepEqual(saved.longTerm[0].unresolved, refs); assert.equal(saved.longTerm[0].version, preserve ? 2 : 1);
    });
  }
});
test('explicit keep and bounded trace compaction use final references, preserve paid failure and replay without hidden FIFO', async () => {
  const w = seedWorld(), c = w.characters[0]; c.longTerm = [retained(c, 'key', '很久以前的重要經歷。')];
  c.memoryTrace = Array.from({ length: 23 }, (_, i) => ({ id: `trace-${i}`, version: 1, type: 'rewrite', from: [{ id: `past-${i}`, version: 1 }], to: { id: `past-${i}`, version: 2 }, reason: 'TRACE_REASON_DETAIL' })); store.install(w); let compact = false;
  await withModel(input => input.self.id === c.id ? { memoryOperations: [operation('keep', [{ id: 'key', version: 1 }]), ...(compact ? [operation('compact-trace', [{ id: input.self.memoryReview.find(ref => ref.kind === 'trace').id, version: 1 }])] : [])] } : {}, async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const before = await read(); assert.equal(before.characters[0].memoryTrace.length, 24); assert.deepEqual(before.characters[0].longTerm, c.longTerm);
    const operationId = `${Date.now()}:${crypto.randomUUID()}`, fail = await advance({ operationId }); assert.equal(fail.status, 502); const failure = await fail.json(); assert.deepEqual((await read()).characters, before.characters); assert.equal((await read()).aiUsage.totalCalls, 8); const calls = inputs.length; assert.deepEqual(await (await advance({ operationId })).json(), failure); assert.equal(inputs.length, calls);
    compact = true; assert.equal((await advance()).status, 200); const saved = (await read()).characters[0]; assert.equal(saved.memoryTrace.length, 24); assert.equal(saved.memoryTrace.some(item => item.id === 'trace-0'), false); assert.ok(saved.memoryTrace.some(item => item.to?.id === 'key')); assert.equal(JSON.stringify(inputs.findLast(input => input.self.id === c.id)).includes('TRACE_REASON_DETAIL'), false);
  });
});
test('invalid or foreign summary references cannot partially save an earlier NPC update or revive hidden source metadata', async () => {
  for (const invalid of ['unresolved-field', 'foreign', 'version', 'unknown', 'duplicate', 'ref-count', 'ref-bytes', 'operation-count']) {
    const w = seedWorld(); for (const c of w.characters) c.longTerm = [retained(c, `${c.id}-a`, '我看著仍不確定。'), retained(c, `${c.id}-b`, '聽說事情沒有問題。')]; store.install(w); const before = await read();
    await withModel(input => {
      const refs = input.self.longTerm.map(({ id, version }) => ({ id, version })), op = operation('merge', refs, '兩種說法還沒有一致。', refs.map(ref => ({ ...ref })));
      if (input.self.id === 'vera') {
        if (invalid === 'unresolved-field') op.unresolved[0] = { ...op.unresolved[0], privateSource: 'SECRET_METADATA' };
        if (invalid === 'foreign') op.targets[0].id = 'cass-a'; if (invalid === 'version') op.targets[0].version = 99; if (invalid === 'unknown') op.targets[0].id = 'nonexistent'; if (invalid === 'duplicate') op.targets[1] = op.targets[0]; if (invalid === 'ref-count') op.targets = Array(9).fill(refs[0]); if (invalid === 'ref-bytes') op.targets[0].id = '界'.repeat(43);
        if (invalid === 'operation-count') return { memoryOperations: Array(5).fill(op) };
      }
      return { memoryOperations: [op] };
    }, async (inputs, advance) => {
      const operationId = `${Date.now()}:${crypto.randomUUID()}`, response = await advance({ operationId }); assert.equal(response.status, 502, invalid); const failure = await response.json(); const saved = await read(); assert.deepEqual(saved.characters, before.characters); assert.deepEqual(saved.events, before.events); assert.equal(saved.aiUsage.totalCalls, 2); assert.equal(saved.aiUsage.totalInputTokens, 20); assert.deepEqual(await (await advance({ operationId })).json(), failure); assert.equal(inputs.length, 2);
    });
  }
});
test('persisted summary and trace metadata outside reference, source, reason or shared history bounds is reported by GET', async () => {
  for (const invalid of ['sources', 'origins', 'unresolved', 'source-key', 'trace-reason', 'trace-refs', 'combined-history']) {
    const w = seedWorld(), c = w.characters[0], item = retained(c, 'episode', '重要主觀片段。'); c.longTerm = [item];
    const refs = Array.from({ length: 9 }, (_, i) => ({ id: `ref-${i}`, version: 1 }));
    if (invalid === 'sources') item.rememberedSources = refs.map(ref => ({ ...ref, source: { kind: 'observation', sense: 'hearing', clarity: 'vague' } })); if (invalid === 'origins') item.origins = refs; if (invalid === 'unresolved') item.unresolved = refs; if (invalid === 'source-key') item.source.secretIdentity = 'SECRET';
    if (invalid.startsWith('trace')) c.memoryTrace = [{ id: 'trace', version: 1, type: 'rewrite', from: invalid === 'trace-refs' ? refs : refs.slice(0, 1), to: { id: item.id, version: 1 }, reason: invalid === 'trace-reason' ? '界'.repeat(86) : '重新考慮' }];
    if (invalid === 'combined-history') { c.memoryTrace = Array.from({ length: 13 }, (_, i) => ({ id: `trace-${i}`, version: 1, type: 'keep', from: [{ id: item.id, version: 1 }], to: { id: item.id, version: 1 }, reason: '保留' })); c.cognition = { beliefs: [], relationshipTags: [], trace: Array.from({ length: 12 }, (_, i) => ({ traceId: `cognitive-${i}` })) }; }
    store.install(w); const response = await GET(); assert.equal(response.status, 503, invalid);
  }
});
test('forgetting an origin cannot leave an untargeted copy that reintroduces its original prose or source', async () => {
  const w = seedWorld(), c = w.characters[0], origin = { id: c.shortTerm[0].id, version: 1 }; c.shortTerm[0].source = { kind: 'observation', person: 'vera', sense: 'hearing', clarity: 'vague' };
  c.longTerm = ['copy-a', 'copy-b'].map(id => ({ ...retained(c, id, '我仍覺得不安。', c.shortTerm[0].source), origin }));
  for (const allCopies of [false, true]) {
    store.install(w);
    await withModel(input => input.self.id === c.id ? { memoryOperations: (allCopies ? c.longTerm : c.longTerm.slice(0, 1)).map(item => operation('forget-source', [{ id: item.id, version: 1 }])) } : {}, async (_inputs, advance) => {
      assert.equal((await advance()).status, allCopies ? 200 : 502); const saved = (await read()).characters[0]; assert.equal(saved.longTerm.every(item => item.source.person === undefined), allCopies); assert.equal(saved.shortTerm.some(item => item.id === origin.id), !allCopies);
    });
  }
});
test('a hard-full history can release an explicit keep record while preserving the unchanged current memory', async () => {
  const w = seedWorld(), c = w.characters[0]; c.longTerm = [retained(c, 'key', '我仍想保留這段經歷。')]; c.memoryTrace = Array.from({ length: 24 }, (_, i) => ({ id: `keep-${i}`, version: 1, type: 'keep', from: [{ id: 'key', version: 1 }], to: { id: 'key', version: 1 }, reason: '仍然在乎' })); store.install(w);
  await withModel(input => input.self.id === c.id ? { memoryOperations: [operation('keep', [{ id: 'key', version: 1 }]), operation('compact-trace', [{ id: 'keep-0', version: 1 }])] } : {}, async (_inputs, advance) => {
    assert.equal((await advance()).status, 200); const saved = (await read()).characters[0]; assert.equal(saved.memoryTrace.length, 24); assert.equal(saved.memoryTrace.some(item => item.id === 'keep-0'), false); assert.deepEqual(saved.longTerm, c.longTerm);
  });
});
test('a referenced old version keeps its rewrite source anchor even when the newer memory is explicitly forgotten', async () => {
  const w = seedWorld(), c = w.characters[0]; c.longTerm = [{ ...retained(c, 'key', '我已經把往事濃縮了。'), version: 2 }]; c.cognition = { beliefs: [{ references: [{ kind: 'long', id: 'key', version: 1 }] }], relationshipTags: [], trace: [] };
  c.memoryTrace = [{ id: 'protected-rewrite', version: 1, type: 'rewrite', from: [{ id: 'key', version: 1 }], to: { id: 'key', version: 2 }, reason: '留下舊版本身分' }, ...Array.from({ length: 17 }, (_, i) => ({ id: `old-${i}`, version: 1, type: 'forget', from: [{ id: `gone-${i}`, version: 1 }], reason: '放下細節' }))]; store.install(w); const before = await read();
  await withModel(input => input.self.id === c.id ? { memoryOperations: [operation('forget', [{ id: 'key', version: 2 }]), operation('compact-trace', [{ id: 'protected-rewrite', version: 1 }])] } : {}, async (_inputs, advance) => {
    assert.equal((await advance()).status, 502); assert.deepEqual((await read()).characters, before.characters);
  });
});
test('duplicate keep anchors can be explicitly compacted while a referenced old version keeps another anchor', async () => {
  const w = seedWorld(), c = w.characters[0]; c.longTerm = [{ ...retained(c, 'key', '濃縮後的印象。'), version: 2 }]; c.cognition = { beliefs: [{ references: [{ kind: 'long', id: 'key', version: 1 }] }], relationshipTags: [], trace: [] }; c.memoryTrace = Array.from({ length: 24 }, (_, i) => ({ id: `old-keep-${i}`, version: 1, type: 'keep', from: [{ id: 'key', version: 1 }], to: { id: 'key', version: 1 }, reason: '之前仍想保留' })); store.install(w);
  await withModel(input => input.self.id === c.id ? { memoryOperations: [operation('compact-trace', [{ id: 'old-keep-0', version: 1 }]), operation('keep', [{ id: 'key', version: 2 }])] } : {}, async (_inputs, advance) => {
    assert.equal((await advance()).status, 200); const saved = (await read()).characters[0]; assert.equal(saved.memoryTrace.length, 24); assert.equal(saved.memoryTrace.some(item => item.id === 'old-keep-0'), false); assert.ok(saved.memoryTrace.some(item => item.to?.id === 'key' && item.to.version === 1));
  });
});
test('shared pressure preserves short priority and trace capacity, and a budget-omitted long memory cannot be edited', async () => {
  const w = seedWorld(), c = w.characters[0]; c.shortTerm = Array.from({ length: 80 }, (_, i) => ({ id: `short-${i}`, characterId: c.id, version: 1, time: i, text: '甲'.repeat(160), source: { kind: 'experience' } })); c.longTerm = Array.from({ length: 58 }, (_, i) => retained(c, `long-${i}`, '乙'.repeat(280))); c.memoryTrace = Array.from({ length: 18 }, (_, i) => ({ id: `trace-${i}`, version: 1, type: 'forget', from: [{ id: `gone-${i}`, version: 1 }], reason: '淡去' })); store.install(w); const before = await read();
  await withModel(input => input.self.id === c.id ? { memoryOperations: [operation('forget', [{ id: 'long-57', version: 1 }])] } : {}, async (inputs, advance) => {
    assert.equal((await advance()).status, 502); const input = inputs[0]; assert.equal(input.self.longTerm.some(item => item.id === 'long-57'), false); assert.equal(input.self.memoryReview.length, 8); assert.equal(input.self.memoryReview[0].kind, 'short'); assert.ok(input.self.memoryReview.some(ref => ref.kind === 'long')); assert.ok(input.self.memoryReview.some(ref => ref.kind === 'trace'));
    const payload = { shortTerm: input.self.shortTerm, longTerm: input.self.longTerm, memoryReview: input.self.memoryReview, memories: input.self.memories, observations: input.self.observations, relationships: input.self.relationships, knownControlExperiences: input.knownControlExperiences, pendingInterventions: input.pendingInterventions }; assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 88 * 1024); assert.deepEqual((await read()).characters, before.characters);
  });
});
test('source forgetting can explicitly retain only the impression when original prose also names the forgotten source', async () => {
  const w = seedWorld(), c = w.characters[0]; c.shortTerm[0].text = 'FORGOTTEN_NAME Vera 告訴我這件事，我感到不安。'; c.longTerm = [{ ...retained(c, 'impression', c.shortTerm[0].text, { kind: 'observation', person: 'vera', sense: 'hearing', clarity: 'vague' }), origin: { id: c.shortTerm[0].id, version: 1 } }]; store.install(w); let forget = true;
  await withModel(input => input.self.id === c.id && forget ? { memoryOperations: [operation('forget-source', [{ id: 'impression', version: 1 }], '我依稀記得那時感到不安，不記得是從哪裡聽來。')] } : {}, async (inputs, advance) => {
    assert.equal((await advance()).status, 200); const saved = (await read()).characters[0]; assert.equal(JSON.stringify(saved).includes('FORGOTTEN_NAME'), false); assert.equal(saved.longTerm[0].version, 2); assert.equal(saved.longTerm[0].source.kind, 'observation'); assert.equal(saved.longTerm[0].source.person, undefined);
    forget = false; assert.equal((await advance()).status, 200); assert.equal(JSON.stringify(inputs.findLast(input => input.self.id === c.id)).includes('FORGOTTEN_NAME'), false);
  });
});
