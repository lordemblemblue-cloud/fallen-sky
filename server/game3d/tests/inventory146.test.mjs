import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DForgePreview} from '../forgePreview.mjs';
test('a trustworthy forge preview requires an injected upgrade-state reader',()=>{
 assert.throws(()=>createGame3DForgePreview({
  pool:{connect:async()=>{},query:async()=>{}},
  resolveAuthenticatedSubject:async()=>null}),
 /upgrade state provider/);
});
