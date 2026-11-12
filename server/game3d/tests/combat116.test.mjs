import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DDuelMatch} from '../authority.mjs';
test('new socket movement sequences start at one, combat intents are retained',()=>{
 const g=createGame3DDuelMatch({id:'d',challengerId:'a',opponentId:'b',resolveStrike:()=>({damage:0})});
 const a=g.actors.get('a');a.inputSeq=500;a.lastIntentSeq=17;
 g.setConnected('a',true);
 assert.equal(a.inputSeq,0);assert.equal(a.lastIntentSeq,17);
});
