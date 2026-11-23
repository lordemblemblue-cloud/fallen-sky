import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { templateLaunch } from '../src/components/duelist/menu/templateCatalog.mjs';

const hub = readFileSync(new URL('../src/components/duelist/menu/DuelistTemplateHub.jsx', import.meta.url), 'utf8');

test('a normal public mode card queues immediately when a real lobby is online', () => {
  assert.match(hub, /onClick=\{\(\) => onSelect\(item\.id\)\}/);
  assert.match(hub, /onSelect=\{chooseMode\}/);
  assert.match(hub, /const chooseMode = id =>/);
  assert.match(hub, /category === 'normal' && lobby\.online && selected\?\.route && MENU_MODES\[selected\.route\]\?\.online/);
  assert.match(hub, /launch\(id, true\)/);
  assert.deepEqual(templateLaunch('normal', 'ctf', true, true), { mode: 'ctf', online: 1 });
  assert.deepEqual(templateLaunch('normal', 'control', true, true), { mode: 'control', online: 1 });
});

test('offline, ranked and custom categories are not silently put into public matches', () => {
  assert.equal(templateLaunch('normal', 'ctf', true, false), null);
  assert.equal(templateLaunch('ranked', 'ctf', true, true), null);
  assert.equal(templateLaunch('custom', 'create-lobby', true, true), null);
  assert.deepEqual(templateLaunch('normal', 'ctf', false, false), { mode: 'ctf', online: 0 });
});
