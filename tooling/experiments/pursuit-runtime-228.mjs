// Local experiment runtime: production modules and SQL; only host/auth/D1 adapters differ.
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, readdir, rm, chmod, copyFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export async function createRuntime({ root = process.cwd(), databasePath, owner = 'pursuit-experiment-payer', readonly = false, storageFault, legacySeed = false } = {}) {
  if (!databasePath) throw Error('A private file SQLite path is required');
  const require = createRequire(join(resolve(root), 'package.json'));
  const ts = require('typescript');
  const directory = await mkdtemp(join(tmpdir(), 'pursuit-runtime-'));
  await chmod(directory, 0o700);
  const sources = (await readdir(join(root, 'lib'))).filter(file => file.endsWith('.ts')).map(file => ['lib/' + file, file.slice(0, -3)]);
  sources.push(['app/api/world/route.ts', 'route']);
  for (const [source, name] of sources) {
    const { outputText } = ts.transpileModule(await readFile(join(root, source), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } });
    await writeFile(join(directory, name + '.cjs'), outputText.replace(/require\("(?:@\/lib\/|\.\/)([^"/]+)"\)/g, 'require("./$1.cjs")').replace('require("zod")', `require(${JSON.stringify(require.resolve('zod'))})`).replaceAll('require("cloudflare:workers")', 'require("./cloudflare-workers.cjs")'));
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
  // Explicit legacy/research fixture only. Product reads never create a seed,
  // and this setup is not evidence that the user's new-world journey succeeded.
  if (!readonly && legacySeed && !db.prepare('SELECT owner FROM worlds WHERE owner=?').get(owner)) db.prepare('INSERT OR IGNORE INTO worlds (owner,state,version,locked_until) VALUES (?,?,0,0)').run(owner,JSON.stringify(load('world').seedWorld()));
  function prepare(sql,values=[]) {return {sql,bind(...args){return prepare(sql,args)},
    async all(){return {results:db.prepare(sql).all(...values)}},async first(){return db.prepare(sql).get(...values)??null},
    execute(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}}},
    async run(){await storageFault?.(sql);return this.execute()},
  };}
  const adapter={prepare,async batch(statements){for(const statement of statements)await storageFault?.(statement.sql);db.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>statement.execute());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
  const env = load('cloudflare-workers').env;
  Object.assign(env, { APP_ENV: 'local', AUTH_ORIGIN: 'https://pursuit-experiment.invalid', DB: adapter, GIT_COMMIT: 'isolated-runner', ...(readonly ? {} : { MODEL_KEY_ENCRYPTION_SECRET: randomBytes(32).toString('hex') }) });
  const { GET, POST } = load('route');
  const get = operationId => GET(new Request('https://pursuit-experiment.invalid/api/world' + (operationId ? '?operationId=' + encodeURIComponent(operationId) : '')));
  const post = body => {
    if (readonly) throw Error('Readback mode permits GET only');
    return POST(new Request('https://pursuit-experiment.invalid/api/world', { method: 'POST', headers: { origin: 'https://pursuit-experiment.invalid', 'X-World-Time-Policy': 'round-v1' }, body: JSON.stringify({ operationScope: owner, ...body }) }));
  };
  // Explicit isolated historical research fixture, not the player's new-world
  // or restart API. Preserve account billing, journal and keys across trials.
  async function initializeHistoricalTrial(scene) {
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
  const payerState=()=>{const value=db.prepare('SELECT usage,budget FROM player_accounts WHERE owner=? AND initialized=1').get(owner);if(!value)throw Error('Account payer is not initialized');return {usage:{...JSON.parse(value.usage),savedDecisions:0},budget:JSON.parse(value.budget)};};
  async function archive(file){if((await stat(databasePath)).size>16*1024*1024)throw Error('evidence-gap');await copyFile(databasePath,file);await chmod(file,0o600);}
  return { get, post, load, initializeHistoricalTrial, payerState, archive, async close() { delete env.MODEL_KEY_ENCRYPTION_SECRET; db.close(); await rm(directory, { recursive: true, force: true }); } };
}
