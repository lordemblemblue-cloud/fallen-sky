/* global document */
// A mission's rooms, drawn from its level (sim/level.mjs): deck plates, bulkhead walls with a line of light,
// freight doors that sink into the floor (red shut, green open), crates and furniture as cover, and what the
// crew uses: marked crates that open, a door control, ledger cores, warning bells, the ring where the crew
// holds, objective beacons. In a lockdown the lights turn red. The mission's theme dresses it: the depot's
// steel and cyan light, or the refuge's salt-stone, flagstones and lamplight. Original and procedural (the few textures are painted on canvases here).
// It stands where the arena does in the game view: group, arc() (Telekinesis lights the deck seams), update,
// dispose; plus cameraBlockers() so the follow camera stays inside the room.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOOR_VERTEX, WAVE_GLSL, createFloorWaves } from './arena.mjs';
import { setNodeTwin } from '../../../lib/webgpuMaterialTwins.js';
import { depotOverlayTwin, depotCeilingTwin } from './duelistNodes.mjs';

export const DEPOT = Object.freeze({ height: 4.2, cover: 1.5 });
const H = DEPOT.height;
const COLORS = Object.freeze({ closed: 0xe8453a, open: 0x2fbf86, trim: 0x2aa9cf, alarm: 0xff2a1a, mark: 0xffb347, core: 0xffc45a, beacon: 0xffd98a });
// How a mission's rooms are dressed (its `theme`).
const THEMES = Object.freeze({
  depot: { floor: 'plates', wall: 'bulkhead', door: 'door', trim: 0x2aa9cf, background: 0x070b12, fog: [30, 110], hemi: 1.05, sun: 1.6, sunColor: 0xe6eeff, rim: 0.7,
    deck: { metalness: 0.35, roughness: 0.52 }, walls: { metalness: 0.5, roughness: 0.62 }, lamp: [0.75, 0.9, 1.0], ceiling: [0.022, 0.028, 0.04], waves: 0x9fe6ff },
  refuge: { floor: 'flags', wall: 'stone', door: 'gate', trim: 0xffa64d, background: 0x0d0b09, fog: [26, 95], hemi: 0.95, sun: 1.25, sunColor: 0xffe2c0, rim: 0.35,
    deck: { metalness: 0.04, roughness: 0.9 }, walls: { metalness: 0.03, roughness: 0.93 }, lamp: [1.0, 0.72, 0.42], ceiling: [0.034, 0.027, 0.021], waves: 0xffd9a0 },
});

const OVERLAY_FRAGMENT = /* glsl */`
  uniform float uTime; uniform vec4 uLift; uniform float uLiftFill; uniform float uAlarm;
  ${WAVE_GLSL}
  varying vec2 vXZ;
  void main() {
    // the deck's seams (2 m plates) carry the light
    vec2 f = abs(fract(vXZ / 2.0) - 0.5);
    float seam = smoothstep(0.46, 0.495, max(f.x, f.y));
    vec3 c = uWaveColor * floorWave(vXZ) * (0.12 + seam * 1.7);
    // the cargo lift: its hold ring (it fills while the lift powers up) and the pad's hazard marks
    vec2 dv = vXZ - uLift.xy;
    float dl = length(dv);
    float ring = smoothstep(uLift.z - 0.2, uLift.z - 0.1, dl) * (1.0 - smoothstep(uLift.z, uLift.z + 0.1, dl));
    float turn = atan(dv.x, dv.y) / 6.2831853 + 0.5;
    float pad = smoothstep(1.9, 2.0, dl) * (1.0 - smoothstep(2.4, 2.5, dl)) * step(0.5, fract(turn * 24.0));
    float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
    vec3 hazard = vec3(1.0, 0.7, 0.2);
    c += hazard * (ring * (0.3 + uLift.w * (0.4 + 0.6 * pulse) + step(turn, uLiftFill) * uLift.w * 1.4) + pad * 0.45);
    c += hazard * uLift.w * (1.0 - smoothstep(0.0, uLift.z, dl)) * 0.05 * (1.0 + pulse);
    c += vec3(1.0, 0.1, 0.06) * uAlarm * seam * (0.25 + 0.5 * (0.5 + 0.5 * sin(uTime * 6.0)));
    gl_FragColor = vec4(c, 1.0);
  }`;
