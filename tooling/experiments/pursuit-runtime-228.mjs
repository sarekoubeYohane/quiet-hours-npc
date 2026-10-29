// Local experiment runtime: production modules and SQL; only host/auth/D1 adapters differ.
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, readdir, rm, chmod, copyFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export async function createRuntime({ root = process.cwd(), databasePath, owner = 'pursuit-experiment-payer', readonly = false, storageFault } = {}) {
  if (!databasePath) throw Error('A private file SQLite path is required');
  const require = createRequire(join(resolve(root), 'package.json'));
  const ts = require('typescript');
  const directory = await mkdtemp(join(tmpdir(), 'pursuit-runtime-'));
  await chmod(directory, 0o700);
  const sources = (await readdir(join(root, 'lib'))).filter(file => file.endsWith('.ts')).map(file => ['lib/' + file, file.slice(0, -3)]);
  sources.push(['app/api/world/route.ts', 'route']);
  for (const [source, name] of sources) {
    const { outputText } = ts.transpileModule(await readFile(join(root, source), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
    await writeFile(join(directory, name + '.cjs'), outputText.replace(/require\("(?:@\/lib\/|\.\/)([^"/]+)"\)/g, 'require("./$1.cjs")').replaceAll('require("cloudflare:workers")', 'require("./cloudflare-workers.cjs")'));
  }
  // No secret literal is written to generated code, SQLite or the run manifest.
  await writeFile(join(directory, 'cloudflare-workers.cjs'), 'exports.env = {};');
  await writeFile(join(directory, 'auth.cjs'), 'exports.getGitHubUser = async () => ({ userId: exports.owner });');
  const load = name => require(join(directory, name + '.cjs'));
  load('auth').owner = owner;
  const db = new DatabaseSync(databasePath);
  await chmod(databasePath, 0o600);
  if (!readonly) for (const file of (await readdir(join(root, 'drizzle'))).filter(file => file.endsWith('.sql')).sort()) {
    db.exec('CREATE TABLE IF NOT EXISTS experiment_migrations (name TEXT PRIMARY KEY)');
    if (!db.prepare('SELECT name FROM experiment_migrations WHERE name=?').get(file)) {
      db.exec(await readFile(join(root, 'drizzle', file), 'utf8'));
      db.prepare('INSERT INTO experiment_migrations VALUES (?)').run(file);
    }
  }
  const adapter = { prepare(sql) { return { bind(...values) { return {
    async all() { return { results: db.prepare(sql).all(...values) }; },
    async first() { return db.prepare(sql).get(...values) ?? null; },
    async run() { await storageFault?.(sql);return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
  }; } }; } };
  const env = load('cloudflare-workers').env;
  Object.assign(env, { APP_ENV: 'local', AUTH_ORIGIN: 'https://pursuit-experiment.invalid', DB: adapter, GIT_COMMIT: 'isolated-runner', ...(readonly ? {} : { MODEL_KEY_ENCRYPTION_SECRET: randomBytes(32).toString('hex') }) });
  const { GET, POST } = load('route');
  const get = operationId => GET(new Request('https://pursuit-experiment.invalid/api/world' + (operationId ? '?operationId=' + encodeURIComponent(operationId) : '')));
  const post = body => {
    if (readonly) throw Error('Readback mode permits GET only');
    return POST(new Request('https://pursuit-experiment.invalid/api/world', { method: 'POST', headers: { origin: 'https://pursuit-experiment.invalid', 'X-World-Time-Policy': 'round-v1' }, body: JSON.stringify(body) }));
  };
  // Only at a trial's initial boundary after real reset. Keep payer, journal and keys.
  async function initializeStory(scene) {
    if (readonly) throw Error('Readback mode permits GET only');
    const row = db.prepare('SELECT * FROM worlds WHERE owner=?').get(owner);
    if (!row || row.locked_until > Date.now()) throw Error('Cannot initialize a locked world');
    const journal = JSON.parse(row.operations);
    if (Object.values(journal.results).some(result => result.pending || result.body?.operationUncertain)) throw Error('Unresolved operation prevents another trial');
    const old = JSON.parse(row.state);
    const next = structuredClone(scene);
    for (const key of ['aiUsage', 'playerBudget', 'modelPrices', 'adjudication']) {
      if (old[key] !== undefined) next[key] = structuredClone(old[key]);
      else delete next[key];
    }
    // Distinct runtime story identity; public scene hash excludes these two run handles.
    next.contextId = crypto.randomUUID(); next.pursuitContext = crypto.randomUUID();
    const updated = db.prepare('UPDATE worlds SET state=?,version=version+1 WHERE owner=? AND version=? AND locked_until=?').run(JSON.stringify(next), owner, row.version, row.locked_until);
    if (updated.changes !== 1) throw Error('Initial story CAS conflict');
    return (await (await get()).json());
  }
  const payerState=()=>{const value=JSON.parse(db.prepare('SELECT state FROM worlds WHERE owner=?').get(owner).state);return {usage:value.aiUsage?{...value.aiUsage,savedDecisions:0}:undefined,budget:value.playerBudget};};
  async function archive(file){if((await stat(databasePath)).size>16*1024*1024)throw Error('evidence-gap');await copyFile(databasePath,file);await chmod(file,0o600);}
  return { get, post, load, initializeStory, payerState, archive, async close() { delete env.MODEL_KEY_ENCRYPTION_SECRET; db.close(); await rm(directory, { recursive: true, force: true }); } };
}
