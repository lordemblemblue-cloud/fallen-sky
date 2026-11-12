import test from 'node:test';import assert from 'node:assert/strict';
import {createMarketPreviewAudit} from '../marketPreviewAudit.mjs';
test('market audit cannot accept malformed account context',async()=>{
 const reader=createMarketPreviewAudit({pool:{connect:()=>{throw Error('should not connect')}}});
 await assert.rejects(()=>reader.inspect({ownerId:'__anon__',characterId:'c',listingId:'broken'}),/Invalid private market listing scope/);
});