const CEILING_FRAGMENT = /* glsl */`
  uniform float uTime; uniform float uAlarm; uniform vec3 uBase; uniform vec3 uLamp;
  varying vec2 vXZ;
  void main() {
    vec3 c = uBase;
    vec2 f = abs(fract(vXZ / 4.0) - 0.5);
    c += uBase * 0.9 * smoothstep(0.44, 0.5, max(f.x, f.y)); // beams
    // strips of light along the rooms, broken into lengths
    float row = abs(fract(vXZ.y / 8.0) - 0.5);
    float strip = (1.0 - smoothstep(0.02, 0.035, row)) * step(0.25, fract(vXZ.x / 4.0));
    vec3 lamp = mix(uLamp, vec3(1.0, 0.12, 0.08) * (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 6.0))), uAlarm);
    gl_FragColor = vec4(c + lamp * strip * 1.5, 1.0);
  }`;

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
const frame = (g, s, { base, dark, light, inset = 5 }) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  g.strokeStyle = dark; g.lineWidth = inset; g.strokeRect(0, 0, s, s);
  g.strokeStyle = light; g.lineWidth = 1.5; g.strokeRect(inset - 0.5, inset - 0.5, s - inset * 2 + 1, s - inset * 2 + 1);
};
const SKINS = {
  plates(g, s) {
    frame(g, s, { base: '#2a3546', dark: '#0d1219', light: '#42536b' });
    g.strokeStyle = '#34425a'; g.lineWidth = 1;
    for (let i = s / 8; i < s; i += s / 8) { g.beginPath(); g.moveTo(i, 8); g.lineTo(i, s - 8); g.stroke(); }
  },
  bulkhead(g, s) {
    frame(g, s, { base: '#465672', dark: '#161d29', light: '#6a7c9a', inset: 6 });
    g.fillStyle = '#394861'; g.fillRect(14, s * 0.62, s - 28, s * 0.2); // a recessed band
    g.fillStyle = '#7d8fae';
    for (const [x, y] of [[13, 13], [s - 13, 13], [13, s - 13], [s - 13, s - 13]]) { g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill(); }
  },
  crate(g, s) {
    frame(g, s, { base: '#8792a3', dark: '#3c4553', light: '#aab4c4', inset: 12 });
    g.strokeStyle = '#59647a'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(12, 12); g.lineTo(s - 12, s - 12); g.moveTo(s - 12, 12); g.lineTo(12, s - 12); g.stroke();
    g.strokeStyle = '#3c4553'; g.lineWidth = 10; g.strokeRect(6, 6, s - 12, s - 12);
  },
  // what glows on a marked crate: a band and a broken-diamond stencil
  mark(g, s) {
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff'; g.fillRect(14, s * 0.2, s - 28, 7);
    g.strokeStyle = '#fff'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(s / 2, s * 0.42); g.lineTo(s * 0.68, s * 0.6); g.lineTo(s / 2, s * 0.78); g.lineTo(s * 0.32, s * 0.6); g.closePath(); g.stroke();
  },
  door(g, s) {
    frame(g, s, { base: '#2a3444', dark: '#0b0f16', light: '#43536d', inset: 6 });
    g.fillStyle = '#10151d'; g.fillRect(s / 2 - 1.5, 6, 3, s - 12); // where the two leaves meet
    // hazard stripes along the foot
    g.save(); g.beginPath(); g.rect(6, s * 0.84, s - 12, s * 0.11); g.clip();
    for (let i = -s; i < s * 2; i += 20) { g.fillStyle = '#d8a52a'; g.beginPath(); g.moveTo(i, s); g.lineTo(i + 10, s); g.lineTo(i + 30, s * 0.8); g.lineTo(i + 20, s * 0.8); g.fill(); }
    g.restore();
  },
  // rows of lit slots (a data stack), a screen's lines, a tool rack's lamps
  slots(g, s) {
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
    for (let y = 14; y < s - 10; y += 15) for (let x = 12; x < s - 12; x += 13) { g.fillStyle = (x * 7 + y * 3) % 5 === 0 ? '#555' : '#fff'; g.fillRect(x, y, 8, 3); }
  },
  screen(g, s) {
    g.fillStyle = '#111'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff';
    for (let y = 18; y < s - 14; y += 11) g.fillRect(12, y, 20 + ((y * 37) % (s - 50)), 3);
  },
  lamps(g, s) {
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff'; g.fillRect(10, s * 0.72, s - 20, 5);
    for (let x = 16; x < s - 12; x += 22) g.fillRect(x, s * 0.3, 10, 10);
  },
  // the refuge: salt-stone in courses, flagstones, an iron-bound gate
  stone(g, s) {
    g.fillStyle = '#4a443c'; g.fillRect(0, 0, s, s); // the mortar
    const h = s / 4;
    for (let r = 0; r < 4; r++) {
      const shift = r % 2 ? s / 4 : 0;
      for (let x = -shift; x < s; x += s / 2) {
        const tone = 128 + ((r * 41 + Math.round(x + shift) * 7) % 34);
        g.fillStyle = `rgb(${tone + 26}, ${tone + 16}, ${tone + 2})`;
        g.fillRect(x + 2, r * h + 2, s / 2 - 4, h - 4);
      }
    }
  },
  flags(g, s) {
    g.fillStyle = '#3a342d'; g.fillRect(0, 0, s, s);
    [[0, 0, 0.55, 0.45], [0.55, 0, 0.45, 0.6], [0, 0.45, 0.35, 0.55], [0.35, 0.45, 0.2, 0.55], [0.55, 0.6, 0.45, 0.4]].forEach(([x, y, w, h], i) => {
      const tone = 96 + i * 9;
      g.fillStyle = `rgb(${tone + 20}, ${tone + 12}, ${tone})`;
      g.fillRect(x * s + 2, y * s + 2, w * s - 4, h * s - 4);
    });
  },
  gate(g, s) {
    g.fillStyle = '#4b3424'; g.fillRect(0, 0, s, s); // planks
    g.strokeStyle = '#2e1f14'; g.lineWidth = 2;
    for (let x = s / 6; x < s; x += s / 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
    g.fillStyle = '#2b2b2e'; // iron bands and their studs
    for (const y of [s * 0.18, s * 0.72]) {
      g.fillRect(0, y, s, 9);
      g.fillStyle = '#8a8a90';
      for (let x = 8; x < s; x += 18) { g.beginPath(); g.arc(x, y + 4.5, 2, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#2b2b2e';
    }
  },
};

// a box from (x0, z0)-(x1, z1) between two heights, its texture laid out in metres (tile metres to a repeat)
function boxGeometry(b, y0, y1, tile = 2) {
  const w = b.x1 - b.x0;
  const h = y1 - y0;
  const d = b.z1 - b.z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x, -x, +y, -y, +z, -z: four corners each
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, (uv.getX(k) * faces[f][0]) / tile, (uv.getY(k) * faces[f][1]) / tile); }
  }
  g.translate((b.x0 + b.x1) / 2, (y0 + y1) / 2, (b.z0 + b.z1) / 2);
  return g;
}
const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
const inside = (b, p) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1;

