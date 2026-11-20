import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordGame3DCombatEvent,getGame3DCombatLog,subscribeGame3DCombatLog,
  clearGame3DCombatLog,describeGame3DCombatEvent,MAX_GAME3D_COMBAT_LOG,
} from '../src/components/game3d/combat/Game3DCombatLog.mjs';

test('resolved damage and misses show actual directions and enemy names',()=>{
 clearGame3DCombatLog();
 const a=recordGame3DCombatEvent('dealt',87.25,{target:'Quarry Dragon'});
 const b=recordGame3DCombatEvent('taken',13,{source:'Quarry Dragon'});
 const c=recordGame3DCombatEvent('miss',null,{target:'Quarry Dragon'});
 const d=recordGame3DCombatEvent('self',4);
 assert.equal(a.amount,87.3);assert.equal(b.amount,13);
 assert.equal(c.amount,null);
 assert.match(describeGame3DCombatEvent(a),/Dealt 87.3 damage to Quarry Dragon/);
 assert.match(describeGame3DCombatEvent(b),/Received 13 damage from Quarry Dragon/);
 assert.match(describeGame3DCombatEvent(c),/MISS/);
 assert.match(describeGame3DCombatEvent(d),/Self damage 4/);
});
test('invalid fake damage is never emitted',()=>{
 clearGame3DCombatLog();
 assert.equal(recordGame3DCombatEvent('dealt',-100),null);
 assert.equal(recordGame3DCombatEvent('taken',NaN),null);
 assert.equal(recordGame3DCombatEvent('admin_grant',999),null);
 assert.equal(getGame3DCombatLog().length,0);
});
test('observer sees events and cleanup stops notifications',()=>{
 clearGame3DCombatLog();
 let calls=0;
 const stop=subscribeGame3DCombatLog(events=>{assert.ok(Array.isArray(events));calls++;});
 recordGame3DCombatEvent('dealt',8);
 stop();
 recordGame3DCombatEvent('dealt',7);
 assert.equal(calls,2);
});
test('the scrollback is bounded and reset does not affect combat state',()=>{
 clearGame3DCombatLog();
 for(let i=0;i<MAX_GAME3D_COMBAT_LOG+12;i++)recordGame3DCombatEvent('dealt',i+1);
 assert.equal(getGame3DCombatLog().length,MAX_GAME3D_COMBAT_LOG);
 assert.equal(getGame3DCombatLog()[0].amount,13);
 clearGame3DCombatLog();
 assert.deepEqual(getGame3DCombatLog(),[]);
});
