import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DCharacterServices160} from '../characterServices160.mjs';
test('Character Services exposes a read-only, nontransactional forge preview quote',()=>{
 const service=createGame3DCharacterServices160({
  pool:{connect:async()=>{},query:async()=>{}},
  resolveAuthenticatedSubject:async()=>null});
 assert.equal(typeof service.inspectForgeQuote,'function');
 assert.equal(service.productionReleaseAuthorized,false);
 assert.equal('commitForge' in service,false);
});
