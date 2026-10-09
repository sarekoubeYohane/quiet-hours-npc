import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const directory = await mkdtemp(join(tmpdir(), 'quiet-hours-tests-'));
try {
  for (const [source, output] of [['lib/world.ts', 'world'], ['lib/d20.ts', 'd20'], ['lib/habits.ts', 'habits'], ['lib/activities.ts', 'activities'], ['lib/models.ts', 'models'], ['lib/model-keys.ts', 'model-keys'], ['lib/playbook.ts', 'playbook'], ['lib/environment.ts', 'environment'], ['app/api/world/route.ts', 'route'], ['app/api/environment/route.ts', 'environment-route']]) {
    const result = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
    const code = result.outputText.replace(/require\("(?:@\/lib\/|\.\/)(world|habits|activities|models|model-keys|playbook|d20|environment)"\)/g, 'require("./$1.cjs")')
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
    let conflict, uncertain;
    exports.install = value => {
      db.exec('DELETE FROM worlds; DELETE FROM account_model_keys'); conflict = undefined; uncertain = false;
      db.prepare('INSERT INTO worlds VALUES (?, ?, 0, 0)').run('test-owner', JSON.stringify(value));
    };
    exports.conflictOnNextSave = (replacement, options = {}) => { conflict = { replacement, ...options }; };
    exports.throwAfterNextSave = () => { uncertain = true; };
    exports.snapshot = () => JSON.parse(db.prepare('SELECT state FROM worlds WHERE owner = ?').get('test-owner').state);
    exports.loadWorld = async owner => {
      const row = db.prepare('SELECT state, version FROM worlds WHERE owner = ?').get(owner);
      return { world: JSON.parse(row.state), version: row.version };
    };
    exports.database = () => ({ prepare(sql) { return { bind(...values) { return { async first() { return db.prepare(sql).get(...values) ?? null; }, async run() {
      const finalSave = sql.startsWith('UPDATE worlds SET state = ?');
      if (finalSave && conflict) {
        const { replacement, version = 10, lockedUntil = 0, owner = 'test-owner' } = conflict; conflict = undefined;
        if (replacement) {
          db.prepare('DELETE FROM worlds WHERE owner = ?').run('test-owner');
          db.prepare('INSERT INTO worlds VALUES (?, ?, ?, ?)').run(owner, JSON.stringify(replacement), version, lockedUntil);
        }
        return { meta: { changes: 0 } };
      }
      const result = db.prepare(sql).run(...values);
      if (finalSave && uncertain) { uncertain = false; throw Error('Unknown commit outcome'); }
      return { meta: { changes: Number(result.changes) } };
    } }; } }; } });
  `);
  const allTests = ['tests/activities.test.cjs', 'tests/intents.test.cjs', 'tests/continue-api.test.cjs', 'tests/owner-control-api.test.cjs', 'tests/takeover-api.test.cjs', 'tests/conflict-api.test.cjs', 'tests/d20-api.test.cjs', 'tests/environment-api.test.cjs'];
  // Pass test file paths as arguments to run a subset; the default runs everything.
  const selected = process.argv.slice(2);
  const result = spawnSync(process.execPath, ['--test', ...(selected.length ? selected : allTests)], { stdio: 'inherit', env: { ...process.env, QUIET_HOURS_TEST_BUILD: directory } });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }

