// Wolfveil 4-Cave & Interconnected Subterranean Tunnel System (Three.js).
// Every chamber, ramp, and winding tunnel shares exact geometry with
// WolfveilCaveLayout.mjs so walkable floors, overhead ceilings, and swept walls
// match 1:1. Includes unique themed interiors and a 6-light proximity pool.
import * as THREE from 'three';
import {
  WOLFVEIL_EXPLORABLE_CAVES,
  WOLFVEIL_CAVE_HUB,
  WOLFVEIL_CAVE_CORRIDORS,
  WOLFVEIL_CAVE_DROP,
  sampleWolfveilPlayerCaveFloorY,
  sampleWolfveilCaveSpace,
  planWolfveilCaveInteraction,
  buildWolfveilCaveTravelGraph,
  resolveWolfveilCaveWallCollision,
} from './WolfveilCaveLayout.mjs';
import { WOLFVEIL_CAVE_ENTRANCE_FRAMES, caveEntranceAt } from './WolfveilCaveEntrancePlan.mjs';
import { WolfveilTriangles, mulberry32 } from './WolfveilGeometry.js';
import {appendWolfveilCaveAccessFloor,appendWolfveilCaveAccessProps} from './WolfveilCaveAccessGeometry.mjs';
import {installWolfveilCaveEntranceLandscaping} from './WolfveilCaveLandscapeVisuals.js';
import {WOLFVEIL_CAVE_APPROACHES,resolveWolfveilCaveEntranceRailCollision} from './WolfveilCaveAccessPlan.mjs';
import {WOLFVEIL_MODULAR_TREASURE_ROOM,WOLFVEIL_MODULAR_JUNCTION,
  WOLFVEIL_MODULAR_CANYON,WOLFVEIL_MODULAR_CHAMBERS,
  WOLFVEIL_MODULAR_WAYFINDER_HUB,WOLFVEIL_MODULAR_SANCTUARY,
  WOLFVEIL_MODULAR_ECHO_GALLERY,WOLFVEIL_MODULAR_SECRET_CACHE,
  WOLFVEIL_MODULAR_L_CORNER} from './WolfveilModularCaveKit.mjs';
import {appendWolfveilModularCaveVisuals} from './WolfveilModularCaveVisuals.mjs';
import {installWolfveilCaveDrawBudget} from './WolfveilCaveDrawBudget.mjs';
import {buildWolfveilSumiHalls} from './caves/WolfveilSumiCaveHalls.js';
import {createWolfveilTerrainSurfaceSampler} from './WolfveilTerrainSurfaceSampler.mjs';

import { wolfveilHeight } from './WolfveilLayout.js';
import { getWolfveilSumiETextures, cloneRepeatedTexture } from './WolfveilSumiETextures.mjs';
import {
  WOLFVEIL_CAVE_FLOORS,
  caveFloorByCaveId,
  caveFloorIsAwake,
  awakeCaveFloors,
  paintSumiCaveMural,
} from './WolfveilCaveNarrative.mjs';

const TAU = Math.PI * 2;
const LIGHT_POOL_SIZE = 6;

function rockDisplacement(x, y, z) {
  return (
    0.42 * Math.sin(x * 0.37 + y * 0.51 + Math.cos(z * 0.29) * 1.6) +
    0.24 * Math.cos(z * 0.63 - x * 0.41 + y * 0.77)
  );
}

