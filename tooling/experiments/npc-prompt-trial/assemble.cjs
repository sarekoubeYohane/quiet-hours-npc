/* eslint-disable @typescript-eslint/no-require-imports -- 實驗腳本，以 CommonJS 供 .mjs 與 node:test 共用。 */
// 試驗與測試站共用組裝器；此處只負責從磁碟讀取版本。
const fs = require('node:fs');
const path = require('node:path');

const draftPath = path.join(__dirname, '../../../docs/design/npc-prompt-rewrite-draft.md');
const {assembleNpcPrompt} = require('../../../lib/npc-prompt-rewrite.ts');
const baselinePath = path.join(__dirname, 'v0.2.3.md');

function assemble(input, character, options = {}) {
  const draft = options.draft ?? fs.readFileSync(draftPath, 'utf8');
  return assembleNpcPrompt(input,character,{...options,draft});
}

// Both drafts move the same two fields to the system message at dispatch.
function applyDraft(body, input, version) {
  const draft = fs.readFileSync(version === 'v0.2.3' ? baselinePath : draftPath, 'utf8');
  if (!draft.split(/\r?\n/,2)[1]?.startsWith('NPC 決策 system prompt 草稿 '+version+'（')) {
    throw Error('試驗指定的版本與草稿檔不一致：'+version);
  }
  const {text,included} = assemble(input,input.self,{draft});
  body.messages[0].content = text;
  delete input.self.personality;
  delete input.self.goal;
  body.messages[1].content = JSON.stringify(input);
  return included;
}

module.exports = { assemble, draftPath, baselinePath, applyDraft };
