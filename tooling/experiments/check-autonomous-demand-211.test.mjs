import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkMaterials } from './check-autonomous-demand-211.mjs';

test('valid public material remains explicitly unready for paid execution', () => {
  const report = checkMaterials();
  assert.equal(report.materialsValid, true, JSON.stringify(report.errors));
  assert.equal(report.paidReady, false);
  assert.equal(report.realProviderCalls, 0);
  assert.ok(report.missing.includes('applicable-finite-paid-authorization-and-remaining-balance'));
});

test('changing the scene bytes without registration fails exact hash verification', () => {
  const root = mkdtempSync(join(tmpdir(), 'demand-material-review-'));
  try {
    const plan = JSON.parse(readFileSync('tooling/experiments/autonomous-demand-211.json', 'utf8'));
    for (const file of [plan.sceneFile, plan.sceneFixtureSource]) {
      mkdirSync(resolve(root, file, '..'), { recursive: true });
      writeFileSync(resolve(root, file), readFileSync(file));
    }
    const scene = JSON.parse(readFileSync(plan.sceneFile, 'utf8'));
    scene.characters.find(c => c.id === 'owner').goal = 'fixture tampering';
    writeFileSync(resolve(root, plan.sceneFile), JSON.stringify(scene));
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, JSON.stringify(plan));
    const report = checkMaterials({ root, planPath });
    assert.equal(report.materialsValid, false);
    assert.ok(report.errors.includes('exact-scene-sha256'));
    assert.ok(report.errors.includes('seed-owner-personality-goal-intents-preserved'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the CLI refuses paid-ready even with valid materials and never enables a transport', () => {
  const result = spawnSync(process.execPath, ['tooling/experiments/check-autonomous-demand-211.mjs', '--paid-ready'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.paidReady, false);
  assert.equal(report.realProviderCalls, 0);
  assert.ok(report.errors.some(error => error.startsWith('paid-ready-refused')));
});

test('a changed material version cannot reuse the registered scene as a valid experiment', () => {
  const directory = mkdtempSync(join(tmpdir(), 'demand-version-review-'));
  try {
    const plan = JSON.parse(readFileSync('tooling/experiments/autonomous-demand-211.json', 'utf8'));
    plan.version = 2;
    const planPath = join(directory, 'plan.json');
    writeFileSync(planPath, JSON.stringify(plan));
    const report = checkMaterials({ planPath });
    assert.equal(report.materialsValid, false);
    assert.ok(report.errors.includes('material-contract-version'));
    assert.equal(report.paidReady, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
