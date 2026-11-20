// Lightweight football pitch markers and an animated, server-authoritative ball.
import * as THREE from 'three';
import { TEAM_COLORS } from './matchProps.mjs';
import { FOOTBALL } from '../sim/football.mjs';

export function createFootballProps(scene, radius) {
  const group = new THREE.Group();
  const resources = [];
  const use = (resource) => { resources.push(resource); return resource; };
  const white = use(new THREE.MeshBasicMaterial({ color: 0xbfe4e6, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  const dark = use(new THREE.MeshStandardMaterial({ color: 0x182e37, metalness: 0.25, roughness: 0.46 }));
  const ballMat = use(new THREE.MeshStandardMaterial({ color: 0xf7f1d4, roughness: 0.4, metalness: 0.08, emissive: 0x33413d }));
  const line = (width, length, x, z) => {
    const floor = new THREE.Mesh(use(new THREE.PlaneGeometry(width, length)), white);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.03, z);
    group.add(floor);
  };
  const goal = (team, sign) => {
    const baseZ = sign * (radius - FOOTBALL.goalInset);
    const material = use(new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team], emissive: TEAM_COLORS[team], emissiveIntensity: 0.35, metalness: 0.6 }));
    const bar = (r, length, x, y, z, rotate = false) => {
      const mesh = new THREE.Mesh(use(new THREE.CylinderGeometry(r, r, length, 8)), material);
      if (rotate) mesh.rotation.z = Math.PI / 2;
      mesh.position.set(x, y, z);
      group.add(mesh);
    };
    const width = FOOTBALL.goalHalfWidth;
    bar(0.1, 3.2, -width, 1.6, baseZ);
    bar(0.1, 3.2, width, 1.6, baseZ);
    bar(0.11, width * 2, 0, 3.2, baseZ, true);
    line(width * 2, 0.12, 0, baseZ);
  };
  // Midfield line and two distinct team goals.
  line(radius * 1.34, 0.07, 0, 0);
  goal('red', -1);
  goal('blue', 1);
  const circle = new THREE.Mesh(use(new THREE.RingGeometry(3.6, 3.66, 48)), white);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.04;
  group.add(circle);
  const ball = new THREE.Mesh(use(new THREE.SphereGeometry(FOOTBALL.radius, 18, 12)), ballMat);
  ball.castShadow = true;
  ball.position.set(0, FOOTBALL.radius + 0.08, 0);
  group.add(ball);
  scene.add(group);
  return {
    update(state, dt = 0) {
      if (!state) { ball.visible = false; return; }
      ball.visible = true;
      const travel = Math.hypot(ball.position.x - state.x, ball.position.z - state.z);
      ball.rotation.x += Math.min(1, travel) * 0.45;
      ball.position.set(state.x, FOOTBALL.radius + 0.08 + Math.sin(dt * 10) * 0.01, state.z);
    },
    dispose() {
      group.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}
