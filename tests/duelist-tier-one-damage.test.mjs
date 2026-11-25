import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOP_ITEMS, SHOP_RULES, shopItem, tierPrice, tierItemStats, tierItemPassive, itemBonuses, purchaseRule } from '../src/components/duelist/core/shop.mjs';
import { tierStats, filterShopItems } from '../src/components/duelist/core/shopView.mjs';
import { equippedHudSlots } from '../src/components/duelist/client/equippedHudItems.mjs';

const profiles = {
  ironfang: [75, { power: .02, critChance: .02 }, null, 0],
  warbanner: [90, { power: .02, critDefense: .025 }, 'onKillShield', 3],
  eclipseedge: [105, { power: .025, critSeverity: .04 }, 'haste', .01],
  bloodrite: [125, { power: .03 }, 'lifesteal', .02],
  starbreaker: [155, { power: .045 }, null, 0],
};

test('five Damage components have exact prices, tier-specific stats and authoritative bonuses', () => {
  assert.equal(SHOP_ITEMS.length, 50);
  assert.deepEqual(SHOP_ITEMS.filter(x => x.category === 'power').map(x => x.id), Object.keys(profiles));
  for (const [id, [price, stats, effect, amount]] of Object.entries(profiles)) {
    const item = shopItem(id);
    const quote = purchaseRule({ gold: 300, items: [], id });
    assert.equal(tierPrice(item, 1), price);
    assert.equal(quote.cost, price);
    assert.equal(quote.ok, true);
    assert.deepEqual(tierItemStats(item, 1), stats);
    assert.deepEqual(Object.fromEntries(tierStats(item, 1)), stats);
    const bonuses = itemBonuses(quote.items);
    for (const stat of Object.keys(SHOP_RULES.statCaps))
      assert.equal(bonuses[stat], stats[stat] || 0, id + ':' + stat);
    const early = tierItemPassive(item, 1);
    assert.equal(early?.type || null, effect);
    if (effect) assert.equal(bonuses.passive[effect], amount);
    else for (const key of ['lifesteal', 'haste', 'onKillShield']) assert.equal(bonuses.passive[key], 0);
    assert.equal(equippedHudSlots(quote.items)[0].passive, early?.text || null);
  }
});

test('upgrades preserve early effects, replace rather than double-count at Tier III, and never reduce stats', () => {
  for (const [id, [, stats, effect, amount]] of Object.entries(profiles)) {
    const item = shopItem(id);
    const first = purchaseRule({ gold: 999, items: [], id });
    const second = purchaseRule({ gold: 999, items: first.items, id });
    const third = purchaseRule({ gold: 999, items: second.items, id });
    assert.equal(first.cost + second.cost + third.cost, item.cost);
    for (const [key, value] of Object.entries(stats)) assert.ok(tierItemStats(item, 2)[key] >= value);
    assert.deepEqual(tierItemStats(item, 3), item.stats);
    assert.equal(tierItemPassive(item, 3), item.passive);
    if (effect) {
      assert.equal(itemBonuses(second.items).passive[effect], amount);
      assert.equal(itemBonuses(third.items).passive[effect], item.passive.amount);
    }
  }
});

test('other 45 families retain original scaling, locked passives, and existing active relic gate', () => {
  for (const item of SHOP_ITEMS.filter(x => x.category !== 'power')) {
    for (const tier of [1, 2]) {
      assert.deepEqual(tierItemStats(item, tier), Object.fromEntries(Object.entries(item.stats).map(([k, v]) => [k, v * SHOP_RULES.tierShares[tier]])));
      assert.equal(tierItemPassive(item, tier), null);
    }
  }
  const relics = itemBonuses([{ id: 'thundermirror', tier: 1 }]);
  assert.equal(relics.passive.activeAnchor, 0);
  assert.equal(relics.passive.activeItemId, null);
  assert.equal(purchaseRule({ gold: 9999, items: [{id:'thundermirror',tier:1}], id:'siphonmirror' }).reason, 'active-relic-slot-full');
});

test('early passive names are searchable and duplicate item IDs cannot multiply their effects', () => {
  const me = { gold: 300, items: [], canShop: true };
  assert.deepEqual(filterShopItems(me, {search:'Blood Tribute'}).map(x=>x.id), ['bloodrite']);
  assert.equal(itemBonuses([{id:'bloodrite',tier:1},{id:'bloodrite',tier:1}]).passive.lifesteal, .02);
  assert.equal(itemBonuses([{id:'__proto__',tier:1}]).power, 0);
  assert.equal(tierItemPassive(shopItem('bloodrite'), 4), null);
});
