import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
const style=read('src/components/game3d/hud/JadeSoulHUD.css');
const quest=read('src/components/game3d/hud/JadeQuestTracker.css');
const current=style.slice(style.lastIndexOf('2026-11-16 owner screenshot correction: compact, symmetric HP/Will'));

test('HP and WILL shrink from old 1050px maximum without touching hotbar',()=>{
  assert.match(current,/width:min\(52vw,655px\)/);
  assert.match(current,/grid-template-columns:minmax\(0,1fr\) clamp\(98px,8\.8vw,120px\) minmax\(0,1fr\)/);
  assert.match(current,/max-width:465px/);
  assert.match(hud,/<WeaponStack playerLevel=\{hud\?\.level\} \/>/);
  assert.match(hud,/<SkillMatrix loadout=\{loadout\}\/>/);
});
test('both tank elbows share identical geometry with mirrored WILL rather than an extra uphill leg',()=>{
  const exact='d="M1 2 H18 L38 23 H65"';
  assert.equal(hud.split(exact).length-1,2);
  assert.match(hud,/jade-status-connector--hp/);
  assert.match(hud,/jade-status-connector--will/);
  assert.match(current,/\.jade-hud \.jade-status-connector--will \{[^}]*transform:scaleX\(-1\)/);
});
test('EXP octagon uses live values without AGENT label or an extra divider',()=>{
  assert.match(hud,/aria-label=\{`Level \$\{hud\?\.level \|\| 1\} experience`\}/);
  assert.doesNotMatch(hud,/>AGENT<|className="jade-xp-agent"/);
  assert.doesNotMatch(hud,/className="jade-xp-octagon-rule"/);
  assert.match(hud,/--jade-xp-progress':xpPct\+'%'/);
  assert.match(hud,/jade-xp-raster-frame/);
});
test('liquid rises with earned experience and its opposing waves move gently',()=>{
  assert.match(current,/height:var\(--jade-xp-progress,0%\)/);
  assert.match(current,/jade-exp-wave-left 13s/);
  assert.match(current,/jade-exp-wave-right 17s/);
  assert.match(current,/prefers-reduced-motion:reduce/);
});
test('stamina icon is an animated-context runner silhouette, not footprints',()=>{
  assert.match(hud,/className="jade-stamina-runner"/);
  assert.match(hud,/data-stamina-visible=\{staminaVisible && !navigationHidden/);
  assert.doesNotMatch(hud,/Footprints/);
});
test('quest tracker and its restored lower anchor remain independent of HUD edits',()=>{
  assert.match(hud,/<JadeQuestTracker/);
  assert.match(quest,/--axe-quest-top:calc\(clamp\(148px,20vh,220px\) \+ clamp\(48px,7vh,72px\)\)/);
  assert.doesNotMatch(current,/axe-quest-top|jade-quest-tracker|axe-echo-launch/);
});
