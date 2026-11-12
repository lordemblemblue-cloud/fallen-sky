import test from 'node:test';import assert from 'node:assert/strict';
import {createAuthenticatedProgressionRead} from '../authenticatedProgressionRead.mjs';
test('server session resolver is mandatory',()=>{
 assert.throws(()=>createAuthenticatedProgressionRead({pool:{query:async()=>{},connect:async()=>{}}}),/Trusted server identity/);
});
