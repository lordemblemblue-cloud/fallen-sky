/* global URL */
// Classic Wolfveil landscape design (2026-11-16): minimap design, sculpted
// ranges, fighting grounds vs mob areas, road beds, riverbank, water, grass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  wolfveilHeight,wolfveilDistanceToRiver,wolfveilLandscapeLiftAt,WOLFVEIL_RIVER,WOLFVEIL_ROUTES,
  WOLFVEIL_SITES,
} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {
  WOLFVEIL_MOB_AREAS,WOLFVEIL_FIGHTING_GROUNDS,WOLFVEIL_FRONTIER_TRAILS,WOLFVEIL_MOUNTAIN_RANGES,
  wolfveilLandscapeSurface,wolfveilLandscapeZoneAt,wolfveilLandscapeAllowsTallGrass,
  wolfveilFrontierTrailClearance,
} from '../src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs';
import {WOLFVEIL_HOSTILE_ZONES} from '../src/components/game3d/wolfveil/WolfveilEnemySpawns.mjs';
import {WOLFVEIL_ZOMBIE_CAMPS,planWolfveilZombieCamps} from '../src/components/game3d/wolfveil/WolfveilZombieCamps.mjs';
import {meadowGroundHeight} from '../src/components/game3d/wolfveil/WolfveilMeadowField.mjs';
import {
  WOLFVEIL_MAP_ROADS,WOLFVEIL_MAP_MOB_AREAS,WOLFVEIL_MAP_FIGHTING_GROUNDS,WOLFVEIL_MAP_WORLD_BOUNDS,
  WOLFVEIL_MAP_UNDERLAY,wolfveilMapZoneAt,
} from '../src/components/game3d/wolfveil/WolfveilMapDesign.mjs';
import {planWolfveilLandscapeMarkers} from '../src/components/game3d/wolfveil/WolfveilLandscapeMarkers.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

// Heights of every authored anchor on unmodified main (eee8147), 4 decimals.
const MAIN_ANCHORS={market:[0,-70,22.6562],southGate:[0,-225,0.3],sanctuary:[4,220,75.7672],
  palace:[0,115,69.2149],training:[-165,88,65.8897],caveJade:[-216,76,63.4604],
  caveRoot:[-312,148,77.4635],caveCistern:[-82,312,84.0036],caveCrystal:[122,198,69.6726],
  caveHub:[-138,196,78.0027],hotSpring:[-105,330,89.0373],vortexLake:[205,320,77.5],
  waterfall:[142,179,37.5008],waterfallCave:[163,155,68.9066],lunarGate:[171,152,69.5976],
  astralGate:[197,154,83.8978],bridgeMarketW:[63,-98,22.6562],bridgeMarketE:[134,-98,15.2594],
  bridgeTimberW:[82,35,50.3487],bridgeTimberE:[146,35,48.0096],bridgeRopeW:[87,205,76.0284],
  bridgeRopeE:[173,205,78.4678],spawn:[-7,-62,22.6562]};

test('every authored anchor (town, gate, palace, caves, gates, lake, bridges) keeps its exact height',()=>{
  for(const [name,[x,z,h]] of Object.entries(MAIN_ANCHORS))
    assert.ok(Math.abs(wolfveilHeight(x,z)-h)<.001,name+' moved: '+wolfveilHeight(x,z)+' vs '+h);
});

test('mob areas are the authoritative encounter sites, not invented ones',()=>{
  for(const zone of WOLFVEIL_HOSTILE_ZONES){
    const area=WOLFVEIL_MOB_AREAS.find(a=>a.id===zone.id);
    assert.ok(area,'missing hostile zone '+zone.id);
    assert.deepEqual([area.x,area.z,area.radius],[...zone.sourceCenter,zone.radius]);
    assert.deepEqual(area.levels,zone.levels);
  }
  for(const camp of WOLFVEIL_ZOMBIE_CAMPS){
    const area=WOLFVEIL_MOB_AREAS.find(a=>a.id===camp.id);
    assert.ok(area,'missing camp '+camp.id);
    assert.deepEqual([area.x,area.z,area.radius,area.levels[0]],[camp.x,camp.z,camp.radius,camp.level]);
  }
  const quarry=WOLFVEIL_MOB_AREAS.find(a=>a.kind==='boss');
  assert.deepEqual([quarry.x,quarry.z],[WOLFVEIL_SITES.quarry.x,WOLFVEIL_SITES.quarry.z]);
  assert.equal(WOLFVEIL_MOB_AREAS.length,WOLFVEIL_HOSTILE_ZONES.length+WOLFVEIL_ZOMBIE_CAMPS.length+1);
});

