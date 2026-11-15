import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBaseAttributeGrowthPreview, formatAttributeGrowth,
} from '../src/components/game3d/axe/services/AXEAttributeGrowthPreview.mjs';

const base=Object.freeze({constitution:5,dexterity:2,strength:3,focus:2});
// Unit-level projection double: real Character UI injects computeDerivedStats
// from statsSystem, while these tests verify isolation and point deltas.
function derived(stats, equipment=[], attributeBonuses, flatBonuses) {
  assert.deepEqual(equipment,[],'do not include any equipped items in the base preview');
  assert.equal(attributeBonuses,undefined,'no attribute bonuses');
  assert.equal(flatBonuses,undefined,'no flat equipment bonuses');
  return {
    maxHP:Math.round(stats.constitution*15),
    hpRegen:stats.constitution*.12,
    attackBlock:stats.constitution*.90+stats.dexterity*1.67,
    criticalDefense:stats.constitution*.0007,
    damage:Math.round(stats.strength*3.5+stats.focus*2.2),
    chi:Math.round(stats.focus*15.31),
  };
}
const get=(key,pending)=>getBaseAttributeGrowthPreview(base,key,pending,derived);

test('Vitals +1 and staged +3 show exact base formula deltas, without gear',()=>{
  const p=get('constitution',3);
  assert.equal(p.find(x=>x.key==='maxHP').one,15);
  assert.equal(p.find(x=>x.key==='maxHP').planned,45);
  assert.ok(Math.abs(p.find(x=>x.key==='hpRegen').one-.12)<1e-10);
  assert.ok(Math.abs(p.find(x=>x.key==='criticalDefense').planned-.0021)<1e-10);
  assert.equal(p.find(x=>x.key==='damage'),undefined);
});
test('selecting another attribute changes its shown gains and leaves base untouched',()=>{
  const str=get('strength',2), vit=get('constitution',0);
  assert.equal(str.find(x=>x.key==='maxHP'),undefined);
  assert.equal(str.find(x=>x.key==='damage').planned,7);
  assert.equal(vit.find(x=>x.key==='maxHP').planned,0);
  assert.deepEqual(base,{constitution:5,dexterity:2,strength:3,focus:2});
});
test('format preserves fractional gains rather than showing zero',()=>{
  assert.equal(formatAttributeGrowth(.0007),'+0.0007');
  assert.equal(formatAttributeGrowth(15),'+15');
  assert.equal(formatAttributeGrowth(.12,'%'),'+0.12%');
});
test('rejects unknown attribute and omitted stat formula',()=>{
  assert.throws(()=>getBaseAttributeGrowthPreview(base,'equipment',1,derived),/Unknown/);
  assert.throws(()=>getBaseAttributeGrowthPreview(base,'constitution',1),/Missing/);
});
