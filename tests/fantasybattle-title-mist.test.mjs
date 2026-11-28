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
  assert.ok((css.match(/display: none;/g)||[]).length>=2);
});

test('right-side fog is confined to original art and preserves the left menu layout',()=>{
 const selector='.fa-ui[data-screen="01"][data-staged-original="true"] .fa-template';
 for(const pseudo of ['::before','::after'])assert.ok(css.includes(selector+pseudo));
 const shared=css.slice(css.indexOf(selector+'::before,'),css.indexOf(selector+'::before {'));
 for(const value of ['right: 0','width: 69%','pointer-events: none','background-repeat: repeat-x','background-size: var(--fa-mist-tile) 100%','animation: fa-title-mist-wave'])assert.ok(shared.includes(value),value);
 const top=css.slice(css.indexOf(selector+'::before {'),css.indexOf(selector+'::after {',css.indexOf(selector+'::before {')));
 const lower=css.slice(css.indexOf(selector+'::after {',css.indexOf(selector+'::before {')),css.indexOf('/* Real controls'));
 assert.ok(top.includes('30s')&&top.includes('opacity: .22'));
 assert.ok(lower.includes('40s')&&lower.includes('opacity: .28'));
 assert.doesNotMatch(css,/\.fa-template\s*\{[^}]*position\s*:\s*relative/);
});
test('right-side bands honor in-game and system reduced motion',()=>{
 const selector='.fa-ui[data-screen="01"][data-staged-original="true"] .fa-template';
 const reduced=css.slice(css.indexOf('.fa-root.reduced-motion'));
 const system=reduced.slice(reduced.indexOf('@media (prefers-reduced-motion: reduce)'));
 for(const pseudo of ['::before','::after']){
  assert.ok(reduced.includes('.fa-root.reduced-motion '+selector+pseudo));
  assert.ok(system.includes(selector+pseudo));
 }
});

const adventure=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
test('living scenery is mounted inside the original title plate only',()=>{
 const start=adventure.lastIndexOf('className="fa-template"');
 const scene=adventure.indexOf('className="fa-title-scene"',start);
 const header=adventure.indexOf('{!isWorldScreen(id)',scene);
 assert.ok(start>=0&&scene>start&&header>scene);
 const markup=adventure.slice(start,header);
 assert.ok(markup.includes("original&&id==='01'&&!settings.reducedMotion"));
 assert.ok(markup.includes('data-quality={settings.quality}'));
 for(const name of ['moon-glow','waterfall-1','waterfall-2','waterfall-3','sparkles','petals']) assert.ok(markup.includes('fa-scene-'+name),name);
 assert.ok(css.includes('.fa-ui[data-screen="01"][data-staged-original="true"] .fa-title-scene'));
 assert.match(css,/\.fa-title-scene\s*\{[^}]*inset: 0;[^}]*pointer-events: none/);
});
test('waterfall texture scrolls down and scene motion stays lightweight',()=>{
 assert.ok(css.includes('to { transform: translateY(64px); }'));
 assert.ok(css.includes('transparent 43px 64px'));
 assert.ok(css.includes('fa-scene-moon-breathe'));
 assert.ok(css.includes('fa-scene-sparkle'));
 assert.ok(css.includes('fa-scene-petal'));
 assert.ok(css.includes('[data-quality="performance"] .fa-scene-petals i:nth-child(n+3)'));
 assert.ok(css.includes('[data-quality="balanced"] .fa-scene-petals i:nth-child(n+5)'));
 assert.ok(css.includes('.fa-root.reduced-motion .fa-title-scene { display: none; }'));
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.fa-title-scene \{ display: none; \}/);
});
