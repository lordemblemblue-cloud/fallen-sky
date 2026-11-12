import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DDuelMatch} from '../authority.mjs';
test('bad checkpoint cooldown cannot crash duel restore',()=>{
 const c={state:{status:'waiting',sequence:0,actors:[{id:'a',cooldowns:[null,['fake',Infinity]]},{id:'b',cooldowns:[]}]}};
 const g=createGame3DDuelMatch({id:'d',challengerId:'a',opponentId:'b',checkpoint:c,resolveStrike:()=>({damage:0})});
 assert.equal(g.actors.get('a').cooldowns.size,0);
});
