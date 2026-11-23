// Whispering Root Hollow (story mode, chapter 5 for levels 12 to 16;
// 2026-11-23). Its trail left the Wolf Stones, crossed the west/north border
// where there is no gate, passed 36 m from the middle of Wolfstone Reach (a
// camp of level 35 dead), folded its switchbacks, and read 50-85 degrees in
// its last metres to the mouth. It now starts where the Cedar Spine Gate lands
// a traveller and keeps beyond that camp's reach all the way.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WOLFVEIL_EXPLORABLE_CAVES} from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {WOLFVEIL_CAVE_APPROACHES,WOLFVEIL_CAVE_APPROACH_MAX_GRADE}
  from '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {wolfveilAreaGates} from '../src/components/game3d/wolfveil/streaming/WolfveilAreaVeils.mjs';
import {wolfveilGateLanding} from '../src/components/game3d/wolfveil/streaming/WolfveilGateTravel.mjs';
import {wolfveilAreaAtWorld} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {WOLFVEIL_ZOMBIE_CAMPS,planWolfveilZombieCamps}
  from '../src/components/game3d/wolfveil/WolfveilZombieCamps.mjs';
import {ENEMY_INTELLIGENCE_PROFILES} from '../src/components/game3d/ai/EnemyCombatIntelligence.mjs';
import {WOLFVEIL_HOSTILE_ZONES} from '../src/components/game3d/wolfveil/WolfveilEnemySpawns.mjs';

const W=70; // local -> world z
const cave=WOLFVEIL_EXPLORABLE_CAVES.find(c=>c.id==='whispering_root_hollow');
const trail=WOLFVEIL_CAVE_APPROACHES.find(a=>a.caveId===cave.id).points;
const along=(step=1)=>{
  const out=[];
  for(let i=1;i<trail.length;i++){
    const a=trail[i-1],b=trail[i],len=Math.hypot(b.x-a.x,b.z-a.z);
    for(let s=0;s<=len;s+=step){const t=len?s/len:0;out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t,last:b.kind==='threshold'});}
  }
  return out;
};

test('the trail starts where the Cedar Spine Gate lands a traveller, and stays in the north',()=>{
  const gate=wolfveilAreaGates().find(g=>g.id==='west_north_hunters_loop_west');
  const landing=wolfveilGateLanding(gate,'north');
  assert.ok(Math.hypot(trail[0].x-landing.x,trail[0].z-landing.z)<.5,'junction at the landing');
  for(const p of along())assert.equal(wolfveilAreaAtWorld({x:p.x,z:p.z+W}),'north',`${p.x.toFixed(1)},${p.z.toFixed(1)}`);
});

test('every metre of it is beyond the reach of Wolfstone Reach (level 35)',()=>{
  const camp=WOLFVEIL_ZOMBIE_CAMPS.find(c=>c.id==='wolfstone_reach');
  // A dead one notices a player within its aggro range, and chases only while
  // within its leash of its own spawn point.
  const homes=planWolfveilZombieCamps().filter(z=>z.campId===camp.id);
  const farthestHome=Math.max(...homes.map(h=>Math.hypot(h.x-camp.x,h.z-camp.z)));
  const profiles=Object.values(ENEMY_INTELLIGENCE_PROFILES);
  const reach=farthestHome+Math.max(...profiles.map(p=>p.leashRange))+Math.max(...profiles.map(p=>p.aggroRange));
  for(const p of along()){
    const d=Math.hypot(p.x-camp.x,p.z-camp.z);
    assert.ok(d>reach,`${p.x.toFixed(1)},${p.z.toFixed(1)} is ${d.toFixed(1)} m from the camp; its reach is ${reach.toFixed(1)} m`);
  }
});

test('a built grade, each point on its own bench, no legs folded, and the last 10 m walkable',()=>{
  for(let i=1;i<trail.length;i++){
    const a=trail[i-1],b=trail[i],d=Math.hypot(b.x-a.x,b.z-a.z);
    if(d>.01)assert.ok(Math.abs(b.y-a.y)/d<=WOLFVEIL_CAVE_APPROACH_MAX_GRADE+.02,`grade at ${i}`);
  }
  const slope=(x,z)=>Math.hypot(wolfveilHeight(x+.5,z)-wolfveilHeight(x-.5,z),wolfveilHeight(x,z+.5)-wolfveilHeight(x,z-.5));
  for(const p of trail){
    if(p.kind==='threshold')continue;
    assert.ok(Math.abs(wolfveilHeight(p.x,p.z)-p.y)<.05,`on its bench at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    assert.ok(slope(p.x,p.z)<.35,`${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  }
  // The story measured 50 to 61 degrees here: the last 10 m before the mouth.
  for(const p of along(.5))if(Math.hypot(p.x-cave.mouth[0],p.z-cave.mouth[1])<=10.5)
    assert.ok(slope(p.x,p.z)<.35,`near the mouth at ${p.x.toFixed(1)},${p.z.toFixed(1)}: ${(Math.atan(slope(p.x,p.z))*180/Math.PI).toFixed(0)} degrees`);
  for(let i=1;i<trail.length;i++)for(let j=i+2;j<trail.length;j++){
    const a=trail[i-1],b=trail[i],c=trail[j-1],e=trail[j];
    for(let s=0;s<=10;s++){
      const t=s/10,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
      const dx=e.x-c.x,dz=e.z-c.z,l2=dx*dx+dz*dz,u=l2>1e-9?Math.max(0,Math.min(1,((x-c.x)*dx+(z-c.z)*dz)/l2)):0;
      const gap=Math.hypot(x-c.x-dx*u,z-c.z-dz*u),dy=Math.abs(y-(c.y+(e.y-c.y)*u));
      assert.ok(gap>=6||dy<=1.5,`legs ${i} and ${j}: ${gap.toFixed(1)} m apart, ${dy.toFixed(1)} m in height`);
    }
  }
});

test('the Wolf Stones keep all their spawns on their own (west) side of the border',()=>{
  const zone=WOLFVEIL_HOSTILE_ZONES.find(z=>z.id==='wolfveil_wolfstone_outskirts');
  for(const [x,z] of zone.locations)assert.equal(wolfveilAreaAtWorld({x,z:z+W}),'west',`${x},${z}`);
});
