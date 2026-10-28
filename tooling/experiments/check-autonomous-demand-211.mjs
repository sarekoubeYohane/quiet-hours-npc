// Offline material validation only. No provider transport, HTTP, credential
// reading, world mutation or paid execution mode is implemented here.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function checkMaterials({ root = repositoryRoot, planPath = resolve(root, 'tooling/experiments/autonomous-demand-211.json') } = {}) {
  const errors = [], missing = [], checks = [];
  let plan, scene;
  const check = (condition, message) => (condition ? checks : errors).push(message);
  try {
    plan = JSON.parse(readFileSync(planPath, 'utf8'));
    check(plan.version === 1 && plan.issue === 211 && plan.sceneVersion === 'demand-integration.v1', 'material-contract-version');
    check(plan.paidExecutionEnabled === false, 'paid-execution-disabled');
    const bytes = readFileSync(resolve(root, plan.sceneFile));
    check(hash(bytes) === plan.sceneSha256, 'exact-scene-sha256');
    scene = JSON.parse(bytes.toString('utf8'));
    check(scene.contextId === 'demand-integration-v1' && scene.characters.length === 2 && scene.characters.some(c => c.id === 'cass'), 'isolated-two-character-scene');
    const owner = scene.characters.find(c => c.id === plan.owner.actor);
    check(!!owner && JSON.stringify({ personality: owner.personality, goal: owner.goal, intents: owner.intents }) === JSON.stringify(plan.ownerSeedInvariant), 'seed-owner-personality-goal-intents-preserved');
    check(owner?.control?.mode === 'autonomous' && !owner.control.pending && !owner.control.active && !owner.plan, 'owner-not-controlled-or-scripted');
    check(plan.owner.transport === 'real-model-only' && plan.owner.initialIntentMutation === false && plan.owner.forcedFirstAction === null, 'real-owner-decision-required');
    check(plan.customer.transport === 'controlled-npc-transport-fixture' && plan.customer.npcTransportPaidProviderCalls === 0, 'controlled-customer-npc-transport-separated');
    const expectedSchedule = ['supply-question:1', 'explicit-request:1', 'offer-accepted:1', 'offer-accepted:2', 'explicit-request:2', 'supply-question:2'];
    check(JSON.stringify(plan.schedule) === JSON.stringify(expectedSchedule) && plan.repetitionsPerScenario === 2, 'fixed-three-scenario-schedule');
    check(plan.window.maxAdvancesPerTrial === 8 && plan.window.minutesPerAdvance === 15 && plan.limits.maxNewAdvances === 48 && plan.limits.maxProviderCalls === 96 && plan.limits.maxMeasuredInputAndOutputTokens === 2000000 && plan.limits.maxUsd === 1 && plan.limits.maxElapsedMinutesFromFirstPaidCall === 45, 'fixed-observation-and-budget-ceilings');
    check(plan.classifications.length === 9 && plan.stopOn.includes('pending-or-uncertain-commit') && plan.stopOn.includes('unknown-usage-or-cost'), 'classification-and-stop-contract');
    const fixtureBytes = readFileSync(resolve(root, plan.sceneFixtureSource));
    check(hash(fixtureBytes.toString('utf8').replaceAll('\r\n', '\n')) === plan.sceneFixtureSha256, 'scene-fixture-source-hash');
    if (!plan.implementationCommit) missing.push('final-reviewed-implementation-commit');
    else {
      const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
      const ref = git(['rev-parse', '--verify', `${plan.implementationCommit}^{commit}`]);
      check(/^[0-9a-f]{40}$/.test(plan.implementationCommit) && ref.status === 0 && ref.stdout.trim() === plan.implementationCommit, 'pinned-implementation-commit');
      check(git(['diff', '--quiet', plan.implementationCommit, '--', 'lib', 'app', 'components']).status === 0, 'checkout-product-matches-pinned-commit');
      const fixture = git(['show', `${plan.implementationCommit}:${plan.sceneFixtureSource}`]);
      check(fixture.status === 0 && hash(fixture.stdout.replaceAll('\r\n', '\n')) === hash(fixtureBytes.toString('utf8').replaceAll('\r\n', '\n')), 'pinned-commit-scene-fixture');
    }
    if (!plan.authorizationReference) missing.push('applicable-finite-paid-authorization-and-remaining-balance');
    if (!plan.priceSnapshot) missing.push('official-price-snapshot-and-next-round-cost-reserve');
  } catch (error) { errors.push(`unreadable-or-invalid-material: ${error.code || error.name}`); }
  // An offline check cannot prove a live credential, remaining provider credit,
  // or an execution transport. It deliberately never marks this run paid-ready.
  missing.push('live-provider-credential-and-isolated-runtime-verification', 'reviewed-continuous-world-live-runner');
  return { materialsValid: errors.length === 0, paidReady: false, paidExecutionEnabled: false, realProviderCalls: 0,
    sceneSha256: plan?.sceneSha256 ?? null, implementationCommit: plan?.implementationCommit ?? null, checks, errors, missing };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), paidRequested = args.includes('--paid-ready');
  const index = args.indexOf('--plan');
  const report = checkMaterials(index < 0 ? {} : { planPath: resolve(args[index + 1] || '') });
  if (paidRequested) report.errors.push('paid-ready-refused: this command validates offline materials only');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = !report.materialsValid || paidRequested ? 2 : 0;
}
