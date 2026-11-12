/**
 * X49-Z113 only: read-only runtime evidence collector for a REAL Three.js
 * WolfveilBuilder after WS15's authorized Play-only scene integration.
 *
 * This reports CPU-side mounted InstancedMesh facts and bounds, NOT shader
 * execution, GPU screenshots, FPS, physical collisions or 2-client parity.
 * Never builds, mounts, merges, resizes or mutates any world object.
 */
export const X49_Z113_RUNTIME_AUDIT_ID = 'X49-Z113';
const SWAY = .035 + .16 + 6 * .36;
const L = Object.freeze({minX:-305,maxX:-300,minZ:15,maxZ:20});
const finite=Number.isFinite;
const err=(errors,condition,message)=>{if(!condition)errors.push(message);};
const radiusOf = geometry=>{
  const positions=geometry?.attributes?.position?.array;
  if (!positions || positions.length===0 || positions.length%3!==0) return null;
  let r=0;
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    if (![x,y,z].every(finite)) return null;
    r=Math.max(r,Math.hypot(x,z));
  }
  return r;
};
export function auditX49Z113PlayInstances({world,sampleVisibleGround,requireFullCounts=true}={}){
  const errors=[];
  const group=world?.group;
  if (!(group?.userData?.environment==='wolfveil' &&
    group.position?.x===0 && group.position?.y===0 && group.position?.z===70 &&
    group.rotation?.x===0 && group.rotation?.y===0 && group.rotation?.z===0 &&
    group.scale?.x===1 && group.scale?.y===1 && group.scale?.z===1))
    errors.push('Wolfveil +70m unscaled world transform not verified');
  if (!Array.isArray(world?.meshes)) errors.push('Real Wolfveil world mesh registry not accessible');
  if (typeof sampleVisibleGround!=='function') errors.push('Canonical rendered terrain sampler not provided');
  const owned=Array.isArray(world?.meshes)?
    world.meshes.filter(mesh=>mesh?.userData?.tileId===X49_Z113_RUNTIME_AUDIT_ID):[];
  if (owned.length!==2) errors.push('Expected exactly 2 mounted X49-Z113 batches, got '+owned.length);
  const counts={grass:0,stones:0};
  const instancesChecked={grass:0,stones:0};
  for(const [family,key,want] of [['Grass','grass',487],['Stone','stones',3]]){
    const matches=owned.filter(mesh=>mesh.name===`SWV_X49Z113_LivingSumiE_${family}`);
    if(matches.length!==1){errors.push(family+' batch count '+matches.length+' (expected 1)');continue;}
    const mesh=matches[0],count=mesh.count;
    counts[key]=count;
    err(errors,Number.isInteger(count)&&count>=0&&count<=(key==='grass'?576:3),
      family+' count outside per-square budget');
    if(requireFullCounts)err(errors,count===want,family+' canonical count drift');
    err(errors,mesh.userData?.nonCollider===true&&mesh.userData?.decorativeOnly===true,
      family+' is not tagged decorative/non-collider');
    err(errors,mesh.frustumCulled===false,
      family+' vulnerable to shader-wind frustum pop');
    err(errors,mesh.castShadow===false&&mesh.receiveShadow===true,
      family+' altered original decorative shadow settings');
    err(errors,mesh.material?.name===(key==='grass'?
      'Wolfveil_IndividualCurvedGrassBladeClusters':'Wolfveil_WeatheredPathEdgeStone'),
      family+' not using canonical world-owned PBR material');
    err(errors,world?.ownedMaterials?.includes(mesh.material)===true,
      family+' not using an original owned material');
    const matrices=mesh.instanceMatrix?.array;
    const radius=radiusOf(mesh.geometry);
    if(!matrices || matrices.length<count*16 || !finite(radius)){
      errors.push(family+' GPU instance attribute or geometry unavailable');
      continue;
    }
    for(let i=0;i<count;i++){
      const j=i*16,x=matrices[j+12],y=matrices[j+13],z=matrices[j+14];
      const sx=Math.hypot(matrices[j],matrices[j+1],matrices[j+2]);
      const sz=Math.hypot(matrices[j+8],matrices[j+9],matrices[j+10]);
      const edge=Math.min(x-L.minX,L.maxX-x,z-L.minZ,L.maxZ-z);
      const within=finite(x)&&finite(y)&&finite(z)&&
        x>=L.minX&&x<L.maxX&&z>=L.minZ&&z<L.maxZ&&
        finite(sx)&&finite(sz)&&sx>0&&sz>0&&
        (radius+(key==='grass'?SWAY:0))*Math.max(sx,sz)<=edge+1e-4;
      if(!within){errors.push(family+' instance '+i+' crosses exclusive animated tile footprint');break;}
      if(typeof sampleVisibleGround==='function'){
        const expected=sampleVisibleGround(x,z)-(key==='grass'?.012:.015);
        if(!finite(expected)||Math.abs(expected-y)>.055){
          errors.push(family+' instance '+i+' not rooted to canonical terrain');break;
        }
      }
      instancesChecked[key]++;
    }
  }
  return Object.freeze({
    tileId:X49_Z113_RUNTIME_AUDIT_ID,passed:errors.length===0,
    errors:Object.freeze(errors),counts:Object.freeze(counts),
    instancesChecked:Object.freeze(instancesChecked),
    cpuInstancesOnly:true,independentPlayCertified:false,
    gpuShaderVerified:false,physicsVerified:false,multiplayerParityVerified:false,
  });
}
