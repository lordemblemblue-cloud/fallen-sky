import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const menu=read('src/components/game3d/PauseMenu.jsx');
const css=read('src/components/game3d/PauseMenuGold.css');
const chat=read('src/components/game3d/social/WorldChatPanel.jsx');
const world=read('src/components/game3d/GameWorld3D.jsx');
const view=read('src/pages/GameView.jsx');

test('Escape shows seven service/faction tiles and opens faction in its own dialog',()=>{
 assert.match(menu,/\{id:'faction',label:'Faction'/);
 assert.match(menu,/QUICK_SERVICE_TILES\.map/);
 assert.match(menu,/axe3d-pause__launcher-page-grid/);
 assert.match(menu,/onOpenService\?\.\(group\.id,serviceId\)/);
 assert.match(menu,/onOpenFaction\?\.\(\)/);\n assert.doesNotMatch(menu,/<FactionOverview\/>/);
 assert.doesNotMatch(menu,/<details className="axe3d-pause__launcher-subpage-group"/);
 assert.doesNotMatch(menu,/className="axe3d-pause__settings-back"/);
 assert.doesNotMatch(menu,/ArrowLeft/);
 assert.doesNotMatch(menu,/>WORLD MENU</);
});
test('Settings offers editable real keybinds and no redundant Main Menu section',()=>{
 assert.match(menu,/data-testid="game3d-editable-keybinds"/);
 assert.match(menu,/rebindGame3DAction\(/);
 assert.match(menu,/saveGame3DKeybinds\(/);
 assert.match(menu,/!\['overview','session','services','scoreboard'\]\.includes\(section\.id\)/);
});
test('gold liquid glass and readable green scrollbars apply on desktop/mobile',()=>{
 assert.match(css,/backdrop-filter:blur\(22px\) saturate\(136%\)/);
 assert.match(css,/scrollbar-color:#38c988/);
 assert.match(css,/axe3d-pause__launcher-page-grid button/);
 assert.match(css,/@media\(max-width:480px\)/);
});
test('chat keeps server-backed World, Party and Clan, plus separate real combat feed',()=>{
 assert.match(chat,/>Regular<\/button>/);
 assert.match(chat,/>World<\/button>/);
 assert.match(chat,/>Clan<\/button>/);
 assert.match(chat,/>Faction Call<\/button>/);
 assert.match(chat,/>Combat<\/button>/);
 assert.match(chat,/onOpenClan\?\.\(\)/);
 assert.match(chat,/subscribeGame3DCombatLog/);
 assert.match(world,/recordGame3DCombatEvent\('dealt'/);
 assert.match(world,/recordGame3DCombatEvent\('taken'/);
 assert.match(world,/recordGame3DCombatEvent\('miss'/);
 assert.match(view,/<FactionAnnouncementTicker \/>/);
});
test('faction calls remain gated behind future server rank authorization',()=>{
 const source=read('src/components/game3d/axe/factions/FactionAnnouncementTicker.jsx');
 assert.match(source,/VITE_GAME3D_FACTION_ANNOUNCEMENTS/);
 assert.match(source,/callGameServer\('factionSystem','latest_announcement'/);
 assert.doesNotMatch(source,/addEventListener\('game3dFactionAnnouncement'/);
});
