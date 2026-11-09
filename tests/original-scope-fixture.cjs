/* Ordinary request authoring only: original identity is supplied by the caller,
 * never read from a cookie or a later GET. Raw scope-negative cases bypass this.
 * Preserve explicitly authored scopes, including intentional wrong-scope cases. */
function originalWorldInput(input, operationScope) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.hasOwn(input, 'operationScope')) return input;
  if (typeof operationScope !== 'string' || !operationScope) throw Error('Fixture must capture its original world scope before constructing a request');
  return { operationScope, ...input };
}
function originalAccountInput(input, accountScope) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.hasOwn(input, 'accountScope')) return input;
  if (typeof accountScope !== 'string' || !accountScope) throw Error('Fixture must capture its original account scope before constructing a request');
  return { accountScope, ...input };
}
module.exports = { originalWorldInput, originalAccountInput };
