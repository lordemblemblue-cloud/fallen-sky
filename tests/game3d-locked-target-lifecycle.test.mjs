import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldReleaseWorldTarget} from '../src/components/game3d/combat/lockedTargetLifecycle.mjs';

test('living enemy keeps its current lock without automatically retargeting', () => {
  assert.equal(shouldReleaseWorldTarget({id:5,kind:'enemy'},[{id:5,alive:true,hp:20,group:{visible:true}}]),false);
});
test('dead or dying enemies immediately release lock-on', () => {
  for (const patch of [{hp:0},{alive:false},{dying:true},{defeated:true},{group:{visible:false}}]) {
    assert.equal(shouldReleaseWorldTarget({id:'5',kind:'enemy'},[{id:5,alive:true,hp:20,group:{visible:true},...patch}]),true);
  }
});
test('a despawned world actor releases lock-on without waiting for a timeout', () => {
  assert.equal(shouldReleaseWorldTarget({id:'gone',kind:'enemy'},[]),true);
});
test('remote player duel locks are not changed by PvE enemy expiry', () => {
  assert.equal(shouldReleaseWorldTarget({id:'player-2',kind:'player'},[]),false);
});
test('rogue actors can supply their own aliveRef without an alive boolean', () => {
  assert.equal(shouldReleaseWorldTarget({id:'rogue',kind:'enemy'},[{id:'rogue',aliveRef:()=>true}]),false);
  assert.equal(shouldReleaseWorldTarget({id:'rogue',kind:'enemy'},[{id:'rogue',aliveRef:()=>false}]),true);
});
test('no target means no destructive changes', () => {
  assert.equal(shouldReleaseWorldTarget(null,[]),false);
});
