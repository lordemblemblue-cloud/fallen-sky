import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_SCREENS} from '../src/components/fantasybattle/uiCatalog.mjs';
import {makeSapphireTemplate,artFor,artUrl,templateUrl} from '../src/components/fantasybattle/sapphireArt.mjs';
const assets=new Set(['title-original','sanctuary','celestial','ruins','moonlit','wilds']);
test('all 48 artwork frames are text free',()=>{assert.equal(Object.keys(UI_SCREENS).length,48);for(const id of Object.keys(UI_SCREENS)){const s=makeSapphireTemplate(id);assert.match(s,/^<svg/);assert.match(s,/<\/svg>$/);assert.doesNotMatch(s,/<text[ >]|<foreignObject|<script/i);}});
test('screen artwork points only to registered assets',()=>{for(const id of Object.keys(UI_SCREENS))for(const running of [true,false]){const a=artFor(id,running);if(a.asset){assert.ok(assets.has(a.asset));assert.match(artUrl(a.asset),/\.webp$/);}}});
test('gameplay HUD and confirmation overlays never cover the world with an opaque picture',()=>{for(const id of ['09','10','41'])assert.equal(artFor(id,true).mode,'transparent');for(const id of ['04','13','39','40','47'])assert.equal(artFor(id,true).mode,'overlay');});

