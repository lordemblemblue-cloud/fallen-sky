import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  measureAXEServicesArea, splitAXEServiceRows,
} from '../src/components/game3d/axe/services/AXEServicesNavigationLayout.js';

const read=path=>readFileSync(new URL('../src/components/game3d/'+path,import.meta.url),'utf8');
const css=read('hud/JadeSoulHUD.css');
const row=css.slice(css.lastIndexOf('/* HUD top row: MAP | SERVICES | WEATHER'));
const nav=read('axe/services/AXEServicesNavigation.jsx');
const hud=read('hud/JadeSoulHUD.jsx');
const levelCSS=read('notifications/Game3DLunarNotifications.css');
const level=levelCSS.slice(levelCSS.indexOf('/* Compact level-up card. Follow the real minimap'));

test('top-row map is far left and weather is far right with Services between',()=>{
  assert.ok(row.length>500);
  assert.match(row,/\.jade-hud \.jade-compass-block \{\s*top:clamp\(19px,3vh,37px\);\s*left:clamp\(14px,2\.4vw,42px\);\s*right:auto;/);
  assert.match(row,/\.game3d-view \.game3d-world-weather \{\s*top:clamp\(19px,3vh,37px\);\s*left:auto;\s*right:clamp\(14px,2\.4vw,42px\);/);
  assert.match(row,/\.jade-hud \.jade-services-navigation \{/);
  assert.match(nav,/measureAXEServicesArea\(\{/);
  assert.match(nav,/compass: hud\.querySelector\('\.jade-compass-block'\)/);
  assert.match(hud,/aria-label="Open world map"/);
  assert.match(hud,/<AXEServicesNavigation/);
});

test('desktop Services start after visible map and end before visible weather',()=>{
  const bounds={left:100,right:1540,top:60,bottom:960};
  const compass={left:132,right:300,top:82,bottom:250};
  const weather={left:1200,right:1500,top:82,bottom:160};
  const nav=measureAXEServicesArea({bounds,status:{right:100,top:80},compass,weather});
  assert.deepEqual(nav,{left:212,width:876,top:22});
  assert.equal(bounds.left+nav.left,compass.right+12);
  assert.equal(bounds.left+nav.left+nav.width,weather.left-12);
  assert.ok(nav.width>0);
});

test('mobile Services preserve a usable gap without overlapping the map or weather',()=>{
  const bounds={left:0,right:320,top:0,bottom:660};
  const compass={left:12,right:92,top:18,bottom:98};
  const weather={left:192,right:312,top:18,bottom:100};
  const menu=measureAXEServicesArea({bounds,compass,weather});
  assert.deepEqual(menu,{left:100,width:84,top:18});
  assert.equal(menu.left-compass.right,8);
  assert.equal(weather.left-menu.left-menu.width,8);
  assert.ok(splitAXEServiceRows([65,70,70,70,70],menu.width).length<=2);
  const open=measureAXEServicesArea({bounds,compass,weather:null});
  assert.ok(open.width>menu.width,'expanded Services may use room vacated by hidden weather');
  assert.match(row,/@media\(max-width:620px\)/);
  assert.match(row,/@media\(max-width:420px\)/);
  assert.match(row,/width:80px/);
  assert.match(row,/width:120px/);
});

test('level-up alert follows the new map position and quests avoid the same HUD space',()=>{
  assert.match(level,/left:clamp\(14px,2\.4vw,42px\);\s*right:auto;/);
  assert.match(level,/top:calc\(clamp\(19px,3vh,37px\) \+ clamp\(126px,11\.2vw,184px\) \+ 50px\)/);
  assert.match(level,/left:12px;right:auto;\s*top:calc\(25px \+ 106px \+ 43px\)/);
  assert.match(level,/top:calc\(18px \+ 80px \+ 43px\)/);
  assert.match(row,/\.jade-hud \.jade-quest-tracker \{/);
  assert.match(row,/50px \+ 115px \+ 26px/);
  // Other notification cards and map click actions are unchanged.
  assert.match(hud,/window\.dispatchEvent\(new CustomEvent\('axeOpenWorldMap'\)\)/);
  assert.match(levelCSS,/\.axe-lunar-notifications--message\{/);
  assert.match(levelCSS,/\.axe-lunar-notifications--story\{/);
});
