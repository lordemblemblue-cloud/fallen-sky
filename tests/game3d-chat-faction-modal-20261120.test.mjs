import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeFactionOverview,formatFactionMetric} from
  '../src/components/game3d/axe/factions/factionOverviewModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('chat channels sit outside the blurred message surface without horizontal scrolling',()=>{
  const chat=read('src/components/game3d/social/WorldChatPanel.jsx');
  const css=read('src/components/game3d/social/Game3DChatChannels.css');
  assert.ok(chat.indexOf('game3d-chat-surface')<chat.indexOf('game3d-chat-channel-row'));
  assert.match(css,/\.game3d-chat-channel-row\{[^}]*flex-wrap:wrap;overflow-x:hidden/s);
  assert.match(css,/\.game3d-chat-messages\{scrollbar-width:none/);
  assert.match(css,/\.game3d-world-chat\.is-typing \.game3d-chat-surface/);
  assert.match(css,/\.jade-hud \.jade-quest-tracker/);
  assert.match(css,/max-height:min\(310px,max\(92px,calc\(100dvh/);
});

test('Enter reveals chat before focus; incoming chat temporarily reappears',()=>{
  const chat=read('src/components/game3d/social/WorldChatPanel.jsx');
  const settings=read('src/components/game3d/hud/game3dCommunityHUDSettings.mjs');
  const view=read('src/pages/GameView.jsx');
  assert.match(chat,/nextChatEnterState\(/);
  assert.match(chat,/setTyping\(next\.typing\)/);
  assert.match(chat,/isIncomingChatMessage\(message,userId\)/);
  assert.match(chat,/setTimeout\(\(\) => setExpanded\(false\), 9000\)/);
  assert.match(settings,/chatAlwaysVisible: false/);
  assert.match(settings,/input\.chatAlwaysVisible/);
  assert.match(view,/alwaysVisible=\{communityHUD\.chatAlwaysVisible\}/);
});

test('faction Escape tile opens a separate centered dialog and closes launcher',()=>{
  const pause=read('src/components/game3d/PauseMenu.jsx');
  const view=read('src/pages/GameView.jsx');
  const modal=read('src/components/game3d/FactionCommandModal.jsx');
  const css=read('src/components/game3d/FactionCommandModal.css');
  assert.match(pause,/if\(tile\.id==='faction'\)\{onOpenFaction\?\.\(\);return;\}/);
  assert.doesNotMatch(pause,/<FactionOverview\/>/);
  assert.match(view,/onOpenFaction=\{\(\)=>\{/);
  assert.match(view,/setPauseMenuOpen\(false\);[\s\S]*setFactionOpen\(true\);/);
  assert.match(view,/factionOpen && <FactionCommandModal/);
  assert.match(modal,/role="dialog" aria-modal="true"/);
  assert.match(modal,/event\.key==='Escape'/);
  assert.match(css,/place-items:center/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test('verified faction treasury and max-level metrics are bounded; missing counts stay unknown',()=>{
  const ids=['AXE_Faction_1','AXE_Faction_2','AXE_Faction_3'];
  const blank=normalizeFactionOverview(null,ids);
  assert.equal(formatFactionMetric(blank[0].treasuryGold),'—');
  assert.equal(formatFactionMetric(blank[0].maxLevelPlayers),'—');
  const rows=normalizeFactionOverview({factions:[
    {id:ids[0],treasuryGold:81234,maxLevelPlayers:29},
    {id:ids[1],treasuryGold:-42,maxLevelPlayers:'9999'},
  ]},ids);
  assert.equal(rows[0].treasuryGold,81234);
  assert.equal(rows[0].maxLevelPlayers,29);
  assert.equal(rows[1].treasuryGold,null);
  assert.equal(rows[1].maxLevelPlayers,null);
});
