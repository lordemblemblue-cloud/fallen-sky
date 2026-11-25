// Direct extraction of supplied map; no geometry redesign.
export const ARENA_SPEC = {
      mapId: 'duelist_control_point_arena_v1',
      boundarySize: 300,
      fallRespawnY: -18.0,
      gridDivisions: 10,
      cellSize: 30,
      slabThickness: 2.0,
      railingHeight: 1.2,
      pathwayWidth: 14.0,
      horizontalLength: 210.0,
      horizontalZ: 90.0,
      landingSize: 36.0,
      landingX: 105.0,
      centerHubSize: 30.0,
      alphaApexZ: -105.0,
      crossbarHalfSpan: 52.5,
      buildingWidth: 10.0,
      buildingDepth: 12.0,
      rooftopY: 4.0,
      upperLandingY: 8.0,
      wallThickness: 0.3,
      doorWidth: 3.0,
      doorHeight: 3.0,
      stairWidth: 4.0,
      stepHeight: 0.2,
      stepDepth: 0.35,
      risersPerFlight: 20,
      l2HubWidth: 60.0,
      l2HubDepth: 40.0,
      l2HubChamfer: 5.0,
      l2SlabThickness: 0.8,
      l2BridgeWidth: 8.0,
      alphaSize: 40.0,
      alphaChamfer: 8.0,
      alphaCaptureRadius: 6.0,
      alphaBridgeStartZ: -20.0,
      alphaBridgeEndZ: -85.0,
      alphaBridgeWidth: 14.0,
      elevations: {
        level1DeckY: 0.0,
        rooftopAndMidLandingY: 4.0,
        level2DeckAndAlphaY: 8.0
      },
      captureRules: {
        neutralCaptureSeconds: 8.0,
        decapSeconds: 6.0,
        contestedPausesProgress: true,
        verticalToleranceMeters: 3.5
      }
    };

    /**
     * Unified 2D point-in-polygon test in XZ space.
     * Supports BOTH THREE.Vector2 points ({ x, y }) AND exported world-space points ({ x, z }).
     */
