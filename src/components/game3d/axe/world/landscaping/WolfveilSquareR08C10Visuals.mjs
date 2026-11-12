// WS05 / #1282 — bounded, decorative ONLY; no implicit shared Play mount.
// WS15 supplies the existing Three.js instance types, shared wind material,
// real terrain-sampled plan and geometry already used in Wolfveil GroundCover.
// All placement coordinates are authored Wolfveil LOCAL metres; the parent
// WolfveilBuilder group applies +70m world Z ONCE. Do not offset here.
export const WOLFVEIL_R08_C10_RENDER_STYLE=Object.freeze({
  id:'living-sumi-e-woodland-meadow-v1',
  grassColors:Object.freeze([0x4a7350,0x5b8561,0x6d966c,0x456b58,0x638e71]),
  stoneColors:Object.freeze([0x66777c,0x7c898a,0x596c74,0x718286,0x5f777b]),
  understoryColors:Object.freeze([0x355e5b,0x47756b,0x4c806f,0x376d6a]),
  bladeType:'existing-upright-three-sided-3d-tapered',
  wind:'reuse-world-ink-grass-material-and-rooted-contact-recovery',
  materials:'reuse-world-grass-and-rock;no-detached-blue-fog',
});
const TILE=Object.freeze({minX:350,maxX:450,minZ:-250,maxZ:-150});
const LIMITS=Object.freeze({grass:1800,stones:36,understory:24});
const finite=Number.isFinite;
// Existing WolfveilGroundCover.buildWolfveilUprightInkBladeGeometry has
// seven 3D blades whose tallest authored mesh reaches 0.86 local Y units.
// Normalize to the square planner's requested REAL 12–26cm grass height.
const INK_BLADE_UNIT_HEIGHT=.86;

/**
 * Stage three bounded InstancedMeshes, not 1,860 individual draw calls.
 * The caller must explicitly opt in AFTER real-scene and art review.
 * Requires meshes/materials/geometry supplied from the SAME live Wolfveil
 * build, never imported owner GLBs (12k+ triangles unsuitable for grass).
 * This method is visual ONLY and never creates collision/raycast surfaces.
 */
