import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const directory = await mkdtemp(join(tmpdir(), 'quiet-hours-tests-'));
try {
  for (const [source, output] of [['lib/world.ts', 'world'], ['lib/habits.ts', 'habits'], ['lib/activities.ts', 'activities'], ['lib/models.ts', 'models'], ['lib/playbook.ts', 'playbook'], ['app/api/world/route.ts', 'route']]) {
    const result = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
    const code = result.outputText.replace(/require\("(?:@\/lib\/|\.\/)(world|habits|activities|models|playbook)"\)/g, 'require("./$1.cjs")')
      .replace('require("@/app/chatgpt-auth")', 'require("./auth.cjs")').replace('require("@/lib/store")', 'require("./store.cjs")');
    await writeFile(join(directory, `${output}.cjs`), code);
  }
  // Test fixtures are generated only in a temporary directory, never included in the Worker.
  await writeFile(join(directory, 'auth.cjs'), 'let userId = "test-owner"; exports.setUserId = id => { userId = id; }; exports.getChatGPTUser = async () => ({ userId });');
  await writeFile(join(directory, 'store.cjs'), `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE worlds (owner TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL, locked_until INTEGER NOT NULL)');
    let conflict, uncertain;
    exports.install = value => {
      db.exec('DELETE FROM worlds'); conflict = undefined; uncertain = false;
      db.prepare('INSERT INTO worlds VALUES (?, ?, 0, 0)').run('test-owner', JSON.stringify(value));
    };
    exports.conflictOnNextSave = (replacement, options = {}) => { conflict = { replacement, ...options }; };
    exports.throwAfterNextSave = () => { uncertain = true; };
    exports.snapshot = () => JSON.parse(db.prepare('SELECT state FROM worlds WHERE owner = ?').get('test-owner').state);
    exports.loadWorld = async owner => {
      const row = db.prepare('SELECT state, version FROM worlds WHERE owner = ?').get(owner);
      return { world: JSON.parse(row.state), version: row.version };
    };
    exports.database = () => ({ prepare(sql) { return { bind(...values) { return { async run() {
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
  const result = spawnSync(process.execPath, ['--test', 'tests/activities.test.cjs', 'tests/intents.test.cjs', 'tests/continue-api.test.cjs', 'tests/owner-control-api.test.cjs', 'tests/takeover-api.test.cjs', 'tests/conflict-api.test.cjs'], { stdio: 'inherit', env: { ...process.env, QUIET_HOURS_TEST_BUILD: directory } });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
