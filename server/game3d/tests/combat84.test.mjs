import test from 'node:test';import assert from 'node:assert/strict';
import {validServerCharacterKey} from '../trustedCharacterKey.mjs';
test('key grammar matches schema 015',()=>{
 assert.equal(validServerCharacterKey('abc_123'),true);
 assert.equal(validServerCharacterKey('__anon__'),false);
 assert.equal(validServerCharacterKey('x'.repeat(129)),false);
});
