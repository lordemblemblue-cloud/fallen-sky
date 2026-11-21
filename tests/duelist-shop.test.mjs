import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SHOP_ITEMS, SHOP_RULES, shopItem, purchaseRule, itemBonuses, tierPrice, equipItems } from '../src/components/duelist/core/shop.mjs';
import { createMatch, matchView, stepMatch, purchaseMatchItem } from '../src/components/duelist/sim/match.mjs';
import { createFighter } from '../src/components/duelist/core/fighter.mjs';
import { bodyOf, respawnFighter } from '../src/components/duelist/sim/world.mjs';
import { encodeOwn, applyOwn, PROTOCOL } from '../src/components/duelist/net/protocol.mjs';

const DT = 1 / 60;
const frame = (match, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepMatch(match, DT, {});
};

test('fifty distinct original 2D item pictures are present; no GLB mesh dependency', () => {
  assert.equal(SHOP_ITEMS.length, 50);
  assert.equal(new Set(SHOP_ITEMS.map((it) => it.id)).size, 50);
  assert.deepEqual(Object.fromEntries(['power','defense','ability','health','tenacity','hybrid','support','counter','relic']
    .map((cat) => [cat, SHOP_ITEMS.filter((i) => i.category === cat).length])),
    { power: 5, defense: 5, ability: 5, health: 5, tenacity: 5, hybrid: 10, support: 5, counter: 5, relic: 5 });
  for (const it of SHOP_ITEMS) {
    assert.equal(existsSync(new URL('../public/duelist/items/' + it.id + '.svg', import.meta.url)), true, it.name);
    assert.ok(it.passive?.text?.length > 12);
  }
});

test('each item upgrades in three additive-priced steps and gains a passive only at final tier', () => {
  const id = 'windblossom'; const item = shopItem(id);
  assert.equal(tierPrice(item, 3), item.cost);
  let gold = 1000; let items = []; let spent = 0;
  for (const tier of [1,2,3]) {
    const result = purchaseRule({ gold, items, id });
    assert.equal(result.ok, true);
    assert.equal(result.tier, tier);
    gold -= result.cost; spent += result.cost; items = result.items;
    assert.equal(items[0].tier, tier);
    assert.equal(itemBonuses(items).passive.onAllyHealHaste, tier === 3 ? 0.12 : 0);
  }
  assert.equal(spent, item.cost);
  assert.deepEqual(purchaseRule({ gold, items, id }), { ok: false, reason: 'fully-upgraded' });
  assert.equal(purchaseRule({ gold: 0, items: [], id }).reason, 'not-enough-gold');
  assert.equal(purchaseRule({ gold: 999, items: [], id, allowed: false }).reason, 'shop-at-spawn');
  assert.equal(purchaseRule({ gold: 999, items: [], id: '__fake' }).reason, 'unknown-item');
});

test('an authenticated match seat alone can buy, and six slots cap the real equipment', () => {
  const m = createMatch({ mode: 'practice', players:[{id:'player',classId:'healer'}], seats:1 });
  assert.equal(matchView(m,'player').me.gold,SHOP_RULES.startingGold);
  const first = purchaseMatchItem(m, 'player','heartseed');
  assert.equal(first.ok,true);
  assert.equal(first.tier,1);
  assert.equal(matchView(m,'player').me.items[0].id,'heartseed');
  assert.ok(m.world.fighters.get('player').vitals.max.hp > 100,'equipping health immediately improves max HP');
  assert.equal(purchaseMatchItem(m,'__stranger','heartseed').reason,'not-available');
  frame(m,3.2);
  assert.equal(m.phase,'live');
  const body = bodyOf(m.world,'player');
  body.x += 7;
  assert.equal(purchaseMatchItem(m,'player','warbanner').reason,'shop-at-spawn');
  body.x -= 7;
  assert.equal(purchaseMatchItem(m,'player','warbanner').ok,true);
  assert.equal(matchView(m,'player').me.items.length,2);
  frame(m,20);
  assert.ok(matchView(m,'player').me.gold>0, 'passive gold earned while playing');
  respawnFighter(m.world,'player');
  assert.equal(m.world.fighters.get('player').items[0].tier,1,'items survive a respawn');
  const fresh = createMatch({mode:'practice',players:[{id:'player',classId:'healer'}],seats:1});
  assert.deepEqual(matchView(fresh,'player').me.items,[],'a new match clears items');
  assert.equal(matchView(fresh,'player').me.gold,300,'new match gold resets');
});

test('item bonuses are implemented in authoritative fighter state and replicated in snapshots', () => {
  const f = createFighter({id:'healer',classId:'healer',items:[{id:'windblossom',tier:3},{id:'heartseed',tier:1}]});
  assert.equal(f.shopStats.passive.onAllyHealHaste,0.12);
  assert.ok(f.shopStats.health>0);
  assert.equal(f.items.length,2);
  equipItems(f,[{id:'windblossom',tier:1},{id:'heartseed',tier:1}]);
  assert.equal(f.shopStats.passive.onAllyHealHaste,0);
  assert.equal(PROTOCOL,10);
  const own = encodeOwn(f,{x:0,y:0,z:0,yaw:0,vy:0,kx:0,kz:0,motion:null},0);
  const copy = createFighter({id:'copy',classId:'healer'});
  applyOwn(copy,{x:0,y:0,z:0,yaw:0,vy:0,kx:0,kz:0},JSON.parse(JSON.stringify(own)));
  assert.deepEqual(copy.items,f.items);
  assert.equal(copy.shopStats.health,f.shopStats.health);
});

test('six distinct completed items contribute capped stats; all tiers refuse duplicate copies', () => {
  const ids = SHOP_ITEMS.slice(0,6).map((x)=>x.id);
  const loadout = ids.map((id)=>({id,tier:3}));
  assert.equal(purchaseRule({ gold:99999,items:loadout,id:SHOP_ITEMS[10].id }).reason,'inventory-full');
  assert.equal(purchaseRule({ gold:99999,items:loadout,id:ids[0] }).reason,'fully-upgraded');
  const f = createFighter({id:'test',items:loadout});
  assert.equal(f.items.length,6);
  assert.ok(f.shopStats.power <= SHOP_RULES.statCaps.power);
  assert.ok(f.shopStats.passive.lifesteal <= .22);
});
