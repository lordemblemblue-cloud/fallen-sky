import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DDuelMatch} from '../authority.mjs';
test('throwing resolver does not spend stamina or crash tick',()=>{
 let now=1000;
 const g=createGame3DDuelMatch({id:'d',challengerId:'a',opponentId:'b',now:()=>now,resolveStrike:()=>{throw Error('bad resolver')}});
 g.setConnected('a',true);g.setConnected('b',true);
 g.setInput('a',{seq:1,x:0,z:0,facing:Math.PI/2});
 g.submit('a',{intentId:'abcde12345',intentSeq:1,action:'basic',weaponPath:'damage'});
 now=1050;
 const responses=g.tick(now);
 assert.equal(responses[0].reason,'strike_resolution_failed');
 assert.equal(g.actors.get('a').stamina,100);
});