export function mountWolfveilSquareR08C10Visuals({
  plan,THREE,world,grassGeometry,stoneGeometry,understoryGeometry,
  grassMaterial,stoneMaterial,
}={}){
  if(plan?.tile?.id!=='WV-R08-C10'||plan.visualOnly!==true||
      plan.createsTrunkColliders!==false||plan.changesGroundHeight!==false)
    throw new TypeError('Requires the authorized decorative-only WV-R08-C10 plan');
  if(!THREE?.Object3D||!THREE?.InstancedMesh||!THREE?.Color||
      typeof world?.mesh!=='function'||!grassGeometry||!stoneGeometry||
      !understoryGeometry||!grassMaterial||!stoneMaterial)
    throw new TypeError('Requires real live Wolfveil instancing dependencies');
  const groups=[
    {name:'grass',items:plan.grass,geometry:grassGeometry,material:grassMaterial,
      colors:WOLFVEIL_R08_C10_RENDER_STYLE.grassColors},
    {name:'stones',items:plan.stones,geometry:stoneGeometry,material:stoneMaterial,
      colors:WOLFVEIL_R08_C10_RENDER_STYLE.stoneColors},
    {name:'understory',items:plan.understory,geometry:understoryGeometry,material:grassMaterial,
      colors:WOLFVEIL_R08_C10_RENDER_STYLE.understoryColors},
  ];
  // Validate ALL inputs before mounting ANY mesh: an invalid square, foot Y,
  // budget or asset cannot leave a half-installed world on an error path.
  for(const group of groups){
    if(!Array.isArray(group.items)||group.items.length>LIMITS[group.name])
      throw new RangeError('Bad WV-R08-C10 '+group.name+' budget');
    for(const p of group.items){
      // Validate full decorative footprints, not just their pivot points:
      // a low rock that straddles a 100m tile seam would alter a different
      // agent's exclusive square despite the pivot remaining inside ours.
      // The slope-normal offset is <0.25m for our <0.36m mineral pebbles.
      const footprint=p&&finite(p.width)&&finite(p.depth)
        ?Math.max(p.width,p.depth)/2+.25
        :p&&finite(p.width)?p.width*.5+.20:Infinity;
      if(!p||!finite(p.x)||!finite(p.y)||!finite(p.z)||
          p.x<TILE.minX+footprint||p.x>=TILE.maxX-footprint||
          p.z<TILE.minZ+footprint||p.z>=TILE.maxZ-footprint||
          p.decorativeOnly!==true||
          !finite(p.yaw)||!finite(p.width)||p.width<=0||
          !finite(p.height)||p.height<=0||
          (group.name==='stones'&&(!finite(p.depth)||p.depth<=0||
            !finite(p.bury)||p.bury<0||p.bury>p.height*.25+1e-9||
            // This tile's planner MUST supply both real triangle slopes.
            // Missing tangent data may silently leave stones floating on a
            // hillside, so do not accept a yaw-only quality regression.
            !finite(p.slopeX)||!finite(p.slopeZ)||
            Math.hypot(p.slopeX,p.slopeZ)>.650001))||
          (group.name!=='understory'&&
            (!Number.isInteger(group.name==='grass'?p.shade:p.palette)||
             (group.name==='grass'?p.shade:p.palette)<0)))
        throw new RangeError('Invalid WV-R08-C10 '+group.name+' instance');
    }
  }
  const dummy=new THREE.Object3D(),meshes=[],counts={grass:0,stones:0,understory:0};
  // Reuse quaternion buffers across all 36 or fewer rocks; Three.js supplies
  // this real vector API, while headless tests without it retain yaw-only poses.
  // Tilt+twist preserves each rock's unique heading around the surface normal.
  const canAlignStones=typeof THREE.Vector3==='function'&&
    typeof THREE.Quaternion==='function'&&typeof dummy.quaternion?.copy==='function';
  const up=canAlignStones?new THREE.Vector3(0,1,0):null;
  const normal=canAlignStones?new THREE.Vector3():null;
  const tilt=canAlignStones?new THREE.Quaternion():null;
  const twist=canAlignStones?new THREE.Quaternion():null;
  // Cloned batch geometries are owned by this tile only, whereas the
  // supplied grass/stone/understory sources belong to the shared renderer.
  // Dispose ONLY the clones if staging or world attachment fails.
  const stagedClones=[];
  try {
  for(const group of groups){
    if(!group.items.length)continue;
    const geometry=typeof group.geometry.clone==='function'
      ?group.geometry.clone():group.geometry;
    if(geometry!==group.geometry)stagedClones.push(geometry);
    // Resolve the ACTUAL authored mesh tip height per batch; a future
    // upstream grass-geometry edit cannot silently shrink our 12-26cm lawn.
    // The current seven-blade geometry tops out at 0.86 local units.
    geometry.computeBoundingBox?.();
    const sampledTip=geometry.boundingBox?.max?.y;
    const bladeTip=group.name==='stones'?null:
      finite(sampledTip)&&sampledTip>0?sampledTip:INK_BLADE_UNIT_HEIGHT;
    // The shared irregular rock is sculpted from an icosahedron, and its
    // lowest vertex need not be -1. Measure the *real* bottom of its Y-axis
    // before burial rather than assuming a perfect radius-one sphere.
    const sampledRockBottom=geometry.boundingBox?.min?.y;
    const rockFoot=group.name==='stones'&&finite(sampledRockBottom)&&
      sampledRockBottom<0?-sampledRockBottom:1;
    const mesh=new THREE.InstancedMesh(geometry,group.material,group.items.length);
    for(let i=0;i<group.items.length;i++){
      const p=group.items[i];
      const stone=group.name==='stones';
      // Position rocks along their actual ground normal, not just straight
      // up, so they intersect the sloped triangle plane by exactly 'bury'
      // instead of drifting downhill or sinking too far on steeper banks.
      dummy.position.set(p.x,stone?p.y+p.height/2-p.bury:p.y-.018,p.z);
      if(stone&&up&&finite(p.slopeX)&&finite(p.slopeZ)){
        // Local mesh triangle sampler's central derivatives: geometric
        // surface normal = normalize([-dY/dX, 1, -dY/dZ]).
        normal.set(-p.slopeX,1,-p.slopeZ).normalize();
        const lift=(p.height/2)*rockFoot-p.bury;
        dummy.position.set(
          p.x+normal.x*lift,
          p.y+normal.y*lift,
          p.z+normal.z*lift,
        );
        tilt.setFromUnitVectors(up,normal);
        twist.setFromAxisAngle(normal,p.yaw);
        dummy.quaternion.copy(twist).multiply(tilt);
      }else dummy.rotation.set(0,p.yaw,0);
      dummy.scale.set(stone?p.width/2:p.width,
        stone?p.height/2:p.height/bladeTip,
        stone?p.depth/2:p.width);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      const index=stone?p.palette:group.name==='grass'?p.shade:i;
      mesh.setColorAt(i,new THREE.Color(group.colors[index%group.colors.length]));
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere?.();
    mesh.name='SWV_WS05_R08_C10_'+group.name;
    mesh.castShadow=false;
    mesh.receiveShadow=true;
    mesh.raycast=()=>{}; // never enter player, companion, or NPC ground picks
    mesh.userData={tileId:'WV-R08-C10',decorativeOnly:true,nonCollider:true,
      rootOffsetApplied:false,sharedMaterials:true,kind:group.name};
    // Hold every cosmetic batch off-scene until ALL geometries, matrices,
    // colors and bounding volumes have built successfully.
    meshes.push(mesh);counts[group.name]=group.items.length;
  }
  // Build ALL geometry off-scene, then register each batch.
  for(const mesh of meshes)world.mesh(mesh);
  } catch(error) {
    // Roll back only this owner tile's objects, including objects registered
    // immediately before a world.mesh() exception. Never mutate neighbors.
    for(const mesh of meshes){
      world.group?.remove?.(mesh);
      if(Array.isArray(world.meshes)){
        const index=world.meshes.lastIndexOf(mesh);
        if(index!==-1)world.meshes.splice(index,1);
      }
    }
    // A failed build is not reachable by WolfveilBuilder.dispose(), so
    // explicitly free cloned GPU geometries without touching shared assets.
    for(const clone of stagedClones)clone.dispose?.();
    throw error;
  }
  return {tileId:'WV-R08-C10',meshes,counts,
    decorativeOnly:true,createsTrunkColliders:false,
    worldZOffsetHandledByParent:true};
}
