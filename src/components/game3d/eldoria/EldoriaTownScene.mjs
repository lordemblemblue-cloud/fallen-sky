import * as THREE from 'three';
import { ELDORIA_TOWN, eldoriaRiverCenterX, nearestEldoriaLandmark } from './EldoriaTownLayout.mjs';

/**
 * Optional standalone Game 3D town: original procedural authoring based on the
 * owner's Eldoria isometric reference, NOT the LAND-WS01-15 Wolfveil map.
 * Preview only: no economy, quests, NPC server authority or production collision.
 *
 * Materials are grounded, lightly painterly PBR (ceramic tile, timber, cream
 * plaster, sandstone and cherry blossoms). No thick cartoon outlines.
 */
export function createEldoriaTown(scene, { graphics = 'high' } = {}) {
  if (!scene?.add) throw Error('Eldoria needs a Three.js scene');
  const root = new THREE.Group();
  root.name = 'Eldoria_Town_Square_190x150m';
  scene.add(root);
  const materials = [];
  const geometries = [];
  const dynamic = [];
  const cameraOccluders = [];
  const m = (color, roughness = .72, opts = {}) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness, metalness: .03, ...opts });
    materials.push(result);
    return result;
  };
  const palette = {
    grass: m('#74876b', .94),
    soil: m('#897d67', .98),
    paving: m('#a7a19a', .95),
    edging: m('#756e65', .92),
    plaster: m('#d8d0bc', .88),
    ivory: m('#ece0ce', .8),
    timber: m('#43312d', .8),
    timberGold: m('#7e5541', .78),
    trim: m('#ae8b6b', .71),
    roof: m('#303a43', .53, { metalness: .12, side: THREE.DoubleSide }),
    roofLine: m('#485762', .59),
    darkStone: m('#4f575a', .94),
    stone: m('#858982', .93),
    cherry: m('#d7a2ad', .88),
    cherryLight: m('#e8bac1', .86),
    pine: m('#42584b', .91),
    pineLight: m('#5b7057', .88),
    bark: m('#514039', .96),
    paper: m('#f1ddbb', .78, { emissive: '#5b4023', emissiveIntensity: .06 }),
    fabric: m('#b8a48a', .92, { side: THREE.DoubleSide }),
    clothRed: m('#a35d55', .91, { side: THREE.DoubleSide }),
    clothBlue: m('#677b83', .93, { side: THREE.DoubleSide }),
    gold: m('#c4a06c', .4, { metalness: .35 }),
    skin: m('#d0a088', .82),
    hair: m('#292a2c', .92),
    robeA: m('#50606a', .91),
    robeB: m('#8a6559', .91),
    robeC: m('#6a7561', .91),
    riverbed: m('#394c48', .91),
  };
  const ownGeo = geo => { geometries.push(geo); return geo; };
  const add = (geo, material, parent = root, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(ownGeo(geo), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = graphics !== 'low';
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (parent, material, x, y, z, w, h, d) =>
    add(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
  const ball = (parent, material, x, y, z, w, h = w, d = w) => {
    const mesh = add(new THREE.IcosahedronGeometry(1, 1), material, parent, x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  };
  const cylinder = (parent, material, x, y, z, r1, r2, height, segments = 9) =>
    add(new THREE.CylinderGeometry(r1, r2, height, segments), material, parent, x, y, z);

  // Natural soft lawn and readable paths: all surfaces share y=0 contact.
  const ground = add(new THREE.PlaneGeometry(ELDORIA_TOWN.width, ELDORIA_TOWN.depth),
    palette.grass, root, 0, -.12, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const plaza = add(new THREE.PlaneGeometry(84, 69), palette.paving, root, -2, -.02, 7);
  plaza.rotation.x = -Math.PI / 2;
  plaza.receiveShadow = true;

  // Thin stone flag mesh (not a second movement surface).
  const paverGeo = ownGeo(new THREE.BoxGeometry(2.4, .035, 1.5));
  for (let row = 0; row < 38; row++) {
    for (let column = 0; column < 31; column++) {
      const x = -41 + row * 2.17;
      const z = -25 + column * 2.13;
      if (Math.abs(x) < 5 && Math.abs(z - 12) < 8) continue;
      // Sparse detail for a low draw-call count; no grid of individual pavers.
      if ((row * 19 + column * 13) % 11 !== 0) continue;
      const mesh = new THREE.Mesh(paverGeo, row % 2 ? palette.stone : palette.edging);
      mesh.position.set(x, -.002, z);
      mesh.scale.set(.89, 1, .78);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      root.add(mesh);
    }
  }
  for (const road of ELDORIA_TOWN.roads) {
    const mesh = add(new THREE.PlaneGeometry(road.width, road.depth),
      palette.paving, root, road.x, .006, road.z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = false;
  }
  // Low graded banks rather than steep surrounding mountains.
  for (let i = 0; i < 35; i++) {
    const a = i * 2.39996;
    const x = Math.cos(a) * (83 + (i % 4) * 2.4);
    const z = Math.sin(a) * (60 + (i % 3) * 3);
    const mound = ball(root, i % 3 === 0 ? palette.soil : palette.grass,
      x, -.8, z, 6.4 + (i % 3) * 1.5, 1.25, 4.5);
    mound.castShadow = false;
  }

  const shoji = (parent, x, y, z, w = 2.8) => {
    box(parent, palette.timber, x, y, z, w + .22, 2.05, .16);
    box(parent, palette.paper, x, y, z + .095, w - .12, 1.87, .035);
    for (let i = -1; i <= 1; i++) {
      box(parent, palette.timber, x + i * w / 3, y, z + .13, .055, 1.9, .05);
    }
    for (let j = -1; j <= 1; j++) {
      box(parent, palette.timber, x, y + j * .48, z + .14, w, .052, .05);
    }
  };

  function roofHalf(parent, width, depth, yEave, yRidge, side) {
    const halfDepth = depth / 2;
    const vertices = new Float32Array([
      -width / 2, yEave, halfDepth * side,
      width / 2, yEave, halfDepth * side,
      -width / 2, yRidge, 0,
      width / 2, yRidge, 0,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    geo.computeVertexNormals();
    add(geo, palette.roof, parent);
    const ribSegments = Math.max(6, Math.round(depth / 1.35));
    for (let i = 0; i <= ribSegments; i++) {
      const t = i / ribSegments;
      const z = side * (halfDepth * (1 - t));
      const y = yEave + (yRidge - yEave) * t + .04;
      box(parent, palette.roofLine, 0, y, z, width + .12, .065, .085);
    }
  }

  const hangingLanterns = [];
  function lantern(parent, x, y, z) {
    cylinder(parent, palette.timber, x, y + .54, z, .04, .04, .45, 6);
    const paper = cylinder(parent, palette.paper, x, y, z, .38, .32, .78, 9);
    const glow = m('#e7cfa5', .7, { emissive: '#dba776', emissiveIntensity: .38 });
    paper.material = glow;
    cylinder(parent, palette.timberGold, x, y + .41, z, .4, .38, .075, 9);
    cylinder(parent, palette.timberGold, x, y - .42, z, .4, .38, .075, 9);
    hangingLanterns.push({ material: glow, seed: x * 1.17 + z });
  }
  function signboard(parent, label, x, y, z, width) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#302722'; ctx.fillRect(0, 0, 640, 128);
    ctx.strokeStyle = '#a98151'; ctx.lineWidth = 12; ctx.strokeRect(8, 8, 624, 112);
    ctx.fillStyle = '#ead3a5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 46px Georgia, serif';
    ctx.fillText(label, 320, 66, 588);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: tex, roughness: .86 });
    materials.push(material);
    const plane = add(new THREE.PlaneGeometry(width, 1.35), material, parent, x, y, z);
    plane.castShadow = false;
  }
  function buildingMesh(b) {
    const parent = new THREE.Group();
    parent.name = 'Eldoria_' + b.id;
    parent.position.set(b.x, 0, b.z);
    root.add(parent);
    const h = b.floors === 2 ? 9.4 : 5.6;
    // Stone foot, wooden framing and pale render are weathered, not cel-shaded.
    box(parent, palette.stone, 0, .29, 0, b.width + .5, .58, b.depth + .5);
    box(parent, palette.plaster, 0, h / 2 + .45, 0, b.width, h - .3, b.depth);
    for (const x of [-b.width / 2 + .42, b.width / 2 - .42]) {
      for (const z of [-b.depth / 2 + .42, b.depth / 2 - .42])
        box(parent, palette.timber, x, h / 2 + .4, z, .54, h, .54);
    }
    for (const y of [1.0, h - .22]) {
      box(parent, palette.timber, 0, y, b.depth / 2 + .07, b.width, .37, .3);
      box(parent, palette.timber, 0, y, -b.depth / 2 - .07, b.width, .37, .3);
    }
    const doorWidth = b.kind === 'guild' ? 3.5 : 2.6;
    box(parent, palette.timber, 0, 1.75, b.depth / 2 + .23, doorWidth, 3.5, .24);
    for (let i = -1; i <= 1; i += 2) {
      box(parent, palette.trim, i * .5, 1.75, b.depth / 2 + .38, .06, 3.13, .05);
      shoji(parent, i * b.width * .30, 2.7, b.depth / 2 + .15, Math.min(3.5, b.width * .2));
    }
    if (b.floors === 2) for (const i of [-1, 0, 1])
      shoji(parent, i * b.width * .26, 6.7, b.depth / 2 + .16, 2.9);
    const eaveY = h + .6;
    roofHalf(parent, b.width + 2.5, b.depth + 2.8, eaveY, eaveY + 3.0, -1);
    roofHalf(parent, b.width + 2.5, b.depth + 2.8, eaveY, eaveY + 3.0, 1);
    box(parent, palette.roofLine, 0, eaveY + 3.06, 0, b.width + 3.2, .25, .42);
    for (const corner of [-1, 1]) {
      // Small upturned Japanese eave ends.
      const tip = box(parent, palette.roofLine, corner * (b.width / 2 + 1.4),
        eaveY + .33, b.depth / 2 + 1.5, .5, .46, .7);
      tip.rotation.z = corner * .28;
    }
    lantern(parent, -doorWidth - .7, h - 1.1, b.depth / 2 + .8);
    lantern(parent, doorWidth + .7, h - 1.1, b.depth / 2 + .8);
    if (b.kind !== 'residence') {
      signboard(parent, b.label, 0, h - 1.75, b.depth / 2 + .38,
        Math.min(b.width * .64, 13));
    }
    // AABBs are game-space contracts, *not* fake collision meshes.
    cameraOccluders.push(parent);
    return parent;
  }
  for (const item of ELDORIA_TOWN.buildings) buildingMesh(item);

  // Silk market awnings: each stall has a tangible frame and a deforming top.
  const awnings = [];
  for (const s of ELDORIA_TOWN.stalls) {
    const parent = new THREE.Group();
    parent.position.set(s.x, 0, s.z);
    parent.name = 'Eldoria_Market_' + s.id;
    root.add(parent);
    for (const x of [-2.3, 2.3]) for (const z of [-1.95, 1.95])
      cylinder(parent, palette.timberGold, x, 2.1, z, .13, .14, 4.2, 7);
    const geo = new THREE.PlaneGeometry(5.8, 5.4, 12, 8);
    geo.rotateX(-Math.PI / 2);
    const top = add(geo, s.id === 'produce-trader' ? palette.clothRed :
      s.id === 'pottery-trader' ? palette.clothBlue : palette.fabric, parent, 0, 4.25, 0);
    awnings.push({ mesh: top, initial: Float32Array.from(geo.attributes.position.array),
      phase: s.x * .07 });
    box(parent, palette.timber, 0, 1.15, -.52, 4.8, 1.2, 1.45);
    for (let i = -2; i <= 2; i++)
      ball(parent, i % 2 ? palette.gold : palette.stone, i * .82, 2, -.53, .35, .28, .32);
    lantern(parent, 0, 3.4, 2.3);
  }

  const flags = [];
  for (const [index, b] of ELDORIA_TOWN.buildings.entries()) {
    if (b.kind === 'residence') continue;
    const x = b.x + b.width / 2 + 2;
    const z = b.z + b.depth / 2 - 2;
    cylinder(root, palette.timber, x, 3, z, .09, .11, 6, 8);
    const geo = new THREE.PlaneGeometry(1.3, 3.9, 5, 16);
    const flag = add(geo, index % 2 ? palette.clothBlue : palette.clothRed,
      root, x + .73, 4.55, z);
    flags.push({ flag, initial: Float32Array.from(geo.attributes.position.array), phase: index });
  }

  function torii(x, z) {
    const group = new THREE.Group();
    group.name = 'Eldoria_Shrine_Torii';
    group.position.set(x, 0, z);
    root.add(group);
    const red = palette.clothRed;
    for (const px of [-3.2, 3.2])
      cylinder(group, red, px, 3.9, 0, .34, .4, 7.8, 10);
    box(group, red, 0, 7.55, 0, 9, .66, .9);
    const top = box(group, palette.timber, 0, 8.05, 0, 10.4, .35, 1.1);
    top.rotation.z = .012;
    box(group, red, 0, 5.65, 0, 7.3, .29, .48);
    cylinder(group, palette.gold, 0, 6.5, .46, .52, .52, .18);
  }
  for (const t of ELDORIA_TOWN.torii) torii(t.x, t.z);

  const canopies = [];
  function tree(spec, index) {
    const group = new THREE.Group();
    group.name = 'Eldoria_' + spec.kind + '_tree_' + index;
    group.position.set(spec.x, 0, spec.z);
    group.scale.setScalar(spec.size);
    root.add(group);
    const h = spec.kind === 'cherry' ? 8.2 : 10;
    const trunk = cylinder(group, palette.bark, 0, h * .34, 0, .42, .8, h * .68, 8);
    trunk.rotation.z = (index % 3 - 1) * .06;
    const crown = new THREE.Group();
    crown.position.y = h * .71;
    group.add(crown);
    if (spec.kind === 'cherry') {
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI * 2 / 8;
        const r = j % 3 === 0 ? 2.6 : 1.85;
        ball(crown, j % 2 ? palette.cherryLight : palette.cherry,
          Math.cos(a) * r, Math.sin(a * 1.4) * .35, Math.sin(a) * r,
          2.4, 1.85, 2.15);
      }
      ball(crown, palette.cherryLight, 0, 1, 0, 2.7, 2, 2.45);
    } else {
      for (let tier = 0; tier < 3; tier++) {
        const level = -.9 + tier * 2;
        for (let j = 0; j < 4; j++) {
          const a = j * Math.PI / 2 + .4;
          ball(crown, (tier + j) % 2 ? palette.pine : palette.pineLight,
            Math.cos(a) * (2.25 - tier * .35), level,
            Math.sin(a) * (2.25 - tier * .35), 2.1 - tier * .2, 1.15, 1.7);
        }
      }
    }
    canopies.push({ group: crown, phase: index * 1.17, size: spec.size });
  }
  ELDORIA_TOWN.trees.forEach(tree);

  // Silver-blue moving stream on the east edge. Rendering waves do not change
  // the authoritative walk/collision geometry; the bank remains solid.
  const waterGeo = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];
  const widthSections = 12;
  const lengthSections = 64;
  for (let i = 0; i <= lengthSections; i++) {
    const z = 13 + i * (62 / lengthSections);
    const center = eldoriaRiverCenterX(z);
    for (let j = 0; j <= widthSections; j++) {
      const u = j / widthSections;
      positions.push(center + (u - .5) * 11.6, .045, z);
    }
  }
  for (let i = 0; i < lengthSections; i++) for (let j = 0; j < widthSections; j++) {
    const a = i * (widthSections + 1) + j;
    indices.push(a, a + 1, a + widthSections + 1,
      a + 1, a + widthSections + 2, a + widthSections + 1);
  }
  waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  waterGeo.setIndex(indices); waterGeo.computeVertexNormals();
  const water = new THREE.Mesh(ownGeo(waterGeo), new THREE.MeshPhysicalMaterial({
    color: '#75b9c2', roughness: .17, metalness: .16, transparent: true,
    opacity: .86, clearcoat: .88, clearcoatRoughness: .12, side: THREE.DoubleSide,
  }));
  materials.push(water.material);
  water.name = 'Eldoria_Animated_Stream';
  water.receiveShadow = true;
  root.add(water);
  const waterBase = Float32Array.from(waterGeo.attributes.position.array);
  for (let i = 0; i < 26; i++) {
    const z = 15 + i * 2.45;
    const x = eldoriaRiverCenterX(z);
    for (const side of [-1, 1]) {
      const stone = ball(root, i % 4 ? palette.stone : palette.darkStone,
        x + side * (6.8 + .8 * Math.sin(i)), .35, z, .75, .42, .95);
      stone.rotation.y = (i * .4) % Math.PI;
      stone.castShadow = false;
    }
  }

  // Character-like townfolk: light procedural actor placeholders. Preview code
  // can replace these with authored skinned GLB + locomotion clips; no claim
  // of production skeletal animation or multiplayer NPC AI.
  const residents = [];
  function resident(route, index) {
    const node = new THREE.Group();
    node.name = 'Eldoria_Resident_Proxy_' + index;
    node.position.set(route[0].x, 0, route[0].z);
    root.add(node);
    const color = index % 3 === 0 ? palette.robeA :
      index % 3 === 1 ? palette.robeB : palette.robeC;
    const torso = cylinder(node, color, 0, 1.13, 0, .36, .53, 1.12, 9);
    torso.rotation.x = -.02;
    ball(node, palette.skin, 0, 2.07, 0, .30, .38, .3);
    ball(node, palette.hair, 0, 2.34, -.05, .31, .21, .3);
    const limbs = [];
    for (const side of [-1, 1]) {
      const arm = cylinder(node, color, side * .47, 1.23, 0, .17, .18, .93, 7);
      arm.position.x = side * .48;
      const leg = cylinder(node, palette.timber, side * .23, .39, 0, .17, .2, .75, 7);
      limbs.push({ arm, leg, side });
    }
    residents.push({ node, route, index, segment: 0, t: index * .12 % 1,
      speed: .84 + index * .095, limbs, phase: index * .8 });
  }
  ELDORIA_TOWN.residentRoutes.forEach(resident);

  // Floating petals, softly animated: visual only; no rigid-body debris.
  const petalsCount = graphics === 'low' ? 45 : 110;
  const petals = new THREE.BufferGeometry();
  const p = new Float32Array(petalsCount * 3);
  for (let i = 0; i < petalsCount; i++) {
    const seed = (i * 7919 % 1033) / 1033;
    p[i * 3] = -60 + (i * 31 % 120);
    p[i * 3 + 1] = 1.2 + seed * 9;
    p[i * 3 + 2] = -50 + (i * 67 % 112);
  }
  petals.setAttribute('position', new THREE.BufferAttribute(p, 3));
  ownGeo(petals);
  const petalMat = new THREE.PointsMaterial({ color: '#f3cbd1', size: .21, sizeAttenuation: true,
    transparent: true, opacity: .74, depthWrite: false });
  materials.push(petalMat);
  const floating = new THREE.Points(petals, petalMat);
  floating.name = 'Eldoria_Windborne_Cherry_Petals';
  root.add(floating);
  const basePetals = Float32Array.from(p);

  let elapsed = 0;
  const clockScratch = new THREE.Vector3();
  function update(delta = 0) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.1, delta)) : 0;
    elapsed += dt;
    for (const { mesh, initial, phase } of awnings) {
      const values = mesh.geometry.attributes.position;
      for (let i = 0; i < values.count; i++) {
        values.setY(i, initial[i * 3 + 1] +
          .09 * Math.sin(elapsed * 1.7 + initial[i * 3] * 1.1 + phase));
      }
      values.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
    for (const { flag, initial, phase } of flags) {
      const values = flag.geometry.attributes.position;
      for (let i = 0; i < values.count; i++) {
        values.setZ(i, initial[i * 3 + 2] +
          (initial[i * 3] + .65) * .19 * Math.sin(elapsed * 2.4 + phase + initial[i * 3 + 1]));
      }
      values.needsUpdate = true;
      flag.geometry.computeVertexNormals();
    }
    for (const item of canopies) {
      item.group.rotation.z = .028 * Math.sin(elapsed * .83 + item.phase);
      item.group.rotation.x = .017 * Math.cos(elapsed * .7 + item.phase);
    }
    for (const item of hangingLanterns)
      item.material.emissiveIntensity = .32 + .045 * Math.sin(elapsed * 2.1 + item.seed);
    const waterPosition = water.geometry.attributes.position;
    for (let i = 0; i < waterPosition.count; i++) {
      const x = waterBase[3 * i], z = waterBase[3 * i + 2];
      waterPosition.setY(i, .045 + .045 * Math.sin(z * 1.25 - elapsed * 3.1 + x * .31));
    }
    waterPosition.needsUpdate = true;
    if (graphics !== 'low') water.geometry.computeVertexNormals();
    for (const entry of residents) {
      const { route, node, index, speed, limbs } = entry;
      const a = route[entry.segment];
      const b = route[(entry.segment + 1) % route.length];
      const dist = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      entry.t += speed * dt / dist;
      while (entry.t >= 1) {
        entry.t -= 1;
        entry.segment = (entry.segment + 1) % route.length;
      }
      const from = route[entry.segment];
      const to = route[(entry.segment + 1) % route.length];
      node.position.set(
        THREE.MathUtils.lerp(from.x, to.x, entry.t), 0,
        THREE.MathUtils.lerp(from.z, to.z, entry.t),
      );
      // Front of model points +Z; point into the path.
      const targetYaw = Math.atan2(to.x - from.x, to.z - from.z);
      const yawDelta = Math.atan2(Math.sin(targetYaw - node.rotation.y),
        Math.cos(targetYaw - node.rotation.y));
      node.rotation.y += yawDelta * Math.min(1, dt * 6);
      const gait = elapsed * (4.2 + speed);
      for (const { arm, leg, side } of limbs) {
        arm.rotation.x = side * Math.sin(gait + index) * .38;
        leg.rotation.x = -side * Math.sin(gait + index) * .3;
      }
      node.position.y = Math.abs(Math.sin(gait + index)) * .018;
    }
    const petalsPositions = petals.attributes.position;
    for (let i = 0; i < petalsCount; i++) {
      const x = basePetals[i * 3], y = basePetals[i * 3 + 1], z = basePetals[i * 3 + 2];
      petalsPositions.setXYZ(i,
        x + Math.sin(elapsed * .48 + i * .3) * 2.2,
        .2 + ((y - elapsed * (.21 + i % 4 * .032)) % 10 + 10) % 10,
        z + Math.sin(elapsed * .3 + i) * 2.7);
    }
    petalsPositions.needsUpdate = true;
    return elapsed;
  }
  function dispose() {
    scene.remove(root);
    for (const geo of new Set(geometries)) geo.dispose();
    for (const mat of new Set(materials)) {
      mat.map?.dispose?.();
      mat.dispose();
    }
  }
  return {
    root, scene, layout: ELDORIA_TOWN, cameraOccluders,
    dynamicObjects: { water, residents: residents.map(item => item.node) },
    update, dispose, nearestLandmark: nearestEldoriaLandmark,
  };
}