/**
 * level: the mission's level (walls, cover with an optional `style`, doors); def: the mission (interactables
 * with a `kind`, the lift, level.lights). scene and lights (arena.mjs createSceneLighting) are dressed for
 * indoors.
 */
export function createDepot({ level, def, scene = null, lights = null }) {
  const group = new THREE.Group();
  group.name = 'Depot';
  const theme = THEMES[def.theme] || THEMES.depot;
  const refuge = def.theme === 'refuge';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const tex = Object.fromEntries(Object.entries(SKINS).map(([name, draw]) => [name, keep(canvasTexture(128, draw))]));
  const bounds = level.bounds || { x0: -30, x1: 30, z0: -30, z1: 30 };
  const width = bounds.x1 - bounds.x0;
  const depth = bounds.z1 - bounds.z0;
  const centre = { x: (bounds.x0 + bounds.x1) / 2, z: (bounds.z0 + bounds.z1) / 2 };
  if (scene) {
    scene.background = new THREE.Color(theme.background);
    scene.fog = new THREE.Fog(theme.background, theme.fog[0], theme.fog[1]);
  }
  if (lights) {
    lights.hemi.intensity = theme.hemi;
    lights.sun.intensity = theme.sun;
    lights.sun.color.setHex(theme.sunColor);
    lights.rimLight.intensity = theme.rim;
  }

  // ---- the deck, its lit overlay, the ceiling
  const waves = createFloorWaves({ color: theme.waves });
  const flat = (y, up = true) => {
    const g = keep(new THREE.PlaneGeometry(width, depth).rotateX(up ? -Math.PI / 2 : Math.PI / 2).translate(centre.x, y, centre.z));
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
    return g;
  };
  const deck = new THREE.Mesh(flat(0), keep(new THREE.MeshStandardMaterial({ map: tex[theme.floor], ...theme.deck })));
  deck.receiveShadow = true;
  group.add(deck);
  const overlayUniforms = { uTime: { value: 0 }, uLift: { value: new THREE.Vector4(0, 0, 4.5, 0) }, uLiftFill: { value: 0 }, uAlarm: { value: 0 }, ...waves.uniforms };
  const overlay = new THREE.Mesh(flat(0.006), keep(setNodeTwin(new THREE.ShaderMaterial({ vertexShader: FLOOR_VERTEX, fragmentShader: OVERLAY_FRAGMENT, uniforms: overlayUniforms,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), depotOverlayTwin)));
  group.add(overlay);
  const ceilingUniforms = { uTime: { value: 0 }, uAlarm: { value: 0 }, uBase: { value: new THREE.Vector3(...theme.ceiling) }, uLamp: { value: new THREE.Vector3(...theme.lamp) } };
  group.add(new THREE.Mesh(flat(H, false), keep(setNodeTwin(new THREE.ShaderMaterial({ vertexShader: FLOOR_VERTEX, fragmentShader: CEILING_FRAGMENT, uniforms: ceilingUniforms }), depotCeilingTwin))));

  // ---- walls, with a line of light at chest height; the vault's pillars
  const wallMaterial = keep(new THREE.MeshStandardMaterial({ map: tex[theme.wall], ...theme.walls }));
  const trimMaterial = keep(new THREE.MeshBasicMaterial({ color: theme.trim }));
  const trimColor = new THREE.Color(theme.trim);
  const alarmColor = new THREE.Color(COLORS.alarm);
  const pillars = level.cover.filter((b) => b.style === 'pillar');
  const strip = (x0, x1, z0, z1) => boxGeometry({ x0, x1, z0, z1 }, 1.05, 1.11);
  const around = (b, t = 0.012) => (b.x1 - b.x0 >= b.z1 - b.z0
    ? [strip(b.x0, b.x1, b.z0 - t, b.z0), strip(b.x0, b.x1, b.z1, b.z1 + t)]
    : [strip(b.x0 - t, b.x0, b.z0, b.z1), strip(b.x1, b.x1 + t, b.z0, b.z1)]);
  const merged = (list, material, { receive = true } = {}) => {
    if (!list.length) return null;
    const mesh = new THREE.Mesh(keep(mergeGeometries(list)), material);
    list.forEach((g) => g.dispose());
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  };
  merged([...level.walls, ...pillars].map((b) => boxGeometry(b, 0, H)), wallMaterial);
  merged([
    ...level.walls.flatMap((b) => around(b)),
    ...pillars.flatMap((b) => [strip(b.x0, b.x1, b.z0 - 0.012, b.z0), strip(b.x0, b.x1, b.z1, b.z1 + 0.012), strip(b.x0 - 0.012, b.x0, b.z0, b.z1), strip(b.x1, b.x1 + 0.012, b.z0, b.z1)]),
  ], trimMaterial, { receive: false });

  // ---- doors: a slab that sinks into the floor, bars of light across it and a strip of light on the wall either side
  const doorMaterial = keep(new THREE.MeshStandardMaterial({ map: tex[theme.door], metalness: refuge ? 0.2 : 0.6, roughness: refuge ? 0.75 : 0.45 }));
  const doors = [...level.doors.values()].map((d) => {
    const alongX = d.x1 - d.x0 >= d.z1 - d.z0;
    const cx = (d.x0 + d.x1) / 2;
    const cz = (d.z0 + d.z1) / 2;
    const t = 0.18; // the slab sits back from the wall's faces
    const box = alongX ? { x0: d.x0, x1: d.x1, z0: cz - t, z1: cz + t } : { x0: cx - t, x1: cx + t, z0: d.z0, z1: d.z1 };
    const slabGeometry = keep(new THREE.BoxGeometry(box.x1 - box.x0, H, box.z1 - box.z0));
    slabGeometry.translate(cx, H / 2, cz);
    const slab = new THREE.Mesh(slabGeometry, doorMaterial);
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
    const material = keep(new THREE.MeshBasicMaterial({ color: d.open ? COLORS.open : COLORS.closed }));
    const bar = (y) => (alongX
      ? [boxGeometry({ x0: d.x0 + 0.3, x1: d.x1 - 0.3, z0: cz - t - 0.012, z1: cz - t }, y, y + 0.07), boxGeometry({ x0: d.x0 + 0.3, x1: d.x1 - 0.3, z0: cz + t, z1: cz + t + 0.012 }, y, y + 0.07)]
      : [boxGeometry({ x0: cx - t - 0.012, x1: cx - t, z0: d.z0 + 0.3, z1: d.z1 - 0.3 }, y, y + 0.07), boxGeometry({ x0: cx + t, x1: cx + t + 0.012, z0: d.z0 + 0.3, z1: d.z1 - 0.3 }, y, y + 0.07)]);
    const barList = [...bar(2.05), ...bar(2.3)];
    slab.add(new THREE.Mesh(keep(mergeGeometries(barList)), material));
    barList.forEach((g) => g.dispose());
    const postList = alongX
      ? [d.x0 - 0.07, d.x1 + 0.02].flatMap((x) => [boxGeometry({ x0: x, x1: x + 0.05, z0: d.z0 - 0.014, z1: d.z0 }, 0, H), boxGeometry({ x0: x, x1: x + 0.05, z0: d.z1, z1: d.z1 + 0.014 }, 0, H)])
      : [d.z0 - 0.07, d.z1 + 0.02].flatMap((z) => [boxGeometry({ x0: d.x0 - 0.014, x1: d.x0, z0: z, z1: z + 0.05 }, 0, H), boxGeometry({ x0: d.x1, x1: d.x1 + 0.014, z0: z, z1: z + 0.05 }, 0, H)]);
    group.add(new THREE.Mesh(keep(mergeGeometries(postList)), material));
    postList.forEach((g) => g.dispose());
    const drop = d.open ? H + 0.1 : 0;
    slab.position.y = -drop;
    slab.visible = !d.open;
    return { id: d.id, slab, material, open: !!d.open, drop, at: new THREE.Vector3(cx, 1.4, cz) };
  });

  // ---- cover: crates on the dock, each room's own furniture
  const geometries = new Map();
  const boxOf = (w, h, d) => {
    const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
    if (!geometries.has(key)) geometries.set(key, keep(new THREE.BoxGeometry(w, h, d)));
    return geometries.get(key);
  };
  const prop = (b, y0, y1, material, parent = group) => {
    const mesh = new THREE.Mesh(boxOf(b.x1 - b.x0, y1 - y0, b.z1 - b.z0), material);
    mesh.position.set((b.x0 + b.x1) / 2, (y0 + y1) / 2, (b.z0 + b.z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const standard = (options) => keep(new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.55, ...options }));
  const mats = {
    crateA: standard({ map: tex.crate, color: refuge ? 0x8a7a62 : 0x6f7d92 }),
    crateB: standard({ map: tex.crate, color: refuge ? 0x6e604c : 0x8a7f6a }),
    wood: standard({ color: 0x6b4a2e, metalness: 0.02, roughness: 0.85 }),
    cloth: standard({ color: 0x8a8070, metalness: 0, roughness: 0.95 }),
    books: standard({ color: 0x3a2a1c, emissiveMap: tex.slots, emissive: 0xffb060, emissiveIntensity: 0.35, metalness: 0.02, roughness: 0.8 }),
    lid: standard({ map: tex.crate, color: 0x59657a }),
    bench: standard({ map: tex.bulkhead, color: 0xa89c90, metalness: 0.3, roughness: 0.5 }),
    rack: standard({ map: tex.bulkhead, color: 0x6a625c, emissiveMap: tex.lamps, emissive: 0xff9440, emissiveIntensity: 1.6 }),
    desk: standard({ color: 0x3a2b26, metalness: 0.15, roughness: 0.45 }),
    glass: standard({ color: 0x241a38, emissiveMap: tex.screen, emissive: 0xb48cff, emissiveIntensity: 1.1, metalness: 0.2, roughness: 0.2 }),
    console: standard({ map: tex.bulkhead, color: 0x8c96a6, metalness: 0.35, roughness: 0.45 }),
    monitor: standard({ color: 0x1a1216, emissiveMap: tex.screen, emissive: 0xff7a6a, emissiveIntensity: 1.3, roughness: 0.25 }),
    shelf: standard({ color: 0x1a2230, emissiveMap: tex.slots, emissive: 0x5fa8ff, emissiveIntensity: 1.25, metalness: 0.5, roughness: 0.4 }),
  };
  const lowCover = [];
  const uses = []; // what the crew can use: { id, ring, update(dt, on, done, time) }
  const useRing = (x, z, radius) => {
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(radius - 0.07, radius, 56)),
      keep(new THREE.MeshBasicMaterial({ color: COLORS.mark, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    ring.visible = false;
    group.add(ring);
    return ring;
  };
  let cratesOpened = 0;
  const markedCrate = (b, it) => {
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const top = DEPOT.cover - 0.14;
    const material = standard({ map: tex.crate, color: 0x77839a, emissiveMap: tex.mark, emissive: COLORS.mark, emissiveIntensity: 0.9 });
    prop(b, 0, top, material);
    // the lid, hinged along one edge
    const hinge = new THREE.Group();
    hinge.position.set(cx, top, b.z0);
    const lid = new THREE.Mesh(boxOf(w + 0.04, 0.14, d + 0.04), mats.lid);
    lid.position.set(0, 0.07, d / 2);
    lid.castShadow = true;
    hinge.add(lid);
    group.add(hinge);
    const glowMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0 }));
    const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(w - 0.24, d - 0.24)), glowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(cx, top + 0.006, cz);
    group.add(glow);
    let open = 0;
    let order = 0;
    uses.push({
      id: it.id, ring: useRing(cx, cz, Math.max(w, d) / 2 + 0.75),
      update(dt, on, done, time) {
        if (done && !order) { cratesOpened += 1; order = cratesOpened; glowMaterial.color.setHex(order >= 3 ? 0xff5a3a : 0x9fb4c8); }
        open += ((done ? 1 : 0) - open) * Math.min(1, dt * 5);
        hinge.rotation.x = -1.9 * open;
        glowMaterial.opacity = open * (order >= 3 ? 0.95 : 0.4);
        material.emissiveIntensity = done ? 0.12 : on ? 1.2 + 0.8 * Math.sin(time * 4) : 0.5;
      },
    });
  };
  const crateUses = def.interactables.filter((it) => it.kind === 'crate');
  for (const b of level.cover) {
    if (b.style === 'pillar') continue;
    lowCover.push(b);
    const use = crateUses.find((it) => inside(b, it));
    if (use) { markedCrate(b, use); continue; }
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const inset = (box, by) => ({ x0: box.x0 + by, x1: box.x1 - by, z0: box.z0 + by, z1: box.z1 - by });
    if (b.style === 'bench' && refuge) {
      // a bunk: two beds, four posts
      prop(b, 0, 0.42, mats.wood); prop(inset(b, 0.06), 0.42, 0.56, mats.cloth);
      prop(b, 1.08, 1.28, mats.wood); prop(inset(b, 0.06), 1.28, 1.4, mats.cloth);
      for (const [x, z] of [[b.x0, b.z0], [b.x1 - 0.1, b.z0], [b.x0, b.z1 - 0.1], [b.x1 - 0.1, b.z1 - 0.1]]) prop({ x0: x, x1: x + 0.1, z0: z, z1: z + 0.1 }, 0, DEPOT.cover, mats.wood);
    } else if (b.style === 'desk' && refuge) {
      // a long table, sacks of salt piled on it
      prop(b, 0, 0.8, mats.wood); prop({ ...inset(b, 0.12), x1: (b.x0 + b.x1) / 2 + 0.2 }, 0.8, DEPOT.cover - 0.1, mats.cloth);
    } else if (b.style === 'shelf' && refuge) prop(b, 0, DEPOT.cover + 0.6, mats.books); // the refuge's records
    else if (b.style === 'bench') { prop(b, 0, 0.95, mats.bench); prop({ ...b, z1: b.z0 + 0.45 }, 0.95, DEPOT.cover, mats.rack); }
    else if (b.style === 'desk') { prop(b, 0, 0.85, mats.desk); prop({ ...b, z0: b.z1 - 0.1 }, 0.85, DEPOT.cover, mats.glass); }
    else if (b.style === 'console') { prop(b, 0, 1, mats.console); prop({ x0: b.x0 + 0.08, x1: b.x1 - 0.08, z0: b.z0, z1: b.z0 + 0.14 }, 1, DEPOT.cover, mats.monitor); }
    else if (b.style === 'shelf') prop(b, 0, DEPOT.cover, mats.shelf);
    else prop(b, 0, DEPOT.cover, hash(cx, cz) > 0.5 ? mats.crateA : mats.crateB);
  }

  // ---- a door control (a kiosk with a screen) and the ledger cores (a crystal over a ring, caged until it can be taken)
  for (const it of def.interactables) {
    if (it.kind === 'terminal') {
      prop({ x0: it.x - 0.13, x1: it.x + 0.13, z0: it.z - 0.13, z1: it.z + 0.13 }, 0, 1.05, mats.console);
      const material = keep(new THREE.MeshBasicMaterial({ color: COLORS.closed }));
      const screen = new THREE.Mesh(boxOf(0.66, 0.42, 0.05), material);
      screen.position.set(it.x, 1.22, it.z);
      screen.rotation.order = 'YXZ';
      screen.rotation.set(-0.5, it.facing ?? 0, 0);
      group.add(screen);
      uses.push({
        id: it.id, ring: useRing(it.x, it.z, 1),
        update(dt, on, done, time) { material.color.setHex(done ? COLORS.open : on && Math.sin(time * 6) > 0 ? COLORS.mark : COLORS.closed); },
      });
    } else if (it.kind === 'core') {
      const material = keep(new THREE.MeshStandardMaterial({ color: 0x5a4320, emissive: COLORS.core, emissiveIntensity: 0.25, flatShading: true, roughness: 0.25 }));
      const crystal = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.2)), material);
      crystal.scale.y = 1.5;
      crystal.position.set(it.x, 1.2, it.z);
      crystal.castShadow = true;
      group.add(crystal);
      const cage = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.44, 0)), keep(new THREE.MeshBasicMaterial({ color: COLORS.closed, wireframe: true, transparent: true, opacity: 0.55 })));
      cage.position.copy(crystal.position);
      group.add(cage);
      const plinth = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.5, 0.6, 0.12, 8)), mats.console);
      plinth.position.set(it.x, 0.06, it.z);
      plinth.receiveShadow = true;
      group.add(plinth);
      uses.push({
        id: it.id, ring: useRing(it.x, it.z, 1),
        update(dt, on, done, time) {
          crystal.visible = !done;
          cage.visible = !done && !on;
          crystal.rotation.y += dt * (on ? 1.8 : 0.4);
          cage.rotation.y -= dt * 0.5;
          crystal.position.y = 1.2 + (on ? 0.06 * Math.sin(time * 2.4) : 0);
          material.emissiveIntensity = on ? 1.6 + 0.6 * Math.sin(time * 5) : 0.25;
        },
      });
    } else if (it.kind === 'bell') {
      // a warning bell in a wooden frame: it swings while it is rung, and glows once it has been
      for (const dx of [-0.45, 0.37]) prop({ x0: it.x + dx, x1: it.x + dx + 0.08, z0: it.z - 0.04, z1: it.z + 0.04 }, 0, 2.4, mats.wood);
      prop({ x0: it.x - 0.5, x1: it.x + 0.5, z0: it.z - 0.05, z1: it.z + 0.05 }, 2.32, 2.44, mats.wood);
      const yoke = new THREE.Group();
      yoke.position.set(it.x, 2.32, it.z);
      group.add(yoke);
      const bronze = keep(new THREE.MeshStandardMaterial({ color: 0x9a7a3a, metalness: 0.85, roughness: 0.3, emissive: COLORS.mark, emissiveIntensity: 0, side: THREE.DoubleSide }));
      const bell = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.11, 0.28, 0.4, 16, 1, true)), bronze);
      bell.position.y = -0.3;
      bell.castShadow = true;
      yoke.add(bell);
      const crown = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), bronze);
      crown.position.y = -0.1;
      yoke.add(crown);
      let swing = 0;
      uses.push({
        id: it.id, ring: useRing(it.x, it.z, 1),
        update(dt, on, done, time) {
          swing += ((on ? 1 : done ? 0.12 : 0) - swing) * Math.min(1, dt * 4);
          yoke.rotation.z = Math.sin(time * (on ? 9 : 2.2)) * 0.45 * swing;
          bronze.emissiveIntensity = done ? 0.8 + 0.3 * Math.sin(time * 2) : on ? 0.45 : 0;
        },
      });
    } else if (it.kind !== 'crate') {
      // anything else to use: its ring on the floor
      uses.push({ id: it.id, ring: useRing(it.x, it.z, 1), update() {} });
    }
  }

  // ---- objective beacons: a column of light where the crew is headed
  const beaconGeometry = keep(new THREE.CylinderGeometry(0.09, 0.09, H - 0.1, 10, 1, true));
  const beaconMaterial = keep(new THREE.MeshBasicMaterial({ color: COLORS.beacon, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const beacons = Array.from({ length: 4 }, () => {
    const mesh = new THREE.Mesh(beaconGeometry, beaconMaterial);
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  });

  // ---- each room's lamp
  const lamps = (def.level?.lights || []).map((l) => {
    const light = new THREE.PointLight(l.color, l.intensity || 130, l.reach || 30, 2);
    light.position.set(l.x, H - 0.7, l.z);
    group.add(light);
    return { light, color: new THREE.Color(l.color), intensity: l.intensity || 130 };
  });

  // what stops the camera: walls, pillars and shut doors; low cover too once the camera is down among it
  let high = [];
  let all = [];
  const refreshBlockers = () => {
    high = [...level.walls, ...pillars, ...[...level.doors.values()].filter((d) => !d.open)];
    all = [...high, ...lowCover];
  };
  refreshBlockers();

  const lift = def.lift || null;
  let time = 0;
  let alarm = 0;
  let liftGlow = 0;
  let timerMax = 0;
  return {
    group,
    arc: (options) => waves.arc(options),
    cameraBlockers: (height) => (height < DEPOT.cover + 0.3 ? all : high),
    doorAt: (id) => doors.find((d) => d.id === id)?.at || null,
    /** view: the mission's view (doors, what can be used, what is done, markers, the alarm, the clock). */
    update(dt, { view = null } = {}) {
      time += dt;
      waves.update(dt);
      alarm += ((view?.alarm ? 1 : 0) - alarm) * Math.min(1, dt * 2.5);
      overlayUniforms.uTime.value = time;
      overlayUniforms.uAlarm.value = alarm;
      ceilingUniforms.uTime.value = time;
      ceilingUniforms.uAlarm.value = alarm;
      const beat = 0.5 + 0.5 * Math.sin(time * 6);
      trimMaterial.color.copy(trimColor).lerp(alarmColor, alarm * (0.6 + 0.4 * beat));
      for (const lamp of lamps) {
        lamp.light.color.copy(lamp.color).lerp(alarmColor, alarm * 0.85);
        lamp.light.intensity = lamp.intensity * (1 - alarm + alarm * (0.55 + 0.9 * beat));
      }
      // doors
      let changed = false;
      for (const d of doors) {
        const open = view ? !!view.doors.find((x) => x.id === d.id)?.open : !!level.doors.get(d.id)?.open;
        if (open !== d.open) { d.open = open; changed = true; d.material.color.setHex(open ? COLORS.open : COLORS.closed); }
        d.drop += ((d.open ? H + 0.1 : 0) - d.drop) * Math.min(1, dt * 4);
        d.slab.position.y = -d.drop;
        d.slab.visible = d.drop < H;
      }
      if (changed) refreshBlockers();
      // what can be used, what is done
      const on = new Set((view?.interactables || []).map((i) => i.id));
      const done = new Set(view?.done || []);
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      for (const u of uses) {
        const usable = on.has(u.id);
        u.ring.visible = usable;
        if (usable) { u.ring.scale.setScalar(1 + 0.05 * pulse); u.ring.material.opacity = 0.3 + 0.35 * pulse; }
        u.update(dt, usable, done.has(u.id), time);
      }
      // beacons, and the lift when the crew is sent to it
      const markers = (view?.markers || []).filter((m) => !m.follow); // a person who is the objective wears a name, not a beacon
      let atLift = false;
      beacons.forEach((mesh, i) => {
        const m = markers[i];
        mesh.visible = !!m;
        if (m) mesh.position.set(m.x, H / 2, m.z);
      });
      beaconMaterial.opacity = 0.14 + 0.1 * pulse;
      if (lift) {
        for (const m of markers) if (Math.hypot(m.x - lift.x, m.z - lift.z) < 1) atLift = true;
        liftGlow += ((atLift ? 1 : 0) - liftGlow) * Math.min(1, dt * 3);
        const timer = view?.timer ?? null;
        if (timer === null) timerMax = 0; else timerMax = Math.max(timerMax, timer);
        overlayUniforms.uLift.value.set(lift.x, lift.z, lift.radius || 4.5, liftGlow);
        overlayUniforms.uLiftFill.value = timer !== null && timerMax > 0 ? 1 - timer / timerMax : 0;
      }
    },
    dispose() { disposables.forEach((d) => d.dispose()); group.removeFromParent(); },
  };
}

/**
 * Objective markers on the screen: a diamond with a label and the distance, at the marker when it is in view
 * and pinned to the screen's edge when it is not. One per marker; positioned every frame without React.
 */
export function createMarkerOverlay(container) {
  const layer = document.createElement('div');
  layer.className = 'duelist-markers';
  container.appendChild(layer);
  const items = [];
  const v = new THREE.Vector3();
  const make = () => {
    const el = document.createElement('div');
    el.className = 'duelist-marker';
    const mark = document.createElement('i');
    const label = document.createElement('span');
    const range = document.createElement('small');
    el.append(mark, label, range);
    layer.appendChild(el);
    return { el, label, range, text: '', metres: '' };
  };
  return {
    update(markers, camera, from) {
      while (items.length < markers.length) items.push(make());
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      camera.updateMatrixWorld();
      items.forEach((item, i) => {
        const m = markers[i];
        item.el.style.display = m ? '' : 'none';
        if (!m) return;
        v.set(m.x, 1.7, m.z).applyMatrix4(camera.matrixWorldInverse);
        const behind = v.z > 0;
        v.applyMatrix4(camera.projectionMatrix);
        let x = behind ? -v.x : v.x;
        let y = behind ? -v.y : v.y;
        // kept clear of the objective at the top and the powers at the bottom
        const k = Math.max(Math.abs(x) / 0.88, y > 0 ? y / 0.66 : -y / 0.56);
        const off = behind || k > 1;
        if (off && k > 1e-6) { x /= k; y /= k; }
        item.el.style.transform = `translate(${((x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-y * 0.5 + 0.5) * h).toFixed(1)}px)`;
        item.el.classList.toggle('is-off', off);
        const metres = from ? `${Math.round(Math.hypot(m.x - from.x, m.z - from.z))} m` : '';
        if (item.text !== m.label) { item.text = m.label; item.label.textContent = m.label; }
        if (item.metres !== metres) { item.metres = metres; item.range.textContent = metres; }
      });
    },
    dispose() { layer.remove(); },
  };
}
