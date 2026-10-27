import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const directory = await mkdtemp(join(tmpdir(), 'quiet-hours-tests-'));
try {
  for (const [source, output] of [['lib/round-time-policy.ts', 'round-time-policy'], ['lib/decision-traces.ts', 'decision-traces'], ['lib/decision-trace-capture.ts', 'decision-trace-capture'], ['lib/routine-world-programs.ts', 'routine-world-programs'], ['lib/routine-world-bindings.ts', 'routine-world-bindings'], ['lib/routine-world-contract.ts', 'routine-world-contract'], ['lib/natural-changes.ts', 'natural-changes'], ['lib/world-state.ts', 'world-state'], ['lib/world-formation-contract.ts', 'world-formation-contract'], ['lib/world-formation.ts', 'world-formation'], ['lib/adjudication-limits.ts', 'adjudication-limits'], ['lib/adjudication-contract.ts', 'adjudication-contract'], ['lib/diagnostic-redaction.ts', 'diagnostic-redaction'], ['lib/operation-evidence.ts', 'operation-evidence'], ['lib/routine-program-contract.ts', 'routine-program-contract'], ['lib/routine-programs.ts', 'routine-programs'], ['lib/activity-lifecycle.ts', 'activity-lifecycle'], ['lib/routine-materials.ts', 'routine-materials'], ['lib/routine-obstacles.ts', 'routine-obstacles'], ['lib/routine-rules.ts', 'routine-rules'], ['lib/acceptance-scene.ts', 'acceptance-scene'], ['lib/world-effects.ts', 'world-effects'], ['lib/costs.ts', 'costs'], ['lib/cognition.ts', 'cognition'], ['lib/recall.ts', 'recall'], ['lib/recall-services.ts', 'recall-services'], ['lib/memory.ts', 'memory'], ['lib/false-perception.ts', 'false-perception'], ['lib/attention.ts', 'attention'], ['lib/perception.ts', 'perception'], ['lib/world.ts', 'world'], ['lib/d20.ts', 'd20'], ['lib/habits.ts', 'habits'], ['lib/activities.ts', 'activities'], ['lib/model-adapter.ts', 'model-adapter'], ['lib/adjudication.ts', 'adjudication'], ['lib/models.ts', 'models'], ['lib/model-keys.ts', 'model-keys'], ['lib/playbook.ts', 'playbook'], ['lib/environment.ts', 'environment'], ['app/api/world/route.ts', 'route'], ['app/api/environment/route.ts', 'environment-route']]) {
    const result = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
    const code = result.outputText.replace(/require\("(?:@\/lib\/|\.\/)(round-time-policy|decision-traces|decision-trace-capture|routine-world-programs|routine-world-bindings|routine-world-contract|natural-changes|world-state|world-formation-contract|world-formation|adjudication-limits|adjudication-contract|diagnostic-redaction|operation-evidence|routine-program-contract|routine-programs|activity-lifecycle|routine-materials|routine-obstacles|routine-rules|acceptance-scene|world-effects|costs|cognition|recall|recall-services|memory|world|attention|false-perception|perception|habits|activities|models|adjudication|model-adapter|model-keys|playbook|d20|environment)"\)/g, 'require("./$1.cjs")')
      .replace('require("cloudflare:workers")', 'require("./cloudflare-workers.cjs")')
      .replace('require("@/lib/auth")', 'require("./auth.cjs")').replace(/require\("(?:@\/lib\/|\.\/)store"\)/g, 'require("./store.cjs")');
    await writeFile(join(directory, `${output}.cjs`), code);
  }
  // Test fixtures are generated only in a temporary directory, never included in the Worker.
  // Worker bindings and vars are a mutable stub so tests can set APP_ENV and GIT_COMMIT.
  await writeFile(join(directory, 'cloudflare-workers.cjs'), 'exports.env = { APP_ENV: "local", AUTH_ORIGIN: "https://test.invalid", MODEL_KEY_ENCRYPTION_SECRET: "ab".repeat(32) };');
  await writeFile(join(directory, 'auth.cjs'), 'let userId = "test-owner"; exports.setUserId = id => { userId = id; }; exports.getGitHubUser = async () => ({ userId });');
  await writeFile(join(directory, 'store.cjs'), `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE worlds (owner TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL, locked_until INTEGER NOT NULL)');
    db.exec(${JSON.stringify(await readFile('drizzle/0002_account_model_keys.sql', 'utf8'))});
    db.exec(${JSON.stringify(await readFile('drizzle/0003_world_operations.sql', 'utf8'))});
    db.exec(${JSON.stringify(await readFile('drizzle/0004_recall_usage.sql', 'utf8'))});
    db.exec(${JSON.stringify(await readFile('drizzle/0005_decision_traces.sql', 'utf8'))});
    let conflict, uncertain, failBefore, failRead, budgetHook, traceWriteFailure, traceWriteHook, traceReadFailure, storageHook;
    exports.onNextBudgetReservation = hook => { budgetHook = hook; };
    exports.install = value => {
      db.exec('DELETE FROM decision_traces; DELETE FROM decision_trace_retention; DELETE FROM worlds; DELETE FROM account_model_keys; DELETE FROM recall_dispatch_usage; DELETE FROM recall_index_entries'); conflict = undefined; uncertain = false; failBefore = false; failRead = false; traceWriteFailure = false; traceWriteHook = undefined; traceReadFailure=false; storageHook=undefined;
      db.prepare('INSERT INTO worlds (owner,state,version,locked_until) VALUES (?, ?, 0, 0)').run('test-owner', JSON.stringify(value));
    };
    exports.conflictOnNextSave = (replacement, options = {}) => { conflict = { replacement, ...options }; };
    exports.failNextOperationRead = () => { failRead = true; };
    exports.failTraceWrites = value => { traceWriteFailure = value; };
    exports.onNextTraceWrite = hook => { traceWriteHook = hook; };
    exports.onStorage = hook => { storageHook=hook; };
    exports.failNextTraceRead = () => { traceReadFailure=true; };
    exports.throwBeforeNextSave = () => { failBefore = true; };
    exports.throwAfterNextSave = () => { uncertain = true; };
    exports.installForOwner = (owner,value) => db.prepare('INSERT OR REPLACE INTO worlds (owner,state,version,locked_until,operations) VALUES (?, ?, 0, 0, ?)').run(owner, JSON.stringify(value), '{"floor":0,"results":{}}');
    exports.replaceCommittedWorld = value => db.prepare('UPDATE worlds SET state = ?, version = version + 1, locked_until = 0 WHERE owner = ?').run(JSON.stringify(value), 'test-owner');
    exports.snapshot = () => JSON.parse(db.prepare('SELECT state FROM worlds WHERE owner = ?').get('test-owner').state);
    exports.loadWorld = async owner => {
      const row = db.prepare('SELECT state, version FROM worlds WHERE owner = ?').get(owner);
      return { world: JSON.parse(row.state), version: row.version };
    };
    exports.database = () => ({ prepare(sql) { return { bind(...values) { return { async all() { if(storageHook)await storageHook(sql,values); return { results: db.prepare(sql).all(...values) }; }, async first() { if(storageHook)await storageHook(sql,values); if(traceReadFailure&&sql.startsWith('SELECT body FROM decision_traces')){traceReadFailure=false;throw Error('fixture archive read unavailable');} if(failRead && sql.startsWith('SELECT operations')) { failRead = false; throw Error('D1 unavailable'); } return db.prepare(sql).get(...values) ?? null; }, async run() {
      if(storageHook)await storageHook(sql,values);
      if(sql.startsWith('INSERT OR IGNORE INTO recall_dispatch_usage') && budgetHook){const hook=budgetHook;budgetHook=undefined;await hook();}
      if((sql.startsWith('INSERT INTO decision_traces')||sql.startsWith('UPDATE decision_traces'))&&traceWriteHook){const hook=traceWriteHook;traceWriteHook=undefined;await hook();}
      if(traceWriteFailure && (sql.startsWith('INSERT INTO decision_traces')||sql.startsWith('UPDATE decision_traces')))throw Error('fixture trace storage unavailable');
      const finalSave = sql.startsWith('UPDATE worlds SET state = ?');
      if (finalSave && failBefore) { failBefore = false; throw Error('Unknown commit outcome'); }
      if (finalSave && conflict) {
        const { replacement, version = 10, lockedUntil = 0, owner = 'test-owner' } = conflict; conflict = undefined;
        if (replacement) {
          db.prepare('DELETE FROM worlds WHERE owner = ?').run('test-owner');
          db.prepare('INSERT INTO worlds (owner,state,version,locked_until) VALUES (?, ?, ?, ?)').run(owner, JSON.stringify(replacement), version, lockedUntil);
        }
        return { meta: { changes: 0 } };
      }
      // Simulate the database execution clock, including uncancellable delayed SQL.
      const executedSql=sql.replaceAll("CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)",String(Date.now()));
      const result = db.prepare(executedSql).run(...values);
      if (finalSave && uncertain) { uncertain = false; throw Error('Unknown commit outcome'); }
      return { meta: { changes: Number(result.changes) } };
    } }; } }; } });
  `);
  const allTests = ['tests/memory-selection-contract-api.test.cjs', 'tests/model-contract-api.test.cjs', 'tests/costs-api.test.cjs', 'tests/budgets-api.test.cjs', 'tests/recovery-ui.test.cjs', 'tests/recall-api.test.cjs', 'tests/cognition-api.test.cjs', 'tests/maintenance-api.test.cjs', 'tests/memory-api.test.cjs', 'tests/operations-api.test.cjs', 'tests/false-perception-api.test.cjs', 'tests/active-perception-api.test.cjs', 'tests/attention-api.test.cjs', 'tests/perception-api.test.cjs', 'tests/activities.test.cjs', 'tests/intents.test.cjs', 'tests/continue-api.test.cjs', 'tests/owner-control-api.test.cjs', 'tests/takeover-api.test.cjs', 'tests/conflict-api.test.cjs', 'tests/d20-api.test.cjs', 'tests/environment-api.test.cjs'];
  // Pass test file paths as arguments to run a subset; the default runs everything.
  allTests.push('tests/activity-lifecycle-api.test.cjs', 'tests/activity-semantics-api.test.cjs', 'tests/activity-time-api.test.cjs', 'tests/activity-time-limit-api.test.cjs', 'tests/routine-first-approval-api.test.cjs', 'tests/routine-sharing-api.test.cjs', 'tests/routine-obstacles-api.test.cjs', 'tests/routine-api.test.cjs', 'tests/tea-api.test.cjs', 'tests/free-actions-api.test.cjs', 'tests/acceptance-scene-api.test.cjs', 'tests/adjudication-failure-api.test.cjs');
  allTests.push('tests/live-acceptance-cup-api.test.cjs', 'tests/operation-evidence-api.test.cjs', 'tests/routine-results-api.test.cjs', 'tests/routine-program-api.test.cjs', 'tests/activity-results-api.test.cjs', 'tests/activity-time-review-api.test.cjs', 'tests/routine-objects-api.test.cjs', 'tests/routine-contract-api.test.cjs');
  allTests.push('tests/npc-failure-feedback-api.test.cjs', 'tests/adjudication-contract-api.test.cjs', 'tests/world-changes-object-api.test.cjs', 'tests/world-formation-api.test.cjs', 'tests/world-physical-api.test.cjs');
  allTests.push('tests/world-external-api.test.cjs');
  allTests.push('tests/natural-changes-api.test.cjs', 'tests/routine-world-changes-api.test.cjs');
  allTests.push('tests/action-feedback-api.test.cjs', 'tests/decision-traces-api.test.cjs', 'tests/decision-trace-faults-api.test.cjs', 'tests/candidate-diagnostics-api.test.cjs');
  allTests.push('tests/round-deadline-api.test.cjs');
  const selected = process.argv.slice(2);
  const result = spawnSync(process.execPath, ['--test', ...(selected.length ? selected : allTests)], { stdio: 'inherit', env: { ...process.env, QUIET_HOURS_TEST_BUILD: directory } });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }

