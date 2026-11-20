import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Games Hub still navigates into the public Duelist entry route', () => {
  assert.match(source('src/pages/GamesHub.jsx'), /to:\s*['"]\/duelist['"]/);
});

test('main Duelist entry renders the cinematic hub, not the old Game 2 wrapper', () => {
  const route = source('src/routes/duelist.jsx');
  assert.match(route, /createFileRoute\(['"]\/duelist['"]\)/);
  assert.match(route, /component:\s*DuelistHub/);
  assert.doesNotMatch(route, /component:\s*DuelistAdventure/);
});

test('legacy Duelist Game 2 engine remains available at a distinct route', () => {
  const route = source('src/routes/duelist-classic.jsx');
  assert.match(route, /createFileRoute\(['"]\/duelist-classic['"]\)/);
  assert.match(route, /component:\s*DuelistAdventure/);
  const page = source('src/pages/DuelistAdventure.jsx');
  assert.match(page, /<Game2Duel\b/);
});

test('cinematic hub offers navigation back to the existing Classic Arena', () => {
  const menu = source('src/components/duelist/menu/MenuPages.jsx');
  assert.match(menu, /to=['"]\/duelist-classic['"]/);
  assert.match(menu, /CLASSIC ARENA/);
});

test('existing new-build game and mode routes remain intact', () => {
  assert.match(source('src/routes/duelist-next.index.jsx'), /component:\s*DuelistHub/);
  assert.match(source('src/routes/duelist-next.\$page.jsx'), /ModePage/);
});
