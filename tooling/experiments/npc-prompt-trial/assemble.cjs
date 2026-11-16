/* eslint-disable @typescript-eslint/no-require-imports -- 實驗腳本，以 CommonJS 供 .mjs 與 node:test 共用。 */
// NPC prompt 草稿的組裝原型：依這回合的輸入決定放哪些條件段落。
// 草稿在 docs/design/npc-prompt-rewrite-draft.md；條件門檻是草擬值，尚未確認。
const fs = require('node:fs');
const path = require('node:path');

const draftPath = path.join(__dirname, '../../../docs/design/npc-prompt-rewrite-draft.md');
const has = value => Array.isArray(value) ? value.length > 0 : value != null && (typeof value !== 'object' || Object.keys(value).length > 0);

// 小節標題（開頭相符即可）對應的放入條件
const sectionConditions = {
  '輸入裡的幾種提示': () => true,
  '手上的活動': input => has(input.currentActivity) || has(input.self.pausedActivity),
  '有人找你': input => has(input.pendingInterventions),
  '交還控制權之後': input => has(input.knownControlExperiences),
  '手機': input => has(input.phones),
  '回想': (_input, options) => !!options.recall,
  '追求：上下層與整理': input => input.self.intents.some(node => node.parents?.length) || input.self.intents.length >= 8 || has(input.self.pursuitCapacity?.archivable),
  '整理長期記憶': input => has(input.self.longTerm) || has(input.self.memoryReview),
  '修改既有的信念、喜好、安排': input => has(input.self.arrangements?.items) || has(input.self.preferences?.items) || has(input.self.cognition?.beliefs) || has(input.self.cognition?.relationshipTags),
  '感受與精神電量': input => has(input.self.mentalEnergy),
};

// 「輸入裡的幾種提示」表格中，每一列只在對應欄位有內容時才放
const hintRows = input => ({
  'self.lastKnownState': has(input.self.lastKnownState?.entries),
  'supplies': has(input.supplies),
  'self.noticeOpportunities': has(input.self.noticeOpportunities),
  'self.arrangementCues': has(input.self.arrangementCues),
  'knownMethods': has(input.knownMethods),
  'learnedHabits': has(input.learnedHabits),
  'activityHints': has(input.activityHints),
  'self.openingKnowledge': has(input.self.openingKnowledge),
});

/**
 * @param {object} input 送給 NPC 的輸入 JSON（normalDecisionInput 的結果）
 * @param {{name:string,personality:string,goal:string}} character 人物設定
 * @param {{draft?:string,recall?:boolean}} [options] draft 可傳入草稿全文（變體測試用）
 * @returns {{text:string,included:string[]}} 組好的 system prompt，以及放入了哪些條件段落
 */
function assemble(input, character, options = {}) {
  const draft = options.draft ?? fs.readFileSync(draftPath, 'utf8');
  const rows = hintRows(input);
  const kept = [], included = [];
  let skip = false, pending = false, inHints = false;
  for (const line of draft.replace(/<!--[\s\S]*?-->\n?/g, '').split('\n')) {
    if (/^〔條件[^〕]*〕$/.test(line)) { pending = true; continue; }
    const heading = line.match(/^#{1,2} (.+)$/);
    if (heading) {
      const name = Object.keys(sectionConditions).find(key => heading[1].startsWith(key));
      skip = pending ? !(name && sectionConditions[name](input, options)) : false;
      inHints = heading[1].startsWith('輸入裡的幾種提示');
      if (inHints && !Object.values(rows).some(Boolean)) skip = true;
      if (pending && !skip) included.push(name);
      pending = false;
    }
    if (skip) continue;
    if (/^〔條件：手機標示/.test(line) && !input.phones?.some(phone => phone.mapAvailable)) continue;
    if (inHints && /^\| `/.test(line)) { const key = Object.keys(rows).find(key => line.includes('`' + key)); if (key && !rows[key]) continue; }
    kept.push(line.replace(/^〔條件[^〕]*〕/, ''));
  }
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n')
    .replace('{{name}}', character.name).replace('{{personality}}', character.personality).replace('{{goal}}', character.goal).trim();
  return { text, included };
}

module.exports = { assemble, draftPath };
