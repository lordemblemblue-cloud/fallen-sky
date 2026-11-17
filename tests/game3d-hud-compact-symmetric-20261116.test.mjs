import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
const css=read('src/components/game3d/hud/JadeApprovedGoldTemplate.css');
const quest=read('src/components/game3d/hud/JadeQuestTracker.css');

test('reference silhouette is one UI shell, with live HP/WILL tracks INSIDE it',()=>{
  assert.match(hud,/data-hud-template="approved-gold-shell-20261117"/);
  assert.match(hud,/className="jade-hud-template-art"/);
  assert.match(hud,/viewBox="0 0 1200 270"/);
  assert.match(hud,/\['hp','will'\]\.map\(side=>/);
  assert.match(hud,/transform=\{side==='will'\?'translate\(1200 0\) scale\(-1 1\)'/);
  assert.match(css,/width:min\(70vw,800px\)/);
  assert.match(css,/\.jade-status-row--hp\s*\{\s*left:9%/);
  assert.match(css,/\.jade-status-row--will\s*\{\s*left:auto;\s*right:9%/);
  assert.doesNotMatch(hud,/jade-status-connector|jade-status-raster-trim/);
});
test('octagon frame holds live EXP water and text without a fixed ornamental divider',()=>{
  assert.match(hud,/Complete octagon: no middle divider or ornamental horizontal wave/);
  assert.match(hud,/className="jade-xp jade-xp--compact"/);
  assert.match(hud,/aria-label=\{`Level \$\{hud\?\.level \|\| 1\} experience`\}/);
  assert.match(hud,/className="jade-xp-number">\{fmt\(hud\?\.level \|\| 1\)\}/);
  assert.match(hud,/className="jade-xp-caption">EXP/);
  assert.match(hud,/fmt\(hud\?\.xp\)/);
  assert.match(hud,/fmt\(hud\.xpForNext\)/);
  assert.doesNotMatch(hud,/jade-xp-octagon-energy|jade-xp-octagon-rule|jade-xp-raster-frame/);
  assert.doesNotMatch(hud,/>AGENT<|2,840\s*\/\s*2,840|24,300\s*\/\s*40,000/);
  assert.match(hud,/className="jade-xp-liquid-glass"/);
  assert.match(hud,/className="jade-xp-water-level"/);
  assert.match(css,/backdrop-filter:blur\(11px\)/);
  assert.match(css,/height:var\(--jade-xp-progress,0%\)/);
});
test('HP and WILL are real values and display matching colored tracks',()=>{
  assert.match(hud,/style=\{\{width:hpPct\+'%'\}\}/);
  assert.match(hud,/style=\{\{width:willPct\+'%'\}\}/);
  assert.match(hud,/fmt\(hud\?\.hp\)/);
  assert.match(hud,/fmt\(hud\?\.maxHP\)/);
  assert.match(hud,/fmt\(currentWill\)/);
  assert.match(hud,/fmt\(maxWill\)/);
  assert.match(hud,/aria-label="HP"/);
  assert.match(hud,/aria-label="WILL"/);
});
test('legacy weapon UI, stamina popup and Questbook dock are not moved',()=>{
  assert.match(hud,/<WeaponStack playerLevel=\{hud\?\.level\} \/>/);
  assert.match(hud,/<SkillMatrix loadout=\{loadout\}\/>/);
  assert.match(hud,/<JadeQuestTracker/);
  assert.match(hud,/data-stamina-visible=\{staminaVisible && !navigationHidden/);
  assert.match(quest,/--axe-quest-top:calc\(clamp\(148px,20vh,220px\) \+ clamp\(48px,7vh,72px\)\)/);
  assert.doesNotMatch(css,/jade-quest-tracker|axe-quest-top|axe-echo-launch/);
});
test('small screens keep the frame in bounds and water has reduced-motion fallback',()=>{
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media\(max-width:420px\)/);
  assert.match(css,/@media\(max-height:500px\) and \(orientation:landscape\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/@keyframes jade-exp-wave|jade-xp-octagon-energy::before/);
  assert.match(css,/@keyframes jade-glass-river-flow/);
  assert.match(css,/\.jade-xp-water-wave,\s*\.jade-hud/);
});
