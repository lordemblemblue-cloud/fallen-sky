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

import { equippedHudSlots, HUD_EQUIPMENT_SLOTS } from '../src/components/duelist/client/equippedHudItems.mjs';

test('equipped item HUD always shows six horizontal slots, including placeholders', () => {
  assert.equal(HUD_EQUIPMENT_SLOTS, 6);
  assert.deepEqual(equippedHudSlots([]), [null, null, null, null, null, null]);
  const owned = equippedHudSlots([{ id: 'heartseed', tier: 1 }, { id: 'windblossom', tier: 3 }]);
  assert.equal(owned.length, 6);
  assert.equal(owned[0].name, 'Heartseed');
  assert.equal(owned[0].tier, 1);
  assert.equal(owned[0].passive, null, 'a Tier I item does not advertise its locked passive as active');
  assert.equal(owned[1].art, '/duelist/items/windblossom.svg');
  assert.equal(owned[1].tier, 3);
  assert.ok(owned[1].passive.includes('movement speed'));
  assert.ok(owned.slice(2).every((slot) => slot === null));
});

test('equipped HUD rejects unknown or duplicated IDs and never constructs an untrusted art URL', () => {
  const raw = [
    { id: '../unsafe', tier: 3 }, { id: 'ironfang', tier: 2 },
    { id: 'ironfang', tier: 3 }, { id: 'sentrylens', tier: 6 },
    ...SHOP_ITEMS.slice(0, 8).map((item) => ({ id: item.id, tier: 3 })),
  ];
  const slots = equippedHudSlots(raw);
  assert.equal(slots.length, 6);
  assert.equal(slots[0].id, 'ironfang');
  assert.equal(slots[0].tier, 2);
  assert.equal(new Set(slots.filter(Boolean).map((slot) => slot.id)).size, 6);
  assert.ok(slots.filter(Boolean).every((item) => item.art.startsWith('/duelist/items/') && !item.art.includes('..')));
});

test('battle HUD item row lives over the existing HP panel and keeps the responsive scale', () => {
  const hud = readFileSync(new URL('../src/components/duelist/client/DuelistHud.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/duelist/client/duelistHud.css', import.meta.url), 'utf8');
  assert.match(hud, /data-testid="duelist-equipped-items"/);
  assert.match(hud, /items=\{view \? view\.me\?\.items \|\| \[\] : null\}/);
  assert.match(css, /\.dh-equipped\s*\{[^}]*top:\s*-53px;[^}]*grid-template-columns:\s*repeat\(6,/);
  assert.match(css, /\.dh-bl\s*\{[^}]*transform:\s*scale\(var\(--dh-s,/);
  assert.match(css, /\.duelist-game\[data-hud='compact'\] \.dh-equipped/);
});
