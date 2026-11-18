import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONLINE_CTF_MAPS, ONLINE_CTF_HOMES, CTF_DROP_RETURN_MS,
  createOnlineCtf, advanceOnlineCtf, publicOnlineCtf,
  dropOnlineCtfCarrier, passOnlineCtfFlag,
} from '../ctfMatch.mjs';

const make = (id, side, pos, alive = true) => ({id,side,pos:[...pos],alive});
const home = (map, side) => [...ONLINE_CTF_HOMES[map][side]];
test('CTF uses authored team bases and exposes serializable synchronized objective state', () => {
  assert.deepEqual(ONLINE_CTF_MAPS, ['skybridge','sumi_stronghold']);
  for (const map of ONLINE_CTF_MAPS) {
    const ctf = createOnlineCtf(map);
    assert.equal(ctf.flags.light.state, 'base');
    assert.deepEqual(ctf.flags.dark.home, ONLINE_CTF_HOMES[map].dark);
    const snap = publicOnlineCtf(ctf);
    assert.deepEqual(snap.score, {light:0,dark:0});
    assert.equal(snap.winner, null);
    assert.equal(snap.flags.dark.carrier, null);
  }
  assert.throws(() => createOnlineCtf('training'),/authored arena/);
});
test('only a real nearby enemy may pick up a flag, return it and score at their own standing flag', () => {
  const map = 'skybridge', ctf = createOnlineCtf(map);
  const blue = make('a','light',home(map,'light'));
  const red = make('b','dark',home(map,'dark'));
  const others = [blue,red];
  // Blue at their own home cannot collect the red flag from 110m away.
  assert.equal(advanceOnlineCtf(ctf,others,1000),false);
  assert.equal(ctf.flags.dark.state,'base');
  blue.pos=home(map,'dark');
  assert.equal(advanceOnlineCtf(ctf,others,1500),true);
  assert.equal(ctf.flags.dark.carrier,'a');
  // Red taking blue's flag blocks a capture even while Blue returns home.
  red.pos=home(map,'light');
  advanceOnlineCtf(ctf,others,1600);
  assert.equal(ctf.flags.light.carrier,'b');
  blue.pos=home(map,'light');
  advanceOnlineCtf(ctf,others,1800);
  assert.equal(ctf.score.light,0,'both teams carrying should not award an illegal capture');
  // Red dies with blue flag, blue recovers it and can finish their capture.
  red.alive=false;
  assert.equal(dropOnlineCtfCarrier(ctf,'b',red.pos,2000),true);
  assert.equal(ctf.flags.light.state,'dropped');
  advanceOnlineCtf(ctf,others,2200);
  assert.equal(ctf.score.light,1);
  assert.equal(ctf.flags.dark.state,'base');
  assert.equal(ctf.flags.light.state,'base');
});
test('20-second dropped flag return, death/disconnect drops and protected team hand-off', () => {
  const map='sumi_stronghold',ctf=createOnlineCtf(map);
  const a=make('a','light',home(map,'dark')), c=make('c','light',home(map,'dark'));
  const enemy=make('b','dark',[30,0,60]);
  advanceOnlineCtf(ctf,[a,c,enemy],1000);
  assert.equal(ctf.flags.dark.carrier,'a');
  assert.equal(passOnlineCtfFlag(ctf,a,enemy,1700),false,'cannot pass to an enemy');
  c.pos=[...a.pos]; c.pos[0]+=1;
  assert.equal(passOnlineCtfFlag(ctf,a,c,1800),true);
  assert.equal(ctf.flags.dark.carrier,'c');
  assert.equal(passOnlineCtfFlag(ctf,c,a,2000),false,'fast back-and-forth passes rejected');
  c.pos=[14,4.2,170];
  assert.equal(dropOnlineCtfCarrier(ctf,'c',c.pos,3000),true);
  assert.equal(ctf.flags.dark.state,'dropped');
  a.pos=[0,0,-78]; c.alive=false;
  advanceOnlineCtf(ctf,[a,c,enemy],3000+CTF_DROP_RETURN_MS-1);
  assert.equal(ctf.flags.dark.state,'dropped');
  advanceOnlineCtf(ctf,[a,c,enemy],3000+CTF_DROP_RETURN_MS);
  assert.equal(ctf.flags.dark.state,'base');
});
test('server decides three valid captures and refuses stale score changes after victory', () => {
  const map='skybridge', ctf=createOnlineCtf(map);
  const runner=make('blue','light',home(map,'dark'));
  for(let round=0;round<3;round++){
    runner.pos=home(map,'dark');
    advanceOnlineCtf(ctf,[runner],round*1000);
    runner.pos=home(map,'light');
    advanceOnlineCtf(ctf,[runner],round*1000+100);
  }
  assert.deepEqual(ctf.score,{light:3,dark:0});
  assert.equal(ctf.winner,'light');
  const revision=ctf.revision;
  assert.equal(advanceOnlineCtf(ctf,[runner],10000),false);
  assert.equal(ctf.revision,revision);
});
