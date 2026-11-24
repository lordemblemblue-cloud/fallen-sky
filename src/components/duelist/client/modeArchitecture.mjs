// Procedural digital architecture, using the same dark alloy and cyan/brass
// palette as the arena floor and observatory. No textures, new lights or shaders.
// The renderer mounts only when the simulation uses the same authored layout.
import * as THREE from 'three';
import { getModeArenaLayout } from '../sim/modeArenaLayout.mjs';

export function createModeArchitecture(mode) {
  const layout=getModeArenaLayout(mode);
  if (!layout) return null;
  const group=new THREE.Group();
  group.name=layout.id;
  const geometry=new THREE.BoxGeometry(1,1,1);
  const palette={
    wall:0x26374b, deck:0x192a3e, cover:0x46536a, step:0x2a3b55, duct:0x397e98,
  };
  const materials=[];
  const dummy=new THREE.Object3D();
  for (const [kind,color] of Object.entries(palette)) {
    const parts=layout.parts.filter(p=>p.kind===kind);
    if (!parts.length) continue;
    const material=new THREE.MeshStandardMaterial({color,metalness:0.45,roughness:0.62,
      ...(kind==='duct' ? {emissive:0x123b4c,emissiveIntensity:0.7} : {})});
    materials.push(material);
    const mesh=new THREE.InstancedMesh(geometry,material,parts.length);
    mesh.name=kind;
    parts.forEach((p,i)=>{
      dummy.position.set((p.x0+p.x1)/2,(p.y0+p.y1)/2,(p.z0+p.z1)/2);
      dummy.scale.set(p.x1-p.x0,p.y1-p.y0,p.z1-p.z0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow=false; // mobile: avoid extra per-instance shadow work
    mesh.castShadow=false;
    group.add(mesh);
  }
  return {group,layout,dispose(){
    group.removeFromParent();
    for(const mesh of group.children)mesh.dispose();
    geometry.dispose();
    for(const material of materials) material.dispose();
  }};
}
