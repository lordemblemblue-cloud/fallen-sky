import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_PVP_ZONE,resolveWorldPvpZone,canWorldPvpAttack}
  from '../src/components/game3d/pvp/WorldPvpRules.mjs';
import {worldAnnouncementFromReceipt}
  from '../src/components/game3d/notifications/WorldAnnouncementModel.mjs';
import {createGame3DWorldPvpAuthority}
  from '../server/game3d/worldPvpAuthority.mjs';

const at=(x,z)=>({x,z}); // world z = Wolfveil local z + 70
const town=()=>resolveWorldPvpZone({region:'wolfveil',position:at(0,70)});
const west=()=>resolveWorldPvpZone({region:'wolfveil',position:at(-230,70)});
const east=()=>resolveWorldPvpZone({region:'wolfveil',position:at(180,70)});
const actor=(id,mode='pvp',instanceId='instance-1')=>({id,mode,instanceId});

test('safe town, apartments and unknown positions are always PvE regardless of flags',()=>{
  const a=actor('a'),b=actor('b');
  assert.equal(town().kind,WORLD_PVP_ZONE.SAFE);
  assert.equal(west().kind,WORLD_PVP_ZONE.OPT_IN);
  assert.equal(resolveWorldPvpZone({region:'wolfveil',position:at(-230,70),privateArea:true}).kind,'safe');
  assert.equal(resolveWorldPvpZone({region:'lunar-cave',position:at(-230,70)}).kind,'safe');
  assert.equal(resolveWorldPvpZone({region:'wolfveil',position:null}).kind,'safe');
  assert.equal(canWorldPvpAttack({attacker:a,defender:b,attackerZone:town(),defenderZone:town()}).reason,'safe_zone');
  assert.equal(canWorldPvpAttack({attacker:a,defender:b,attackerZone:west(),defenderZone:town()}).reason,'safe_zone');
});

test('two separately opted-in players may attack only in the same active PvP zone',()=>{
  const zone=west(),a=actor('a'),b=actor('b');
  assert.equal(canWorldPvpAttack({attacker:a,defender:b,attackerZone:zone,defenderZone:zone}).ok,true);
  assert.equal(canWorldPvpAttack({attacker:a,defender:actor('b','pve'),attackerZone:zone,defenderZone:zone}).reason,'defender_pve');
  assert.equal(canWorldPvpAttack({attacker:actor('a','pve'),defender:b,attackerZone:zone,defenderZone:zone}).reason,'attacker_pve');
  assert.equal(canWorldPvpAttack({attacker:a,defender:b,attackerZone:west(),defenderZone:east()}).reason,'different_zone');
  assert.equal(canWorldPvpAttack({attacker:a,defender:actor('b','pvp','another-instance'),attackerZone:zone,defenderZone:zone}).reason,'different_world_instance');
});

const trustedActors=new Map([
  ['a',{trusted:true,id:'a',displayName:'Alpha',instanceId:'instance-1',region:'wolfveil',position:at(-230,70),alive:true}],
  ['b',{trusted:true,id:'b',displayName:'Bravo',instanceId:'instance-1',region:'wolfveil',position:at(-231,70),alive:true}],
  ['t',{trusted:true,id:'t',displayName:'Town Guard',instanceId:'instance-1',region:'wolfveil',position:at(0,70),alive:true}],
  ['home',{trusted:true,id:'home',displayName:'Home Owner',instanceId:'instance-1',region:'wolfveil',position:at(-230,70),privateArea:true,alive:true}],
]);
const authority=()=>createGame3DWorldPvpAuthority({
  resolveTrustedActor:async session=>trustedActors.get(session)||null,
  verifyCombatReceipt:async({receipt,attacker,defender})=>
    receipt?.source==='dedicated-private-combat'
      ?{verified:true,id:receipt.id,killerId:attacker.id,victimId:defender.id,
        instanceId:attacker.instanceId,fatal:true}:null,
  verifyWorldEvent:async candidate=>candidate?.source==='private-reward-ledger'
    ?{...candidate,verified:true}:null,
  now:()=>1750000000000,
});
test('private authority refuses unauthenticated flags and all attacks by PvE characters',async()=>{
  const game=authority();
  assert.equal((await game.setFlag('forged','pvp')).reason,'unverified_session');
  assert.equal((await game.assessAttack('a','b')).reason,'attacker_pve');
  assert.equal((await game.setFlag('a','pvp')).ok,true);
  assert.equal((await game.assessAttack('a','b')).reason,'defender_pve');
  assert.equal((await game.setFlag('b','pvp')).effectivePvp,true);
  assert.equal((await game.assessAttack('a','b')).ok,true);
  assert.equal((await game.setFlag('t','pvp')).effectivePvp,false);
  assert.equal((await game.assessAttack('a','t')).reason,'safe_zone');
  assert.equal((await game.setFlag('home','pvp')).effectivePvp,false);
  assert.equal((await game.assessAttack('a','home')).reason,'safe_zone');
  assert.equal((await game.setFlag('b','pve')).ok,true);
  assert.equal((await game.assessAttack('a','b')).reason,'defender_pve');
});

