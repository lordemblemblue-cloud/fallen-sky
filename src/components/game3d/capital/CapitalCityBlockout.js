// Preview-only Three.js graybox for the capital city concept board.
// Deliberately separate from GameWorld3D, Wolfveil, physics and network state.
// A future Game 3D world-selection integration must validate movement, LOD,
// building collisions, asset budget and signed-in player/session behavior.
import * as THREE from 'three';
import {planCapitalCityBlockout,validateCapitalCityLayout} from './CapitalCityLayout.js';
import {makeCapitalSurfaceMaterials} from './CapitalCitySurfaceMaterials.js';
import {planCapitalCityFacades} from './CapitalCityFacades.js';
import {planCapitalCityRoofs} from './CapitalCityRoofProfiles.js';

const X_AXIS=new THREE.Vector3(1,0,0);
export function buildCapitalCityBlockout(scene,{originX=0,originZ=0,facadeDetail='standard'}={}){
  if(!scene?.add||!scene?.remove)throw Error('Capital blockout requires a Three.js scene');
  const validation=validateCapitalCityLayout();
  if(!validation.ok)throw Error('Invalid capital city plan: '+validation.failures.join('; '));
  const plan=planCapitalCityBlockout();
  // Validate the selected detail budget before allocating textures or geometry.
  const facadeBoxes=planCapitalCityFacades(plan.buildings,{detailLevel:facadeDetail});
  const root=new THREE.Group();
  root.name='AXE_Game3D_CapitalCity_Graybox_01';
  root.position.set(originX,0,originZ);
  root.userData={game:'game3d',stage:'graybox_only',gameplayEnabled:false};
  const {materials,dispose:disposeMaterials}=makeCapitalSurfaceMaterials(THREE);
  const geometry=[];

  function add(geo,mat,x,y,z,name,meta={}){
    geometry.push(geo);
    const m=new THREE.Mesh(geo,materials[mat]);
    m.position.set(x,y,z);
    m.name=name;
    m.userData={...meta,collidable:false,previewOnly:true};
    m.receiveShadow=true;
    root.add(m);
    return m;
  }
  function box(mat,x,y,z,w,h,d,name,meta){
    return add(new THREE.BoxGeometry(w,h,d),mat,x,y,z,name,meta);
  }
  // Horizontal graybox terraces + retaining plinths show the vertical
  // hierarchy without claiming the floating graybox is finished terrain.
  for(const d of plan.districts){
    add(new THREE.CylinderGeometry(d.radius,d.radius+6,4,48),
      'plateau',d.x,d.y,d.z,'District_'+d.id+'_Terrace',
      {districtId:d.id,zoneRole:d.role});
    add(new THREE.CylinderGeometry(d.radius+5,d.radius+7,11,48,1,true),
      'wall',d.x,d.y-7.5,d.z,'District_'+d.id+'_RetainingWall',
      {districtId:d.id});
    // Large civic spaces remain open for routes, NPC/service placement.
    add(new THREE.CylinderGeometry(Math.min(d.radius*.35,37),
      Math.min(d.radius*.35,37),.26,40),
      'plaza',d.x,d.y+2.12,d.z,'District_'+d.id+'_Plaza',
      {districtId:d.id});
  }

  // Elevated visual connector slabs. Significant slopes still require
  // engineered switchbacks, stairs and physics before playable activation.
  for(const r of plan.roads){
    const a=new THREE.Vector3(...r.fromPoint),b=new THREE.Vector3(...r.toPoint);
    const delta=b.clone().sub(a),distance=delta.length();
    const mesh=box('road',0,0,0,distance,.5,r.width,'Route_'+r.id,
      {routeId:r.id,from:r.from,to:r.to,unverifiedTraversal:true});
    mesh.position.copy(a.add(b).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(X_AXIS,delta.normalize());
    for(const point of [r.fromPoint,r.toPoint]){
      const y=point[1]-.3;
      box('wall',point[0],y-2,point[2],r.width+2,4,r.width+2,
        'Route_'+r.id+'_Anchor',{routeId:r.id});
    }
  }

  // Modular replacement targets: base mass, columns, roof, pediment,
  // capitol dome, residence plots and an arch-shaped entry gateway.
  for(const b of plan.buildings){
    const tag={buildingId:b.id,districtId:b.district,kitKind:b.kind};
    if(b.kind==='plots'){
      for(const side of [-1,0,1])
        box('plots',b.x+side*b.w/3,b.y+.2,b.z,b.w/3-1,.4,b.d,
          'UnclaimableHousingPlot_'+side,tag);
      continue;
    }
    if(b.kind==='arch'){
      for(const side of [-1,1]){
        box('column',b.x+side*(b.w*.34),b.y+b.h*.5,b.z,4,b.h,5,
          'Gate_Pier_'+b.id,tag);
      }
      box('roof',b.x,b.y+b.h+.8,b.z,b.w,2.3,b.d,'Gate_Entablature_'+b.id,tag);
      continue;
    }
    box('structure',b.x,b.y+b.h*.5,b.z,b.w,b.h,b.d,
      'Building_'+b.id,tag);
    const roofHeight=b.kind==='residence'?1.4:2.8;
    if(!['residence','workshop'].includes(b.kind))
      box('roof',b.x,b.y+b.h+roofHeight*.5,b.z,b.w+2,roofHeight,b.d+2,
        'Roof_'+b.id,tag);
    if(['colonnade','pediment','dome'].includes(b.kind)){
      const count=Math.max(4,Math.min(8,Math.floor(b.w/6)));
      for(let i=0;i<count;i++){
        const x=b.x-b.w*.43+(b.w*.86)*(i/(count-1));
        add(new THREE.CylinderGeometry(.72,.84,b.h*.68,10),
          'column',x,b.y+b.h*.34,b.z-b.d*.52,
          'Column_'+b.id+'_'+i,tag);
      }
      box('roof',b.x,b.y+b.h*.78,b.z-b.d*.55,b.w+1,1.5,3,
        'ColonnadeBeam_'+b.id,tag);
    }
    if(b.kind==='dome'){
      add(new THREE.SphereGeometry(b.w*.35,24,12,0,Math.PI*2,0,Math.PI/2),
        'roof',b.x,b.y+b.h+roofHeight,b.z,'CapitolDome_'+b.id,tag);
    }
  }
  // Replace low-silhouette housing/workshop flat roofs with original gables.
  // Classical halls retain low flat roof masses and gain shallow pediments.
  // All generated roof faces are decorative; not weather or collision meshes.
  for(const profile of planCapitalCityRoofs(plan.buildings)){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(profile.positions,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(profile.uvs,2));
    geo.computeVertexNormals();
    add(geo,'roof',0,0,0,'CapitalRoof_'+profile.buildingId,
      {buildingId:profile.buildingId,roofKind:profile.kind});
  }

  // Batch original facade moldings, solid entrance markers and decorative
  // window frames by material: at most a handful of extra draw calls per city.
  // These are NOT doors, windows, physical openings or gameplay colliders.
  const facadeGeometry=new THREE.BoxGeometry(1,1,1);
  geometry.push(facadeGeometry);
  const facadeGroups=new Map();
  for(const detail of facadeBoxes){
    if(!facadeGroups.has(detail.material))facadeGroups.set(detail.material,[]);
    facadeGroups.get(detail.material).push(detail);
  }
  for(const [material,boxes] of facadeGroups){
    const mesh=new THREE.InstancedMesh(facadeGeometry,materials[material],boxes.length);
    mesh.name='CapitalFacadeDetail_'+material;
    mesh.userData={previewOnly:true,collidable:false,facadeOnly:true};
    const matrixObject=new THREE.Object3D();
    for(let i=0;i<boxes.length;i++){
      const part=boxes[i];
      matrixObject.position.set(part.x,part.y,part.z);
      matrixObject.scale.set(part.w,part.h,part.d);
      matrixObject.updateMatrix();
      mesh.setMatrixAt(i,matrixObject.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow=true;
    root.add(mesh);
  }

  // Harbors and waterfalls are represented by flat water reference masses.
  // No fluid simulation, water contact or shore collision is implied.
  const harbor=plan.districts.find(d=>d.id==='harbor');
  box('water',harbor.x+77,harbor.y-.8,harbor.z-52,42,.18,90,
    'Harbor_Water_Reference',{districtId:'harbor'});

  scene.add(root);
  let disposed=false;
  return {
    group:root,plan,
    get disposed(){return disposed;},
    dispose(){
      if(disposed)return;
      disposed=true;
      scene.remove(root);
      geometry.forEach(g=>g.dispose());
      disposeMaterials();
      root.clear();
    },
  };
}
