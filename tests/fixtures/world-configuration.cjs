const configuration = {
  locations: [{ id: 'studio', name: '河畔工作室' }, { id: 'annex', name: '保密別館' }],
  regions: [
    { id: 'lobby', location: 'studio', name: '接待室' },
    { id: 'loft', location: 'studio', name: '閣樓' },
    { id: 'vault', location: 'annex', name: '保密房間' },
  ],
  doors: [{ id: 'loft-door', name: '閣樓門', regions: ['lobby', 'loft'] }],
  residences: { river: 'studio', cedar: 'annex' },
};
const actor = (id, name, location, region) => ({
  id, name, location, region, color: '#abcdab', mood: '平靜', personality: '安靜',
  goal: '休息', activity: '', relationships: {}, memories: [{ time: 1260, text: name + '的獨立記憶' }],
});
const configuredWorld = () => ({
  configuration, pursuitVersion: 1, pursuitContext: crypto.randomUUID(),
  adjudication: { provider: 'openai', model: 'gpt-6.1-sol' }, minute: 1260, turn: 0, lastMode: 'demo', events: [],
  characters: [actor('river', '澄', 'studio', 'lobby'), actor('cedar', '杉', 'studio', 'loft')],
  scene: { doors: { 'loft-door': 'closed' }, noise: {}, occluded: [] },
});

module.exports = { configuration, configuredWorld };
