import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=path=>readFileSync(new URL('../'+path,import.meta.url));
const component=load('src/components/game3d/hud/JadeSoulHUD.jsx').toString();
const legacy=load('src/components/game3d/hud/JadeSoulHUD.css').toString();
const approved=load('src/components/game3d/hud/JadeApprovedGoldTemplate.css').toString();

test('previous gold PNG pieces remain recoverable as historical source assets',()=>{
  for(const [file,w,h] of [
    ['hp-gold-trim.png',392,54],
    ['will-gold-trim.png',396,57],
    ['exp-gold-octagon.png',186,186],
  ]){
    const bytes=load('public/game3d/hud/'+file);
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),w);
    assert.equal(bytes.readUInt32BE(20),h);
    assert.ok(bytes.indexOf(Buffer.from('tRNS'))>0,file+' retains transparency');
    assert.ok(bytes.length<8192);
  }
});
test('approved new frame replaces the old three independently stretched raster pieces',()=>{
  assert.match(component,/data-hud-template="approved-gold-shell-20261117"/);
  assert.match(component,/className="jade-hud-template-art"/);
  assert.match(component,/\['hp','will'\]\.map\(side=>/);
  assert.match(component,/Complete octagon: no middle divider or ornamental horizontal wave/);
  assert.doesNotMatch(component,/jade-status-raster-trim|jade-xp-raster-frame/);
  assert.match(component,/import '.\/JadeApprovedGoldTemplate.css'/);
  assert.match(approved,/\.jade-hud \.jade-hud-template-art/);
  assert.match(legacy,/jade-status-raster-trim \{/); // backups still exist in old stylesheet
});
test('only live game stats are painted over the decorative frame',()=>{
  assert.match(component,/style=\{\{width:hpPct\+'%'\}\}/);
  assert.match(component,/style=\{\{width:willPct\+'%'\}\}/);
  assert.match(component,/style=\{\{'--jade-xp-progress':xpPct\+'%'\}\}/);
  assert.match(component,/fmt\(hud\?\.hp\)/);
  assert.match(component,/fmt\(currentWill\)/);
  assert.match(component,/fmt\(hud\?\.level \|\| 1\)/);
  assert.doesNotMatch(component,/2,840\s*\/\s*2,840|24,300\s*\/\s*40,000/);
});
test('the approved frame has no fixed decorative crossbar; dynamic EXP water remains behind live text',()=>{
  assert.doesNotMatch(component,/jade-xp-octagon-rule|jade-xp-octagon-energy/);
  assert.doesNotMatch(approved,/jade-exp-wave-left|jade-exp-wave-right/);
  assert.match(component,/className="jade-xp-water-level"/);
  assert.match(approved,/@keyframes jade-glass-river-flow/);
  assert.match(approved,/@media\(max-width:420px\)/);
  assert.match(approved,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(approved,/\.jade-hud\[data-service-mode="true"\] \.jade-hud-template/);
});
