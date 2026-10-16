// Test-only preload: model mocks may replace fetch, but restoring the original
// must never restore public network access. Child test processes inherit NODE_OPTIONS.
const nativeFetch = globalThis.fetch;
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!loopback.has(url.hostname)) {
    console.error('[test-network-denied]', url.origin);
    throw Error('External network blocked by local test fixture');
  }
  return nativeFetch(input, { ...init, redirect: 'error' });
};
