import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const frame=src('src/components/game3d/hud/JadeApprovedGoldTemplate.css');
const hud=src('src/components/game3d/hud/JadeSoulHUD.jsx');
const base=src('src/components/game3d/hud/JadeSoulHUD.css');
function lastRule(selector){
  const index=frame.lastIndexOf(selector+' {');
  assert.ok(index>=0,'missing style: '+selector);
  return frame.slice(index,frame.indexOf('}',index)+1);
}
test('the actual 3D HUD increases the gold metalwork, not independent bar overlays',()=>{
  assert.match(frame,/width:min\(70vw,800px\)/);
  assert.match(frame,/height:clamp\(122px,16\.2vh,170px\)/);
  assert.match(frame,/width:min\(80vw,736px\)/);
  assert.match(frame,/width:min\(calc\(100% - 16px\),610px\)/);
  assert.match(hud,/data-hud-template="approved-gold-shell-20261117"/);
  assert.match(hud,/viewBox="0 0 1200 270"/);
  assert.doesNotMatch(hud,/jade-status-connector/);
});
test('HP and WILL sit within the actual gold housing footprint',()=>{
  const row=lastRule('.jade-hud .jade-hud-template .jade-status-bars--refined .jade-status-row');
  assert.match(row,/top:47%/);
  assert.match(row,/width:25\.4%/);
  assert.match(row,/height:36%/);
  const hp=lastRule('.jade-hud .jade-hud-template .jade-status-bars--refined .jade-status-row--hp');
  const will=lastRule('.jade-hud .jade-hud-template .jade-status-bars--refined .jade-status-row--will');
  assert.match(hp,/left:9%/);
  assert.match(will,/right:9%/);
  // SVG uses viewBox width 1200, gold glass wing spans approx x=77..433.
  // These gauges occupy x=108..412.8 and a perfect mirror on the right.
  const left=1200*.09,right=1200*(.09+.254);
  assert.ok(left>=107 && right<=420);
  assert.ok(490-right>70,'a visible gap to the octagon must remain');
  assert.equal(1200-right,1200*(1-.09-.254));
});
test('exactly the inner ends receive matching 45-degree chamfer plus transparency',()=>{
  const hp=lastRule('.jade-hud .jade-hud-template .jade-status-bars--refined .jade-status-row--hp .jade-status-track');
  const will=lastRule('.jade-hud .jade-hud-template .jade-status-bars--refined .jade-status-row--will .jade-status-track');
  const track=lastRule('.jade-hud .jade-hud-template .jade-status-bars--refined .jade-status-track');
  assert.match(track,/--jade-vitals-tip:clamp\(7px,\.70vw,10px\)/);
  assert.match(hp,/clip-path:polygon\(0 0,calc\(100% - var\(--jade-vitals-tip\)\) 0,100% 100%,0 100%\)/);
  assert.match(will,/clip-path:polygon\(var\(--jade-vitals-tip\) 0,100% 0,100% 100%,0 100%\)/);
  assert.match(hp,/-webkit-mask-image:linear-gradient\(90deg,rgba\(0,0,0,\.68\) 0%,#000 34%,#000 87%,transparent 100%\)/);
  assert.match(will,/-webkit-mask-image:linear-gradient\(90deg,transparent 0%,#000 13%,#000 66%,rgba\(0,0,0,\.68\) 100%\)/);
  assert.match(hp,/border-top-right-radius:0/);
  assert.match(will,/border-top-left-radius:0/);
});
test('compact phone display keeps HP and Will inside the shell without clipping readings',()=>{
  assert.match(frame,/@media\(max-width:700px\)/);
  assert.match(frame,/@media\(max-width:420px\)/);
  assert.match(frame,/height:99px/);
  assert.match(frame,/top:46%/);
  assert.match(frame,/font-size:7\.5px/);
  assert.match(frame,/\.jade-status-header span:last-child/);
  assert.match(frame,/font-variant-numeric:tabular-nums/);
});
test('HP/Will/EXP are all real, and glass water plus controls are unchanged',()=>{
  assert.match(hud,/style=\{\{width:hpPct\+'%'\}\}/);
  assert.match(hud,/style=\{\{width:willPct\+'%'\}\}/);
  assert.match(hud,/style=\{\{'--jade-xp-progress':xpPct\+'%'\}\}/);
  assert.match(hud,/subscribePlayerHUD\(setHud\)/);
  assert.match(hud,/subscribeCombatResources\(setResources\)/);
  assert.match(hud,/jade-xp-liquid-glass/);
  assert.match(hud,/jade-xp-water-level/);
  assert.match(frame,/backdrop-filter:blur\(11px\) saturate\(145%\)/);
  assert.match(frame,/@keyframes jade-glass-river-flow/);
  assert.match(base,/jade-status-raster-trim/);
  assert.match(hud,/<WeaponStack playerLevel=\{hud\?\.level\} \/>/);
  assert.match(hud,/<SkillMatrix loadout=\{loadout\}\/>/);
});
