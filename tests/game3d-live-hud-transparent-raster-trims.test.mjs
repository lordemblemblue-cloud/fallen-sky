import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=(path)=>readFileSync(new URL('../'+path,import.meta.url));
const component=load('src/components/game3d/hud/JadeSoulHUD.jsx').toString();
const style=load('src/components/game3d/hud/JadeSoulHUD.css').toString();

test('three genuine screenshot-cut PNG images have transparent alpha and defined dimensions',()=>{
  for(const [file,w,h] of [
    ['hp-gold-trim.png',392,54],
    ['will-gold-trim.png',396,57],
    ['exp-gold-octagon.png',186,186],
  ]){
    const bytes=load('public/game3d/hud/'+file);
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),w);
    assert.equal(bytes.readUInt32BE(20),h);
    assert.ok(bytes.indexOf(Buffer.from('tRNS'))>0,
      file+' must use actual raster transparency instead of an opaque screenshot');
    assert.ok(bytes.length<8192,'HUD art should be lightweight for live rendering');
  }
});
test('translucent screenshot components exist separately from live HP, Will and EXP layers',()=>{
  assert.match(component,/jade-status-raster-trim--hp/);
  assert.match(component,/jade-status-raster-trim--will/);
  assert.match(component,/jade-xp-raster-frame/);
  assert.match(component,/style=\{\{width:hpPct\+'%'\}\}/);
  assert.match(component,/style=\{\{width:willPct\+'%'\}\}/);
  assert.match(component,/style=\{\{'--jade-xp-progress':xpPct\+'%'\}\}/);
  assert.match(component,/fmt\(hud\?\.hp\)/);
  assert.match(component,/fmt\(currentWill\)/);
  assert.match(component,/fmt\(hud\?\.level \|\| 1\)/);
});
test('static art references all three image files rather than CSS-drawn borders',()=>{
  for(const name of ['hp-gold-trim','will-gold-trim','exp-gold-octagon'])
    assert.ok(style.includes("/game3d/hud/"+name+".png"));
  assert.match(style,/\.jade-hud \.jade-xp--compact \{\s*\/\* Exact metal picture/);
  assert.match(style,/background:transparent;\s*border:0;\s*clip-path:none;/);
  assert.match(style,/jade-status-raster-trim \{[\s\S]*?pointer-events:none;/);
  assert.doesNotMatch(component,/2,840\s*\/\s*2,840|24,300\s*\/\s*40,000/);
});
test('HP, Will and EXP transitions respect reduced-motion settings',()=>{
  assert.match(style,/@keyframes jade-hud-gold-breathe/);
  assert.match(style,/@keyframes jade-hud-vitals-sweep/);
  assert.match(style,/@media \(prefers-reduced-motion:reduce\) \{[\s\S]*?\.jade-hud \.jade-status-raster-trim/);
});
