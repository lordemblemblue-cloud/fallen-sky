import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DAccountInventoryRead} from '../accountInventoryRead.mjs';
test('inventory viewer requires actual server session resolver',()=>assert.throws(()=>createGame3DAccountInventoryRead({pool:{connect:async()=>{},query:async()=>{}}}),/trusted server authentication/));
