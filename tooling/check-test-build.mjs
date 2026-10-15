// 部署前守門：建置成品的 Wrangler 設定必須只指向測試站 Worker、測試站 vars 與測試站 D1。
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(process.argv[2] || 'dist/server/wrangler.json', 'utf8'));
const expected = { name: 'quiet-hours-npc-test', env: 'test', origin: 'https://quiet-hours-npc-test.houmengkou.workers.dev', database: 'quiet-hours-npc-test-world' };
const problems = [];
if (config.name !== expected.name) problems.push(`Worker 名稱是 ${config.name}，應為 ${expected.name}`);
if (config.vars?.APP_ENV !== expected.env) problems.push(`APP_ENV 是 ${config.vars?.APP_ENV}，應為 ${expected.env}`);
if (config.vars?.AUTH_ORIGIN !== expected.origin) problems.push(`AUTH_ORIGIN 是 ${config.vars?.AUTH_ORIGIN}，應為 ${expected.origin}`);
const databases = config.d1_databases || [];
if (databases.length !== 1 || databases[0].binding !== 'DB' || databases[0].database_name !== expected.database) problems.push(`D1 綁定應只有 DB → ${expected.database}，實際為 ${JSON.stringify(databases)}`);
if (JSON.stringify(config).includes('quiet-hours-npc-world"')) problems.push('建置成品含正式站 D1 名稱');
if (problems.length) { for (const problem of problems) console.error(`::error::${problem}`); process.exit(1); }
console.log(`建置成品指向 ${config.name}（${config.vars.APP_ENV}），D1 ${databases[0].database_name}。`);
