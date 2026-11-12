import test from 'node:test';import assert from 'node:assert/strict';
import {verifyStoredWorldEvent} from '../worldEventProofRead.mjs';
test('unsafe bigint event ticks cannot pass digest validation',()=>{const row={owner_id:'o',character_id:'c',instance_id:'w',event_id:'e',server_tick:'9007199254740993',evidence_digest:'a'.repeat(64),event_digest:'a'.repeat(64)};assert.equal(verifyStoredWorldEvent({row,ownerId:'o',characterId:'c',instanceId:'w'}).ok,false)});
