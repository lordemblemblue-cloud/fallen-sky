import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VENT_SPEC,createConduitVentPlan,ventBoxCorners,ventContains,ventPortalWallPieces} from '../src/components/duelist/client/maps/conduitVentilation.mjs';
const routes=createConduitVentPlan();
test('four enclosed symmetric routes connect adjacent buildings and fit the existing outer footprint',()=>{
  assert.equal(routes.length,4);
  const portals=routes.flatMap(r=>r.portals);
  assert.equal(new Set(portals.map(p=>p.building+' '+p.side)).size,8);
  for(const route of routes){
    assert.equal(route.boxes.length,8);assert.equal(route.guides.length,4);
    assert.equal(route.boxes.filter(b=>b.walkable).length,2);
    for(const b of route.boxes)for(const c of ventBoxCorners(b)){
      const r=Math.hypot(c.x,c.z);
      assert.ok(r<=VENT_SPEC.foundationRadius);
      assert.ok(r>32.2); // outside existing ring walk
    }
  }
});
test('all four duct centerlines support a standing fighter and clear the duct shell',()=>{
  for(const r of routes)for(let i=2;i<=3;i++){
    const a=r.waypoints[i-1],b=r.waypoints[i];
    for(let k=0;k<=200;k++){
      const t=k/200,p={x:a.x+(b.x-a.x)*t,y:VENT_SPEC.y,z:a.z+(b.z-a.z)*t};
      assert.ok(r.boxes.every(box=>!ventContains(box,p,.4,1.8)));
      assert.ok(r.boxes.some(box=>box.kind==='floor'&&ventContains(box,{...p,y:p.y-.05},.001,.03)));
    }
  }
});
test('eight proposed portal cuts preserve the rest of each original side wall',()=>{
  for(const p of routes.flatMap(r=>r.portals)){
    const pieces=ventPortalWallPieces(p);
    assert.equal(pieces.length,4);
    assert.ok(pieces.every(b=>b.sx===.6&&b.sy>0&&b.sz>0));
    const total=pieces.reduce((sum,b)=>sum+b.sy*b.sz,0);
    assert.ok(Math.abs(total-(8.7*11.4-p.width*(p.top-p.bottom)))<1e-8);
    assert.ok(p.localZ+p.width/2<0);
    assert.ok(p.localZ-p.width/2>-5.3);
    assert.equal(p.bottom,5);assert.equal(p.top,7.5);
  }
});
