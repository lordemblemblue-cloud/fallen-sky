import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORLD_PVP_ZONE,resolveWorldPvpZone,canWorldPvpAttack} from '../src/components/game3d/pvp/WorldPvpRules.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const control=source('src/components/game3d/pvp/WorldPvpControl.jsx');
const css=source('src/components/game3d/pvp/WorldPvpControl.css');
const placement=source('src/components/game3d/hud/Game3DHUDPlacement.css');
const gameView=source('src/pages/GameView.jsx');

test('PvP renders as a single unboxed switch with World Combat and Safe Zone labels',()=>{
  assert.match(control,/WORLD COMBAT/);
  assert.match(control,/SAFE ZONE/);
  assert.match(control,/OPT-IN ZONE/);
  assert.match(control,/role="switch"/);
  assert.match(control,/aria-checked=\{wantsPvp\}/);
  assert.match(control,/onClick=\{\(\)=>request\(wantsPvp\?WORLD_PVP_MODE.PVE:WORLD_PVP_MODE.PVP\)\}/);
  assert.doesNotMatch(control,/role="group" aria-label="PvE or PvP preference"/);
  assert.match(control,/Combat protected/);
});

test('World Combat aligns with weather on the map right instead of taking the quest position',()=>{
  const rule=css.slice(css.indexOf('.game3d-view .game3d-pvp-control {'));
  assert.match(rule,/top: calc\(var\(--axe-map-bottom, 209px\) \+ 13px\)/);
  assert.match(rule,/right: var\(--axe-map-left/);
  assert.match(rule,/background: none;/);
  assert.match(rule,/border: 0;/);
  assert.match(rule,/box-shadow: none;/);
  assert.doesNotMatch(rule,/left:var\(--axe-map-left/);
  assert.match(css,/@media \(max-width: 620px\)/);
  assert.match(css,/@media \(max-width: 420px\)/);
  assert.match(gameView,/<WorldPvpControl region=\{worldRegion\} suppressed=\{services.active \|\| services.expanded\} \/>/);
});

test('quest tracker takes released space below map and never covers online or level-up notice',()=>{
  assert.match(placement,/\.game3d-view \.jade-quest-tracker/);
  assert.match(placement,/var\(--axe-map-bottom\) \+ var\(--axe-online-block\) \+ 12px/);
  assert.match(placement,/var\(--axe-target-notice-clearance, 0px\)/);
  assert.match(placement,/var\(--axe-hud-notice-floor, 0px\)/);
  assert.doesNotMatch(placement,/var\(--axe-hud-xp-bottom, 36px\) - var\(--axe-launcher-row\)/);
  assert.match(placement,/\.game3d-online-pill/);
});

test('safe zones continue blocking all player damage even when PvP is selected',()=>{
  const town=resolveWorldPvpZone({region:'wolfveil',position:{x:0,z:70}});
  assert.equal(town.kind,WORLD_PVP_ZONE.SAFE);
  const attacker={id:'a',instanceId:'world',mode:'pvp',alive:true};
  const defender={id:'b',instanceId:'world',mode:'pvp',alive:true};
  assert.equal(canWorldPvpAttack({attacker,defender,attackerZone:town,defenderZone:town}).reason,'safe_zone');
});

test('switch still awaits trusted world-server confirmation and fails closed',()=>{
  assert.match(control,/data\?\.verified!==true/);
  assert.match(control,/MODE_CONFIRMED/);
  assert.match(control,/MODE_REQUEST/);
  assert.match(control,/setRequested\(confirmed\)/);
  assert.match(control,/disabled=\{pending\}/);
  assert.match(control,/safeZone\?'Safe Zone: players cannot damage each other here/);
});
