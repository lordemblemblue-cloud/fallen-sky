import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GAME3D_WINDOWS_EXE_URL, readGame3DDesktopInstall, saveGame3DDesktopInstall,
} from '../src/components/game3d/performance/Game3DDesktopInstall.mjs';

const menu = readFileSync(new URL('../src/components/game3d/PauseMenu.jsx', import.meta.url), 'utf8');

function memoryHost() {
  const store = new Map();
  const events = [];
  return {
    events,
    localStorage: {
      getItem: key => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
    },
    dispatchEvent(event) { events.push(event); },
  };
}

test('the Windows exe choice is remembered and does not pretend a download exists', () => {
  assert.equal(GAME3D_WINDOWS_EXE_URL, null);
  const host = memoryHost();
  assert.equal(readGame3DDesktopInstall(host).target, 'browser');
  assert.equal(readGame3DDesktopInstall(host).exeReady, false);
  const saved = saveGame3DDesktopInstall('windows-exe', host);
  assert.equal(saved.target, 'windows-exe');
  assert.equal(saved.url, null);
  assert.equal(readGame3DDesktopInstall(host).target, 'windows-exe');
  assert.equal(saveGame3DDesktopInstall('not-a-target', host).target, 'browser');
  assert.match(menu, /Windows 10 \.exe/);
  assert.match(menu, /no installer to download yet/);
  assert.doesNotMatch(menu, /href=.*\.exe/);
});
