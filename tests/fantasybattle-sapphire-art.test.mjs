import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_SCREENS} from '../src/components/fantasybattle/uiCatalog.mjs';
import {makeSapphireTemplate,artFor,artUrl,templateUrl,ORIGINAL_TEMPLATES,originalTemplateFor,originalTemplateCoverage} from '../src/components/fantasybattle/sapphireArt.mjs';
const assets=new Set(['title-original','sanctuary','celestial','ruins','moonlit','wilds']);
test('all 48 artwork frames are text free',()=>{assert.equal(Object.keys(UI_SCREENS).length,48);for(const id of Object.keys(UI_SCREENS)){const s=makeSapphireTemplate(id);assert.match(s,/^<svg/);assert.match(s,/<\/svg>$/);assert.doesNotMatch(s,/<text[ >]|<foreignObject|<script/i);}});
test('screen artwork points only to registered assets',()=>{for(const id of Object.keys(UI_SCREENS))for(const running of [true,false]){const a=artFor(id,running);if(a.asset){assert.ok(assets.has(a.asset));assert.match(artUrl(a.asset),/\.webp$/);}}});
test('gameplay HUD and confirmation overlays never cover the world with an opaque picture',()=>{for(const id of ['09','10','41'])assert.equal(artFor(id,true).mode,'transparent');for(const id of ['04','13','39','40','47'])assert.equal(artFor(id,true).mode,'overlay');});

import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const verifiedAssets=[["backgrounds/celestial.webp","6a0a9b62c24fafb9772e3689b20bf52e348fd07b"],["backgrounds/moonlit.webp","5a8900f58a3f5af0c1812c8afdfdeef8c5cf7772"],["backgrounds/ruins.webp","c62d8ed343ee91d6df911a46614955410cdc749b"],["backgrounds/sanctuary.webp","91d9fa3560f935a66c7990b874042dccfde0ccd0"],["backgrounds/title-original.webp","2b63ab980bd29150af8d8b6a06026a268391a74b"],["backgrounds/wilds.webp","01f1f7f4818b99f976bc1d152df02b9d1b94759c"],["illustrations/item-acquired.webp","da87e8b08b703cbc47de188d253d60d12ac600f5"],["illustrations/quest-complete.webp","b0dfd13bd2f68cc76785c6e2b0351ecae5445d4b"],["illustrations/quest-offer.webp","036ba9c7f654fde05ffb4bacec820f802e073d90"],["illustrations/skill-unlocked.webp","d1e4d4e07efd1a4d63d1ffb328acfddb1fd2854a"]];
test('all ten shipped painted assets are valid WebP files and match approved blob hashes',()=>{for(const [name,expected] of verifiedAssets){const bytes=readFileSync(new URL('../public/fantasybattle/sapphire/'+name,import.meta.url));assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');const hash=createHash('sha1').update('blob '+bytes.length).update(Buffer.from([0])).update(bytes).digest('hex');assert.equal(hash,expected,name);}});

test('refined static frames are cached and all panels fit the normalized canvas',()=>{for(const [id,s] of Object.entries(UI_SCREENS)){const frame=makeSapphireTemplate(id),url=templateUrl(id);assert.equal(url,templateUrl(id));if(!originalTemplateFor(id))assert.equal(decodeURIComponent(url.split(',')[1]),frame);assert.match(frame,/id="edge"/);assert.match(frame,/id="sheen"/);assert.doesNotMatch(frame,/<filter|<animate|<text[ >]/i);for(const [x,y,w,h] of s.layout){assert.ok(x>=0&&y>=0&&w>0&&h>0);assert.ok(x+w<=1.000001&&y+h<=1.000001);}}assert.equal(templateUrl('invalid'),'');assert.ok(UI_SCREENS['09'].layout[3][3]>.3);});

// Every adopted picture must be a real local image, with its original source tracked.
// The empty registry is intentionally incomplete, not a claim of visual completion.
test('registered original templates use the picture directly and bypass generated art',()=>{
 assert.equal(originalTemplateCoverage(),Object.keys(ORIGINAL_TEMPLATES).length);
 assert.equal(originalTemplateFor('invalid'),null);
 for(const [id,entry] of Object.entries(ORIGINAL_TEMPLATES)){
  assert.ok(Object.hasOwn(UI_SCREENS,id));assert.ok(entry.source?.trim());
  assert.equal(entry.asset,id+'.webp');
  assert.ok(['full','overlay'].includes(entry.mode));
  if(['hud','toast','overlay','modal'].includes(UI_SCREENS[id].mode))assert.equal(entry.mode,'overlay');
  const original=originalTemplateFor(id);assert.equal(templateUrl(id),original.url);
  for(const running of [true,false])assert.deepEqual(artFor(id,running),{mode:'original-'+entry.mode,asset:null});
  const bytes=readFileSync(new URL('../public'+original.url,import.meta.url));
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
 }
});
