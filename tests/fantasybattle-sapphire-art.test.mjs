import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_SCREENS} from '../src/components/fantasybattle/uiCatalog.mjs';
import {makeSapphireTemplate,artFor,artUrl} from '../src/components/fantasybattle/sapphireArt.mjs';
const assets=new Set(['title-original','sanctuary','celestial','ruins','moonlit','wilds']);
test('all 48 artwork frames are text free',()=>{assert.equal(Object.keys(UI_SCREENS).length,48);for(const id of Object.keys(UI_SCREENS)){const s=makeSapphireTemplate(id);assert.match(s,/^<svg/);assert.match(s,/<\/svg>$/);assert.doesNotMatch(s,/<text[ >]|<foreignObject|<script/i);}});
test('screen artwork points only to registered assets',()=>{for(const id of Object.keys(UI_SCREENS))for(const running of [true,false]){const a=artFor(id,running);if(a.asset){assert.ok(assets.has(a.asset));assert.match(artUrl(a.asset),/\.webp$/);}}});
test('gameplay HUD and confirmation overlays never cover the world with an opaque picture',()=>{for(const id of ['09','10','41'])assert.equal(artFor(id,true).mode,'transparent');for(const id of ['04','13','39','40','47'])assert.equal(artFor(id,true).mode,'overlay');});
