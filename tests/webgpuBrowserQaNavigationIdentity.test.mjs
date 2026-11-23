import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
  buildDocumentIdentityExpression, verifySameBrowserDocument,
} from '../scripts/webgpu-native-browser-qa.mjs';

const games = [
  ['fallen-sky', 'https://example.test/gameview?renderer=webgpu'],
  ['duelist-adventure', 'https://example.test/duelist-next/play?mode=practice'],
];

for (const [game, url] of games) {
  test(game + ': same document and URL passes during sampling', () => {
    const before = { url, startedAt: 1234.5 };
    assert.deepEqual(verifySameBrowserDocument(before, { ...before }, url),
      { ok: true, reason: 'same-browser-document' });
    const result = runInNewContext(buildDocumentIdentityExpression(), {
      location: { href: url }, performance: { timeOrigin: 1234.5 },
    });
    assert.equal(result.url, url);
    assert.equal(result.startedAt, 1234.5);
  });

  test(game + ': reject navigation, reload and changed renderer query during sampling', () => {
    const before = { url, startedAt: 1234.5 };
    for (const after of [
      { url, startedAt: 1235 },
      { url: 'https://example.test/unrelated', startedAt: 1234.5 },
      { url: url + '&renderer=webgl', startedAt: 1234.5 },
    ]) {
      assert.equal(verifySameBrowserDocument(before, after, url).reason,
        'browser-tab-navigated-or-reloaded');
    }
    assert.equal(verifySameBrowserDocument(before, before, url + '#other').reason,
      'initial-browser-tab-url-changed');
  });

  test(game + ': reject missing or malformed identity evidence', () => {
    const before = { url, startedAt: 1234.5 };
    for (const value of [null, undefined, {}, { url, startedAt: NaN },
      { url, startedAt: Infinity }, { url, startedAt: '1234' }, { url: 42, startedAt: 1234 }]) {
      assert.equal(verifySameBrowserDocument(value, before, url).reason,
        'invalid-browser-document-identity');
      assert.equal(verifySameBrowserDocument(before, value, url).reason,
        'invalid-browser-document-identity');
    }
  });
}
