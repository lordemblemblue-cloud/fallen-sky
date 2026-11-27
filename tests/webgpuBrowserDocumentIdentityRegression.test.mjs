import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
  buildDocumentIdentityExpression,
  verifySameBrowserDocument,
} from '../scripts/webgpu-native-browser-qa.mjs';

// Evidence for a native renderer is meaningful only if both samples came from
// the same document. This test intentionally does not claim visible GPU pixels.
const ROUTES = [
  ['fallen-sky', 'https://preview.example.test/gameview?renderer=webgpu'],
  ['duelist-adventure', 'https://preview.example.test/duelist-next/play?renderer=webgpu'],
];

for (const [scene, targetUrl] of ROUTES) {
  const before = { url: targetUrl, startedAt: 123456789.25 };
  test(scene + ': document identity probe reads URL and navigation time origin', () => {
    const identity = runInNewContext(buildDocumentIdentityExpression(), {
      location: { href: targetUrl }, performance: { timeOrigin: 123456789.25 },
    });
    assert.equal(identity.url, targetUrl);
    assert.equal(identity.startedAt, before.startedAt);
    assert.deepEqual(verifySameBrowserDocument(identity, { ...identity }, targetUrl),
      { ok: true, reason: 'same-browser-document' });
  });

  test(scene + ': reject reload even when URL is unchanged', () => {
    assert.deepEqual(verifySameBrowserDocument(before, {
      ...before, startedAt: before.startedAt + 1,
    }, targetUrl), { ok: false, reason: 'browser-tab-navigated-or-reloaded' });
  });

  test(scene + ': reject navigation, including route or query-only changes', () => {
    for (const url of [
      targetUrl + '#changed',
      targetUrl.replace('renderer=webgpu', 'renderer=webgl'),
      'https://preview.example.test/',
    ]) {
      assert.deepEqual(verifySameBrowserDocument(before, {
        ...before, url,
      }, targetUrl), { ok: false, reason: 'browser-tab-navigated-or-reloaded' });
    }
  });

  test(scene + ': reject pre-sample navigation and wrong selected tab', () => {
    assert.deepEqual(verifySameBrowserDocument(before, { ...before },
      targetUrl + '&tab=other'), { ok: false, reason: 'initial-browser-tab-url-changed' });
  });

  test(scene + ': reject incomplete or non-finite identity evidence', () => {
    const bad = [null, undefined, {}, { ...before, startedAt: NaN },
      { ...before, startedAt: Infinity }, { ...before, startedAt: '123456789.25' },
      { ...before, url: null }];
    for (const value of bad) {
      assert.deepEqual(verifySameBrowserDocument(value, before, targetUrl),
        { ok: false, reason: 'invalid-browser-document-identity' });
      assert.deepEqual(verifySameBrowserDocument(before, value, targetUrl),
        { ok: false, reason: 'invalid-browser-document-identity' });
    }
    assert.deepEqual(verifySameBrowserDocument(before, before, null),
      { ok: false, reason: 'invalid-browser-document-identity' });
  });
}
