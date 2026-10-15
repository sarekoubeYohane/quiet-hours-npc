import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const directory = await mkdtemp(join(tmpdir(), 'quiet-hours-tests-'));
try {
  for (const [source, output] of [['lib/daily-usage.ts', 'daily-usage'], ['lib/cognition.ts', 'cognition'], ['lib/recall.ts', 'recall'], ['lib/recall-services.ts', 'recall-services'], ['lib/memory.ts', 'memory'], ['lib/false-perception.ts', 'false-perception'], ['lib/attention.ts', 'attention'], ['lib/perception.ts', 'perception'], ['lib/world.ts', 'world'], ['lib/d20.ts', 'd20'], ['lib/habits.ts', 'habits'], ['lib/activities.ts', 'activities'], ['lib/models.ts', 'models'], ['lib/model-keys.ts', 'model-keys'], ['lib/playbook.ts', 'playbook'], ['lib/environment.ts', 'environment'], ['app/api/world/route.ts', 'route'], ['app/api/environment/route.ts', 'environment-route']]) {
    const result = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
    const code = result.outputText.replace(/require\("(?:@\/lib\/|\.\/)(daily-usage|cognition|recall|recall-services|memory|world|attention|false-perception|perception|habits|activities|models|model-keys|playbook|d20|environment)"\)/g, 'require("./$1.cjs")')
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
    const { AsyncLocalStorage } = require('node:async_hooks');
    const context = new AsyncLocalStorage();
    const primaryDb = new DatabaseSync(':memory:');
    const db = new Proxy({}, { get(_, key) { const connection = context.getStore() || primaryDb; return connection[key].bind(connection); } });
    db.exec('CREATE TABLE worlds (owner TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL, locked_until INTEGER NOT NULL)');
    db.exec(${JSON.stringify(await readFile('drizzle/0002_account_model_keys.sql', 'utf8'))});
    db.exec(${JSON.stringify(await readFile('drizzle/0003_world_operations.sql', 'utf8'))});
    const ledgerDb = new DatabaseSync(':memory:');
    ledgerDb.function('unixepoch', () => Math.floor(Date.now() / 1000));
    ledgerDb.exec(${JSON.stringify(await readFile('drizzle-ledger/0000_daily_usage.sql', 'utf8'))});
    let dispatchDelay;
    exports.delayNextUsageDispatch = options => { dispatchDelay = options; };
    require('./cloudflare-workers.cjs').env.USAGE_DB = { prepare(sql) { return { bind(...values) { return { async first() { return ledgerDb.prepare(sql).get(...values) ?? null; }, async run() { const delay = sql.startsWith('UPDATE daily_usage_reservations SET used = used + 1') ? dispatchDelay : undefined; if(delay) dispatchDelay = undefined; await delay?.before?.(); const result = { meta: { changes: Number(ledgerDb.prepare(sql).run(...values).changes) } }; await delay?.after?.(); return result; } }; } }; } };
    db.exec(${JSON.stringify(await readFile('drizzle/0004_recall_usage.sql', 'utf8'))});
    let conflict, uncertain, failBefore, failRead, budgetHook;
    exports.onNextBudgetReservation = hook => { budgetHook = hook; };
    exports.install = value => {
      ledgerDb.exec('DELETE FROM daily_usage_reservations'); dispatchDelay = undefined;
      db.exec('DELETE FROM worlds; DELETE FROM account_model_keys; DELETE FROM recall_dispatch_usage; DELETE FROM recall_index_entries'); conflict = undefined; uncertain = false; failBefore = false; failRead = false;
      db.prepare('INSERT INTO worlds (owner,state,version,locked_until) VALUES (?, ?, 0, 0)').run('test-owner', JSON.stringify(value));
    };
    exports.inOtherEnvironment = async (world, callback) => {
      const other = new DatabaseSync(':memory:');
      for (const row of primaryDb.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all()) other.exec(row.sql);
      other.prepare('INSERT INTO worlds (owner,state,version,locked_until) VALUES (?, ?, 0, 0)').run('test-owner', JSON.stringify(world));
      for (const row of primaryDb.prepare('SELECT * FROM account_model_keys').all()) { const columns = Object.keys(row); other.prepare('INSERT INTO account_model_keys (' + columns.join(',') + ') VALUES (' + columns.map(() => '?').join(',') + ')').run(...Object.values(row)); }
      try { return await context.run(other, callback); } finally { other.close(); }
    };
    exports.replaceWorld = value => db.prepare('UPDATE worlds SET state = ?, locked_until = 0, operations = ? WHERE owner = ?').run(JSON.stringify(value), JSON.stringify({floor:0,results:{}}), 'test-owner');
    exports.conflictOnNextSave = (replacement, options = {}) => { conflict = { replacement, ...options }; };
    exports.failNextOperationRead = () => { failRead = true; };
    exports.throwBeforeNextSave = () => { failBefore = true; };
    exports.throwAfterNextSave = () => { uncertain = true; };
    exports.installForOwner = (owner,value) => db.prepare('INSERT OR REPLACE INTO worlds (owner,state,version,locked_until,operations) VALUES (?, ?, 0, 0, ?)').run(owner, JSON.stringify(value), '{"floor":0,"results":{}}');
    exports.replaceCommittedWorld = value => db.prepare('UPDATE worlds SET state = ?, version = version + 1, locked_until = 0 WHERE owner = ?').run(JSON.stringify(value), 'test-owner');
    exports.snapshot = () => JSON.parse(db.prepare('SELECT state FROM worlds WHERE owner = ?').get('test-owner').state);
    exports.loadWorld = async owner => {
      const row = db.prepare('SELECT state, version FROM worlds WHERE owner = ?').get(owner);
      return { world: JSON.parse(row.state), version: row.version };
    };
    exports.database = () => ({ prepare(sql) { return { bind(...values) { return { async all() { return { results: db.prepare(sql).all(...values) }; }, async first() { if(failRead && sql.startsWith('SELECT operations')) { failRead = false; throw Error('D1 unavailable'); } return db.prepare(sql).get(...values) ?? null; }, async run() {
      if(sql.startsWith('INSERT OR IGNORE INTO recall_dispatch_usage') && budgetHook){const hook=budgetHook;budgetHook=undefined;await hook();}
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
      const result = db.prepare(sql).run(...values);
      if (finalSave && uncertain) { uncertain = false; throw Error('Unknown commit outcome'); }
      return { meta: { changes: Number(result.changes) } };
    } }; } }; } });
  `);
  const allTests = ['tests/daily-usage-api.test.cjs', 'tests/recall-api.test.cjs', 'tests/cognition-api.test.cjs', 'tests/maintenance-api.test.cjs', 'tests/memory-api.test.cjs', 'tests/operations-api.test.cjs', 'tests/false-perception-api.test.cjs', 'tests/active-perception-api.test.cjs', 'tests/attention-api.test.cjs', 'tests/perception-api.test.cjs', 'tests/activities.test.cjs', 'tests/intents.test.cjs', 'tests/continue-api.test.cjs', 'tests/owner-control-api.test.cjs', 'tests/takeover-api.test.cjs', 'tests/conflict-api.test.cjs', 'tests/d20-api.test.cjs', 'tests/environment-api.test.cjs'];
  // Pass test file paths as arguments to run a subset; the default runs everything.
  const selected = process.argv.slice(2);
  const result = spawnSync(process.execPath, ['--test', ...(selected.length ? selected : allTests)], { stdio: 'inherit', env: { ...process.env, QUIET_HOURS_TEST_BUILD: directory } });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }

