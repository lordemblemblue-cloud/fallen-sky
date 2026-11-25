import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES } from '../src/components/duelist/core/classes.mjs';
import { demonstrationCatalog } from '../src/components/duelist/core/demonstrationCatalog.mjs';
import { createLocalSource } from '../src/components/duelist/client/localSource.mjs';

test('catalogue tracks all class abilities, specials and directional movement',()=>{
  for(const kit of Object.values(CLASSES)){
    const rows=demonstrationCatalog(kit.id);
    for(const ability of kit.abilities)assert.ok(rows.some(r=>r.id===ability.id&&r.command));
    assert.ok(rows.some(r=>r.id===kit.special.id&&r.command==='special'));
    for(const id of ['roll','dash','jump','doubleJump','airDash','guard','lightCombo','spar'])assert.ok(rows.some(r=>r.id===id));
  }
});
test('each ultimate uses real match combat and an isolated training seat',()=>{
  for(const kit of Object.values(CLASSES)){
    const source=createLocalSource({mode:'practice',classId:kit.id,demonstration:{classId:kit.id,id:kit.special.id}});
    let effects=[];
    for(let i=0;i<180;i++)effects.push(...source.step(1/60,()=>{throw Error('demo must not consume player input')}).effects);
    assert.ok(effects.some(e=>e.type==='special'&&e.by==='you'&&e.special===kit.special.id),kit.id);
    assert.equal(source.match.training,true);
  }
});
test('competitive local modes cannot activate a tutorial driver',()=>{
  const source=createLocalSource({mode:'duel',classId:'duelist',demonstration:{classId:'duelist',id:'execution'}});
  assert.equal(source.demonstration,null);
});
