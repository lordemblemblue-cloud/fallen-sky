import test from 'node:test';import assert from 'node:assert/strict';
import {projectGame3DUpgradeState} from '../trustedUpgradeStateRead.mjs';
const x={item_instance_id:'11111111-1111-4111-8111-111111111111',
 owner_id:'owner1',character_id:'hero1',revision:'1',ascend_stage:2,
 enchant_level:10,over_enchant_level:1};
const scope={ownerId:'owner1',characterId:'hero1',itemInstanceId:x.item_instance_id};
test('trusted upgrades require owner keys, canonical revision, and legal levels',()=>{
 assert.equal(projectGame3DUpgradeState({row:x,...scope}).ascendStage,2);
 assert.equal(projectGame3DUpgradeState({row:{...x,revision:'001'},...scope}),null);
 assert.equal(projectGame3DUpgradeState({row:{...x,enchant_level:9},...scope}),null);
 assert.equal(projectGame3DUpgradeState({row:x,...scope,ownerId:'wrong'}),null);
});
