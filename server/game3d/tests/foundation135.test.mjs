import test from 'node:test';import assert from 'node:assert/strict';
import {inspectEnchantPath} from '../enchantRules.mjs';
test('over enchant is hidden before max normal enchant',()=>{assert.equal(inspectEnchantPath({enchantLevel:9,overEnchantLevel:0}).showOverEnchant,false);assert.equal(inspectEnchantPath({enchantLevel:10,overEnchantLevel:0}).showOverEnchant,true);assert.equal(inspectEnchantPath({enchantLevel:9,overEnchantLevel:1}).ok,false)});
