import * as THREE from 'three';
import { WOLFVEIL_CAVES, wolfveilHeight } from './WolfveilLayout.js';

export function createWolfveilCaveSystem(scene, { sampleGroundY } = {}) {
  const root = new THREE.Group();
  root.name = 'SWV_ExploringCaveSystem';
  scene.add(root);

  const tex = new THREE.DataTexture(new Uint8Array([70,75,85,255]), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  const caveMat = new THREE.MeshStandardMaterial({
    color: 0x5a6575, roughness: 0.95, metalness: 0.1, side: THREE.DoubleSide, map: tex
  });
  
  // Connect caves with 3D splines (CatmullRom) for winding tunnels under the mountains.
  const tunnels = [];
  const colliders = [];
  const walkableSurfaces = [];

  const addTunnel = (start, end, depth, radius, material) => {
    const p1 = new THREE.Vector3(start[0], start[1] - depth, start[2]);
    const p2 = new THREE.Vector3(end[0], end[1] - depth, end[2]);
    const mid = p1.clone().lerp(p2, 0.5);
    mid.y -= 15; // dip deep underground
    mid.x += (Math.random() - 0.5) * 50; // winding bend
    
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(start[0], start[1], start[2]), p1, mid, p2,
      new THREE.Vector3(end[0], end[1], end[2])
    ], false, 'catmullrom', 0.8);
    
    const geo = new THREE.TubeGeometry(curve, Math.floor(curve.getLength() / 4), radius, 12, false);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true; mesh.castShadow = true;
    root.add(mesh);
    tunnels.push(curve);
    
    // Add glowing crystal braziers along the tunnel
    for(let t = 0.1; t < 0.9; t += 0.15) {
      const pt = curve.getPointAt(t);
      const l = new THREE.PointLight(0x44aaff, 3, 25);
      l.position.copy(pt); l.position.y += radius * 0.4;
      root.add(l);
      
      const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 1, 6), caveMat);
      brazier.position.copy(pt); brazier.position.y -= radius * 0.8;
      root.add(brazier);
    }
  };

  const activeCaves = WOLFVEIL_CAVES.filter(c => c.id !== 'wolfveil_falls_cave');
  for (let i = 0; i < activeCaves.length; i++) {
    const c1 = activeCaves[i];
    const c2 = activeCaves[(i + 1) % activeCaves.length];
    
    const p1 = [c1.entry[0], wolfveilHeight(c1.entry[0], c1.entry[1]), c1.entry[1]];
    const p2 = [c2.entry[0], wolfveilHeight(c2.entry[0], c2.entry[1]), c2.entry[1]];
    
    // Portal arch
    const arch = new THREE.Mesh(new THREE.TorusGeometry(5, 1.5, 8, 16, Math.PI), caveMat);
    arch.position.set(p1[0], p1[1], p1[2]);
    arch.lookAt(new THREE.Vector3(0, p1[1], 0));
    root.add(arch);

    // Carve tunnel to the next cave
    addTunnel(p1, p2, 20, 6, caveMat);
    
    // Chamber
    const chamber = new THREE.Mesh(new THREE.IcosahedronGeometry(15, 2), caveMat);
    chamber.position.set(p1[0], p1[1] - 20, p1[2]);
    root.add(chamber);
  }
  
  return {
    root, walkableSurfaces,
    playerCaveGroundY(position) {
      for (const curve of tunnels) {
        const closest = curve.getPointAt(curve.getUtoTmapping(0.5)); // fast approx
        if (position.distanceTo(closest) < 30) {
          // Find exact floor of the tube
          return closest.y - 6; 
        }
      }
      return null;
    },
    resolveCollision(position, previous, radius = 0.6) {
      return false; // To be expanded with proper SDF tube bounds!
    },
    update(dt) {},
    dispose() {
      root.parent?.remove(root);
      caveMat.dispose();
      tex.dispose();
    }
  };
}