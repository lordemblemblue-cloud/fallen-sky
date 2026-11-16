import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../src/components/game3d/axe/services/' + path, import.meta.url), 'utf8');
const workspace = read('AXECompanionWorkspace.jsx');
const loadout = read('AXEGlassLoadoutPane.jsx');
const styling = read('AXEGlassLoadoutPane.css');

test('Mastery is a top-level sibling of Equipment before Variety/Imbue', () => {
  assert.match(workspace, /const TABS=\['Equipment','Mastery','Vanity','Imbuement'\]/);
  assert.match(workspace, /data-companion-nav="primary"/);
  assert.match(workspace, /next==='Vanity'\?'Variety'/);
  assert.match(workspace, /tab==='Mastery'\?<div/);
  assert.doesNotMatch(workspace, /axe-comp-equipment-subnav/);
});

test('Companions classic left box has title and underline-only search in one header', () => {
  assert.match(loadout, /data-companion-roster-layout="classic"/);
  assert.match(loadout, /className="axe-comp-roster-title"/);
  assert.match(loadout, /<strong>Companions<\/strong>/);
  assert.match(loadout, /aria-label="Search companion"/);
  assert.match(loadout, /placeholder=\{rosterFocused\?'':'Search companion'\}/);
  assert.match(styling, /\.axe-comp-roster-search \{[\s\S]*?border-bottom:1px solid/);
});

test('Renders real saved mounts as compact vertical rows, not square cards', () => {
  assert.match(loadout, /filteredMounts\.map\(mount=>/);
  assert.match(loadout, /mount\.instanceId===mounts\.activeMountId/);
  assert.match(styling, /\.axe-comp-roster-list>button \{[\s\S]*?aspect-ratio:auto/);
  assert.match(styling, /\.axe-comp-roster-list \{[\s\S]*?flex-direction:column/);
});

test('Equipment controls and the existing Mastery page stay wired', () => {
  assert.match(workspace, /<AXEGlassLoadoutPane actor="companion"/);
  assert.match(workspace, /<AXECompanionMasteryPanel/);
  assert.match(loadout, /activateAXEMount/);
  assert.match(loadout, /registerAXEMount/);
  assert.match(workspace, /data-companion-ui-revision="classic-roster-primary-mastery-20261116"/);
});
