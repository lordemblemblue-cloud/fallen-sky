// Imported from docs/duelist/escort-phase9-source.html; standalone viewer UI intentionally excluded.
import * as THREE from "three";
    function createProceduralTexture(type) {
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      let seed=7482;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      if (type === 'road') {
        ctx.fillStyle = '#1e2633';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1400; i++) {
          const x = rand() * 256;
          const y = rand() * 256;
          const v = 26 + Math.floor(rand() * 18);
          ctx.fillStyle = `rgb(${v},${v + 5},${v + 12})`;
          ctx.fillRect(x, y, 2, 2);
        }
        ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.fillRect(10, 0, 4, 256);
        ctx.fillRect(242, 0, 4, 256);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.24)';
        for (let y = 0; y < 256; y += 32) {
          ctx.fillRect(84, y, 3, 18);
          ctx.fillRect(169, y, 3, 18);
        }
      } else if (type === 'deck') {
        ctx.fillStyle = '#242f40';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
        ctx.lineWidth = 2;
        for (let i = 0; i <= 256; i += 32) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 256);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(256, i);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.fillRect(0, 0, 256, 4);
      } else {
        ctx.fillStyle = '#1b2432';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, 248, 120);
        ctx.strokeRect(4, 132, 248, 120);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.fillRect(12, 12, 232, 4);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    /**
     * Authoritative Escort Map Builder (Phases 1 through 8)
     * - Phase 1: Foundation, 15-point spline, 16m roadway / 19m elevated bridge (8.8m apex), exact polygon clipping
     * - Phase 2: Point A Departure Facility (0, 0, -148)
     * - Phase 3: Checkpoint 1 Industrial Combat Plaza (54, 4, -54)
     * - Phase 4: Checkpoint 2 Elevated Industrial Facility (-56, 6, 56)
     * - Phase 5: Delivery Point B Fortified Station (44, 2, 155)
     * - Phase 6: Tactical Combat Pathways (Flanks, Under-Bridge Passage, Overlooks, Secondary Rooftop Loops)
     * - Phase 7: Attacker & Defender Protected Spawn Facilities + Progressive Respawn System (54 Spawns)
     * - Phase 8: Overhead Structure Collision Registration & Active Spawn Enemy Protection
     */
    class EscortMapPhase8 {
      constructor(scene) {
        this.scene = scene;

        // Modular scene groups
        this.groups = {
          foundation: new THREE.Group(),
          phase2PointA: new THREE.Group(),
          phase3CP1: new THREE.Group(),
          phase4CP2: new THREE.Group(),
          phase5PointB: new THREE.Group(),
          phase6Tactical: new THREE.Group(),
          phase7Spawns: new THREE.Group(),
          spawnMarkers: new THREE.Group(),
          debug: new THREE.Group()
        };
        this.groups.foundation.name = 'FoundationPhase1';
        this.groups.phase2PointA.name = 'Phase2_PointADepartureFacility';
        this.groups.phase3CP1.name = 'Phase3_Checkpoint1Plaza';
        this.groups.phase4CP2.name = 'Phase4_Checkpoint2IndustrialFacility';
        this.groups.phase5PointB.name = 'Phase5_DeliveryPointBStation';
        this.groups.phase6Tactical.name = 'Phase6_TacticalCombatPathways';
        this.groups.phase7Spawns.name = 'Phase7_SpawnFacilities';
        this.groups.spawnMarkers.name = 'Phase7_SpawnMarkers';
        this.groups.debug.name = 'CollisionAndWaypointsDebug';
        Object.values(this.groups).forEach((g) => this.scene.add(g));
        this.groups.debug.visible = false;

        // Collision & telemetry registries
        this.walkableTriangles = [];
        this.obstacleBoxes = [];
        this.barrierSegments = [];
        this.pathSamples = [];
        this.chevrons = [];
        this.instancedCoverCount = 0;

        // Phase 7 & 8 Progressive Spawn Registry with Protected Zone Bounds
        this.spawnZones = {
          attackerBase: {
            id: 'attackerBase', team: 'attacker', name: 'Point A Sanctuary', activeStages: [0], points: [],
            protectedBounds: { minX: -24.0, maxX: 24.0, minY: 0.0, maxY: 5.5, minZ: -194.0, maxZ: -173.0 }
          },
          attackerCP1: {
            id: 'attackerCP1', team: 'attacker', name: 'CP1 Forward Bay', activeStages: [1], points: [],
            protectedBounds: { minX: 78.5, maxX: 95.0, minY: 4.0, maxY: 9.2, minZ: -66.5, maxZ: -45.5 }
          },
          attackerCP2: {
            id: 'attackerCP2', team: 'attacker', name: 'CP2 Forward Bay', activeStages: [2], points: [],
            protectedBounds: { minX: -97.0, maxX: -80.5, minY: 6.0, maxY: 11.2, minZ: 44.5, maxZ: 66.5 }
          },
          defenderFwd: {
            id: 'defenderFwd', team: 'defender', name: 'CP2 Defender Outpost', activeStages: [0], points: [],
            protectedBounds: { minX: -31.5, maxX: -15.0, minY: 6.0, maxY: 11.2, minZ: 44.5, maxZ: 66.5 }
          },
          defenderBase: {
            id: 'defenderBase', team: 'defender', name: 'Point B Bastion', activeStages: [1, 2], points: [],
            protectedBounds: { minX: 21.0, maxX: 67.0, minY: 2.0, maxY: 7.8, minZ: 179.0, maxZ: 201.0 }
          }
        };
        this.spawnMarkerEntries = [];
        this.spawnShieldCurtains = [];
        this.currentMatchStage = 0;

        // Platform definitions (Phase 1 authoritative coordinates)
        this.platforms = [
          { id: 'PointA', cx: 0, cy: 0, cz: -148, w: 38, d: 34 },
          { id: 'Checkpoint1', cx: 54, cy: 4, cz: -54, w: 32, d: 32 },
          { id: 'Checkpoint2', cx: -56, cy: 6, cz: 56, w: 32, d: 32 },
          { id: 'DeliveryB', cx: 44, cy: 2, cz: 155, w: 36, d: 34 }
        ];

        this._initMaterials();
        this._buildPhase1Foundation();
        this._buildPhase2PointADeparture();
        this._buildPhase3Checkpoint1();
        this._buildPhase4Checkpoint2();
        this._buildPhase5DeliveryPointB();
        this._buildPhase6TacticalPathways();
        this._buildPhase7SpawnSystem();
        this._buildDebugVisuals();
        this.setMatchStage(0);
      }

      _initMaterials() {
        const roadTex = createProceduralTexture('road');
        roadTex.repeat.set(1, 24);
        const deckTex = createProceduralTexture('deck');
        deckTex.repeat.set(4, 4);
        const wallTex = createProceduralTexture('wall');
        wallTex.repeat.set(2, 1);

        this.mats = {
          roadway: new THREE.MeshStandardMaterial({
            map: roadTex,
            color: 0xb8c7da,
            roughness: 0.78,
            metalness: 0.22
          }),
          bridgeDeck: new THREE.MeshStandardMaterial({
            map: roadTex,
            color: 0x94b8db,
            roughness: 0.62,
            metalness: 0.38
          }),
          slateDeck: new THREE.MeshStandardMaterial({
            map: deckTex,
            color: 0x9db0c7,
            roughness: 0.72,
            metalness: 0.32
          }),
          elevatedDeck: new THREE.MeshStandardMaterial({
            map: deckTex,
            color: 0x7da2c8,
            roughness: 0.58,
            metalness: 0.45
          }),
          tacticalDeck: new THREE.MeshStandardMaterial({
            map: deckTex,
            color: 0x6ea39f,
            roughness: 0.62,
            metalness: 0.44
          }),
          spawnDeckAtk: new THREE.MeshStandardMaterial({
            map: deckTex,
            color: 0x5c85b8,
            roughness: 0.58,
            metalness: 0.45
          }),
          spawnDeckDef: new THREE.MeshStandardMaterial({
            map: deckTex,
            color: 0xb88c5c,
            roughness: 0.58,
            metalness: 0.45
          }),
          darkWall: new THREE.MeshStandardMaterial({
            map: wallTex,
            color: 0x8ea0b5,
            roughness: 0.64,
            metalness: 0.52
          }),
          steelTrim: new THREE.MeshStandardMaterial({
            color: 0x475569,
            roughness: 0.45,
            metalness: 0.72
          }),
          railing: new THREE.MeshStandardMaterial({
            color: 0x64748b,
            roughness: 0.4,
            metalness: 0.78
          }),
          cargoMatA: new THREE.MeshStandardMaterial({
            color: 0x1e3a5f,
            roughness: 0.65,
            metalness: 0.35
          }),
          cargoMatB: new THREE.MeshStandardMaterial({
            color: 0x5c3422,
            roughness: 0.68,
            metalness: 0.3
          }),
          machinery: new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.48,
            metalness: 0.68
          }),
          cyanGlow: new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0ea5e9,
            emissiveIntensity: 1.45,
            roughness: 0.25,
            metalness: 0.2
          }),
          blueGlow: new THREE.MeshStandardMaterial({
            color: 0x60a5fa,
            emissive: 0x2563eb,
            emissiveIntensity: 1.65,
            roughness: 0.25,
            metalness: 0.2
          }),
          emeraldGlow: new THREE.MeshStandardMaterial({
            color: 0x34d399,
            emissive: 0x10b981,
            emissiveIntensity: 1.35,
            roughness: 0.25,
            metalness: 0.2
          }),
          amberGlow: new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xd97706,
            emissiveIntensity: 1.55,
            roughness: 0.25,
            metalness: 0.2
          }),
          groundFloor: new THREE.MeshStandardMaterial({
            color: 0x0e1522,
            roughness: 0.95,
            metalness: 0.05
          })
        };
      }

      setLayerVisible(key, visible) {
        if (this.groups[key]) {
          this.groups[key].visible = visible;
        }
      }

      // =====================================================================
      // COLLISION REGISTRATION HELPERS
      // =====================================================================
      _registerWalkableTri(a, b, c, section) {
        const ab = new THREE.Vector3().subVectors(b, a);
        const ac = new THREE.Vector3().subVectors(c, a);
        const n = new THREE.Vector3().crossVectors(ab, ac);
        let pA = a.clone();
        let pB = b.clone();
        let pC = c.clone();
        if (n.y < 0) {
          const tmp = pB;
          pB = pC;
          pC = tmp;
          n.negate();
        }
        n.normalize();
        this.walkableTriangles.push({
          a: pA,
          b: pB,
          c: pC,
          normal: n,
          minX: Math.min(pA.x, pB.x, pC.x),
          maxX: Math.max(pA.x, pB.x, pC.x),
          minZ: Math.min(pA.z, pB.z, pC.z),
          maxZ: Math.max(pA.z, pB.z, pC.z),
          section
        });
      }

      _registerWalkableQuad(p0, p1, p2, p3, section) {
        this._registerWalkableTri(p0, p2, p1, section);
        this._registerWalkableTri(p1, p2, p3, section);
      }

      _registerBoxObstacle(minX, maxX, minY, maxY, minZ, maxZ, label, phase) {
        this.obstacleBoxes.push({
          minX: Math.min(minX, maxX),
          maxX: Math.max(minX, maxX),
          minY: Math.min(minY, maxY),
          maxY: Math.max(minY, maxY),
          minZ: Math.min(minZ, maxZ),
          maxZ: Math.max(minZ, maxZ),
          label,
          phase
        });
      }

      _registerBarrierSegment(x0, z0, x1, z1, minY, maxY, label, phase, visualParent = null) {
        this.barrierSegments.push({ x0, z0, x1, z1, minY, maxY, label, phase });
        if (visualParent) {
          const dx = x1 - x0;
          const dz = z1 - z0;
          const len = Math.hypot(dx, dz);
          if (len > 0.15) {
            const railH = Math.max(0.2, maxY - minY);
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, len), this.mats.railing);
            rail.position.set((x0 + x1) * 0.5, maxY - 0.1, (z0 + z1) * 0.5);
            rail.rotation.y = Math.atan2(dx, dz);
            visualParent.add(rail);

            const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, len), this.mats.steelTrim);
            midRail.position.set((x0 + x1) * 0.5, minY + railH * 0.5, (z0 + z1) * 0.5);
            midRail.rotation.y = Math.atan2(dx, dz);
            visualParent.add(midRail);

            const postCount = Math.max(2, Math.ceil(len / 4.0) + 1);
            for (let i = 0; i < postCount; i++) {
              const frac = i / (postCount - 1);
              const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, railH, 0.14), this.mats.steelTrim);
              post.position.set(x0 + dx * frac, minY + railH * 0.5, z0 + dz * frac);
              visualParent.add(post);
            }
          }
        }
      }

      // =====================================================================
      // EXACT GEOMETRIC POLYGON CLIPPING (Vertices Inside, Edge Crossings &
      // Rectangle Entirely Enclosed Inside Polygon)
      // =====================================================================
      _pointInPolyXZ(x, z, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].x, zi = poly[i].z;
          const xj = poly[j].x, zj = poly[j].z;
          const intersect = ((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      }

      _segmentIntersectsRect(x0, z0, x1, z1, minX, maxX, minZ, maxZ) {
        let t0 = 0.0;
        let t1 = 1.0;
        const dx = x1 - x0;
        const dz = z1 - z0;
        const checks = [
          [-dx, x0 - minX],
          [dx, maxX - x0],
          [-dz, z0 - minZ],
          [dz, maxZ - z0]
        ];
        for (let i = 0; i < 4; i++) {
          const p = checks[i][0];
          const q = checks[i][1];
          if (Math.abs(p) < 1e-8) {
            if (q < 0) return false;
          } else {
            const r = q / p;
            if (p < 0) {
              if (r > t1) return false;
              if (r > t0) t0 = r;
            } else {
              if (r < t0) return false;
              if (r < t1) t1 = r;
            }
          }
        }
        return t0 <= t1;
      }

      _clipPolyHalfPlane(poly, isInsideFn, intersectFn) {
        if (!Array.isArray(poly) || poly.length < 3) return [];
        const out = [];
        for (let i = 0; i < poly.length; i++) {
          const curr = poly[i];
          const prev = poly[(i + poly.length - 1) % poly.length];
          const currIn = isInsideFn(curr);
          const prevIn = isInsideFn(prev);
          if (currIn) {
            if (!prevIn) out.push(intersectFn(prev, curr));
            out.push(curr);
          } else if (prevIn) {
            out.push(intersectFn(prev, curr));
          }
        }
        return out;
      }

      _clipPolygonOutsideRect(poly, rect) {
        if (!Array.isArray(poly) || poly.length < 3) return [];
        const { minX, maxX, minZ, maxZ } = rect;

        let anyInside = false;
        let allInside = true;
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i];
          const inside = p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
          if (inside) anyInside = true;
          else allInside = false;
        }
        if (allInside) return [];

        let overlapsRect = anyInside;
        if (!overlapsRect) {
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            if (this._segmentIntersectsRect(a.x, a.z, b.x, b.z, minX, maxX, minZ, maxZ)) {
              overlapsRect = true;
              break;
            }
          }
        }

        if (!overlapsRect) {
          const rectCenterX = (minX + maxX) * 0.5;
          const rectCenterZ = (minZ + maxZ) * 0.5;
          if (this._pointInPolyXZ(rectCenterX, rectCenterZ, poly)) {
            overlapsRect = true;
          }
        }

        if (!overlapsRect) return [poly];

        const lerpPt = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t);
        const results = [];

        const leftBand = this._clipPolyHalfPlane(
          poly,
          (p) => p.x <= minX,
          (a, b) => lerpPt(a, b, (minX - a.x) / (b.x - a.x || 1e-8))
        );
        if (leftBand.length >= 3) results.push(leftBand);

        const rightBand = this._clipPolyHalfPlane(
          poly,
          (p) => p.x >= maxX,
          (a, b) => lerpPt(a, b, (maxX - a.x) / (b.x - a.x || 1e-8))
        );
        if (rightBand.length >= 3) results.push(rightBand);

        let midX = this._clipPolyHalfPlane(
          poly,
          (p) => p.x >= minX,
          (a, b) => lerpPt(a, b, (minX - a.x) / (b.x - a.x || 1e-8))
        );
        midX = this._clipPolyHalfPlane(
          midX,
          (p) => p.x <= maxX,
          (a, b) => lerpPt(a, b, (maxX - a.x) / (b.x - a.x || 1e-8))
        );

        if (midX.length >= 3) {
          const topBand = this._clipPolyHalfPlane(
            midX,
            (p) => p.z <= minZ,
            (a, b) => lerpPt(a, b, (minZ - a.z) / (b.z - a.z || 1e-8))
          );
          if (topBand.length >= 3) results.push(topBand);

          const bottomBand = this._clipPolyHalfPlane(
            midX,
            (p) => p.z >= maxZ,
            (a, b) => lerpPt(a, b, (maxZ - a.z) / (b.z - a.z || 1e-8))
          );
          if (bottomBand.length >= 3) results.push(bottomBand);
        }

        return results;
      }

      // =====================================================================
      // ARCHITECTURAL HELPERS (Accessible Buildings, Stairs, Ramps, Spawn Walls)
      // =====================================================================
      _buildWallWithOpening(parent, x0, z0, x1, z1, baseY, h, openStartFrac, openEndFrac, isDoor, labelPrefix, phase) {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (len < 0.2) return;
        const dirX = dx / len;
        const dirZ = dz / len;
        const yaw = Math.atan2(dx, dz);
        const wallT = 0.45;
        const sillH = 1.15;
        const winH = 1.55;
        const headerY = sillH + winH;

        const s0 = len * openStartFrac;
        const s1 = len * openEndFrac;
        const segs = [
          { a: 0, b: s0 },
          { a: s1, b: len }
        ];

        const addOrientedWallBox = (wx, wz, wMinY, wMaxY, localHalfW, localHalfD, rotY, tag) => {
          const c = Math.abs(Math.cos(rotY));
          const s = Math.abs(Math.sin(rotY));
          const worldHalfX = localHalfW * c + localHalfD * s;
          const worldHalfZ = localHalfW * s + localHalfD * c;
          this._registerBoxObstacle(
            wx - worldHalfX,
            wx + worldHalfX,
            wMinY,
            wMaxY,
            wz - worldHalfZ,
            wz + worldHalfZ,
            tag,
            phase
          );
        };

        segs.forEach((seg, idx) => {
          const segLen = seg.b - seg.a;
          if (segLen > 0.25) {
            const midDist = (seg.a + seg.b) * 0.5;
            const px = x0 + dirX * midDist;
            const pz = z0 + dirZ * midDist;
            const rotY = yaw;
            const fullWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, segLen), this.mats.darkWall);
            fullWall.position.set(px, baseY + h * 0.5, pz);
            fullWall.rotation.y = rotY;
            fullWall.castShadow = true;
            fullWall.receiveShadow = true;
            parent.add(fullWall);
            addOrientedWallBox(px, pz, baseY, baseY + h, wallT * 0.5, segLen * 0.5, rotY, `${labelPrefix}_Wall_${idx}`);
          }
        });

        const openLen = s1 - s0;
        if (openLen > 0.3) {
          const midDist = (s0 + s1) * 0.5;
          const ox = x0 + dirX * midDist;
          const oz = z0 + dirZ * midDist;
          const rotY = yaw;

          if (!isDoor) {
            const sill = new THREE.Mesh(new THREE.BoxGeometry(wallT * 0.92, sillH, openLen), this.mats.darkWall);
            sill.position.set(ox, baseY + sillH * 0.5, oz);
            sill.rotation.y = rotY;
            parent.add(sill);
            addOrientedWallBox(ox, oz, baseY, baseY + sillH, wallT * 0.46, openLen * 0.5, rotY, `${labelPrefix}_WinSill`);

            const frameBot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, openLen), this.mats.cyanGlow);
            frameBot.position.set(ox, baseY + sillH + 0.04, oz);
            frameBot.rotation.y = rotY;
            parent.add(frameBot);
          }

          const lintelH = Math.max(0.5, h - (isDoor ? 2.75 : headerY));
          const lintelY = baseY + h - lintelH * 0.5;
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(wallT, lintelH, openLen), this.mats.darkWall);
          lintel.position.set(ox, lintelY, oz);
          lintel.rotation.y = rotY;
          parent.add(lintel);
          addOrientedWallBox(ox, oz, baseY + h - lintelH, baseY + h, wallT * 0.5, openLen * 0.5, rotY, `${labelPrefix}_Lintel`);
        }
      }

      _buildAccessibleBuilding(parent, cfg) {
        const { cx, baseY, cz, w, d, h, roofSection, labelPrefix, phase, doorSide = 'east' } = cfg;
        const hw = w * 0.5;
        const hd = d * 0.5;

        const fndH = Math.max(1.2, baseY + 1.2);
        const fnd = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, fndH, d + 0.8), this.mats.darkWall);
        fnd.position.set(cx, baseY - fndH * 0.5, cz);
        parent.add(fnd);

        const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), this.mats.slateDeck);
        floor.position.set(cx, baseY - 0.125, cz);
        floor.receiveShadow = true;
        parent.add(floor);
        this._registerWalkableQuad(
          new THREE.Vector3(cx - hw, baseY, cz - hd),
          new THREE.Vector3(cx + hw, baseY, cz - hd),
          new THREE.Vector3(cx - hw, baseY, cz + hd),
          new THREE.Vector3(cx + hw, baseY, cz + hd),
          `${labelPrefix}_Floor`
        );

        this._buildWallWithOpening(parent, cx - hw, cz - hd, cx + hw, cz - hd, baseY, h, 0.32, 0.68, doorSide === 'north' || doorSide === 'bothNS', `${labelPrefix}_N`, phase);
        this._buildWallWithOpening(parent, cx - hw, cz + hd, cx + hw, cz + hd, baseY, h, 0.32, 0.68, doorSide === 'south' || doorSide === 'bothNS', `${labelPrefix}_S`, phase);
        this._buildWallWithOpening(parent, cx - hw, cz - hd, cx - hw, cz + hd, baseY, h, 0.3, 0.7, doorSide === 'west' || doorSide === 'bothEW', `${labelPrefix}_W`, phase);
        this._buildWallWithOpening(parent, cx + hw, cz - hd, cx + hw, cz + hd, baseY, h, 0.3, 0.7, doorSide === 'east' || doorSide === 'bothEW', `${labelPrefix}_E`, phase);

        const roofY = baseY + h;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.38, d + 0.4), this.mats.elevatedDeck);
        roof.position.set(cx, roofY - 0.19, cz);
        roof.receiveShadow = true;
        roof.castShadow = true;
        parent.add(roof);
        this._registerBoxObstacle(cx-hw-.2,cx+hw+.2,roofY-.38,roofY,cz-hd-.2,cz+hd+.2,labelPrefix+'_RoofSlab',phase);
        this._registerWalkableQuad(
          new THREE.Vector3(cx - hw - 0.2, roofY, cz - hd - 0.2),
          new THREE.Vector3(cx + hw + 0.2, roofY, cz - hd - 0.2),
          new THREE.Vector3(cx - hw - 0.2, roofY, cz + hd + 0.2),
          new THREE.Vector3(cx + hw + 0.2, roofY, cz + hd + 0.2),
          roofSection
        );

        const accent = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.14, d + 0.5), this.mats.cyanGlow);
        accent.position.set(cx, roofY - 0.04, cz);
        parent.add(accent);
      }

      _buildRampStair(parent, startVec, endVec, width, section, addSideRails = true, mat = null) {
        if(!section.endsWith("_Landing")&&/^(PointA_(West|East)|CP1_|CP2_(West|East)|PointB_(West|East)).*Stair/.test(section)){
          const old=endVec.clone(),dir=new THREE.Vector3().subVectors(endVec,startVec);dir.y=0;dir.normalize();
          endVec=endVec.clone().addScaledVector(dir,-1.05);
          const landEnd=old.clone().addScaledVector(dir,.65);
          this._buildRampStair(parent,endVec,landEnd,width,section+'_Landing',false,mat);
        }
        const diff = new THREE.Vector3().subVectors(endVec, startVec);
        const horizLen = Math.hypot(diff.x, diff.z);
        const totalLen = diff.length();
        const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);

        const dirHoriz = new THREE.Vector3(diff.x, 0, diff.z).normalize();
        const right = new THREE.Vector3().crossVectors(dirHoriz, new THREE.Vector3(0, 1, 0)).normalize();
        const halfW = width * 0.5;

        const rampGroup = new THREE.Group();
        rampGroup.position.copy(mid);
        const yaw = Math.atan2(diff.x, diff.z);
        const pitch = -Math.atan2(diff.y, horizLen);
        rampGroup.rotation.order = 'YXZ';
        rampGroup.rotation.y = yaw;
        rampGroup.rotation.x = pitch;

        const deckMesh = new THREE.Mesh(
          new THREE.BoxGeometry(width, 0.34, totalLen + 0.35),
          mat || this.mats.elevatedDeck
        );
        deckMesh.position.y = -0.17;
        deckMesh.receiveShadow = true;
        deckMesh.castShadow = true;
        rampGroup.add(deckMesh);

        if (Math.abs(diff.y) / Math.max(0.1, horizLen) > 0.14) {
          const steps = Math.max(6, Math.min(22, Math.floor(totalLen * 1.4)));
          for (let i = 0; i < steps; i++) {
            const frac = (i + 0.5) / steps - 0.5;
            const tread = new THREE.Mesh(new THREE.BoxGeometry(width - 0.24, 0.05, 0.22), this.mats.steelTrim);
            tread.position.set(0, 0.02, frac * totalLen);
            rampGroup.add(tread);
          }
        }
        parent.add(rampGroup);

        const minY = Math.min(startVec.y, endVec.y);
        const supportH = Math.max(1.2, minY + 4.5);
        const basePad = new THREE.Mesh(new THREE.BoxGeometry(Math.min(width, 3.2), supportH, 1.4), this.mats.darkWall);
        basePad.position.set(startVec.x, startVec.y - supportH * 0.5 - 0.2, startVec.z);
        basePad.rotation.y = yaw;
        parent.add(basePad);

        const p0 = startVec.clone().addScaledVector(right, -halfW);
        const p1 = startVec.clone().addScaledVector(right, halfW);
        const p2 = endVec.clone().addScaledVector(right, -halfW);
        const p3 = endVec.clone().addScaledVector(right, halfW);
        this._registerWalkableQuad(p0, p1, p2, p3, section);

        if (addSideRails) {
          // Ground-level junction openings where the tactical ramps meet CP2's combat apron.
          const trimStart=section==='P6_Flank6B_NorthRamp'?Math.min(.25,10/horizLen):0;
          const trimEnd=section==='P6_UnderBridge_WestRamp'?Math.min(.25,10/horizLen):0;
          for(const [a,b,suffix] of [[p0,p2,'L'],[p1,p3,'R']]){
            const u=a.clone().lerp(b,trimStart),v=a.clone().lerp(b,1-trimEnd);
            this._registerBarrierSegment(u.x,u.z,v.x,v.z,Math.min(u.y,v.y),Math.max(u.y,v.y)+1.05,`${section}_Rail${suffix}`,'Stair',parent);
          }
        }
      }

      // =====================================================================
      // PHASE 1 — FOUNDATION, 15-POINT SPLINE, 16m/19m ROADWAY & PLATFORMS
      // =====================================================================
      _buildPhase1Foundation() {
        const g = this.groups.foundation;

        const ground = new THREE.Mesh(new THREE.PlaneGeometry(950, 950), this.mats.groundFloor);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -4.5;
        ground.receiveShadow = true;
        g.add(ground);
        this.originalDatumGround = ground;

        this.controlPoints = [
          new THREE.Vector3(0, 0.0, -165.5),   // 0: Inside Point A Loading Garage
          new THREE.Vector3(0, 0.0, -152.0),   // 1: Point A Exit Apron
          new THREE.Vector3(0, 0.0, -138.0),   // 2: Point A Departure
          new THREE.Vector3(10, 0.6, -118.0),  // 3: South Curve Entry
          new THREE.Vector3(28, 1.8, -96.0),   // 4: Ascending Roadway
          new THREE.Vector3(46, 3.2, -74.0),   // 5: CP1 Approach
          new THREE.Vector3(54, 4.0, -54.0),   // 6: Checkpoint 1 Center
          new THREE.Vector3(40, 6.2, -26.0),   // 7: Bridge Entrance Gateway
          new THREE.Vector3(14, 8.2, -8.0),    // 8: Elevated Bridge Ascent
          new THREE.Vector3(-4, 8.8, 4.0),     // 9: Elevated Bridge Apex (8.8m)
          new THREE.Vector3(-28, 8.0, 22.0),   // 10: Elevated Bridge Descent
          new THREE.Vector3(-46, 6.8, 38.0),   // 11: CP2 Approach
          new THREE.Vector3(-56, 6.0, 56.0),   // 12: Checkpoint 2 Center
          new THREE.Vector3(-16, 4.0, 108.0),  // 13: Delivery B Approach Road
          new THREE.Vector3(44, 2.0, 155.0)    // 14: Delivery Point B Objective
        ];

        this.routeSpline = new THREE.CatmullRomCurve3(this.controlPoints, false, 'centripetal', 0.45);

        this.platforms.forEach((pf) => {
          const deckH = 1.2;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(pf.w, deckH, pf.d), this.mats.slateDeck);
          mesh.position.set(pf.cx, pf.cy - deckH * 0.5, pf.cz);
          mesh.receiveShadow = true;
          mesh.castShadow = true;
          g.add(mesh);

          const supportH = pf.cy + 4.5;
          const base = new THREE.Mesh(new THREE.BoxGeometry(pf.w - 2.0, supportH, pf.d - 2.0), this.mats.darkWall);
          base.position.set(pf.cx, pf.cy - deckH - supportH * 0.5, pf.cz);
          g.add(base);

          this._registerWalkableQuad(
            new THREE.Vector3(pf.cx - pf.w * 0.5, pf.cy, pf.cz - pf.d * 0.5),
            new THREE.Vector3(pf.cx + pf.w * 0.5, pf.cy, pf.cz - pf.d * 0.5),
            new THREE.Vector3(pf.cx - pf.w * 0.5, pf.cy, pf.cz + pf.d * 0.5),
            new THREE.Vector3(pf.cx + pf.w * 0.5, pf.cy, pf.cz + pf.d * 0.5),
            `Platform_${pf.id}`
          );
        });

        const sampleCount = 480;
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i <= sampleCount; i++) {
          const t = i / sampleCount;
          const pt = this.routeSpline.getPoint(t);
          const tan = this.routeSpline.getTangent(t).normalize();
          const right = new THREE.Vector3().crossVectors(tan, up).normalize();
          const isBridge = t >= 0.46 && t <= 0.68;
          const width = isBridge ? 19.0 : 16.0;
          this.pathSamples.push({ t, point: pt, tangent: tan, right, width, isBridge });
        }

        const roadPositions = [];
        const roadUVs = [];
        const bridgePositions = [];
        const bridgeUVs = [];
        const junctionPlatforms = this.platforms.map(p=>p.id==="DeliveryB"?{...p,w:48,d:44,cz:157}:p);
        const platformRects = junctionPlatforms.map((p) => ({
          minX: p.cx - p.w * 0.5,
          maxX: p.cx + p.w * 0.5,
          minZ: p.cz - p.d * 0.5,
          maxZ: p.cz + p.d * 0.5
        }));

        const junctionY = v => {
          const p=v.clone();
          for(const pf of junctionPlatforms){
            const d=Math.hypot(Math.max(0,Math.abs(p.x-pf.cx)-pf.w/2),Math.max(0,Math.abs(p.z-pf.cz)-pf.d/2));
            const f=THREE.MathUtils.smoothstep(d,0,12);
            p.y=pf.cy+(p.y-pf.cy)*f;
            if(d<12)break;
          }
          return p;
        };
        const pushUpwardTri = (a, b, c, targetPos, targetUV, section) => {
          a=junctionY(a);b=junctionY(b);c=junctionY(c);
          const ab = new THREE.Vector3().subVectors(b, a);
          const ac = new THREE.Vector3().subVectors(c, a);
          const n = new THREE.Vector3().crossVectors(ab, ac);
          let v0 = a, v1 = b, v2 = c;
          if (Math.abs(n.y)<1e-8) return;
          if (n.y < 0) {
            v1 = c;
            v2 = b;
          }
          targetPos.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
          targetUV.push(v0.x * 0.08, v0.z * 0.08, v1.x * 0.08, v1.z * 0.08, v2.x * 0.08, v2.z * 0.08);
          this._registerWalkableTri(v0, v1, v2, section);
        };

        for (let i = 0; i < sampleCount; i++) {
          const s0 = this.pathSamples[i];
          const s1 = this.pathSamples[i + 1];
          const hw0 = s0.width * 0.5;
          const hw1 = s1.width * 0.5;

          const l0 = s0.point.clone().addScaledVector(s0.right, -hw0);
          const r0 = s0.point.clone().addScaledVector(s0.right, hw0);
          const r1 = s1.point.clone().addScaledVector(s1.right, hw1);
          const l1 = s1.point.clone().addScaledVector(s1.right, -hw1);

          let polys = [[l0, r0, r1, l1]];
          for (const rect of platformRects) {
            const nextPolys = [];
            for (const poly of polys) {
              const clipped = this._clipPolygonOutsideRect(poly, rect);
              for (const cp of clipped) nextPolys.push(cp);
            }
            polys = nextPolys;
            if (polys.length === 0) break;
          }

          const isBridgeSeg = s0.isBridge || s1.isBridge;
          const targetPos = isBridgeSeg ? bridgePositions : roadPositions;
          const targetUV = isBridgeSeg ? bridgeUVs : roadUVs;
          const secName = isBridgeSeg ? 'Roadway_Bridge' : 'Roadway_Standard';

          for (const poly of polys) {
            for (let k = 1; k < poly.length - 1; k++) {
              pushUpwardTri(poly[0], poly[k], poly[k + 1], targetPos, targetUV, secName);
            }
          }

          const midPt = new THREE.Vector3().lerpVectors(s0.point, s1.point, 0.5);
          const insideAnyPlatform = platformRects.some(
            (r) => midPt.x >= r.minX - 2.0 && midPt.x <= r.maxX + 2.0 && midPt.z >= r.minZ - 2.0 && midPt.z <= r.maxZ + 2.0
          );
          if (!insideAnyPlatform && i % 6 === 0 && i + 6 <= sampleCount) {
            const sNext = this.pathSamples[i + 6];
            const nl0 = s0.point.clone().addScaledVector(s0.right, -hw0);
            const nl1 = sNext.point.clone().addScaledVector(sNext.right, -sNext.width * 0.5);
            const nr0 = s0.point.clone().addScaledVector(s0.right, hw0);
            const nr1 = sNext.point.clone().addScaledVector(sNext.right, sNext.width * 0.5);
            const minY = Math.min(s0.point.y, sNext.point.y);
            const maxY = Math.max(s0.point.y, sNext.point.y) + 1.05;
            this._registerBarrierSegment(nl0.x, nl0.z, nl1.x, nl1.z, minY, maxY, `RoadRailL_${i}`, 'Phase1', g);
            this._registerBarrierSegment(nr0.x, nr0.z, nr1.x, nr1.z, minY, maxY, `RoadRailR_${i}`, 'Phase1', g);
          }

          if (isBridgeSeg && i % 30 === 0) {
            const pierH = s0.point.y + 4.5;
            [-hw0 + 2.2, hw0 - 2.2].forEach((lat) => {
              const pPos = s0.point.clone().addScaledVector(s0.right, lat);
              const pier = new THREE.Mesh(new THREE.BoxGeometry(1.6, pierH, 1.6), this.mats.darkWall);
              pier.position.set(pPos.x, s0.point.y - pierH * 0.5 - 0.3, pPos.z);
              g.add(pier);
            });
          }
        }

        const buildMeshFromArrays = (positions, uvs, mat, name) => {
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
          geom.computeVertexNormals();
          const mesh = new THREE.Mesh(geom, mat);
          mesh.name = name;
          mesh.receiveShadow = true;
          g.add(mesh);
          return mesh;
        };

        this.roadwayMesh = buildMeshFromArrays(roadPositions, roadUVs, this.mats.roadway, 'RoadwayStandardMesh');
        this.bridgeMesh = buildMeshFromArrays(bridgePositions, bridgeUVs, this.mats.bridgeDeck, 'RoadwayBridgeMesh');

        const chevShape = new THREE.Shape();
        chevShape.moveTo(0, 1.3);
        chevShape.lineTo(1.5, -0.7);
        chevShape.lineTo(0.85, -0.7);
        chevShape.lineTo(0, 0.45);
        chevShape.lineTo(-0.85, -0.7);
        chevShape.lineTo(-1.5, -0.7);
        chevShape.closePath();
        const chevGeo = new THREE.ShapeGeometry(chevShape);
        chevGeo.rotateX(-Math.PI / 2);

        for (let i = 30; i < sampleCount - 24; i += 36) {
          const s = this.pathSamples[i];
          const chev = new THREE.Mesh(chevGeo, this.mats.cyanGlow);
          const pos=junctionY(s.point);
          chev.position.set(pos.x,pos.y+0.08,pos.z);
          chev.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)+Math.PI;
          g.add(chev);
          this.chevrons.push({ pos: s.point.clone(), dir: s.tangent.clone(), up: new THREE.Vector3(0, 1, 0) });
        }
      }

      // =====================================================================
      // PHASE 2 — POINT A DEPARTURE FACILITY (0, 0, -148)
      // =====================================================================
      _buildPhase2PointADeparture() {
        const g = this.groups.phase2PointA;
        const cx = 0, cy = 0, cz = -148;

        const garageZ = -164.5;
        const garageW = 12.4;
        const garageH = 6.4;
        const garageD = 11.0;

        const gFloor = new THREE.Mesh(new THREE.BoxGeometry(garageW + 3.0, 1.2, garageD + 2.0), this.mats.slateDeck);
        gFloor.position.set(cx, cy - 0.6, garageZ);
        g.add(gFloor);
        this._registerWalkableQuad(
          new THREE.Vector3(cx - garageW * 0.5 - 1.5, cy, garageZ - garageD * 0.5 - 1.0),
          new THREE.Vector3(cx + garageW * 0.5 + 1.5, cy, garageZ - garageD * 0.5 - 1.0),
          new THREE.Vector3(cx - garageW * 0.5 - 1.5, cy, garageZ + garageD * 0.5 + 1.0),
          new THREE.Vector3(cx + garageW * 0.5 + 1.5, cy, garageZ + garageD * 0.5 + 1.0),
          'PointA_GarageFloor'
        );

        const sideW = 1.0;
        [-1, 1].forEach((side) => {
          const wx = cx + side * (garageW * 0.5 + sideW * 0.5);
          const wall = new THREE.Mesh(new THREE.BoxGeometry(sideW, garageH, garageD), this.mats.darkWall);
          wall.position.set(wx, cy + garageH * 0.5, garageZ);
          g.add(wall);
          this._registerBoxObstacle(wx - sideW * 0.5, wx + sideW * 0.5, cy, cy + garageH, garageZ - garageD * 0.5, garageZ + garageD * 0.5, `PointA_GarageWall_${side > 0 ? 'E' : 'W'}`, 'Phase2');
        });
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(garageW + sideW * 2, garageH, 1.0), this.mats.darkWall);
        backWall.position.set(cx, cy + garageH * 0.5, garageZ - garageD * 0.5 - 0.5);
        g.add(backWall);
        this._registerBoxObstacle(cx - garageW * 0.5 - sideW, cx + garageW * 0.5 + sideW, cy, cy + garageH, garageZ - garageD * 0.5 - 1.0, garageZ - garageD * 0.5, 'PointA_GarageBackWall', 'Phase2');

        const garageRoof = new THREE.Mesh(new THREE.BoxGeometry(garageW + sideW * 2 + 0.6, 0.6, garageD + 0.6), this.mats.darkWall);
        garageRoof.position.set(cx, cy + garageH + 0.3, garageZ);
        g.add(garageRoof);
        this._registerBoxObstacle(cx - garageW * 0.5 - sideW, cx + garageW * 0.5 + sideW, cy + garageH, cy + garageH + 0.6, garageZ - garageD * 0.5, garageZ + garageD * 0.5, 'PointA_GarageRoofOverhead', 'Phase2');

        const garageTrim = new THREE.Mesh(new THREE.BoxGeometry(garageW, 0.22, 0.3), this.mats.cyanGlow);
        garageTrim.position.set(cx, cy + garageH - 0.15, garageZ + garageD * 0.5);
        g.add(garageTrim);

        this._buildAccessibleBuilding(g, {
          cx: -14.5, baseY: cy, cz: cz - 3.0, w: 8.5, d: 13.0, h: 4.5,
          roofSection: 'PointA_WestBalcony', labelPrefix: 'PointA_WestStaging', phase: 'Phase2', doorSide: 'east'
        });
        this._buildAccessibleBuilding(g, {
          cx: 14.5, baseY: cy, cz: cz - 3.0, w: 8.5, d: 13.0, h: 4.5,
          roofSection: 'PointA_EastBalcony', labelPrefix: 'PointA_EastStaging', phase: 'Phase2', doorSide: 'west'
        });

        const extW = 6.5, extD = 12.0;
        const westExt = new THREE.Mesh(new THREE.BoxGeometry(extW, 1.2, extD), this.mats.slateDeck);
        westExt.position.set(-22.25, cy - 0.6, cz + 6.0);
        g.add(westExt);
        this._registerWalkableQuad(
          new THREE.Vector3(-25.5, cy, cz),
          new THREE.Vector3(-19.0, cy, cz),
          new THREE.Vector3(-25.5, cy, cz + extD),
          new THREE.Vector3(-19.0, cy, cz + extD),
          'PointA_WestGroundExt'
        );
        this._registerBarrierSegment(-25.5, cz, -25.5, cz + extD, cy, cy + 1.1, 'PointA_WestExtOuterRail', 'Phase2', g);

        const eastExt = new THREE.Mesh(new THREE.BoxGeometry(extW, 1.2, extD), this.mats.slateDeck);
        eastExt.position.set(22.25, cy - 0.6, cz + 6.0);
        g.add(eastExt);
        this._registerWalkableQuad(
          new THREE.Vector3(19.0, cy, cz),
          new THREE.Vector3(25.5, cy, cz),
          new THREE.Vector3(19.0, cy, cz + extD),
          new THREE.Vector3(25.5, cy, cz + extD),
          'PointA_EastGroundExt'
        );
        this._registerBarrierSegment(25.5, cz, 25.5, cz + extD - 4.0, cy, cy + 1.1, 'PointA_EastExtOuterRail', 'Phase2', g);

        this._buildRampStair(g, new THREE.Vector3(-16.0, cy, cz + 9.5), new THREE.Vector3(-16.0, 4.5, cz + 3.5), 3.0, 'PointA_WestStair');
        this._buildRampStair(g, new THREE.Vector3(16.0, cy, cz + 9.5), new THREE.Vector3(16.0, 4.5, cz + 3.5), 3.0, 'PointA_EastStair');

        const catwalkY = 6.2;
        const catwalkZ = cz - 5.0;
        this._buildRampStair(g, new THREE.Vector3(-11.2, 4.5, catwalkZ), new THREE.Vector3(-7.0, catwalkY, catwalkZ), 2.8, 'PointA_WestCatwalkRamp', false);
        this._buildRampStair(g, new THREE.Vector3(11.2, 4.5, catwalkZ), new THREE.Vector3(7.0, catwalkY, catwalkZ), 2.8, 'PointA_EastCatwalkRamp', false);

        const catDeck = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.36, 3.2), this.mats.elevatedDeck);
        catDeck.position.set(cx, catwalkY - 0.18, catwalkZ);
        g.add(catDeck);
        this._registerBoxObstacle(-7.2, 7.2, catwalkY - 0.36, catwalkY, catwalkZ - 1.6, catwalkZ + 1.6, 'PointA_CatwalkOverhead', 'Phase2');
        this._registerWalkableQuad(
          new THREE.Vector3(-7.2, catwalkY, catwalkZ - 1.6),
          new THREE.Vector3(7.2, catwalkY, catwalkZ - 1.6),
          new THREE.Vector3(-7.2, catwalkY, catwalkZ + 1.6),
          new THREE.Vector3(7.2, catwalkY, catwalkZ + 1.6),
          'PointA_OverheadCatwalk'
        );
        this._registerBarrierSegment(-7.0, catwalkZ - 1.6, 7.0, catwalkZ - 1.6, catwalkY, catwalkY + 1.05, 'PointA_CatRailN', 'Phase2', g);
        this._registerBarrierSegment(-7.0, catwalkZ + 1.6, 7.0, catwalkZ + 1.6, catwalkY, catwalkY + 1.05, 'PointA_CatRailS', 'Phase2', g);

        const cover = [
          { x: -8.2, z: cz + 8.5, w: 2.8, h: 1.3, d: 2.0, mat: this.mats.cargoMatA },
          { x: 8.2, z: cz + 8.5, w: 2.8, h: 1.3, d: 2.0, mat: this.mats.cargoMatB },
          { x: -9.0, z: cz - 11.5, w: 2.4, h: 2.4, d: 4.5, mat: this.mats.cargoMatB },
          { x: 9.0, z: cz - 11.5, w: 2.4, h: 2.4, d: 4.5, mat: this.mats.cargoMatA }
        ];
        cover.forEach((c, i) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), c.mat);
          m.position.set(c.x, cy + c.h * 0.5, c.z);
          m.castShadow = true;
          g.add(m);
          this._registerBoxObstacle(c.x - c.w * 0.5, c.x + c.w * 0.5, cy, cy + c.h, c.z - c.d * 0.5, c.z + c.d * 0.5, `PointA_Cover_${i}`, 'Phase2');
        });
      }

      // =====================================================================
      // PHASE 3 — CHECKPOINT 1 INDUSTRIAL COMBAT PLAZA (54, 4, -54)
      // =====================================================================
      _buildPhase3Checkpoint1() {
        const g = this.groups.phase3CP1;
        const cx = 54, cy = 4, cz = -54;

        const capRing = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.9, 36), this.mats.cyanGlow);
        capRing.rotation.x = -Math.PI / 2;
        capRing.position.set(cx, cy + 0.06, cz);
        g.add(capRing);

        const flankW = 14, flankD = 26;
        [-17.5, 17.5].forEach((ox, idx) => {
          const deck = new THREE.Mesh(new THREE.BoxGeometry(flankW, 1.2, flankD), this.mats.slateDeck);
          deck.position.set(cx + ox, cy - 0.6, cz);
          g.add(deck);
          const fnd = new THREE.Mesh(new THREE.BoxGeometry(flankW - 1.0, cy + 4.5, flankD - 1.0), this.mats.darkWall);
          fnd.position.set(cx + ox, cy - 1.2 - (cy + 4.5) * 0.5, cz);
          g.add(fnd);
          this._registerWalkableQuad(
            new THREE.Vector3(cx + ox - flankW * 0.5, cy, cz - flankD * 0.5),
            new THREE.Vector3(cx + ox + flankW * 0.5, cy, cz - flankD * 0.5),
            new THREE.Vector3(cx + ox - flankW * 0.5, cy, cz + flankD * 0.5),
            new THREE.Vector3(cx + ox + flankW * 0.5, cy, cz + flankD * 0.5),
            `CP1_FlankDeck_${idx}`
          );
        });

        [-11.8, 11.8].forEach((offset, idx) => {
          const px = cx + offset * 0.92;
          const pz = cz - offset * 0.35;
          const gatePillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.2, 1.4), this.mats.amberGlow);
          gatePillar.position.set(px, cy + 3.1, pz);
          g.add(gatePillar);
          this._registerBoxObstacle(px - 0.7, px + 0.7, cy, cy + 6.2, pz - 0.7, pz + 0.7, `CP1_GatePillar_${idx}`, 'Phase3');
        });

        const bAx = cx - 17.5, bAz = cz - 2.0;
        const bBx = cx + 17.5, bBz = cz - 2.0;
        this._buildAccessibleBuilding(g, {
          cx: bAx, baseY: cy, cz: bAz, w: 8.5, d: 12.0, h: 4.5,
          roofSection: 'CP1_RoofA', labelPrefix: 'CP1_BldgA', phase: 'Phase3', doorSide: 'east'
        });
        this._buildAccessibleBuilding(g, {
          cx: bBx, baseY: cy, cz: bBz, w: 8.5, d: 12.0, h: 4.5,
          roofSection: 'CP1_RoofB', labelPrefix: 'CP1_BldgB', phase: 'Phase3', doorSide: 'west'
        });

        const roofY = cy + 4.5;
        this._buildRampStair(g, new THREE.Vector3(bAx, cy, bAz + 11.5), new THREE.Vector3(bAx, roofY, bAz + 6.0), 3.0, 'CP1_StairA');
        this._buildRampStair(g, new THREE.Vector3(bBx, cy, bBz + 11.5), new THREE.Vector3(bBx, roofY, bBz + 6.0), 3.0, 'CP1_StairB');

        const skySpan = (bBx - 4.25) - (bAx + 4.25);
        const skyDeck = new THREE.Mesh(new THREE.BoxGeometry(skySpan + 0.8, 0.36, 3.6), this.mats.elevatedDeck);
        skyDeck.position.set(cx, roofY - 0.18, bAz);
        g.add(skyDeck);
        this._registerBoxObstacle(bAx + 4.0, bBx - 4.0, roofY - 0.36, roofY, bAz - 1.8, bAz + 1.8, 'CP1_SkywalkOverhead', 'Phase3');
        this._registerWalkableQuad(
          new THREE.Vector3(bAx + 4.0, roofY, bAz - 1.8),
          new THREE.Vector3(bBx - 4.0, roofY, bAz - 1.8),
          new THREE.Vector3(bAx + 4.0, roofY, bAz + 1.8),
          new THREE.Vector3(bBx - 4.0, roofY, bAz + 1.8),
          'CP1_Skywalk'
        );
        this._registerBarrierSegment(bAx + 4.3, bAz - 1.8, bBx - 4.3, bAz - 1.8, roofY, roofY + 1.05, 'CP1_SkyRailN', 'Phase3', g);
        this._registerBarrierSegment(bAx + 4.3, bAz + 1.8, bBx - 4.3, bAz + 1.8, roofY, roofY + 1.05, 'CP1_SkyRailS', 'Phase3', g);

        const cp1Cover = [
          { x: cx - 11.2, z: cz + 9.0, w: 2.8, h: 1.25, d: 2.0, mat: this.mats.cargoMatA },
          { x: cx + 11.2, z: cz + 9.0, w: 2.8, h: 1.25, d: 2.0, mat: this.mats.cargoMatB },
          { x: cx - 11.5, z: cz - 10.5, w: 3.0, h: 1.3, d: 2.0, mat: this.mats.cargoMatB },
          { x: cx + 11.5, z: cz - 10.5, w: 3.0, h: 1.3, d: 2.0, mat: this.mats.cargoMatA }
        ];
        cp1Cover.forEach((c, idx) => {
          const box = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), c.mat);
          box.position.set(c.x, cy + c.h * 0.5, c.z);
          g.add(box);
          this._registerBoxObstacle(c.x - c.w * 0.5, c.x + c.w * 0.5, cy, cy + c.h, c.z - c.d * 0.5, c.z + c.d * 0.5, `CP1_Cover_${idx}`, 'Phase3');
        });

        const gwPt = this.routeSpline.getPoint(0.45);
        const gwTan = this.routeSpline.getTangent(0.45).normalize();
        const gwRight = new THREE.Vector3().crossVectors(gwTan, new THREE.Vector3(0, 1, 0)).normalize();
        const gwYaw = Math.atan2(gwTan.x, gwTan.z);
        const gwGroup = new THREE.Group();
        gwGroup.position.copy(gwPt);
        gwGroup.rotation.y = gwYaw;

        const gwHalfSpan = 10.2;
        const gwH = 7.4;
        [-gwHalfSpan, gwHalfSpan].forEach((lx, idx) => {
          const p = new THREE.Mesh(new THREE.BoxGeometry(2.0, gwH, 2.4), this.mats.darkWall);
          p.position.set(lx, gwH * 0.5, 0);
          gwGroup.add(p);
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8, 2.55), this.mats.amberGlow);
          lamp.position.set(lx, gwH - 1.2, 0);
          gwGroup.add(lamp);

          const wp = gwPt.clone().addScaledVector(gwRight, lx);
          this._registerBoxObstacle(wp.x - 1.2, wp.x + 1.2, gwPt.y, gwPt.y + gwH, wp.z - 1.2, wp.z + 1.2, `CP1_BridgeGatePillar_${idx}`, 'Phase3');
        });
        const gwHeader = new THREE.Mesh(new THREE.BoxGeometry(gwHalfSpan * 2 + 2.4, 1.2, 2.6), this.mats.darkWall);
        gwHeader.position.set(0, gwH + 0.4, 0);
        gwGroup.add(gwHeader);
        this._registerBoxObstacle(gwPt.x - 10.5, gwPt.x + 10.5, gwPt.y + gwH - 0.2, gwPt.y + gwH + 1.0, gwPt.z - 2.5, gwPt.z + 2.5, 'CP1_BridgeGateHeaderOverhead', 'Phase3');

        const gwCyan = new THREE.Mesh(new THREE.BoxGeometry(gwHalfSpan * 2 - 2.0, 0.24, 2.75), this.mats.cyanGlow);
        gwCyan.position.set(0, gwH - 0.15, 0);
        gwGroup.add(gwCyan);
        g.add(gwGroup);
      }

      // =====================================================================
      // PHASE 4 — CHECKPOINT 2 ELEVATED INDUSTRIAL FACILITY (-56, 6, 56)
      // =====================================================================
      _buildPhase4Checkpoint2() {
        const g = this.groups.phase4CP2;
        const cx = -56, cy = 6, cz = 56;

        const cp2Ring = new THREE.Mesh(new THREE.RingGeometry(4.4, 5.1, 36), this.mats.cyanGlow);
        cp2Ring.rotation.x = -Math.PI / 2;
        cp2Ring.position.set(cx, cy + 0.06, cz);
        g.add(cp2Ring);

        const extW = 14.0, extD = 26.0;
        [-17.5, 17.5].forEach((ox, idx) => {
          const deck = new THREE.Mesh(new THREE.BoxGeometry(extW, 1.2, extD), this.mats.slateDeck);
          deck.position.set(cx + ox, cy - 0.6, cz);
          g.add(deck);
          const fnd = new THREE.Mesh(new THREE.BoxGeometry(extW - 1.0, cy + 4.5, extD - 1.0), this.mats.darkWall);
          fnd.position.set(cx + ox, cy - 1.2 - (cy + 4.5) * 0.5, cz);
          g.add(fnd);
          this._registerWalkableQuad(
            new THREE.Vector3(cx + ox - extW * 0.5, cy, cz - extD * 0.5),
            new THREE.Vector3(cx + ox + extW * 0.5, cy, cz - extD * 0.5),
            new THREE.Vector3(cx + ox - extW * 0.5, cy, cz + extD * 0.5),
            new THREE.Vector3(cx + ox + extW * 0.5, cy, cz + extD * 0.5),
            `CP2_HallFoundation_${idx}`
          );
        });

        // Ground-level bypasses around the processing hall's stair and silo; connect defender exits to the plaza.
        for(const z of [41.5,71.5]){
          const deck=new THREE.Mesh(new THREE.BoxGeometry(19,1.2,6),this.mats.slateDeck);
          deck.position.set(-40.5,cy-.6,z);g.add(deck);
          this._registerWalkableQuad(new THREE.Vector3(-50,cy,z-3),new THREE.Vector3(-31,cy,z-3),new THREE.Vector3(-50,cy,z+3),new THREE.Vector3(-31,cy,z+3),'CP2_EastHallBypass');
        }

        const hWx = cx - 17.5, hWz = cz;
        const hEx = cx + 17.5, hEz = cz;
        const deckY = cy + 4.8; // Y = 10.8m
        this._buildAccessibleBuilding(g, {
          cx: hWx, baseY: cy, cz: hWz, w: 9.0, d: 13.0, h: 4.8,
          roofSection: 'CP2_WestObsDeck', labelPrefix: 'CP2_WestHall', phase: 'Phase4', doorSide: 'east'
        });
        this._buildAccessibleBuilding(g, {
          cx: hEx, baseY: cy, cz: hEz, w: 9.0, d: 13.0, h: 4.8,
          roofSection: 'CP2_EastObsDeck', labelPrefix: 'CP2_EastHall', phase: 'Phase4', doorSide: 'west'
        });

        this._buildRampStair(g, new THREE.Vector3(hWx, cy, hWz + 12.2), new THREE.Vector3(hWx, deckY, hWz + 6.5), 3.0, 'CP2_WestStair');
        this._buildRampStair(g, new THREE.Vector3(hEx, cy, hEz + 12.2), new THREE.Vector3(hEx, deckY, hEz + 6.5), 3.0, 'CP2_EastStair');

        const catSpan = (hEx - 4.5) - (hWx + 4.5);
        const catMesh = new THREE.Mesh(new THREE.BoxGeometry(catSpan + 1.0, 0.4, 3.8), this.mats.elevatedDeck);
        catMesh.position.set(cx, deckY - 0.2, cz);
        g.add(catMesh);
        this._registerBoxObstacle(hWx + 4.2, hEx - 4.2, deckY - 0.4, deckY, cz - 1.9, cz + 1.9, 'CP2_CatwalkOverhead', 'Phase4');
        this._registerWalkableQuad(
          new THREE.Vector3(hWx + 4.2, deckY, cz - 1.9),
          new THREE.Vector3(hEx - 4.2, deckY, cz - 1.9),
          new THREE.Vector3(hWx + 4.2, deckY, cz + 1.9),
          new THREE.Vector3(hEx - 4.2, deckY, cz + 1.9),
          'CP2_Catwalk'
        );
        this._registerBarrierSegment(hWx + 4.6, cz - 1.9, hEx - 4.6, cz - 1.9, deckY, deckY + 1.05, 'CP2_CatRailN', 'Phase4', g);
        this._registerBarrierSegment(hWx + 4.6, cz + 1.9, hEx - 4.6, cz + 1.9, deckY, deckY + 1.05, 'CP2_CatRailS', 'Phase4', g);

        [
          { x: hWx, z: hWz - 9.2 },
          { x: hEx, z: hEz - 9.2 }
        ].forEach((mPos, idx) => {
          const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 6.2, 16), this.mats.machinery);
          silo.position.set(mPos.x, cy + 3.1, mPos.z);
          g.add(silo);
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.25, 16), this.mats.amberGlow);
          ring.position.set(mPos.x, cy + 5.6, mPos.z);
          g.add(ring);
          this._registerBoxObstacle(mPos.x - 2.1, mPos.x + 2.1, cy, cy + 6.2, mPos.z - 2.1, mPos.z + 2.1, `CP2_Silo_${idx}`, 'Phase4');
        });

        const cp2Cover = [
          { x: cx - 10.5, z: cz + 9.2, w: 3.0, h: 1.3, d: 2.0, mat: this.mats.cargoMatB },
          { x: cx + 10.5, z: cz + 9.2, w: 3.0, h: 1.3, d: 2.0, mat: this.mats.cargoMatA },
          { x: cx - 10.5, z: cz - 9.2, w: 3.0, h: 1.3, d: 2.0, mat: this.mats.cargoMatA },
          { x: cx + 10.5, z: cz - 9.2, w: 3.0, h: 1.3, d: 2.0, mat: this.mats.cargoMatB }
        ];
        cp2Cover.forEach((c, idx) => {
          const box = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), c.mat);
          box.position.set(c.x, cy + c.h * 0.5, c.z);
          g.add(box);
          this._registerBoxObstacle(c.x - c.w * 0.5, c.x + c.w * 0.5, cy, cy + c.h, c.z - c.d * 0.5, c.z + c.d * 0.5, `CP2_Cover_${idx}`, 'Phase4');
        });
      }

      // =====================================================================
      // PHASE 5 — DELIVERY POINT B FORTIFIED STATION (44, 2, 155)
      // =====================================================================
      _buildPhase5DeliveryPointB() {
        const g = this.groups.phase5PointB;
        const cx = 44, cy = 2, cz = 155;

        const stationFnd = new THREE.Mesh(new THREE.BoxGeometry(50, cy + 4.5, 46), this.mats.darkWall);
        stationFnd.position.set(cx, cy - 1.2 - (cy + 4.5) * 0.5, cz + 2.0);
        g.add(stationFnd);

        const apron = new THREE.Mesh(new THREE.BoxGeometry(48, 1.2, 44), this.mats.slateDeck);
        apron.position.set(cx, cy - 0.6, cz + 2.0);
        apron.receiveShadow = true;
        g.add(apron);
        this._registerWalkableQuad(
          new THREE.Vector3(cx - 24, cy, cz - 20),
          new THREE.Vector3(cx + 24, cy, cz - 20),
          new THREE.Vector3(cx - 24, cy, cz + 24),
          new THREE.Vector3(cx + 24, cy, cz + 24),
          'PointB_Apron'
        );

        const bayPt = this.routeSpline.getPoint(0.92);
        const bayTan = this.routeSpline.getTangent(0.92).normalize();
        const bayRight = new THREE.Vector3().crossVectors(bayTan, new THREE.Vector3(0, 1, 0)).normalize();
        const bayYaw = Math.atan2(bayTan.x, bayTan.z);
        const bayGroup = new THREE.Group();
        bayGroup.position.copy(bayPt);
        bayGroup.rotation.y = bayYaw;

        const bayHalfW = 9.4;
        const bayH = 7.6;
        [-bayHalfW, bayHalfW].forEach((lx, idx) => {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.0, bayH, 2.4), this.mats.darkWall);
          pillar.position.set(lx, bayH * 0.5, 0);
          bayGroup.add(pillar);
          const wp = bayPt.clone().addScaledVector(bayRight, lx);
          this._registerBoxObstacle(wp.x - 1.2, wp.x + 1.2, bayPt.y, bayPt.y + bayH, wp.z - 1.2, wp.z + 1.2, `PointB_BayPillar_${idx}`, 'Phase5');
        });
        const bayHeader = new THREE.Mesh(new THREE.BoxGeometry(bayHalfW * 2 + 2.4, 1.2, 2.6), this.mats.darkWall);
        bayHeader.position.set(0, bayH + 0.3, 0);
        bayGroup.add(bayHeader);
        this._registerBoxObstacle(bayPt.x - 10.0, bayPt.x + 10.0, bayPt.y + bayH - 0.3, bayPt.y + bayH + 0.9, bayPt.z - 2.5, bayPt.z + 2.5, 'PointB_BayHeaderOverhead', 'Phase5');

        const bayAmberTrim = new THREE.Mesh(new THREE.BoxGeometry(bayHalfW * 2 - 2.0, 0.28, 2.75), this.mats.amberGlow);
        bayAmberTrim.position.set(0, bayH - 0.2, 0);
        bayGroup.add(bayAmberTrim);
        g.add(bayGroup);

        const objPad = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.0, 0.16, 28), this.mats.darkWall);
        objPad.position.set(cx, cy + 0.08, cz);
        g.add(objPad);

        const amberRing = new THREE.Mesh(new THREE.RingGeometry(4.3, 5.1, 36), this.mats.amberGlow);
        amberRing.rotation.x = -Math.PI / 2;
        amberRing.position.set(cx, cy + 0.06, cz);
        g.add(amberRing);

        this.deliveryBeacon = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), this.mats.amberGlow);
        this.deliveryBeacon.position.set(cx, cy + 5.2, cz);
        g.add(this.deliveryBeacon);

        const dWx = cx - 17.5, dWz = cz + 6.0;
        const dEx = cx + 17.5, dEz = cz + 6.0;
        this._buildAccessibleBuilding(g, {
          cx: dWx, baseY: cy, cz: dWz, w: 9.0, d: 12.0, h: 4.5,
          roofSection: 'PointB_WestRoof', labelPrefix: 'PointB_DefenderWest', phase: 'Phase5', doorSide: 'bothNS'
        });
        this._buildAccessibleBuilding(g, {
          cx: dEx, baseY: cy, cz: dEz, w: 9.0, d: 12.0, h: 4.5,
          roofSection: 'PointB_EastRoof', labelPrefix: 'PointB_DefenderEast', phase: 'Phase5', doorSide: 'bothNS'
        });

        const obsY = cy + 4.5;
        const obsZ = cz + 10.0;
        const obsSpan = (dEx - 4.5) - (dWx + 4.5);
        const obsDeck = new THREE.Mesh(new THREE.BoxGeometry(obsSpan + 1.4, 0.42, 3.8), this.mats.elevatedDeck);
        obsDeck.position.set(cx, obsY - 0.21, obsZ);
        g.add(obsDeck);
        this._registerWalkableQuad(
          new THREE.Vector3(dWx + 4.0, obsY, obsZ - 1.9),
          new THREE.Vector3(dEx - 4.0, obsY, obsZ - 1.9),
          new THREE.Vector3(dWx + 4.0, obsY, obsZ + 1.9),
          new THREE.Vector3(dEx - 4.0, obsY, obsZ + 1.9),
          'PointB_ObservationBridge'
        );
        this._registerBarrierSegment(dWx + 4.6, obsZ - 1.9, dEx - 4.6, obsZ - 1.9, obsY, obsY + 1.05, 'PointB_ObsRailFront', 'Phase5', g);
        this._registerBarrierSegment(dWx + 4.6, obsZ + 1.9, dEx - 4.6, obsZ + 1.9, obsY, obsY + 1.05, 'PointB_ObsRailBack', 'Phase5', g);

        this._buildRampStair(g, new THREE.Vector3(dWx, cy, dWz - 11.5), new THREE.Vector3(dWx, obsY, dWz - 6.0), 3.0, 'PointB_WestStair');
        this._buildRampStair(g, new THREE.Vector3(dEx, cy, dEz - 11.5), new THREE.Vector3(dEx, obsY, dEz - 6.0), 3.0, 'PointB_EastStair');

        const defCover = [
          { x: cx - 10.2, z: cz + 14.5, w: 3.0, h: 1.25, d: 2.2, mat: this.mats.cargoMatB },
          { x: cx + 10.2, z: cz + 14.5, w: 3.0, h: 1.25, d: 2.2, mat: this.mats.cargoMatA },
          { x: cx, z: cz + 18.5, w: 4.5, h: 1.35, d: 1.8, mat: this.mats.cargoMatA }
        ];
        defCover.forEach((c, idx) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), c.mat);
          m.position.set(c.x, cy + c.h * 0.5, c.z);
          g.add(m);
          this._registerBoxObstacle(c.x - c.w * 0.5, c.x + c.w * 0.5, cy, cy + c.h, c.z - c.d * 0.5, c.z + c.d * 0.5, `PointB_Cover_${idx}`, 'Phase5');
        });
      }

      // =====================================================================
      // PHASE 6 — TACTICAL COMBAT PATHWAYS
      // =====================================================================
      _buildPhase6TacticalPathways() {
        const g = this.groups.phase6Tactical;
        const addDeck = (cx, y, cz, w, d, section, mat = this.mats.tacticalDeck) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), mat);
          mesh.position.set(cx, y - 0.25, cz);
          mesh.receiveShadow = true;
          mesh.castShadow = true;
          g.add(mesh);

          const colH = Math.max(1.2, y + 4.5);
          const col = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.45, 4.0), colH, Math.min(d * 0.45, 4.0)), this.mats.darkWall);
          col.position.set(cx, y - 0.5 - colH * 0.5, cz);
          g.add(col);

          this._registerWalkableQuad(
            new THREE.Vector3(cx - w * 0.5, y, cz - d * 0.5),
            new THREE.Vector3(cx + w * 0.5, y, cz - d * 0.5),
            new THREE.Vector3(cx - w * 0.5, y, cz + d * 0.5),
            new THREE.Vector3(cx + w * 0.5, y, cz + d * 0.5),
            section
          );
        };

        // 1. Secondary Flank Route 6A: Point A East Ext -> Mid-Terrace -> CP1 East Flank
        addDeck(56, 2.2, -102, 14, 14, 'P6_Flank6A_Hub');
        this._buildRampStair(g, new THREE.Vector3(22.5, 0.0, -136.0), new THREE.Vector3(50.5, 2.2, -108.0), 5.2, 'P6_Flank6A_SouthRamp', true, this.mats.tacticalDeck);
        this._buildRampStair(g, new THREE.Vector3(60.0, 2.2, -95.0), new THREE.Vector3(71.5, 4.0, -67.0), 5.2, 'P6_Flank6A_NorthRamp', true, this.mats.tacticalDeck);

        addDeck(56, 6.2, -114, 10, 8, 'P6_Overlook6A_Deck', this.mats.elevatedDeck);
        const trim6A = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.14, 8.2), this.mats.emeraldGlow);
        trim6A.position.set(56, 6.18, -114);
        g.add(trim6A);
        this._buildRampStair(g, new THREE.Vector3(56, 2.2, -103.5), new THREE.Vector3(56, 6.2, -111.0), 3.2, 'P6_Overlook6A_Stair', true);

        // 2. Interconnected Under-Bridge Tactical Passage (Y = 1.5m under 8.8m apex)
        addDeck(-4, 1.5, 4, 18, 18, 'P6_UnderBridge_Hub');
        const ubRing = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.8, 32), this.mats.emeraldGlow);
        ubRing.rotation.x = -Math.PI / 2;
        ubRing.position.set(-4, 1.56, 4);
        g.add(ubRing);

        this._buildRampStair(g, new THREE.Vector3(4.0, 1.5, -4.0), new THREE.Vector3(34.5, 4.0, -41.0), 5.4, 'P6_UnderBridge_EastRamp', true, this.mats.tacticalDeck);
        this._buildRampStair(g, new THREE.Vector3(-12.0, 1.5, 12.0), new THREE.Vector3(-38.5, 6.0, 43.0), 5.4, 'P6_UnderBridge_WestRamp', true, this.mats.tacticalDeck);

        addDeck(-17, 4.2, -6, 8, 8, 'P6_UnderBridge_SpurDeck', this.mats.elevatedDeck);
        this._buildRampStair(g, new THREE.Vector3(-10.5, 1.5, -1.0), new THREE.Vector3(-14.5, 4.2, -3.5), 3.0, 'P6_UnderBridge_SpurStair', false);

        // 3. Secondary Flank Route 6B: CP2 East Flank -> Elevated Terrace -> Point B Apron
        addDeck(12, 4.2, 98, 14, 14, 'P6_Flank6B_Hub');
        this._buildRampStair(g, new THREE.Vector3(-38.5, 6.0, 69.0), new THREE.Vector3(5.5, 4.2, 94.0), 5.2, 'P6_Flank6B_NorthRamp', true, this.mats.tacticalDeck);
        this._buildRampStair(g, new THREE.Vector3(17.5, 4.2, 104.5), new THREE.Vector3(36.0, 2.0, 135.0), 5.2, 'P6_Flank6B_SouthRamp', true, this.mats.tacticalDeck);

        addDeck(24, 7.8, 92, 10, 8, 'P6_Overlook6B_Deck', this.mats.elevatedDeck);
        const trim6B = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.14, 8.2), this.mats.emeraldGlow);
        trim6B.position.set(24, 7.78, 92);
        g.add(trim6B);
        this._buildRampStair(g, new THREE.Vector3(13.0, 4.2, 99.0), new THREE.Vector3(21.5, 7.8, 94.5), 3.2, 'P6_Overlook6B_Stair', true);

        // 4. Secondary Rooftop Tactical Loop Walkways
        const cp1LoopDeck = new THREE.Mesh(new THREE.BoxGeometry(27.0, 0.36, 3.0), this.mats.elevatedDeck);
        cp1LoopDeck.position.set(54, 8.5 - 0.18, -60.5);
        g.add(cp1LoopDeck);
        this._registerWalkableQuad(
          new THREE.Vector3(40.5, 8.5, -62.0),
          new THREE.Vector3(67.5, 8.5, -62.0),
          new THREE.Vector3(40.5, 8.5, -59.0),
          new THREE.Vector3(67.5, 8.5, -59.0),
          'P6_CP1_NorthRoofWalkway'
        );
        this._registerBarrierSegment(40.8, -62.0, 67.2, -62.0, 8.5, 9.55, 'P6_CP1_NorthLoopRailN', 'Phase6', g);

        const cp2LoopDeck = new THREE.Mesh(new THREE.BoxGeometry(27.0, 0.38, 3.0), this.mats.elevatedDeck);
        cp2LoopDeck.position.set(-56, 10.8 - 0.19, 61.0);
        g.add(cp2LoopDeck);
        this._registerWalkableQuad(
          new THREE.Vector3(-69.5, 10.8, 59.5),
          new THREE.Vector3(-42.5, 10.8, 59.5),
          new THREE.Vector3(-69.5, 10.8, 62.5),
          new THREE.Vector3(-42.5, 10.8, 62.5),
          'P6_CP2_SouthRoofWalkway'
        );
        this._registerBarrierSegment(-69.0, 62.5, -43.0, 62.5, 10.8, 11.85, 'P6_CP2_SouthLoopRailS', 'Phase6', g);

        const pbLoopDeck = new THREE.Mesh(new THREE.BoxGeometry(27.0, 0.38, 2.8), this.mats.elevatedDeck);
        pbLoopDeck.position.set(44, 6.5 - 0.19, 158.0);
        g.add(pbLoopDeck);
        this._registerWalkableQuad(
          new THREE.Vector3(30.5, 6.5, 156.6),
          new THREE.Vector3(57.5, 6.5, 156.6),
          new THREE.Vector3(30.5, 6.5, 159.4),
          new THREE.Vector3(57.5, 6.5, 159.4),
          'P6_PointB_FrontRoofWalkway'
        );
        this._registerBarrierSegment(31.0, 156.6, 57.0, 156.6, 6.5, 7.55, 'P6_PointB_FrontLoopRailN', 'Phase6', g);

        // 5. Instanced Protective Cover
        const coverPlacements = [
          { x: 52.5, y: 2.2, z: -100.5, rotY: 0.4 },
          { x: 59.5, y: 2.2, z: -104.5, rotY: 0.4 },
          { x: 52.5, y: 6.2, z: -115.5, rotY: 0.0 },
          { x: 59.5, y: 6.2, z: -115.5, rotY: 0.0 },
          { x: -8.5, y: 1.5, z: 0.5, rotY: 0.78 },
          { x: 0.5, y: 1.5, z: 8.5, rotY: 0.78 },
          { x: -17.0, y: 4.2, z: -8.2, rotY: 0.0 },
          { x: 8.5, y: 4.2, z: 99.5, rotY: -0.5 },
          { x: 15.5, y: 4.2, z: 96.5, rotY: -0.5 },
          { x: 24.0, y: 7.8, z: 90.0, rotY: 0.0 },
          { x: 54.0, y: 8.5, z: -61.2, rotY: 0.0 },
          { x: -56.0, y: 10.8, z: 61.6, rotY: 0.0 }
        ];

        const coverGeo = new THREE.BoxGeometry(2.2, 1.15, 0.7);
        const coverInstanced = new THREE.InstancedMesh(coverGeo, this.mats.machinery, coverPlacements.length);
        coverInstanced.castShadow = true;
        coverInstanced.receiveShadow = true;

        const accentGeo = new THREE.BoxGeometry(2.0, 0.14, 0.76);
        const accentInstanced = new THREE.InstancedMesh(accentGeo, this.mats.emeraldGlow, coverPlacements.length);

        const dummy = new THREE.Object3D();
        coverPlacements.forEach((cp, idx) => {
          dummy.position.set(cp.x, cp.y + 0.575, cp.z);
          dummy.rotation.set(0, cp.rotY, 0);
          dummy.updateMatrix();
          coverInstanced.setMatrixAt(idx, dummy.matrix);

          dummy.position.set(cp.x, cp.y + 1.08, cp.z);
          dummy.updateMatrix();
          accentInstanced.setMatrixAt(idx, dummy.matrix);

          const c = Math.abs(Math.cos(cp.rotY));
          const s = Math.abs(Math.sin(cp.rotY));
          const hx = 1.1 * c + 0.35 * s;
          const hz = 1.1 * s + 0.35 * c;
          this._registerBoxObstacle(cp.x - hx, cp.x + hx, cp.y, cp.y + 1.15, cp.z - hz, cp.z + hz, `P6_InstCover_${idx}`, 'Phase6');
        });
        coverInstanced.instanceMatrix.needsUpdate = true;
        accentInstanced.instanceMatrix.needsUpdate = true;
        g.add(coverInstanced);
        g.add(accentInstanced);
        this.instancedCoverCount = coverPlacements.length;
      }

      // =====================================================================
      // PHASE 7 & 8 — ATTACKER & DEFENDER SPAWN FACILITIES + PROTECTION
      // =====================================================================
      _addSpawnDeck(parent, minX, maxX, y, minZ, maxZ, section, mat) {
        const w = maxX - minX;
        const d = maxZ - minZ;
        const cx = (minX + maxX) * 0.5;
        const cz = (minZ + maxZ) * 0.5;

        const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), mat);
        deck.position.set(cx, y - 0.5, cz);
        deck.receiveShadow = true;
        deck.castShadow = true;
        parent.add(deck);

        const fndH = Math.max(1.2, y + 4.5);
        const fnd = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, fndH, d - 0.8), this.mats.darkWall);
        fnd.position.set(cx, y - 1.0 - fndH * 0.5, cz);
        parent.add(fnd);

        this._registerWalkableQuad(
          new THREE.Vector3(minX, y, minZ),
          new THREE.Vector3(maxX, y, minZ),
          new THREE.Vector3(minX, y, maxZ),
          new THREE.Vector3(maxX, y, maxZ),
          section
        );
      }

      _addSolidShieldWall(parent, minX, maxX, baseY, h, minZ, maxZ, label, accentMat = null) {
        const w = maxX - minX;
        const d = maxZ - minZ;
        const cx = (minX + maxX) * 0.5;
        const cz = (minZ + maxZ) * 0.5;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mats.darkWall);
        wall.position.set(cx, baseY + h * 0.5, cz);
        wall.castShadow = true;
        wall.receiveShadow = true;
        parent.add(wall);

        if (accentMat) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.22, d + 0.08), accentMat);
          strip.position.set(cx, baseY + h - 0.35, cz);
          parent.add(strip);
        }

        this._registerBoxObstacle(minX, maxX, baseY, baseY + h, minZ, maxZ, label, 'Phase7');
      }

      _registerSpawnPoint(zoneId, x, y, z, yawRad, slotIdx) {
        const zone = this.spawnZones[zoneId];
        if (!zone) return;
        const pt = { id: `${zoneId}_${slotIdx}`, zoneId, team: zone.team, x, y, z, yaw: yawRad, slot: slotIdx };
        zone.points.push(pt);

        const mg = new THREE.Group();
        mg.position.set(x, y + 0.06, z);
        mg.rotation.y = yawRad;

        const isAtk = zone.team === 'attacker';
        const ringMat = new THREE.MeshBasicMaterial({
          color: isAtk ? 0x3b82f6 : 0xf59e0b,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide
        });
        const arrowMat = new THREE.MeshBasicMaterial({
          color: isAtk ? 0x93c5fd : 0xfcd34d,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide
        });

        const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.88, 20), ringMat);
        ring.rotation.x = -Math.PI / 2;
        mg.add(ring);

        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0.58);
        arrowShape.lineTo(0.32, -0.18);
        arrowShape.lineTo(0, 0.02);
        arrowShape.lineTo(-0.32, -0.18);
        arrowShape.closePath();
        const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), arrowMat);
        arrow.rotation.x = -Math.PI / 2;
        arrow.position.y = 0.02;
        mg.add(arrow);

        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.35, 8), ringMat);
        pylon.position.y = 0.72;
        mg.add(pylon);

        this.groups.spawnMarkers.add(mg);
        this.spawnMarkerEntries.push({ zoneId, team: zone.team, group: mg, ringMat, arrowMat, baseY: y + 0.06 });
      }

      _buildPhase7SpawnSystem() {
        const g = this.groups.phase7Spawns;

        // 1. ATTACKER BASE SPAWN SANCTUARY (Behind Point A, Y = 0.0, 12 Spawns)
        const atkY = 0.0;
        const atkH = 5.2;
        this._addSpawnDeck(g, -24.0, 24.0, atkY, -194.0, -173.0, 'P7_AtkBase_Floor', this.mats.spawnDeckAtk);
        this._addSpawnDeck(g, -24.0, -18.5, atkY, -173.0, -148.0, 'P7_AtkBase_WestFlankLink', this.mats.slateDeck);
        this._addSpawnDeck(g, 18.5, 24.0, atkY, -173.0, -148.0, 'P7_AtkBase_EastFlankLink', this.mats.slateDeck);
        this._addSpawnDeck(g, -17.5, -10.0, atkY, -173.0, -162.5, 'P7_AtkBase_WestApronLink', this.mats.slateDeck);
        this._addSpawnDeck(g, 10.0, 17.5, atkY, -173.0, -162.5, 'P7_AtkBase_EastApronLink', this.mats.slateDeck);

        this._addSolidShieldWall(g, -24.0, 24.0, atkY, atkH, -194.5, -193.5, 'P7_AtkBase_BackWall', this.mats.blueGlow);
        this._addSolidShieldWall(g, -24.5, -23.5, atkY, atkH, -194.0, -173.0, 'P7_AtkBase_WestWall', this.mats.blueGlow);
        this._addSolidShieldWall(g, 23.5, 24.5, atkY, atkH, -194.0, -173.0, 'P7_AtkBase_EastWall', this.mats.blueGlow);
        this._addSolidShieldWall(g, -19.2, -17.2, atkY, atkH, -173.5, -172.5, 'P7_AtkBase_BaffleW');
        this._addSolidShieldWall(g, -10.5, 10.5, atkY, atkH, -173.5, -172.5, 'P7_AtkBase_BaffleCenter', this.mats.blueGlow);
        this._addSolidShieldWall(g, 17.2, 19.2, atkY, atkH, -173.5, -172.5, 'P7_AtkBase_BaffleE');

        const atkRoof = new THREE.Mesh(new THREE.BoxGeometry(49.0, 0.55, 22.0), this.mats.darkWall);
        atkRoof.position.set(0, atkY + atkH + 0.28, -183.5);
        g.add(atkRoof);
        {const b=new THREE.Box3().setFromObject(atkRoof);this._registerBoxObstacle(b.min.x,b.max.x,b.min.y,b.max.y,b.min.z,b.max.z,'P7_AtkBase_Canopy','Phase7');}
        this._registerBarrierSegment(-24.0, -173.0, -24.0, -148.0, atkY, atkY + 1.1, 'P7_AtkWestLinkRail', 'Phase7', g);
        this._registerBarrierSegment(24.0, -173.0, 24.0, -148.0, atkY, atkY + 1.1, 'P7_AtkEastLinkRail', 'Phase7', g);

        const atkBaseXs = [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5];
        const atkBaseZs = [-188.5, -181.5];
        let atkSlot = 1;
        for (const sz of atkBaseZs) {
          for (const sx of atkBaseXs) {
            this._registerSpawnPoint('attackerBase', sx, atkY, sz, 0, atkSlot++);
          }
        }

        // 2. CP1 ATTACKER FORWARD SPAWN BAY (Stage 1 Unlock, Y = 4.0, 10 Spawns)
        const cp1Y = 4.0;
        const bayH = 4.8;
        this._addSpawnDeck(g, 78.5, 95.0, cp1Y, -66.5, -45.5, 'P7_AtkCP1_Floor', this.mats.spawnDeckAtk);
        this._addSolidShieldWall(g, 94.5, 95.5, cp1Y, bayH, -66.5, -45.5, 'P7_AtkCP1_BackWall', this.mats.blueGlow);
        this._addSolidShieldWall(g, 78.5, 95.0, cp1Y, bayH, -67.0, -66.0, 'P7_AtkCP1_NorthWall');
        this._addSolidShieldWall(g, 78.5, 95.0, cp1Y, bayH, -46.0, -45.0, 'P7_AtkCP1_SouthWall');
        this._addSolidShieldWall(g, 78.2, 79.0, cp1Y, bayH, -61.8, -50.2, 'P7_AtkCP1_FrontBaffle', this.mats.blueGlow);
        const cp1BayRoof = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.5, 21.8), this.mats.darkWall);
        cp1BayRoof.position.set(86.75, cp1Y + bayH + 0.25, -56.0);
        g.add(cp1BayRoof);
        {const b=new THREE.Box3().setFromObject(cp1BayRoof);this._registerBoxObstacle(b.min.x,b.max.x,b.min.y,b.max.y,b.min.z,b.max.z,'P7_AtkCP1_Canopy','Phase7');}

        let cp1AtkSlot = 1;
        for (const sx of [84.5, 90.0]) {
          for (const sz of [-62.0, -59.0, -56.0, -53.0, -50.0]) {
            this._registerSpawnPoint('attackerCP1', sx, cp1Y, sz, -Math.PI / 2, cp1AtkSlot++);
          }
        }

        // 3. CP2 ATTACKER FORWARD SPAWN BAY (Stage 2 Unlock, Y = 6.0, 10 Spawns)
        const cp2Y = 6.0;
        this._addSpawnDeck(g, -97.0, -80.5, cp2Y, 44.5, 66.5, 'P7_AtkCP2_Floor', this.mats.spawnDeckAtk);
        this._addSolidShieldWall(g, -97.5, -96.5, cp2Y, bayH, 44.5, 66.5, 'P7_AtkCP2_BackWall', this.mats.blueGlow);
        this._addSolidShieldWall(g, -97.0, -80.5, cp2Y, bayH, 44.0, 45.0, 'P7_AtkCP2_NorthWall');
        this._addSolidShieldWall(g, -97.0, -80.5, cp2Y, bayH, 66.0, 67.0, 'P7_AtkCP2_SouthWall');
        this._addSolidShieldWall(g, -81.0, -80.2, cp2Y, bayH, 49.5, 61.5, 'P7_AtkCP2_FrontBaffle', this.mats.blueGlow);
        const cp2AtkRoof = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.5, 22.8), this.mats.darkWall);
        cp2AtkRoof.position.set(-88.75, cp2Y + bayH + 0.25, 55.5);
        g.add(cp2AtkRoof);
        {const b=new THREE.Box3().setFromObject(cp2AtkRoof);this._registerBoxObstacle(b.min.x,b.max.x,b.min.y,b.max.y,b.min.z,b.max.z,'P7_AtkCP2_Canopy','Phase7');}

        let cp2AtkSlot = 1;
        for (const sx of [-92.0, -86.0]) {
          for (const sz of [49.5, 52.5, 55.5, 58.5, 61.5]) {
            this._registerSpawnPoint('attackerCP2', sx, cp2Y, sz, Math.PI / 2, cp2AtkSlot++);
          }
        }

        // 4. CP2 DEFENDER FORWARD OUTPOST (Stage 0 Active, Y = 6.0, 10 Spawns)
        this._addSpawnDeck(g, -31.5, -15.0, cp2Y, 44.5, 66.5, 'P7_DefFwd_Floor', this.mats.spawnDeckDef);
        this._addSolidShieldWall(g, -15.5, -14.5, cp2Y, bayH, 44.5, 66.5, 'P7_DefFwd_BackWall', this.mats.amberGlow);
        this._addSolidShieldWall(g, -31.5, -15.0, cp2Y, bayH, 44.0, 45.0, 'P7_DefFwd_NorthWall');
        this._addSolidShieldWall(g, -31.5, -15.0, cp2Y, bayH, 66.0, 67.0, 'P7_DefFwd_SouthWall');
        this._addSolidShieldWall(g, -31.8, -31.0, cp2Y, bayH, 49.8, 61.5, 'P7_DefFwd_FrontBaffle', this.mats.amberGlow);
        const defFwdRoof = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.5, 22.8), this.mats.darkWall);
        defFwdRoof.position.set(-23.25, cp2Y + bayH + 0.25, 55.5);
        g.add(defFwdRoof);
        {const b=new THREE.Box3().setFromObject(defFwdRoof);this._registerBoxObstacle(b.min.x,b.max.x,b.min.y,b.max.y,b.min.z,b.max.z,'P7_DefFwd_Canopy','Phase7');}

        let defFwdSlot = 1;
        for (const sx of [-26.0, -20.0]) {
          for (const sz of [49.5, 52.5, 55.5, 58.5, 61.5]) {
            this._registerSpawnPoint('defenderFwd', sx, cp2Y, sz, -Math.PI / 2, defFwdSlot++);
          }
        }

        // 5. DEFENDER BASE BASTION (Behind Delivery Point B, Y = 2.0, 12 Spawns)
        const defY = 2.0;
        const defH = 5.4;
        this._addSpawnDeck(g, 21.0, 67.0, defY, 179.0, 201.0, 'P7_DefBase_Floor', this.mats.spawnDeckDef);
        this._addSolidShieldWall(g, 21.0, 67.0, defY, defH, 200.5, 201.5, 'P7_DefBase_BackWall', this.mats.amberGlow);
        this._addSolidShieldWall(g, 20.5, 21.5, defY, defH, 179.0, 201.0, 'P7_DefBase_WestWall', this.mats.amberGlow);
        this._addSolidShieldWall(g, 66.5, 67.5, defY, defH, 179.0, 201.0, 'P7_DefBase_EastWall', this.mats.amberGlow);
        this._addSolidShieldWall(g, 21.5, 24.5, defY, defH, 179.0, 180.0, 'P7_DefBase_BaffleWL');
        this._addSolidShieldWall(g, 31.0, 40.5, defY, defH, 179.0, 180.0, 'P7_DefBase_BaffleWC', this.mats.amberGlow);
        this._addSolidShieldWall(g, 47.5, 57.0, defY, defH, 179.0, 180.0, 'P7_DefBase_BaffleEC', this.mats.amberGlow);
        this._addSolidShieldWall(g, 63.5, 66.5, defY, defH, 179.0, 180.0, 'P7_DefBase_BaffleER');

        const defRoof = new THREE.Mesh(new THREE.BoxGeometry(47.2, 0.55, 22.8), this.mats.darkWall);
        defRoof.position.set(44.0, defY + defH + 0.28, 190.0);
        g.add(defRoof);
        {const b=new THREE.Box3().setFromObject(defRoof);this._registerBoxObstacle(b.min.x,b.max.x,b.min.y,b.max.y,b.min.z,b.max.z,'P7_DefBase_Canopy','Phase7');}

        const defBaseXs = [28.0, 34.4, 40.8, 47.2, 53.6, 60.0];
        const defBaseZs = [187.0, 194.5];
        let defSlot = 1;
        for (const sz of defBaseZs) {
          for (const sx of defBaseXs) {
            this._registerSpawnPoint('defenderBase', sx, defY, sz, Math.PI, defSlot++);
          }
        }

        // Phase 8: Translucent Team-Only Energy Barrier Curtains at Active Spawn Exits
        const addShieldCurtain = (zoneId, x, y, z, w, h, d, isAtk) => {
          const mat = new THREE.MeshBasicMaterial({
            color: isAtk ? 0x3b82f6 : 0xf59e0b,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            depthWrite: false
          });
          const curtain = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          curtain.position.set(x, y + h * 0.5, z);
          g.add(curtain);
          this.spawnShieldCurtains.push({ zoneId, mesh: curtain });
        };

        addShieldCurtain('attackerBase', -21.5, 0, -173.0, 4.4, 4.4, 0.16, true);
        addShieldCurtain('attackerBase', -14.0, 0, -173.0, 6.2, 4.4, 0.16, true);
        addShieldCurtain('attackerBase', 14.0, 0, -173.0, 6.2, 4.4, 0.16, true);
        addShieldCurtain('attackerBase', 21.5, 0, -173.0, 4.4, 4.4, 0.16, true);
        addShieldCurtain('attackerCP1', 78.6, 4, -64.0, 0.16, 4.2, 4.2, true);
        addShieldCurtain('attackerCP1', 78.6, 4, -47.8, 0.16, 4.2, 4.2, true);
        addShieldCurtain('attackerCP2', -80.6, 6, 47.2, 0.16, 4.2, 4.4, true);
        addShieldCurtain('attackerCP2', -80.6, 6, 63.8, 0.16, 4.2, 4.4, true);
        addShieldCurtain('defenderFwd', -31.4, 6, 47.4, 0.16, 4.2, 4.4, false);
        addShieldCurtain('defenderFwd', -31.4, 6, 63.8, 0.16, 4.2, 4.4, false);
        addShieldCurtain('defenderBase', 27.7, 2, 179.5, 6.2, 4.6, 0.16, false);
        addShieldCurtain('defenderBase', 44.0, 2, 179.5, 6.6, 4.6, 0.16, false);
        addShieldCurtain('defenderBase', 60.2, 2, 179.5, 6.2, 4.6, 0.16, false);
      }

      setMatchStage(stage) {
        this.currentMatchStage = Math.max(0, Math.min(2, stage));
        for (const entry of this.spawnMarkerEntries) {
          const zone = this.spawnZones[entry.zoneId];
          const isActive = zone && zone.activeStages.includes(this.currentMatchStage);
          entry.ringMat.opacity = isActive ? 0.92 : 0.22;
          entry.arrowMat.opacity = isActive ? 0.95 : 0.2;
          entry.group.scale.setScalar(isActive ? 1.0 : 0.72);
        }
        for (const curtain of this.spawnShieldCurtains) {
          const zone = this.spawnZones[curtain.zoneId];
          curtain.mesh.visible = Boolean(zone && zone.activeStages.includes(this.currentMatchStage));
        }
      }

      getActiveSpawnZone(team) {
        const zones = Object.values(this.spawnZones);
        return zones.find((z) => z.team === team && z.activeStages.includes(this.currentMatchStage)) || null;
      }

      isEnemyBlockedByActiveSpawn(x, y, z, playerTeam, radius = 0.45) {
        const enemyTeam = playerTeam === 'attacker' ? 'defender' : 'attacker';
        const enemyZone = this.getActiveSpawnZone(enemyTeam);
        if (!enemyZone || !enemyZone.protectedBounds) return null;
        const b = enemyZone.protectedBounds;
        if (
          x + radius >= b.minX && x - radius <= b.maxX &&
          y + 1.5 >= b.minY && y <= b.maxY &&
          z + radius >= b.minZ && z - radius <= b.maxZ
        ) {
          return `ProtectedSpawn_${enemyZone.id}`;
        }
        return null;
      }

      // =====================================================================
      // COLLISION & WAYPOINT DEBUG VISUALS
      // =====================================================================
      _buildDebugVisuals() {
        const dg = this.groups.debug;
        while (dg.children.length > 0) dg.remove(dg.children[0]);

        const pts = this.routeSpline.getPoints(160).map((p) => new THREE.Vector3(p.x, p.y + 0.35, p.z));
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
        dg.add(new THREE.Line(lineGeo, lineMat));

        const spGeo = new THREE.SphereGeometry(0.65, 10, 10);
        const spMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        this.controlPoints.forEach((p) => {
          const sp = new THREE.Mesh(spGeo, spMat);
          sp.position.set(p.x, p.y + 0.65, p.z);
          dg.add(sp);
        });

        const boxMat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.55 });
        this.obstacleBoxes.forEach((b) => {
          const w = b.maxX - b.minX;
          const h = b.maxY - b.minY;
          const d = b.maxZ - b.minZ;
          const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
          const wire = new THREE.LineSegments(edges, boxMat);
          wire.position.set((b.minX + b.maxX) * 0.5, (b.minY + b.maxY) * 0.5, (b.minZ + b.maxZ) * 0.5);
          dg.add(wire);
        });
      }

      // =====================================================================
      // GROUND HEIGHT QUERY & COLLISION / ENVELOPE TESTS
      // =====================================================================
      getWalkableHeightAt(x, z, refY = null, maxStep = 1.6) {
        let bestY = null;

        for (let i = 0; i < this.walkableTriangles.length; i++) {
          const tri = this.walkableTriangles[i];
          if (x < tri.minX - 0.08 || x > tri.maxX + 0.08 || z < tri.minZ - 0.08 || z > tri.maxZ + 0.08) continue;

          const { a, b, c } = tri;
          const v0x = c.x - a.x, v0z = c.z - a.z;
          const v1x = b.x - a.x, v1z = b.z - a.z;
          const v2x = x - a.x, v2z = z - a.z;

          const dot00 = v0x * v0x + v0z * v0z;
          const dot01 = v0x * v1x + v0z * v1z;
          const dot02 = v0x * v2x + v0z * v2z;
          const dot11 = v1x * v1x + v1z * v1z;
          const dot12 = v1x * v2x + v1z * v2z;

          const denom = dot00 * dot11 - dot01 * dot01;
          if (Math.abs(denom) < 1e-8) continue;
          const inv = 1 / denom;
          const u = (dot11 * dot02 - dot01 * dot12) * inv;
          const v = (dot00 * dot12 - dot01 * dot02) * inv;

          if (u >= -0.00001 && v >= -0.00001 && u + v <= 1.00001) {
            const y = a.y + u * (c.y - a.y) + v * (b.y - a.y);
            if (refY === null) {
              if (bestY === null || y > bestY) bestY = y;
            } else {
              const dy = Math.abs(y - refY);
              if (dy <= maxStep && (bestY===null || y>bestY)) {
                bestY = y;
              }
            }
          }
        }
        return bestY;
      }

      isPointBlocked(x, y, z, radius = 0.45, height = 1.75) {
        const minY = y + 0.25;
        const maxY = y + height;

        for (let i = 0; i < this.obstacleBoxes.length; i++) {
          const b = this.obstacleBoxes[i];
          if (maxY < b.minY || minY > b.maxY) continue;
          if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) {
            return b.label;
          }
        }

        for (let i = 0; i < this.barrierSegments.length; i++) {
          const s = this.barrierSegments[i];
          if (maxY < s.minY || minY > s.maxY) continue;
          const dx = s.x1 - s.x0;
          const dz = s.z1 - s.z0;
          const lenSq = dx * dx + dz * dz;
          if (lenSq < 1e-6) continue;
          const t = Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / lenSq));
          const cx = s.x0 + dx * t;
          const cz = s.z0 + dz * t;
          if (Math.hypot(x - cx, z - cz) < radius + 0.14) {
            return s.label;
          }
        }
        return null;
      }

      checkTransportEnvelopeAt(t) {
        const clampedT = Math.max(0, Math.min(1, t));
        const pos = this.routeSpline.getPoint(clampedT);
        const tan = this.routeSpline.getTangent(clampedT).normalize();
        const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();

        const halfW = 2.1;
        const halfL = 3.2;
        const vehMinY = pos.y + 0.2;
        const vehMaxY = pos.y + 2.8;

        const offsets = [
          [0, 0],
          [-halfW, -halfL], [halfW, -halfL], [-halfW, halfL], [halfW, halfL],
          [-halfW, 0], [halfW, 0], [0, -halfL], [0, halfL]
        ];

        for (const [ox, oz] of offsets) {
          const wx = pos.x + right.x * ox + tan.x * oz;
          const wz = pos.z + right.z * ox + tan.z * oz;

          for (let i = 0; i < this.obstacleBoxes.length; i++) {
            const b = this.obstacleBoxes[i];
            if (vehMaxY < b.minY || vehMinY > b.maxY) continue;
            if (wx >= b.minX && wx <= b.maxX && wz >= b.minZ && wz <= b.maxZ) {
              return { clear: false, hitLabel: b.label };
            }
          }

          for (let i = 0; i < this.barrierSegments.length; i++) {
            const s = this.barrierSegments[i];
            if (vehMaxY < s.minY || vehMinY > s.maxY) continue;
            const dx = s.x1 - s.x0;
            const dz = s.z1 - s.z0;
            const lenSq = dx * dx + dz * dz;
            if (lenSq < 1e-6) continue;
            const proj = Math.max(0, Math.min(1, ((wx - s.x0) * dx + (wz - s.z0) * dz) / lenSq));
            const cx = s.x0 + dx * proj;
            const cz = s.z0 + dz * proj;
            if (Math.hypot(wx - cx, wz - cz) < 0.35) {
              return { clear: false, hitLabel: s.label };
            }
          }
        }
        return { clear: true, hitLabel: null };
      }

      _testBidirectionalPath(x0, z0, x1, z1, startY, endY, steps = 16) {
        const runDir = (ax, az, bx, bz, yInit, yTarget) => {
          let curY = yInit;
          for (let i = 0; i <= steps; i++) {
            const f = i / steps;
            const px = ax + (bx - ax) * f;
            const pz = az + (bz - az) * f;
            const groundY = this.getWalkableHeightAt(px, pz, curY, 1.35);
            if (groundY === null) return { pass: false, detail: `No ground at (${px.toFixed(1)}, ${pz.toFixed(1)})` };
            const hit = this.isPointBlocked(px, groundY, pz, 0.38, 1.7);
            if (hit) return { pass: false, detail: `Blocked by ${hit}` };
            curY = groundY;
          }
          if (Math.abs(curY - yTarget) > 0.35) {
            return { pass: false, detail: `Elevation mismatch: reached ${curY.toFixed(2)}m vs ${yTarget.toFixed(2)}m` };
          }
          return { pass: true, detail: 'OK' };
        };
        const fwd = runDir(x0, z0, x1, z1, startY, endY);
        if (!fwd.pass) return fwd;
        return runDir(x1, z1, x0, z0, endY, startY);
      }

      // =====================================================================
      // 12-CATEGORY ENGINEERING AUDIT (Phases 1–8)
      // =====================================================================
      runEngineeringAudit() {
        const results = [];

        // 1. Surface +Y Winding
        let upwardCount = 0;
        for (const tri of this.walkableTriangles) {
          if (tri.normal.y > 0.25) upwardCount++;
        }
        const windingOk = this.walkableTriangles.length > 0 && upwardCount === this.walkableTriangles.length;
        results.push({
          name: '1. Surface +Y Winding',
          pass: windingOk,
          detail: `${upwardCount}/${this.walkableTriangles.length} tris face +Y`
        });

        // 2. Roadway & Bridge Spec
        let maxBridgeW = 0, maxStdW = 0, apexY = -Infinity;
        for (const s of this.pathSamples) {
          if (s.isBridge) maxBridgeW = Math.max(maxBridgeW, s.width);
          else maxStdW = Math.max(maxStdW, s.width);
          apexY = Math.max(apexY, s.point.y);
        }
        const dimsOk = Math.abs(maxBridgeW - 19.0) < 0.01 && Math.abs(maxStdW - 16.0) < 0.01 && apexY >= 8.7;
        results.push({
          name: '2. Roadway & Bridge Spec',
          pass: dimsOk,
          detail: `Std ${maxStdW}m • Bridge ${maxBridgeW}m • Apex ${apexY.toFixed(2)}m`
        });

        // 3. Junctions & Enclosed-Rect Clipping
        let junctionOk = true;
        for (const pf of this.platforms) {
          if (this.getWalkableHeightAt(pf.cx, pf.cz, pf.cy, 0.5) === null) junctionOk = false;
        }
        const bigPoly = [
          new THREE.Vector3(-10, 0, -10),
          new THREE.Vector3(10, 0, -10),
          new THREE.Vector3(10, 0, 10),
          new THREE.Vector3(-10, 0, 10)
        ];
        const enclosedSplit = this._clipPolygonOutsideRect(bigPoly, { minX: -2, maxX: 2, minZ: -2, maxZ: 2 });
        const clipOk = junctionOk && enclosedSplit.length === 4;
        results.push({
          name: '3. Junctions & Clipping',
          pass: clipOk,
          detail: clipOk ? '4 platforms + enclosed-rect clip (4 bands)' : 'Clipping or junction error'
        });

        // 4. Directional Chevrons & Garage Start
        const startPt = this.routeSpline.getPoint(0);
        const garageStartOk = startPt.z <= -164.0 && this.chevrons.length >= 10;
        results.push({
          name: '4. Chevrons & Garage Start',
          pass: garageStartOk,
          detail: `${this.chevrons.length} chevrons • Start Z=${startPt.z.toFixed(1)}`
        });

        // 5. Full Route Transport Clearance (4.2m x 2.8m x 6.4m)
        let clearanceOk = true;
        let firstHit = '';
        for (let i = 0; i <= 100; i++) {
          const chk = this.checkTransportEnvelopeAt(i / 100);
          if (!chk.clear) {
            clearanceOk = false;
            firstHit = `t=${i}% (${chk.hitLabel})`;
            break;
          }
        }
        results.push({
          name: '5. Transport Clearance',
          pass: clearanceOk,
          detail: clearanceOk ? '4.2×2.8×6.4m clear 0%→100%' : `Hit at ${firstHit}`
        });

        // 6. Phases 2–4 Elevation-Verified Stairs & Catwalks
        const p2W = this._testBidirectionalPath(-16, -138.5, -16, -144.5, 0.0, 4.5, 14);
        const catTests=[this._testBidirectionalPath(-11.2,-153,-7,-153,4.5,6.2,18),this._testBidirectionalPath(-7,-153,7,-153,6.2,6.2,36),this._testBidirectionalPath(7,-153,11.2,-153,6.2,4.5,18)];const p2Cat=catTests.find(t=>!t.pass)||{pass:true};
        const p3StA = this._testBidirectionalPath(36.5, -44.5, 36.5, -50.0, 4.0, 8.5, 14);
        const p4StW = this._testBidirectionalPath(-73.5, 68.2, -73.5, 62.5, 6.0, 10.8, 14);
        const nav24Ok = p2W.pass && p2Cat.pass && p3StA.pass && p4StW.pass;
        results.push({
          name: '6. Phases 2–4 Elev. Nav',
          pass: nav24Ok,
          detail: nav24Ok ? '2-way stairs reach target Y (4.5/8.5/10.8m)' : (p2W.pass ? (p2Cat.pass ? (p3StA.pass ? p4StW.detail : p3StA.detail) : p2Cat.detail) : p2W.detail)
        });

        // 7. Phase 5 Delivery Point B Verification
        const pbW = this._testBidirectionalPath(26.5, 149.5, 26.5, 155.0, 2.0, 6.5, 14);
        const pbE = this._testBidirectionalPath(61.5, 149.5, 61.5, 155.0, 2.0, 6.5, 14);
        const pbObs = this._testBidirectionalPath(31.0, 165.0, 57.0, 165.0, 6.5, 6.5, 16);
        const endPt = this.routeSpline.getPoint(1.0);
        const objAligned = Math.hypot(endPt.x - 44, endPt.z - 155) < 2.0;
        const pbOk = pbW.pass && pbE.pass && pbObs.pass && objAligned;
        results.push({
          name: '7. Phase 5 Delivery Point B',
          pass: pbOk,
          detail: pbOk ? '2-way stairs (2→6.5m) & objective OK' : (!pbW.pass ? pbW.detail : (!pbE.pass ? pbE.detail : (!pbObs.pass ? pbObs.detail : 'Objective misaligned')))
        });

        // 8. Phase 6 Complete Tactical Routes
        const p6Checks = [
          { label: 'Flank6A South', res: this._testBidirectionalPath(22.5, -136.0, 50.5, -108.0, 0.0, 2.2, 20) },
          { label: 'Flank6A North', res: this._testBidirectionalPath(60.0, -95.0, 71.5, -67.0, 2.2, 4.0, 20) },
          { label: 'Overlook6A', res: this._testBidirectionalPath(56.0, -103.5, 56.0, -111.0, 2.2, 6.2, 14) },
          { label: 'UnderBridge E', res: this._testBidirectionalPath(4.0, -4.0, 34.5, -41.0, 1.5, 4.0, 22) },
          { label: 'UnderBridge W', res: this._testBidirectionalPath(-12.0, 12.0, -38.5, 43.0, 1.5, 6.0, 22) },
          { label: 'UnderBridge Spur', res: this._testBidirectionalPath(-10.5, -1.0, -14.5, -3.5, 1.5, 4.2, 14) },
          { label: 'Flank6B North', res: this._testBidirectionalPath(-38.5, 69.0, 5.5, 94.0, 6.0, 4.2, 24) },
          { label: 'Flank6B South', res: this._testBidirectionalPath(17.5, 104.5, 36.0, 135.0, 4.2, 2.0, 22) },
          { label: 'Overlook6B', res: this._testBidirectionalPath(13.0, 99.0, 21.5, 94.5, 4.2, 7.8, 32) },
          { label: 'CP1 Roof Loop', res: this._testBidirectionalPath(41.0, -59.8, 67.0, -59.8, 8.5, 8.5, 16) },
          { label: 'CP2 Roof Loop', res: this._testBidirectionalPath(-69.0, 60.2, -43.0, 60.2, 10.8, 10.8, 16) },
          { label: 'PointB Roof Loop', res: this._testBidirectionalPath(31.0, 158.0, 57.0, 158.0, 6.5, 6.5, 16) }
        ];
        const p6Fail = p6Checks.find((c) => !c.res.pass);
        results.push({
          name: '8. Phase 6 Tactical Routes',
          pass: !p6Fail,
          detail: !p6Fail ? `${p6Checks.length}/12 routes + ${this.instancedCoverCount} instanced covers OK` : `${p6Fail.label}: ${p6Fail.res.detail}`
        });

        // 9. Phase 7 Spawn Ground Safety & Combat Zone Exclusion
        const allSpawns = Object.values(this.spawnZones).flatMap((z) => z.points);
        let safeSpawns = 0;
        let spawnErr = '';
        const objectives = [
          { x: 54, z: -54 },
          { x: -56, z: 56 },
          { x: 44, z: 155 }
        ];
        for (const sp of allSpawns) {
          const gY = this.getWalkableHeightAt(sp.x, sp.z, sp.y, 0.35);
          if (gY === null || Math.abs(gY - sp.y) > 0.15) {
            spawnErr = `${sp.id}: ground Y mismatch`;
            break;
          }
          const hit = this.isPointBlocked(sp.x, sp.y, sp.z, 0.52, 1.85);
          if (hit) {
            spawnErr = `${sp.id}: blocked by ${hit}`;
            break;
          }
          const nearObj = objectives.some((o) => Math.hypot(sp.x - o.x, sp.z - o.z) < 16.0);
          if (nearObj) {
            spawnErr = `${sp.id}: inside enemy combat objective`;
            break;
          }
          safeSpawns++;
        }
        const atkCount = this.spawnZones.attackerBase.points.length;
        const defCount = this.spawnZones.defenderBase.points.length;
        const spawnSafeOk = safeSpawns === allSpawns.length && atkCount >= 10 && defCount >= 10;
        results.push({
          name: '9. Phase 7 Spawn Safety',
          pass: spawnSafeOk,
          detail: spawnSafeOk ? `${safeSpawns}/${allSpawns.length} spawns safe (Atk:${atkCount}+20, Def:${defCount}+10)` : spawnErr
        });

        // 10. Phase 7 Spawn-to-Combat Access Verification
        const spawnAccessChecks = [
          { label: 'AtkBase→WestFlank', res: this._testBidirectionalPath(-21.5, -176.0, -21.5, -145.0, 0.0, 0.0, 16) },
          { label: 'AtkBase→Flank6A', res: this._testBidirectionalPath(21.5, -176.0, 22.5, -136.0, 0.0, 0.0, 18) },
          { label: 'AtkBase→PointA W', res: this._testBidirectionalPath(-14.0, -176.0, -14.0, -163.0, 0.0, 0.0, 10) },
          { label: 'AtkBase→PointA E', res: this._testBidirectionalPath(14.0, -176.0, 14.0, -163.0, 0.0, 0.0, 10) },
          { label: 'AtkCP1→CP1 N', res: this._testBidirectionalPath(84.5, -64.0, 72.0, -64.0, 4.0, 4.0, 10) },
          { label: 'AtkCP1→CP1 S', res: this._testBidirectionalPath(84.5, -47.5, 76.5, -47.5, 4.0, 4.0, 10) },
          { label: 'AtkCP2→CP2 N', res: this._testBidirectionalPath(-86.0, 47.0, -78.5, 47.0, 6.0, 6.0, 10) },
          { label: 'AtkCP2→CP2 S', res: this._testBidirectionalPath(-86.0, 64.0, -78.5, 64.0, 6.0, 6.0, 10) },
          { label: 'DefFwd→CP2 N', res: this._testBidirectionalPath(-26.0, 47.0, -33.5, 47.0, 6.0, 6.0, 10) },
          { label: 'DefFwd→CP2 S', res: this._testBidirectionalPath(-26.0, 64.0, -33.5, 64.0, 6.0, 6.0, 10) },
          { label: 'DefBase→PointB W', res: this._testBidirectionalPath(27.5, 185.0, 27.5, 170.0, 2.0, 2.0, 12) },
          { label: 'DefBase→PointB C', res: this._testBidirectionalPath(44.0, 185.0, 44.0, 176.5, 2.0, 2.0, 10) },
          { label: 'DefBase→PointB E', res: this._testBidirectionalPath(60.5, 185.0, 60.5, 170.0, 2.0, 2.0, 12) }
        ];
        const spawnAccessFail = spawnAccessChecks.find((c) => !c.res.pass);
        results.push({
          name: '10. Spawn→Combat Access',
          pass: !spawnAccessFail,
          detail: !spawnAccessFail ? `${spawnAccessChecks.length}/${spawnAccessChecks.length} spawn exits verified` : `${spawnAccessFail.label}: ${spawnAccessFail.res.detail}`
        });

        // 11. Phase 8 Overhead Structure & Vehicle Envelope Clearance
        const overheadLabels = [
          'PointA_GarageRoofOverhead',
          'PointA_CatwalkOverhead',
          'CP1_SkywalkOverhead',
          'CP1_BridgeGateHeaderOverhead',
          'CP2_CatwalkOverhead',
          'PointB_BayHeaderOverhead'
        ];
        const registeredOverheads = overheadLabels.filter((lbl) => this.obstacleBoxes.some((b) => b.label === lbl));
        let overheadMinGap = Infinity;
        for (let i = 0; i <= 100; i++) {
          const pos = this.routeSpline.getPoint(i / 100);
          const vehTop = pos.y + 2.8;
          for (const b of this.obstacleBoxes) {
            if (!b.label.endsWith('Overhead')) continue;
            if (pos.x + 2.1 >= b.minX && pos.x - 2.1 <= b.maxX && pos.z + 3.2 >= b.minZ && pos.z - 3.2 <= b.maxZ) {
              overheadMinGap = Math.min(overheadMinGap, b.minY - vehTop);
            }
          }
        }
        const overheadOk = registeredOverheads.length === overheadLabels.length && overheadMinGap > 0.5 && clearanceOk;
        results.push({
          name: '11. P8 Overhead Clearance',
          pass: overheadOk,
          detail: overheadOk
            ? `${registeredOverheads.length}/6 overheads registered • Min gap +${overheadMinGap.toFixed(2)}m`
            : `Overhead collision or missing registration (${registeredOverheads.length}/6)`
        });

        // 12. Phase 8 Escort Spawn Protection & Checkpoint Gating
        const prevStage = this.currentMatchStage;
        this.setMatchStage(0);
        const atkBlockedInDefFwd = this.isEnemyBlockedByActiveSpawn(-23.0, 6.0, 55.0, 'attacker') !== null;
        const defBlockedInAtkBase = this.isEnemyBlockedByActiveSpawn(0.0, 0.0, -184.0, 'defender') !== null;
        const atkAllowedInOwnBase = this.isEnemyBlockedByActiveSpawn(0.0, 0.0, -184.0, 'attacker') === null;
        const stage0AtkZone = this.getActiveSpawnZone('attacker')?.id === 'attackerBase';
        this.setMatchStage(1);
        const stage1AtkZone = this.getActiveSpawnZone('attacker')?.id === 'attackerCP1';
        this.setMatchStage(2);
        const stage2AtkZone = this.getActiveSpawnZone('attacker')?.id === 'attackerCP2';
        this.setMatchStage(prevStage);

        const p8SpawnOk = atkBlockedInDefFwd && defBlockedInAtkBase && atkAllowedInOwnBase && stage0AtkZone && stage1AtkZone && stage2AtkZone;
        results.push({
          name: '12. P8 Spawn Protection',
          pass: p8SpawnOk,
          detail: p8SpawnOk ? 'Enemy spawn barrier + CP-gated unlocks OK' : 'Spawn protection or gating failed'
        });

        return results;
      }

      exportMapData() {
        return {
          game: 'Duelist Adventure',
          phase: 9,
          environment: { type: "MountainCanyon", visualOnly: true, river: true, waterfalls: 2 },
          transportEnvelope: { width: 4.2, height: 2.8, length: 6.4, escortRadius: 9.0 },
          platforms: this.platforms,
          splineControlPoints: this.controlPoints.map((p) => ({ x: p.x, y: p.y, z: p.z })),
          spawnZones: Object.fromEntries(
            Object.entries(this.spawnZones).map(([k, z]) => [
              k,
              { team: z.team, name: z.name, activeStages: z.activeStages, count: z.points.length, points: z.points }
            ])
          ),
          stats: {
            walkableTriangles: this.walkableTriangles.length,
            obstacleBoxes: this.obstacleBoxes.length,
            barrierSegments: this.barrierSegments.length,
            instancedCoverCount: this.instancedCoverCount
          },
          audit: this.runEngineeringAudit()
        };
      }
    }

    /**
     * Full-Screen Interactive 3D Viewer & Phase 8 Escort Application
     * Supports native WebGPU (when available) with WebGL2 backend fallback only.
     */
    /** Phase 9: deterministic, non-playable scenery. All gameplay geometry remains in the original map. */
    class MountainCanyonEnvironment {
      constructor(scene, map) {
        this.scene = scene;
        this.map = map;
        this.group = new THREE.Group();
        this.group.name = 'Phase9_MountainCanyonEnvironment';
        scene.add(this.group);
        this.waterTextures = [];
        this.detailMeshes = [];
        this.elapsed = 0;
        this.mobile = false;
        this.falls = [{ side: -1, z: -88, width: 12 }, { side: 1, z: 94, width: 15 }];
        this.sunDir = new THREE.Vector3(-0.52, 0.65, -0.55).normalize();
        this._buildSky();
        this._buildTerrain();
        this._buildRiver();
        this._buildWaterfalls();
        this._extendBridgePiers();
      }

      _smooth(a, b, v) {
        const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
        return t * t * (3 - 2 * t);
      }
      _noise(x, z) {
        return Math.sin(x * 0.043 + z * 0.019) * 0.48 + Math.sin(x * 0.021 - z * 0.058 + 1.7) * 0.31 + Math.sin(x * 0.105 + z * 0.071 - 0.6) * 0.21;
      }
      _riverX(z) { return -4 + 12 * Math.sin((z - 4) * 0.018) + 6 * Math.sin((z - 4) * 0.047); }
      _riverHalf(z) { return 9.5 + 2.1 * Math.sin(z * 0.023 + 0.8); }
      _height(x, z) {
        // Keep the existing datum elevation in the play zone, except for the non-playable river bed.
        const az = Math.abs(z);
        const ax = Math.abs(x);
        const nearEdge = Math.max(ax - 112, az - 228);
        const rise = this._smooth(0, 82, nearEdge);
        const farRise = this._smooth(65, 320, nearEdge);
        const ridges = 0.5 + 0.5 * Math.sin(z * 0.014 + x * 0.010 + 1.2);
        const rugged = this._noise(x, z);
        let y = -4.5 + rise * (65 + 63 * ridges + 34 * rugged) + farRise * (90 + 67 * this._noise(x * 0.64 + 30, z * 0.64));
        // Two mountain streams descend toward the valley and feed the main river.
        for (const f of this.falls) {
          const sx = f.side * x;
          if (sx < f.side * this._riverX(f.z) - 2 || sx > 190) continue;
          const dist = Math.abs(z - f.z);
          const influence = 1 - this._smooth(f.width * 0.6, f.width * 1.5, dist);
          const channel = -9.2 + 76 * this._smooth(112, 170, sx);
          y = y * (1 - influence) + Math.min(y, channel) * influence;
        }
        const dist = Math.abs(x - this._riverX(z));
        const riverCarve = (1 - this._smooth(this._riverHalf(z) + 1, this._riverHalf(z) + 10, dist));
        const openEnds = 1 - this._smooth(265, 355, az);
        y = y * (1 - riverCarve * openEnds) + (-10.2) * riverCarve * openEnds;
        return y;
      }
      _terrainColor(x, y, z, out) {
        const n = this._noise(x, z);
        const rock = new THREE.Color(0x67737a);
        const grass = new THREE.Color(0x46634d);
        const soil = new THREE.Color(0x8b8171);
        const snow = new THREE.Color(0xe2e8ea);
        out.copy(soil).lerp(grass, this._smooth(-3, 28, y) * (0.7 + 0.23 * n));
        out.lerp(rock, this._smooth(42, 95, y + n * 30));
        out.lerp(snow, this._smooth(168, 225, y + n * 22));
        if (y < -6) out.lerp(new THREE.Color(0x526c70), 0.65);
        out.multiplyScalar(0.93 + n * 0.10);
      }
      _buildTerrain() {
        // Nonuniform grid: high detail in the canyon, broad coarse triangles on distant peaks.
        const axis = (inner, outer, step, farStep) => {
          const a = [];
          for (let v = -outer; v < -inner; v += farStep) a.push(v);
          for (let v = -inner; v <= inner; v += step) a.push(v);
          for (let v = inner + farStep; v < outer; v += farStep) a.push(v);
          a.push(outer);
          return a;
        };
        const xs = axis(180, 640, 5, 24), zs = axis(260, 720, 5, 24);
        const positions = [], colors = [], indices = [];
        const color = new THREE.Color();
        for (const z of zs) for (const x of xs) {
          const y = this._height(x, z);
          positions.push(x, y, z);
          this._terrainColor(x, y, z, color);
          colors.push(color.r, color.g, color.b);
        }
        for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
          const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1;
          if ((i + j) % 2) indices.push(a, c, d, a, d, b);
          else indices.push(a, c, b, b, c, d);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.99, metalness: 0, flatShading: true }));
        mesh.name = 'Canyon terrain and snowy mountain ridges';
        this.group.add(mesh);
      }
      _texture(w, h, paint) {
        const c = globalThis.document.createElement('canvas'); c.width = w; c.height = h;
        paint(c.getContext('2d'), w, h);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }
      _buildSky() {
        const tex = this._texture(1024, 512, (ctx, w, h) => {
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, '#3477b0'); g.addColorStop(0.34, '#76acd6'); g.addColorStop(0.50, '#c3dce8'); g.addColorStop(0.65, '#b8c9c9'); g.addColorStop(1, '#81949b');
          ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
          // Soft, deterministic cloud clusters, not geometry or particle systems.
          for (let k = 0; k < 12; k++) {
            const cx = (k * 179 + 95) % w, cy = 72 + (k * 37 % 111);
            for (let j = 0; j < 8; j++) {
              const x = cx + Math.sin(k * 3 + j * 2.1) * 42, y = cy + Math.cos(j * 2.4 + k) * 8;
              const rx = 26 + (j % 4) * 9, ry = 8 + (j % 3) * 3;
              ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
              const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
              cg.addColorStop(0, 'rgba(255,255,255,0.36)'); cg.addColorStop(0.5, 'rgba(250,253,255,0.20)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
              ctx.fillStyle = cg; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
            }
          }
        });
        const sky = new THREE.Mesh(new THREE.SphereGeometry(1450, 48, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
        sky.name = 'Daytime sky dome'; sky.renderOrder = -1000; this.group.add(sky);
        const haloTex = this._texture(128, 128, (ctx,w,h) => {
          const g = ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
          g.addColorStop(0,'rgba(255,246,207,1)'); g.addColorStop(0.19,'rgba(255,238,175,0.9)'); g.addColorStop(0.22,'rgba(255,221,148,0.38)'); g.addColorStop(0.55,'rgba(255,224,163,0.12)'); g.addColorStop(1,'rgba(255,230,180,0)');
          ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
        });
        const sun = new THREE.Mesh(new THREE.PlaneGeometry(122,122), new THREE.MeshBasicMaterial({map:haloTex,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,toneMapped:false}));
        sun.name = 'Sun and soft halo'; sun.position.copy(this.sunDir).multiplyScalar(1250); sun.lookAt(0,0,0); this.group.add(sun);
      }
      _flowMaterial(falling = false) {
        const tex = this._texture(128, 256, (ctx,w,h) => {
          ctx.fillStyle = falling ? '#9ccfdf' : '#3b8396'; ctx.fillRect(0,0,w,h);
          for (let i=0;i<150;i++) {
            const x=(i*47.19)%w, y=(i*83.67)%h;
            ctx.strokeStyle = falling ? `rgba(235,250,255,${0.12+(i%5)*0.08})` : `rgba(196,231,232,${0.07+(i%5)*0.04})`;
            ctx.lineWidth = falling ? 1+(i%3) : 0.7+(i%3)*0.45;
            ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.sin(i*2.3)*(falling?1:7), y+(falling?34:18)+(i%4)*9); ctx.stroke();
          }
        });
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(falling?1.5:2.0, falling?3.5:1.0);
        this.waterTextures.push({tex, speed: falling?0.68:0.13});
        return new THREE.MeshStandardMaterial({map:tex,color:falling?0xc8f0f5:0x8ac9ce,roughness:falling?0.43:0.29,metalness:falling?0.03:0.17,emissive:falling?0x315b67:0x16383d,emissiveIntensity:0.28,side:THREE.DoubleSide});
      }
      _ribbon(rows, mat, name) {
        const pos=[],uv=[],idx=[];
        for (let i=0;i<rows.length;i++) {
          const r=rows[i];
          pos.push(...r.a,...r.b); uv.push(0,r.v,1,r.v);
          if(i>0){const k=(i-1)*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}
        }
        const geo=new THREE.BufferGeometry();
        geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
        geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
        const mesh=new THREE.Mesh(geo,mat);mesh.name=name;this.group.add(mesh);return mesh;
      }
      _buildRiver() {
        this.riverMaterial=this._flowMaterial(false);
        const rows=[];
        for(let z=-300;z<=300;z+=4){const x=this._riverX(z),h=this._riverHalf(z);rows.push({a:[x-h,-6.7,z],b:[x+h,-6.7,z],v:(z+300)/28});}
        this._ribbon(rows,this.riverMaterial,'Winding river under the bridge');
        // Additional thin animated surface ribbons suggest sun glints without reflections or render targets.
        const glintTex=this._texture(128,128,(ctx,w,h)=>{
          ctx.clearRect(0,0,w,h);
          for(let i=0;i<30;i++){const x=(i*43)%w,y=(i*61)%h;const g=ctx.createLinearGradient(x,y,x+13,y);g.addColorStop(0,'rgba(220,245,255,0)');g.addColorStop(.5,'rgba(255,248,215,0.55)');g.addColorStop(1,'rgba(220,245,255,0)');ctx.fillStyle=g;ctx.fillRect(x,y,13,1.5);}
        });
        glintTex.wrapS=glintTex.wrapT=THREE.RepeatWrapping; this.waterTextures.push({tex:glintTex,speed:0.09});
        const glints=rows.map(r=>({a:[r.a[0]+1,-6.67,r.a[2]],b:[r.b[0]-1,-6.67,r.b[2]],v:r.v*1.7}));
        this.detailMeshes.push(this._ribbon(glints,new THREE.MeshBasicMaterial({map:glintTex,transparent:true,opacity:0.7,depthWrite:false,side:THREE.DoubleSide}),'River sunlight glints'));
      }
      _buildWaterfalls() {
        const fallMat=this._flowMaterial(true);
        for(const f of this.falls){
          const rows=[];
          // Cascade follows the carved cliff ravine; waterfall remains well outside player geometry.
          for(let s=172;s>=108;s-=2){const x=f.side*s;const y=Math.max(-6.62,this._height(x,f.z)+0.85);const w=f.width*0.43;rows.push({a:[x,y,f.z-w],b:[x,y,f.z+w],v:(172-s)/23});}
          this._ribbon(rows,fallMat,`Mountain waterfall ${f.side<0?'west':'east'}`);
          const trib=[];const rx=this._riverX(f.z);
          for(let i=0;i<=36;i++){const x=f.side*108+(rx-f.side*108)*i/36;const w=f.width*0.32;trib.push({a:[x,-6.69,f.z-w],b:[x,-6.69,f.z+w],v:i/4});}
          this._ribbon(trib,this.riverMaterial,'Waterfall tributary');
          const foamTex=this._texture(128,128,(ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(225,248,250,0.82)');g.addColorStop(.45,'rgba(206,239,240,0.35)');g.addColorStop(1,'rgba(206,239,240,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
          const foam=new THREE.Mesh(new THREE.PlaneGeometry(f.width*1.4,f.width*1.1),new THREE.MeshBasicMaterial({map:foamTex,transparent:true,depthWrite:false,opacity:.68,side:THREE.DoubleSide}));
          foam.rotation.x=-Math.PI/2;foam.position.set(f.side*109,-6.64,f.z);this.group.add(foam);this.detailMeshes.push(foam);
        }
      }
      _extendBridgePiers() {
        // Scenery-only extensions beneath original bridge piers wherever the river bed was carved lower.
        const mat=new THREE.MeshStandardMaterial({color:0x4b555a,roughness:.88});
        for(let i=0;i<this.map.pathSamples.length-1;i+=30){const s=this.map.pathSamples[i],next=this.map.pathSamples[i+1];if(!s.isBridge&&!next.isBridge)continue;
          for(const lat of [-s.width*.5+2.2,s.width*.5-2.2]){const p=s.point.clone().addScaledVector(s.right,lat);const y=this._height(p.x,p.z);const top=-4.75;if(y>=top)continue;const h=top-y+.35;const pier=new THREE.Mesh(new THREE.BoxGeometry(1.6,h,1.6),mat);pier.position.set(p.x,top-h/2+.15,p.z);this.group.add(pier);}
        }
      }
      setVisible(visible){this.group.visible=visible;if(this.map.originalDatumGround)this.map.originalDatumGround.visible=!visible;}
      setQuality(level){this.mobile=level==='mobile';for(const m of this.detailMeshes)m.visible=!this.mobile;}
      update(dt){this.elapsed+=dt;if(!this.group.visible)return;if(this.mobile&&this.elapsed<1/30)return;const delta=this.elapsed;this.elapsed=0;for(const item of this.waterTextures)item.tex.offset.y=(item.tex.offset.y-delta*item.speed)%1;}
    }


export function createEscortArena(scene){const root=new THREE.Group();scene.add(root);const map=new EscortMapPhase8(root);const environment=new MountainCanyonEnvironment(root,map);environment.setVisible(true);map.groups.spawnMarkers.visible=false;return {root,map,environment,dispose(){root.removeFromParent();const gs=new Set(),ms=new Set(),ts=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}};}
export {EscortMapPhase8,MountainCanyonEnvironment};
class VehicleBuilder {
      _buildTransportMesh() {
        // Phase 8: Futuristic Armored Hover Transport (strictly 4.2m W x 2.8m H x 6.4m L)
        this.transportGroup = new THREE.Group();
        this.transportVisual = new THREE.Group();
        this.transportGroup.add(this.transportVisual);

        const armorDark = new THREE.MeshStandardMaterial({ color: 0x162030, roughness: 0.38, metalness: 0.74 });
        const armorPlate = new THREE.MeshStandardMaterial({ color: 0x263449, roughness: 0.44, metalness: 0.65 });
        const cockpitGlass = new THREE.MeshStandardMaterial({ color: 0x0b1726, roughness: 0.14, metalness: 0.92 });
        this.transportEnergyMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0ea5e9,
          emissiveIntensity: 1.8,
          roughness: 0.2,
          metalness: 0.25
        });
        this.transportThrusterMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.82
        });

        const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.72, 5.7), armorDark);
        chassis.position.set(0, 0.72, 0);
        chassis.castShadow = true;
        this.transportVisual.add(chassis);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(3.96, 1.02, 5.9), armorPlate);
        hull.position.set(0, 1.54, -0.05);
        hull.castShadow = true;
        hull.receiveShadow = true;
        this.transportVisual.add(hull);

        const prow = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 0.7), armorDark);
        prow.position.set(0, 1.18, 2.82);
        prow.rotation.x = 0.28;
        this.transportVisual.add(prow);

        [-1.98, 1.98].forEach((sx) => {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.92, 4.9), armorDark);
          panel.position.set(sx, 1.38, -0.05);
          this.transportVisual.add(panel);

          const energyStrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 4.4), this.transportEnergyMat);
          energyStrip.position.set(sx + (sx > 0 ? 0.08 : -0.08), 1.52, -0.05);
          this.transportVisual.add(energyStrip);
        });

        const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.68, 3.2), armorDark);
        canopy.position.set(0, 2.38, 0.25);
        canopy.castShadow = true;
        this.transportVisual.add(canopy);

        const visor = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.34, 0.3), cockpitGlass);
        visor.position.set(0, 2.4, 1.82);
        visor.rotation.x = -0.35;
        this.transportVisual.add(visor);

        const visorGlow = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.14), this.transportEnergyMat);
        visorGlow.position.set(0, 2.24, 1.92);
        this.transportVisual.add(visorGlow);

        const dorsalCore = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 2.1), this.transportEnergyMat);
        dorsalCore.position.set(0, 2.12, -1.95);
        this.transportVisual.add(dorsalCore);

        this.hoverThrusters = [];
        const padCoords = [
          [-1.55, 2.1], [1.55, 2.1],
          [-1.55, -2.15], [1.55, -2.15]
        ];
        padCoords.forEach(([px, pz]) => {
          const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.62, 0.24, 14), armorDark);
          pod.position.set(px, 0.36, pz);
          this.transportVisual.add(pod);

          const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.52, 16), this.transportThrusterMat);
          glowRing.rotation.x = Math.PI / 2;
          glowRing.position.set(px, 0.22, pz);
          this.transportVisual.add(glowRing);
          this.hoverThrusters.push(glowRing);
        });

        this.rearFlames = [];
        [-1.05, 1.05].forEach((rx) => {
          const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.4, 14), armorDark);
          nozzle.rotation.x = Math.PI / 2;
          nozzle.position.set(rx, 1.35, -3.02);
          this.transportVisual.add(nozzle);

          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.95, 12), this.transportThrusterMat);
          flame.rotation.x = -Math.PI / 2;
          flame.position.set(rx, 1.35, -3.55);
          this.transportVisual.add(flame);
          this.rearFlames.push(flame);
        });

        this.escortRingMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide
        });
        this.escortRadiusRing = new THREE.Mesh(new THREE.RingGeometry(8.65, 9.0, 48), this.escortRingMat);
        this.escortRadiusRing.rotation.x = -Math.PI / 2;
        this.escortRadiusRing.position.y = 0.1;
        this.transportGroup.add(this.escortRadiusRing);

        const envEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(4.2, 2.8, 6.4));
        this.transportEnvelopeWire = new THREE.LineSegments(
          envEdges,
          new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 })
        );
        this.transportEnvelopeWire.position.y = 1.4;
        this.transportGroup.add(this.transportEnvelopeWire);

        this.scene.add(this.transportGroup);
      }


}
export function buildEscortVehicle(scene){const v=new VehicleBuilder();v.scene=scene;v._buildTransportMesh();v.transportEnvelopeWire.visible=false;return v;}

