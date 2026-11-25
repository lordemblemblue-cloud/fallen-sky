import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SHORTCUT_SPEC,createConduitVerticalPlan,shortcutArc,shortcutArcClear,shortcutOverlap} from '../src/components/duelist/client/maps/conduitVerticalShortcuts.mjs';
const routes=createConduitVerticalPlan();
test('four symmetric maintenance routes preserve arena footprint and original jump-pad directions',()=>{
  assert.equal(routes.length,4);
  const angles=routes.map(r=>r.angle);
  for(let i=1;i<angles.length;i++)assert.ok(Math.abs(angles[i]-angles[i-1]-Math.PI/2)<1e-9);
  for(const r of routes){
    assert.equal(r.boxes.filter(b=>b.walkable).length,3);
    assert.equal(r.points.length,5);
    assert.equal(r.points[0].y,0);assert.equal(r.points[4].y,5);
    assert.ok(r.edges.every(e=>e.requiredRise===1.25&&e.type==='jump'));
    assert.ok(Math.abs(Math.hypot(r.points[4].x,r.points[4].z)-29)<1e-8);
    for(const b of r.boxes)for(const x of [-b.hx,b.hx])for(const z of [-b.hz,b.hz]){
      const wx=b.cx+x*b.cos+z*b.sin,wz=b.cz-x*b.sin+z*b.cos;
      assert.ok(Math.hypot(wx,wz)<27.2);
      assert.ok(Math.hypot(wx,wz)>19);
    }
  }
});
test('all 32 directional ballistic segments clear their own prototype shell',()=>{
  let count=0;
  for(const r of routes)for(const e of r.edges)for(const [a,b] of [[e.from,e.to],[e.to,e.from]]){
    const result=shortcutArcClear(r,r.points[a],r.points[b]);
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.ok(result.horizontalSpeed<3.6);count++;
  }
  assert.equal(count,32);
});
test('each intermediate landing has matching support and head clearance',()=>{
  for(const r of routes)for(let i=1;i<=3;i++){
    const p=r.points[i],deck=r.boxes.find(b=>b.id===r.id+'-deck-'+i);
    assert.ok(Math.abs(deck.cy+deck.hy-p.y)<1e-9);
    assert.ok(shortcutOverlap(deck,{...p,y:p.y-.05},.001,.03));
    assert.ok(r.boxes.every(b=>!shortcutOverlap(b,p)));
  }
});
test('ring arrival passes the proposed rail opening; infeasible jump is rejected',()=>{
  for(const r of routes){
    for(const [from,to] of [[3,4],[4,3]]){
      const a=shortcutArc(r.points[from],r.points[to]);
      for(let i=0;i<=240;i++){
        const p=a.at(a.time*i/240),radius=Math.hypot(p.x,p.z);
        if(Math.abs(radius-SHORTCUT_SPEC.ringInner)<.55){
          const angle=Math.atan2(p.x,p.z);
          const delta=Math.atan2(Math.sin(angle-r.angle),Math.cos(angle-r.angle));
          assert.ok(Math.abs(delta)+Math.asin(.4/radius)<r.portal.to-r.angle);
          assert.ok(p.y>5-.45);
        }
      }
    }
  }
  assert.equal(shortcutArc({x:0,y:0,z:0},{x:1,y:3,z:0}),null);
});
