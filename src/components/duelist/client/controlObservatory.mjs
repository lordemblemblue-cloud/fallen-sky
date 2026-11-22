// The Meridian Observatory is an open duelling deck. The towers stand outside the
// playable rim. All paths, inlays and capture plates lie flush with the deck.
import * as THREE from 'three';

export function createControlObservatory(group, radius, resources) {
  const keep = item => { resources.push(item); return item; };
  const alloy = keep(new THREE.MeshStandardMaterial({ color: 0x26374b, roughness: 0.64, metalness: 0.45 }));
  const gold = keep(new THREE.MeshStandardMaterial({ color: 0xcdab6b, roughness: 0.42, metalness: 0.55 }));
  const crystal = keep(new THREE.MeshStandardMaterial({ color: 0x76bbce, emissive: 0x1e5969, flatShading: true }));
  const stone = keep(new THREE.CylinderGeometry(1.15, 1.75, 1, 6));
  const lens = keep(new THREE.OctahedronGeometry(1.2));
  const hoop = keep(new THREE.TorusGeometry(2.25, 0.11, 6, 44));
  const trim = keep(new THREE.TorusGeometry(radius - 1.3, 0.055, 5, 112));
  const outer = new THREE.Mesh(trim, gold);
  outer.rotation.x = Math.PI / 2;
  group.add(outer);
  // Twin astronomical gates frame the team approach at each end.
  for (const side of [-1, 1]) {
    for (const x of [-7, 7]) {
      const tower = new THREE.Group();
      tower.position.set(x, 0, side * (radius + 1.5));
      const base = new THREE.Mesh(stone, alloy);
      base.position.y = 2.3;
      base.scale.y = 6;
      const gimbal = new THREE.Mesh(hoop, gold);
      gimbal.position.y = 7.45;
      const inner = new THREE.Mesh(hoop, gold);
      inner.scale.setScalar(0.77);
      inner.rotation.y = Math.PI / 3;
      const heart = new THREE.Mesh(lens, crystal);
      heart.scale.set(0.7, 1.3, 0.7);
      gimbal.add(inner, heart);
      tower.add(base, gimbal);
      group.add(tower);
    }
  }
  const laneGeometry = keep(new THREE.BoxGeometry(1, 0.012, 1));
  const laneMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x192a3e, roughness: 0.87 }));
  const paths = [];
  for (let i = 0; i < 3; i++) {
    const path = new THREE.Group();
    const deck = new THREE.Mesh(laneGeometry, laneMaterial);
    deck.scale.x = 2.9;
    path.add(deck);
    for (const x of [-1.5, 1.5]) {
      const rail = new THREE.Mesh(laneGeometry, gold);
      rail.position.x = x;
      rail.scale.x = 0.075;
      path.add(rail);
    }
    path.visible = false;
    group.add(path);
    paths.push(path);
  }
  return points => {
    const [a, b, c] = points;
    const routes = [[a, b], [b, c], [c, a]];
    routes.forEach(([p, q], i) => {
      const path = paths[i];
      path.visible = !!(p && q);
      if (!path.visible) return;
      const dx = q.x - p.x, dz = q.z - p.z;
      path.scale.z = Math.hypot(dx, dz);
      path.rotation.y = Math.atan2(dx, dz);
      path.position.set((p.x + q.x) / 2, 0.013, (p.z + q.z) / 2);
    });
  };
}
