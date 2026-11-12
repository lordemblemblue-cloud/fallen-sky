import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DDuelMatch} from '../authority.mjs';
test('disconnect flushes in-flight attack and dodge state',()=>{
 const game=createGame3DDuelMatch({id:'d',challengerId:'a',opponentId:'b',resolveStrike:()=>({damage:0})});
 game.setConnected('a',true);game.setConnected('b',true);
 const a=game.actors.get('a');a.casts.set('cast1',{});a.charges.set('charge1',{});a.invulUntil=999999;
 game.setConnected('a',false);
 assert.equal(a.casts.size,0);assert.equal(a.charges.size,0);assert.equal(a.invulUntil,0);
});
