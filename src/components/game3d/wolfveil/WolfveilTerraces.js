// Connected valley dressing — rock cliffs, stone terrace retainers, and
// warm village circulation. All geometry belongs to the same terrain axes.
import * as THREE from 'three';
import {
  WOLFVEIL_HOUSING_PLOTS,WOLFVEIL_ROUTES,WOLFVEIL_RIVER,
  WOLFVEIL_BRIDGES,
  WOLFVEIL_SITES,wolfveilHeight,wolfveilDistanceToRiver,
} from './WolfveilLayout.js';
import {mulberry32,material} from './WolfveilGeometry.js';
import {wolfveilIsSWQualityQuarter,wolfveilRetainSWDecoration} from './WolfveilSWQuarterQuality.mjs';
import {WOLFVEIL_PALACE,WOLFVEIL_PALACE_APPROACH} from './WolfveilPalaceLayout.mjs';
import {wolfveilRockOverlapsBridgeLane} from './WolfveilBridgeProfile.mjs';
import {planWolfveilFloatingEntryLights} from './WolfveilFloatingPathLights.mjs';
const TAU=Math.PI*2;
export function addWolfveilTerraces(world,{excludePalaceApproach=false,swQuarterQuality=false,compactPathLights=false}={}){
  const rnd=mulberry32(0x513af5);
  let rockPieces=0,retainingBlocks=0,lanterns=0,banners=0;
  let southwestLanternsRemoved=0;
  // River canyon carved in the terrain is clad with real coarse 3D blocks.
  // Rock fans are instanced, varied in scale/rotation, and follow the river
  // slope so north upper ledges are above their south counterparts.
  const specs=[];
  for(let i=1;i<WOLFVEIL_RIVER.points.length-1;i++){
    const [cx,cz,level]=WOLFVEIL_RIVER.points[i];
    if(cz>360||cz< -340)continue;
    for(const side of [-1,1]){
      for(let band=0;band<3;band++)for(let n=0;n<3;n++){
        const x=cx+side*(16+band*6)+(rnd()-.5)*6;
        const z=cz+(n-1)*9+(rnd()-.5)*10;
        const surface=wolfveilHeight(x,z);
        const edge=Math.max(surface,level+3);
        const size=2.6+band*.68+rnd()*2.4;
        specs.push({x,y:edge+(rnd()-.5)*size*.30,
          z,sx:size*1.3,sy:size*(.6+rnd()*.7),sz:size*(.7+rnd()*.4),
          rot:rnd()*TAU,rx:(rnd()-.5)*.23});
      }
    }
  }
  // These dodecahedra were allowed to cross bridge planks and even sit
  // above a landing. Remove ONLY decorative river-bank stones whose plan
  // footprint cuts through a bridge or its immediate entrance. Rock terrain,
  // gameplay collisions, riverbed geometry and all other gorge stones stay.
  const clearRocks=specs.filter(p=>
    !wolfveilRockOverlapsBridgeLane(p,WOLFVEIL_BRIDGES));
  const granite=new THREE.DodecahedronGeometry(1,1);
  const cliffmat=material(0x666d6b,.95,{flatShading:true});
  world.ownedMaterials.push(cliffmat);
  const instance=new THREE.InstancedMesh(granite,cliffmat,clearRocks.length);
  instance.name='SWV_Gorge_BasaltRockTerraceErosion';
  const dummy=new THREE.Object3D();
  clearRocks.forEach((p,i)=>{
    dummy.position.set(p.x,p.y,p.z);
    dummy.rotation.set(p.rx, p.rot,0);
    dummy.scale.set(p.sx,p.sy,p.sz);
    dummy.updateMatrix();instance.setMatrixAt(i,dummy.matrix);
  });
  instance.instanceMatrix.needsUpdate=true;instance.receiveShadow=true;
  instance.frustumCulled=false;
  // Gorge rocks occur along the eastern riverbank, outside the SW quality
  // quarter. Do not switch off their raycasting map-wide just because a
  // southwest decor flag is on. Rock gameplay/physics stay as they were.
  world.mesh(instance);rockPieces=clearRocks.length;
  // Player housing platform perimeters get actual structural block courses
  // instead of glowing editor rectangles. Ownership is NOT activated.
  // Retired housing plots no longer have raised stone retaining walls.
  for(const plot of []){
    const x=plot.x,z=plot.z,y=wolfveilHeight(x,z);
    const south=z-plot.d*.5,north=z+plot.d*.5;
    for(const edge of [south,north]){
      for(let t=-plot.w*.5;t<plot.w*.5;t+=1.4){
        const px=x+t;
        const ground=wolfveilHeight(px,edge);
        const rise=Math.max(1.2,Math.min(4.5,y+.7-ground));
        const blocks=Math.ceil(rise/.72);
        for(let k=0;k<blocks;k++){
          world.box((k%4===0)?'granite':'basalt',px+(k%2)*.12,
            ground+(k+.5)*rise/blocks,edge,1.35,rise/blocks-.025,.62);
          retainingBlocks++;
        }
      }
    }
  }
  // Game 3D: the original route generator placed repeated 3.2m-high
  // wooden poles and stone footings in/against the walking path. The user's
  // requested minimal style is TWO small floating lantern HEADS, on grass
  // near the entry. Game 1 uses its original public-route lantern layout.
  if(compactPathLights){
    for(const light of planWolfveilFloatingEntryLights()){
      const {x,y,z}=light;
      world.box('lantern',x,y,z,.53,.51,.53);
      // A short dark cap floats WITH the glowing head: NO pillar, shaft,
      // stone block, ground footing, collider or point-light allocation.
      world.box('darkCedar',x,y+.295,z,.71,.10,.71);
      lanterns++;
    }
  }else{
    // Light fixtures guide the actual public routes toward the market and
    // sanctuary while leaving residential garden edges largely quiet.
    const added=new Set();
    for(const route of WOLFVEIL_ROUTES.filter(r=>
        ['primary','residential','riverside'].includes(r.kind))){
      const points=route.points;
      for(let k=0;k<points.length-1;k++){
        const a=points[k],b=points[k+1],
          dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);
        for(let p=0;p<d;p+=14){
          const x=a[0]+dx*p/d+(route.kind==='primary'?4.9:3.5),
            z=a[1]+dz*p/d;
          // The live palace has its OWN symmetrical, outside-the-steps lamps.
          // Do not leave obsolete town-route posts embedded in stair shoulders.
          if(excludePalaceApproach &&
             route.id==='public_gate_market_sanctuary' &&
             z>=WOLFVEIL_PALACE_APPROACH.fromZ-2 &&
             z<=WOLFVEIL_PALACE.z+WOLFVEIL_PALACE.depth/2+1)continue;
          const key=Math.round(x/7)+':'+Math.round(z/7);
          if(added.has(key)||wolfveilDistanceToRiver(x,z)<16)continue;
          // Prevent lights from spawning inside the town's buildings and canals.
          if(Math.abs(x) < 70 && z > -150 && z < -5) continue;
          // Keep landmark/turn lights; halve repeat lamps in the southwest.
          // Each skipped lamp saves four unique box meshes/drawable objects.
          const landmark=WOLFVEIL_ROUTES.some(r=>r.points.some(pt=>
            Math.hypot(x-pt[0],z-pt[1])<14));
          if(swQuarterQuality&&wolfveilIsSWQualityQuarter(x,z)&&
             !landmark&&!wolfveilRetainSWDecoration({x,z},'stone')){
            southwestLanternsRemoved++;continue;
          }
          added.add(key);
          const h=wolfveilHeight(x,z);
          world.box('granite',x,h+.28,z,.68,.56,.68);
          world.box('cedar',x,h+1.75,z,.20,2.5,.20);
          world.box('darkCedar',x,h+3.05,z,.89,.15,.90);
          world.box('lantern',x,h+2.70,z,.54,.73,.55);
          lanterns++;
        }
      }
    }
  }
  // Wide indigo wolf-clan banners hang only at important civic points.
  const bannerSites=[
    [-13,-204], [13,-204],[-32,-77],[32,-77],
    [-25,15],[26,15],[-14,214],[14,214],[-161,80],[300,-207],
  ];
  for(const [x,z] of bannerSites){
    const y=wolfveilHeight(x,z);
    world.box('cedar',x,y+2.3,z,.18,4.6,.16);
    world.box('indigo',x+.65,y+3.30,z,1.18,1.8,.10);
    world.box('roofEdge',x+.65,y+4.22,z,1.4,.13,.12);
    world.box('spirit',x+.70,y+3.20,z+.075,.18,.55,.06);
    banners++;
  }
  return {rockPieces,retainingBlocks,lanterns,banners,
    southwestLanternsRemoved};
}