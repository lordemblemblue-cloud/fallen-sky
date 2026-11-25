import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConduitInteriorPlan,applyConduitInteriorDetails,INTERIOR_RELIEF_LIMIT} from '../src/components/duelist/client/maps/conduitInteriorDetails.mjs';
const ids=['armory','reactor','medbay','barracks'];
test('four unique interior themes span every tier, with finite bounded relief and stable ids',()=>{
  const plans=ids.map(createConduitInteriorPlan);
  assert.equal(new Set(plans.map(p=>p.theme)).size,4);
  assert.equal(plans.flatMap(p=>p.parts).length,262);
  assert.equal(new Set(plans.flatMap(p=>p.parts.map(p=>p.id))).size,262);
  for(const plan of plans){
    assert.deepEqual([...new Set(plan.parts.map(p=>p.level))].sort(),['T0','T1','T2']);
    for(const p of plan.parts){
      const a=plan.anchors.find(a=>a.key===p.anchor);
      assert.ok(a&&a.level===p.level);
      assert.ok([p.x,p.y,p.z,p.sx,p.sy,p.sz].every(Number.isFinite));
      assert.ok(p.sx>0&&p.sy>0&&p.sz>0);
      const n=a.axis==='z'?p.z:p.x,thickness=a.axis==='z'?p.sz:p.sx;
      const u=a.axis==='z'?p.x:p.z,width=a.axis==='z'?p.sx:p.sz;
      assert.ok((n-a.plane)*a.sign-thickness/2>=-1e-8);
      assert.ok((n-a.plane)*a.sign+thickness/2<=INTERIOR_RELIEF_LIMIT+1e-8);
      assert.ok(Math.abs(u-a.u)+width/2<=a.w/2+1e-8);
      assert.ok(Math.abs(p.y-a.v)+p.sy/2<=a.h/2+1e-8);
    }
  }
});
test('upper panels avoid side-wall vent portals; ground panels avoid stair approach and door openings',()=>{
  for(const id of ids){
    const p=createConduitInteriorPlan(id);
    assert.ok(p.anchors.filter(a=>a.level==='T2').every(a=>a.axis==='z'&&a.backing==='Back Wall'));
    assert.ok(p.anchors.filter(a=>a.level==='T1'&&a.backing==='Front C').every(a=>Math.abs(a.u)+a.w/2<3.2));
    assert.ok(p.anchors.every(a=>!a.backing.includes('Recovery Pod')));
  }
});
test('interior application forwards each detail once to the correct existing parent and material',()=>{
  const upper={},basement={},calls=[],materials={};
  for(const id of ids)for(const p of createConduitInteriorPlan(id).parts)materials[p.material]={key:p.material};
  for(const id of ids){
    const plan=createConduitInteriorPlan(id);calls.length=0;
    const summary=applyConduitInteriorDetails(id,upper,basement,materials,(...args)=>calls.push(args));
    assert.equal(summary.instances,plan.parts.length);
    assert.equal(calls.length,plan.parts.length);
    calls.forEach((call,i)=>{
      const p=plan.parts[i];
      assert.deepEqual(call,[p.level==='T0'?basement:upper,materials[p.material],p.x,p.y,p.z,p.sx,p.sy,p.sz]);
    });
  }
  assert.throws(()=>createConduitInteriorPlan('unknown'),RangeError);
});
