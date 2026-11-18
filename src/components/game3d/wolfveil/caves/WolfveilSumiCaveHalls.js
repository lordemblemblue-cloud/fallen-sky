// Builds the owner's sumi-e hallway along Wolfveil's cave tunnels
// (WolfveilSumiHallPlan.mjs) from the owner's own kit, then bakes the whole
// network into one mesh per material. Scenery only: the cave layout still
// decides where a player can walk.
import {createLightSumiCorridorKit,bakeSumiPiece} from './SumiCaveLightKit.js';
import {WOLFVEIL_SUMI_HALL as HALL,planWolfveilSumiHalls} from './WolfveilSumiHallPlan.mjs';

// The stretches of [from, to] that no doorway interrupts.
function between([from,to],openings){
  let stretches=[[from,to]];
  for(const opening of openings){
    const next=[];
    for(const [a,b] of stretches){
      if(b<=opening.min||a>=opening.max){next.push([a,b]);continue;}
      if(a<opening.min)next.push([a,opening.min]);
      if(b>opening.max)next.push([opening.max,b]);
    }
    stretches=next;
  }
  return stretches.filter(([a,b])=>b-a>.2);
}

/**
 * The hallway network as the kit builds it, piece by piece (not yet baked).
 * @param THREE the game's Three.js   @param kit a light kit (SumiCaveLightKit.js)
 */
export function assembleWolfveilSumiHalls({THREE,kit,plan=planWolfveilSumiHalls()}){
  const root=new THREE.Group();
  root.name='SWV_SumiHalls';
  plan.runs.forEach((run,index)=>{
    const hall=new THREE.Group();
    hall.name='SWV_SumiHall_'+run.id;
    // The tiles stand just proud of the cave's own stone floor.
    hall.position.set(run.middle[0],run.floorY+HALL.tileLift-HALL.tileTop,run.middle[1]);
    hall.rotation.y=run.yaw;
    const [from,to]=run.floor,centre=(from+to)/2;
    const floor=new THREE.Group();
    floor.position.z=centre;
    const curbs=wall=>between([from,to],wall.openings).map(([a,b])=>[a-centre,b-centre]);
    kit.populateStraightPathwaySegment(floor,{pathLength:to-from,pathWidth:HALL.pathWidth,
      leftCurbSegments:curbs(run.left),rightCurbSegments:curbs(run.right),includeSecretThreshold:false,seed:142+index*37});
    hall.add(floor);
    const wall=(side,line,seed)=>kit.populateArchitecturalBrickWall(hall,{axis:'z',fixedCoord:side*HALL.halfWidth,
      normalDir:-side,spanMin:line.span[0],spanMax:line.span[1],wallHeight:HALL.wallHeight,rows:HALL.rows,
      openings:line.openings,includeCrown:true,seed});
    wall(-1,run.left,2909+index*11);
    wall(1,run.right,3217+index*13);
    // Gold and silver end frames where a hall opens into a chamber, as the
    // owner's standalone hallway is finished.
    for(const s of run.frames)for(const side of [-1,1]){
      const gold=new THREE.Mesh(new THREE.BoxGeometry(...HALL.frame.gold),kit.goldMaterial);
      gold.position.set(side*HALL.halfWidth,HALL.frame.gold[1]/2,s);
      const silver=new THREE.Mesh(new THREE.BoxGeometry(...HALL.frame.silver),kit.silverMaterial);
      silver.position.set(side*HALL.halfWidth,HALL.frame.silver[1]/2,s);
      hall.add(gold,silver);
    }
    root.add(hall);
  });
  return root;
}

/**
 * The finished hallway, ready to add to the caves.
 * @returns {{object, plan, stats:{runs,meters,meshesBefore,trianglesBefore,drawCalls,triangles},
 *   dispose()}}
 */
export function buildWolfveilSumiHalls({THREE,document=globalThis.document}={}){
  const kit=createLightSumiCorridorKit({THREE,document});
  const plan=planWolfveilSumiHalls();
  const baked=bakeSumiPiece(kit,assembleWolfveilSumiHalls({THREE,kit,plan}),{THREE,name:'SWV_SumiHalls'});
  const object=baked.object;
  object.userData={sumiHalls:true,decorativeOnly:true};
  const used=new Set();
  object.traverse(node=>{
    if(!node.isMesh)return;
    used.add(node.material);
    node.raycast=()=>{}; // never a floor, a wall or a click target
  });
  // The kit paints textures for every material it knows. Let go of the ones
  // this hallway never shows.
  const owned=[...kit.tileMaterials,...kit.brickMaterials,kit.goldMaterial,kit.silverMaterial,kit.mortarMaterial,
    kit.resinCoatMaterial,kit.arcaneMaterial,kit.caveRockMaterial,kit.canyonRoadMaterial,
    ...[...kit.light.pictures.values()].map(picture=>picture.material)].filter(Boolean);
  const release=material=>{
    for(const key of ['map','bumpMap','emissiveMap','roughnessMap'])material[key]?.dispose?.();
    material.dispose?.();
  };
  for(const material of owned)if(!used.has(material))release(material);
  return {object,plan,
    stats:{runs:plan.runs.length,meters:Math.round(plan.meters*10)/10,...baked.stats},
    dispose(){
      object.traverse(node=>{if(node.isMesh)node.geometry?.dispose?.();});
      for(const material of owned)if(used.has(material))release(material);
    }};
}
