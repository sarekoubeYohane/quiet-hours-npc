// Existing AI scenarios explicitly satisfy the new startup prerequisite. Tests
// for missing configuration keep using the production seedWorld unchanged.
module.exports = seedWorld => () => ({
  ...seedWorld(),
  adjudication: { provider: 'openai', model: 'gpt-6-luna' },
});
