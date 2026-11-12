import test from 'node:test';import assert from 'node:assert/strict';
import {projectGame3DInventoryHud} from '../inventoryHudProjection.mjs';
test('inventory label comes from exactly one authoritative snapshot',()=>{
 const a=projectGame3DInventoryHud({ok:true,capacity:200,count:0,revision:'0',slots:[]});
 assert.equal(a.inventoryLabel,'0/200');
 assert.equal(a.remaining,200);
 assert.equal(projectGame3DInventoryHud({ok:true,capacity:200,count:25,revision:'0',slots:[]}).ok,false);
});
