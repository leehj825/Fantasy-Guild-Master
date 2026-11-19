// Korean coverage: every fixed toast message in the source must translate (no long English runs left over).
import test from 'node:test';
import assert from 'node:assert/strict';
const { audit } = await import('../tools/i18n_audit.mjs');
test('fixed toast messages are translated to Korean', () => {
  const missing = audit(['src/main.js']);
  assert.deepEqual(missing, [], 'untranslated toast messages:\n' + missing.join('\n'));
});
