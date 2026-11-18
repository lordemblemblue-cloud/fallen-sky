// Render the owner's large detached Canyon/Gorge module as a connected
// extension of Wolfveil's existing cave floor, not a separate showcase.
// All real walkable quads come from WolfveilModularCaveKit.mjs, the same
// footprint used by the wall collider and floor elevation sampling.
import * as THREE from 'three';
import {
  WOLFVEIL_MODULAR_CANYON as C,WOLFVEIL_MODULAR_JUNCTION as T,
  WOLFVEIL_MODULAR_TREASURE_ROOM as VAULT,
  WOLFVEIL_MODULAR_L_CORNER as L_TURN,
  WOLFVEIL_MODULAR_WAYFINDER_HUB as HUB,
  WOLFVEIL_MODULAR_SANCTUARY as SANCTUARY,
  WOLFVEIL_MODULAR_ECHO_GALLERY as ECHO,
  WOLFVEIL_MODULAR_SECRET_CACHE as CACHE,
  getWolfveilModularCanyonTileRects,isWolfveilModularCanyonBridge,
} from './WolfveilModularCaveKit.mjs';

const TAU=Math.PI*2;
export function appendWolfveilModularCaveVisuals({
  group,floorTris,shellTris,addProp,addBrazier,
  boxGeo,cylGeo,octaGeo,torusGeo,
  wallMat,floorMat,bronzeMat,timberMat,jadeCrystalMat,amethystCrystalMat,
}={}){
  if(!group?.add||!floorTris?.quad||!shellTris?.quad||
     typeof addProp!=='function')throw new Error('Cave visual builders missing');
  const stats={walkQuads:0,rockWallQuads:0,gorgeWallQuads:0,
    bridges:C.bridges.length,decorativeTreasureChests:0,
    canyonSize:[C.width,C.depth]};
  const tint=(x,z)=>((Math.floor(x/4)+Math.floor(z/4))%3===0
    ?[.52,.53,.49]:[.61,.59,.53]);

  for(const tile of getWolfveilModularCanyonTileRects(4)){
    const {minX:x0,maxX:x1,minZ:z0,maxZ:z1}=tile,y=C.y;
    floorTris.quad([x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0],
      tint(x0,z0),[[0,0],[0,1],[1,1],[1,0]]);
    stats.walkQuads++;
  }

  const wall=(x0,z0,x1,z1,y0,y1,color=[.47,.49,.50])=>{
    shellTris.quad([x0,y0,z0],[x1,y0,z1],[x1,y1,z1],[x0,y1,z0],
      color,[[0,0],[2,0],[2,2],[0,2]]);
    stats.rockWallQuads++;
  };
  // An open-feeling chamber with rock cliffs at the rim. The 2.5D Wolfveil
  // terrain ABOVE remains sealed; do not carve roof holes or add fake exits.
  const STEP=8,rockTop=C.y+19;
  for(let x=C.minX;x<C.maxX;x+=STEP){
    const x1=Math.min(x+STEP,C.maxX);
    const y0=C.y-0.45,y1=rockTop+Math.sin(x*.085)*2.4;
    wall(x,C.minZ,x1,C.minZ,y0,y1);
    wall(x,C.maxZ,x1,C.maxZ,y0,rockTop+Math.cos(x*.07)*2.4);
  }
  for(let z=C.minZ;z<C.maxZ;z+=STEP){
    const z1=Math.min(z+STEP,C.maxZ);
    // Keep the *actual* modular connector opening on the west edge.
    if(Math.abs((z+z1)/2-C.entrance.z)>8){
      wall(C.minX,z,C.minX,z1,C.y,rockTop+Math.sin(z*.1)*2.1);
    }
    // The eastern canyon mouth is the real route to the modular L-turn.
    if(Math.abs((z+z1)/2-C.arena.z)>8){
      wall(C.maxX,z,C.maxX,z1,C.y,rockTop+Math.cos(z*.09)*2.1);
    }
  }
  // The gorge has no top floor. Visible walls extend down to the water.
  const g=C.gorge;
  for(let z=g.minZ;z<g.maxZ;z+=4){
    const z1=Math.min(z+4,g.maxZ),mid=(z+z1)/2;
    if(isWolfveilModularCanyonBridge(mid))continue;
    for(const x of [g.minX,g.maxX]){
      shellTris.quad([x,C.y,z],[x,C.y,z1],
        [x,g.waterY-.9,z1],[x,g.waterY-.9,z],
        [.30,.35,.39],[[0,0],[1,0],[1,1],[0,1]]);
      stats.gorgeWallQuads++;
    }
  }

  const waterMaterial=new THREE.MeshStandardMaterial({
    name:'SWV_ModularCanyon_NonWalkableWater',
    color:0x197f93,roughness:.2,metalness:.1,transparent:true,opacity:.82,
    side:THREE.DoubleSide,depthWrite:false,
  });
  const waterGeometry=new THREE.PlaneGeometry(
    g.maxX-g.minX,g.maxZ-g.minZ,1,1);
  const water=new THREE.Mesh(waterGeometry,waterMaterial);
  water.name='SWV_ModularCanyon_GorgeWater_VISUAL_ONLY';
  water.rotation.x=-Math.PI/2;
  water.position.set((g.minX+g.maxX)/2,g.waterY,(g.minZ+g.maxZ)/2);
  water.raycast=()=>{}; // water cannot be mistaken for walkable cave floor
  group.add(water);

  // Three real floor bridges share the tile mesh and collision sampler.
  // Gold/stone markers sit off the treads, never across their center.
  for(const z of C.bridges){
    for(const x of [g.minX+2,g.maxX-2]){
      for(const side of [-1,1]){
        addProp(boxGeo,bronzeMat,x,C.y+.4,z+side*5.4,
          .42,.72,.42);
      }
    }
    if(addBrazier){
      for(const x of [g.minX-5,g.maxX+5]){
        addBrazier(x,C.y,z,0x4bdbe1,true);
      }
    }
  }

  // Broken megaliths communicate the size of the 180 x 140m interior.
  // Rocks and ornaments do not silently become gameplay colliders.
  for(let i=0;i<20;i++){
    const theta=i/20*TAU;
    const x=C.x+Math.cos(theta)*76,z=C.z+Math.sin(theta)*57;
    if(x<C.minX+3||x>C.maxX-3||z<C.minZ+3||z>C.maxZ-3)continue;
    const h=5+(i%5)*2.25;
    addProp(boxGeo,wallMat,x,C.y+h/2,z,1.9,h,1.9,0,theta,0);
    if(i%3===0)addProp(octaGeo,i%2?jadeCrystalMat:amethystCrystalMat,
      x,C.y+h+.8,z,1.2,1.7,1.2);
  }

  // Low circular boss-stage platform: static encounter destination only.
  // No boss spawned, XP granted or fake authority introduced.
  const arena=C.arena;
  addProp(cylGeo,floorMat,arena.x,C.y+.10,arena.z,
    arena.radius*1.92,.2,arena.radius*1.92);
  addProp(torusGeo,bronzeMat,arena.x,C.y+.24,arena.z,
    arena.radius-1.2,arena.radius-1.2,.5,Math.PI/2);
  for(let i=0;i<8;i++){
    const a=i/8*TAU,x=arena.x+Math.cos(a)*15,z=arena.z+Math.sin(a)*15;
    addProp(boxGeo,wallMat,x,C.y+1.65,z,1.2,3.3,1.2,0,a,0);
  }
  if(addBrazier){
    for(const [x,z] of [
      [arena.x-12,arena.z-12],[arena.x+12,arena.z+12]]){
      addBrazier(x,C.y,z,0xf6b66e,false);
    }
  }

  // Decorative module kit identity: T-junction and nearby vault chamber.
  // The canonical corridor and vault floors/walls are authored by CaveSystem.
  addProp(torusGeo,bronzeMat,T.x,T.y+.06,T.z,2.3,2.3,.22,Math.PI/2);
  for(const [x,z] of [[T.x-3.5,T.z],[T.x+3.5,T.z]]){
    addProp(boxGeo,wallMat,x,T.y+1.75,z,.65,3.5,.65);
  }
  for(const [dx,dz] of [[-3.3,-3.1],[3.3,-3.1],[-3.3,3.1],
    [3.3,3.1],[0,5.1]]){
    const x=VAULT.x+dx,z=VAULT.z+dz;
    addProp(boxGeo,timberMat,x,VAULT.y+.45,z,1.65,.9,1.12);
    addProp(boxGeo,bronzeMat,x,VAULT.y+1.02,z,1.73,.18,1.2);
    addProp(octaGeo,jadeCrystalMat,x,VAULT.y+1.2,z,.3,.38,.3);
    stats.decorativeTreasureChests++;
  }
  if(addBrazier){
    addBrazier(VAULT.x-4,VAULT.y,VAULT.z,0xf1be68,false);
  }

  // The L-turn gets a mitered two-leg floor mark, so the route reads before
  // the player reaches the corner.
  addProp(boxGeo,bronzeMat,L_TURN.x,L_TURN.y+.08,L_TURN.z,
    8.6,.12,.48,0,Math.PI/4,0);
  addProp(boxGeo,jadeCrystalMat,L_TURN.x+1.4,L_TURN.y+.12,L_TURN.z-1.4,
    4.2,.08,.18,0,Math.PI/4,0);

  // Four cardinal sockets around a central wayfinder star distinguish the hub
  // from the ordinary circular chambers.
  addProp(torusGeo,bronzeMat,HUB.x,HUB.y+.28,HUB.z,8.4,8.4,.32,Math.PI/2);
  addProp(torusGeo,jadeCrystalMat,HUB.x,HUB.y+.34,HUB.z,6.7,6.7,.16,Math.PI/2);
  addProp(octaGeo,jadeCrystalMat,HUB.x,HUB.y+1.2,HUB.z,1.25,2.1,1.25);
  for(const [dx,dz] of [[0,-13],[13,0],[0,13],[-13,0]]){
    const x=HUB.x+dx,z=HUB.z+dz;
    addProp(boxGeo,bronzeMat,x,HUB.y+.18,z,2.6,.28,2.6,0,Math.atan2(dx,dz),0);
    addProp(octaGeo,amethystCrystalMat,x,HUB.y+2.3,z,.52,1.05,.52);
  }
  if(addBrazier){
    for(const [dx,dz] of [[0,-10],[10,0],[0,10],[-10,0]]){
      addBrazier(HUB.x+dx,HUB.y,HUB.z+dz,0x9fe0d1,true);
    }
  }

  // A ringed relic sits inside the sanctuary. Jade inlay channels mark the
  // canal paths while leaving the shared floor sampler and collision intact.
  addProp(torusGeo,bronzeMat,SANCTUARY.x,SANCTUARY.y+.34,SANCTUARY.z,
    8.8,8.8,.38,Math.PI/2);
  addProp(torusGeo,amethystCrystalMat,SANCTUARY.x,SANCTUARY.y+.42,SANCTUARY.z,
    6.5,6.5,.15,Math.PI/2);
  addProp(octaGeo,jadeCrystalMat,SANCTUARY.x,SANCTUARY.y+1.55,SANCTUARY.z,
    1.0,2.5,1.0);
  for(const [dx,dz,w,d] of [
    [-13,0,9,.34],[13,0,9,.34],[0,-13,.34,9],[0,13,.34,9],
  ]){
    addProp(boxGeo,jadeCrystalMat,SANCTUARY.x+dx,SANCTUARY.y+.13,
      SANCTUARY.z+dz,w,.12,d);
  }
  for(const [dx,dz] of [[-16,-16],[16,-16],[-16,16],[16,16]]){
    addProp(boxGeo,wallMat,SANCTUARY.x+dx,SANCTUARY.y+3.3,
      SANCTUARY.z+dz,1.25,6.6,1.25);
    addProp(octaGeo,amethystCrystalMat,SANCTUARY.x+dx,
      SANCTUARY.y+7.1,SANCTUARY.z+dz,.8,1.5,.8);
  }
  if(addBrazier){
    addBrazier(SANCTUARY.x-8,SANCTUARY.y,SANCTUARY.z,0x66d4e8,true);
    addBrazier(SANCTUARY.x+8,SANCTUARY.y,SANCTUARY.z,0x66d4e8,true);
  }

  // Paired pillars make the return loop and sealed side reliquary legible.
  for(const z of [ECHO.z-5,ECHO.z+5]){
    addProp(boxGeo,wallMat,ECHO.x-7,ECHO.y+2.5,z,1.3,5,1.3);
    addProp(boxGeo,wallMat,ECHO.x+7,ECHO.y+2.5,z,1.3,5,1.3);
  }
  addProp(torusGeo,bronzeMat,ECHO.x,ECHO.y+.24,ECHO.z,5.8,5.8,.22,Math.PI/2);
  addProp(boxGeo,wallMat,CACHE.x,CACHE.y+3.1,CACHE.z+8,
    8.5,6.2,.8);
  addProp(torusGeo,amethystCrystalMat,CACHE.x,CACHE.y+3.2,CACHE.z+7.45,
    1.35,1.35,.18);
  for(const side of [-1,1]){
    addProp(octaGeo,jadeCrystalMat,CACHE.x+side*5,CACHE.y+2.3,
      CACHE.z+4,.7,1.5,.7);
  }
  return {stats,water,waterGeometry,waterMaterial};
}
