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
 for(const [kind,count] of Object.entries({title:1,right:3,scene:32,hud:2,event:9,toast:1}))assert.equal(Object.values(GLASS_UI_POLICY).filter(v=>v===kind).length,count);
 assert.equal(glassUiKind('invalid'),null);assert.equal(glassUiKind('__proto__'),null);
});
test('only intended single-panel menus replace original art at runtime',()=>{
 assert.deepEqual(Object.keys(GLASS_UI_POLICY).filter(usesRightGlass).sort(),['13','40','47']);
 assert.deepEqual(Object.keys(GLASS_UI_POLICY).filter(id=>glassUiKind(id)==='scene').sort(),['02','03','04','05','06','07','08','11','12','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','32','33','34','35','37','39','46','48']);
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
 const scenes=readFileSync(new URL('../src/components/fantasybattle/sapphireSceneMenus.css',import.meta.url),'utf8');
 assert.match(src,/fa-loading-scene fa-menu-scene/);
 assert.match(scenes,/\.fa-menu-scene \.fa-scene-settings\{[^}]*background:none; border:0|\.fa-menu-scene \.fa-scene-settings\{[^}]*background:none;border:0/);
 assert.match(scenes,/\.fa-menu-scene \.fa-scene-settings \.fa-settings-detail\{background:none;border:0/);
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

test('compact workspace fallback uses document flow without touching original plates or HUDs',()=>{
 assert.match(css,/@media\(max-aspect-ratio:4\/3\),\(max-width:849px\),\(max-height:499px\)/);
 assert.match(css,/not\(\[data-staged-original="true"\]\)>\.fa-template\{display:none\}/);
 assert.match(css,/not\(\[data-staged-original="true"\]\)>\.fa-panel\{position:relative!important;inset:auto!important;width:100%!important;height:auto!important/);
 assert.match(css,/\.fa-ui\.page:is\(\[data-glass-kind="workspace"\],\[data-glass-kind="event"\],\[data-glass-kind="pause"\],\[data-glass-kind="title"\]\):not\(\[data-staged-original="true"\]\)\{display:flex;flex-direction:column/);
});
test('long live labels and compact glass controls are allowed to wrap without shrinking',()=>{
 assert.match(css,/\.fa-glass-load-panel>\*\{flex-shrink:0;min-width:0\}/);
 assert.match(css,/\.fa-glass-slot-info strong\{white-space:normal;overflow-wrap:anywhere/);
 assert.match(css,/scrollbar-gutter:stable/);
 assert.match(css,/\.fa-settings-row\{grid-template-columns:minmax\(0,1fr\);gap:7px\}/);
 assert.match(css,/@media\(pointer:coarse\)/);
});
test('live small hero portraits use the cached celestial capture while companion and palette previews remain distinct',()=>{
 assert.doesNotMatch(src,/<ArcherPortrait profile=\{profile\} small(?:=\{small\})?\/>/);
 assert.match(src,/<ArcherPortrait profile=\{profile\} small newHero\/>/);
 assert.match(src,/<ArcherPortrait profile=\{profile\} small=\{small\} newHero\/>/);
 assert.match(src,/if\(newHero&&!companion\)return <CelestialHeroPortrait/);
 assert.match(src,/<ArcherPortrait profile=\{\{\.\.\.profile,appearance:preview\}\}/);
});

test('approved Settings cannot select the obsolete boxed or original-art branch',()=>{
 const settings=src.slice(src.indexOf('function SettingsPage('),src.indexOf('const EMPTY='));
 assert.match(settings,/className="fa-loading-scene fa-menu-scene"/);
 assert.match(settings,/fa-loading-content fa-scene-settings/);
 assert.doesNotMatch(settings,/fa-settings-original-shell|fa-settings-art|original\?/);
 assert.match(src,/case '03':content=<SettingsPage settings=/);
});

import { GAME_MENU_GROUPS, isGameMenu, menuDestination, canResumeGame, menuName, activeMenuService } from '../src/components/fantasybattle/core/gameMenuNavigation.mjs';
import { PAUSE_LINKS } from '../src/components/fantasybattle/uiCatalog.mjs';
test('all pause services are visible exactly once and use scene presentation',()=>{
 const ids=GAME_MENU_GROUPS.flatMap(g=>g.ids);
 assert.deepEqual([...ids].sort(),[...PAUSE_LINKS].sort());
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ['04',...ids,'26','32','39','46']){
  assert.equal(glassUiKind(id),'scene');
  assert.ok(menuName(id));
  if(id!=='03')assert.equal(isGameMenu(id),true);
 }
 assert.equal(isGameMenu('09'),false);assert.equal(isGameMenu('10'),false);assert.equal(isGameMenu('40'),false);
});
test('navigation never stacks redundant service pages or resumes a victory/defeat',()=>{
 assert.deepEqual(menuDestination(['10','04','21','39'],'06'),['10','04','06']);
 assert.deepEqual(menuDestination(['09','04','12'],'04'),['09','04']);
 assert.deepEqual(menuDestination(['10'],'21',true),['10','21']);
 assert.deepEqual(menuDestination(['10','21'],'12',true),['10','12']);
 assert.deepEqual(menuDestination(['10','04','21'],'12',true),['10','04','12']);
 assert.deepEqual(menuDestination(['10','04'],'03'),['10','04','03']);
 assert.deepEqual(menuDestination(['14','32'],'04'),['14','32']);
 assert.deepEqual(menuDestination(['15','02'],'21'),['15','02']);
 assert.equal(canResumeGame(['14','32']),false);
 assert.equal(canResumeGame(['09','04','12']),true);
});
test('scene workspace layout is normal flow, keeps item names and real action gates',()=>{
 const menus=readFileSync(new URL('../src/components/fantasybattle/sapphireGameMenus.css',import.meta.url),'utf8');
 assert.match(src,/menuShell\?<div className=\{'fa-game-menu-scene'/);
 assert.match(src,/menuShell&&running\?\{mode:'overlay',asset:null\}/);
 assert.match(src,/fa-menu-item-name">\{i.name\}/);
 assert.match(src,/const enabled=Boolean\(profile&&!encounter&&item/);
 assert.match(src,/canResumeGame\(live.stack\)\)root\(live.stack\[0\]\)/);
 assert.match(menus,/\.fa-game-menu-body \.fa-panel\{position:relative!important;inset:auto!important/);
 assert.match(menus,/@media\(max-width:760px\)/);
 assert.match(menus,/background:none;box-shadow:none/);
});

test('world services use scene layouts without advertising restricted actions in Escape',()=>{
 for(const id of ['16','17','22','23','33','46']){
  assert.equal(glassUiKind(id),'scene');assert.equal(isGameMenu(id),true);
 }
 for(const id of ['16','17','22','23','33'])assert.ok(!GAME_MENU_GROUPS.flatMap(g=>g.ids).includes(id));
 const merchant=src.slice(src.indexOf('function MerchantShop('),src.indexOf('function BlacksmithShop('));
 assert.match(merchant,/aria-label="Merchant category"/);
 assert.match(merchant,/fa-trade-item-label/);
 assert.match(merchant,/setSelectedId\(key\);setQuantity\(1\)/);
 assert.match(merchant,/ready&&quote.ok/);
 const smith=src.slice(src.indexOf('function BlacksmithShop('),src.indexOf('function CraftingShop('));
 assert.match(smith,/fa-forge-preview/);
 assert.match(smith,/ready&&level<5&&gold>=cost&&ore>=1/);
 const craft=src.slice(src.indexOf('function CraftingShop('),src.indexOf('function SanctuaryRest('));
 assert.match(craft,/new Set\(Object.values\(RECIPES\).map\(recipe=>recipe.category\)\)/);
 assert.match(craft,/ready&&q.ok/);
 assert.match(src,/fa-service-party/);
 assert.match(src,/fa-service-enemies/);
 const menus=readFileSync(new URL('../src/components/fantasybattle/sapphireGameMenus.css',import.meta.url),'utf8');
 assert.match(menus,/\.fa-game-menu-header\{position:sticky/);
 assert.match(menus,/\.fa-forge-preview\{display:grid/);
});

test('owner-approved dock keeps the service menu mounted while swapping only the right workspace',()=>{
 assert.match(src,/key=\{dockedMenu\?'docked-game-menu':id\}/);
 assert.match(src,/dockedMenu&&<aside className="fa-game-menu-sidebar"/);
 assert.match(src,/id="fa-service-workspace" className="fa-service-workspace" aria-label=\{menuName\(id\)\} key=\{id\}/);
 assert.match(src,/running&&canResumeGame\(stack\)&&\(gameMenu\|\|id==='03'\)/);
 assert.match(src,/id==='18'\|\|id==='03'\?<div className="fa-embedded-service"/);
 assert.match(src,/activeMenuService\(id\)===target\?'page'/);
 const menus=readFileSync(new URL('../src/components/fantasybattle/sapphireGameMenus.css',import.meta.url),'utf8');
 assert.match(menus,/\.fa-game-menu-scene\.fa-docked-game-menu\{display:grid;grid-template-columns:/);
 assert.match(menus,/\.fa-docked-game-menu \.fa-service-workspace\{[^}]*background:radial-gradient/);
 assert.match(menus,/\.fa-service-workspace \.fa-embedded-service \.fa-loading-scene\{position:relative/);
});

test('child pages keep their parent menu highlighted and all primary destinations stay stable',()=>{
 for(const group of GAME_MENU_GROUPS)for(const id of group.ids)assert.equal(activeMenuService(id),id);
 for(const [child,parent] of Object.entries({'26':'11','32':'05','39':'06','46':'21','16':'21','17':'06','22':'21','23':'07','33':'05'}))assert.equal(activeMenuService(child),parent);
});

test('sumi-e menu skin reuses title artwork and mist without changing the docked layout',()=>{
 const theme=readFileSync(new URL('../src/components/fantasybattle/sapphireInkTheme.css',import.meta.url),'utf8');
 assert.match(src,/import '\.\/sapphireInkTheme\.css'/);
 assert.match(theme,/title-original\.webp/);
 assert.match(theme,/title-ink-mist\.svg/);
 assert.match(theme,/\.fa-docked-game-menu \.fa-service-workspace\{[^}]*color:var\(--fa-sumi-text\)/);
 assert.match(theme,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(theme,/grid-template-columns|backdrop-filter|filter:blur/);
 assert.match(theme,/data-delta="gain"\]\{color:#21633c/);
});
