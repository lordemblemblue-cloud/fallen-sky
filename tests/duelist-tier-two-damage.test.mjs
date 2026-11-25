import test from 'node:test';
import assert from 'node:assert/strict';
import { shopItem, tierItemStats, tierItemPassive, tierPrice, purchaseRule, itemBonuses } from '../src/components/duelist/core/shop.mjs';
import { tierStats, filterShopItems } from '../src/components/duelist/core/shopView.mjs';
import { equippedHudSlots } from '../src/components/duelist/client/equippedHudItems.mjs';
import { createFighter } from '../src/components/duelist/core/fighter.mjs';
import { strike } from '../src/components/duelist/core/combat.mjs';
import { moveFor } from '../src/components/duelist/core/ranks.mjs';

const entries = {
  ironfang: [180, { power: .04, critChance: .03 }, 'lifesteal', .03],
  warbanner: [216, { power: .045, critDefense: .035 }, 'onKillShield', 7],
  eclipseedge: [252, { power: .055, critSeverity: .06 }, 'haste', .025],
  bloodrite: [300, { power: .065 }, 'lifesteal', .045],
  starbreaker: [372, { power: .08 }, 'onKillShield', 8],
};
const equip = (id,tier=2) => [{id,tier}];
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-6, actual+' != '+expected);
test('Tier II Damage profiles agree in the purchase rules, stats, HUD and authoritative loadout', () => {
  for (const [id,[price,stats,type,amount]] of Object.entries(entries)) {
    const item=shopItem(id);
    assert.equal(tierPrice(item,2),price);
    const q=purchaseRule({gold:999,items:equip(id,1),id,targetTier:2});
    assert.equal(q.cost,price-tierPrice(item,1));
    assert.deepEqual(tierItemStats(item,2),stats);
    assert.deepEqual(Object.fromEntries(tierStats(item,2)),stats);
    const p=tierItemPassive(item,2);
    assert.equal(p.type,type);assert.equal(p.amount,amount);
    assert.equal(equippedHudSlots(q.items)[0].passive,p.text);
    for(const [key,value] of Object.entries(stats)) {
      assert.equal(itemBonuses(q.items)[key],value);
      assert.ok(value>=tierItemStats(item,1)[key]);
      assert.ok(value<=tierItemStats(item,3)[key]);
    }
    assert.equal(itemBonuses(q.items).passive[type],amount);
    assert.equal(itemBonuses(equip(id,3)).passive[type],item.passive.amount);
  }
  assert.deepEqual(filterShopItems({gold:300,items:[],canShop:true},{search:'Predator'}).map(x=>x.id),['ironfang']);
});

test('Blood Rite lifesteal and damage work on actual hits, respect anti-heal and never heal from shield-only damage', () => {
  const attacker=createFighter({id:'a',items:equip('bloodrite')});
  attacker.vitals.hp=40;
  let target=createFighter({id:'b',vitals:{shield:0}});
  const baseline=createFighter({id:'a'});
  const ordinary=strike(baseline,createFighter({id:'b',vitals:{shield:0}}),'swordLight1',{now:1}).result;
  const hit=strike(attacker,target,'swordLight1',{now:1}).result;
  assert.ok(hit.hpDamage>0);
  close(hit.hpDamage,ordinary.hpDamage*1.065);
  close(attacker.vitals.hp,40+hit.hpDamage*.045);
  attacker.vitals.hp=40;
  attacker.healReducedUntil=10;attacker.healReduction=.25;
  target=createFighter({id:'c',vitals:{shield:0}});
  const reduced=strike(attacker,target,'swordLight1',{now:2}).result;
  close(attacker.vitals.hp,40+reduced.hpDamage*.045*.75);
  attacker.vitals.hp=40;
  const guarded=strike(attacker,createFighter({id:'d',vitals:{shield:1000}}),'swordLight1',{now:3}).result;
  assert.equal(guarded.hpDamage,0);assert.ok(guarded.shieldDamage>0);assert.equal(attacker.vitals.hp,40);
});

test('Rally and Starfall grant their exact shield reward once per confirmed strike elimination', () => {
  for(const [id,reward] of [['warbanner',7],['starbreaker',8]]) {
    const attacker=createFighter({id:'a',items:equip(id),vitals:{shield:20}});
    attacker.vitals.shield=0;
    const target=createFighter({id:'b',vitals:{hp:1,shield:0}});
    assert.equal(strike(attacker,target,'swordLight1',{now:1}).result.killed,true);
    assert.equal(attacker.vitals.shield,reward);
    assert.equal(strike(attacker,target,'swordLight1',{now:2}).result,null);
    assert.equal(attacker.vitals.shield,reward);
    attacker.vitals.shield=19;
    strike(attacker,createFighter({id:'c',vitals:{hp:1,shield:0}}),'swordLight1',{now:3});
    assert.equal(attacker.vitals.shield,20);
  }
});

test('Eclipse Edge changes real ranked cooldowns, not ordinary attack frame timing', () => {
  const ordinary=createFighter({id:'a',classId:'duelist'});
  const equipped=createFighter({id:'a',classId:'duelist',items:equip('eclipseedge')});
  const base=moveFor(ordinary,'bladeThrow');
  assert.ok(base.cooldown>0);
  close(moveFor(equipped,'bladeThrow').cooldown,Math.round(base.cooldown*.975*1000)/1000);
  assert.equal(moveFor(equipped,'bladesLight1').startup,moveFor(ordinary,'bladesLight1').startup);
});
