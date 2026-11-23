// The Sunken Inkstone Cistern (story mode, chapter 6; 2026-11-23). Its mouth
// stood at (-40, 548), 20 m beyond the 528 m edge, and its free switchbacks
// folded onto each other against that edge (50-79 degrees at their turns).
// The mouth now opens at (-40, 500) with its passage running to the same
// chamber, and the trail climbs the shelf west of the cliff band in level legs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WOLFVEIL_EXPLORABLE_CAVES} from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {WOLFVEIL_CAVE_APPROACHES,WOLFVEIL_CAVE_APPROACH_MAX_GRADE}
  from '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';
import {wolfveilHeight} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {insideWolfveilClientGround} from '../src/components/game3d/wolfveil/WolfveilTravelSafety.mjs';
import {wolfveilCaveRingReturn} from '../src/components/game3d/wolfveil/WolfveilCaveRingTravel.mjs';

const W=70; // local -> world z
const cave=WOLFVEIL_EXPLORABLE_CAVES.find(c=>c.id==='sunken_inkstone_cistern');
const trail=WOLFVEIL_CAVE_APPROACHES.find(a=>a.caveId===cave.id).points;
const standable=(x,z)=>insideWolfveilClientGround(x,z+W,.65);

test('the mouth, its terrace and the whole trail are inside the 528 m edge',()=>{
  assert.ok(standable(cave.mouth[0],cave.mouth[1]),'mouth');
  assert.ok(standable(cave.threshold[0],cave.threshold[2]),'threshold');
  for(const p of trail)assert.ok(standable(p.x,p.z),`trail point ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  // The mouth's ring is reachable all round, and the way out lands inside too.
  assert.ok(standable(cave.mouth[0],cave.mouth[1]+3.5),'behind the ring');
  const out=wolfveilCaveRingReturn(cave.id);
  assert.ok(insideWolfveilClientGround(out.x,out.z,.65),'the bench a player leaves the cave onto');
});

test('the cave behind the mouth is the same cave: chamber and floor unchanged',()=>{
  assert.ok(Math.hypot(cave.chamber.x+51.5646,cave.chamber.z-579.9728)<.05,'chamber where it was');
  assert.ok(Math.abs(cave.chamber.y-179.2964)<.01,'level-one floor unchanged');
  assert.ok(cave.levelOneAlong>=11&&cave.levelOneAlong<cave.chamber.along-cave.chamber.radius,'hall before the room');
});

test('the trail climbs at a built grade, every point on its own bench, no leg folded onto another',()=>{
  for(let i=1;i<trail.length;i++){
    const a=trail[i-1],b=trail[i],d=Math.hypot(b.x-a.x,b.z-a.z);
    if(d>.01)assert.ok(Math.abs(b.y-a.y)/d<=WOLFVEIL_CAVE_APPROACH_MAX_GRADE+.02,`grade at ${i}`);
  }
  for(const p of trail){
    if(p.kind==='threshold')continue;
    assert.ok(Math.abs(wolfveilHeight(p.x,p.z)-p.y)<.05,`on its bench at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    const slope=Math.hypot(wolfveilHeight(p.x+.5,p.z)-wolfveilHeight(p.x-.5,p.z),
      wolfveilHeight(p.x,p.z+.5)-wolfveilHeight(p.x,p.z-.5));
    assert.ok(slope<.35,`ground at ${p.x.toFixed(1)},${p.z.toFixed(1)} is ${(Math.atan(slope)*180/Math.PI).toFixed(0)} degrees`);
  }
  // Two legs that pass within 6 m of each other are at the same height there.
  const closest=(a,b,c,d)=>{
    let best={d:Infinity,dy:0};
    for(let s=0;s<=10;s++){
      const t=s/10,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
      const dx=d.x-c.x,dz=d.z-c.z,l2=dx*dx+dz*dz;
      const u=l2>1e-9?Math.max(0,Math.min(1,((x-c.x)*dx+(z-c.z)*dz)/l2)):0;
      const gap=Math.hypot(x-c.x-dx*u,z-c.z-dz*u);
      if(gap<best.d)best={d:gap,dy:Math.abs(y-(c.y+(d.y-c.y)*u))};
    }
    return best;
  };
  for(let i=1;i<trail.length;i++)for(let j=i+2;j<trail.length;j++){
    const f=closest(trail[i-1],trail[i],trail[j-1],trail[j]);
    assert.ok(f.d>=6||f.dy<=1.5,`legs ${i} and ${j} are ${f.d.toFixed(1)} m apart, ${f.dy.toFixed(1)} m apart in height`);
  }
});

test('chapter 6 keeps its ground: the Wolf-Ear Vigil and the first bend',()=>{
  assert.ok(Math.abs(wolfveilHeight(2,470)-118.856)<.01,'Wolf-Ear Vigil (2,470)');
  assert.ok(Math.abs(wolfveilHeight(-16,470)-123.644)<.01,'first bend (-16,470)');
});