// Mount into the game's existing renderer; never create another canvas or simulation.
export function applyEscortDaylight({scene,camera,renderer,lights,environment}){
 const saved={background:scene.background,fog:scene.fog,far:camera.far,exposure:renderer.toneMappingExposure,hemiColor:lights.hemi.color.clone(),ground:lights.hemi.groundColor.clone(),hemiIntensity:lights.hemi.intensity,sunColor:lights.sun.color.clone(),sunIntensity:lights.sun.intensity,sunPos:lights.sun.position.clone(),sunShadow:lights.sun.castShadow,rim:lights.rimLight.intensity,fills:lights.fills.map(l=>l.intensity)};
 scene.background=new THREE.Color(0x86b7d7);scene.fog=new THREE.Fog(0xb6cfdd,420,1600);camera.far=2400;camera.updateProjectionMatrix();
 lights.hemi.color.setHex(0xd4e9ff);lights.hemi.groundColor.setHex(0xb6c6bb);lights.hemi.intensity=1.95;
 lights.sun.color.setHex(0xffe5bc);lights.sun.intensity=2.35;lights.sun.position.set(-140,175,-148);lights.sun.castShadow=false;
 lights.rimLight.intensity=.25;lights.fills.forEach(l=>l.intensity=.18);renderer.toneMappingExposure=1.15;
 environment.setQuality(globalThis.window?.matchMedia?.('(pointer: coarse)').matches?'mobile':'high');
 return {update(dt){environment.update(dt);},dispose(){scene.background=saved.background;scene.fog=saved.fog;camera.far=saved.far;camera.updateProjectionMatrix();renderer.toneMappingExposure=saved.exposure;lights.hemi.color.copy(saved.hemiColor);lights.hemi.groundColor.copy(saved.ground);lights.hemi.intensity=saved.hemiIntensity;lights.sun.color.copy(saved.sunColor);lights.sun.intensity=saved.sunIntensity;lights.sun.position.copy(saved.sunPos);lights.sun.castShadow=saved.sunShadow;lights.rimLight.intensity=saved.rim;lights.fills.forEach((l,i)=>l.intensity=saved.fills[i]);}};
}
