import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSource} from '../src/components/duelist/client/localSource.mjs';
import {getModeArenaLayout,arenaFloorContains,arenaBodyBlockers,moveArenaBody} from '../src/components/duelist/sim/modeArenaLayout.mjs';
test('all seven test modes start solo and can start with normal bot seats',()=>{
  for(const mode of ['duel','ffa','tdm','ctf','escort','football','control']){
    const solo=createLocalSource({mode,testMode:true});
    assert.equal(solo.seats().length,1,mode);
    assert.equal(solo.seats()[0].kind,'player');
    const filled=createLocalSource({mode,testMode:true,testBots:true});
    assert.ok(filled.seats().some(s=>s.kind==='bot'),mode);
  }
});
test('public, offline and private Control Point use the approved two-level map',()=>{
  const map=getModeArenaLayout('control');
  assert.equal(map,getModeArenaLayout('control',true));
  assert.equal(map.id,'control-point-import-v2');
  assert.equal(createLocalSource({mode:'control',testMode:true}).world.arenaLayout,map);
  assert.equal(createLocalSource({mode:'control'}).world.arenaLayout,map);
  assert.equal(map.ramps.length,8);
  assert.equal(map.controlPoints.length,3);
  assert.deepEqual(map.controlPoints.map(p=>p.y),[8,0,0]);
});
