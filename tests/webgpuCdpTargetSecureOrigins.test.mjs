import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTarget } from '../scripts/webgpu-native-browser-qa.mjs';

const scenes = [
  ['fallen-sky', '/gameview'],
  ['duelist-adventure', '/duelist-next/play'],
];
const target = (url) => ({
  type: 'page',
  url,
  webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1',
});

for (const [scene, route] of scenes) {
  test(scene + ': CDP browser QA accepts only secure game origins', () => {
    for (const origin of [
      'https://preview.example.com',
      'https://live.example.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
    ]) {
      const url = origin + route + '?renderer=webgpu';
      assert.equal(pickTarget([target(url)], scene).url, url);
    }
    for (const origin of [
      'http://preview.example.com',
      'http://192.168.1.5:3000',
      'http://localhost.evil.example',
      'http://127.0.0.2:3000',
      'http://user:pass@localhost:3000',
      'https://user:pass@live.example.com',
      'file:///tmp/game.html',
    ]) {
      assert.throws(() => pickTarget([target(origin + route)], scene),
        /Expected exactly one matching game tab/);
    }
  });

  test(scene + ': insecure tabs cannot cause ambiguous target selection', () => {
    const good = target('https://live.example.com' + route);
    const bad = target('http://live.example.com' + route);
    assert.equal(pickTarget([good, bad], scene).url, good.url);
    assert.throws(() => pickTarget([bad], scene, 'live.example.com'),
      /Expected exactly one matching game tab/);
  });
}
