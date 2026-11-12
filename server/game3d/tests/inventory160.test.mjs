import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DCharacterServices160} from '../characterServices160.mjs';
test('16.0 never exports payments or item grant methods',()=>{
 const x=createGame3DCharacterServices160({pool:{query:async()=>{},connect:async()=>{}},
  resolveAuthenticatedSubject:async()=>null});
 assert.equal(x.version,'16.0');
 assert.equal('executeTrade' in x,false);
 assert.equal('grantItem' in x,false);
 assert.equal('performForge' in x,false);
});
