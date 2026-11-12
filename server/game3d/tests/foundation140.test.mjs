import test from 'node:test';import assert from 'node:assert/strict';
import {createGame3DCharacterServicesPreview} from '../characterServices14.mjs';
test('14.0 requires trusted account and upgrade providers',()=>{assert.throws(()=>createGame3DCharacterServicesPreview({pool:{connect:async()=>{},query:async()=>{}}}),/trusted DB, session and upgrade provider/)});
