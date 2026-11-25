import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addFighter, bodyOf, step, activateItemRelic, ACTIVE_RELIC } from '../src/components/duelist/sim/world.mjs';
import { equipItems, purchaseRule } from '../src/components/duelist/core/shop.mjs';
import { isInvulnerable } from '../src/components/duelist/core/fighter.mjs';
import { sanitizeInput, PROTOCOL, encodeOwn, applyOwn } from '../src/components/duelist/net/protocol.mjs';

const DT = 1 / 60;
test('Phase Mirror can mark and teleport back once, with a cooldown', () => {
  const world = createWorld({arenaRadius:30});
  const f = addFighter(world,{id:'hero'});
  const b = bodyOf(world,'hero');
  equipItems(f,[{id:'thundermirror',tier:3}]);
  let fx = step(world,DT,{hero:{presses:['itemActive']}});
  assert.ok(f.activeAnchorAt);
  assert.equal(fx.filter((e)=>e.type==='relicAnchor').length,1);
  b.x=5;b.z=7;
  fx=step(world,DT,{hero:{presses:['itemActive']}});
  assert.equal(fx.filter((e)=>e.type==='relicTeleport').length,1);
  assert.equal(b.x,0);assert.equal(b.z,0);
  assert.equal(f.activeAnchorAt,null);
  assert.ok(f.activeRelicCooldownUntil>world.time);
  const again=activateItemRelic(world,f,b,world.time,[]);
  assert.equal(again.ok,false);
  assert.equal(again.reason,'cooldown');
});

test('Stasis Mirror makes the wearer invulnerable and immobile without letting them attack', () => {
  const world=createWorld({arenaRadius:30});
  const f=addFighter(world,{id:'hero'});
  const b=bodyOf(world,'hero');
  equipItems(f,[{id:'siphonmirror',tier:3}]);
  const fx=step(world,DT,{hero:{presses:['itemActive']}});
  assert.equal(fx.filter((e)=>e.type==='relicStasis').length,1);
  assert.equal(isInvulnerable(f,world.time),true);
  const x=b.x, z=b.z;
  step(world,DT,{hero:{move:{x:1,z:0},presses:['light','dash']}});
  assert.equal(b.x,x);assert.equal(b.z,z);
  assert.equal(f.action,null);
  for(let i=0;i<Math.ceil(ACTIVE_RELIC.stasisSeconds/DT)+2;i++)step(world,DT,{});
  assert.equal(isInvulnerable(f,world.time),false);
  assert.equal(activateItemRelic(world,f,b,world.time,[]).reason,'cooldown');
});

test('Active relics require Tier III, and only one active relic may be purchased', () => {
  const f=addFighter(createWorld(),{id:'hero'});
  equipItems(f,[{id:'thundermirror',tier:2}]);
  const result=activateItemRelic(createWorld(),f,{x:0,y:0,z:0},1);
  assert.equal(result.reason,'no-active-relic');
  assert.equal(purchaseRule({gold:1000,items:[{id:'thundermirror',tier:1}],id:'siphonmirror'}).reason,'active-relic-slot-full');
  const valid=sanitizeInput({s:1,p:['itemActive','#itemActive','relicTeleport'],m:[0,0]});
  assert.deepEqual(valid.presses,['itemActive']);
  assert.equal(PROTOCOL, 20); // current protocol; tier purchases negotiate a separate capability
});

test('Relic cooldowns and teleport anchor synchronize with client prediction snapshots', () => {
  const world=createWorld();
  const f=addFighter(world,{id:'hero'});
  equipItems(f,[{id:'thundermirror',tier:3}]);
  step(world,DT,{hero:{presses:['itemActive']}});
  const own=JSON.parse(JSON.stringify(encodeOwn(f,bodyOf(world,'hero'),world.time)));
  const mirror=createWorld();
  const g=addFighter(mirror,{id:'hero'});
  applyOwn(g,bodyOf(mirror,'hero'),own);
  assert.equal(g.activeAnchorAt?.x,0);
  assert.equal(g.activeAnchorAt?.until,f.activeAnchorAt?.until);
  assert.equal(g.shopStats.passive.activeAnchor,1);
});
