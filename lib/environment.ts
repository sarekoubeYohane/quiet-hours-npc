import { env } from 'cloudflare:workers';

// Injected by the Vite config at dev/build time from `git rev-parse --short HEAD`.
// Absent in the Node test build; null when git was unavailable at build time.
declare const __GIT_COMMIT__: string | null | undefined;

export type EnvironmentView = { name: string; label: string; commit: string; caption: string };

const labels: Record<string, string> = { local: '本機', test: '測試站', production: '正式站' };

export function environmentLabel(name: string): string {
  return labels[name] || name;
}

// APP_ENV comes from the Wrangler environment's vars. The commit is fixed at build time,
// so what the page shows is always the commit that was actually built and deployed.
export function currentEnvironment(): EnvironmentView {
  const name = env.APP_ENV || 'unknown';
  const commit = typeof __GIT_COMMIT__ === 'string' && __GIT_COMMIT__ ? __GIT_COMMIT__ : 'unknown';
  const label = environmentLabel(name);
  return { name, label, commit, caption: `${label} · 版本 ${commit}` };
}
