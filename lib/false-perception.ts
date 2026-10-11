import type { Character, World } from './world';
import type { Observation, SensoryCandidate } from './perception';

export type FalsePerceptionTemplate = {
  id: string; type: 'distortion' | 'no-stimulus'; sense: Observation['sense'];
  clueKinds: Observation['kind'][]; clueIncludes?: string[];
  kind: Observation['kind']; text: string; identity?: boolean; urgency?: Observation['urgency'];
};
export type FalsePerceptionDiagnostic = {
  type: FalsePerceptionTemplate['type']; templateId: string; draw: number;
  selectedWeight: number; totalWeight: number; subjectiveText: string; objectiveClues: string[];
};
// Trusted scene configuration, never model-generated prose or an ambient schedule.
export const falsePerceptionRules = {
  relatedWeight: 3, otherWeight: 1,
  templates: [
    { id: 'familiar-voice', type: 'distortion', sense: 'hearing', clueKinds: ['sound', 'speech'], clueIncludes: ['說話', '聲響'], kind: 'speech', identity: true, text: '似乎聽見 {source} 在附近說話。' },
    { id: 'familiar-footsteps', type: 'distortion', sense: 'hearing', clueKinds: ['sound'], clueIncludes: ['腳步'], kind: 'person', identity: true, text: '{source} 的腳步似乎在附近。' },
    { id: 'familiar-shadow', type: 'distortion', sense: 'sight', clueKinds: ['person'], kind: 'person', identity: true, text: '遮擋處的人影似乎是 {source}。' },
    { id: 'imagined-call', type: 'no-stimulus', sense: 'hearing', clueKinds: ['sound', 'speech'], kind: 'speech', text: '似乎聽見有人喊「{self}」。', urgency: 'direct' },
    { id: 'mistaken-knock', type: 'distortion', sense: 'hearing', clueKinds: ['sound', 'speech'], kind: 'sound', text: '似乎聽見附近有敲門聲。' },
  ] as FalsePerceptionTemplate[],
};
export function falsePerception(world: World, character: Character, clues: SensoryCandidate[]) {
  const applicable: { candidate: SensoryCandidate; template: FalsePerceptionTemplate; weight: number }[] = [];
  // The established NPC interface exposes these contacts' names and ids only.
  // Never use event.actor, a hidden candidate source, or private speech to pick identity.
  const contacts = world.characters.filter(person => person.id !== character.id).map(({ id, name }) => ({ id, name }));
  for (const template of falsePerceptionRules.templates) {
    const clue = clues.find(clue => clue.sense === template.sense && template.clueKinds.includes(clue.kind) &&
      (!template.clueIncludes || template.clueIncludes.some(text => clue.text.includes(text))));
    if (!clue) continue;
    for (const contact of template.identity ? contacts : [undefined]) {
      const candidate: SensoryCandidate = { sense: template.sense, kind: template.kind,
        text: template.text.replace('{self}', character.name).replace('{source}', contact?.name || ''),
        clarity: 'vague', direct: false, ...(contact ? { source: contact.id } : {}),
        region: template.sense === 'sight' ? clue.region || character.region : character.region, ...(template.urgency ? { urgency: template.urgency } : {}) };
      const related = character.attentionConditions?.some(condition => condition.kind === candidate.kind &&
        (!condition.source || condition.source === candidate.source) && (!condition.region || condition.region === candidate.region)) ||
        contact && character.intents?.some(intent => [intent.content, intent.context].some(text => text.includes(contact.name) || text.includes(contact.id)));
      applicable.push({ candidate, template, weight: related ? falsePerceptionRules.relatedWeight : falsePerceptionRules.otherWeight });
    }
  }
  if (!applicable.length) return undefined;
  const draw = Math.random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw Error('無效的錯誤感知亂數來源');
  const totalWeight = applicable.reduce((sum, option) => sum + option.weight, 0);
  let cursor = draw * totalWeight;
  const selected = applicable.find(option => { cursor -= option.weight; return cursor < 0; })!;
  const diagnostic: FalsePerceptionDiagnostic = { type: selected.template.type, templateId: selected.template.id,
    draw, selectedWeight: selected.weight, totalWeight, subjectiveText: selected.candidate.text, objectiveClues: clues.map(clue => clue.text) };
  return { candidate: selected.candidate, diagnostic };
}