export function createWolfveilCaveSystem(world, { offsetZ = 0 } = {}) {
  const group = new THREE.Group();
  group.name = 'SWV_FourCave_Interconnected_TunnelSystem';
  world.mesh(group);

  const texSuite = getWolfveilSumiETextures();
  const ownedTextures = [
    cloneRepeatedTexture(texSuite.columnarBasalt.map, 0.72, 0.72),
    cloneRepeatedTexture(texSuite.columnarBasalt.bumpMap, 0.72, 0.72),
    cloneRepeatedTexture(texSuite.stone.map, 0.28, 0.28),
    cloneRepeatedTexture(texSuite.stone.bumpMap, 0.28, 0.28),
    cloneRepeatedTexture(texSuite.wood.map, 0.4, 0.4),
    cloneRepeatedTexture(texSuite.wood.bumpMap, 0.4, 0.4),
    cloneRepeatedTexture(texSuite.rope.map, 1, 4),
  ];

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x6f7987,
    map: ownedTextures[0],
    bumpMap: ownedTextures[1],
    bumpScale: 0.2,
    roughness: 0.91,
    metalness: 0.05,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  wallMat.name = 'SWV_Cave_BasaltRockWall';

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x8e8b84,
    map: ownedTextures[2],
    bumpMap: ownedTextures[3],
    bumpScale: 0.045,
    roughness: 0.88,
    metalness: 0.03,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  floorMat.name = 'SWV_Cave_WalkableStoneFloor';

  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x8d6342,
    map: ownedTextures[4],
    bumpMap: ownedTextures[5],
    bumpScale: 0.03,
    roughness: 0.84,
  });
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0xc2a173,
    map: ownedTextures[6],
    roughness: 0.9,
  });
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0x4b433b,
    roughness: 0.45,
    metalness: 0.62,
  });
  const jadeCrystalMat = new THREE.MeshStandardMaterial({
    color: 0x5eead4,
    emissive: 0x14b8a6,
    emissiveIntensity: 1.55,
    roughness: 0.24,
    metalness: 0.18,
  });
  const amethystCrystalMat = new THREE.MeshStandardMaterial({
    color: 0xc4b5fd,
    emissive: 0x7c3aed,
    emissiveIntensity: 1.65,
    roughness: 0.22,
    metalness: 0.22,
  });
  const warmLanternMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b5,
    emissive: 0xff9f43,
    emissiveIntensity: 2.35,
    roughness: 0.32,
  });
  const inkRuneMat = new THREE.MeshStandardMaterial({
    color: 0xbae6fd,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.9,
    roughness: 0.28,
  });

  const cisternUniforms = { uTime: { value: 0 } };
  const cisternWaterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: cisternUniforms,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float rippleA = sin(r * 22.0 - uTime * 2.2 + sin(vW.x * 0.7) * 1.4);
        float rippleB = cos(vW.x * 1.6 + vW.z * 1.5 + uTime * 1.5);
        float caustic = smoothstep(0.35, 0.95, 0.5 + 0.3 * rippleA + 0.2 * rippleB);
        vec3 deep = vec3(0.05, 0.18, 0.26);
        vec3 shallow = vec3(0.18, 0.58, 0.66);
        vec3 col = mix(deep, shallow, 0.35 + 0.45 * (1.0 - r));
        col += vec3(0.28, 0.68, 0.75) * caustic * 0.35;
        float edgeFoam = smoothstep(0.84, 0.99, r);
        col = mix(col, vec3(0.78, 0.93, 0.96), edgeFoam * 0.55);
        gl_FragColor = vec4(col, 0.86);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  world.ownedMaterials.push(
    wallMat, floorMat, timberMat, ropeMat, bronzeMat,
    jadeCrystalMat, amethystCrystalMat, warmLanternMat, inkRuneMat, cisternWaterMat,
  );

  const floorTris = new WolfveilTriangles();
  const navigationGraph=buildWolfveilCaveTravelGraph();
  const shellTris = new WolfveilTriangles();
  const lightAnchors = [];
  const animatedFlames = [];
  const sumiScrolls = [];
  const sumiTorches = [];
  const defeatedBosses = new Set();
  const rand = mulberry32(0xc47e2026);

  const registerLight = (x, y, z, color, intensity = 22, distance = 28) => {
    lightAnchors.push({ x, y, z, color: new THREE.Color(color), intensity, distance });
  };

  // Shared decorative prop builders
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  const octaGeo = new THREE.OctahedronGeometry(1, 0);
  const torusGeo = new THREE.TorusGeometry(1, 0.18, 7, 18);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);

  // Every prop built by addProp is motionless decoration unless it is later
  // registered in animatedFlames; the draw budget below merges the rest.
  const staticProps = [];
  const addProp = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = false;
    m.receiveShadow = true;
    m.raycast = () => {};
    group.add(m);
    staticProps.push(m);
    return m;
  };

  const addBrazier = (x, y, z, lightHex = 0xffa64d, crystal = false) => {
    addProp(cylGeo, bronzeMat, x, y + 0.42, z, 0.46, 0.84, 0.46);
    addProp(cylGeo, bronzeMat, x, y + 0.92, z, 0.68, 0.22, 0.68);
    const flameMat = crystal ? jadeCrystalMat : warmLanternMat;
    const flame = addProp(crystal ? octaGeo : coneGeo, flameMat, x, y + 1.32, z, 0.34, 0.68, 0.34);
    animatedFlames.push({ mesh: flame, baseY: y + 1.32, phase: x * 0.37 + z * 0.23 });
    registerLight(x, y + 1.85, z, lightHex, 24, 30);
  };

  const addHangingLantern = (x, y, z, mat = warmLanternMat, lightHex = 0xffb35c) => {
    addProp(cylGeo, ropeMat, x, y + 0.65, z, 0.03, 1.3, 0.03);
    addProp(cylGeo, timberMat, x, y + 0.05, z, 0.36, 0.08, 0.36);
    const body = addProp(sphereGeo, mat, x, y - 0.28, z, 0.34, 0.44, 0.34);
    addProp(cylGeo, timberMat, x, y - 0.62, z, 0.28, 0.07, 0.28);
    animatedFlames.push({ mesh: body, baseY: y - 0.28, phase: x * 0.19 - z * 0.31, gentle: true });
    registerLight(x, y - 0.3, z, lightHex, 20, 26);
  };

  // 1. Low-poly galleries. Walls are vertical and the ceiling stays above the
  // camera. The dense reference would be a 0.4m vault; this is the simplified mesh.
  for (const cor of WOLFVEIL_CAVE_CORRIDORS) {
    let distAcc = 0;
    let nextRib = 80;
    for (let sIdx = 0; sIdx < cor.segments.length; sIdx++) {
      const seg = cor.segments[sIdx];
      const nx = -seg.dz / seg.lenXZ, nz = seg.dx / seg.lenXZ;
      const slice = cor.id.startsWith('modular_') ? 12 : 8;
      const steps = Math.max(1, Math.ceil(seg.lenXZ / slice));
      const hw = cor.halfWidth;
      const wallH = 3.85;
      const ceilH = 4.45;

      for (let i = 0; i < steps; i++) {
          const t0 = i / steps, t1 = (i + 1) / steps;
          const x0 = seg.ax + seg.dx * t0, y0 = seg.ay + seg.dy * t0, z0 = seg.az + seg.dz * t0;
          const x1 = seg.ax + seg.dx * t1, y1 = seg.ay + seg.dy * t1, z1 = seg.az + seg.dz * t1;
          const mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5, mz = (z0 + z1) * 0.5;
          // Three independent corridor shells cannot close across the T.
          // The canonical floor remains continuous; suppress wall/ceiling
          // fragments only in the central junction crossing.
          if(cor.id.startsWith('modular_') &&
            Math.hypot(mx-WOLFVEIL_MODULAR_JUNCTION.x,
              mz-WOLFVEIL_MODULAR_JUNCTION.z)<6){
            floorTris.quad(
              [x0+nx*hw,y0,z0+nz*hw],[x1+nx*hw,y1,z1+nz*hw],
              [x1-nx*hw,y1,z1-nz*hw],[x0-nx*hw,y0,z0-nz*hw],
              [.66,.64,.57],
            );
            continue;
          }
          if (cor.kind === 'entry') {
            const cave = WOLFVEIL_EXPLORABLE_CAVES.find(c => cor.id === `entry_${c.id}`);
            const along = (mx - cave.mouth[0]) * cave.dir[0] + (mz - cave.mouth[1]) * cave.dir[1];
            // Outside the mouth the hillside is the floor. Stone starts once
            // the ramp is actually under the rock.
            // Daylight in front of the arch stays open. The hall is drawn once
            // the floor is actually under the rock.
            if (along < 1.5 || my + 3.2 > wolfveilHeight(mx, mz)) continue;
          }
          const d0 = distAcc + seg.lenXZ * t0, d1 = distAcc + seg.lenXZ * t1;
          // Mission path in the middle. The rock edges stay darker and a
          // little mossy so the walk reads against the wall.
          const mixEdge = (t, yLift = 0) => {
            const a = [x0 + nx * hw, y0 + yLift, z0 + nz * hw];
            const b = [x0 - nx * hw, y0 + yLift, z0 - nz * hw];
            const c = [x1 - nx * hw, y1 + yLift, z1 - nz * hw];
            const d = [x1 + nx * hw, y1 + yLift, z1 + nz * hw];
            const at = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
            return [at(a, b), at(d, c)];
          };
          const bands = [[0, 0.18, [0.4, 0.48, 0.36]], [0.18, 0.82, [0.74, 0.69, 0.56]], [0.82, 1, [0.4, 0.48, 0.36]]];
          for (const [s0, s1, color] of bands) {
            const [l0, r0] = mixEdge(s0, s0 > 0.2 && s1 < 0.9 ? 0.03 : 0);
            const [l1, r1] = mixEdge(s1, s0 > 0.2 && s1 < 0.9 ? 0.03 : 0);
            floorTris.quad(l0, r0, r1, l1, color, [
              [s0 * hw, d0 * 0.85], [s1 * hw, d0 * 0.85], [s1 * hw, d1 * 0.85], [s0 * hw, d1 * 0.85],
            ]);
          }
          // The door stair only. The level-1 hall after it stays a flat path.
          if (cor.kind === 'entry' && y0 - y1 > 0.2) {
            floorTris.quad(
              [x0 + nx * (hw - 0.35), y0 + 0.08, z0 + nz * (hw - 0.35)],
              [x0 - nx * (hw - 0.35), y0 + 0.08, z0 - nz * (hw - 0.35)],
              [x0 - nx * (hw - 0.35) + seg.dx / steps * 0.42, y0 + 0.08, z0 - nz * (hw - 0.35) + seg.dz / steps * 0.42],
              [x0 + nx * (hw - 0.35) + seg.dx / steps * 0.42, y0 + 0.08, z0 + nz * (hw - 0.35) + seg.dz / steps * 0.42],
              [0.74, 0.7, 0.62],
            );
          }
          const out = hw + 0.55;
          const uv = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
          for (const side of [-1, 1]) {
            const jag = (x, y, z) => {
              const j = Math.max(0, rockDisplacement(x, y, z)) * 0.38;
              return [x + nx * side * j, y, z + nz * side * j];
            };
            const wall = (x, y, z) => jag(x + nx * out * side, y, z + nz * out * side);
            shellTris.quad(
              wall(x0, y0, z0), wall(x1, y1, z1), wall(x1, y1 + wallH, z1), wall(x0, y0 + wallH, z0),
              side < 0 ? [0.62, 0.6, 0.56] : [0.56, 0.58, 0.62],
              [[d0 * 0.42, 0], [d1 * 0.42, 0], [d1 * 0.42, wallH * 0.42], [d0 * 0.42, wallH * 0.42]],
            );
            const inn = out - 0.28;
            shellTris.quad(
              [x0 + nx * inn * side, y0, z0 + nz * inn * side],
              [x1 + nx * inn * side, y1, z1 + nz * inn * side],
              [x1 + nx * inn * side, y1 + 0.58, z1 + nz * inn * side],
              [x0 + nx * inn * side, y0 + 0.58, z0 + nz * inn * side],
              [0.34, 0.52, 0.32],
              uv(d0 * 0.5, 0, d1 * 0.5, 0.45),
            );
          }
          // Ragged brick courses along the rock. Uneven, with gaps, so the
          // wall is masonry that has started to fall in, not a flat panel.
          if ((sIdx + i) % 2 === 0) {
            for (let b = 0; b < 3; b++) {
              const side = (sIdx + b) % 2 === 0 ? 1 : -1;
              const jag = 0.15 + ((b * 5 + i) % 3) * 0.12;
              const span = 0.55 + (b % 2) * 0.35;
              const rise = 0.42 + ((b + sIdx) % 3) * 0.22;
              const base = 0.85 + (b % 2) * 0.55;
              const inset = out - 0.5;
              const ox = nx * inset * side, oz = nz * inset * side;
              const ax = mx + ox - seg.dx / steps * span * 0.5;
              const az = mz + oz - seg.dz / steps * span * 0.5;
              const bx = mx + ox + seg.dx / steps * span * 0.5;
              const bz = mz + oz + seg.dz / steps * span * 0.5;
              shellTris.quad(
                [ax, my + base, az],
                [bx, my + base + jag * 0.2, bz],
                [bx + nx * side * jag, my + base + rise, bz + nz * side * jag],
                [ax + nx * side * jag * 0.6, my + base + rise * 0.85, az + nz * side * jag * 0.6],
                b === 1 ? [0.48, 0.58, 0.4] : [0.58, 0.52, 0.46],
                [[0, 0], [span, 0], [span, rise], [0, rise]],
              );
            }
          }
          shellTris.quad(
            [x0 + nx * out, y0 + ceilH, z0 + nz * out],
            [x0 - nx * out, y0 + ceilH, z0 - nz * out],
            [x1 - nx * out, y1 + ceilH, z1 - nz * out],
            [x1 + nx * out, y1 + ceilH, z1 + nz * out],
            [0.4, 0.42, 0.46],
            [[d0 * 0.35, 0], [d0 * 0.35, out], [d1 * 0.35, out], [d1 * 0.35, 0]],
          );
          // A shallow niche every few slices. Something to stop and look at,
          // still the same rock mesh.
          if (cor.kind === 'tunnel' && (sIdx + i) % 5 === 2) {
            const side = sIdx % 2 === 0 ? 1 : -1;
            const inset = out - 0.85;
            shellTris.quad(
              [mx + nx * inset * side - seg.dx / steps * 0.35, my + 1.05, mz + nz * inset * side - seg.dz / steps * 0.35],
              [mx + nx * inset * side + seg.dx / steps * 0.35, my + 1.05, mz + nz * inset * side + seg.dz / steps * 0.35],
              [mx + nx * inset * side + seg.dx / steps * 0.35, my + 2.55, mz + nz * inset * side + seg.dz / steps * 0.35],
              [mx + nx * inset * side - seg.dx / steps * 0.35, my + 2.55, mz + nz * inset * side - seg.dz / steps * 0.35],
              [0.22, 0.2, 0.18],
              [[0, 0], [1.4, 0], [1.4, 1.5], [0, 1.5]],
            );
          }
        }

      // One stone pier and lantern about every 90m. Not a rib on every slice.
      if (cor.kind === 'tunnel' && distAcc + seg.lenXZ >= nextRib) {
        nextRib += 90;
        const t = 0.5;
        const rx = seg.ax + seg.dx * t;
        const ry = seg.ay + seg.dy * t;
        const rz = seg.az + seg.dz * t;
        const yaw = Math.atan2(seg.dx, seg.dz);
        for (const side of [-1, 1]) {
          const px = rx + nx * side * (cor.halfWidth + 0.2);
          const pz = rz + nz * side * (cor.halfWidth + 0.2);
          addProp(boxGeo, wallMat, px, ry + 1.7, pz, 0.42, 3.4, 0.42, 0, yaw, 0);
        }
        addHangingLantern(rx, ry + 3.6, rz, warmLanternMat, 0xffaa55);
      } else if (cor.kind === 'entry' && sIdx === 2) {
        // Ramped descent/return lanterns keep the way to daylight legible.
        // They add no damage, loot or new movement authority.
        const marks=Math.max(1,Math.floor(seg.lenXZ/9));
        for(let j=1;j<=marks;j++){
          const t=j/(marks+1),px=seg.ax+seg.dx*t,
            py=seg.ay+seg.dy*t,pz=seg.az+seg.dz*t;
          for(const side of [-1,1]){
            const lx=px+nx*side*(cor.halfWidth+.35),
              lz=pz+nz*side*(cor.halfWidth+.35);
            addProp(boxGeo,timberMat,lx,py+.76,lz,.17,1.45,.17);
            addProp(boxGeo,bronzeMat,lx,py+1.5,lz,.32,.17,.32);
          }
          addHangingLantern(px,py+cor.ceiling*.72,pz,warmLanternMat,0xffc588);
        }
      }
      distAcc += seg.lenXZ;
    }

    // Floor-only corner fan. No vertical ring — those rings were walls you walked through.
    for (let w = 1; w < cor.waypoints.length - 1; w++) {
      const [wx, wy, wz] = cor.waypoints[w];
      if (wy > wolfveilHeight(wx, wz) - 0.8) continue;
      const fan = cor.halfWidth;
      const spokes = 6;
      for (let i = 0; i < spokes; i++) {
        const a0 = (i / spokes) * TAU, a1 = ((i + 1) / spokes) * TAU;
        floorTris.tri(
          [wx, wy, wz],
          [wx + Math.cos(a1) * fan, wy, wz + Math.sin(a1) * fan],
          [wx + Math.cos(a0) * fan, wy, wz + Math.sin(a0) * fan],
          [0.58, 0.55, 0.5],
        );
      }
    }
  }

  for (const cor of WOLFVEIL_CAVE_CORRIDORS) {
    if (cor.kind !== 'alcove') continue;
    const end = cor.waypoints[cor.waypoints.length - 1];
    const prev = cor.waypoints[cor.waypoints.length - 2];
    const fx = end[0] - prev[0], fz = end[2] - prev[2];
    const fl = Math.hypot(fx, fz) || 1;
    const ux = fx / fl, uz = fz / fl;
    const sx = -uz, sz = ux;
    addBrazier(end[0] - ux * 1.4, end[1], end[2] - uz * 1.4, 0xf4c078, false);
    shellTris.quad(
      [end[0] - sx * 2.2, end[1], end[2] - sz * 2.2],
      [end[0] + sx * 2.2, end[1], end[2] + sz * 2.2],
      [end[0] + sx * 2.2, end[1] + 2.8, end[2] + sz * 2.2],
      [end[0] - sx * 2.2, end[1] + 2.8, end[2] - sz * 2.2],
      [0.48, 0.46, 0.42],
      [[0, 0], [3.2, 0], [3.2, 2.2], [0, 2.2]],
    );
    floorTris.quad(
      [end[0] - ux * 2.4 - sx * 1.3, end[1] + 0.42, end[2] - uz * 2.4 - sz * 1.3],
      [end[0] - ux * 2.4 + sx * 1.3, end[1] + 0.42, end[2] - uz * 2.4 + sz * 1.3],
      [end[0] - ux * 0.7 + sx * 1.3, end[1] + 0.42, end[2] - uz * 0.7 + sz * 1.3],
      [end[0] - ux * 0.7 - sx * 1.3, end[1] + 0.42, end[2] - uz * 0.7 - sz * 1.3],
      [0.55, 0.52, 0.46],
      [[0, 0], [2.4, 0], [2.4, 1.2], [0, 1.2]],
    );
  }

  // Four real stone approach tracks; mountain/roof polygons remain SEALED.
  // The final outdoor apron leads to the existing E-activated arch, while
  // the internal ramp is still the only legal way down after entry.
  // Outdoor flagstone is its own walk mesh. The cave floor stays underground,
  // so a player on the hillside walks the pavement all the way to the arch.
  const pavementTris = new WolfveilTriangles();
  const caveAccessStats=appendWolfveilCaveAccessFloor(pavementTris);
  const pavementMat = floorMat.clone();
  pavementMat.name = 'SWV_CaveApproach_DressedFlagstone';
  pavementMat.polygonOffset = true;
  pavementMat.polygonOffsetFactor = -2;
  pavementMat.polygonOffsetUnits = -2;
  world.ownedMaterials.push(pavementMat);
  const pavementMesh = new THREE.Mesh(pavementTris.geometry(), pavementMat);
  pavementMesh.name = 'SWV_CaveApproach_FlagstonePavement';
  pavementMesh.receiveShadow = true;
  pavementMesh.userData = {
    walkable: true,
    approachPavement: true,
    clientGroundRaycast: true,
    notServerAuthority: true,
  };
  group.add(pavementMesh);
  world.walkableSurfaces ??= [];
  world.walkableSurfaces.push(pavementMesh);
  // Rock beds beside the path, off the walk, so each mouth sits in stone
  // instead of starting out of the grass.
  for (const approach of WOLFVEIL_CAVE_APPROACHES) {
    const cave = WOLFVEIL_EXPLORABLE_CAVES.find(item => item.id === approach.caveId);
    const [dx, dz] = cave.dir;
    const nx = -dz, nz = dx;
    for (const spot of [approach.points[1], approach.points[2]]) {
      for (const side of [-1, 1]) {
        const x = spot.x + nx * side * 5.6;
        const z = spot.z + nz * side * 5.6;
        const y = wolfveilHeight(x, z);
        const ox = nx * side, oz = nz * side;
        shellTris.quad(
          [x, y, z],
          [x + ox * 1.8, y + 0.2, z + oz * 1.8],
          [x + ox * 1.5 + dx * 2.2, y + 1.45, z + oz * 1.5 + dz * 2.2],
          [x + dx * 2.4, y + 1.2, z + dz * 2.4],
          [0.58, 0.56, 0.52],
          [[0, 0], [1.6, 0], [1.6, 1.3], [0, 1.3]],
        );
      }
    }
  }
  const caveAccessProps=appendWolfveilCaveAccessProps({
    addProp,addBrazier,stoneGeo:boxGeo,beamGeo:boxGeo,
    stoneMat:floorMat,timberMat,bronzeMat,
  });
  // Cosmetic approach shoulders and themed forecourts, independent of cave
  // geometry/collision. Always follows the current authored entry paths.
  const caveLandscape=installWolfveilCaveEntranceLandscaping(world,group);

  // 2. Cave entrances. Each rock mouth gets a jagged stone face around a genuinely
  // dark throat, boulder frames and a packed-earth apron, so the hillside reads as
  // a cave you can step into rather than an arch drawn over intact rock.
  const throatMat = new THREE.MeshStandardMaterial({
    color: 0x0b0f15,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  throatMat.name = 'SWV_Cave_EntranceThroat';
  const throatCapMat = new THREE.MeshBasicMaterial({
    color: 0x03060b,
    side: THREE.DoubleSide,
  });
  world.ownedMaterials.push(throatMat, throatCapMat);
  // The dark sleeve reads as a cave mouth from outside and is switched off once
  // the player is underground so it never blocks the view back out.
  const entranceOccluders = [];
  let occludersHidden = false;

  for (const frame of WOLFVEIL_CAVE_ENTRANCE_FRAMES) {
    const cave = WOLFVEIL_EXPLORABLE_CAVES.find(item => item.id === frame.caveId);
    const [mx, my, mz] = frame.mouth;
    const [dx, dz] = frame.dir;
    const [nx, nz] = frame.side;
    const yaw = frame.yaw;
    const hw = frame.openingHalfWidth, hh = frame.openingHeight;
    const faceX = mx - dx * 0.9, faceZ = mz - dz * 0.9;

    // Stone face: the inner edge IS the archway, the outer edge is the hillside.
    // The outer mass leans back into the slope so it never floats in the air.
    const facePoint = (ang, spread, lean) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      const lat = c * hw * spread;
      const up = s * hh * spread - 0.9;
      const px = faceX + nx * lat + dx * lean;
      const pz = faceZ + nz * lat + dz * lean;
      const jag = rockDisplacement(px, my + up, pz) * (spread > 1.05 ? 0.9 : 0.2);
      return [px + nx * jag, my + up + (s > 0.15 ? jag * 0.6 : 0), pz + nz * jag];
    };
    const leanAt = ang => 1.1 + 2.4 * Math.sin(ang);
    const faceSteps = 18;
    for (let i = 0; i < faceSteps; i++) {
      const a0 = (i / faceSteps) * Math.PI, a1 = ((i + 1) / faceSteps) * Math.PI;
      const s0 = 2.35 + 0.4 * Math.sin(i * 2.1);
      const s1 = 2.35 + 0.4 * Math.sin((i + 1) * 2.1);
      shellTris.quad(
        facePoint(a0, 1, 0), facePoint(a1, 1, 0),
        facePoint(a1, s1, leanAt(a1)), facePoint(a0, s0, leanAt(a0)),
        [0.62, 0.64, 0.68],
        [[i * 0.55, 0], [(i + 1) * 0.55, 0], [(i + 1) * 0.55, 2.4], [i * 0.55, 2.4]],
      );
    }
    // Broken rock teeth hanging along the rim of the mouth.
    for (let t = 1; t < 7; t++) {
      const ang = (t / 7) * Math.PI;
      const lip = facePoint(ang, 1, 0);
      addProp(coneGeo, wallMat, lip[0], lip[1] + 0.35, lip[2],
        0.32, 0.9 + (t % 3) * 0.45, 0.32, Math.PI, ang, 0);
    }

    // Dark throat: the mouth is a cave interior, never a window through the hill.
    const axis = new THREE.Vector3(dx, -0.2, dz).normalize();
    const throatStart = new THREE.Vector3(mx - dx * 0.7, my + hh * 0.42, mz - dz * 0.7);
    const throat = new THREE.Mesh(
      new THREE.CylinderGeometry(frame.throatEndRadius, frame.throatRadius,
        frame.throatDepth, 16, 1, true),
      throatMat,
    );
    throat.position.copy(throatStart).addScaledVector(axis, frame.throatDepth * 0.5);
    throat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    throat.receiveShadow = true;
    throat.raycast = () => {};
    group.add(throat);
    entranceOccluders.push(throat);
    const throatCap = new THREE.Mesh(
      new THREE.CircleGeometry(frame.throatEndRadius * 1.08, 16), throatCapMat);
    throatCap.position.copy(throatStart).addScaledVector(axis, frame.throatDepth);
    throatCap.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), axis.clone().negate());
    throatCap.raycast = () => {};
    group.add(throatCap);
    entranceOccluders.push(throatCap);

    // Boulders framing the mouth, wide of the walking line, plus a worn apron.
    for (const boulder of frame.boulders) {
      addProp(rockGeo, wallMat,
        mx + nx * boulder[0] + dx * boulder[1], my + boulder[2] * 0.55 - 0.15,
        mz + nz * boulder[0] + dz * boulder[1],
        boulder[2] * 1.5, boulder[2], boulder[2] * 1.3,
        boulder[3], boulder[3] * 1.7, 0);
    }
    addProp(cylGeo, floorMat, frame.apron[0], frame.apron[1] - 0.14, frame.apron[2],
      frame.apron[3], 0.14, frame.apron[3]);
    // A warm glow just inside the opening: the mouth reads as a lit cavern.
    registerLight(mx + dx * 1.8, my + 2.6, mz + dz * 1.8, frame.lightColor, 24, 24);

    // Stone front: seated arch, dark veil, outdoor stair on the hillside.
    // You walk the stair to the door; E at the arch enters. No floating sheet.
    const veil = new THREE.Mesh(
      new THREE.CircleGeometry(2.15, 18),
      new THREE.MeshBasicMaterial({ color: 0x07090d, side: THREE.DoubleSide }),
    );
    veil.position.set(mx + dx * 0.15, my + 1.7, mz + dz * 0.15);
    veil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-dx, 0, -dz));
    veil.raycast = () => {};
    group.add(veil);
    world.ownedMaterials.push(veil.material);

    // Door jambs and lintel, seated on the ground in front of the arch.
    const doorX = mx - dx * 0.85, doorZ = mz - dz * 0.85;
    for (const side of [-1, 1]) {
      const px = doorX + nx * side * 1.9, pz = doorZ + nz * side * 1.9;
      const ground = wolfveilHeight(px, pz);
      const base = Math.abs(ground - my) <= 1.3 ? ground : my;
      addProp(boxGeo, wallMat, px, base + 2.05, pz, 0.62, 4.1, 0.78, 0, yaw, 0);
    }
    addProp(boxGeo, wallMat, doorX, my + 3.95, doorZ, 4.5, 0.48, 0.72, 0, yaw, 0);
    // A second rock course and low retaining walls, so the arch is a built
    // mouth in the hill instead of a lintel standing on bare dirt.
    addProp(boxGeo, wallMat, doorX - dx * 0.35, my + 4.55, doorZ - dz * 0.35, 5.1, 0.42, 1.05, 0, yaw, 0);

    // One shared modular portal frame, finished with a motif for each cave.
    // These are decoration only: the walk opening and collision remain owned
    // by WOLFVEIL_CAVE_ENTRANCE_FRAMES and the shared cave layout.
    const accentMat = frame.theme === 'lantern_shrine' ? warmLanternMat
      : frame.theme === 'skylight_roots' ? jadeCrystalMat
      : frame.theme === 'ink_spring' ? inkRuneMat
      : amethystCrystalMat;
    for (const side of [-1, 1]) {
      const px = doorX + nx * side * 2.45;
      const pz = doorZ + nz * side * 2.45;
      addProp(boxGeo, bronzeMat, px, my + 2.1, pz, 0.16, 2.8, 0.14, 0, yaw, 0);
      if (frame.theme === 'lantern_shrine') {
        addHangingLantern(px, my + 5.1, pz, accentMat, frame.lightColor);
      } else if (frame.theme === 'skylight_roots') {
        addProp(boxGeo, accentMat, px, my + 4.15, pz, 0.26, 2.35, 0.28,
          0, yaw + side * 0.24, 0);
      } else if (frame.theme === 'ink_spring') {
        addProp(cylGeo, bronzeMat, px, my + 0.62, pz, 0.74, 1.24, 0.74);
        addProp(torusGeo, accentMat, px, my + 1.42, pz, 0.53, 0.53, 0.13,
          0, yaw, 0);
      } else {
        addProp(octaGeo, accentMat, px, my + 2.75, pz, 0.56, 1.45, 0.56,
          0, yaw + side * 0.28, 0);
      }
    }
    const crestY = my + 4.85;
    if (frame.theme === 'lantern_shrine' || frame.theme === 'ink_spring') {
      addProp(torusGeo, accentMat, doorX, crestY, doorZ, 0.66, 0.66, 0.12,
        0, yaw, 0);
    } else {
      addProp(octaGeo, accentMat, doorX, crestY, doorZ, 0.74, 0.92, 0.3,
        0, yaw, 0);
    }
    addProp(boxGeo, bronzeMat, doorX, my + 0.06, doorZ, 3.25, 0.08, 0.72,
      0, yaw, 0);

    for (let i = 0; i < 6; i++) {
      const f0 = -8.2 + i * 1.25, f1 = f0 + 1.25;
      for (const side of [-1, 1]) {
        const lat = side * 4.05;
        const at = f => {
          const x = mx + dx * f + nx * lat, z = mz + dz * f + nz * lat;
          return [x, wolfveilHeight(x, z), z];
        };
        const a = at(f0), b = at(f1);
        shellTris.quad(
          a, b, [b[0], b[1] + 1.28, b[2]], [a[0], a[1] + 1.28, a[2]],
          [0.55, 0.56, 0.58],
          [[0, f0 * 0.4], [1.2, f0 * 0.4], [1.2, 1.3], [0, 1.3]],
        );
      }
    }
  }

  // 3. Build the 5 Domed Subterranean Chambers + Unique Themed Designs Inside!
  const allChambers = [
    ...WOLFVEIL_EXPLORABLE_CAVES.map(c => ({ ...c.chamber, cave: c })),
    { ...WOLFVEIL_CAVE_HUB, cave: WOLFVEIL_CAVE_HUB },
    ...WOLFVEIL_MODULAR_CHAMBERS.map(ch=>({ ...ch, cave: ch })),
  ];

  // Check if a wall azimuth aligns with an incoming tunnel so chamber walls stay open at doorways
  const isCorridorOpening = (ch, angle) => {
    const wx = ch.x + Math.cos(angle) * ch.radius;
    const wz = ch.z + Math.sin(angle) * ch.radius;
    for (const cor of WOLFVEIL_CAVE_CORRIDORS) {
      for (const seg of cor.segments) {
        const len2 = seg.lenXZ * seg.lenXZ;
        const t = Math.max(0, Math.min(1, ((wx - seg.ax) * seg.dx + (wz - seg.az) * seg.dz) / len2));
        const d = Math.hypot(wx - (seg.ax + seg.dx * t), wz - (seg.az + seg.dz * t));
        if (d < cor.halfWidth + 1.35) return true;
      }
    }
    return false;
  };

  for (const ch of allChambers) {
    const R = ch.radius + 0.9;
    const H = ch.ceiling;
    const radialSegs = ch.id.startsWith('modular_') ? 8 : 12;
    const rings = [
      { r: 1.02, y: -0.5 },
      { r: 1.04, y: H * 0.34 },
      { r: 0.88, y: H * 0.68 },
      { r: 0.52, y: H * 0.92 },
      { r: 0.0, y: H * 1.05 },
    ];
    const openSkylight = ch.theme === 'skylight_roots';

    // Walkable radial stone floor with concentric Sumi-e medallion rings
    for (let i = 0; i < radialSegs; i++) {
      const a0 = (i / radialSegs) * TAU, a1 = ((i + 1) / radialSegs) * TAU;
      const innerR = R * 0.45;
      const c0 = [ch.x, ch.y, ch.z];
      const m0 = [ch.x + Math.cos(a0) * innerR, ch.y + 0.04, ch.z + Math.sin(a0) * innerR];
      const m1 = [ch.x + Math.cos(a1) * innerR, ch.y + 0.04, ch.z + Math.sin(a1) * innerR];
      const e0 = [ch.x + Math.cos(a0) * R, ch.y + 0.24, ch.z + Math.sin(a0) * R];
      const e1 = [ch.x + Math.cos(a1) * R, ch.y + 0.24, ch.z + Math.sin(a1) * R];
      floorTris.tri(c0, m1, m0, [0.74, 0.72, 0.67], [[0, 0], [Math.cos(a1) * 4, Math.sin(a1) * 4], [Math.cos(a0) * 4, Math.sin(a0) * 4]]);
      floorTris.quad(m0, m1, e1, e0, [0.58, 0.57, 0.54], [[0, 0], [3, 0], [3, 3], [0, 3]]);
    }

    // Domed rock walls & ceiling (leaving arch openings where tunnels join!)
    for (let tier = 0; tier < rings.length - 1; tier++) {
      if (openSkylight && tier === rings.length - 2) continue; // Oculus skylight at apex!
      const ra = rings[tier], rb = rings[tier + 1];
      for (let i = 0; i < radialSegs; i++) {
        const aMid = ((i + 0.5) / radialSegs) * TAU;
        if (tier <= 1 && isCorridorOpening(ch, aMid)) continue;
        const a0 = (i / radialSegs) * TAU, a1 = ((i + 1) / radialSegs) * TAU;
        const vtx = (ring, ang) => {
          if (ring.r === 0) return [ch.x, ch.y + ring.y, ch.z];
          const px = ch.x + Math.cos(ang) * R * ring.r;
          const pz = ch.z + Math.sin(ang) * R * ring.r;
          const py = ch.y + ring.y;
          const jag = tier > 0 ? rockDisplacement(px, py, pz) * 0.7 : 0;
          return [px + Math.cos(ang) * jag, py + jag * 0.4, pz + Math.sin(ang) * jag];
        };
        const p00 = vtx(ra, a0), p01 = vtx(ra, a1), p11 = vtx(rb, a1), p10 = vtx(rb, a0);
        const shade = 0.48 + 0.36 * (tier / (rings.length - 1));
        if (rb.r === 0) shellTris.tri(p00, p01, p10, [shade * 0.86, shade * 0.92, shade],
          [[i * 0.8, tier * 1.2], [(i + 1) * 0.8, tier * 1.2], [i * 0.8, tier * 1.2 + 1.1]]);
        else shellTris.quad(p00, p01, p11, p10, [shade * 0.86, shade * 0.92, shade],
          [[i * 0.8, tier * 1.2], [(i + 1) * 0.8, tier * 1.2], [(i + 1) * 0.8, tier * 1.2 + 1.4], [i * 0.8, tier * 1.2 + 1.4]]);
      }
    }

    // A few short teeth at the wall, never down into the camera.
    for (let s = 0; s < 5; s++) {
      const ang = (s / 5) * TAU + 0.4;
      const sr = R * 0.78;
      const sx = ch.x + Math.cos(ang) * sr;
      const sz = ch.z + Math.sin(ang) * sr;
      const len = 0.8 + (s % 3) * 0.25;
      addProp(coneGeo, wallMat, sx, ch.y + H - len * 0.5 - 0.2, sz, 0.28, len, 0.28, Math.PI, ang, 0);
    }

    // Four cut-stone piers. Low-poly stand-ins for fluted columns.
    if (ch.theme !== 'ancient_rotunda') {
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * TAU + 0.4;
        const pr = (ch.radius || R) * 0.62;
        addProp(cylGeo, wallMat,
          ch.x + Math.cos(ang) * pr, ch.y + 2.3, ch.z + Math.sin(ang) * pr,
          0.42, 4.6, 0.42);
        addProp(boxGeo, floorMat,
          ch.x + Math.cos(ang) * pr, ch.y + 4.7, ch.z + Math.sin(ang) * pr,
          0.7, 0.18, 0.7);
      }
    } else {
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * TAU;
        const pr = ch.radius * 0.55;
        addProp(cylGeo, wallMat, ch.x + Math.cos(ang) * pr, ch.y + 2.6, ch.z + Math.sin(ang) * pr, 0.5, 5.2, 0.5);
      }
      addProp(boxGeo, floorMat, ch.x, ch.y + 0.35, ch.z, 3.2, 0.7, 3.2);
      addProp(boxGeo, bronzeMat, ch.x, ch.y + 0.85, ch.z, 2.1, 0.28, 2.1);
    }

    // Sumi-e scroll: grass strokes and fire strokes, the valley's old idea
    // hung on the stone. Locked floors stay an unfinished grey painting.
    const story = caveFloorByCaveId(ch.cave?.id || ch.id);
    if (story && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const awake = caveFloorIsAwake(story, defeatedBosses);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 288;
      paintSumiCaveMural(canvas.getContext('2d'), canvas.width, canvas.height, story, awake);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      ownedTextures.push(texture);
      const mat = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      });
      mat.name = 'SWV_Cave_SumiScroll_' + story.order;
      world.ownedMaterials.push(mat);
      const scroll = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.5), mat);
      const dir = ch.cave?.dir || [0, 1];
      const back = (ch.radius || 14) * 0.62;
      scroll.position.set(ch.x + dir[0] * back, ch.y + 2.6, ch.z + dir[1] * back);
      scroll.lookAt(ch.x, ch.y + 2.6, ch.z);
      scroll.raycast = () => {};
      scroll.name = 'SWV_Cave_SumiMural_' + story.caveId;
      group.add(scroll);
      sumiScrolls.push({ mesh: scroll, floor: story, canvas, texture });
      for (const side of [-1, 1]) {
        const tx = ch.x + dir[0] * (back - 1.2) + (-dir[1]) * side * 2.4;
        const tz = ch.z + dir[1] * (back - 1.2) + dir[0] * side * 2.4;
        addProp(cylGeo, timberMat, tx, ch.y + 0.7, tz, 0.08, 1.4, 0.08);
        const flameCanvas = document.createElement('canvas');
        flameCanvas.width = 64;
        flameCanvas.height = 96;
        paintSumiCaveMural(flameCanvas.getContext('2d'), 64, 96, story, awake);
        const flameTex = new THREE.CanvasTexture(flameCanvas);
        flameTex.colorSpace = THREE.SRGBColorSpace;
        ownedTextures.push(flameTex);
        const flameMat = new THREE.SpriteMaterial({
          map: flameTex, transparent: true, depthWrite: false,
        });
        flameMat.name = 'SWV_Cave_SumiTorch_' + story.order;
        world.ownedMaterials.push(flameMat);
        const flame = new THREE.Sprite(flameMat);
        flame.position.set(tx, ch.y + 1.7, tz);
        flame.scale.set(0.55, 0.8, 1);
        flame.raycast = () => {};
        flame.visible = awake;
        group.add(flame);
        sumiTorches.push({ mesh: flame, floor: story, phase: side + story.order });
        if (awake) registerLight(tx, ch.y + 1.8, tz, 0xffb35c, 16, 14);
      }
    }

    // ─── UNIQUE INTERIOR DESIGN PER CAVERN ───
    if (ch.theme === 'lantern_shrine') {
      // Cave 1: Jade Lantern Grotto — overhead cedar rafters hung with warm & jade lanterns + Wolf-Spirit altar
      for (const zOff of [-4.5, 4.5]) {
        addProp(boxGeo, timberMat, ch.x, ch.y + H * 0.68, ch.z + zOff, R * 1.55, 0.28, 0.28);
        for (const xOff of [-6, -2, 2, 6]) {
          const isJade = Math.abs(xOff) === 2;
          addHangingLantern(
            ch.x + xOff, ch.y + H * 0.66, ch.z + zOff,
            isJade ? jadeCrystalMat : warmLanternMat,
            isJade ? 0x4fd4a8 : 0xffb35c,
          );
        }
      }
      // Low stepped meditation altar dais (walk-around / low step)
      addProp(cylGeo, floorMat, ch.x, ch.y + 0.18, ch.z, 3.2, 0.36, 3.2);
      addProp(octaGeo, jadeCrystalMat, ch.x, ch.y + 1.35, ch.z, 0.62, 1.15, 0.62);
      registerLight(ch.x, ch.y + 1.8, ch.z, 0x4fd4a8, 28, 34);
    } else if (ch.theme === 'skylight_roots') {
      // Cave 2: Whispering Root Hollow — twisting giant cedar roots descending around a glowing skylight shaft
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xd9f99d, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false,
      });
      world.ownedMaterials.push(beamMat);
      addProp( new THREE.CylinderGeometry(2.2, 5.4, H * 1.02, 16, 1, true), beamMat, ch.x, ch.y + H * 0.5, ch.z, 1, 1, 1);
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * TAU;
        const rx = ch.x + Math.cos(ang) * (R * 0.58);
        const rz = ch.z + Math.sin(ang) * (R * 0.58);
        addProp(cylGeo, timberMat, rx, ch.y + H * 0.48, rz, 0.34, H * 0.98, 0.28, Math.sin(ang) * 0.22, ang, Math.cos(ang) * 0.22);
        addProp(octaGeo, jadeCrystalMat, rx * 0.98 + ch.x * 0.02, ch.y + 0.55, rz * 0.98 + ch.z * 0.02, 0.55, 0.42, 0.55, 0, ang, 0);
      }
      registerLight(ch.x, ch.y + H * 0.72, ch.z, 0xbef264, 34, 38);
      addBrazier(ch.x - 5.5, ch.y, ch.z, 0x86efac, true);
      addBrazier(ch.x + 5.5, ch.y, ch.z, 0x86efac, true);
    } else if (ch.theme === 'ink_spring') {
      // Cave 3: Sunken Inkstone Cistern — luminous subterranean spring pool + stepping stones + ink rune steles
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.55, R * 1.55), cisternWaterMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(ch.x, ch.y + 0.09, ch.z);
      pool.renderOrder = 3;
      pool.raycast = () => {};
      group.add(pool);
      // Stepping-stone causeway + inkstone calligraphy steles around rim
      for (let s = -3; s <= 3; s++) {
        addProp(cylGeo, floorMat, ch.x + s * 2.1, ch.y + 0.13, ch.z + Math.sin(s) * 0.6, 0.88, 0.22, 0.88);
      }
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * TAU + 0.4;
        const sx = ch.x + Math.cos(ang) * (R * 0.68);
        const sz = ch.z + Math.sin(ang) * (R * 0.68);
        addProp(boxGeo, wallMat, sx, ch.y + 1.55, sz, 0.95, 3.1, 0.34, 0, -ang, 0);
        addProp(boxGeo, inkRuneMat, sx - Math.cos(ang) * 0.19, ch.y + 1.65, sz - Math.sin(ang) * 0.19, 0.18, 2.1, 0.06, 0, -ang, 0);
      }
      registerLight(ch.x, ch.y + 2.4, ch.z, 0x38bdf8, 30, 36);
      addBrazier(ch.x, ch.y + 0.15, ch.z - 6.2, 0xfbbf24, false);
    } else if (ch.theme === 'crystal_geode') {
      // Cave 4: Echoing Crystal Vault — towering amethyst & cyan crystal clusters + warm fire braziers
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * TAU + 0.15;
        if (isCorridorOpening(ch, ang)) continue;
        const cr = R * 0.72;
        const cx = ch.x + Math.cos(ang) * cr;
        const cz = ch.z + Math.sin(ang) * cr;
        const mat = k % 2 === 0 ? amethystCrystalMat : jadeCrystalMat;
        for (let shard = 0; shard < 3; shard++) {
          const h = 1.8 + shard * 0.85 + (k % 2) * 0.5;
          addProp(
            cylGeo, mat,
            cx + (shard - 1) * 0.45, ch.y + h * 0.45, cz + ((shard % 2) - 0.5) * 0.4,
            0.28, h, 0.28,
            (shard - 1) * 0.22, ang + shard, -Math.cos(ang) * 0.26,
          );
        }
        if (k % 3 === 0) {
          registerLight(cx, ch.y + 2.2, cz, k % 2 === 0 ? 0xa855f7 : 0x2dd4bf, 26, 32);
        }
      }
      addBrazier(ch.x - 4.2, ch.y, ch.z, 0xffa64d, false);
      addBrazier(ch.x + 4.2, ch.y, ch.z, 0xffa64d, false);
    } else if (ch.theme === 'ancient_rotunda') {
      // Central 5-Way Subterranean Wolf-Spirit Rotunda Hub
      addProp(torusGeo, inkRuneMat, ch.x, ch.y + 0.08, ch.z, 4.6, 4.6, 0.35, Math.PI / 2, 0, 0);
      addBrazier(ch.x, ch.y + 0.12, ch.z, 0xffb35c, false);
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * TAU;
        const px = ch.x + Math.cos(ang) * (R * 0.62);
        const pz = ch.z + Math.sin(ang) * (R * 0.62);
        addHangingLantern(px, ch.y + H * 0.68, pz, k % 2 ? jadeCrystalMat : warmLanternMat, k % 2 ? 0x5eead4 : 0xffb35c);
      }
    }
  }

  // A physically connected owner-authored modular extension. The visual
  // floor shares coordinates with the canonical sampler & wall collision.
  const modularVisual=appendWolfveilModularCaveVisuals({
    group,floorTris,shellTris,addProp,addBrazier,
    boxGeo,cylGeo,octaGeo,torusGeo,wallMat,floorMat,
    bronzeMat,timberMat,jadeCrystalMat,amethystCrystalMat,
  });
  world.ownedMaterials.push(modularVisual.waterMaterial);

  // The owner's sumi-e hallway (tiled path, painted brick walls, gold and
  // silver trim) along the three modular tunnels, built from the owner's own
  // kit and baked to one mesh per material. Scenery only: the stone floor
  // and the tunnel walls above still decide where a player can walk. If it
  // cannot be built the tunnels stay bare rock, as before.
  let sumiHalls = null;
  try {
    sumiHalls = buildWolfveilSumiHalls({ THREE });
    group.add(sumiHalls.object);
  } catch (error) {
    console.warn('[Wolfveil caves] sumi-e hallway unavailable; tunnels stay bare rock:', error);
  }

  // Lightweight, camera-facing cave wayfinding: the stone arches now have
  // deliberate E entry/exit and the central rotunda signs point to EACH
  // of the four physically connected corridors. Sprites never raycast and
  // do not create additional walkable/collision floors.
  const wayfindingMaterials=[];
  const addWayfinding=(label,x,y,z,width=8.2)=>{
    if(typeof document==='undefined'||typeof document.createElement!=='function')return;
    const canvas=document.createElement('canvas');
    canvas.width=768;canvas.height=160; // fixed aspect, no squash
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    ctx.fillStyle='rgba(9,27,43,.92)';
    ctx.fillRect(6,7,756,146);
    ctx.strokeStyle='#e5bf83';ctx.lineWidth=5;ctx.strokeRect(10,10,748,140);
    ctx.fillStyle='#ffe1ab';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='bold 36px Georgia,serif';
    const parts = String(label).split(' · ');
    if (parts.length > 1) {
      ctx.fillText(parts[0], 384, 58);
      ctx.fillText(parts.slice(1).join(' · '), 384, 108);
    } else {
      ctx.fillText(label, 384, 80);
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    ownedTextures.push(texture);
    const mat=new THREE.SpriteMaterial({map:texture,transparent:true,
      depthWrite:false,depthTest:true});
    wayfindingMaterials.push(mat);
    const sprite=new THREE.Sprite(mat);
    sprite.name='SWV_CaveWayfinding_'+label.replace(/[^a-z0-9]/gi,'_');
    sprite.position.set(x,y,z);sprite.scale.set(width,1.7,1);
    sprite.raycast=()=>{};
    group.add(sprite);
    return sprite;
  };
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES) {
    const [mx,mz]=cave.mouth,[dx,dz]=cave.dir;
    addWayfinding('Level 1 · walk in',
      cave.threshold[0],cave.threshold[1]+3.4,cave.threshold[2],10.2);
    const ix = mx + dx * WOLFVEIL_CAVE_DROP.exitAlong, iz = mz + dz * WOLFVEIL_CAVE_DROP.exitAlong;
    const inside=sampleWolfveilCaveSpace(ix,iz,.62);
    if(inside)addWayfinding('Level 1 · E · Return Outside',ix,inside.floorY+3,iz,9);
  }
  for (const cor of WOLFVEIL_CAVE_CORRIDORS) {
    if (cor.kind !== 'tunnel') continue;
    const a = cor.waypoints[0], b = cor.waypoints.at(-1);
    if (Math.abs(a[1] - b[1]) < 6) continue;
    const high = a[1] > b[1] ? a : b;
    const low = a[1] > b[1] ? b : a;
    const dx = low[0] - high[0], dz = low[2] - high[2];
    const len = Math.hypot(dx, dz) || 1;
    addWayfinding('Stairs down · not an elevator',
      high[0] + dx / len * 8, high[1] + 3.1, high[2] + dz / len * 8, 11);
  }
  const rotunda=WOLFVEIL_CAVE_HUB;
  for(const edge of navigationGraph.edges) {
    if(edge.from!==rotunda.id&&edge.to!==rotunda.id)continue;
    const nextId=edge.from===rotunda.id?edge.to:edge.from;
    const next=navigationGraph.nodes.find(node=>node.id===nextId);
    if(!next)continue;
    const dx=next.x-rotunda.x,dz=next.z-rotunda.z;
    const len=Math.hypot(dx,dz)||1;
    addWayfinding(next.name,rotunda.x+dx/len*7,
      rotunda.y+3.3,rotunda.z+dz/len*7,10.2);
  }

  addWayfinding('T junction · Vault left · Canyon right',
    WOLFVEIL_MODULAR_JUNCTION.x,
    WOLFVEIL_MODULAR_JUNCTION.y+3.2,
    WOLFVEIL_MODULAR_JUNCTION.z,13.5);
  addWayfinding('Canyon · three bridges · arena ahead',
    WOLFVEIL_MODULAR_CANYON.entrance.x,
    WOLFVEIL_MODULAR_CANYON.entrance.y+4,
    WOLFVEIL_MODULAR_CANYON.entrance.z,12.2);
  addWayfinding('Four-way hub · choose a route',
    WOLFVEIL_MODULAR_WAYFINDER_HUB.x,
    WOLFVEIL_MODULAR_WAYFINDER_HUB.y+3.2,
    WOLFVEIL_MODULAR_WAYFINDER_HUB.z,14);
  addWayfinding('Sunken sanctuary · north passage',
    WOLFVEIL_MODULAR_SANCTUARY.x,
    WOLFVEIL_MODULAR_SANCTUARY.y+4,
    WOLFVEIL_MODULAR_SANCTUARY.z,13);
  addWayfinding('Echo gallery · return loop',
    WOLFVEIL_MODULAR_ECHO_GALLERY.x,
    WOLFVEIL_MODULAR_ECHO_GALLERY.y+3,
    WOLFVEIL_MODULAR_ECHO_GALLERY.z,12);
  addWayfinding('Sealed reliquary · eastern branch',
    WOLFVEIL_MODULAR_SECRET_CACHE.x,
    WOLFVEIL_MODULAR_SECRET_CACHE.y+3,
    WOLFVEIL_MODULAR_SECRET_CACHE.z,12);
  addWayfinding('L-turn · canyon route',
    WOLFVEIL_MODULAR_L_CORNER.x,
    WOLFVEIL_MODULAR_L_CORNER.y+3,
    WOLFVEIL_MODULAR_L_CORNER.z,12);

  const floorMesh = new THREE.Mesh(floorTris.geometry(), floorMat);
  floorMesh.name = 'SWV_CaveSystem_WalkableStoneFloor';
  floorMesh.receiveShadow = true;
  floorMesh.userData = {
    walkable: true,
    caveFloor: true,
    clientGroundRaycast: true,
    notServerAuthority: true,
  };
  group.add(floorMesh);
  world.walkableSurfaces ??= [];
  world.walkableSurfaces.push(floorMesh);

  const shellMesh = new THREE.Mesh(shellTris.geometry(), wallMat);
  shellMesh.name = 'SWV_CaveSystem_VaultedRockShell';
  shellMesh.castShadow = true;
  shellMesh.receiveShadow = true;
  shellMesh.raycast = () => {}; // Never intercept downward sky foot-rays from y=1500!
  group.add(shellMesh);

  // Bounded 6-PointLight proximity pool: illuminates whichever cavern/tunnel the player explores
  const lightPool = Array.from({ length: LIGHT_POOL_SIZE }, (_, idx) => {
    const l = new THREE.PointLight(0xffb35c, 0, 30, 1.6);
    l.name = `SWV_Cave_DynamicLight_${idx}`;
    group.add(l);
    return l;
  });

  // Draw budget (WolfveilCaveDrawBudget.mjs): parts that lie under the turf
  // are only drawn while the player is underground, and identical props share
  // one draw. It fails open: on any error the caves stay exactly as built.
  let drawBudget = null;
  try {
    const flameMeshes = new Set(animatedFlames.map(flame => flame.mesh));
    drawBudget = installWolfveilCaveDrawBudget({
      Group: THREE.Group,
      InstancedMesh: THREE.InstancedMesh,
      group,
      heightAt: createWolfveilTerrainSurfaceSampler(),
      mouths: WOLFVEIL_CAVE_ENTRANCE_FRAMES.map(frame => [frame.mouth[0], frame.mouth[2]]),
      keep: [floorMesh, shellMesh, pavementMesh, ...entranceOccluders, ...lightPool],
      staticProps: staticProps.filter(mesh => !flameMeshes.has(mesh)),
    });
  } catch (error) {
    console.warn('[Wolfveil caves] draw budget unavailable; caves left as built:', error);
  }

  let elapsed = 0;
  // A fresh login never implicitly authorizes an underground cave session:
  // old fall-through checkpoints are rescued onto the intact surface instead
  // of restoring the very collision bug the owner is reporting.
  let activeCaveId = null; // set by pressing E at an arch, or by walking into the mouth
  // Tells the draw budget where the player is, in the same call that moves
  // them, so the interior is on screen the moment they arrive in it.
  const syncDrawBudget = (worldPos = null) => drawBudget?.update({
    inside: activeCaveId !== null,
    player: worldPos ? { x: worldPos.x, y: worldPos.y, z: worldPos.z - offsetZ } : null,
  });
  // The four entrances are real openings: stepping into a stone mouth descends
  // into that cave. The E prompt still works for every approach angle.
  const enterFromMouth = (worldPos) => {
    if (activeCaveId || !worldPos) return null;
    if (![worldPos.x, worldPos.y, worldPos.z].every(Number.isFinite)) return null;
    const cave = caveEntranceAt(worldPos.x, worldPos.y, worldPos.z - offsetZ);
    if (!cave) return null;
    const travel = planWolfveilCaveInteraction(
      { x: cave.mouth[0], y: cave.mouthY, z: cave.mouth[1] });
    if (!travel) return null;
    // Walk in on level 1. This only steps you onto the hall past the door
    // stair. It does not drop you to the deep floor, and it is not an elevator.
    activeCaveId = cave.id;
    worldPos.x = travel.x;
    worldPos.y = travel.y;
    worldPos.z = travel.z + offsetZ;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('skillActivatedToast', {
        detail: { text: 'Level 1 · ' + cave.name + ' · stairs down are past the hall' },
      }));
    }
    return { action: 'enter', name: cave.name, caveId: cave.id };
  };
  return {
    group,
    floorMesh,
    pavementMesh,
    shellMesh,
    caves: WOLFVEIL_EXPLORABLE_CAVES,
    hub: WOLFVEIL_CAVE_HUB,
    corridors: WOLFVEIL_CAVE_CORRIDORS,
    navigationGraph,
    approaches:WOLFVEIL_CAVE_APPROACHES,
    approachBuild:{...caveAccessStats,waymarks:caveAccessProps.length,
      landscapeDecor:caveLandscape.placements,landscapeDrawGroups:caveLandscape.drawGroups},
    lightAnchorCount: lightAnchors.length,
    floors: WOLFVEIL_CAVE_FLOORS,
    modularCave:{
      canyon:WOLFVEIL_MODULAR_CANYON,
      treasureRoom:WOLFVEIL_MODULAR_TREASURE_ROOM,
      junction:WOLFVEIL_MODULAR_JUNCTION,
      build:modularVisual.stats,
      halls:sumiHalls?.stats??null,
      hallsObject:sumiHalls?.object??null,
      treasureChestsDecorativeOnly:true,bossGameplayImplemented:false,
    },
    // Draw budget controls and numbers (diagnostics, A/B test, map export).
    drawBudget: {
      stats() { return drawBudget?.stats() ?? null; },
      setEnabled(enabled) { return drawBudget?.setEnabled(enabled) ?? false; },
      isInteriorShown() { return drawBudget?.isInteriorShown() ?? true; },
    },
    /** Keeps the whole cave network drawn while `task` runs (map export). */
    withInteriorShown(task) {
      return drawBudget ? drawBudget.withInteriorShown(task) : Promise.resolve().then(task);
    },
    awakeFloors(){return awakeCaveFloors(defeatedBosses);},
    noteBossDefeated(bossId) {
      // Records the painting, never a reward. Combat still owns the kill.
      if (!bossId) return awakeCaveFloors(defeatedBosses);
      defeatedBosses.add(bossId);
      for (const scroll of sumiScrolls) {
        const awake = caveFloorIsAwake(scroll.floor, defeatedBosses);
        const ctx = scroll.canvas.getContext('2d');
        paintSumiCaveMural(ctx, scroll.canvas.width, scroll.canvas.height, scroll.floor, awake);
        scroll.texture.needsUpdate = true;
      }
      for (const torch of sumiTorches) {
        torch.mesh.visible = caveFloorIsAwake(torch.floor, defeatedBosses);
      }
      return awakeCaveFloors(defeatedBosses);
    },
    isActive(){return activeCaveId!==null;},
    walkIn: enterFromMouth,
    playerGroundY(worldPos) {
      if (!worldPos) return null;
      // Outdoor players must NEVER be snapped to the cave floor merely
      // because they are standing over the Crystal Vault/waterfall roof.
      if(!activeCaveId)return null;
      return sampleWolfveilPlayerCaveFloorY(
        worldPos.x,worldPos.y,worldPos.z-offsetZ,{insideCave:true});
    },
    interact(worldPos) {
      if(!worldPos)return null;
      const travel=planWolfveilCaveInteraction({
        x:worldPos.x,y:worldPos.y,z:worldPos.z-offsetZ,
      },{insideCave:!!activeCaveId});
      if(!travel)return null;
      // A single committed X/Y/Z teleport never leaves half a frame on an
      // unsupported cliff or samples the underside as the outdoor surface.
      activeCaveId=travel.action==='enter'?travel.caveId:null;
      worldPos.x=travel.x;worldPos.y=travel.y;worldPos.z=travel.z+offsetZ;
      syncDrawBudget(worldPos);
      return {action:travel.action,name:travel.name,caveId:travel.caveId};
    },
    resolveCollision(worldPos, prevWorldPos, radius = 0.62) {
      if (!worldPos || !prevWorldPos) return false;
      const localNow = { x: worldPos.x, y: worldPos.y, z: worldPos.z - offsetZ };
      const localPrev = {
        x:prevWorldPos.x,y:prevWorldPos.y??worldPos.y,z:prevWorldPos.z-offsetZ,
      };
      // Outside: only the actual trail's stone side rails collide. Neither
      // raycasts nor decoration can open an unauthorized cave session.
      const railHit=resolveWolfveilCaveEntranceRailCollision(localNow,localPrev,radius);
      if(!activeCaveId){
        if(railHit){worldPos.x=localNow.x;worldPos.z=localNow.z+offsetZ;}
        return railHit;
      }
      if(!activeCaveId || !worldPos || !prevWorldPos) return false;
      let hit=resolveWolfveilCaveWallCollision(localNow,localPrev,radius)||railHit;
      // Keep the currently authored E-required underground exit. Even a
      // knockback from an invalid corridor point cannot pass through the
      // solid overworld roof into daylight.
      if(!sampleWolfveilCaveSpace(localNow.x,localNow.z,radius)){
        localNow.x=localPrev.x;localNow.z=localPrev.z;
        hit=true;
      }
      if(hit){worldPos.x=localNow.x;worldPos.z=localNow.z+offsetZ;}
      return hit;
    },
    update(dt, playerWorldPos = null) {
      elapsed += Math.max(0, Math.min(dt || 0, 0.1));
      cisternUniforms.uTime.value = elapsed;
      for (const f of animatedFlames) {
        const s = f.gentle
          ? 1 + 0.04 * Math.sin(elapsed * 2.4 + f.phase)
          : 0.88 + 0.18 * Math.sin(elapsed * 8.5 + f.phase);
        f.mesh.scale.y = Math.abs(f.mesh.scale.y) * (0.96 + 0.04 * s);
        f.mesh.position.y = f.baseY + (f.gentle ? 0.03 * Math.sin(elapsed * 1.9 + f.phase) : 0);
      }
      for (const torch of sumiTorches) {
        if (!torch.mesh.visible) continue;
        const lick = 0.82 + 0.18 * Math.sin(elapsed * 9.2 + torch.phase);
        torch.mesh.scale.y = 0.8 * lick;
        torch.mesh.material.opacity = 0.72 + 0.28 * lick;
      }

      // Server-authoritative duel play owns the body position; never teleport it.
      if (playerWorldPos && !(typeof window !== 'undefined' && window.__game3dDedicatedMode))
        enterFromMouth(playerWorldPos);
      const hideOccluders = activeCaveId !== null;
      if (hideOccluders !== occludersHidden) {
        occludersHidden = hideOccluders;
        for (const mesh of entranceOccluders) mesh.visible = !hideOccluders;
      }
      syncDrawBudget(playerWorldPos);
      if (!playerWorldPos || !Number.isFinite(playerWorldPos.x) || !Number.isFinite(playerWorldPos.z)) {
        for (const l of lightPool) l.intensity = 0;
        return;
      }
      const lx = playerWorldPos.x, lz = playerWorldPos.z - offsetZ;
      const ranked = lightAnchors
        .map(a => ({ a, d2: (a.x - lx) * (a.x - lx) + (a.z - lz) * (a.z - lz) }))
        .sort((p, q) => p.d2 - q.d2);

      for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
        const pick = ranked[i];
        const light = lightPool[i];
        if (!pick || pick.d2 > 95 * 95) {
          light.intensity = 0;
          continue;
        }
        const fade = 1 - Math.min(1, Math.max(0, (Math.sqrt(pick.d2) - 48) / 47));
        const flicker = 0.92 + 0.08 * Math.sin(elapsed * 6.2 + i * 1.7);
        light.position.set(pick.a.x, pick.a.y, pick.a.z);
        light.color.copy(pick.a.color);
        light.distance = pick.a.distance;
        light.intensity = pick.a.intensity * fade * flicker;
      }
    },
    dispose() {
      drawBudget?.dispose();
      modularVisual.waterGeometry.dispose();
      sumiHalls?.dispose();
      for (const mat of wayfindingMaterials) mat.dispose();
      for (const t of ownedTextures) t.dispose();
      boxGeo.dispose();
      cylGeo.dispose();
      coneGeo.dispose();
      sphereGeo.dispose();
      octaGeo.dispose();
      torusGeo.dispose();
      rockGeo.dispose();
    },
  };
}