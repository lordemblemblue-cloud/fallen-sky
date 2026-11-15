import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const appearance=read('src/components/game3d/axe/services/AXEAppearanceWorkspace.jsx');
const appearanceCss=read('src/components/game3d/axe/services/AXEAppearanceWorkspace.css');
const questCss=read('src/components/game3d/hud/JadeQuestTracker.css');
const communityCss=read('src/components/game3d/hud/Game3DCommunityHUD.css');

test('Appearance has one Vanity page containing existing Costumes and no second Wings tab',()=>{
  assert.match(appearance,/const TAB_NAMES = \['Character', 'Equipment', 'Vanity', 'Aura'\]/);
  assert.doesNotMatch(appearance,/const WingsSubTab|tab === 'Wings'/);
  assert.match(appearance,/serviceId === 'costume' \? 'Vanity'/);
  assert.match(appearance,/setFilter\(serviceId === 'costume' \? 'Costumes' : 'All'\)/);
  assert.match(appearance,/if \(slot === 'customs'\) \{ showTab\('Vanity'\);setFilter\('Costumes'\);return; \}/);
  assert.match(appearance,/ownedVanity\.map/);
  assert.match(appearance,/ownedCostumes\.map/);
  assert.match(appearance,/['"]Costumes['"]\.map|\['All','Vanity','Costumes'\]/);
});

test('Inventory header has a working accessible filter select sharing the existing state',()=>{
  assert.match(appearance,/headingAction=\{<label className="axe-app-inventory-filter-select">/);
  assert.match(appearance,/<select aria-label="Filter inventory" value=\{filter\}/);
  assert.match(appearance,/onChange=\{event => setFilter\(event\.target\.value\)\}/);
  assert.match(appearance,/<option value="All">All<\/option>/);
  assert.match(appearance,/<option value="Vanity">Vanity<\/option>/);
  assert.match(appearance,/<option value="Costumes">Costumes<\/option>/);
  assert.match(appearanceCss,/\.axe-app-inventory-filter-select select/);
  assert.match(appearanceCss,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test('Quest tracker, chat and existing HUD launchers share screen-safe anchors',()=>{
  assert.match(questCss,/--axe-quest-top:calc\(/);
  assert.match(questCss,/\.game3d-view \.jade-quest-tracker \{\s*top:var\(--axe-quest-top\)/);
  assert.match(communityCss,/\.game3d-view \.jade-xp,\s*\.game3d-view \.game3d-world-chat \{ bottom:var\(--axe-hud-xp-bottom\); \}/);
  for(const cls of ['axe-echo-launch','axe-chronicle-vault-launch','axe-minigames-launch']) {
    assert.match(communityCss,new RegExp('\\.'+cls+'\\b'));
  }
  assert.match(communityCss,/top:calc\(var\(--axe-quest-top\) - var\(--axe-hud-launcher-size\) - 8px\)/);
});
