// Combat 6.6 beta tests not executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAccountCharacterScope} from '../accountScopeGuard.mjs';
test('only authenticated server-origin account scopes can read',()=>{
 assert.equal(validateAccountCharacterScope({subject:{
  authenticated:false,identitySource:'trusted-server-session',
  accountId:'o1'},characterRow:{
  owner_id:'o1',character_id:'c1',revision:0}}).ok,false);
 assert.equal(validateAccountCharacterScope({subject:{
  authenticated:true,identitySource:'client-body',
  accountId:'o1'},characterRow:{
  owner_id:'o1',character_id:'c1',revision:0}}).ok,false);
 const good=validateAccountCharacterScope({subject:{
  authenticated:true,identitySource:'trusted-server-session',
  accountId:'o1'},characterRow:{
  owner_id:'o1',character_id:'c1',revision:0}});
 assert.equal(good.ok,true);
 assert.equal(good.rewardWritesAllowed,false);
});
