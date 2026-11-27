import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');

test('combat text is inserted as text, not executable markup', () => {
  const source = read('components/fantasybattle/FantasyBattleStage.js');
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /document\.createTextNode\(String\(text\)\)/);
  assert.match(source, /tagElement\.textContent\s*=\s*String\(tag\)/);
  assert.match(source, /\['crit', 'guarded', 'hit', 'miss'\]\.includes\(kind\)/);
});

test('3D rendering failure view is constructed with safe text', () => {
  const source = read('components/game3d/GameWorld3D.jsx');
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /heading\.textContent\s*=\s*'3D world unavailable'/);
  assert.match(source, /guidance\.textContent\s*=/);
});
