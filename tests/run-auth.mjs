import { mkdtemp, readFile, writeFile, rm, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const directory = await mkdtemp(join(tmpdir(), 'quiet-hours-auth-'));
try {
  const sources = ['lib/world.ts', 'lib/d20.ts', 'lib/habits.ts', 'lib/activities.ts', 'lib/models.ts', 'lib/playbook.ts', 'lib/store.ts', 'lib/auth.ts', 'app/api/world/route.ts', 'app/api/auth/github/route.ts', 'app/api/auth/github/callback/route.ts', 'app/api/auth/logout/route.ts'];
  for (const source of sources) {
    const output = join(directory, source.replace(/\.ts$/, '.cjs'));
    await mkdir(dirname(output), { recursive: true });
    const result = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
    const code = result.outputText.replace(/require\("([^\"]+)"\)/g, (match, name) => {
      if (name === 'cloudflare:workers') return `require(${JSON.stringify(join(directory, 'bindings.cjs'))})`;
      if (name === 'next/headers') return `require(${JSON.stringify(join(directory, 'headers.cjs'))})`;
      if (name === 'next/navigation') return '({redirect: () => { throw Error("Unexpected redirect"); }})';
      if (name.startsWith('@/')) return `require(${JSON.stringify(join(directory, name.slice(2) + '.cjs'))})`;
      if (name.startsWith('.')) return `require(${JSON.stringify(resolve(dirname(output), name + '.cjs'))})`;
      return match;
    });
    await writeFile(output, code);
  }
  await writeFile(join(directory, 'headers.cjs'), 'let current = new Headers(); exports.set = value => { current = value; }; exports.headers = async () => current;');
  await writeFile(join(directory, 'bindings.cjs'), 'exports.env = {};');
  await writeFile(join(directory, 'fixture.cjs'), `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    const env = require('./bindings.cjs').env;
    env.DB = { prepare(sql) { let values = []; const statement = {
      bind(...args) { values = args; return statement; },
      async first() { return db.prepare(sql).get(...values) ?? null; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; }
    }; return statement; } };
    exports.reset = () => { for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) db.exec('DROP TABLE ' + row.name); };
    exports.migrate = sql => db.exec(sql);
    exports.env = env;
  `);
  const sql = (await Promise.all((await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort().map(f => readFile(join('drizzle', f), 'utf8')))).join('\n');
  await writeFile(join(directory, 'migrations.sql'), sql);
  const result = spawnSync(process.execPath, ['--test', 'tests/auth-api.test.cjs'], { stdio: 'inherit', env: { ...process.env, QUIET_HOURS_AUTH_BUILD: directory } });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
