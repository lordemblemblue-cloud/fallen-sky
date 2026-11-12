import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DInventoryAllocation} from '../inventoryAllocation.mjs';
test('unverified or anonymous allocations cannot write',()=>{assert.throws(()=>createGame3DInventoryAllocation({pool:{connect:async()=>{}}}),/trusted item verifier/)});
