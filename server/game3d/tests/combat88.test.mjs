import test from 'node:test';import assert from 'node:assert/strict';
import {assertGame3DPreBetaSafety} from '../combatPreBetaGate.mjs';
test('unverified marketplace and escrow cannot start',()=>{
 for(const name of ['GAME3D_MARKET_PUBLIC_TRADING_ENABLED','GAME3D_MARKET_ESCROW_ENABLED','GAME3D_MARKET_REAL_CURRENCY_ENABLED','GAME3D_MARKET_AUTOMATED_LISTINGS_ENABLED'])
 assert.throws(()=>assertGame3DPreBetaSafety({[name]:'true'}),/pre-beta competitive features blocked/);
});
