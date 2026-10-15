import '../tooling/verification/no-network.mjs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Preserve caller options and preload the same network boundary in all child
// processes, including the temporary-build runners' own Node test children.
const preload = fileURLToPath(new URL('../tooling/verification/no-network.mjs', import.meta.url));
const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${JSON.stringify(preload)}`].filter(Boolean).join(' ') };
for (const args of [
  ['tests/run-activities.mjs'],
  ['tests/run-auth.mjs'],
  ['--test', 'tests/auth-workerd.test.mjs', 'tests/model-keys-workerd.test.mjs', 'tests/migration-gate.test.mjs'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
