import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {TEMPLATE_MODES,templateLaunch} from '../src/components/duelist/menu/templateCatalog.mjs';
import {mapPicture} from '../src/components/duelist/menu/mapPictures.mjs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const menu=source('src/components/duelist/menu/DuelistTemplateHub.jsx');
const css=source('src/components/duelist/menu/duelistPlayReference.css');
test('normal and practice use the approved shared menu frame with separate headings and actual arena art',()=>{
  assert.match(menu,/category === 'practice' \? 'Practice Mode' : 'Choose Game Mode'/);
  assert.match(menu,/className="dxt-tile-art" src=\{mapPicture\(item.route\)\}/);
  assert.match(menu,/className="dxt-arena-label"/);
  assert.match(menu,/import '.\/duelistPlayReference.css'/);
  for(const category of ['normal','practice'])for(const mode of TEMPLATE_MODES[category]){
    if(mode.route) assert.ok(mapPicture(mode.route),mode.id);
  }
});
test('practice keeps difficulty and opponent selection and launches locally; normal keeps exact server browsing',()=>{
  assert.match(menu,/onPrefs\(\{ level: e.target.value \}\)/);
  assert.match(menu,/onPrefs\(\{ foe: e.target.value \}\)/);
  assert.match(menu,/onClick=\{\(\) => launch\(mode.id\)\}/);
  assert.match(menu,/category === 'practice' \? 'START TRAINING' : 'PRACTICE'/);
  assert.match(menu,/category === 'normal' && <button[^]*?onClick=\{\(\) => openServers\(mode.route\)\}/);
  assert.match(menu,/params: \{ page: 'online-play' \}, search: \{ mode: modeId \}/);
  for(const mode of TEMPLATE_MODES.practice)assert.deepEqual(templateLaunch('practice',mode.id),mode.route?{mode:mode.route,online:0}:null);
});
test('selected cards use sapphire styling; art is decorative and mobile layouts retain touch controls',()=>{
  assert.match(css,/#duelist-play-drawer \.dxt-tile\[data-active="true"\]/);
  assert.match(css,/\.dxt-play-hero-art\s*\{[^}]*pointer-events:none/);
  assert.match(css,/@media \(orientation:landscape\) and \(max-width:1100px\)/);
  assert.match(css,/@media \(max-width:850px\) and \(orientation:portrait\)/);
  assert.match(menu,/Coming Soon/);
  assert.match(menu,/aria-pressed=\{selected === item.id\}/);
  assert.match(menu,/aria-label=\{'Close ' \+ title\}/);
});