test('camp hollows keep every spawn on walkable ground (grounding rule: <=1.8 m per metre)',()=>{
  const offset=70,check=(x,z,label)=>{
    const y=wolfveilHeight(x,z);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])
      assert.ok(Math.abs(wolfveilHeight(x+dx,z+dz)-y)<=1.8,label+' too steep at '+x+','+z);
  };
  for(const zone of WOLFVEIL_HOSTILE_ZONES)for(const [x,z] of zone.locations)check(x,z,zone.id);
  for(const spawn of planWolfveilZombieCamps({viewerOffsetZ:offset}))
    check(spawn.home?.[0]??spawn.x,(spawn.home?.[2]??spawn.z)-offset,'zombie camp');
});

test('mountain ranges ring the playable valley and continue past the edge without a seam',()=>{
  // Boundary heights rise well above the valley floor away from trail passes.
  for(const [x,z] of [[-540,-300],[-540,0],[-540,250],[540,-150],[540,100],[540,350],[-300,540],[-120,540],[200,540],[400,540]])
    assert.ok(wolfveilLandscapeLiftAt(x,z)>45,'no range at '+x+','+z+': '+wolfveilLandscapeLiftAt(x,z));
  // Ranges are not lumps: crests are sharp (lift falls quickly across the spine).
  const west=WOLFVEIL_MOUNTAIN_RANGES.find(r=>r.id==='cedar_spine');
  assert.ok(west.spine.length>=6);
  // The streamed meadow continues the same surface across the 550 m edge.
  for(const [a,b] of [[[0,549.9],[0,550.1]],[[-549.9,40],[-550.1,40]],[[549.9,-120],[550.1,-120]],[[300,549.9],[300,550.1]]])
    assert.ok(Math.abs(meadowGroundHeight(...a)-meadowGroundHeight(...b))<1,'edge seam at '+a);
  // The far snow skyline exists beyond the north boundary.
  assert.ok(meadowGroundHeight(-150,812)>300);
});

test('river corridor, banks and outlet are untouched by the ranges',()=>{
  const pts=WOLFVEIL_RIVER.points;
  for(let i=0;i<pts.length-1;i++)for(let t=0;t<=1;t+=.25){
    const x=pts[i][0]+(pts[i+1][0]-pts[i][0])*t,z=pts[i][1]+(pts[i+1][1]-pts[i][1])*t;
    for(const off of [0,12,24])assert.equal(wolfveilLandscapeLiftAt(x+off,z),0);
  }
  // Riverbank palette: grass to the water with dirt patches and rock spots.
  let dirt=0,rock=0,grass=0,n=0;
  for(let i=0;i<pts.length-1;i++)for(let t=0;t<1;t+=.05){
    const x=pts[i][0]+(pts[i+1][0]-pts[i][0])*t+WOLFVEIL_RIVER.width/2+2.2,z=pts[i][1]+(pts[i+1][1]-pts[i][1])*t;
    const s=wolfveilLandscapeSurface(x,z,wolfveilHeight(x,z),.1,{riverDistance:wolfveilDistanceToRiver(x,z)});
    n++;if(s.dirt>.4)dirt++;if(s.rock>.4)rock++;if(s.grass>.6)grass++;
  }
  assert.ok(grass/n>.4,'bank mostly grass');assert.ok(dirt>0,'dirt patches');assert.ok(rock>0,'rock spots');
});

