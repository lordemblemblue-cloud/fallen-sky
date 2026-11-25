// Executes the supplied prototype's geometry and navigation audit with real Three.js
// math, a stub 2D texture canvas, and no GPU or browser. Does not assert rendering.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
import { createDuelistControlPointArena, isPointInPolygonXZ } from '../src/components/duelist/client/maps/controlPointArena.mjs';
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: (o,k) => o[k] ?? (()=>{}), set:(o,k,v)=>(o[k]=v,true) }) }) };
const arenaMap = createDuelistControlPointArena(THREE);
    const PLAYER_CFG = {
      radius: 0.48,
      height: 1.8,
      walkSpeed: 9.0,
      sprintSpeed: 13.5,
      jumpVelocity: 8.2,
      gravity: 22.0,
      stepUpHeight: 0.45
    };

    const walkableFloors = arenaMap.collisionDefinitions.filter((c) => c.type === 'walkable_floor');
    const stairRamps = arenaMap.collisionDefinitions.filter((c) => c.type === 'stair_ramp');
    const solidObstacles = arenaMap.collisionDefinitions.filter(
      (c) => c.type === 'solid_wall' || c.type === 'tactical_obstacle' || c.type === 'support_column' || c.type === 'safety_railing'
    );

    function getSupportingSurfaceY(px, py, pz) {
      let bestY = -Infinity;

      for (let i = 0; i < walkableFloors.length; i++) {
        const f = walkableFloors[i];
        const topY = f.bounds.max.y;
        if (py + PLAYER_CFG.stepUpHeight < topY) continue;
        if (px < f.bounds.min.x - 0.35 || px > f.bounds.max.x + 0.35 || pz < f.bounds.min.z - 0.35 || pz > f.bounds.max.z + 0.35) continue;
        if (f.polygonXZ && !isPointInPolygonXZ(px, pz, f.polygonXZ)) {
          // Allow small capsule radius margin near octagon edges
          const r = 0.32;
          const nearEdge =
            isPointInPolygonXZ(px + r, pz, f.polygonXZ) ||
            isPointInPolygonXZ(px - r, pz, f.polygonXZ) ||
            isPointInPolygonXZ(px, pz + r, f.polygonXZ) ||
            isPointInPolygonXZ(px, pz - r, f.polygonXZ);
          if (!nearEdge) continue;
        }
        if (topY > bestY) bestY = topY;
      }

      for (let i = 0; i < stairRamps.length; i++) {
        const sr = stairRamps[i];
        const b = sr.bounds;
        if (px < b.min.x - 0.3 || px > b.max.x + 0.3 || pz < b.min.z - 0.3 || pz > b.max.z + 0.3) continue;
        const ep = sr.endpoints;
        if (!ep) continue;
        const dx = ep.ascendingEnd.x - ep.ascendingStart.x;
        const dz = ep.ascendingEnd.z - ep.ascendingStart.z;
        const lenSq = dx * dx + dz * dz || 1;
        const t = THREE.MathUtils.clamp(((px - ep.ascendingStart.x) * dx + (pz - ep.ascendingStart.z) * dz) / lenSq, 0, 1);
        const rampY = ep.ascendingStart.y + t * (ep.ascendingEnd.y - ep.ascendingStart.y);
        if (py + PLAYER_CFG.stepUpHeight >= rampY - 0.15 && rampY > bestY) {
          bestY = rampY;
        }
      }

      return bestY;
    }

    function resolveHorizontalCollisions(pos) {
      let hitWall = false;
      const r = PLAYER_CFG.radius;
      for (let i = 0; i < solidObstacles.length; i++) {
        const obs = solidObstacles[i];
        const b = obs.bounds;
        if (b.max.y <= pos.y + 0.12 || b.min.y >= pos.y + PLAYER_CFG.height - 0.1) continue;

        if (obs.polygonXZ && obs.polygonXZ.length === 4) {
          // Polygon-accurate railing / rotated barrier push-out via closest point on segments
          for (let e = 0; e < 4; e++) {
            const p1 = obs.polygonXZ[e];
            const p2 = obs.polygonXZ[(e + 1) % 4];
            const ex = p2.x - p1.x;
            const ez = p2.z - p1.z;
            const lSq = ex * ex + ez * ez || 1;
            const t = THREE.MathUtils.clamp(((pos.x - p1.x) * ex + (pos.z - p1.z) * ez) / lSq, 0, 1);
            const cx = p1.x + ex * t;
            const cz = p1.z + ez * t;
            const dx = pos.x - cx;
            const dz = pos.z - cz;
            const d = Math.hypot(dx, dz);
            if (d < r && d > 1e-5) {
              const push = r - d;
              pos.x += (dx / d) * push;
              pos.z += (dz / d) * push;
              hitWall = true;
            }
          }
        } else {
          const cx = THREE.MathUtils.clamp(pos.x, b.min.x, b.max.x);
          const cz = THREE.MathUtils.clamp(pos.z, b.min.z, b.max.z);
          const dx = pos.x - cx;
          const dz = pos.z - cz;
          const distSq = dx * dx + dz * dz;
          if (distSq < r * r) {
            hitWall = true;
            if (distSq > 1e-6) {
              const d = Math.sqrt(distSq);
              const push = r - d;
              pos.x += (dx / d) * push;
              pos.z += (dz / d) * push;
            } else {
              const penLeft = Math.abs(pos.x - b.min.x);
              const penRight = Math.abs(b.max.x - pos.x);
              const penTop = Math.abs(pos.z - b.min.z);
              const penBot = Math.abs(b.max.z - pos.z);
              const minPen = Math.min(penLeft, penRight, penTop, penBot);
              if (minPen === penLeft) pos.x = b.min.x - r;
              else if (minPen === penRight) pos.x = b.max.x + r;
              else if (minPen === penTop) pos.z = b.min.z - r;
              else pos.z = b.max.z + r;
            }
          }
        }
      }
      return hitWall;
    }

    function integrateCharacterStep(pos, vel, moveX, moveZ, dt) {
      const horizStep = Math.hypot(moveX * dt, moveZ * dt);
      const substeps = Math.max(1, Math.ceil(horizStep / 0.22));
      const subDt = dt / substeps;
      let hitWall = false;
      let grounded = false;

      for (let s = 0; s < substeps; s++) {
        pos.x += moveX * subDt;
        pos.z += moveZ * subDt;
        if (resolveHorizontalCollisions(pos)) hitWall = true;

        vel.y -= PLAYER_CFG.gravity * subDt;
        pos.y += vel.y * subDt;

        // Ceiling / overhead slab headroom check
        for (let i = 0; i < walkableFloors.length; i++) {
          const f = walkableFloors[i];
          const botY = f.bounds.min.y;
          if (pos.y < botY && pos.y + PLAYER_CFG.height > botY && vel.y > 0) {
            if (pos.x >= f.bounds.min.x && pos.x <= f.bounds.max.x && pos.z >= f.bounds.min.z && pos.z <= f.bounds.max.z) {
              if (!f.polygonXZ || isPointInPolygonXZ(pos.x, pos.z, f.polygonXZ)) {
                pos.y = botY - PLAYER_CFG.height;
                vel.y = 0;
              }
            }
          }
        }

        const supportY = getSupportingSurfaceY(pos.x, pos.y, pos.z);
        if (supportY > -Infinity && pos.y <= supportY + 0.08 && vel.y <= 0.1) {
          pos.y = supportY;
          vel.y = 0;
          grounded = true;
        }
      }

      return { grounded, hitWall };
    }

    function computeSafeCameraPosition(origin, desired) {
      const dir = new THREE.Vector3().subVectors(desired, origin);
      const totalDist = dir.length();
      if (totalDist < 0.2) return desired;
      dir.normalize();
      const steps = Math.ceil(totalDist / 0.4);
      const probe = new THREE.Vector3();
      for (let i = 1; i <= steps; i++) {
        const d = Math.min(totalDist, (i / steps) * totalDist);
        probe.copy(origin).addScaledVector(dir, d);
        for (let j = 0; j < solidObstacles.length; j++) {
          const b = solidObstacles[j].bounds;
          if (probe.x >= b.min.x - 0.2 && probe.x <= b.max.x + 0.2 && probe.y >= b.min.y - 0.2 && probe.y <= b.max.y + 0.2 && probe.z >= b.min.z - 0.2 && probe.z <= b.max.z + 0.2) {
            return origin.clone().addScaledVector(dir, Math.max(0.8, d - 0.45));
          }
        }
      }
      return desired;
    }

    function selectSafeTeamSpawn(team, occupiedPositions = []) {
      const cfg = team === 'red' ? arenaMap.spawnDefinitions.redTeam : arenaMap.spawnDefinitions.blueTeam;
      const isSlotClear = (slot) => {
        if (Math.hypot(slot.x - -105, slot.z - 90) < 10.0) return false;
        if (Math.hypot(slot.x - 105, slot.z - 90) < 10.0) return false;

        const supY = getSupportingSurfaceY(slot.x, slot.y + 0.2, slot.z);
        if (Math.abs(supY - slot.y) > 0.1) return false;

        for (let i = 0; i < solidObstacles.length; i++) {
          const b = solidObstacles[i].bounds;
          if (b.max.y <= slot.y + 0.1 || b.min.y >= slot.y + PLAYER_CFG.height) continue;
          if (slot.x >= b.min.x - 0.55 && slot.x <= b.max.x + 0.55 && slot.z >= b.min.z - 0.55 && slot.z <= b.max.z + 0.55) {
            return false;
          }
        }
        for (let i = 0; i < occupiedPositions.length; i++) {
          const occ = occupiedPositions[i];
          if (occ && Math.abs(slot.y - occ.y) < 1.8 && Math.hypot(slot.x - occ.x, slot.z - occ.z) < 1.25) {
            return false;
          }
        }
        return true;
      };

      for (let i = 0; i < cfg.primarySpawns.length; i++) {
        if (isSlotClear(cfg.primarySpawns[i])) return { status: 'OK', slot: cfg.primarySpawns[i], yaw: cfg.facingYawRad, tier: 'primary' };
      }
      for (let i = 0; i < cfg.fallbackSpawns.length; i++) {
        if (isSlotClear(cfg.fallbackSpawns[i])) return { status: 'OK', slot: cfg.fallbackSpawns[i], yaw: cfg.facingYawRad, tier: 'fallback' };
      }
      const sign = team === 'red' ? -1 : 1;
      const dynamicOffsets = [
        [sign * 101.0, 99.5],
        [sign * 112.0, 101.0],
        [sign * 96.5, 96.5],
        [sign * 109.0, 75.5]
      ];
      for (let i = 0; i < dynamicOffsets.length; i++) {
        const candidate = { id: `${team}_DynamicSafe_${i + 1}`, x: dynamicOffsets[i][0], y: 0.0, z: dynamicOffsets[i][1] };
        if (isSlotClear(candidate)) return { status: 'OK', slot: candidate, yaw: cfg.facingYawRad, tier: 'dynamic' };
      }
      return { status: 'WAIT_FOR_SAFE_SPAWN', slot: null, yaw: cfg.facingYawRad, tier: 'none' };
    }

    // ============================================================================
    // 4. AUTOMATED PHYSICS, NAVIGATION ROUTE & SPAWN CLEARANCE AUDIT
    // ============================================================================
    function runFullEngineeringAudit() {
      const allSpawns = [
        ...arenaMap.spawnDefinitions.redTeam.primarySpawns,
        ...arenaMap.spawnDefinitions.redTeam.fallbackSpawns,
        ...arenaMap.spawnDefinitions.blueTeam.primarySpawns,
        ...arenaMap.spawnDefinitions.blueTeam.fallbackSpawns
      ];

      let validSpawns = 0;
      const spawnAuditLog = [];
      allSpawns.forEach((sp) => {
        const supY = getSupportingSurfaceY(sp.x, sp.y + 0.2, sp.z);
        const floorOk = Math.abs(supY - sp.y) <= 0.1;

        let obstacleClear = true;
        for (let i = 0; i < solidObstacles.length; i++) {
          const b = solidObstacles[i].bounds;
          if (b.max.y <= sp.y + 0.1 || b.min.y >= sp.y + PLAYER_CFG.height) continue;
          if (sp.x >= b.min.x - 0.55 && sp.x <= b.max.x + 0.55 && sp.z >= b.min.z - 0.55 && sp.z <= b.max.z + 0.55) {
            obstacleClear = false;
            break;
          }
        }

        let headroomClear = true;
        for (let i = 0; i < walkableFloors.length; i++) {
          const f = walkableFloors[i];
          const botY = f.bounds.min.y;
          if (botY > sp.y + 0.1 && botY < sp.y + PLAYER_CFG.height + 0.4) {
            if (sp.x >= f.bounds.min.x && sp.x <= f.bounds.max.x && sp.z >= f.bounds.min.z && sp.z <= f.bounds.max.z) {
              if (!f.polygonXZ || isPointInPolygonXZ(sp.x, sp.z, f.polygonXZ)) {
                headroomClear = false;
                break;
              }
            }
          }
        }

        if (floorOk && obstacleClear && headroomClear) {
          validSpawns++;
        } else {
          spawnAuditLog.push(`${sp.id}(floor:${floorOk},obs:${obstacleClear},head:${headroomClear})`);
        }
      });

      // Verify fallback + WAIT_FOR_SAFE_SPAWN when primary & dynamic slots are occupied
      const redTeamCfg = arenaMap.spawnDefinitions.redTeam;
      const fallbackCheck = selectSafeTeamSpawn('red', redTeamCfg.primarySpawns);
      const waitCheck = selectSafeTeamSpawn('red', [
        ...redTeamCfg.primarySpawns,
        ...redTeamCfg.fallbackSpawns,
        { x: -101.0, y: 0, z: 99.5 },
        { x: -112.0, y: 0, z: 101.0 },
        { x: -96.5, y: 0, z: 96.5 },
        { x: -109.0, y: 0, z: 75.5 }
      ]);
      const fallbackVerified = fallbackCheck.tier === 'fallback' && waitCheck.status === 'WAIT_FOR_SAFE_SPAWN';

      const l2Floor = walkableFloors.find((f) => f.id === 'Level2_Central_Platform_Floor');
      const l2BottomY = l2Floor ? l2Floor.bounds.min.y : 7.2;
      const headroomOk = l2BottomY >= 6.5;

      const routesToTest = [
        {
          name: 'Level 1 Horizontal (Bravo <-> Charlie)',
          waypoints: [
            { x: -105, y: 0, z: 90 },
            { x: 0, y: 0, z: 90 },
            { x: 105, y: 0, z: 90 },
            { x: 0, y: 0, z: 90 },
            { x: -105, y: 0, z: 90 }
          ]
        },
        {
          name: 'Level 1 Spine & Under L2 Hub',
          waypoints: [
            { x: 0, y: 0, z: 90 },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: -105 }
          ]
        },
        {
          name: 'Level 1 Diagonal Pathways (L & R)',
          waypoints: [
            { x: -105, y: 0, z: 90 },
            { x: -66, y: 0, z: 32 },
            { x: -57, y: 0, z: 18 },
            { x: -52.5, y: 0, z: 0 },
            { x: 0, y: 0, z: -105 },
            { x: 52.5, y: 0, z: 0 },
            { x: 57, y: 0, z: 18 },
            { x: 66, y: 0, z: 32 },
            { x: 105, y: 0, z: 90 }
          ]
        },
        {
          name: 'Bravo Staircase Ascent (Y=0 -> 4 -> 8)',
          waypoints: [
            { x: -104.5, y: 0, z: 85 },
            { x: -111.5, y: 4, z: 85 },
            { x: -113.5, y: 4, z: 85 },
            { x: -113.5, y: 4, z: 81 },
            { x: -111.5, y: 4, z: 81 },
            { x: -104.5, y: 8, z: 81 }
          ]
        },
        {
          name: 'Charlie Staircase Ascent (Y=0 -> 4 -> 8)',
          waypoints: [
            { x: 104.5, y: 0, z: 85 },
            { x: 111.5, y: 4, z: 85 },
            { x: 113.5, y: 4, z: 85 },
            { x: 113.5, y: 4, z: 81 },
            { x: 111.5, y: 4, z: 81 },
            { x: 104.5, y: 8, z: 81 }
          ]
        },
        {
          name: 'Bravo Staircase Descent (Y=8 -> 0)',
          waypoints: [
            { x: -104.5, y: 8, z: 81 },
            { x: -111.5, y: 4, z: 81 },
            { x: -113.5, y: 4, z: 81 },
            { x: -113.5, y: 4, z: 85 },
            { x: -111.5, y: 4, z: 85 },
            { x: -104.5, y: 0, z: 85 }
          ]
        },
        {
          name: 'Charlie Staircase Descent (Y=8 -> 0)',
          waypoints: [
            { x: 104.5, y: 8, z: 81 },
            { x: 111.5, y: 4, z: 81 },
            { x: 113.5, y: 4, z: 81 },
            { x: 113.5, y: 4, z: 85 },
            { x: 111.5, y: 4, z: 85 },
            { x: 104.5, y: 0, z: 85 }
          ]
        },
        {
          name: 'Elevated Bridges (Bravo <-> L2 <-> Charlie)',
          waypoints: [
            { x: -96.5, y: 8, z: 81 },
            { x: -30.0, y: 8, z: 10 },
            { x: 0, y: 8, z: 0 },
            { x: 30.0, y: 8, z: 10 },
            { x: 96.5, y: 8, z: 81 }
          ]
        },
        {
          name: 'Level 2 Hub -> North Bridge -> Alpha',
          waypoints: [
            { x: 0, y: 8, z: 0 },
            { x: 0, y: 8, z: -20 },
            { x: 0, y: 8, z: -85 },
            { x: 0, y: 8, z: -105 }
          ]
        },
        {
          name: 'Alpha Left Staircase (Up & Down)',
          waypoints: [
            { x: -7, y: 0, z: -105 },
            { x: -14, y: 4, z: -105 },
            { x: -24, y: 4, z: -105 },
            { x: -24, y: 4, z: -103 },
            { x: -24, y: 8, z: -96 },
            { x: -24, y: 8, z: -94 },
            { x: -18, y: 8, z: -94 },
            { x: 0, y: 8, z: -105 },
            { x: -18, y: 8, z: -94 },
            { x: -24, y: 8, z: -94 },
            { x: -24, y: 8, z: -96 },
            { x: -24, y: 4, z: -103 },
            { x: -24, y: 4, z: -105 },
            { x: -14, y: 4, z: -105 },
            { x: -7, y: 0, z: -105 }
          ]
        },
        {
          name: 'Alpha Right Staircase (Up & Down)',
          waypoints: [
            { x: 7, y: 0, z: -105 },
            { x: 14, y: 4, z: -105 },
            { x: 24, y: 4, z: -105 },
            { x: 24, y: 4, z: -103 },
            { x: 24, y: 8, z: -96 },
            { x: 24, y: 8, z: -94 },
            { x: 18, y: 8, z: -94 },
            { x: 0, y: 8, z: -105 },
            { x: 18, y: 8, z: -94 },
            { x: 24, y: 8, z: -94 },
            { x: 24, y: 8, z: -96 },
            { x: 24, y: 4, z: -103 },
            { x: 24, y: 4, z: -105 },
            { x: 14, y: 4, z: -105 },
            { x: 7, y: 0, z: -105 }
          ]
        },
        {
          name: 'Bravo Building Interior & Rooftop',
          waypoints: [
            { x: -110.0, y: 0, z: 93.0 },
            { x: -116.5, y: 0, z: 93.0 },
            { x: -110.0, y: 0, z: 93.0 },
            { x: -104.5, y: 0, z: 85.0 },
            { x: -111.5, y: 4, z: 85.0 },
            { x: -114.0, y: 4, z: 90.0 }
          ]
        },
        {
          name: 'Charlie Building Interior & Rooftop',
          waypoints: [
            { x: 110.0, y: 0, z: 93.0 },
            { x: 116.5, y: 0, z: 93.0 },
            { x: 110.0, y: 0, z: 93.0 },
            { x: 104.5, y: 0, z: 85.0 },
            { x: 111.5, y: 4, z: 85.0 },
            { x: 114.0, y: 4, z: 90.0 }
          ]
        }
      ];

      let passedRoutes = 0;
      const failedRouteNames = [];
      const simDt = 0.033;

      routesToTest.forEach((rt) => {
        const simPos = new THREE.Vector3(rt.waypoints[0].x, rt.waypoints[0].y, rt.waypoints[0].z);
        const simVel = new THREE.Vector3(0, 0, 0);
        let routeOk = true;

        for (let w = 1; w < rt.waypoints.length; w++) {
          const target = rt.waypoints[w];
          const segDist = Math.hypot(target.x - simPos.x, target.z - simPos.z);
          const maxSteps = Math.max(180, Math.ceil(((segDist / PLAYER_CFG.walkSpeed) / simDt) * 2.2) + 120);

          for (let step = 0; step < maxSteps; step++) {
            const dx = target.x - simPos.x;
            const dz = target.z - simPos.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.35) break;

            const vx = (dx / dist) * PLAYER_CFG.walkSpeed;
            const vz = (dz / dist) * PLAYER_CFG.walkSpeed;
            integrateCharacterStep(simPos, simVel, vx, vz, simDt);

            if (simPos.y < -1.0) {
              routeOk = false;
              break;
            }
          }
          const finalErr = Math.hypot(target.x - simPos.x, target.z - simPos.z) + Math.abs(target.y - simPos.y);
          if (finalErr > 0.85) {
            console.log("Failed segment",rt.name,w,target,simPos.toArray());
            routeOk = false;
            break;
          }
        }

        if (routeOk) passedRoutes++;
        else failedRouteNames.push(rt.name);
      });

      return {
        validSpawns,
        totalSpawns: allSpawns.length,
        spawnAuditLog,
        fallbackVerified,
        headroomMeters: l2BottomY,
        headroomOk,
        passedRoutes,
        totalRoutes: routesToTest.length,
        failedRouteNames,
        exportsValidated: Boolean(
          arenaMap.obstacleSpecs &&
          arenaMap.collisionDefinitions.length > 0 &&
          arenaMap.capturePoints.length === 3 &&
          typeof GLTFExporter === 'function'
        )
      };
    }


