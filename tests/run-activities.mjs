import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const directory = await mkdtemp(join(tmpdir(), 'quiet-hours-tests-'));
try {
  const sources = (await readdir('lib')).filter(file => file.endsWith('.ts')).map(file => ['lib/' + file, file.slice(0, -3)]);
  sources.push(['app/api/world/route.ts', 'route'], ['app/api/environment/route.ts', 'environment-route'],
    ['app/api/character-templates/route.ts', 'character-templates-route'], ['app/api/scene-templates/route.ts', 'scene-templates-route']);
  for (const [source, output] of sources) {
    const result = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
    const code = result.outputText.replace(/require\("(?:@\/lib\/|\.\/)([^"/]+)"\)/g, 'require("./$1.cjs")')
      .replace('require("cloudflare:workers")', 'require("./cloudflare-workers.cjs")')
      .replace('require("zod")', `require(${JSON.stringify(require.resolve('zod'))})`);
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
    db.exec(${JSON.stringify(await readFile('drizzle/0006_character_templates.sql', 'utf8'))});
    db.exec(${JSON.stringify(await readFile('drizzle/0007_scene_templates.sql', 'utf8'))});
    db.exec(${JSON.stringify(await readFile('drizzle/0008_world_before_city.sql', 'utf8'))});
    exports.archivedWorld = () => db.prepare('SELECT state FROM world_before_city WHERE owner = ?').get('test-owner')?.state;
    let conflict, uncertain, failBefore, failRead, budgetHook, traceWriteFailure, traceWriteHook, traceReadFailure, storageHook;
    exports.onNextBudgetReservation = hook => { budgetHook = hook; };
    exports.install = value => {
      db.exec('DELETE FROM world_before_city; DELETE FROM scene_templates; DELETE FROM character_templates; DELETE FROM decision_traces; DELETE FROM decision_trace_retention; DELETE FROM worlds; DELETE FROM account_model_keys; DELETE FROM recall_dispatch_usage; DELETE FROM recall_index_entries'); conflict = undefined; uncertain = false; failBefore = false; failRead = false; traceWriteFailure = false; traceWriteHook = undefined; traceReadFailure=false; storageHook=undefined;
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
  const allTests = ['tests/emotion-regulation-api.test.cjs','tests/mental-results-api.test.cjs','tests/mental-process-api.test.cjs','tests/mental-experiences-api.test.cjs','tests/mental-energy-api.test.cjs','tests/pursuit-capacity-api.test.cjs', 'tests/pursuit-arrangements-api.test.cjs', 'tests/pursuit-selection-api.test.cjs', 'tests/pursuits-api.test.cjs', 'tests/memory-selection-contract-api.test.cjs', 'tests/model-contract-api.test.cjs', 'tests/costs-api.test.cjs', 'tests/budgets-api.test.cjs', 'tests/recovery-ui.test.cjs', 'tests/recall-api.test.cjs', 'tests/cognition-api.test.cjs', 'tests/maintenance-api.test.cjs', 'tests/memory-api.test.cjs', 'tests/operations-api.test.cjs', 'tests/false-perception-api.test.cjs', 'tests/active-perception-api.test.cjs', 'tests/attention-api.test.cjs', 'tests/perception-api.test.cjs', 'tests/world-configuration-api.test.cjs', 'tests/world-configuration-ui.test.cjs', 'tests/activities.test.cjs', 'tests/intents.test.cjs', 'tests/continue-api.test.cjs', 'tests/owner-control-api.test.cjs', 'tests/takeover-api.test.cjs', 'tests/conflict-api.test.cjs', 'tests/d20-api.test.cjs', 'tests/environment-api.test.cjs'];
  // Pass test file paths as arguments to run a subset; the default runs everything.
  allTests.push('tests/activity-lifecycle-api.test.cjs', 'tests/activity-semantics-api.test.cjs', 'tests/activity-time-api.test.cjs', 'tests/activity-time-limit-api.test.cjs', 'tests/routine-first-approval-api.test.cjs', 'tests/routine-sharing-api.test.cjs', 'tests/routine-obstacles-api.test.cjs', 'tests/routine-api.test.cjs', 'tests/tea-api.test.cjs', 'tests/free-actions-api.test.cjs', 'tests/acceptance-scene-api.test.cjs', 'tests/adjudication-failure-api.test.cjs');
  allTests.push('tests/live-acceptance-cup-api.test.cjs', 'tests/operation-evidence-api.test.cjs', 'tests/routine-results-api.test.cjs', 'tests/routine-program-api.test.cjs', 'tests/activity-results-api.test.cjs', 'tests/activity-time-review-api.test.cjs', 'tests/routine-objects-api.test.cjs', 'tests/routine-contract-api.test.cjs');
  allTests.push('tests/npc-failure-feedback-api.test.cjs', 'tests/adjudication-contract-api.test.cjs', 'tests/world-changes-object-api.test.cjs', 'tests/world-formation-api.test.cjs', 'tests/world-physical-api.test.cjs');
  allTests.push('tests/world-external-api.test.cjs');
  allTests.push('tests/natural-changes-api.test.cjs', 'tests/routine-world-changes-api.test.cjs');
  allTests.push('tests/verified-obstacles-api.test.cjs');
  allTests.push('tests/action-feedback-api.test.cjs', 'tests/decision-traces-api.test.cjs', 'tests/decision-trace-faults-api.test.cjs', 'tests/candidate-diagnostics-api.test.cjs');
  allTests.push('tests/round-deadline-api.test.cjs', 'tests/preferences-api.test.cjs', 'tests/long-activities-api.test.cjs', 'tests/life-needs-api.test.cjs', 'tests/sleep-api.test.cjs');
  allTests.push('tests/life-habits-api.test.cjs', 'tests/life-trace-api.test.cjs', 'tests/life-cognition-integration-api.test.cjs', 'tests/life-integration-api.test.cjs');

  allTests.push('tests/last-known-state-api.test.cjs', 'tests/method-assessment-api.test.cjs', 'tests/drink-binding-api.test.cjs', 'tests/partial-drink-api.test.cjs', 'tests/alternative-food-api.test.cjs');
  allTests.push('tests/method-reassessment-integration-api.test.cjs');
  allTests.push('tests/phone-memos-api.test.cjs','tests/phone-inbox-api.test.cjs','tests/arrangements-api.test.cjs','tests/arrangement-cues-api.test.cjs');
  allTests.push('tests/phone-notifications-api.test.cjs');
  allTests.push('tests/phone-calendar-api.test.cjs','tests/flexible-life-review-api.test.cjs');
  allTests.push('tests/flexible-life-integration-api.test.cjs');
  allTests.push('tests/object-observation-api.test.cjs', 'tests/source-scope-api.test.cjs');
  allTests.push('tests/discovery-api.test.cjs');

  allTests.push('tests/routine-discovery-api.test.cjs');

  allTests.push('tests/discovery-method-api.test.cjs');
  allTests.push('tests/demand-integration-api.test.cjs');

  allTests.push('tests/interrupted-usage-api.test.cjs','tests/usage-recovery-ui.test.cjs');
  allTests.push('tests/pursuit-graph-api.test.cjs');
  allTests.push('tests/pursuit-lifecycle-api.test.cjs');
  allTests.push('tests/pursuit-exit-api.test.cjs','tests/pursuit-new-waiting-api.test.cjs');
  allTests.push('tests/pursuit-review-api.test.cjs');
  allTests.push('tests/npc-input-equivalence.test.cjs', 'tests/city-creation-api.test.cjs', 'tests/city-access-api.test.cjs', 'tests/city-travel-api.test.cjs', 'tests/city-phone-map-api.test.cjs');
  allTests.push('tests/character-generation-api.test.cjs', 'tests/initial-memory-capacity-api.test.cjs');
  allTests.push('tests/city-activity-hints-api.test.cjs');
  const selected = process.argv.slice(2);
  const result = spawnSync(process.execPath, ['--test', ...(selected.length ? selected : allTests)], { stdio: 'inherit', env: { ...process.env, QUIET_HOURS_TEST_BUILD: directory } });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
