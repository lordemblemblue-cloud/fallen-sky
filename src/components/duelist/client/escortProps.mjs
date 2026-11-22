import * as THREE from 'three';
import { ESCORT_ROUTE, ESCORT_RADIUS, payloadPose } from '../sim/escort.mjs';

export function createEscortProps(scene) {
  const root = new THREE.Group(), cart = new THREE.Group();
  root.name = 'Meridian freight lane';
  const metal = new THREE.MeshStandardMaterial({color:0x46536a, metalness:0.55, roughness:0.42});
  const gold = new THREE.MeshStandardMaterial({color:0xe1ae5f, emissive:0x50320b});
  const lamp = new THREE.MeshBasicMaterial({color:0x8ae6ff});
  function box(parent, size, xyz, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...xyz);
    parent.add(mesh);
    return mesh;
  }
  for (let i = 1; i < ESCORT_ROUTE.length; i++) {
    const a = ESCORT_ROUTE[i-1], b = ESCORT_ROUTE[i];
    const dx = b.x-a.x, dz = b.z-a.z, length = Math.hypot(dx,dz);
    for (const offset of [-0.66,0.66]) {
      box(root,[0.07,0.025,length],[(a.x+b.x)/2 + offset*dz/length,0.028,(a.z+b.z)/2 - offset*dx/length],gold)
        .rotation.y = Math.atan2(dx,dz);
    }
  }
  const end = ESCORT_ROUTE.at(-1);
  for (const side of [-1,1]) {
    box(root,[0.42,3.25,0.55],[end.x+side*2.5,1.62,end.z],metal);
    box(root,[0.20,2.8,0.59],[end.x+side*2.5,1.62,end.z],lamp);
  }
  box(root,[5.4,0.35,0.58],[end.x,3.28,end.z],gold);
  box(cart,[1.55,0.42,2.45],[0,0.48,0],metal);
  box(cart,[1.1,0.72,1.65],[0,1.03,0],gold);
  for (const side of [-1,1]) box(cart,[0.10,0.14,1.85],[side*0.79,0.48,0],lamp);
  const ring = new THREE.Mesh(new THREE.RingGeometry(ESCORT_RADIUS-0.06,ESCORT_RADIUS,64),lamp);
  ring.rotation.x = -Math.PI/2;
  ring.position.y = 0.065;
  cart.add(ring); root.add(cart); scene.add(root);
  return {
    update(distance) {
      const {x,z,yaw} = payloadPose(distance);
      cart.position.set(x,0,z);
      cart.rotation.y = yaw;
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      for (const m of [metal,gold,lamp]) m.dispose();
    },
  };
}
