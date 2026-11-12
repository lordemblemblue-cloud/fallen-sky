import test from 'node:test';import assert from 'node:assert/strict';
import {inspectGame3DMarketPrice} from '../marketPricePolicy.mjs';
test('AGP price is exact positive integer and no payment permit',()=>{assert.equal(inspectGame3DMarketPrice({askAGP:'2500'}).ok,true);assert.equal(inspectGame3DMarketPrice({askAGP:'1.25'}).ok,false);assert.equal(inspectGame3DMarketPrice({askAGP:'0'}).ok,false);assert.equal(inspectGame3DMarketPrice({askAGP:'2500'}).paymentAuthorized,false)});
