import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conduitAtmosphereBudget,createConduitAtmospherePlan,fanAngle,pulseSample,steamSample} from '../src/components/duelist/client/maps/conduitAtmosphere.mjs';
const cfg={yT1Bldg:.65,yT0:-5,buildings:[-3*Math.PI/4,3*Math.PI/4,-Math.PI/4,Math.PI/4].map((angle,i)=>({id:String(i),angle}))};
test('quality budgets are bounded, low disables steam and unknown quality is safe',()=>{
  assert.deepEqual(conduitAtmosphereBudget('low'),{fans:8,pulses:8,steam:0,hz:12});
  assert.deepEqual(conduitAtmosphereBudget('medium'),{fans:8,pulses:12,steam:16,hz:20});
  assert.deepEqual(conduitAtmosphereBudget('high'),{fans:8,pulses:16,steam:32,hz:30});
  assert.equal(conduitAtmosphereBudget('__proto__'),conduitAtmosphereBudget('medium'));
});
test('eight fan anchors stay high on existing rear walls and avoid side portals',()=>{
  const p=createConduitAtmospherePlan(cfg);
  assert.equal(p.fans.length,8);
  assert.equal(new Set(p.fans.map(f=>f.id)).size,8);
  for(const b of cfg.buildings)for(const f of p.fans.filter(f=>f.id.startsWith(b.id+'-'))){
    const c=Math.cos(b.angle),s=Math.sin(b.angle),dx=f.x-38*s,dz=f.z-38*c;
    const x=dx*c-dz*s,z=dx*s+dz*c;
    assert.ok(Math.abs(x-(f.tier==='upper'?6.6:6.8))<1e-8);
    assert.ok(Math.abs(z-(f.tier==='upper'?5.23:6.43))<1e-8);
    assert.ok(f.tier==='upper'?f.y+.565<9.35:f.y+.565<-.6);
    assert.notEqual(fanAngle(f,0),fanAngle(f,1));
  }
});
test('deterministic moving indicators and steam stay overhead at all quality tiers',()=>{
  const p=createConduitAtmospherePlan(cfg);
  for(const quality of ['low','medium','high']){
    const b=conduitAtmosphereBudget(quality);
    for(let i=0;i<b.pulses;i++)for(const t of [0,.5,1,100,86400]){
      const v=pulseSample(i,b.pulses,t);
      assert.ok(Math.abs(Math.hypot(v.x,v.z)-[42.5,4.2,5.85][i%3])<1e-7);
      assert.ok(v.y>16);assert.deepEqual(v,pulseSample(i,b.pulses,t));
    }
    for(let i=0;i<b.steam;i++)for(const t of [0,.5,1,100,86400]){
      const v=steamSample(i,p.emitters,t);
      assert.ok(v.y>=16.8&&v.y<18.9&&v.scale>=0&&v.scale<=.29+1e-7);
      assert.ok(Math.hypot(v.x,v.z)<6.1);
    }
  }
});
