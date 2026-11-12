import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DDuelMatch} from '../authority.mjs';
test('nonfinite HP and spawn input cannot corrupt actor state',()=>{const g=createGame3DDuelMatch({id:'d',challengerId:'a',opponentId:'b',challengerStats:{maxHP:Infinity},challengerSpawn:{x:Infinity,z:NaN},resolveStrike:()=>({damage:0})});assert.equal(g.actors.get('a').maxHp,100);assert.equal(g.actors.get('a').position.x,0)});
