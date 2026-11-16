// 部署前守門：建置成品的 Wrangler 設定必須只指向測試站 Worker、測試站 vars、測試站 D1，以及測試站的回想資源。
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(process.argv[2] || 'dist/server/wrangler.json', 'utf8'));
const expected = { name: 'quiet-hours-npc-test', env: 'test', origin: 'https://quiet-hours-npc-test.houmengkou.workers.dev', database: 'quiet-hours-npc-test-world', recallUsage: 'quiet-hours-npc-recall-usage', vectorIndex: 'quiet-hours-npc-test-memory' };
const problems = [];
const logs = config.observability?.logs;
if (!logs?.enabled || !logs.invocation_logs || logs.head_sampling_rate !== 1 || logs.persist !== true) problems.push('測試站必須啟用持久化 Workers Logs、invocation logs 與完整採樣');
if (config.upload_source_maps !== true) problems.push('測試站必須啟用伺服器 source map 上傳');
if (config.name !== expected.name) problems.push(`Worker 名稱是 ${config.name}，應為 ${expected.name}`);
if (config.vars?.APP_ENV !== expected.env) problems.push(`APP_ENV 是 ${config.vars?.APP_ENV}，應為 ${expected.env}`);
if (config.vars?.AUTH_ORIGIN !== expected.origin) problems.push(`AUTH_ORIGIN 是 ${config.vars?.AUTH_ORIGIN}，應為 ${expected.origin}`);
const databases = config.d1_databases || [];
const world = databases.find(item => item.binding === 'DB');
const usage = databases.find(item => item.binding === 'RECALL_USAGE_DB');
const unexpected = databases.filter(item => item !== world && item !== usage);
if (!world || world.database_name !== expected.database || unexpected.length) problems.push(`D1 綁定應為 DB → ${expected.database}（可另有 RECALL_USAGE_DB → ${expected.recallUsage}），實際為 ${JSON.stringify(databases)}`);
if (usage && (usage.database_name !== expected.recallUsage || usage.migrations_dir)) problems.push(`RECALL_USAGE_DB 應指向 ${expected.recallUsage} 且不設 migrations_dir，實際為 ${JSON.stringify(usage)}`);
const vectors = config.vectorize || [];
if (vectors.some(item => item.binding !== 'MEMORY_VECTOR_INDEX' || item.index_name !== expected.vectorIndex) || vectors.length > 1) problems.push(`Vectorize 綁定應只有 MEMORY_VECTOR_INDEX → ${expected.vectorIndex}，實際為 ${JSON.stringify(vectors)}`);
if (JSON.stringify(config).includes('quiet-hours-npc-world"')) problems.push('建置成品含正式站 D1 名稱');
if (problems.length) { for (const problem of problems) console.error(`::error::${problem}`); process.exit(1); }
console.log(`建置成品指向 ${config.name}（${config.vars.APP_ENV}），D1 ${world.database_name}${usage ? `、${usage.database_name}` : ''}${vectors.length ? `，Vectorize ${vectors[0].index_name}` : ''}。`);