export function isPointInPolygonXZ(px, pz, poly2D) {
      if (!poly2D || poly2D.length < 3) return false;
      let inside = false;
      for (let i = 0, j = poly2D.length - 1; i < poly2D.length; j = i++) {
        const pi = poly2D[i];
        const pj = poly2D[j];
        const xi = pi.x;
        const zi = pi.z !== undefined ? pi.z : pi.y;
        const xj = pj.x;
        const zj = pj.z !== undefined ? pj.z : pj.y;
        const intersect =
          (zi > pz) !== (zj > pz) &&
          px < ((xj - xi) * (pz - zi)) / (zj - zi || 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }

export function createDuelistControlPointArena(THREE_LIB, customOptions = {}) {
      const SPEC = {
        ...ARENA_SPEC,
        ...customOptions,
        captureRules: { ...ARENA_SPEC.captureRules, ...(customOptions.captureRules || {}) }
      };

      const root = new THREE_LIB.Group();
      root.name = 'Duelist_Control_Point_Arena';

      // Spatial partitioning chunks for frustum culling distant arena sectors
      const spatialChunks = {
        Sector_SouthWest_Bravo: new THREE_LIB.Group(),
        Sector_SouthEast_Charlie: new THREE_LIB.Group(),
        Sector_Central_Hub: new THREE_LIB.Group(),
        Sector_North_Alpha: new THREE_LIB.Group()
      };
      Object.entries(spatialChunks).forEach(([name, grp]) => {
        grp.name = name;
        root.add(grp);
      });

      function assignToSpatialChunk(group, cx, cz) {
        if (cz < -42) spatialChunks.Sector_North_Alpha.add(group);
        else if (cx < -35 && cz >= 35) spatialChunks.Sector_SouthWest_Bravo.add(group);
        else if (cx > 35 && cz >= 35) spatialChunks.Sector_SouthEast_Charlie.add(group);
        else spatialChunks.Sector_Central_Hub.add(group);
      }

      // 1. Procedural Textures (128x128 & 256x256)
      const createdTextures = [];
      function createHexDeckTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#182232';
        ctx.fillRect(0, 0, size, size);
        const r = 24;
        const dx = r * 1.5;
        const dy = r * Math.sqrt(3);
        ctx.lineWidth = 2;
        for (let gx = -dx; gx < size + dx * 2; gx += dx) {
          const col = Math.round(gx / dx);
          const offsetY = (col % 2) * (dy * 0.5);
          for (let gy = -dy; gy < size + dy * 2; gy += dy) {
            const cx = gx;
            const cy = gy + offsetY;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const ang = (Math.PI / 3) * i;
              const px = cx + r * 0.9 * Math.cos(ang);
              const py = cy + r * 0.9 * Math.sin(ang);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = (col + Math.round(gy / dy)) % 2 === 0 ? '#1c2739' : '#151e2c';
            ctx.fill();
            ctx.strokeStyle = '#0d131d';
            ctx.stroke();
          }
        }
        const tex = new THREE_LIB.CanvasTexture(canvas);
        tex.wrapS = THREE_LIB.RepeatWrapping;
        tex.wrapT = THREE_LIB.RepeatWrapping;
        tex.repeat.set(0.25, 0.25);
        tex.colorSpace = THREE_LIB.SRGBColorSpace;
        createdTextures.push(tex);
        return tex;
      }

      function createCircuitTrimTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0f1520';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 48); ctx.lineTo(76, 48); ctx.lineTo(104, 88);
        ctx.lineTo(176, 88); ctx.lineTo(204, 48); ctx.lineTo(256, 48);
        ctx.moveTo(0, 208); ctx.lineTo(64, 208); ctx.lineTo(92, 168);
        ctx.lineTo(188, 168); ctx.lineTo(216, 208); ctx.lineTo(256, 208);
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(122, 82, 12, 12);
        ctx.fillRect(122, 162, 12, 12);
        const tex = new THREE_LIB.CanvasTexture(canvas);
        tex.wrapS = THREE_LIB.RepeatWrapping;
        tex.wrapT = THREE_LIB.RepeatWrapping;
        tex.repeat.set(0.25, 0.25);
        tex.colorSpace = THREE_LIB.SRGBColorSpace;
        createdTextures.push(tex);
        return tex;
      }

      function createCargoPanelTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, size - 12, size - 12);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(16, 16); ctx.lineTo(size - 16, size - 16);
        ctx.moveTo(size - 16, 16); ctx.lineTo(16, size - 16);
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(14, 14, 18, 5);
        ctx.fillRect(size - 32, size - 19, 18, 5);
        const tex = new THREE_LIB.CanvasTexture(canvas);
        tex.colorSpace = THREE_LIB.SRGBColorSpace;
        createdTextures.push(tex);
        return tex;
      }

      function createVentLouverTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1b2432';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#0b1018';
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, size - 8, size - 8);
        for (let y = 18; y < size - 16; y += 12) {
          ctx.fillStyle = '#090d14';
          ctx.fillRect(14, y, size - 28, 6);
          ctx.fillStyle = '#475569';
          ctx.fillRect(14, y + 6, size - 28, 2);
        }
        const tex = new THREE_LIB.CanvasTexture(canvas);
        tex.colorSpace = THREE_LIB.SRGBColorSpace;
        createdTextures.push(tex);
        return tex;
      }

      function createTacticalSignageAtlas() {
        const width = 256;
        const height = 256;
        const cellW = width / 4;
        const cellH = height / 2;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);

        const glyphs = [
          { col: 0, row: 0, label: 'ALPHA', badge: 'A', color: '#10b981' },
          { col: 1, row: 0, label: 'BRAVO', badge: 'B', color: '#f59e0b' },
          { col: 2, row: 0, label: 'CHARLIE', badge: 'C', color: '#f59e0b' },
          { col: 3, row: 0, label: 'LEVEL 2', badge: 'L2', color: '#38bdf8' },
          { col: 0, row: 1, label: 'STAIRS', badge: 'UP', color: '#fbbf24' },
          { col: 1, row: 1, label: 'RED', badge: 'R', color: '#ef4444' },
          { col: 2, row: 1, label: 'BLUE', badge: 'B', color: '#3b82f6' },
          { col: 3, row: 1, label: 'ROUTE', badge: '>>', color: '#94a3b8' }
        ];

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        glyphs.forEach((g) => {
          const ox = g.col * cellW;
          const oy = g.row * cellH;
          const cx = ox + cellW * 0.5;

          ctx.fillStyle = 'rgba(10, 15, 24, 0.88)';
          ctx.fillRect(ox + 3, oy + 4, cellW - 6, cellH - 8);
          ctx.strokeStyle = g.color;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(ox + 5, oy + 6, cellW - 10, cellH - 12);

          ctx.fillStyle = g.color;
          ctx.beginPath();
          ctx.moveTo(cx, oy + 16);
          ctx.lineTo(cx + 16, oy + 38);
          ctx.lineTo(cx + 8, oy + 38);
          ctx.lineTo(cx, oy + 27);
          ctx.lineTo(cx - 8, oy + 38);
          ctx.lineTo(cx - 16, oy + 38);
          ctx.closePath();
          ctx.fill();

          ctx.font = 'bold 24px monospace';
          ctx.fillText(g.badge, cx, oy + 72);
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(g.label, cx, oy + 104);
        });

        const tex = new THREE_LIB.CanvasTexture(canvas);
        tex.colorSpace = THREE_LIB.SRGBColorSpace;
        createdTextures.push(tex);
        return tex;
      }

      const materials = {
        hexDeck: new THREE_LIB.MeshStandardMaterial({
          map: createHexDeckTexture(),
          flatShading: true,
          color: 0xdbeafe,
          metalness: 0.62,
          roughness: 0.44
        }),
        perimeterTrim: new THREE_LIB.MeshStandardMaterial({
          map: createCircuitTrimTexture(),
          flatShading: true,
          color: 0x94a3b8,
          metalness: 0.72,
          roughness: 0.36
        }),
        foundationHull: new THREE_LIB.MeshStandardMaterial({
          color: 0x161d29,
          flatShading: true,
          metalness: 0.78,
          roughness: 0.38
        }),
        steelBeam: new THREE_LIB.MeshStandardMaterial({
          color: 0x283447,
          flatShading: true,
          metalness: 0.82,
          roughness: 0.32
        }),
        railingMetal: new THREE_LIB.MeshStandardMaterial({
          color: 0x475569,
          flatShading: true,
          metalness: 0.84,
          roughness: 0.28
        }),
        amberEmissive: new THREE_LIB.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xf59e0b,
          emissiveIntensity: 1.45,
          flatShading: true,
          roughness: 0.25
        }),
        inlayAccent: new THREE_LIB.MeshStandardMaterial({
          color: 0x101724,
          flatShading: true,
          metalness: 0.68,
          roughness: 0.42
        }),
        alphaGreenEmissive: new THREE_LIB.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 1.55,
          flatShading: true,
          roughness: 0.25
        }),
        redTeamEmissive: new THREE_LIB.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xef4444,
          emissiveIntensity: 1.55,
          flatShading: true,
          roughness: 0.25
        }),
        blueTeamEmissive: new THREE_LIB.MeshStandardMaterial({
          color: 0x3b82f6,
          emissive: 0x3b82f6,
          emissiveIntensity: 1.55,
          flatShading: true,
          roughness: 0.25
        }),
        neutralCaptureEmissive: new THREE_LIB.MeshStandardMaterial({
          color: 0xdbeafe,
          emissive: 0x94a3b8,
          emissiveIntensity: 0.95,
          flatShading: true,
          roughness: 0.3
        }),
        contestedCaptureEmissive: new THREE_LIB.MeshStandardMaterial({
          color: 0xfbbf24,
          emissive: 0xf59e0b,
          emissiveIntensity: 1.7,
          flatShading: true,
          roughness: 0.22
        }),
        tacticalSignage: new THREE_LIB.MeshBasicMaterial({
          map: createTacticalSignageAtlas(),
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2
        }),
        cargoPanel: new THREE_LIB.MeshStandardMaterial({
          map: createCargoPanelTexture(),
          flatShading: true,
          color: 0xcbd5e1,
          metalness: 0.65,
          roughness: 0.45
        }),
        ventUnit: new THREE_LIB.MeshStandardMaterial({
          map: createVentLouverTexture(),
          flatShading: true,
          color: 0xcbd5e1,
          metalness: 0.74,
          roughness: 0.38
        })
      };

      const modularGroups = [];
      const collisionDefinitions = [];
      const obstacleDefinitions = [];
      const connectionPoints = [];
      const beamInstances = [];
      const braceInstances = [];
      const stepInstances = [];
      const postInstances = [];
      let railingColliderCounter = 0;

      function getOctagonPoints(cx, cz, size) {
        const half = size * 0.5;
        const cut = size * 0.28;
        return [
          new THREE_LIB.Vector2(cx - half + cut, cz - half),
          new THREE_LIB.Vector2(cx + half - cut, cz - half),
          new THREE_LIB.Vector2(cx + half, cz - half + cut),
          new THREE_LIB.Vector2(cx + half, cz + half - cut),
          new THREE_LIB.Vector2(cx + half - cut, cz + half),
          new THREE_LIB.Vector2(cx - half + cut, cz + half),
          new THREE_LIB.Vector2(cx - half, cz + half - cut),
          new THREE_LIB.Vector2(cx - half, cz - half + cut)
        ];
      }

      function getChamferedRectPoints(cx, cz, width, depth, chamfer) {
        const hw = width * 0.5;
        const hd = depth * 0.5;
        const c = Math.min(chamfer, hw * 0.8, hd * 0.8);
        return [
          new THREE_LIB.Vector2(cx - hw + c, cz - hd),
          new THREE_LIB.Vector2(cx + hw - c, cz - hd),
          new THREE_LIB.Vector2(cx + hw, cz - hd + c),
          new THREE_LIB.Vector2(cx + hw, cz + hd - c),
          new THREE_LIB.Vector2(cx + hw - c, cz + hd),
          new THREE_LIB.Vector2(cx - hw + c, cz + hd),
          new THREE_LIB.Vector2(cx - hw, cz + hd - c),
          new THREE_LIB.Vector2(cx - hw, cz - hd + c)
        ];
      }

      function createSlabFromPoints(points2D, topY, height, material) {
        const shape = new THREE_LIB.Shape();
        points2D.forEach((pt, idx) => {
          if (idx === 0) shape.moveTo(pt.x, -pt.y);
          else shape.lineTo(pt.x, -pt.y);
        });
        shape.closePath();

        const rawGeo = new THREE_LIB.ExtrudeGeometry(shape, {
          depth: height,
          bevelEnabled: false,
          steps: 1
        });
        rawGeo.rotateX(-Math.PI / 2);
        rawGeo.translate(0, topY - height, 0);

        const posAttr = rawGeo.attributes.position;
        const uvAttr = rawGeo.attributes.uv;
        for (let i = 0; i < posAttr.count; i++) {
          uvAttr.setXY(i, posAttr.getX(i), posAttr.getZ(i));
        }
        uvAttr.needsUpdate = true;

        const flatGeo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
        flatGeo.computeVertexNormals();
        return new THREE_LIB.Mesh(flatGeo, material);
      }

      function addCollisionVolume(
        name,
        type,
        minVec,
        maxVec,
        rotY = 0,
        slopeDeg = 0,
        polygon2D = null,
        stairEndpoints = null
      ) {
        const minX = Math.min(minVec.x, maxVec.x);
        const maxX = Math.max(minVec.x, maxVec.x);
        const minY = Math.min(minVec.y, maxVec.y);
        const maxY = Math.max(minVec.y, maxVec.y);
        const minZ = Math.min(minVec.z, maxVec.z);
        const maxZ = Math.max(minVec.z, maxVec.z);

        const entry = {
          id: name,
          type,
          bounds: {
            min: { x: +minX.toFixed(3), y: +minY.toFixed(3), z: +minZ.toFixed(3) },
            max: { x: +maxX.toFixed(3), y: +maxY.toFixed(3), z: +maxZ.toFixed(3) }
          },
          rotationY: +rotY.toFixed(4),
          slopeDegrees: +slopeDeg.toFixed(2)
        };

        if (polygon2D && polygon2D.length >= 3) {
          entry.polygonXZ = polygon2D.map((p) => ({
            x: +p.x.toFixed(3),
            z: +(p.z !== undefined ? p.z : p.y).toFixed(3)
          }));
        }
        if (stairEndpoints) {
          entry.endpoints = stairEndpoints;
        }
        collisionDefinitions.push(entry);
      }

      const pendingEdges = [];
      function addEdgeDetails(...args) { pendingEdges.push(args); }
      function buildEdgeDetails(
        group,
        points2D,
        skipEdgeIndices = new Set(),
        yBase = 0,
        includeRailing = true,
        edgeGaps = {},
        layerTag = 'level1',
        edgeMaterial = materials.amberEmissive
      ) {
        const trimWidth = 0.65;
        const trimHeight = 0.08;
        const rH = SPEC.railingHeight;

        for (let i = 0; i < points2D.length; i++) {
          if (skipEdgeIndices.has(i)) continue;
          const p1 = points2D[i];
          const p2 = points2D[(i + 1) % points2D.length];
          const dx = p2.x - p1.x;
          const dz = p2.y - p1.y;
          const len = Math.hypot(dx, dz);
          if (len < 0.2) continue;

          const ux = dx / len;
          const uz = dz / len;
          const nx = uz;
          const nz = -ux;
          const angle = -Math.atan2(dz, dx);

          // Determine actual walkable connections from the completed floor and ramp union.
          // Keep rails at exposed edges; remove only the portion crossing a connected surface.
          const connected = d => {
            const x = p1.x + ux*d + nx*0.55, z = p1.y + uz*d + nz*0.55;
            return collisionDefinitions.some(c => {
              const b=c.bounds;
              if(x<b.min.x-0.04||x>b.max.x+0.04||z<b.min.z-0.04||z>b.max.z+0.04)return false;
              if(c.type==='walkable_floor')return Math.abs(b.max.y-yBase)<0.05 && (!c.polygonXZ||isPointInPolygonXZ(x,z,c.polygonXZ));
              if(c.type!=='stair_ramp')return false;
              const {ascendingStart:a,ascendingEnd:e}=c.endpoints;
              const dx=e.x-a.x,dz=e.z-a.z;
              const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
              return Math.abs(a.y+t*(e.y-a.y)-yBase)<0.48;
            });
          };
          const segments=[];
          const samples=Math.ceil(len/0.2);let start=null;
          for(let k=0;k<samples;k++){
            const d=(k+0.5)*len/samples;
            const open=connected(d);
            if(!open&&start===null)start=k*len/samples;
            if(open&&start!==null){segments.push([start,k*len/samples]);start=null;}
          }
          if(start!==null)segments.push([start,len]);

          segments.forEach(([s0, s1]) => {
            const segLen = s1 - s0;
            if (segLen < 0.25) return;

            const midDist = (s0 + s1) * 0.5;
            const midX = p1.x + ux * midDist;
            const midZ = p1.y + uz * midDist;

            const trimMesh = new THREE_LIB.Mesh(
              new THREE_LIB.BoxGeometry(segLen, trimHeight, trimWidth),
              materials.perimeterTrim
            );
            trimMesh.position.set(midX + nx * (trimWidth * 0.5), yBase + trimHeight * 0.5, midZ + nz * (trimWidth * 0.5));
            trimMesh.rotation.y = angle;
            group.add(trimMesh);

            const stripMesh = new THREE_LIB.Mesh(
              new THREE_LIB.BoxGeometry(segLen, 0.09, 0.14),
              edgeMaterial
            );
            stripMesh.position.set(midX + nx * 0.06, yBase + 0.055, midZ + nz * 0.06);
            stripMesh.rotation.y = angle;
            group.add(stripMesh);

            if (includeRailing) {
              const topRail = new THREE_LIB.Mesh(new THREE_LIB.BoxGeometry(segLen, 0.1, 0.12), materials.railingMetal);
              topRail.position.set(midX + nx * 0.22, yBase + rH, midZ + nz * 0.22);
              topRail.rotation.y = angle;
              group.add(topRail);

              const midRail = new THREE_LIB.Mesh(new THREE_LIB.BoxGeometry(segLen, 0.07, 0.08), materials.railingMetal);
              midRail.position.set(midX + nx * 0.22, yBase + rH * 0.52, midZ + nz * 0.22);
              midRail.rotation.y = angle;
              group.add(midRail);

              const postCount = Math.max(2, Math.floor(segLen / 4.5) + 1);
              for (let k = 0; k < postCount; k++) {
                const t = postCount === 1 ? 0.5 : k / (postCount - 1);
                const px = p1.x + ux * (s0 + segLen * t) + nx * 0.22;
                const pz = p1.y + uz * (s0 + segLen * t) + nz * 0.22;
                postInstances.push({ x: px, y: yBase + rH * 0.5, z: pz, angle, layer: layerTag });
              }

              railingColliderCounter++;
              const railHalfThick = 0.14;
              const rP1 = { x: p1.x + ux * s0 + nx * 0.22, z: p1.y + uz * s0 + nz * 0.22 };
              const rP2 = { x: p1.x + ux * s1 + nx * 0.22, z: p1.y + uz * s1 + nz * 0.22 };
              const rPoly = [
                { x: rP1.x + nx * railHalfThick, z: rP1.z + nz * railHalfThick },
                { x: rP2.x + nx * railHalfThick, z: rP2.z + nz * railHalfThick },
                { x: rP2.x - nx * railHalfThick, z: rP2.z - nz * railHalfThick },
                { x: rP1.x - nx * railHalfThick, z: rP1.z - nz * railHalfThick }
              ];
              const rCross =
                (rPoly[1].x - rPoly[0].x) * (rPoly[2].z - rPoly[0].z) -
                (rPoly[1].z - rPoly[0].z) * (rPoly[2].x - rPoly[0].x);
              if (rCross < 0) rPoly.reverse();

              addCollisionVolume(
                `Railing_${layerTag}_${railingColliderCounter}`,
                'safety_railing',
                new THREE_LIB.Vector3(Math.min(...rPoly.map((p) => p.x)), yBase, Math.min(...rPoly.map((p) => p.z))),
                new THREE_LIB.Vector3(Math.max(...rPoly.map((p) => p.x)), yBase + rH, Math.max(...rPoly.map((p) => p.z))),
                0,
                0,
                rPoly
              );
            }
          });
        }
      }

      function registerSpanUnderStructure(p1, p2, spanWidth, yBottom = -2.0) {
        const dx = p2.x - p1.x;
        const dz = p2.y - p1.y;
        const len = Math.hypot(dx, dz);
        const angle = -Math.atan2(dz, dx);
        const ux = dx / len;
        const uz = dz / len;
        const nx = -uz;
        const nz = ux;
        const midX = (p1.x + p2.x) * 0.5;
        const midZ = (p1.y + p2.y) * 0.5;

        [-spanWidth * 0.34, spanWidth * 0.34].forEach((offset) => {
          beamInstances.push({ x: midX + nx * offset, y: yBottom - 0.55, z: midZ + nz * offset, len, angle });
        });

        const bayCount = Math.max(2, Math.floor(len / 12));
        for (let i = 0; i <= bayCount; i++) {
          const d = (i / bayCount) * len;
          const bx = p1.x + ux * d;
          const bz = p1.y + uz * d;
          beamInstances.push({ x: bx, y: yBottom - 0.55, z: bz, len: spanWidth * 0.78, angle: angle + Math.PI / 2 });

          if (i < bayCount) {
            const dNext = ((i + 0.5) / bayCount) * len;
            braceInstances.push({
              x: p1.x + ux * dNext,
              y: yBottom - 1.35,
              z: p1.y + uz * dNext,
              angle,
              flip: i % 2 === 0
            });
          }
        }
      }

      function registerModule(group, id, label, specs, cx = 0, cz = 0) {
        group.name = id;
        assignToSpatialChunk(group, cx, cz);
        modularGroups.push({ id, label, specs, group });
        return group;
      }

      /**
       * Merges compatible static meshes by material inside a group so each modular
       * group uses minimal draw calls, and computes tight bounding spheres for frustum culling.
       */
      function optimizeGroupStaticMeshes(group) {
        const buckets = new Map();
        const toRemove = [];
        group.updateMatrixWorld(true);

        group.traverse((child) => {
          if (!child.isMesh || child.isInstancedMesh) return;
          const mat = child.material;
          if (!mat || Array.isArray(mat)) return;

          let geo = child.geometry.clone();
          if (geo.index) geo = geo.toNonIndexed();
          geo.applyMatrix4(child.matrixWorld);
          if (!geo.attributes.normal) geo.computeVertexNormals();

          if (!buckets.has(mat)) buckets.set(mat, []);
          buckets.get(mat).push(geo);
          toRemove.push(child);
        });

        toRemove.forEach((m) => {
          if (m.parent) m.parent.remove(m);
          m.geometry.dispose();
        });

        buckets.forEach((geos, mat) => {
          if (geos.length === 0) return;
          let totalVerts = 0;
          geos.forEach((g) => (totalVerts += g.attributes.position.count));

          const posArr = new Float32Array(totalVerts * 3);
          const normArr = new Float32Array(totalVerts * 3);
          const uvArr = new Float32Array(totalVerts * 2);

          let offset = 0;
          geos.forEach((g) => {
            const p = g.attributes.position.array;
            const n = g.attributes.normal.array;
            const u = g.attributes.uv ? g.attributes.uv.array : null;
            const count = g.attributes.position.count;
            posArr.set(p, offset * 3);
            normArr.set(n, offset * 3);
            if (u) uvArr.set(u, offset * 2);
            offset += count;
            g.dispose();
          });

          const mergedGeo = new THREE_LIB.BufferGeometry();
          mergedGeo.setAttribute('position', new THREE_LIB.BufferAttribute(posArr, 3));
          mergedGeo.setAttribute('normal', new THREE_LIB.BufferAttribute(normArr, 3));
          mergedGeo.setAttribute('uv', new THREE_LIB.BufferAttribute(uvArr, 2));
          mergedGeo.computeBoundingSphere();

          const mergedMesh = new THREE_LIB.Mesh(mergedGeo, mat);
          mergedMesh.frustumCulled = true;
          group.add(mergedMesh);
        });
      }

      // --------------------------------------------------------------------------
      // LEVEL 1 FOUNDATION (Y = 0.0m)
      // --------------------------------------------------------------------------
      const bravoOctPts = getOctagonPoints(-SPEC.landingX, SPEC.horizontalZ, SPEC.landingSize);
      const charlieOctPts = getOctagonPoints(SPEC.landingX, SPEC.horizontalZ, SPEC.landingSize);
      const centerOctPts = getOctagonPoints(0, 0, SPEC.centerHubSize);

      const gBL = new THREE_LIB.Group();
      gBL.add(createSlabFromPoints(bravoOctPts, 0, 0.28, materials.hexDeck));
      gBL.add(createSlabFromPoints(bravoOctPts, -0.28, SPEC.slabThickness - 0.28, materials.foundationHull));
      addEdgeDetails(gBL, bravoOctPts, new Set([1, 2]), 0, true, {}, 'level1');
      addCollisionVolume('Landing_Platform_BL_Floor', 'walkable_floor', new THREE_LIB.Vector3(-123, -2, 72), new THREE_LIB.Vector3(-87, 0, 108), 0, 0, bravoOctPts);
      registerModule(gBL, 'Landing_Platform_BL', 'Bravo Octagon (Y=0m)', '36m x 36m octagonal deck @ (-105, 0, +90)', -105, 90);

      const gBR = new THREE_LIB.Group();
      gBR.add(createSlabFromPoints(charlieOctPts, 0, 0.28, materials.hexDeck));
      gBR.add(createSlabFromPoints(charlieOctPts, -0.28, SPEC.slabThickness - 0.28, materials.foundationHull));
      addEdgeDetails(gBR, charlieOctPts, new Set([6, 7]), 0, true, {}, 'level1');
      addCollisionVolume('Landing_Platform_BR_Floor', 'walkable_floor', new THREE_LIB.Vector3(87, -2, 72), new THREE_LIB.Vector3(123, 0, 108), 0, 0, charlieOctPts);
      registerModule(gBR, 'Landing_Platform_BR', 'Charlie Octagon (Y=0m)', '36m x 36m octagonal deck @ (+105, 0, +90)', 105, 90);

      // Main Horizontal Pathway (Z = +90m, 14m wide)
      const gHoriz = new THREE_LIB.Group();
      const horizPts = [
        new THREE_LIB.Vector2(-88, 83),
        new THREE_LIB.Vector2(88, 83),
        new THREE_LIB.Vector2(88, 97),
        new THREE_LIB.Vector2(-88, 97)
      ];
      gHoriz.add(createSlabFromPoints(horizPts, 0, 0.28, materials.hexDeck));
      gHoriz.add(createSlabFromPoints(horizPts, -0.28, SPEC.slabThickness - 0.28, materials.foundationHull));
      addEdgeDetails(gHoriz, horizPts, new Set([1, 3]), 0, true, { 0: [81, 95] }, 'level1');
      registerSpanUnderStructure(new THREE_LIB.Vector2(-88, 90), new THREE_LIB.Vector2(88, 90), 14, -2.0);
      addCollisionVolume('Horizontal_Pathway_Floor', 'walkable_floor', new THREE_LIB.Vector3(-88, -2, 83), new THREE_LIB.Vector3(88, 0, 97), 0, 0, horizPts);
      registerModule(gHoriz, 'Horizontal_Pathway', 'South Bridge (210m x 14m)', 'Connects Bravo & Charlie along Z = +90m', 0, 90);

      // Central Ground Intersection (30m x 30m @ 0,0,0)
      const gCenterL1 = new THREE_LIB.Group();
      gCenterL1.add(createSlabFromPoints(centerOctPts, 0, 0.28, materials.hexDeck));
      gCenterL1.add(createSlabFromPoints(centerOctPts, -0.28, SPEC.slabThickness - 0.28, materials.foundationHull));
      addEdgeDetails(gCenterL1, centerOctPts, new Set([0, 2, 4, 6]), 0, true, {}, 'level1');
      addCollisionVolume('Central_Intersection_Floor', 'walkable_floor', new THREE_LIB.Vector3(-15, -2, -15), new THREE_LIB.Vector3(15, 0, 15), 0, 0, centerOctPts);
      registerModule(gCenterL1, 'Central_Intersection', 'L1 Center Hub (30m x 30m)', 'Chamfered ground intersection @ (0, 0, 0)', 0, 0);

      // Central Spine Pathway & Lateral Crossbar
      const gSpine = new THREE_LIB.Group();
      const spineSouthPts = [
        new THREE_LIB.Vector2(-7, 14),
        new THREE_LIB.Vector2(7, 14),
        new THREE_LIB.Vector2(7, 83),
        new THREE_LIB.Vector2(-7, 83)
      ];
      gSpine.add(createSlabFromPoints(spineSouthPts, 0, 0.28, materials.hexDeck));
      gSpine.add(createSlabFromPoints(spineSouthPts, -0.28, SPEC.slabThickness - 0.28, materials.foundationHull));
      addEdgeDetails(gSpine, spineSouthPts, new Set([0, 2]), 0, true, {}, 'level1');
      registerSpanUnderStructure(new THREE_LIB.Vector2(0, 14), new THREE_LIB.Vector2(0, 83), 14, -2.0);
      addCollisionVolume('Central_Spine_South_Floor', 'walkable_floor', new THREE_LIB.Vector3(-7, -2, 14), new THREE_LIB.Vector3(7, 0, 83), 0, 0, spineSouthPts);

      const spineNorthPts = [
        new THREE_LIB.Vector2(-7, -112),
        new THREE_LIB.Vector2(7, -112),
        new THREE_LIB.Vector2(7, -14),
        new THREE_LIB.Vector2(-7, -14)
      ];
      gSpine.add(createSlabFromPoints(spineNorthPts, 0, 0.28, materials.hexDeck));
      gSpine.add(createSlabFromPoints(spineNorthPts, -0.28, SPEC.slabThickness - 0.28, materials.foundationHull));
      addEdgeDetails(gSpine, spineNorthPts, new Set([2]), 0, true, { 1: [3, 11], 3: [87, 95] }, 'level1');
      registerSpanUnderStructure(new THREE_LIB.Vector2(0, -112), new THREE_LIB.Vector2(0, -14), 14, -2.0);
      addCollisionVolume('Central_Spine_North_Floor', 'walkable_floor', new THREE_LIB.Vector3(-7, -2, -112), new THREE_LIB.Vector3(7, 0, -14), 0, 0, spineNorthPts);

      const crossbarPts = [
        new THREE_LIB.Vector2(-52.5, -7),
        new THREE_LIB.Vector2(52.5, -7),
        new THREE_LIB.Vector2(52.5, 7),
        new THREE_LIB.Vector2(-52.5, 7)
      ];
      gSpine.add(createSlabFromPoints(crossbarPts, 0, 0.28, materials.hexDeck));
      gSpine.add(createSlabFromPoints(crossbarPts, -0.28, SPEC.slabThickness - 0.28, materials.foundationHull));
      addEdgeDetails(gSpine, crossbarPts, new Set([1, 3]), 0, true, { 0: [45.5, 59.5], 2: [45.5, 59.5] }, 'level1');
      addCollisionVolume('Central_Crossbar_Floor', 'walkable_floor', new THREE_LIB.Vector3(-52.5, -2, -7), new THREE_LIB.Vector3(52.5, 0, 7), 0, 0, crossbarPts);
      registerModule(gSpine, 'Central_Spine_Pathway', 'L1 Spine & Crossbar (14m)', 'North-south spine & A-frame crossbar', 0, -20);

      // Symmetrical Lower Diagonal Pathways
      [
        { id: 'Diagonal_Pathway_Left', label: 'West Diagonal Span (14m)', sign: -1, pStart: new THREE_LIB.Vector2(-95, 78), pEnd: new THREE_LIB.Vector2(-5, -96) },
        { id: 'Diagonal_Pathway_Right', label: 'East Diagonal Span (14m)', sign: 1, pStart: new THREE_LIB.Vector2(95, 78), pEnd: new THREE_LIB.Vector2(5, -96) }
      ].forEach((leg) => {
        const gDiag = new THREE_LIB.Group();
        const dx = leg.pEnd.x - leg.pStart.x;
        const dz = leg.pEnd.y - leg.pStart.y;
        const len = Math.hypot(dx, dz);
        const ux = dx / len;
        const uz = dz / len;
        const nx = -uz * 7;
        const nz = ux * 7;
        const diagPts = [
          new THREE_LIB.Vector2(leg.pStart.x + nx, leg.pStart.y + nz),
          new THREE_LIB.Vector2(leg.pEnd.x + nx, leg.pEnd.y + nz),
          new THREE_LIB.Vector2(leg.pEnd.x - nx, leg.pEnd.y - nz),
          new THREE_LIB.Vector2(leg.pStart.x - nx, leg.pStart.y - nz)
        ];
        const cross = (diagPts[1].x - diagPts[0].x) * (diagPts[2].y - diagPts[0].y) - (diagPts[1].y - diagPts[0].y) * (diagPts[2].x - diagPts[0].x);
        if (cross < 0) diagPts.reverse();

        gDiag.add(createSlabFromPoints(diagPts, 0, 0.28, materials.hexDeck));
        gDiag.add(createSlabFromPoints(diagPts, -0.28, SPEC.slabThickness - 0.28, materials.foundationHull));
        addEdgeDetails(gDiag, diagPts, new Set([1, 3]), 0, true, { 0: [82, 102], 2: [82, 102] }, 'level1');
        registerSpanUnderStructure(leg.pStart, leg.pEnd, 14, -2.0);
        addCollisionVolume(
          `${leg.id}_Floor`,
          'walkable_floor',
          new THREE_LIB.Vector3(Math.min(...diagPts.map((p) => p.x)), -2, Math.min(...diagPts.map((p) => p.y))),
          new THREE_LIB.Vector3(Math.max(...diagPts.map((p) => p.x)), 0, Math.max(...diagPts.map((p) => p.y))),
          0,
          0,
          diagPts
        );
        registerModule(gDiag, leg.id, leg.label, '14m angled A-frame pathway @ Y = 0m', leg.sign * 52, 0);
      });

      // --------------------------------------------------------------------------
      // PHASE 2: MIRRORED CORNER BUILDINGS (Y=0..4m) & DUAL-FLIGHT STAIRCASES (Y=0..8m)
      // --------------------------------------------------------------------------
      function buildCornerComplex(side) {
        const isBravo = side === 'Bravo';
        const sign = isBravo ? -1 : 1;
        const bCenterX = sign * 116.5;
        const bCenterZ = 93.0;
        const bHalfW = SPEC.buildingWidth * 0.5;
        const bHalfD = SPEC.buildingDepth * 0.5;
        const roofY = SPEC.rooftopY;
        const wallT = SPEC.wallThickness;

        const gBldg = new THREE_LIB.Group();
        const gRoof = new THREE_LIB.Group();
        const gStair = new THREE_LIB.Group();
        const gUpper = new THREE_LIB.Group();

        // Building perimeter walls with 3m x 3m inward doorway on Z = bCenterZ
        const wallParts = [
          // North wall (Z = 87)
          { x: bCenterX, y: roofY * 0.5, z: bCenterZ - bHalfD + wallT * 0.5, w: SPEC.buildingWidth, h: roofY, d: wallT },
          // South wall (Z = 99)
          { x: bCenterX, y: roofY * 0.5, z: bCenterZ + bHalfD - wallT * 0.5, w: SPEC.buildingWidth, h: roofY, d: wallT },
          // Outer wall (X = sign * 121.5)
          { x: bCenterX + sign * (bHalfW - wallT * 0.5), y: roofY * 0.5, z: bCenterZ, w: wallT, h: roofY, d: SPEC.buildingDepth },
          // Inward wall north & south jambs (leaving 3m doorway Z = 91.5..94.5)
          { x: bCenterX - sign * (bHalfW - wallT * 0.5), y: roofY * 0.5, z: bCenterZ - 3.75, w: wallT, h: roofY, d: 4.5 },
          { x: bCenterX - sign * (bHalfW - wallT * 0.5), y: roofY * 0.5, z: bCenterZ + 3.75, w: wallT, h: roofY, d: 4.5 },
          // Door header (Y = 3.0..4.0)
          { x: bCenterX - sign * (bHalfW - wallT * 0.5), y: 3.5, z: bCenterZ, w: wallT, h: 1.0, d: 3.0 }
        ];

        wallParts.forEach((wp, idx) => {
          const m = new THREE_LIB.Mesh(new THREE_LIB.BoxGeometry(wp.w, wp.h, wp.d), materials.foundationHull);
          m.position.set(wp.x, wp.y, wp.z);
          gBldg.add(m);
          addCollisionVolume(
            `Building_${side}_Wall_${idx}`,
            'solid_wall',
            new THREE_LIB.Vector3(wp.x - wp.w * 0.5, wp.y - wp.h * 0.5, wp.z - wp.d * 0.5),
            new THREE_LIB.Vector3(wp.x + wp.w * 0.5, wp.y + wp.h * 0.5, wp.z + wp.d * 0.5)
          );
        });

        // Illuminated doorway frame
        const doorX = bCenterX - sign * bHalfW;
        [bCenterZ - 1.55, bCenterZ + 1.55].forEach((jz) => {
          const jamb = new THREE_LIB.Mesh(new THREE_LIB.BoxGeometry(0.16, 3.0, 0.14), materials.amberEmissive);
          jamb.position.set(doorX, 1.5, jz);
          gBldg.add(jamb);
        });
        const lintel = new THREE_LIB.Mesh(new THREE_LIB.BoxGeometry(0.16, 0.14, 3.24), materials.amberEmissive);
        lintel.position.set(doorX, 3.05, bCenterZ);
        gBldg.add(lintel);

        // Walkable Rooftop (Y = 4.0m) + 4m x 4m edge-shared connector apron to stair landing
        const roofPts = [
          new THREE_LIB.Vector2(bCenterX - bHalfW, bCenterZ - bHalfD),
          new THREE_LIB.Vector2(bCenterX + bHalfW, bCenterZ - bHalfD),
          new THREE_LIB.Vector2(bCenterX + bHalfW, bCenterZ + bHalfD),
          new THREE_LIB.Vector2(bCenterX - bHalfW, bCenterZ + bHalfD)
        ];
        gRoof.add(createSlabFromPoints(roofPts, roofY, 0.35, materials.hexDeck));
        addEdgeDetails(gRoof, roofPts, new Set(), roofY, true, { 0: isBravo ? [5.5, 9.5] : [0.5, 4.5] }, 'buildings');
        addCollisionVolume(
          `Rooftop_${side}_Floor`,
          'walkable_floor',
          new THREE_LIB.Vector3(bCenterX - bHalfW, roofY - 0.35, bCenterZ - bHalfD),
          new THREE_LIB.Vector3(bCenterX + bHalfW, roofY, bCenterZ + bHalfD),
          0,
          0,
          roofPts
        );

        // 4m x 4m Rooftop Connector Deck (X = sign * 111.5..115.5, Z = 83..87, Y = 4.0m)
        const connMinX = Math.min(sign * 111.5, sign * 115.5);
        const connMaxX = Math.max(sign * 111.5, sign * 115.5);
        const connPts = [
          new THREE_LIB.Vector2(connMinX, 83),
          new THREE_LIB.Vector2(connMaxX, 83),
          new THREE_LIB.Vector2(connMaxX, 87),
          new THREE_LIB.Vector2(connMinX, 87)
        ];
        gRoof.add(createSlabFromPoints(connPts, roofY, 0.35, materials.hexDeck));
        addEdgeDetails(gRoof, connPts, new Set([0, 2]), roofY, true, {}, 'buildings');
        addCollisionVolume(
          `Rooftop_Connector_${side}_Floor`,
          'walkable_floor',
          new THREE_LIB.Vector3(connMinX, roofY - 0.35, 83),
          new THREE_LIB.Vector3(connMaxX, roofY, 87),
          0,
          0,
          connPts
        );

        // Flight 1: Y = 0 -> Y = 4m along Z = 85 (X = sign * 104.5 -> sign * 111.5)
        const runLen = SPEC.risersPerFlight * SPEC.stepDepth; // 7.0m
        for (let i = 0; i < SPEC.risersPerFlight; i++) {
          const sx = sign * (104.5 + (i + 0.5) * SPEC.stepDepth);
          const sy = (i + 0.5) * SPEC.stepHeight;
          stepInstances.push({ x: sx, y: sy, z: 85.0, rotY: 0, layer: 'staircases' });
        }
        const f1MinX = Math.min(sign * 104.5, sign * 111.5);
        const f1MaxX = Math.max(sign * 104.5, sign * 111.5);
        addCollisionVolume(
          `Staircase_${side}_Flight1_Ramp`,
          'stair_ramp',
          new THREE_LIB.Vector3(f1MinX, 0.0, 83.0),
          new THREE_LIB.Vector3(f1MaxX, 4.0, 87.0),
          0,
          29.74,
          null,
          {
            ascendingStart: { x: sign * 104.5, y: 0.0, z: 85.0 },
            ascendingEnd: { x: sign * 111.5, y: 4.0, z: 85.0 },
            descendingStart: { x: sign * 111.5, y: 4.0, z: 85.0 },
            descendingEnd: { x: sign * 104.5, y: 0.0, z: 85.0 }
          }
        );

        // Intermediate Transfer Landing at Y = 4.0m (X = sign * 109.5..115.5, Z = 79..83)
        const midMinX = Math.min(sign * 111.5, sign * 115.5);
        const midMaxX = Math.max(sign * 111.5, sign * 115.5);
        const midPts = [
          new THREE_LIB.Vector2(midMinX, 79),
          new THREE_LIB.Vector2(midMaxX, 79),
          new THREE_LIB.Vector2(midMaxX, 83),
          new THREE_LIB.Vector2(midMinX, 83)
        ];
        gStair.add(createSlabFromPoints(midPts, 4.0, 0.35, materials.hexDeck));
        addEdgeDetails(gStair, midPts, new Set([1]), 4.0, true, { 2: isBravo ? [0, 4.0] : [2.0, 6.0] }, 'staircases');
        addCollisionVolume(
          `Staircase_${side}_MidLanding_Floor`,
          'walkable_floor',
          new THREE_LIB.Vector3(midMinX, 3.65, 79),
          new THREE_LIB.Vector3(midMaxX, 4.0, 83),
          0,
          0,
          midPts
        );

        // Flight 2: Y = 4m -> Y = 8m along Z = 81 (X = sign * 111.5 -> sign * 104.5)
        for (let i = 0; i < SPEC.risersPerFlight; i++) {
          const sx = sign * (111.5 - (i + 0.5) * SPEC.stepDepth);
          const sy = 4.0 + (i + 0.5) * SPEC.stepHeight;
          stepInstances.push({ x: sx, y: sy, z: 81.0, rotY: 0, layer: 'staircases' });
        }
        addCollisionVolume(
          `Staircase_${side}_Flight2_Ramp`,
          'stair_ramp',
          new THREE_LIB.Vector3(f1MinX, 4.0, 79.0),
          new THREE_LIB.Vector3(f1MaxX, 8.0, 83.0),
          0,
          29.74,
          null,
          {
            ascendingStart: { x: sign * 111.5, y: 4.0, z: 81.0 },
            ascendingEnd: { x: sign * 104.5, y: 8.0, z: 81.0 },
            descendingStart: { x: sign * 104.5, y: 8.0, z: 81.0 },
            descendingEnd: { x: sign * 111.5, y: 4.0, z: 81.0 }
          }
        );

        // Upper Connection Landing at Y = 8.0m (X = sign * 96.5..104.5, Z = 75..87)
        const upMinX = Math.min(sign * 96.5, sign * 104.5);
        const upMaxX = Math.max(sign * 96.5, sign * 104.5);
        const upPts = [
          new THREE_LIB.Vector2(upMinX, 75),
          new THREE_LIB.Vector2(upMaxX, 75),
          new THREE_LIB.Vector2(upMaxX, 87),
          new THREE_LIB.Vector2(upMinX, 87)
        ];
        gUpper.add(createSlabFromPoints(upPts, 8.0, 0.8, materials.hexDeck));
        addEdgeDetails(
          gUpper,
          upPts,
          new Set(),
          8.0,
          true,
          isBravo ? { 1: [1.5, 10.5], 3: [4.0, 8.0] } : { 1: [4.0, 8.0], 3: [1.5, 10.5] },
          'staircases'
        );
        addCollisionVolume(
          `Upper_Landing_${side}_Floor`,
          'walkable_floor',
          new THREE_LIB.Vector3(upMinX, 7.2, 75),
          new THREE_LIB.Vector3(upMaxX, 8.0, 87),
          0,
          0,
          upPts
        );

        connectionPoints.push({
          id: `L2_Bridge_${side}_Start`,
          position: { x: sign * 96.5, y: 8.0, z: 81.0 },
          width: SPEC.l2BridgeWidth
        });

        registerModule(gBldg, `Building_${side}`, `${side} Industrial Building`, `10m x 12m x 4m interior @ (${bCenterX}, 0, ${bCenterZ})`, bCenterX, bCenterZ);
        registerModule(gRoof, `Rooftop_${side}`, `${side} Rooftop (Y=4m)`, `Walkable Y=4.0m deck + 4m stair connector`, bCenterX, bCenterZ);
        registerModule(gStair, `Staircase_${side}`, `${side} Dual-Flight Stairs`, `20 risers/flight: Y=0 -> Y=4 -> Y=8m`, sign * 108, 83);
        registerModule(gUpper, `Upper_Landing_${side}`, `${side} Upper Landing (Y=8m)`, `8m x 12m inward bridge deck @ X=${sign * 96.5}`, sign * 100.5, 81);
      }

      buildCornerComplex('Bravo');
      buildCornerComplex('Charlie');

      // --------------------------------------------------------------------------
      // PHASE 3: SECOND-LEVEL CENTRAL PLATFORM (60m x 40m @ Y=8m) & BRIDGES
      // --------------------------------------------------------------------------
      const gL2Hub = new THREE_LIB.Group();
      const l2Pts = getChamferedRectPoints(0, 0, SPEC.l2HubWidth, SPEC.l2HubDepth, SPEC.l2HubChamfer);
      gL2Hub.add(createSlabFromPoints(l2Pts, 8.0, 0.25, materials.hexDeck));
      gL2Hub.add(createSlabFromPoints(l2Pts, 7.75, SPEC.l2SlabThickness - 0.25, materials.foundationHull));
      // Open gaps on North edge (for 14m Alpha bridge) and West/East edges (for 8m Bravo/Charlie bridges)
      addEdgeDetails(
        gL2Hub,
        l2Pts,
        new Set(),
        8.0,
        true,
        {
          0: [18.0, 32.0],
          2: [11.0, 19.0],
          6: [11.0, 19.0]
        },
        'level2'
      );
      addCollisionVolume('Level2_Central_Platform_Floor', 'walkable_floor', new THREE_LIB.Vector3(-30, 7.2, -20), new THREE_LIB.Vector3(30, 8.0, 20), 0, 0, l2Pts);
      connectionPoints.push({ id: 'L2_Alpha_North_Socket', position: { x: 0, y: 8.0, z: -20.0 }, width: SPEC.alphaBridgeWidth });
      registerModule(gL2Hub, 'Level2_Central_Platform', 'L2 Central Platform (60x40m)', 'Elevated octagonal hub @ (0, 8, 0)', 0, 0);

      // Two Symmetrical 8m-wide Diagonal Connecting Bridges (Bravo <-> L2 <-> Charlie)
      [
        { id: 'Level2_Bridge_Bravo', label: 'L2 Bravo Bridge (8m)', sign: -1, pA: new THREE_LIB.Vector2(-100, 81.0), pB: new THREE_LIB.Vector2(-27.0, 10.0) },
        { id: 'Level2_Bridge_Charlie', label: 'L2 Charlie Bridge (8m)', sign: 1, pA: new THREE_LIB.Vector2(100, 81.0), pB: new THREE_LIB.Vector2(27.0, 10.0) }
      ].forEach((br) => {
        const gBr = new THREE_LIB.Group();
        const dx = br.pB.x - br.pA.x;
        const dz = br.pB.y - br.pA.y;
        const len = Math.hypot(dx, dz);
        const ux = dx / len;
        const uz = dz / len;
        const nx = -uz * (SPEC.l2BridgeWidth * 0.5);
        const nz = ux * (SPEC.l2BridgeWidth * 0.5);

        const brPts = [
          new THREE_LIB.Vector2(br.pA.x + nx, br.pA.y + nz),
          new THREE_LIB.Vector2(br.pB.x + nx, br.pB.y + nz),
          new THREE_LIB.Vector2(br.pB.x - nx, br.pB.y - nz),
          new THREE_LIB.Vector2(br.pA.x - nx, br.pA.y - nz)
        ];
        const cross = (brPts[1].x - brPts[0].x) * (brPts[2].y - brPts[0].y) - (brPts[1].y - brPts[0].y) * (brPts[2].x - brPts[0].x);
        if (cross < 0) brPts.reverse();

        gBr.add(createSlabFromPoints(brPts, 8.0, 0.25, materials.hexDeck));
        gBr.add(createSlabFromPoints(brPts, 7.75, SPEC.l2SlabThickness - 0.25, materials.foundationHull));
        addEdgeDetails(gBr, brPts, new Set([1, 3]), 8.0, true, {}, 'level2');
        registerSpanUnderStructure(br.pA, br.pB, SPEC.l2BridgeWidth, 7.2);
        addCollisionVolume(
          `${br.id}_Floor`,
          'walkable_floor',
          new THREE_LIB.Vector3(Math.min(...brPts.map((p) => p.x)), 7.2, Math.min(...brPts.map((p) => p.y))),
          new THREE_LIB.Vector3(Math.max(...brPts.map((p) => p.x)), 8.0, Math.max(...brPts.map((p) => p.y))),
          0,
          0,
          brPts
        );
        registerModule(gBr, br.id, br.label, '8m wide elevated bridge @ Y = 8.0m', br.sign * 63, 45);
      });

      // Instanced Level 2 Support Columns (placed outside Level 1 walking lanes)
      const gL2Cols = new THREE_LIB.Group();
      const colCoords = [
        [-24, -14], [24, -14], [-24, 14], [24, 14],
        [-12, -16], [12, -16], [-12, 16], [12, 16],
        [-64, 46], [64, 46]
      ];
      const colGeo = new THREE_LIB.CylinderGeometry(0.65, 0.75, 7.2, 6);
      const l2ColInst = new THREE_LIB.InstancedMesh(colGeo, materials.steelBeam, colCoords.length);
      const dummy = new THREE_LIB.Object3D();
      colCoords.forEach(([cx, cz], idx) => {
        dummy.position.set(cx, 3.6, cz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        l2ColInst.setMatrixAt(idx, dummy.matrix);
        addCollisionVolume(
          `Level2_Column_${idx}`,
          'support_column',
          new THREE_LIB.Vector3(cx - 0.7, 0, cz - 0.7),
          new THREE_LIB.Vector3(cx + 0.7, 7.2, cz + 0.7)
        );
      });
      l2ColInst.instanceMatrix.needsUpdate = true;
      gL2Cols.add(l2ColInst);
      registerModule(gL2Cols, 'Level2_Support_Columns', 'L2 Support Columns (10x)', 'Hexagonal steel columns clear of L1 lanes', 0, 0);

      // --------------------------------------------------------------------------
      // PHASE 4: NORTHERN ALPHA PLATFORM (Y=8m), NORTH BRIDGE & FLANK STAIRCASES
      // --------------------------------------------------------------------------
      const gAlpha = new THREE_LIB.Group();
      const alphaPts = getChamferedRectPoints(0, SPEC.alphaApexZ, SPEC.alphaSize, SPEC.alphaSize, SPEC.alphaChamfer);
      gAlpha.add(createSlabFromPoints(alphaPts, 8.0, 0.25, materials.hexDeck));
      gAlpha.add(createSlabFromPoints(alphaPts, 7.75, SPEC.l2SlabThickness - 0.25, materials.foundationHull));
      // Open gaps on East (edge 2), South (edge 4, 14m bridge), and West (edge 6)
      addEdgeDetails(
        gAlpha,
        alphaPts,
        new Set(),
        8.0,
        true,
        {
          2: [10.0, 14.0],
          4: [5.0, 19.0],
          6: [10.0, 14.0]
        },
        'alpha',
        materials.alphaGreenEmissive
      );
      addCollisionVolume('Alpha_Capture_Platform_Floor', 'walkable_floor', new THREE_LIB.Vector3(-20, 7.2, -125), new THREE_LIB.Vector3(20, 8.0, -85), 0, 0, alphaPts);
      registerModule(gAlpha, 'Alpha_Capture_Platform', 'Alpha Platform (40x40m, Y=8m)', 'Northern octagonal capture deck @ (0, 8, -105)', 0, -105);

      // Straight Northern Bridge connecting L2 Central Hub (Z=-20) to Alpha (Z=-85)
      const gAlphaBridge = new THREE_LIB.Group();
      const abPts = [
        new THREE_LIB.Vector2(-7, -85),
        new THREE_LIB.Vector2(7, -85),
        new THREE_LIB.Vector2(7, -20),
        new THREE_LIB.Vector2(-7, -20)
      ];
      gAlphaBridge.add(createSlabFromPoints(abPts, 8.0, 0.25, materials.hexDeck));
      gAlphaBridge.add(createSlabFromPoints(abPts, 7.75, SPEC.l2SlabThickness - 0.25, materials.foundationHull));
      addEdgeDetails(gAlphaBridge, abPts, new Set([0, 2]), 8.0, true, {}, 'alpha');
      registerSpanUnderStructure(new THREE_LIB.Vector2(0, -85), new THREE_LIB.Vector2(0, -20), 14, 7.2);
      addCollisionVolume('Level2_Bridge_Alpha_Floor', 'walkable_floor', new THREE_LIB.Vector3(-7, 7.2, -85), new THREE_LIB.Vector3(7, 8.0, -20), 0, 0, abPts);
      registerModule(gAlphaBridge, 'Level2_Bridge_Alpha', 'L2 Alpha Bridge (65m x 14m)', 'Connects L2 Hub (Z=-20) to Alpha (Z=-85)', 0, -52);

      // Mirrored Dual-Flight Alpha Staircases (Ground Y=0 -> Y=4 -> Y=8m)
      ['Left', 'Right'].forEach((side) => {
        const isLeft = side === 'Left';
        const sign = isLeft ? -1 : 1;
        const gAStair = new THREE_LIB.Group();

        // Flight 1: X = sign * 7 -> sign * 14 along Z = -105 (Y = 0 -> 4m)
        for (let i = 0; i < SPEC.risersPerFlight; i++) {
          const sx = sign * (7.0 + (i + 0.5) * SPEC.stepDepth);
          const sy = (i + 0.5) * SPEC.stepHeight;
          stepInstances.push({ x: sx, y: sy, z: -105.0, rotY: 0, layer: 'alpha' });
        }
        const af1MinX = Math.min(sign * 7.0, sign * 14.0);
        const af1MaxX = Math.max(sign * 7.0, sign * 14.0);
        addCollisionVolume(
          `Alpha_Staircase_${side}_Flight1_Ramp`,
          'stair_ramp',
          new THREE_LIB.Vector3(af1MinX, 0.0, -107.0),
          new THREE_LIB.Vector3(af1MaxX, 4.0, -103.0),
          0,
          29.74,
          null,
          {
            ascendingStart: { x: sign * 7.0, y: 0.0, z: -105.0 },
            ascendingEnd: { x: sign * 14.0, y: 4.0, z: -105.0 },
            descendingStart: { x: sign * 14.0, y: 4.0, z: -105.0 },
            descendingEnd: { x: sign * 7.0, y: 0.0, z: -105.0 }
          }
        );

        // L-Shaped Intermediate Landing at Y = 4.0m (X = sign * 14..26, Z = -107..-103)
        const aMidMinX = Math.min(sign * 14.0, sign * 26.0);
        const aMidMaxX = Math.max(sign * 14.0, sign * 26.0);
        const aMidPts = [
          new THREE_LIB.Vector2(aMidMinX, -107),
          new THREE_LIB.Vector2(aMidMaxX, -107),
          new THREE_LIB.Vector2(aMidMaxX, -103),
          new THREE_LIB.Vector2(aMidMinX, -103)
        ];
        gAStair.add(createSlabFromPoints(aMidPts, 4.0, 0.35, materials.hexDeck));
        addEdgeDetails(gAStair, aMidPts, new Set([isLeft ? 1 : 3]), 4.0, true, { 2: isLeft ? [0, 4.0] : [8.0, 12.0] }, 'alpha', materials.alphaGreenEmissive);
        addCollisionVolume(
          `Alpha_Staircase_${side}_MidLanding_Floor`,
          'walkable_floor',
          new THREE_LIB.Vector3(aMidMinX, 3.65, -107),
          new THREE_LIB.Vector3(aMidMaxX, 4.0, -103),
          0,
          0,
          aMidPts
        );

        // Flight 2: Z = -103 -> -96 along X = sign * 24 (Y = 4 -> 8m)
        for (let i = 0; i < SPEC.risersPerFlight; i++) {
          const sz = -103.0 + (i + 0.5) * SPEC.stepDepth;
          const sy = 4.0 + (i + 0.5) * SPEC.stepHeight;
          stepInstances.push({ x: sign * 24.0, y: sy, z: sz, rotY: Math.PI / 2, layer: 'alpha' });
        }
        const af2MinX = Math.min(sign * 22.0, sign * 26.0);
        const af2MaxX = Math.max(sign * 22.0, sign * 26.0);
        addCollisionVolume(
          `Alpha_Staircase_${side}_Flight2_Ramp`,
          'stair_ramp',
          new THREE_LIB.Vector3(af2MinX, 4.0, -103.0),
          new THREE_LIB.Vector3(af2MaxX, 8.0, -96.0),
          0,
          29.74,
          null,
          {
            ascendingStart: { x: sign * 24.0, y: 4.0, z: -103.0 },
            ascendingEnd: { x: sign * 24.0, y: 8.0, z: -96.0 },
            descendingStart: { x: sign * 24.0, y: 8.0, z: -96.0 },
            descendingEnd: { x: sign * 24.0, y: 4.0, z: -103.0 }
          }
        );

        // Upper Entry Deck at Y = 8.0m connecting X = sign * 20..26, Z = -107..-92
        const aTopMinX = Math.min(sign * 20.0, sign * 26.0);
        const aTopMaxX = Math.max(sign * 20.0, sign * 26.0);
        const aTopPts = [
          new THREE_LIB.Vector2(aTopMinX, -96),
          new THREE_LIB.Vector2(aTopMaxX, -96),
          new THREE_LIB.Vector2(aTopMaxX, -92),
          new THREE_LIB.Vector2(aTopMinX, -92)
        ];
        gAStair.add(createSlabFromPoints(aTopPts, 8.0, 0.8, materials.hexDeck));
        addEdgeDetails(gAStair, aTopPts, new Set([0]), 8.0, true, isLeft ? { 1: [0, 4.0] } : { 3: [11.0, 15.0] }, 'alpha', materials.alphaGreenEmissive);
        addCollisionVolume(
          `Alpha_Staircase_${side}_TopDeck_Floor`,
          'walkable_floor',
          new THREE_LIB.Vector3(aTopMinX, 7.2, -96),
          new THREE_LIB.Vector3(aTopMaxX, 8.0, -92),
          0,
          0,
          aTopPts
        );

        registerModule(gAStair, `Alpha_Staircase_${side}`, `Alpha ${side} Staircase (Y=0..8m)`, `Dual 20-riser flank staircase into Alpha`, sign * 18, -102);
      });

      // Alpha Support Columns
      const gAlphaCols = new THREE_LIB.Group();
      const alphaColCoords = [[-16, -90], [16, -90], [-16, -120], [16, -120], [-8, -52], [8, -52]];
      const alphaColInst = new THREE_LIB.InstancedMesh(colGeo, materials.steelBeam, alphaColCoords.length);
      alphaColCoords.forEach(([cx, cz], idx) => {
        dummy.position.set(cx, 3.6, cz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        alphaColInst.setMatrixAt(idx, dummy.matrix);
        addCollisionVolume(`Alpha_Column_${idx}`, 'support_column', new THREE_LIB.Vector3(cx - 0.7, 0, cz - 0.7), new THREE_LIB.Vector3(cx + 0.7, 7.2, cz + 0.7));
      });
      alphaColInst.instanceMatrix.needsUpdate = true;
      gAlphaCols.add(alphaColInst);
      registerModule(gAlphaCols, 'Alpha_Support_Columns', 'Alpha Support Columns (6x)', 'Structural steel supports beneath Alpha & North Bridge', 0, -90);

      // --------------------------------------------------------------------------
      // PHASE 5: TACTICAL COMBAT COVER & INDUSTRIAL PROPS (INSTANCED LOW-POLY)
      // --------------------------------------------------------------------------
      const obstacleSpecs = {
        small_barrier: { width: 3.0, depth: 0.8, height: 1.1 },
        large_barrier: { width: 4.0, depth: 1.0, height: 2.2 },
        small_crate: { width: 1.2, depth: 1.2, height: 1.2 },
        large_container: { width: 4.0, depth: 2.0, height: 2.5 },
        struct_pillar: { width: 1.2, depth: 1.2, height: 3.0 },
        vent_unit: { width: 2.0, depth: 1.5, height: 1.2 }
      };

      const gCover = new THREE_LIB.Group();
      const placements = [
        // Horizontal L1 pathway cover (maintaining >= 6m open width)
        { type: 'small_barrier', x: -55, y: 0, z: 85.2, rotY: 0 },
        { type: 'small_barrier', x: 55, y: 0, z: 85.2, rotY: 0 },
        { type: 'small_barrier', x: -28, y: 0, z: 94.8, rotY: 0 },
        { type: 'small_barrier', x: 28, y: 0, z: 94.8, rotY: 0 },
        // Diagonal L1 pathway cover
        { type: 'small_barrier', x: -62, y: 0, z: 18, rotY: 0.48 },
        { type: 'small_barrier', x: 62, y: 0, z: 18, rotY: -0.48 },
        { type: 'small_barrier', x: -34, y: 0, z: -38, rotY: 0.48 },
        { type: 'small_barrier', x: 34, y: 0, z: -38, rotY: -0.48 },
        // Ground hub valid corner pillars & industrial props (inside chamfered 30m octagon)
        { type: 'struct_pillar', x: -9.4, y: 0, z: -9.4, rotY: 0 },
        { type: 'struct_pillar', x: 9.4, y: 0, z: -9.4, rotY: 0 },
        { type: 'struct_pillar', x: -9.4, y: 0, z: 9.4, rotY: 0 },
        { type: 'struct_pillar', x: 9.4, y: 0, z: 9.4, rotY: 0 },
        { type: 'vent_unit', x: -11.5, y: 0, z: 0, rotY: Math.PI / 2 },
        { type: 'vent_unit', x: 11.5, y: 0, z: 0, rotY: Math.PI / 2 },
        { type: 'small_crate', x: -11.2, y: 0, z: -3.2, rotY: 0 },
        { type: 'small_crate', x: 11.2, y: 0, z: -3.2, rotY: 0 },
        // Bravo & Charlie outer perimeter cover (outside 10m capture radius)
        { type: 'large_barrier', x: -92.0, y: 0, z: 99.5, rotY: -0.78 },
        { type: 'large_barrier', x: 92.0, y: 0, z: 99.5, rotY: 0.78 },
        { type: 'small_crate', x: -95.0, y: 0, z: 102.0, rotY: 0 },
        { type: 'small_crate', x: 95.0, y: 0, z: 102.0, rotY: 0 },
        // Level 2 Central Platform 4 symmetrical cover quadrants (open center arena)
        { type: 'large_barrier', x: -15.0, y: 8.0, z: -9.0, rotY: 0.35 },
        { type: 'large_barrier', x: 15.0, y: 8.0, z: -9.0, rotY: -0.35 },
        { type: 'large_barrier', x: -15.0, y: 8.0, z: 9.0, rotY: -0.35 },
        { type: 'large_barrier', x: 15.0, y: 8.0, z: 9.0, rotY: 0.35 },
        { type: 'large_container', x: -21.0, y: 8.0, z: -2.5, rotY: Math.PI / 2 },
        { type: 'large_container', x: 21.0, y: 8.0, z: -2.5, rotY: Math.PI / 2 },
        { type: 'small_crate', x: -18.5, y: 8.0, z: -7.5, rotY: 0 },
        { type: 'small_crate', x: 18.5, y: 8.0, z: -7.5, rotY: 0 },
        // Alpha perimeter cover (preserving 6m central capture radius & 3 entrances)
        { type: 'large_barrier', x: -10.5, y: 8.0, z: -114.5, rotY: 0.78 },
        { type: 'large_barrier', x: 10.5, y: 8.0, z: -114.5, rotY: -0.78 },
        { type: 'small_barrier', x: -10.5, y: 8.0, z: -94.5, rotY: -0.78 },
        { type: 'small_barrier', x: 10.5, y: 8.0, z: -94.5, rotY: 0.78 }
      ];

      const bucketsByType = {};
      Object.keys(obstacleSpecs).forEach((k) => (bucketsByType[k] = []));
      placements.forEach((p, idx) => {
        bucketsByType[p.type].push(p);
        const s = obstacleSpecs[p.type];
        const cos = Math.abs(Math.cos(p.rotY));
        const sin = Math.abs(Math.sin(p.rotY));
        const halfW = (s.width * cos + s.depth * sin) * 0.5;
        const halfD = (s.width * sin + s.depth * cos) * 0.5;
        obstacleDefinitions.push({ id: `Obstacle_${idx}_${p.type}`, type: p.type, position: { x: p.x, y: p.y, z: p.z }, rotationY: p.rotY, dimensions: s });
        addCollisionVolume(
          `Obstacle_${idx}_${p.type}`,
          'tactical_obstacle',
          new THREE_LIB.Vector3(p.x - halfW, p.y, p.z - halfD),
          new THREE_LIB.Vector3(p.x + halfW, p.y + s.height, p.z + halfD),
          p.rotY
        );
      });

      Object.entries(bucketsByType).forEach(([type, list]) => {
        if (list.length === 0) return;
        const s = obstacleSpecs[type];
        const geo = type === 'struct_pillar'
          ? new THREE_LIB.CylinderGeometry(s.width * 0.5, s.width * 0.5, s.height, 6)
          : new THREE_LIB.BoxGeometry(s.width, s.height, s.depth);
        const mat = type === 'small_crate' || type === 'large_container'
          ? materials.cargoPanel
          : type === 'vent_unit'
          ? materials.ventUnit
          : materials.steelBeam;
        const inst = new THREE_LIB.InstancedMesh(geo, mat, list.length);
        list.forEach((p, idx) => {
          dummy.position.set(p.x, p.y + s.height * 0.5, p.z);
          dummy.rotation.set(0, p.rotY, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          inst.setMatrixAt(idx, dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        gCover.add(inst);
      });
      registerModule(gCover, 'Tactical_Cover_All', 'Tactical Combat Cover & Props', 'Instanced low-poly barriers, crates, containers & pillars', 0, 0);

      // --------------------------------------------------------------------------
      // PHASE 6: TEAM SPAWNS, 3 CAPTURE INDICATORS & TACTICAL SIGNAGE ATLAS
      // --------------------------------------------------------------------------
      const spawnDefinitions = {
        redTeam: {
          team: 'Red',
          basePlatform: 'Bravo',
          elevationY: 0.0,
          facingYawRad: -Math.PI * 0.25,
          primarySpawns: [
            { id: 'Red_Spawn_1', x: -115.0, y: 0.0, z: 82.0 },
            { id: 'Red_Spawn_2', x: -112.0, y: 0.0, z: 79.0 },
            { id: 'Red_Spawn_3', x: -110.5, y: 0.0, z: 76.5 },
            { id: 'Red_Spawn_4', x: -114.5, y: 0.0, z: 83.2 }
          ],
          fallbackSpawns: [
            { id: 'Red_Fallback_1', x: -108.5, y: 0.0, z: 103.5 },
            { id: 'Red_Fallback_2', x: -98.0, y: 0.0, z: 102.0 }
          ]
        },
        blueTeam: {
          team: 'Blue',
          basePlatform: 'Charlie',
          elevationY: 0.0,
          facingYawRad: Math.PI * 0.25,
          primarySpawns: [
            { id: 'Blue_Spawn_1', x: 115.0, y: 0.0, z: 82.0 },
            { id: 'Blue_Spawn_2', x: 112.0, y: 0.0, z: 79.0 },
            { id: 'Blue_Spawn_3', x: 110.5, y: 0.0, z: 76.5 },
            { id: 'Blue_Spawn_4', x: 114.5, y: 0.0, z: 83.2 }
          ],
          fallbackSpawns: [
            { id: 'Blue_Fallback_1', x: 108.5, y: 0.0, z: 103.5 },
            { id: 'Blue_Fallback_2', x: 98.0, y: 0.0, z: 102.0 }
          ]
        }
      };

      const gSpawns = new THREE_LIB.Group();
      [
        { cfg: spawnDefinitions.redTeam, mat: materials.redTeamEmissive, cx: -113, cz: 80 },
        { cfg: spawnDefinitions.blueTeam, mat: materials.blueTeamEmissive, cx: 113, cz: 80 }
      ].forEach(({ cfg, mat }) => {
        cfg.primarySpawns.forEach((sp) => {
          const pad = new THREE_LIB.Mesh(new THREE_LIB.RingGeometry(0.55, 0.78, 6), mat);
          pad.rotation.x = -Math.PI / 2;
          pad.position.set(sp.x, sp.y + 0.025, sp.z);
          gSpawns.add(pad);
        });
      });

      // Batched 256x256 4x2 tactical directional signage atlas
      const signGeo = new THREE_LIB.PlaneGeometry(2.6, 2.6);
      signGeo.rotateX(-Math.PI / 2);
      const signPlacements = [
        { x: 0, y: 0.03, z: 78, rotY: 0, col: 0, row: 0 },
        { x: 0, y: 8.03, z: -24, rotY: 0, col: 0, row: 0 },
        { x: -82, y: 0.03, z: 90, rotY: Math.PI / 2, col: 1, row: 0 },
        { x: 82, y: 0.03, z: 90, rotY: -Math.PI / 2, col: 2, row: 0 },
        { x: -101, y: 0.03, z: 85, rotY: Math.PI / 2, col: 0, row: 1 },
        { x: 101, y: 0.03, z: 85, rotY: -Math.PI / 2, col: 0, row: 1 },
        { x: -5, y: 0.03, z: -105, rotY: Math.PI / 2, col: 3, row: 0 },
        { x: 5, y: 0.03, z: -105, rotY: -Math.PI / 2, col: 3, row: 0 }
      ];
      signPlacements.forEach((sp) => {
        const g = signGeo.clone();
        const u0 = sp.col * 0.25;
        const u1 = u0 + 0.25;
        const v1 = 1.0 - sp.row * 0.5;
        const v0 = v1 - 0.5;
        const uv = g.attributes.uv;
        uv.setXY(0, u0, v1);
        uv.setXY(1, u1, v1);
        uv.setXY(2, u0, v0);
        uv.setXY(3, u1, v0);
        const m = new THREE_LIB.Mesh(g, materials.tacticalSignage);
        m.position.set(sp.x, sp.y, sp.z);
        m.rotation.y = sp.rotY;
        gSpawns.add(m);
      });
      registerModule(gSpawns, 'Team_Spawns_And_Signage', 'Red & Blue Spawns + Signage', '12 spawn pads + batched 256x256 tactical atlas', 0, 80);

      // Three Multi-State Capture-Point Indicators (Alpha, Bravo, Charlie)
      const gObjectives = new THREE_LIB.Group();
      const capturePoints = [
        { id: 'Alpha', letter: 'A', x: 0.0, y: 8.0, z: -105.0, radius: 6.0, minElevationY: 7.5, maxElevationY: 11.5 },
        { id: 'Bravo', letter: 'B', x: -105.0, y: 0.0, z: 90.0, radius: 10.0, minElevationY: -0.5, maxElevationY: 3.5 },
        { id: 'Charlie', letter: 'C', x: 105.0, y: 0.0, z: 90.0, radius: 10.0, minElevationY: -0.5, maxElevationY: 3.5 }
      ].map((cp) => {
        const outerRing = new THREE_LIB.Mesh(
          new THREE_LIB.RingGeometry(cp.radius - 0.28, cp.radius, 24),
          materials.neutralCaptureEmissive
        );
        outerRing.rotation.x = -Math.PI / 2;
        outerRing.position.set(cp.x, cp.y + 0.03, cp.z);
        gObjectives.add(outerRing);

        const segGeo = new THREE_LIB.BoxGeometry(0.45, 0.04, 0.75);
        const segInst = new THREE_LIB.InstancedMesh(segGeo, new THREE_LIB.MeshBasicMaterial({ color: 0xffffff }), 24);
        for (let i = 0; i < 24; i++) {
          const ang = (i / 24) * Math.PI * 2;
          const rMid = cp.radius - 0.85;
          dummy.position.set(cp.x + Math.sin(ang) * rMid, cp.y + 0.03, cp.z - Math.cos(ang) * rMid);
          dummy.rotation.set(0, -ang, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          segInst.setMatrixAt(i, dummy.matrix);
          segInst.setColorAt(i, new THREE_LIB.Color(0x101724));
        }
        segInst.instanceMatrix.needsUpdate = true;
        if (segInst.instanceColor) segInst.instanceColor.needsUpdate = true;
        gObjectives.add(segInst);

        const coreDisc = new THREE_LIB.Mesh(new THREE_LIB.RingGeometry(0.01, 1.35, 6), materials.neutralCaptureEmissive);
        coreDisc.rotation.x = -Math.PI / 2;
        coreDisc.position.set(cp.x, cp.y + 0.03, cp.z);
        gObjectives.add(coreDisc);

        return { ...cp, outerRingMesh: outerRing, segmentInstancedMesh: segInst, letterMeshes: [coreDisc] };
      });
      registerModule(gObjectives, 'Capture_Point_Indicators', 'Capture Indicators (A / B / C)', '24-segment radial rings & elevation-gated zones', 0, 0);

      // --------------------------------------------------------------------------
      // INSTANCED TRUSSES, BEAMS, STAIRCASE RISERS & RAILING POSTS
      // --------------------------------------------------------------------------
      pendingEdges.forEach(args=>buildEdgeDetails(...args));
      const trussGroup = new THREE_LIB.Group();
      trussGroup.name = 'Under_Deck_Trusses';
      const beamInst = new THREE_LIB.InstancedMesh(new THREE_LIB.BoxGeometry(1, 0.65, 0.42), materials.steelBeam, Math.max(1, beamInstances.length));
      beamInstances.forEach((b, i) => {
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(0, b.angle, 0);
        dummy.scale.set(b.len, 1, 1);
        dummy.updateMatrix();
        beamInst.setMatrixAt(i, dummy.matrix);
      });
      beamInst.instanceMatrix.needsUpdate = true;
      trussGroup.add(beamInst);

      const braceInst = new THREE_LIB.InstancedMesh(new THREE_LIB.BoxGeometry(4.2, 0.28, 0.28), materials.steelBeam, Math.max(1, braceInstances.length));
      braceInstances.forEach((br, i) => {
        dummy.position.set(br.x, br.y, br.z);
        dummy.rotation.set(0, br.angle, br.flip ? 0.55 : -0.55);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        braceInst.setMatrixAt(i, dummy.matrix);
      });
      braceInst.instanceMatrix.needsUpdate = true;
      trussGroup.add(braceInst);
      root.add(trussGroup);

      const stepGeo = new THREE_LIB.BoxGeometry(SPEC.stepDepth, SPEC.stepHeight, SPEC.stairWidth);
      const stepInst = new THREE_LIB.InstancedMesh(stepGeo, materials.perimeterTrim, Math.max(1, stepInstances.length));
      stepInstances.forEach((st, i) => {
        dummy.position.set(st.x, st.y, st.z);
        dummy.rotation.set(0, st.rotY, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        stepInst.setMatrixAt(i, dummy.matrix);
      });
      stepInst.instanceMatrix.needsUpdate = true;
      root.add(stepInst);

      const postGeo = new THREE_LIB.BoxGeometry(0.12, SPEC.railingHeight, 0.12);
      const postInst = new THREE_LIB.InstancedMesh(postGeo, materials.railingMetal, Math.max(1, postInstances.length));
      postInstances.forEach((pt, i) => {
        dummy.position.set(pt.x, pt.y, pt.z);
        dummy.rotation.set(0, pt.angle, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        postInst.setMatrixAt(i, dummy.matrix);
      });
      postInst.instanceMatrix.needsUpdate = true;
      root.add(postInst);

      // Merge static geometry per modular group to minimize draw calls
      modularGroups.forEach((m) => {
        if (m.id !== 'Capture_Point_Indicators') optimizeGroupStaticMeshes(m.group);
      });

      const layerVisibility = {
        buildings: true,
        staircases: true,
        level2: true,
        alpha: true,
        cover: true,
        spawns: true,
        objectives: true,
        trusses: true
      };

      function refreshInstancedVisibility() {
        stepInstances.forEach((st, i) => {
          const vis = st.layer === 'alpha' ? layerVisibility.alpha : layerVisibility.staircases;
          dummy.position.set(st.x, st.y, st.z);
          dummy.rotation.set(0, st.rotY, 0);
          dummy.scale.setScalar(vis ? 1 : 0);
          dummy.updateMatrix();
          stepInst.setMatrixAt(i, dummy.matrix);
        });
        stepInst.instanceMatrix.needsUpdate = true;

        postInstances.forEach((pt, i) => {
          let vis = true;
          if (pt.layer === 'buildings') vis = layerVisibility.buildings;
          else if (pt.layer === 'staircases') vis = layerVisibility.staircases;
          else if (pt.layer === 'level2') vis = layerVisibility.level2;
          else if (pt.layer === 'alpha') vis = layerVisibility.alpha;
          dummy.position.set(pt.x, pt.y, pt.z);
          dummy.rotation.set(0, pt.angle, 0);
          dummy.scale.setScalar(vis ? 1 : 0);
          dummy.updateMatrix();
          postInst.setMatrixAt(i, dummy.matrix);
        });
        postInst.instanceMatrix.needsUpdate = true;
      }

      function setLayerVisibility(layerKey, visible) {
        layerVisibility[layerKey] = visible;
        const setByIds = (ids) => {
          ids.forEach((id) => {
            const found = modularGroups.find((m) => m.id === id);
            if (found) found.group.visible = visible;
          });
        };
        if (layerKey === 'buildings') setByIds(['Building_Bravo', 'Building_Charlie', 'Rooftop_Bravo', 'Rooftop_Charlie']);
        else if (layerKey === 'staircases') setByIds(['Staircase_Bravo', 'Staircase_Charlie', 'Upper_Landing_Bravo', 'Upper_Landing_Charlie']);
        else if (layerKey === 'level2') setByIds(['Level2_Central_Platform', 'Level2_Bridge_Bravo', 'Level2_Bridge_Charlie', 'Level2_Support_Columns']);
        else if (layerKey === 'alpha') setByIds(['Alpha_Capture_Platform', 'Level2_Bridge_Alpha', 'Alpha_Staircase_Left', 'Alpha_Staircase_Right', 'Alpha_Support_Columns']);
        else if (layerKey === 'cover') setByIds(['Tactical_Cover_All']);
        else if (layerKey === 'spawns') setByIds(['Team_Spawns_And_Signage']);
        else if (layerKey === 'objectives') setByIds(['Capture_Point_Indicators']);
        else if (layerKey === 'trusses') trussGroup.visible = visible;
        refreshInstancedVisibility();
      }

      function dispose() {
        root.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
        });
        Object.values(materials).forEach((m) => m.dispose());
        createdTextures.forEach((t) => t.dispose());
        if (root.parent) root.parent.remove(root);
      }

      return {
        spec: SPEC,
        obstacleSpecs,
        spawnDefinitions,
        capturePoints,
        connectionPoints,
        obstacleDefinitions,
        collisionDefinitions,
        modularGroups,
        trussGroup,
        layerVisibility,
        setLayerVisibility,
        root,
        spatialChunks,
        materials,
        isPointInPolygonXZ,
        dispose
      };
    }

