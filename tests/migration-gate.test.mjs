// The compatibility gate decides whether the remote D1 can take the repo's migrations
// incrementally. It is a pure decision over two ordered name lists plus a thin CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assessMigrations, parseAppliedOutput, listRepoMigrations, appliedFromTables, userTables } from '../tooling/migration-gate.mjs';

const repo = ['0000_bizarre_inhumans.sql', '0001_hard_cargill.sql', '0002_account_model_keys.sql', '0003_world_operations.sql'];

test('an empty database takes every migration; an up-to-date database takes none', () => {
  assert.deepEqual(assessMigrations(repo, []), { ok: true, code: 'apply', pending: repo });
  assert.deepEqual(assessMigrations(repo, repo), { ok: true, code: 'up-to-date', pending: [] });
});

test('a database that applied a prefix of the repo list continues incrementally', () => {
  assert.deepEqual(assessMigrations(repo, repo.slice(0, 2)), { ok: true, code: 'apply', pending: repo.slice(2) });
});

test('a database with a migration the program does not know stops the update without touching data', () => {
  const result = assessMigrations(repo, [...repo, '0004_from_a_newer_program.sql']);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unknown-applied');
  assert.deepEqual(result.unknown, ['0004_from_a_newer_program.sql']);
  assert.deepEqual(result.pending, []);
  assert.match(result.reason, /0004_from_a_newer_program\.sql/);
});

test('a gap or different order between applied and repo migrations stops the update', () => {
  const gap = assessMigrations(repo, ['0000_bizarre_inhumans.sql', '0002_account_model_keys.sql']);
  assert.equal(gap.ok, false);
  assert.equal(gap.code, 'out-of-order');
  assert.match(gap.reason, /0001_hard_cargill\.sql/);
  const reordered = assessMigrations(repo, ['0001_hard_cargill.sql', '0000_bizarre_inhumans.sql']);
  assert.equal(reordered.ok, false);
  assert.equal(reordered.code, 'out-of-order');
});

test('wrangler --json output is parsed into applied names, tolerating banner lines and a missing table', () => {
  const output = 'Resource location: remote\n' + JSON.stringify([{ results: [{ name: '0000_bizarre_inhumans.sql' }, { name: '0001_hard_cargill.sql' }], success: true, meta: {} }]);
  assert.deepEqual(parseAppliedOutput(output), ['0000_bizarre_inhumans.sql', '0001_hard_cargill.sql']);
  assert.deepEqual(parseAppliedOutput(JSON.stringify([{ results: [], success: true }])), []);
  assert.throws(() => parseAppliedOutput('not json at all'), /JSON/);
  assert.throws(() => parseAppliedOutput(JSON.stringify([{ success: false, error: 'boom' }])), /success/);
});

test('the table listing decides between a fresh database, a tracked one and one with untracked tables', () => {
  assert.deepEqual(appliedFromTables(['_cf_KV'], () => { throw Error('must not read'); }), { applied: [] });
  assert.deepEqual(appliedFromTables([], () => { throw Error('must not read'); }), { applied: [] });
  assert.deepEqual(appliedFromTables(['_cf_KV', 'd1_migrations', 'worlds'], () => ['0000_bizarre_inhumans.sql']), { applied: ['0000_bizarre_inhumans.sql'] });
  const untracked = appliedFromTables(['_cf_KV', 'worlds', 'sqlite_sequence'], () => { throw Error('must not read'); });
  assert.equal(untracked.blocked.ok, false);
  assert.equal(untracked.blocked.code, 'untracked-tables');
  assert.match(untracked.blocked.reason, /worlds/);
  assert.doesNotMatch(untracked.blocked.reason, /_cf_KV|sqlite_sequence/);
  assert.deepEqual(userTables(['_cf_KV', 'sqlite_sequence', 'worlds']), ['worlds']);
});

test('repo migrations are the sorted .sql files of the migrations directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gate-'));
  try {
    await mkdir(join(directory, 'meta'));
    await writeFile(join(directory, '0001_b.sql'), 'select 1;');
    await writeFile(join(directory, '0000_a.sql'), 'select 1;');
    await writeFile(join(directory, 'meta', '_journal.json'), '{}');
    await writeFile(join(directory, 'notes.txt'), 'ignored');
    assert.deepEqual(await listRepoMigrations(directory), ['0000_a.sql', '0001_b.sql']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the CLI exits 0 with the pending count for compatible databases and 1 with an explanation otherwise', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gate-cli-'));
  try {
    const migrations = join(directory, 'migrations'); await mkdir(migrations);
    for (const name of ['0000_first.sql', '0001_second.sql', '0002_third.sql', '0003_fourth.sql']) await writeFile(join(migrations, name), 'select 1;');
    const applied = join(directory, 'applied.json'), tables = join(directory, 'tables.json'), output = join(directory, 'github-output.txt');
    const wrangler = names => JSON.stringify([{ results: names.map(name => ({ name })), success: true }]);
    const run = () => spawnSync(process.execPath, ['tooling/migration-gate.mjs', '--tables', tables, '--applied', applied, '--migrations', migrations], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } });
    await writeFile(tables, wrangler(['_cf_KV', 'd1_migrations', 'worlds']));
    await writeFile(applied, wrangler(['0000_first.sql']));
    const incremental = run();
    assert.equal(incremental.status, 0, incremental.stderr);
    assert.match(incremental.stdout, /0001_second\.sql/);
    assert.match(await readFile(output, 'utf8'), /^pending=3$/m);
    await writeFile(applied, wrangler(['0000_first.sql', '9999_unknown.sql']));
    const blocked = run();
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /9999_unknown\.sql/);
    assert.match(blocked.stderr, /不會重置/);
    // A fresh database has no d1_migrations table and no applied file at all.
    await writeFile(tables, wrangler(['_cf_KV']));
    await rm(applied);
    const fresh = run();
    assert.equal(fresh.status, 0, fresh.stderr);
    assert.match(await readFile(output, 'utf8'), /^pending=4$/m);
    // Tables without migration tracking stop the update.
    await writeFile(tables, wrangler(['_cf_KV', 'worlds']));
    const untracked = run();
    assert.equal(untracked.status, 1);
    assert.match(untracked.stderr, /worlds/);
    // Unreadable wrangler output never passes as an empty list.
    await writeFile(tables, wrangler(['d1_migrations']));
    await writeFile(applied, '');
    assert.equal(run().status, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
