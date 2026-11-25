import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {MAP_PICTURES,mapPicture} from '../src/components/duelist/menu/mapPictures.mjs';
import {ONLINE_SERVER_MODES} from '../src/components/duelist/menu/serverBrowser.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('every online mode and practice has a small checked-in static WebP image',()=>{
 for(const mode of [...ONLINE_SERVER_MODES,'practice']){
  const path=mapPicture(mode);
  assert.ok(path,mode);
  const file=new URL('../public'+path,import.meta.url),data=readFileSync(file);
  assert.equal(data.toString('ascii',0,4),'RIFF');
  assert.equal(data.toString('ascii',8,12),'WEBP');
  assert.ok(statSync(file).size<100_000,mode);
  assert.ok(!data.includes(Buffer.from('ANIM')),mode);
 }
 assert.equal(mapPicture('constructor'),null);
 assert.equal(Object.keys(MAP_PICTURES).length,8);
});
test('map selection uses only an image, with no canvas, renderer, or arena loading',()=>{
 const preview=source('src/components/duelist/menu/OnlineArenaPreview.jsx');
 assert.match(preview,/<img\s/);
 assert.match(preview,/loading="lazy"/);
 assert.doesNotMatch(preview,/from ['"]three|createSceneRenderer|requestAnimationFrame|<canvas|createIndustrialCtfArena|createEscortArena/);
 for(const name of ['OnlinePlayPage','DuelistTemplateHub','MenuPages']){
  const s=source('src/components/duelist/menu/'+name+'.jsx');
  assert.match(s,/<OnlineArenaPreview\s/);
  assert.doesNotMatch(s,/import\(['"].*ImportedControlPointPreview|<ImportedControlPointPreview/);
 }
});
