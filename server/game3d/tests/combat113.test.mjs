import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DDuelMatch} from '../authority.mjs';
test('combat match owns HP caps regardless of hit resolver',()=>{
 const game=createGame3DDuelMatch({id:'d',challengerId:'a',opponentId:'b',resolveStrike:()=>({damage:Infinity,reflected:-1,lifeSteal:Infinity})});
 assert.equal(game.actors.get('a').maxHp,100);
});
