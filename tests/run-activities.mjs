import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const directory = await mkdtemp(join(tmpdir(), 'quiet-hours-tests-'));
try {
  for (const [source, output] of [['lib/world.ts', 'world'], ['lib/habits.ts', 'habits'], ['lib/activities.ts', 'activities'], ['lib/models.ts', 'models'], ['app/api/world/route.ts', 'route']]) {
    const result = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
    const code = result.outputText.replace(/require\("(?:@\/lib\/|\.\/)(world|habits|activities|models)"\)/g, 'require("./$1.cjs")')
      .replace('require("@/app/chatgpt-auth")', 'require("./auth.cjs")').replace('require("@/lib/store")', 'require("./store.cjs")');
    await writeFile(join(directory, `${output}.cjs`), code);
  }
  // Test fixtures are generated only in a temporary directory, never included in the Worker.
  await writeFile(join(directory, 'auth.cjs'), 'exports.getChatGPTUser = async () => ({ userId: "test-owner" });');
  await writeFile(join(directory, 'store.cjs'), `
    let state, version = 0;
    exports.install = value => { state = structuredClone(value); version = 0; };
    exports.snapshot = () => structuredClone(state);
    exports.loadWorld = async () => ({ world: structuredClone(state), version });
    exports.database = () => ({ prepare(sql) { return { bind(...values) { return { async run() {
      if (sql.startsWith('UPDATE worlds SET state')) { state = JSON.parse(values[0]); version++; }
      return { meta: { changes: 1 } };
    } }; } }; } });
  `);
  const result = spawnSync(process.execPath, ['--test', 'tests/activities.test.cjs'], { stdio: 'inherit', env: { ...process.env, QUIET_HOURS_TEST_BUILD: directory } });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
