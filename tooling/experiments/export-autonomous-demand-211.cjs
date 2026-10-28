/* eslint-disable @typescript-eslint/no-require-imports -- Offline export through the existing temporary-build harness. */
// Run intentionally via:
// node tests/run-activities.mjs tooling/experiments/export-autonomous-demand-211.cjs
// This exports only the public synthetic initial world, never fixture actions.
const assert = require('node:assert/strict');
const { writeFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { seedWorld } = require(path.join(process.env.QUIET_HOURS_TEST_BUILD, 'world.cjs'));
const { snapshot } = require('../../tests/fixtures/demand-integration-loop.cjs');
const scene = snapshot(seedWorld);
const selectOwner = world => {
  const owner = world.characters.find(character => character.id === 'owner');
  return { personality: owner.personality, goal: owner.goal, intents: owner.intents };
};
assert.deepEqual(selectOwner(scene.world), selectOwner(seedWorld()), 'Synthetic setup must preserve the seed owner choices and background');
const sceneFile = 'tooling/experiments/autonomous-demand-211.scene.json';
writeFileSync(sceneFile, scene.json);
const planFile = 'tooling/experiments/autonomous-demand-211.json';
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
Object.assign(plan, { sceneFile, sceneSha256: createHash('sha256').update(scene.json).digest('hex'), sceneVersion: scene.version,
  sceneFixtureSource: 'tests/fixtures/demand-integration-loop.cjs', sceneGeneratedFromCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
  sceneFixtureSha256: createHash('sha256').update(readFileSync('tests/fixtures/demand-integration-loop.cjs', 'utf8').replaceAll('\r\n', '\n')).digest('hex'), ownerSeedInvariant: selectOwner(seedWorld()) });
writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ sceneFile, sceneSha256: plan.sceneSha256, ownerSeedUnchanged: true, realProviderCalls: 0 }));
