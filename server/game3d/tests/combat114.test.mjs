import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DDuelMatch} from '../authority.mjs';
test('new matches start without winner and settle via authority',()=>{
 const g=createGame3DDuelMatch({id:'d',challengerId:'a',opponentId:'b',resolveStrike:()=>({damage:0})});
 assert.equal(g.snapshot().winnerId,null);
});
