import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { chooseSceneRendererFor, setLaunchRendererPreference, rememberRendererFailure, RENDERER_OVERRIDE_KEY } from '../src/lib/rendererBackendChoice.mjs';

const games = ['fallen-sky', 'duelist-adventure'];
function storage() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key,value), removeItem: key => map.delete(key) };
}
function host() {
  return { location: { search: '' }, isSecureContext: true, navigator: { gpu: {} }, localStorage: storage(), sessionStorage: storage() };
}

test('No selects classic WebGL for both games; Yes restores automatic native WebGPU', () => {
  const browser = host();
  setLaunchRendererPreference('webgl', browser);
  for (const game of games) assert.equal(chooseSceneRendererFor(game,browser).kind,'webgl');
  assert.equal(browser.localStorage.getItem(RENDERER_OVERRIDE_KEY),'webgl');
  setLaunchRendererPreference('auto',browser);
  for (const game of games) assert.equal(chooseSceneRendererFor(game,browser).kind,'webgpu');
  assert.equal(browser.localStorage.getItem(RENDERER_OVERRIDE_KEY),null);
});
test('Yes never bypasses missing GPU, insecure origin or per-game recovery', () => {
  const browser = host();
  setLaunchRendererPreference('auto',browser);
  rememberRendererFailure(browser,'fallen-sky');
  assert.equal(chooseSceneRendererFor('fallen-sky',browser).kind,'webgl');
  assert.equal(chooseSceneRendererFor('duelist-adventure',browser).kind,'webgpu');
  browser.navigator = {};
  assert.equal(chooseSceneRendererFor('duelist-adventure',browser).kind,'webgl');
  browser.navigator = { gpu: {} };
  browser.isSecureContext = false;
  assert.equal(chooseSceneRendererFor('duelist-adventure',browser).kind,'webgl');
});
test('blocked local storage still honors both launch buttons without crashing', () => {
  const browser=host();
  Object.defineProperty(browser,'localStorage',{ get(){ throw new Error('blocked'); } });
  setLaunchRendererPreference('webgl',browser);
  for(const game of games)assert.equal(chooseSceneRendererFor(game,browser).kind,'webgl');
  setLaunchRendererPreference('auto',browser);
  for(const game of games)assert.equal(chooseSceneRendererFor(game,browser).kind,'webgpu');
});
test('explicit renderer URL remains a developer override', () => {
  const browser=host();
  setLaunchRendererPreference('webgl',browser);
  browser.location.search='?renderer=webgpu';
  assert.equal(chooseSceneRendererFor('fallen-sky',browser).kind,'webgpu');
});
test('hub launches immediately and only displays an optional WebGPU hint',()=>{
  const source=readFileSync(new URL('../src/components/games/hub/GamesCrossScroll.jsx',import.meta.url),'utf8');
  assert.ok(source.includes('>Enable WebGPU</p>'));
  assert.match(source,/onLaunch\?\.\(launch, tile\)/);
  assert.doesNotMatch(source,/GpuLaunchPrompt|pendingLaunch|setLaunchRendererPreference|requestAdapter\(|requestDevice\(/);
});