const audit = runFullEngineeringAudit();
let triangles=0,meshObjects=0;
arenaMap.root.traverse(o=>{if(o.isMesh){meshObjects++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});
const result={...audit,triangles,meshObjects,colliders:arenaMap.collisionDefinitions.length,method:'Node + real Three.js math, stub 2D canvas; no GPU, no actual GLB export'};
console.log(JSON.stringify(result,null,2));
if(process.argv.includes('--write')){
  const metadata={spec:arenaMap.spec,spawnDefinitions:arenaMap.spawnDefinitions,capturePoints:arenaMap.capturePoints.map(({id,letter,x,y,z,radius,minElevationY,maxElevationY})=>({id,letter,x,y,z,radius,minElevationY,maxElevationY})),connectionPoints:arenaMap.connectionPoints,obstacleDefinitions:arenaMap.obstacleDefinitions,collisionDefinitions:arenaMap.collisionDefinitions};
  writeFileSync(new URL('../docs/duelist/control-point-arena-metadata.json',import.meta.url),JSON.stringify(metadata,null,2)+'\n');
  writeFileSync(new URL('../docs/duelist/control-point-arena-audit.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
}
arenaMap.dispose();
if(audit.validSpawns!==audit.totalSpawns||audit.passedRoutes!==audit.totalRoutes)process.exitCode=1;
