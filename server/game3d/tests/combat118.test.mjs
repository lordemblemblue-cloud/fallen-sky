import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DDuelMatch} from '../authority.mjs';
test('duplicate saved actor IDs cannot restore forged opponent state',()=>{
 const checkpoint={state:{status:'active',sequence:99,actors:[
  {id:'a',hp:1},{id:'a',hp:1}]}};
 const g=createGame3DDuelMatch({id:'duel',challengerId:'a',opponentId:'b',checkpoint,resolveStrike:()=>({damage:0})});
 assert.equal(g.snapshot().status,'waiting');
 assert.equal(g.actors.get('a').hp,100);
});
