import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/components/fantasybattle/titleMist.css',import.meta.url),'utf8');
const svg=readFileSync(new URL('../public/fantasybattle/sapphire/effects/title-ink-mist.svg',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/routes/fantasy-battle.jsx',import.meta.url),'utf8');
test('mist is scoped to original title menu and cannot intercept inputs',()=>{
  assert.ok(route.includes("import '@/components/fantasybattle/titleMist.css';"));
  for(const pseudo of ['::before','::after'])assert.ok(css.includes('.fa-ui[data-screen="01"][data-staged-original="true"] .fa-original-menu'+pseudo));
  assert.ok(css.includes('width: 33%'));
  assert.ok(css.includes('pointer-events: none'));
  assert.match(css,/\.fa-original-menu > \*\s*\{\s*z-index: 1/);
});
test('mist repeats by an exact positive horizontal tile distance',()=>{
  assert.ok(css.includes('background-repeat: repeat-x'));
  assert.ok(css.includes('background-size: var(--fa-mist-tile) 100%'));
  assert.ok(css.includes('from { background-position-x: 0; }'));
  assert.ok(css.includes('to { background-position-x: var(--fa-mist-tile); }'));
  assert.ok(css.includes('linear infinite'));
  assert.ok(svg.includes('stroke="url(#outline)"'));
  assert.doesNotMatch(svg,/<script|<filter|<animate|<image/i);
});
test('both reduced motion settings suppress the decoration',()=>{
  assert.ok(css.includes('.fa-root.reduced-motion .fa-original-menu::before'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.equal((css.match(/display: none;/g)||[]).length,2);
});