test('open fighting grounds are level, open and far from every mob area',()=>{
  for(const f of WOLFVEIL_FIGHTING_GROUNDS){
    const c=wolfveilHeight(f.x,f.z);
    let worst=0;
    for(let a=0;a<12;a++){
      const x=f.x+Math.cos(a/12*Math.PI*2)*f.radius*.75,z=f.z+Math.sin(a/12*Math.PI*2)*f.radius*.75;
      worst=Math.max(worst,Math.abs(wolfveilHeight(x,z)-c)/(f.radius*.75));
    }
    assert.ok(worst<.2,f.id+' is not level enough: grade '+worst.toFixed(3));
    for(const m of WOLFVEIL_MOB_AREAS)
      assert.ok(Math.hypot(m.x-f.x,m.z-f.z)>f.radius+m.radius+40,f.id+' too close to '+m.id);
    assert.equal(wolfveilLandscapeZoneAt(f.x,f.z).kind,'fighting');
    assert.equal(wolfveilLandscapeAllowsTallGrass(f.x,f.z),false);
  }
  for(const m of WOLFVEIL_MOB_AREAS)assert.equal(wolfveilLandscapeZoneAt(m.x,m.z).kind,'mob');
});

test('trails are graded road beds: level across the tread on open ground',()=>{
  let samples=0;
  for(const route of [...WOLFVEIL_ROUTES,...WOLFVEIL_FRONTIER_TRAILS]){
    for(let i=0;i<route.points.length-1;i++){
      const a=route.points[i],b=route.points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      for(let s=6;s<len-6;s+=23){
        const x=a[0]+dx*s/len,z=a[1]+dz*s/len,nx=-dz/len,nz=dx/len,h=route.width*.45;
        if(wolfveilDistanceToRiver(x,z)<45||Math.hypot(x,z+70)<110||Math.hypot(x,z-115)<80)continue;
        const across=Math.abs(wolfveilHeight(x+nx*h,z+nz*h)-wolfveilHeight(x-nx*h,z-nz*h));
        assert.ok(across<.75,route.id+' cross-slope '+across.toFixed(2)+' m at '+x.toFixed(0)+','+z.toFixed(0));
        samples++;
      }
    }
  }
  assert.ok(samples>60);
  // The Hunter's Loop visits every zombie camp.
  for(const camp of WOLFVEIL_ZOMBIE_CAMPS)
    assert.ok(wolfveilFrontierTrailClearance(camp.x,camp.z)<camp.radius+30,'loop misses '+camp.id);
});

test('minimap and world map draw the same design in Play coordinates',()=>{
  // worldMapData.js uses bundler-only extensionless imports: check its source.
  const mapData=read('src/components/game3d/hud/worldMapData.js');
  assert.ok(mapData.includes("wolfveil: Object.freeze({ name: 'Wolfveil Valley', ...WOLFVEIL_MAP_WORLD_BOUNDS })"));
  assert.ok(mapData.includes("if(region==='wolfveil')return wolfveilMapZoneAt("));
  assert.deepEqual(WOLFVEIL_MAP_WORLD_BOUNDS,{minX:-550,maxX:550,minZ:-480,maxZ:620});
  assert.ok(WOLFVEIL_MAP_ROADS.some(r=>r.id==='hunters_loop_north'&&r.kind==='frontier'));
  assert.equal(WOLFVEIL_MAP_MOB_AREAS.length,WOLFVEIL_MOB_AREAS.length);
  assert.equal(WOLFVEIL_MAP_FIGHTING_GROUNDS[0].z,WOLFVEIL_FIGHTING_GROUNDS[0].z+70);
  assert.equal(wolfveilMapZoneAt(-205,-30+70).name,'Moonlit Commons');
  assert.equal(wolfveilMapZoneAt(310,-260+70).name,'Scarred South');
  const hud=read('src/components/game3d/hud/JadeSoulHUD.jsx');
  assert.match(hud,/region==='wolfveil'\?<WolfveilMinimap \/>/);
  const overlay=read('src/components/game3d/hud/AXEWorldMapOverlay.jsx');
  assert.match(overlay,/<WolfveilWorldMapLayers/);
  // Underlay PNG is the rendered real terrain at the declared size.
  const png=readFileSync(new URL('../public'+WOLFVEIL_MAP_UNDERLAY.url,import.meta.url));
  assert.equal(png.toString('ascii',1,4),'PNG');
  assert.equal(png.readUInt32BE(16),WOLFVEIL_MAP_UNDERLAY.pixels);
  assert.equal(png.readUInt32BE(20),WOLFVEIL_MAP_UNDERLAY.pixels);
});

