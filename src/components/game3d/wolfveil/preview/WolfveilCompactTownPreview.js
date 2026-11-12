import * as THREE from 'three';
import {
  COMPACT_TOWN, COMPACT_TOWN_STRUCTURES, COMPACT_TOWN_ROUTES,
  isInsideCompactHouseBoundary,
} from './WolfveilCompactTownDesign.mjs';

/**
 * Preview-only physically separate residential facades, open doorways and
 * two-room floors. This is NOT multiplayer collision/ownership/quest authority.
 * The 200m invisible limit is an authoring rule, NOT an opaque wall.
 */
export function addCompactTownPreview(world,workstreamPreviewHeight) {
  const root=new THREE.Group();
  root.name='WV_WIP_COMPACT_TOWN_10_STRUCTURES_FOUR_EXITS';
  root.userData={visualOnly:true,nonAuthoritative:true,housingCutoff:COMPACT_TOWN};
  world.group.add(root);
  const geo=new THREE.BoxGeometry(1,1,1);
  const mats={
    sandstone:new THREE.MeshStandardMaterial({color:0xcab694,roughness:.98}),
    plaster:new THREE.MeshStandardMaterial({color:0xd5cbb6,roughness:.95}),
    cedar:new THREE.MeshStandardMaterial({color:0x78563f,roughness:.89}),
    darkCedar:new THREE.MeshStandardMaterial({color:0x3b3333,roughness:.88}),
    roof:new THREE.MeshStandardMaterial({color:0x384f64,roughness:.84}),
    paper:new THREE.MeshStandardMaterial({color:0xf3dbac,emissive:0x26190a,roughness:.96}),
    pathway:new THREE.MeshStandardMaterial({color:0x998878,roughness:1,
      side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}),
  };
  world.ownedMaterials.push(...Object.values(mats));
  const boxes=new Map(Object.keys(mats).filter(name=>name!=='pathway').map(name=>[name,[]]));
  const quat=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
  const matrix=new THREE.Matrix4(),euler=new THREE.Euler();
  function box(kind,x,y,z,w,h,d,rz=0){
    if(!boxes.has(kind))throw new Error('Unknown compact-town material: '+kind);
    pos.set(x,y,z);scale.set(w,h,d);euler.set(0,0,rz);
    quat.setFromEuler(euler);matrix.compose(pos,quat,scale);
    boxes.get(kind).push(matrix.clone());
  }
  // Ten structures total: eight houses with room entrances, plus two workshops.
  // The central crossroads and four 10m+ gates stay unobstructed.
  for(const building of COMPACT_TOWN_STRUCTURES){
    const {x,z,w,d}=building;
    if(!isInsideCompactHouseBoundary(x-w*.5,z-d*.5)||
       !isInsideCompactHouseBoundary(x+w*.5,z+d*.5))
      throw new Error('Town structure escaped the housing cutoff: '+building.id);
    const y=workstreamPreviewHeight(x,z);
    const front=z-d/2,rear=z+d/2,door=2.6,side=(w-door)/2;
    box('sandstone',x,y-.12,z,w+.6,.38,d+.6); // flat, visible inside and outside
    box('plaster',x,y+1.65,rear,w,3.3,.26);
    box('plaster',x-w/2,y+1.65,z,.28,3.3,d);
    box('plaster',x+w/2,y+1.65,z,.28,3.3,d);
    box('plaster',x-(w+door)/4,y+1.65,front,side,3.3,.26);
    box('plaster',x+(w+door)/4,y+1.65,front,side,3.3,.26);
    box('plaster',x,y+2.95,front,door,.7,.26);
    // Two interior rooms: one partition with a genuine 2.4m passage.
    box('plaster',x-(w+2.4)/4,y+1.5,z,Math.max(1,(w-2.4)/2),3,.17);
    box('plaster',x+(w+2.4)/4,y+1.5,z,Math.max(1,(w-2.4)/2),3,.17);
    box('plaster',x,y+2.85,z,2.4,.45,.17);
    for(const sx of [-1,1]){
      box('cedar',x+sx*(w/2),y+1.7,front,.34,3.7,.42);
      box('cedar',x+sx*(w/2),y+1.7,rear,.34,3.7,.42);
      const wx=x+sx*w*.3;
      box('darkCedar',wx,y+1.85,front-.16,1.75,1.55,.12);
      box('paper',wx,y+1.85,front-.24,1.46,1.26,.05);
      box('cedar',wx,y+1.85,front-.3,.07,1.45,.1);
      for(const sy of [-.43,0,.43])
        box('cedar',wx,y+1.85+sy,front-.3,1.58,.06,.1);
    }
    for(const sx of [-1,1]){
      box('roof',x+sx*w*.265,y+3.7,z,w*.56,.25,d+1.5,sx<0?.34:-.34);
      box('cedar',x+sx*w*.49,y+3.24,z,.32,.24,d+1.7);
    }
    box('darkCedar',x,y+4.75,z,.40,.27,d+1.9);
    box('cedar',x,y+2.9,front-.2,door+.6,.17,.37);
    // No door slab across the opening: players can genuinely see inside.
  }
  for(const [kind,transforms] of boxes){
    if(!transforms.length)continue;
    const instanced=new THREE.InstancedMesh(geo,mats[kind],transforms.length);
    transforms.forEach((transform,i)=>instanced.setMatrixAt(i,transform));
    instanced.instanceMatrix.needsUpdate=true;
    instanced.computeBoundingSphere();
    instanced.castShadow=kind!=='paper';
    instanced.receiveShadow=true;
    instanced.name='WV_WIP_Town_Modular_'+kind;
    root.add(instanced);
  }

  // Four open gateways, centered on the invisible village-building cutoff.
  for(const [direction,[x,z]] of Object.entries(COMPACT_TOWN.gateOrigins)){
    const y=workstreamPreviewHeight(x,z);
    const eastWest=direction==='east'||direction==='west';
    for(const side of [-1,1]){
      const cx=x+(eastWest?0:side*5.6),cz=z+(eastWest?side*5.6:0);
      const column=new THREE.Mesh(new THREE.BoxGeometry(1.15,6.3,1.15),mats.sandstone);
      column.position.set(cx,y+3.15,cz);column.castShadow=true;root.add(column);
    }
    const header=new THREE.Mesh(new THREE.BoxGeometry(eastWest?1.6:12.6,.9,eastWest?12.6:1.6),mats.cedar);
    header.position.set(x,y+6.55,z);header.castShadow=true;root.add(header);
  }

  // Roads follow the real preview height samples. They do not become collision.
  for(const route of COMPACT_TOWN_ROUTES){
    const verts=[],indices=[],uv=[];
    let n=0;
    for(let segment=0;segment<route.points.length-1;segment++){
      const a=route.points[segment],b=route.points[segment+1];
      const dx=b[0]-a[0],dz=b[1]-a[1];
      const len=Math.hypot(dx,dz);
      if(len===0)continue;
      const nx=-dz/len,nz=dx/len,steps=Math.ceil(len/3);
      for(let i=0;i<=steps;i++){
        if(segment>0&&i===0)continue;
        const t=i/steps,x=a[0]+dx*t,z=a[1]+dz*t;
        for(const side of [-1,1]){
          const px=x+nx*side*route.width/2,pz=z+nz*side*route.width/2;
          verts.push(px,workstreamPreviewHeight(px,pz)+.17,pz);
          uv.push((side+1)*.5,segment*10+t*len/3);
        }
        if(n>0)indices.push(n*2-2,n*2-1,n*2,n*2-1,n*2+1,n*2);
        n++;
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const path=new THREE.Mesh(geometry,mats.pathway);
    path.name='WV_WIP_Visible_Exit_Route_'+route.id;
    path.userData={visualOnly:true,routeId:route.id,gate:route.gate};
    path.receiveShadow=true;
    root.add(path);
  }
  return {
    houses:COMPACT_TOWN_STRUCTURES.filter(entry=>entry.kind==='home').length,
    structures:COMPACT_TOWN_STRUCTURES.length,
    exits:COMPACT_TOWN_ROUTES.map(route=>route.gate),
    housingBoundary:COMPACT_TOWN,
  };
}
