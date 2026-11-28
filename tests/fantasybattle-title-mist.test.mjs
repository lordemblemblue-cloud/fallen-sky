import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/components/fantasybattle/titleMist.css',import.meta.url),'utf8');
const svg=readFileSync(new URL('../public/fantasybattle/sapphire/effects/title-ink-mist.svg',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/routes/fantasy-battle.jsx',import.meta.url),'utf8');
const adventure=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');

test('four independent outlined fog bands exist inside the title art only',()=>{
 assert.ok(route.includes("import '@/components/fantasybattle/titleMist.css';"));
 for(const side of ['left','right'])for(const level of ['upper','lower']){
  const name='fa-scene-mist-'+side+'-'+level;
  assert.ok(adventure.includes('className="fa-scene-mist '+name+'"'),name);
  assert.ok(css.includes('.'+name),name);
 }
 assert.match(css,/\.fa-title-scene \.fa-scene-mist\s*\{[^}]*overflow: hidden;[^}]*pointer-events: none/);
 assert.match(css,/\.fa-scene-mist-left-upper, \.fa-scene-mist-left-lower\s*\{[^}]*width: 33%/);
 assert.match(css,/\.fa-scene-mist-right-upper, \.fa-scene-mist-right-lower\s*\{[^}]*width: 69%/);
 assert.doesNotMatch(css,/\.fa-original-menu::|\.fa-template::/);
});
test('fog uses a pre-extended repeating strip moving exactly one tile to the right',()=>{
 assert.ok(css.includes('inset: 0 0 0 calc(-1 * var(--fa-mist-tile))'));
 assert.ok(css.includes("repeat-x 0 center / var(--fa-mist-tile) 100%"));
 assert.ok(css.includes('from { transform: translateX(0); }'));
 assert.ok(css.includes('to { transform: translateX(var(--fa-mist-tile)); }'));
 assert.ok(css.includes('linear infinite'));
 assert.doesNotMatch(css,/background-position-x\s*:/);
 assert.ok(svg.includes('stroke="url(#outline)"'));
 assert.doesNotMatch(svg,/<script|<filter|<animate|<image/i);
});
test('four bands retain distinct speed and opacity',()=>{
 for(const [name,duration,opacity] of [['left-upper','24s','.37'],['left-lower','34s','.46'],['right-upper','30s','.22'],['right-lower','40s','.28']]){
  const start=css.indexOf('.fa-scene-mist-'+name+' {');
  assert.ok(start>=0,name);
  const rule=css.slice(start,css.indexOf('}',start));
  assert.ok(rule.includes('--fa-mist-duration: '+duration),name);
  assert.ok(rule.includes('opacity: '+opacity),name);
 }
});
test('reduced motion suppresses the entire scene including all four fog bands',()=>{
 assert.ok(adventure.includes("original&&id==='01'&&!settings.reducedMotion"));
 assert.ok(css.includes('.fa-root.reduced-motion .fa-title-scene { display: none; }'));
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.fa-title-scene \{ display: none; \}/);
});
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
