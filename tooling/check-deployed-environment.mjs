// 部署後核對：/api/environment 回報的環境名稱與提交短碼必須是本次部署的；未登入讀世界必須得到 401。
// 通過時把結果寫進 GitHub 的 job summary。
import { readFileSync, appendFileSync } from 'node:fs';
const [file, expectedName, sha, worldStatus = '401', siteUrl = ''] = process.argv.slice(2);
const environment = JSON.parse(readFileSync(file, 'utf8'));
const problems = [];
if (environment.name !== expectedName) problems.push(`環境名稱是 ${environment.name}，預期 ${expectedName}`);
if (typeof environment.commit !== 'string' || environment.commit === 'unknown' || !sha.startsWith(environment.commit)) problems.push(`提交是 ${environment.commit}，預期 ${sha.slice(0, 7)} 的前綴`);
if (worldStatus !== '401') problems.push(`未登入讀取 /api/world 回 ${worldStatus}，預期 401`);
if (problems.length) { console.error(problems.join('；')); process.exit(1); }
const line = `${environment.caption}，建置於 ${environment.builtAtLabel || environment.builtAt}；未登入讀取世界回 401。`;
console.log(`測試站回報 ${line}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 已部署測試站\n- 網址：${siteUrl}\n- 提交：\`${sha.slice(0, 7)}\`\n- 線上回報：${line}\n`);
