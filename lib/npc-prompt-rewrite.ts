import type { normalDecisionInput } from './npc-input';

type Input = ReturnType<typeof normalDecisionInput>;
type Options = { draft: string; recall?: boolean };

const has = (value: unknown) => Array.isArray(value) ? value.length > 0 : value != null && (typeof value !== 'object' || Object.keys(value).length > 0);

// 小節標題（開頭相符即可）對應的放入條件
const sectionConditions: Record<string, (input: Input, options: Options) => boolean> = {
  '輸入裡的幾種提示': () => true,
  '手上的活動': input => has(input.currentActivity) || has(input.self.pausedActivity),
  '有人找你': input => has(input.pendingInterventions),
  '交還控制權之後': input => has(input.knownControlExperiences),
  '手機': input => has(input.phones),
  '回想': (_input, options) => !!options.recall,
  '追求：上下層與整理': ({self}) => {
    const intents = self.intents ?? [];
    return intents.length >= 8 || intents.some(node => node.parents?.length)
      || (!!self.pursuitCapacity && 'archivable' in self.pursuitCapacity && has(self.pursuitCapacity.archivable));
  },
  '整理長期記憶': input => has(input.self.longTerm) || has(input.self.memoryReview),
  '修改既有的信念、喜好、安排': input => has(input.self.arrangements?.items) || has(input.self.preferences?.items) || has(input.self.cognition?.beliefs) || has(input.self.cognition?.relationshipTags),
  '感受與精神電量': input => has(input.self.mentalEnergy),
};

// 「輸入裡的幾種提示」表格中，每一列只在對應欄位有內容時才放
const hintRows = (input: Input): Record<string, boolean> => ({
  'self.lastKnownState': has(input.self.lastKnownState?.entries),
  'supplies': has(input.supplies),
  'self.noticeOpportunities': has(input.self.noticeOpportunities),
  'self.arrangementCues': has(input.self.arrangementCues),
  'knownMethods': has(input.knownMethods),
  'learnedHabits': has(input.learnedHabits),
  'activityHints': has(input.activityHints),
  'self.openingKnowledge': has(input.self.openingKnowledge),
});

export function assembleNpcPrompt(input: Input, character: Pick<Input['self'], 'name' | 'personality' | 'goal'>, options: Options) {
  const {draft} = options;
  const rows = hintRows(input);
  const kept: string[] = [], included: string[] = [];
  let skip = false, pending = false, inHints = false;
  for (const line of draft.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->\n?/g, '').split('\n')) {
    if (/^〔條件[^〕]*〕$/.test(line)) { pending = true; continue; }
    const heading = line.match(/^#{1,2} (.+)$/);
    if (heading) {
      const name = Object.keys(sectionConditions).find(key => heading[1].startsWith(key));
      skip = pending ? !(name && sectionConditions[name](input, options)) : false;
      inHints = heading[1].startsWith('輸入裡的幾種提示');
      if (inHints && !Object.values(rows).some(Boolean)) skip = true;
      if (pending && !skip && name) included.push(name);
      pending = false;
    }
    if (skip) continue;
    if (line.startsWith('〔條件：眼前有人〕') && !has(input.visiblePeople)) continue;
    if (/^〔條件：手機標示/.test(line) && !input.phones?.some(phone => phone.mapAvailable)) continue;
    if (inHints && /^\| `/.test(line)) { const key = Object.keys(rows).find(key => line.includes('`' + key)); if (key && !rows[key]) continue; }
    kept.push(line.replace(/^〔條件[^〕]*〕/, ''));
  }
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n')
    .replace(/{{(name|personality|goal)}}/g, (_, key: keyof typeof character) => character[key]).trim();
  return { text, included };
}