test('PK and spree announcements need verified fatal receipts and reject replays',async()=>{
  const game=authority();
  await game.setFlag('a','pvp');await game.setFlag('b','pvp');
  assert.equal((await game.commitElimination({attackerToken:'a',defenderToken:'b',receipt:{id:'fake'}})).reason,
    'combat_receipt_unverified');
  for(let i=1;i<=3;i++){
    const result=await game.commitElimination({attackerToken:'a',defenderToken:'b',
      receipt:{id:'valid-receipt-'+i,source:'dedicated-private-combat'}});
    assert.equal(result.ok,true);
    assert.equal(result.streak,i);
    assert.equal(result.announcements.length,i===3?2:1);
  }
  assert.equal(game.readAnnouncements().filter(x=>x.kind==='killing_spree').length,1);
  assert.equal((await game.commitElimination({attackerToken:'a',defenderToken:'b',
    receipt:{id:'valid-receipt-3',source:'dedicated-private-combat'}})).reason,
    'duplicate_combat_receipt');
  assert.equal((await game.getStatus('a')).streak,3);
});

test('item and dungeon feeds require verified, distinct reward receipts',async()=>{
  const game=authority();
  const fake=await game.commitAchievement({kind:'item_acquired',actorName:'Alpha',
    itemName:'Moon Staff',receiptId:'item-1',source:'browser'});
  assert.equal(fake.reason,'world_event_unverified');
  const good=await game.commitAchievement({kind:'item_acquired',actorName:'Alpha',
    itemName:'Moon Staff',receiptId:'item-1',source:'private-reward-ledger'});
  assert.equal(good.ok,true);assert.match(good.announcement.description,/Alpha acquired Moon Staff/);
  assert.equal((await game.commitAchievement({kind:'item_acquired',actorName:'Alpha',
    itemName:'Moon Staff',receiptId:'item-1',source:'private-reward-ledger'})).reason,
    'duplicate_world_receipt');
  const dungeon=await game.commitAchievement({kind:'dungeon_cleared',actorName:'Bravo',
    dungeonName:'Moonfall',receiptId:'dungeon-1',source:'private-reward-ledger'});
  assert.equal(dungeon.ok,true);
  assert.equal(game.readAnnouncements(1).length,1);
});

test('world feed constrains text to known event kinds and strips unsafe markup',()=>{
  assert.equal(worldAnnouncementFromReceipt({kind:'custom',message:'Everybody is dead'}),null);
  const event=worldAnnouncementFromReceipt({kind:'item_acquired',
    actorName:'<Alpha>',itemName:'<Sword>'});
  assert.ok(event);
  assert.doesNotMatch(event.description,/[<>]/);
  assert.equal(worldAnnouncementFromReceipt({kind:'killing_spree',
    actorName:'Hero',streak:2}),null);
  assert.equal(worldAnnouncementFromReceipt({kind:'killing_spree',
    actorName:'Hero',streak:5}).tone,'red');
});
