import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
const template=read('src/components/game3d/hud/JadeApprovedGoldTemplate.css');
const oldCSS=read('src/components/game3d/hud/JadeSoulHUD.css');
const gameHUD=read('src/components/game3d/hud/GameHUD.jsx');

test('the live Game 3D view mounts one approved octagonal template with mirrored, unjoined wings',()=>{
  assert.match(gameHUD,/import JadeSoulHUD from '.\/JadeSoulHUD'/);
  assert.match(gameHUD,/<JadeSoulHUD/);
  assert.match(hud,/data-hud-template="approved-gold-shell-20261117"/);
  assert.match(hud,/viewBox="0 0 1200 270"/);
  assert.match(hud,/\['hp','will'\]\.map\(side=>/);
  assert.match(hud,/translate\(1200 0\) scale\(-1 1\)/);
  assert.match(hud,/mask="url\(#jade-template-wing-fade\)"/);
  assert.match(hud,/jade-template-wing-opacity/);
  assert.match(hud,/M 12 149 L 67 149 Q 77 154/);
  assert.match(hud,/L 482 256/);
  assert.match(hud,/M 551 12 H 649 L 710 74/);
  assert.doesNotMatch(hud,/jade-status-connector|jade-xp-octagon-rule|jade-xp-raster-frame/);
});
test('transparent photos only accent the curved/shaded HP/WILL bars; not the stats',()=>{
  assert.match(template,/background:url\('\/game3d\/hud\/hp-gold-trim\.png'\)/);
  assert.match(template,/background-image:url\('\/game3d\/hud\/will-gold-trim\.png'\)/);
  assert.match(template,/mask-image:linear-gradient\(90deg/);
  assert.match(template,/mask-image:linear-gradient\(270deg/);
  assert.match(template,/border-top-right-radius:70% 90%/);
  assert.match(template,/border-top-left-radius:70% 90%/);
  assert.match(template,/\.jade-status-fill--hp \{/);
  assert.match(template,/\.jade-status-fill--will \{/);
  assert.match(hud,/style=\{\{width:hpPct\+'%'\}\}/);
  assert.match(hud,/style=\{\{width:willPct\+'%'\}\}/);
  assert.match(hud,/fmt\(hud\?\.hp\)/);
  assert.match(hud,/fmt\(currentWill\)/);
  assert.doesNotMatch(hud,/>2,840<|>640<|>24,300</);
  assert.match(oldCSS,/jade-status-raster-trim/); // old assets retained as backup
});
test('octagon contains actual blurred liquid-glass backdrop behind live level/EXP',()=>{
  assert.match(hud,/fillOpacity="\.14"/);
  assert.match(hud,/className="jade-xp-liquid-glass" aria-hidden="true"/);
  assert.match(hud,/className="jade-xp-water" aria-hidden="true"/);
  assert.match(template,/-webkit-backdrop-filter:blur\(11px\) saturate\(145%\)/);
  assert.match(template,/backdrop-filter:blur\(11px\) saturate\(145%\)/);
  assert.match(template,/clip-path:polygon\(23% 0,77% 0,100% 23%/);
  assert.match(hud,/className="jade-xp-number">\{fmt\(hud\?\.level \|\| 1\)\}/);
  assert.match(hud,/className="jade-xp-caption">EXP/);
  assert.match(hud,/fmt\(hud\.xpForNext\)/);
});
test('water rises with real current EXP and falls/reset on next-level value',()=>{
  assert.match(hud,/const xpPct = hasFiniteXP \? ratio\(hud\.xp, hud\.xpForNext\) \* 100 : 100/);
  assert.match(hud,/style=\{\{'--jade-xp-progress':xpPct\+'%'\}\}/);
  assert.match(template,/height:var\(--jade-xp-progress,0%\)/);
  assert.match(template,/bottom:0/);
  assert.match(template,/transition:height 1\.8s cubic-bezier/);
  assert.match(hud,/className="jade-xp-water-wave jade-xp-water-wave--front"/);
  assert.match(hud,/className="jade-xp-water-wave jade-xp-water-wave--back"/);
  assert.match(hud,/className="jade-xp-water-bubbles"/);
  assert.match(template,/@keyframes jade-glass-river-flow/);
  assert.match(template,/@keyframes jade-glass-river-return/);
  assert.match(template,/@keyframes jade-glass-river-bubbles/);
  assert.doesNotMatch(hud,/jade-xp-octagon-energy/);
});
test('mobile and reduced motion remain legible; no ornaments on the hotbar or menus',()=>{
  assert.match(template,/@media\(max-width:700px\)/);
  assert.match(template,/@media\(max-width:420px\)/);
  assert.match(template,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(template,/\.jade-xp-water-wave,\s*\.jade-hud .*\.jade-xp-water-bubbles/);
  assert.match(template,/\.jade-hud\[data-service-mode="true"\] \.jade-hud-template/);
  assert.match(hud,/<WeaponStack playerLevel=\{hud\?\.level\} \/>/);
  assert.match(hud,/<SkillMatrix loadout=\{loadout\}\/>/);
  assert.match(hud,/<JadeQuestTracker/);
});
