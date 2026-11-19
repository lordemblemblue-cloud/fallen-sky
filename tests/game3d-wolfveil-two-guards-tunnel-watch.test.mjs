import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CLONE_TOWN_GUARDS} from '../src/components/game3d/wolfveil/WolfveilTownLivingQuarterLayout.mjs';
import {
  planWolfveilCaveWatch,WOLFVEIL_WATCH_QUEST_NPC_ID,WOLFVEIL_WATCH_QUEST_ID,
} from '../src/components/game3d/wolfveil/WolfveilCaveWatchPlan.mjs';

const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('only two guards patrol the open capital avenue',()=>{
  assert.equal(CLONE_TOWN_GUARDS.length,2);
  assert.equal(new Set(CLONE_TOWN_GUARDS.map(g=>g.id)).size,2);
  for(const g of CLONE_TOWN_GUARDS){
    assert.equal(g.role,'guard');assert.equal(g.route.length,2);
    assert.ok(g.speed>0 && g.speed<=1.4);
    assert.ok(Math.abs(g.route[0][0])>=8,'stay beside fountain/tree');
  }
});

test('patrols travel opposite directions initially and reverse at their endpoints',()=>{
  const [first,second]=CLONE_TOWN_GUARDS;
  assert.ok(first.route[1][1]>first.route[0][1],'first guard begins going north');
  assert.ok(second.route[1][1]<second.route[0][1],'second begins going south');
  assert.equal(first.route[0][0],first.route[1][0]);
  assert.equal(second.route[0][0],second.route[1][0]);
});

test('one watch captain stands outside at tunnel top and one sentry inside',()=>{
  const guards=planWolfveilCaveWatch();
  assert.equal(guards.length,2);
  assert.equal(guards.filter(g=>g.inside).length,1);
  assert.equal(guards.filter(g=>!g.inside).length,1);
  for(const g of guards){
    assert.ok([g.x,g.y,g.z,g.facing].every(Number.isFinite));
    assert.ok(['blue','warden'].includes(g.variant));
  }
});

test('only the outside captain may offer a side quest',()=>{
  const [captain,sentry]=planWolfveilCaveWatch();
  assert.equal(captain.questNpcId,WOLFVEIL_WATCH_QUEST_NPC_ID);
  assert.equal(sentry.questNpcId,null);
  const quests=source('src/components/game3d/questData.jsx');
  assert.ok(quests.includes("id: '"+WOLFVEIL_WATCH_QUEST_ID+"'"));
  assert.ok(quests.includes("npcId: '"+WOLFVEIL_WATCH_QUEST_NPC_ID+"'"));
  assert.match(quests,/title: 'Watch the Lower Passage'/);
});

test('the game uses E dialogue/quest flow rather than auto-granting items',()=>{
  const game=source('src/components/game3d/GameWorld3D.jsx');
  const watch=source('src/components/game3d/wolfveil/WolfveilCaveWatch.mjs');
  assert.match(game,/caveWatch\?\.nearestResident\(model\.position\)/);
  assert.match(game,/caveWatch\?\.interact\(model\.position\)/);
  assert.match(watch,/canGrantItems:false/);
  assert.match(game,/getAXENPCQuestHandoff/);
});

test('uploaded models have low-poly urls and an explicit no-rig procedural gait',()=>{
  const visual=source('src/components/game3d/wolfveil/WolfveilGuardVisuals.mjs');
  assert.match(visual,/falling_sky_guard_blue_optimized\.glb/);
  assert.match(visual,/falling_sky_guard_warden_game\.glb/);
  assert.match(visual,/uGuardStride/);
  assert.match(visual,/\.clone\(true\)/);
  assert.match(visual,/\bdispose\(\)/);
});
