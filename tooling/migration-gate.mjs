#!/usr/bin/env node
// 遠端 D1 的 migration 相容守門（#28 定義，#31 沿用）。
// 比對資料庫的 d1_migrations 已套用清單與版本庫 migrations 目錄：只有已套用清單是版本庫清單
// 的前綴時才可增量套用；資料庫含程式不認識的變更、或順序／缺漏不符時停止更新，不重置資料。
import { readdir, readFile, appendFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {string[]} repo 版本庫 migrations 檔名，依套用順序
 * @param {string[]} applied 資料庫已套用檔名，依 d1_migrations.id
 */
export function assessMigrations(repo, applied) {
  const unknown = applied.filter(name => !repo.includes(name));
  if (unknown.length) {
    return { ok: false, code: 'unknown-applied', pending: [], unknown,
      reason: `資料庫已套用程式不認識的 migration：${unknown.join('、')}。目標資料庫可能來自較新的程式版本，或被手動修改。停止更新，不會重置或清空資料；請先核對是誰、為何改了資料庫。` };
  }
  const expected = repo.slice(0, applied.length);
  const mismatch = applied.findIndex((name, index) => name !== expected[index]);
  if (mismatch !== -1) {
    return { ok: false, code: 'out-of-order', pending: [],
      reason: `已套用順序與版本庫不一致：第 ${mismatch + 1} 筆資料庫為 ${applied[mismatch]}，版本庫為 ${expected[mismatch]}。增量套用會把較早的 migration 套在較晚的之後。停止更新，不會重置或清空資料；請手動核對 d1_migrations。` };
  }
  const pending = repo.slice(applied.length);
  return { ok: true, code: pending.length ? 'apply' : 'up-to-date', pending };
}

/** 版本庫以外的資料表：D1 內部的 `_cf_*` 與 SQLite 的 `sqlite_*` 不算使用者資料。 */
export function userTables(names) {
  return names.filter(name => !name.startsWith('_cf_') && !name.startsWith('sqlite_'));
}

/**
 * 由資料表清單決定已套用清單的來源：有 `d1_migrations` 就用它；沒有但已有其他資料表，表示資料庫不是由
 * migrations 建立的，停止；什麼都沒有就是空資料庫。
 */
export function appliedFromTables(tables, readApplied) {
  if (tables.includes('d1_migrations')) return { applied: readApplied() };
  const others = userTables(tables);
  if (others.length) return { blocked: { ok: false, code: 'untracked-tables', pending: [], reason: `資料庫沒有 d1_migrations 紀錄，卻已有資料表：${others.join('、')}。無法判斷它們對應哪些 migration。停止更新，不會重置或清空資料；請手動核對後補上 migration 紀錄。` } };
  return { applied: [] };
}

/** 解析 `wrangler d1 execute --json` 的輸出，回傳 name 欄位清單；允許前面有非 JSON 的提示行。 */
export function parseAppliedOutput(text) {
  const start = Math.min(...['[', '{'].map(token => text.indexOf(token)).filter(index => index >= 0));
  if (!Number.isFinite(start)) throw Error('無法解析 wrangler 的 JSON 輸出：找不到 JSON 內容。');
  let parsed;
  try { parsed = JSON.parse(text.slice(start)); } catch { throw Error('無法解析 wrangler 的 JSON 輸出：不是有效的 JSON。'); }
  const results = Array.isArray(parsed) ? parsed : [parsed];
  if (!results.length || results.some(result => !result || result.success === false)) throw Error('wrangler 的查詢沒有回報 success，無法判斷已套用清單。');
  return results.flatMap(result => result.results || []).map(row => row.name);
}

/** 版本庫 migrations 目錄中的 .sql 檔名，依檔名排序（與 Wrangler 套用順序相同）。 */
export async function listRepoMigrations(directory) {
  return (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
}

async function main(argv) {
  const option = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
  const appliedPath = option('--applied'), tablesPath = option('--tables'), migrationsDir = option('--migrations') || 'drizzle';
  if (!appliedPath && !tablesPath) throw Error('用法：node tooling/migration-gate.mjs --tables <資料表 json> --applied <已套用 json> [--migrations drizzle]');
  const readApplied = () => parseAppliedOutput(readFileSync(appliedPath, 'utf8'));
  const source = tablesPath ? appliedFromTables(parseAppliedOutput(await readFile(tablesPath, 'utf8')), readApplied) : { applied: readApplied() };
  const repo = await listRepoMigrations(migrationsDir);
  const result = source.blocked || assessMigrations(repo, source.applied);
  const applied = source.applied || [];
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `pending=${result.pending.length}\n`);
  console.log(`資料庫已套用 ${applied.length} 筆：${applied.join('、') || '（無）'}`);
  console.log(`版本庫共 ${repo.length} 筆：${repo.join('、') || '（無）'}`);
  if (!result.ok) {
    console.error(`::error title=Migration 相容守門停止更新::${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(result.pending.length ? `可增量套用 ${result.pending.length} 筆：${result.pending.join('、')}` : '資料庫已是最新，不需套用 migration。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`::error::${error.message}`); process.exitCode = 1; });
}