test('river water is a flow-mapped natural surface, not the evenly spaced crest train',()=>{
  const river=read('src/components/game3d/wolfveil/WolfveilSilverRiverMaterial.js');
  assert.match(river,/name:'Game3D_Wolfveil_SumiE_ImmersiveRiverWater'/);
  assert.doesNotMatch(river,/wigglyCurrentWave|WAVE_SPACING/);
  assert.match(river,/phaseA=fract\(uFlowTime\/FLOW_PERIOD\)/);
  assert.match(river,/alpha\*=smoothstep\(1\.,\.92,bankDist\)/); // feathered waterline
  for(const uniform of ['uFlowTime','uRain','uWet','uContactRipples','uContactTime'])
    assert.match(river,new RegExp(uniform));
  const contact=read('src/components/game3d/axe/world/Game3DWaterContact.js');
  assert.doesNotMatch(contact,/float current=sin\(/);
});

test('grass: natural meadow tufts on low-poly cards, flame sparks hidden',()=>{
  const mode=read('src/components/game3d/render/atomicUltraSumiMode.mjs');
  assert.match(mode,/blazeProfile:'meadow'/);
  const stream=read('src/components/game3d/render/BlazeGrassStream.mjs');
  assert.match(stream,/segments=6;/);
  const shaders=read('src/components/game3d/render/BlazeGrassShaders.mjs');
  assert.match(shaders,/void meadowBlade\(/);
  assert.match(shaders,/if\(uArtProfile>2\.5\)\{vLife=0\.;gl_Position=vec4\(0\.,0\.,2\.,1\.\);return;\}/);
  // GameWorld3D keeps tall streamed grass off trails, camps, fields and rock.
  assert.match(read('src/components/game3d/GameWorld3D.jsx'),/wolfveilLandscapeAllowsTallGrass\(x,z-70\)/);
});

test('wayfinding stones frame fields, mark the loop, gate camps and dot the riverbanks',()=>{
  const plan=planWolfveilLandscapeMarkers();
  const count=k=>plan.filter(p=>p.kind===k).length;
  assert.ok(count('standing')>=20);assert.ok(count('cairn')>=90);
  assert.equal(count('gate'),WOLFVEIL_MOB_AREAS.length*2);
  assert.ok(count('river')>=40);
  for(const p of plan.filter(p=>p.kind==='river'))
    assert.ok(wolfveilDistanceToRiver(p.x,p.z)>WOLFVEIL_RIVER.width/2,'river stone in the water');
});

test('sculpted ranges are continuous: no hidden cliffs where ranges, trails or camps meet',()=>{
  // A real step keeps its full height over a 0.125 m baseline; a steep but
  // continuous face does not. Scan the outer 160 m band (the ranges) and the
  // quarry/ravine surroundings. The waterfall drop is authored on main.
  const suspects=[];
  const probe=(x,z)=>{
    if(Math.hypot(x-142,z-170)<70)return;
    const coarse=Math.hypot(wolfveilHeight(x+.5,z)-wolfveilHeight(x-.5,z),wolfveilHeight(x,z+.5)-wolfveilHeight(x,z-.5));
    if(coarse<2.5)return;
    const fine=Math.hypot(wolfveilHeight(x+.0625,z)-wolfveilHeight(x-.0625,z),
      wolfveilHeight(x,z+.0625)-wolfveilHeight(x,z-.0625))/.125;
    if(fine>coarse*2.5&&fine>8)suspects.push([x,z,coarse.toFixed(2),fine.toFixed(2)]);
  };
  for(let x=-546;x<=546;x+=4)for(let z=-546;z<=546;z+=4){
    const edge=Math.min(546-Math.abs(x),546-Math.abs(z));
    const nearMob=WOLFVEIL_MOB_AREAS.some(m=>Math.hypot(x-m.x,z-m.z)<m.radius*1.9+80);
    if(edge<160||nearMob)probe(x,z);
  }
  assert.deepEqual(suspects,[]);
});
