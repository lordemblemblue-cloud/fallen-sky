// Private-beta-only source contract.
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DPrivateEquipmentCommands} from '../privateEquipmentCommands.mjs';
test('server authentication and rules are mandatory',()=>{
 assert.throws(()=>createGame3DPrivateEquipmentCommands({
  pool:{query:async()=>{},connect:async()=>{}}}),
  /Trusted session resolver/);
});
