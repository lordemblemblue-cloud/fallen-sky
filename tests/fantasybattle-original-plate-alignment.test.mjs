import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {UI_SCREENS} from '../src/components/fantasybattle/uiCatalog.mjs';
import {STAGED_ORIGINAL_ART,ORIGINAL_SAVE_PLAQUE} from '../src/components/fantasybattle/sapphireArt.mjs';

const css=readFileSync(new URL('../src/components/fantasybattle/sapphireAdventure.css',import.meta.url),'utf8');
const jsx=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
const patch=css.slice(css.indexOf('/* Original plate alignment: artwork'));
test('48-screen registry: 45 full pages, two transparent HUDs, and one save plaque',()=>{
 assert.equal(Object.keys(UI_SCREENS).length,48);
 assert.equal(Object.keys(STAGED_ORIGINAL_ART).length,47);
 assert.deepEqual(Object.keys(STAGED_ORIGINAL_ART).filter(id=>STAGED_ORIGINAL_ART[id].transparent).sort(),['09','10']);
 assert.equal(Object.keys(STAGED_ORIGINAL_ART).filter(id=>!STAGED_ORIGINAL_ART[id].transparent).length,45);
 assert.ok(ORIGINAL_SAVE_PLAQUE);
 assert.ok(jsx.includes('data-staged-original={original?'));
});
test('shared landscape sizing covers original pages only; art and controls use the same full viewport',()=>{
 assert.match(patch,/@media \(min-width:850px\) and \(min-height:500px\) and \(min-aspect-ratio:4\/3\)/);
 assert.match(patch,/\.fa-ui\.page\[data-staged-original="true"\]\[data-screen\]\s*\{\s*inset:0;width:100%;height:100%;transform:none/);
 assert.match(patch,/\.fa-ui\.page\[data-staged-original="true"\]\[data-screen\] \.fa-template\s*\{[^}]*background-size:100% 100%/);
 assert.doesNotMatch(patch,/\.fa-ui\.hud|\.fa-save-toast/);
 assert.match(jsx,/function isWorldScreen|const isWorldScreen/);
});
test('setup values use transparent overlays and retain interaction affordances',()=>{
 assert.match(patch,/\.fa-original-setup \.fa-setup-display\s*\{[^}]*grid-template-rows/);
 assert.match(patch,/\.fa-original-setup \.fa-setup-controls\s*\{[^}]*grid-template-rows/);
 assert.match(patch,/\.fa-original-setup \.fa-setup-controls \.fa-button\s*\{[^}]*background:transparent[^}]*color:#fff6df/);
 assert.match(patch,/\.fa-original-setup \.fa-setup-swatch span\s*\{[^}]*min-width:[^}]*aspect-ratio:1/);
 assert.match(patch,/\.fa-setup-display select:focus-visible/);
 assert.match(patch,/\.fa-painted-button:focus-visible/);
});