import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const verifiedAssets=[["backgrounds/celestial.webp","6a0a9b62c24fafb9772e3689b20bf52e348fd07b"],["backgrounds/moonlit.webp","5a8900f58a3f5af0c1812c8afdfdeef8c5cf7772"],["backgrounds/ruins.webp","c62d8ed343ee91d6df911a46614955410cdc749b"],["backgrounds/sanctuary.webp","91d9fa3560f935a66c7990b874042dccfde0ccd0"],["backgrounds/title-original.webp","2b63ab980bd29150af8d8b6a06026a268391a74b"],["backgrounds/wilds.webp","01f1f7f4818b99f976bc1d152df02b9d1b94759c"],["illustrations/item-acquired.webp","da87e8b08b703cbc47de188d253d60d12ac600f5"],["illustrations/quest-complete.webp","b0dfd13bd2f68cc76785c6e2b0351ecae5445d4b"],["illustrations/quest-offer.webp","036ba9c7f654fde05ffb4bacec820f802e073d90"],["illustrations/skill-unlocked.webp","d1e4d4e07efd1a4d63d1ffb328acfddb1fd2854a"]];
test('all ten shipped painted assets are valid WebP files and match approved blob hashes',()=>{for(const [name,expected] of verifiedAssets){const bytes=readFileSync(new URL('../public/fantasybattle/sapphire/'+name,import.meta.url));assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');const hash=createHash('sha1').update('blob '+bytes.length).update(Buffer.from([0])).update(bytes).digest('hex');assert.equal(hash,expected,name);}});

test('refined static frames are cached and all panels fit the normalized canvas',()=>{for(const [id,s] of Object.entries(UI_SCREENS)){const frame=makeSapphireTemplate(id),url=templateUrl(id);assert.equal(url,templateUrl(id));assert.equal(decodeURIComponent(url.split(',')[1]),frame);assert.match(frame,/id="edge"/);assert.match(frame,/id="sheen"/);assert.doesNotMatch(frame,/<filter|<animate|<text[ >]/i);for(const [x,y,w,h] of s.layout){assert.ok(x>=0&&y>=0&&w>0&&h>0);assert.ok(x+w<=1.000001&&y+h<=1.000001);}}assert.equal(templateUrl('invalid'),'');assert.ok(UI_SCREENS['09'].layout[3][3]>.3);});


import {STAGED_ORIGINAL_ART,stagedOriginalFor,ORIGINAL_SAVE_PLAQUE} from '../src/components/fantasybattle/sapphireArt.mjs';
test('staged original artwork uses only explicit owner-media WebP URLs',()=>{
 const allowed=/^https:\/\/media\.base44\.com\/images\/public\/6af625cd654fa5b8954442ce\/[a-zA-Z0-9_-]+\.webp$/;
 assert.deepEqual(Object.keys(STAGED_ORIGINAL_ART).sort(),['01','02','03','04','05','06','12','18','19','20','27','32','35','40','47']);
 for(const [id,entry] of Object.entries(STAGED_ORIGINAL_ART)){
  assert.ok(Object.hasOwn(UI_SCREENS,id));assert.equal(stagedOriginalFor(id),entry);
  assert.equal(entry.mode,'full');assert.match(entry.url,allowed);assert.ok(entry.source);
 }
 assert.match(ORIGINAL_SAVE_PLAQUE,allowed);
 for(const id of ['09','10','invalid','__proto__','constructor'])assert.equal(stagedOriginalFor(id),null);
});

 test('original menu plates use wide-only staging and never register sample save data',()=>{assert.equal(stagedOriginalFor('01').wideOnly,true);assert.equal(stagedOriginalFor('02').wideOnly,true);assert.equal(stagedOriginalFor('35').wideOnly,undefined);});

test('settings and save art preserve responsive fallback',()=>{for(const id of ['03','18']){assert.equal(stagedOriginalFor(id).wideOnly,true);assert.match(templateUrl(id),/^data:image\/svg\+xml,/);}});

test('pause and character plates use wide-only staging',()=>{for(const id of ['04','19','20','47']){assert.equal(stagedOriginalFor(id).wideOnly,true);assert.match(templateUrl(id),/^data:image\/svg\+xml,/);}});

test('character statistics art is optional and uses live profile and equipment data',()=>{
 assert.equal(stagedOriginalFor('05').wideOnly,true);
 assert.match(templateUrl('05'),/^data:image\/svg\+xml,/);
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf("case '05':"),page.indexOf("case '06':"));
 for(const marker of ['fa-original-character','profile.hp','stats.maxHp','stats.atk','stats.def','stats.spd','pointsFor(profile)','gearFor(profile','availableActions(level)','statPanel'])assert.ok(section.includes(marker),marker);
});

test('equipment plate uses original image with actual owned inventory and existing equip transactions',()=>{
 assert.equal(stagedOriginalFor('06').wideOnly,true);
 assert.ok(templateUrl('06').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf("case '06':"),page.indexOf("case '07':"));
 for(const marker of ['fa-original-equipment','inv[k]>0','gearCount(profile,itemId)','memberStats(profile,wearer)','gearCompare','equipGear(p,wearer','equipItem(p,itemId)','Boolean(profile&&selectedOwned','!encounter'])assert.ok(section.includes(marker),marker);
});

test('wardrobe uses original artwork, draft-only palette selection, and validated application on both layouts',()=>{
 assert.equal(stagedOriginalFor('27').wideOnly,true);
 assert.ok(templateUrl('27').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function Wardrobe('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-wardrobe','Object.entries(APPEARANCES)','setPreview(key)','appearance:preview','chooseAppearance(preview)','setPreview(saved)','Boolean(encounter)','disabled={locked||!dirty}','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '27':content=<Wardrobe/);
});

test('skillbook original plate uses real battle actions and automatic progression',()=>{
 assert.equal(stagedOriginalFor('12').wideOnly,true);
 assert.ok(templateUrl('12').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function Skillbook('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-skillbook','ACTION_ORDER.map','availableActions(level)','ACTIONS[selectedId]','learnedAt[selectedId]','action.focusCost','action.focusGain','setSelectedId(id)','<Panel rect={layout[0]}','No manual skill upgrades'])assert.ok(section.includes(marker),marker);
 assert.match(page,/case '12':content=<Skillbook/);
});

test('original attribute screen previews a bounded draft before confirming via existing allocation logic',()=>{
 assert.equal(stagedOriginalFor('32').wideOnly,true);
 assert.ok(templateUrl('32').startsWith('data:image/svg+xml,'));
 const page=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
 const section=page.slice(page.indexOf('function Attributes('),page.indexOf('function SaveToast('));
 for(const marker of ['fa-original-attributes','pointsFor(profile)','draft.slice(0,budget)','allocate(p,k)','old.length<budget','setDraft([])','onConfirm(profile,draft)','submitted.current','<Panel rect={layout[0]}'])assert.ok(section.includes(marker),marker);
 const handler=page.slice(page.indexOf("case '32':"),page.indexOf("case '33':"));
 for(const marker of ['live!==base','draft.length>pointsFor(live)','STAT_KEYS.includes(k)','autosave(next)','finishLevel()'])assert.ok(handler.includes(marker),marker);
});
