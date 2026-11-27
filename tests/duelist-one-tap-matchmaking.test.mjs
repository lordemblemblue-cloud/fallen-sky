import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { templateLaunch } from '../src/components/duelist/menu/templateCatalog.mjs';

const hub = readFileSync(new URL('../src/components/duelist/menu/DuelistTemplateHub.jsx', import.meta.url), 'utf8');

test('public mode cards select the mode, then open the named-server browser instead of queuing', () => {
  assert.match(hub, /onClick=\{\(\) => onSelect\(item\.id\)\}/);
  assert.match(hub, /onSelect=\{chooseMode\}/);
  assert.match(hub, /const chooseMode = id => setMode\(id\)/);
  assert.match(hub, /onClick=\{\(\) => openServers\(mode\.route\)\}/);
  assert.match(hub, /page: 'online-play'/);
  assert.doesNotMatch(hub, /launch\(id, true\)|'QUEUE'/);
  assert.equal(templateLaunch('normal', 'ctf', true, true), null);
  assert.equal(templateLaunch('normal', 'control', true, true), null);
});

test('offline, ranked and custom categories are not silently put into public matches', () => {
  assert.equal(templateLaunch('normal', 'ctf', true, false), null);
  assert.equal(templateLaunch('ranked', 'ctf', true, true), null);
  assert.equal(templateLaunch('custom', 'create-lobby', true, true), null);
  assert.deepEqual(templateLaunch('normal', 'ctf', false, false), { mode: 'ctf', online: 0 });
});
