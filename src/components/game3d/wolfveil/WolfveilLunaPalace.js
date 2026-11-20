import * as THREE from 'three';
import { buildLakesideManorWorld, canWalkManor, getLunaManorConstructionStage } from '../../dashboard/lakesideManor/buildLakesideManor.js';
import { createWolfveilPalaceTraversal } from './WolfveilPalaceTraversal.mjs';
import { wolfveilHeight, wolfveilNaturalHeight } from './WolfveilLayout.js';
import { palaceRootY } from './WolfveilPalaceGround.mjs';
import { planWolfveilPalaceDressing } from './WolfveilPalaceDressing.mjs';
import { WOLFVEIL_PALACE,WOLFVEIL_PALACE_APPROACH } from './WolfveilPalaceLayout.mjs';

/**
 * Reuses Luna's ACTUAL elevated mansion architecture and materials. Its
 * 500m lakes/grass/terrain are explicitly excluded by architectureOnly.
 * A single palace is authored here; the original residential assets are not
 * installed, and this work does not resize or replace the valley terrain.
 */
function fallbackPalaceScaffold(){
  // The previous emergency scaffold created a 56m-wide opaque slate-blue
  // slab/roof, tan box walls and dark support posts. In live Game 3D these
  // looked like giant floating platforms on top of the natural hillside.
  // If the real Luna mansion fails to initialize, NEVER replace its artwork
  // with these placeholder meshes. Leave Wolfveil's original walkable
  // terrain visible while reporting the missing source in the scene status.
  const group=new THREE.Group();
  group.name='SWV_Palace_Luna_Source_Unavailable_Empty';
  group.userData={
    sourceStatus:'fallback_only',noPlaceholderGeometry:true,
    decorativeOnly:true,nonCollider:true,
  };
  return {group,dispose(){}};
}
export function addWolfveilLunaPalace(world,{compactPathLights=false}={}){
  let luna=null,architecture=null,sourceStatus='luna_exact',loadFailureStage=null;
  try{
    luna=buildLakesideManorWorld({safeGraphics:true});
    // Do not require an architectureOnly branch in the shared Luna Dashboard
    // builder: extract its original authored house after its own normal build.
    // Non-palace source yard stays outside the active Game 3D scene.
    architecture=luna.root.getObjectByName('LunaManorElevatedArchitecture');
    if(!architecture?.isGroup||architecture.name!=='LunaManorElevatedArchitecture')
      throw Error('Luna source mansion architecture is unavailable');
  }catch(error){
    try{luna?.dispose?.();}catch{/* best-effort cleanup */}
    loadFailureStage=getLunaManorConstructionStage();
    console.error('Wolfveil cannot instantiate Luna palace; no temporary platforms will be rendered. Source failed at '+loadFailureStage+':',error);
    luna=fallbackPalaceScaffold();
    architecture=luna.group;
    sourceStatus='fallback_source_unavailable';
  }
  // Live Wolfveil world root applies the standard +70m Z offset.
  const p=WOLFVEIL_PALACE;
  // Keep the real Luna root at its original natural-center datum. The shared
  // heightfield now grades soil UP to the whole foundation, rather than moving
  // a floating building or overlaying an unwalkable fake floor.
  const baseY=palaceRootY(wolfveilNaturalHeight(p.x,p.z));
  const root=new THREE.Group();
  root.name='SWV_Luna_Source_Manor_Palace';
  root.userData={source:sourceStatus==='luna_exact'?'LunaManorElevatedArchitecture':'fallback_source_unavailable',role:'palace',
    authoredModel:sourceStatus==='luna_exact',visualOnly:true,localX:p.x,localZ:p.z,collisionAuthority:false};
  root.position.set(p.x,baseY,p.z);
  root.rotation.y=Math.PI; // face the town below the northern hillside
  root.add(architecture);
  world.group.add(root);
  // Wolfveil adds +70m to this same root's scene transform. Reuse the actual
  // Luna collider array and its dynamic front/sliding/attic door state.
  const traversal=sourceStatus==='luna_exact'
    ?createWolfveilPalaceTraversal({
      luna,centerX:p.x,centerY:baseY,centerZ:p.z+70,
      canWalk:canWalkManor,
    })
    :null;
  // The actual Luna mansion's 53m facade/floors/roof are reused intact.
  const yAt=(x,z)=>wolfveilHeight(x,z);
  // The analytical heightfield grades a continuous, PHYSICAL approach from
  // town to the first real Luna front tread. Each stone base is embedded
  // below the lowest nearby ground sample; no floating slabs at the edges.
  const approach=WOLFVEIL_PALACE_APPROACH;
  const treadDepth=(approach.toZ-approach.fromZ)/approach.stairs;
  // Instanced stone boxes look solid but were missing from player-foot rays.
  // Keep one invisible, exact-height top per tread in the shared walkable set:
  // never raycast all decorative basalt walls and fences as player floors.
  const treadMaterial=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
  world.ownedMaterials.push(treadMaterial);
  const approachTreadSurfaces=[],approachTreadTops=[];
  for(let i=0;i<approach.stairs;i++){
    const z0=approach.fromZ+i*treadDepth;
    const z1=z0+treadDepth;
    const z=(z0+z1)/2;
    const half=approach.width/2;
    const elevations=[
      yAt(approach.x-half,z0),yAt(approach.x+half,z0),
      yAt(approach.x-half,z1),yAt(approach.x+half,z1),
      yAt(approach.x,z),
    ];
    // Bury the underside just into the shared ground and keep the walkable
    // stone lip close to its true elevation. Never create tall floating risers.
    const bottom=Math.min(...elevations)-.045;
    const top=Math.max(...elevations)+.035;
    world.box(i%6===0?'granite':'basalt',approach.x,
      (bottom+top)/2,z,approach.width,top-bottom,treadDepth+.025);
    const contact=new THREE.Mesh(new THREE.PlaneGeometry(approach.width,treadDepth+.018),treadMaterial);
    contact.rotation.x=-Math.PI/2;
    contact.position.set(approach.x,top+.004,z);
    contact.name='SWV_Palace_Physical_Approach_Tread_'+i;
    contact.userData={walkable:true,collider:'step-top',stepIndex:i};
    world.mesh(contact);
    approachTreadSurfaces.push(contact);
    approachTreadTops.push(top+.004);
  }
  // Character feet, mounts and click-to-move now hit the tops of the actual
  // stones; no new broad invisible floor is placed underneath the staircase.
  (world.walkableSurfaces??=[]).push(...approachTreadSurfaces);
  // Second pass: irregular, individually rotated natural stone shapes
  // replace the repeated box-shaped stair borders. All are instanced and
  // gently embedded into the SAME graded terrain; no collision authority.
  const dressing=planWolfveilPalaceDressing(yAt);
  const rockGeometry=new THREE.DodecahedronGeometry(1,1);
  const rockPosition=rockGeometry.getAttribute('position');
  for(let j=0;j<rockPosition.count;j++){
    const vx=rockPosition.getX(j),vy=rockPosition.getY(j),vz=rockPosition.getZ(j);
    const weathering=.91+.075*Math.sin(vx*13.7+vy*8.1+vz*11.4);
    rockPosition.setXYZ(j,vx*weathering,vy*weathering,vz*weathering);
  }
  rockGeometry.computeVertexNormals();
  const rockMaterial=new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.94,metalness:0,flatShading:true,
  });
  world.ownedMaterials.push(rockMaterial);
  const shoulderRocks=new THREE.InstancedMesh(
    rockGeometry,rockMaterial,dressing.rocks.length,
  );
  const rockTransform=new THREE.Object3D();
  for(let i=0;i<dressing.rocks.length;i++){
    const stone=dressing.rocks[i];
    rockTransform.position.set(stone.x,stone.y,stone.z);
    rockTransform.rotation.set(stone.pitch,stone.yaw,0);
    rockTransform.scale.set(stone.scaleX,stone.scaleY,stone.scaleZ);
    rockTransform.updateMatrix();
    shoulderRocks.setMatrixAt(i,rockTransform.matrix);
    shoulderRocks.setColorAt(i,new THREE.Color(stone.color));
  }
  shoulderRocks.instanceMatrix.needsUpdate=true;
  if(shoulderRocks.instanceColor)shoulderRocks.instanceColor.needsUpdate=true;
  shoulderRocks.name='SWV_Palace_TerrainRooted_WeatheredShoulderStones';
  shoulderRocks.castShadow=true;
  shoulderRocks.receiveShadow=true;
  shoulderRocks.frustumCulled=false;
  world.mesh(shoulderRocks);

  // Game 3D now keeps only two hovering lights at the initial public path.
  // Suppress all eight old palace approach poles/stone bases/head fixtures
  // in that version; keep the original plan for Game 1 and other renderers.
  if(!compactPathLights)for(const lamp of dressing.lanterns){
    const {x,y,z}=lamp;
    world.box('granite',x,y+.25,z,.96,.5,.90);
    world.box('darkCedar',x,y+1.17,z,.17,1.70,.17);
    world.box('lantern',x,y+1.89,z,.58,.64,.58);
    world.box('cedar',x,y+2.27,z,.96,.15,.96);
    world.box('darkCedar',x,y+2.41,z,.67,.13,.67);
  }
  // Do NOT lay the former 19 stone court boxes over Luna's seven original
  // exterior stairs (and doorway); their visible surfaces are reused intact.
  // Grading and the exact stair-to-approach edge provide the seamless join.

  // No isolated corner pillars: the existing Luna foundation now rests in a
  // single smooth physical terrace at all four walls and at the front steps.
  const halfW=p.width/2+5,halfD=p.depth/2+5;
  // Stone retaining lip and waist-high fence around the palace court.
  // Keep a 7m center gap on the SOUTH side (the stair connection).
  for(const side of [-1,1]){
    const x=side*halfW;
    for(let z=p.z-halfD;z<=p.z+halfD;z+=3.4){
      const y=yAt(x,z);
      world.box('basalt',x,y+.28,z,1.2,.7,3.5);
      world.box('cedar',x,y+1.35,z,.23,2.1,.23);
    }
  }
  for(const frontBack of [-1,1]){
    const z=p.z+frontBack*halfD;
    for(let x=-halfW;x<=halfW;x+=3.4){
      if(frontBack===-1&&Math.abs(x)<4.4)continue; // opened stair approach
      const y=yAt(x,z);
      world.box('basalt',x,y+.28,z,3.5,.7,1.2);
      world.box('cedar',x,y+1.35,z,.24,2.1,.24);
    }
  }

  // A continuous opaque hillside surface directly under the town plaza
  // addresses the exposed neon-orange "see through ground" gap between pavers.
  const samples=40,verts=[],indices=[],colors=[];
  const groundColor=new THREE.Color(0x6d6453);
  for(let zi=0;zi<=samples;zi++)for(let xi=0;xi<=samples;xi++){
    const x=-22+44*xi/samples,z=-70-22+44*zi/samples;
    verts.push(x,yAt(x,z)+.017,z);
    colors.push(groundColor.r,groundColor.g,groundColor.b);
    if(zi<samples&&xi<samples){
      const a=zi*(samples+1)+xi,b=a+samples+1;
      indices.push(a,b,a+1,b,b+1,a+1);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices);geo.computeVertexNormals();
  const opaque=new THREE.MeshStandardMaterial({
    vertexColors:true,side:THREE.DoubleSide,transparent:false,opacity:1,
    depthWrite:true,roughness:1,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,
  });
  world.ownedMaterials.push(opaque);
  const substrate=new THREE.Mesh(geo,opaque);
  substrate.name='SWV_Solid_Opaque_Town_Ground_Sealing';
  substrate.userData={visualOnly:true,notWalkable:true,nonCollider:true};
  substrate.raycast=()=>{};
  world.mesh(substrate);
  const palace={
    id:p.id,kind:'palace',x:p.x,z:p.z,w:p.width,d:p.depth,
    entrance:[p.x,p.z-p.depth/2-1.2],Y:baseY,
    source:sourceStatus==='luna_exact'?'LunaManorElevatedArchitecture':'fallback_source_unavailable',
  };
  return {
    palace,root,substrate,sourceStatus,loadFailureStage,sourceColliders:luna.colliders?.length||0,
    navigationEnabled:!!traversal,
    approachTreadCount:approachTreadSurfaces.length,
    resolveApproachCollision(position,previous,radius=.62){
      if(!position||!previous||
         ![position.x,position.z,previous.y,radius].every(Number.isFinite))return false;
      const z=position.z-70;
      if(z<approach.fromZ||z>=approach.toZ||
         Math.abs(position.x-approach.x)>approach.width/2+radius)return false;
      const index=Math.max(0,Math.min(approachTreadTops.length-1,
        Math.floor((z-approach.fromZ)/treadDepth)));
      // A player may climb a real riser, not tunnel sideways through a tall
      // stone face or skip several risers in one long, low-frame-rate stride.
      if(approachTreadTops[index]-previous.y>.48){
        position.x=previous.x;position.z=previous.z;
        return true;
      }
      return false;
    },
    resolvePlayerMovement(position,previous,radius=.62){
      return traversal?.resolveMovement(position,previous,radius)??false;
    },
    playerGroundY(position){return traversal?.playerGroundY(position)??null;},
    interact(position){return traversal?.interact(position)??null;},
    update(dt){traversal?.update(dt);},
    resetNavigation(){traversal?.reset();},
    // Luna owns textures/geometry, including its source roof/facade system.
    dispose(){root.parent?.remove(root);luna.dispose();},
  };
}
