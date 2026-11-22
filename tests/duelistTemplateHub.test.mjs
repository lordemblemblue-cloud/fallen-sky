import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEMPLATE_MODES, MODE_TABS, templateLaunch, templateMode } from '../src/components/duelist/menu/templateCatalog.mjs';
import { LEVEL_CAP, levelFromXp, xpForLevel, masteryAt, masteryReward } from '../src/components/duelist/core/progression.mjs';
import { moveFor } from '../src/components/duelist/core/ranks.mjs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const menu = source('src/components/duelist/menu/DuelistTemplateHub.jsx');
const css = source('src/components/duelist/menu/duelistTemplateUI.css');

test('four categories share a single text-free visual template and real detail panel', () => {
  assert.deepEqual(MODE_TABS.map(tab => tab.id), ['normal','ranked','practice','custom']);
  for (const tab of MODE_TABS) assert.ok(TEMPLATE_MODES[tab.id]?.length >= 6);
  for (const file of ['public/ui/duelist/template-mode-frame.svg','public/ui/duelist/template-character-frame.svg']) {
    const svg = source(file);
    assert.match(svg, /<svg /);
    assert.doesNotMatch(svg, /<text\b|<image\b|font-family|CHARACTER|RANKED|DUEL/);
  }
  assert.match(css, /template-mode-frame\.svg/);
  assert.match(css, /template-character-frame\.svg/);
  assert.match(menu, /const \[category, setCategory\]/);
  assert.match(menu, /onSelect=\{setMode\}/);
  assert.match(menu, /role="group" aria-label=\{tab.title \+ ' game modes'\}/);
});

test('mode routes launch real supported modes only, never imaginary ranked or custom queues', () => {
  assert.deepEqual(templateLaunch('normal','duel',false,false), {mode:'duel', online:0});
  assert.equal(templateLaunch('normal','duel',true,false), null);
  assert.deepEqual(templateLaunch('normal','duel',true,true), {mode:'duel', online:1});
  assert.deepEqual(templateLaunch('practice','team-drills',false,false), {mode:'tdm', online:0});
  assert.deepEqual(templateLaunch('practice','free-practice',false,false), {mode:'practice', online:0});
  assert.equal(templateLaunch('practice','target-range'), null);
  assert.equal(templateLaunch('ranked','duel',true,true), null);
  assert.equal(templateLaunch('custom','create-lobby'), null);
  assert.deepEqual(templateLaunch('normal','transport'), {mode:'escort', online:0});
  assert.equal(templateLaunch('normal','unknown'), null);
  assert.equal(templateMode('ranked','duel').route, null);
});

test('bottom navigation is actionable and Settings is last, without Pass or Plus', () => {
  const ids = menu.split('const NAV = [')[1].split('];')[0];
  for (const id of ['home', 'play', 'character', 'story', 'settings'])
    assert.match(ids, new RegExp("id: '" + id + "'"));
  assert.doesNotMatch(ids, /id: 'store'/, 'the battle shop belongs only to live matches');
  assert.ok(ids.lastIndexOf("id: 'settings'") > ids.indexOf("id: 'story'"));
  assert.doesNotMatch(ids, /battlePass|plus/i);
  assert.match(menu, /navigatePanel\(id\)/);
  assert.match(menu, /to: '\/duelist-next\/play'/);
  assert.match(menu, /<SettingsReferenceMenu prefs=\{prefs\} onPrefs=\{onPrefs\}/);
  assert.match(source('src/routes/duelist.jsx'), /component: DuelistTemplateHub/);
  assert.match(source('src/routes/duelist-next.index.jsx'), /component: DuelistTemplateHub/);
  assert.match(source('src/routes/duelist-next.$page.jsx'), /<DuelistTemplateHub initialPanel=/);
  assert.match(source('src/components/duelist/menu/MenuPages.jsx'), /duelist-menu-bottom-nav/);
});

test('selected fighter renders an existing live model, not stock character pictures', () => {
  assert.match(menu, /Object.entries\(BODIES\)/);
  assert.match(menu, /<DuelistCharacterMenu prefs=\{prefs\}/);
  assert.match(source('src/components/duelist/menu/DuelistCharacterMenu.jsx'), /<DuelistCharacterPreview fighter=\{prefs.fighter\}/);
  assert.match(menu, /classProgressOf\(prefs\)/);
  assert.match(menu, /masteryAt\(mastery.level\)/);
  assert.match(menu, /role="progressbar"/);
  assert.match(menu, /classId: e.target.value/);
});

test('permanent mastery gives one ability point between every fifth-level ultimate increment', () => {
  assert.equal(LEVEL_CAP,25);
  assert.equal(masteryReward(1).kind, 'starting');
  assert.deepEqual(masteryReward(2), {level:2,kind:'ability',abilityIndex:0,bonus:1});
  assert.deepEqual(masteryReward(4), {level:4,kind:'ability',abilityIndex:2,bonus:1});
  assert.deepEqual(masteryReward(5), {level:5,kind:'ultimate',bonus:1});
  assert.deepEqual(masteryReward(6), {level:6,kind:'ability',abilityIndex:3,bonus:1});
  for(const lv of [5,10,15,20,25]) assert.equal(masteryReward(lv).kind,'ultimate');
  assert.equal(masteryAt(1).ultimateRank,1);
  assert.equal(masteryAt(25).ultimateRank,6);
  assert.deepEqual(masteryAt(25).abilityRanks,[6,6,6,5]);
  assert.equal(masteryAt(999).ultimateRank,6);
  assert.equal(levelFromXp(xpForLevel(25)).capped,true);
});

test('shared combat rules apply server-owned mastery to class abilities and ultimates', () => {
  const f = (classId,level) => ({classId,level,matchBoost:0});
  assert.ok(moveFor(f('duelist',2),'pull').range > moveFor(f('duelist',1),'pull').range);
  assert.ok(moveFor(f('warrior',5),'rage').effectSeconds > moveFor(f('warrior',1),'rage').effectSeconds);
  assert.ok(moveFor(f('duelist',5),'execution').range > moveFor(f('duelist',1),'execution').range);
  const world = source('src/components/duelist/sim/world.mjs');
  assert.match(world, /evaluateSpecial\(\{ classId: fighter.classId, meter: fighter.meter, actor, now, matchBoost, level: fighter.level/);
  assert.match(source('src/components/duelist/sim/match.mjs'), /levelFromXp\(s.progress\?\.\[classId\]\)/);
});

test('the match shop only opens during gameplay, and story supplies are in the campaign', () => {
  assert.doesNotMatch(menu, /function StoreBrowser|const SHOP_FILTERS|<StoreBrowser/);
  assert.doesNotMatch(source('src/routes/duelist-next.$page.jsx'), /'store'/);
  const game = source('src/components/duelist/client/DuelistGame.jsx');
  assert.match(game, /match && <button[^>]+className="duelist-shop-toggle"/);
  assert.match(game, /shopOpen && match && match.phase !== 'over' && <ShopPanel/);
  assert.match(game, /shopOpen && quest && quest.phase === 'live' && <StorySupplyPanel/);
  const story = source('src/components/duelist/menu/DuelistStoryMenu.jsx');
  assert.match(story, /id: 'supplies', title: 'Story Shop'/);
  assert.match(story, /QUICK JOIN OPEN CREW/);
  assert.match(story, /HOST OPEN CREW/);
  assert.match(story, /JOIN PRIVATE CREW/);
});
