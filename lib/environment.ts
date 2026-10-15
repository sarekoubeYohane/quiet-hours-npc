import { env } from 'cloudflare:workers';

// Injected by the Vite config at dev/build time: the commit from `git rev-parse --short HEAD`
// (null when git was unavailable) and the build time as an ISO string. Both are absent in the
// Node test build.
declare const __GIT_COMMIT__: string | null | undefined;
declare const __BUILT_AT__: string | undefined;

export type EnvironmentView = { name: string; label: string; commit: string; builtAt: string; builtAtLabel: string; caption: string };

// Asia/Taipei is UTC+8 without daylight saving. Formatting here, without Intl, keeps the server-rendered
// string identical in the browser, so hydration does not see a different clock or locale.
export function taipeiLabel(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return 'unknown';
  const shifted = new Date(time + 8 * 3600000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())} 台北`;
}

const labels: Record<string, string> = { local: '本機', test: '測試站', production: '正式站' };

export function environmentLabel(name: string): string {
  return labels[name] || name;
}

// APP_ENV comes from the Wrangler environment's vars. The commit and build time are fixed at
// build time, so what the page shows is always the build that was actually deployed.
export function currentEnvironment(): EnvironmentView {
  const name = env.APP_ENV || 'unknown';
  const commit = typeof __GIT_COMMIT__ === 'string' && __GIT_COMMIT__ ? __GIT_COMMIT__ : 'unknown';
  const builtAt = typeof __BUILT_AT__ === 'string' && __BUILT_AT__ ? __BUILT_AT__ : 'unknown';
  const label = environmentLabel(name);
  return { name, label, commit, builtAt, builtAtLabel: taipeiLabel(builtAt), caption: `${label} · 版本 ${commit}` };
}
