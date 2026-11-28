import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UI_SCREENS} from '../src/components/fantasybattle/uiCatalog.mjs';
import {GLASS_UI_POLICY,glassUiKind,usesRightGlass} from '../src/components/fantasybattle/core/glassUiPolicy.mjs';
const src=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/components/fantasybattle/sapphireGlassSystem.css',import.meta.url),'utf8');
const screen=(id,next)=>src.slice(src.indexOf("    case '"+id+"':content="),src.indexOf("    case '"+next+"':content="));
test('every registered UI has one intentional presentation family',()=>{
 assert.equal(Object.keys(GLASS_UI_POLICY).length,48);
 assert.deepEqual(Object.keys(GLASS_UI_POLICY).sort(),Object.keys(UI_SCREENS).sort());
 for(const [kind,count] of Object.entries({title:4,right:7,workspace:24,pause:1,hud:2,event:9,toast:1}))assert.equal(Object.values(GLASS_UI_POLICY).filter(v=>v===kind).length,count);
 assert.equal(glassUiKind('invalid'),null);assert.equal(glassUiKind('__proto__'),null);
});
test('only intended single-panel menus replace original art at runtime',()=>{
 assert.deepEqual(Object.keys(GLASS_UI_POLICY).filter(usesRightGlass).sort(),['02','03','13','18','35','40','47']);
 assert.equal(glassUiKind('09'),'hud');assert.equal(glassUiKind('10'),'hud');
 assert.match(src,/useStagedOriginal\(rightGlass\|\|glassKind==='toast'\?null:id\)/);
 assert.match(src,/data-glass-kind=\{glassKind\}/);
 assert.match(src,/!rightGlass&&glassKind!=='toast'&&id!=='10'/);
 assert.match(css,/not\(\[data-staged-original="true"\]\) \.fa-panel/);
});
test('save game preserves actual slot selection, confirmation and export authority',()=>{
 const save=screen('18','13');
 for(const marker of ['SLOT_IDS.map','record?.status===\'valid\'','onClick={()=>setSelected(s)}','disabled={!profile||!selected||Boolean(encounter)}','onClick={manualSave}','downloadBackup(profile,true)','downloadBackup(profile)','newHero','aria-label="Save game navigation"'])assert.ok(save.includes(marker),marker);
 assert.match(src,/if\(occupied\)requestConfirm\('Overwrite slot '/);
});
test('confirmation uses existing ticket with explicit cancel and no auto-confirm',()=>{
 const confirm=screen('40','41');
 assert.match(confirm,/pending\?\.message/);assert.match(confirm,/disabled=\{!pending\}/);
 assert.match(confirm,/executeConfirm\(pending\)/);assert.match(confirm,/onClick=\{dismissConfirm\}/);
 assert.doesNotMatch(confirm,/setTimeout|autosave\(/);
});
test('settings categories and controls stay in one responsive glass surface',()=>{
 assert.match(src,/fa-glass-settings-heading/);
 assert.match(src,/aria-controls="fa-settings-detail"/);
 assert.match(css,/\.fa-ui\[data-glass-kind="right"\] \.fa-settings-fallback\{[^}]*overflow:auto/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
test('dialogue retains live service gating and choices',()=>{
 const dialogue=src.slice(src.indexOf('function NPCDialogue('),src.indexOf('// Original offer illustration'));
 for(const marker of ['fa-glass-conversation','profile&&serviceAvailable','disabled={!available||!enabled}','aria-live="polite"','group===\'escort\'?escortChoices:choices'])assert.ok(dialogue.includes(marker),marker);
});
test('glass system retains small HUDs and real status messages',()=>{
 assert.match(src,/case '10':content=<OriginalExplorationHud/);
 assert.match(src,/case '41':content=<aside className="fa-glass-status-card" role="status">/);
 assert.match(css,/\.fa-ui\[data-glass-kind="toast"\]\{pointer-events:none/);
 assert.match(css,/\.fa-root \.fa-notice,\.fa-root \.fa-save-plaque:not\(\.is-ready\)/);
});
test('glass supports narrow screens, focus and reduced motion',()=>{
 for(const marker of ['@media(max-width:700px)','@media(max-height:540px)','@media(max-width:380px)','@media(prefers-reduced-motion:reduce)',':focus-visible'])assert.ok(css.includes(marker),marker);
});
