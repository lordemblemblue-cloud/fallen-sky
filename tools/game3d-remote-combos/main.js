// Remote weapon-combo check: the real RemotePlayersManager (src/components/game3d/RemotePlayersManager.jsx)
// driven by synthetic network packets, stepped at a fixed 60 Hz and rendered to a frame sheet.
// The packets follow MultiplayerSystem: each live (WebRTC) packet is echoed in the merged presence list, plus
// one late packet out of order and one stale PlayerState row in the middle of the chain.
//   ?model=archer (default: the production remote avatar, the archer FBX) | fused-female-v1 | fused-male-v1
//   &who=both|sword|bow  &cam=front|side|top|three  &every=0.1 (s between frames)  &cols=6
//   &weapons=0 (no stand-in weapon)  &save=name.png (POSTs the sheet to /__shot)  &mode=live (real time loop)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { createRemotePlayersManager } from '../../src/components/game3d/RemotePlayersManager.jsx';
import { bakeRemoteComboClips, REMOTE_COMBO_STAND_INS, remoteWeaponLoader } from '../../src/components/game3d/weapons/remoteWeaponCombos.js';
import { getWeaponEntry, loadWeaponManifest } from '../../src/components/game3d/weapons/playerWeaponRuntime.js';

const params = new URLSearchParams(location.search);
const modelKey = params.get('model') || 'archer';
const who = params.get('who') || 'both';
const cam = params.get('cam') || 'front';
const every = Number(params.get('every') || 0.1);
const cols = Number(params.get('cols') || 6);
const weapons = params.get('weapons') !== '0';
const report = document.getElementById('report');
const lines = [];
const out = (s) => { lines.push(s); report.textContent = lines.join('\n'); };
window.__remoteComboResult = null;

document.getElementById('nav').innerHTML = ['archer', 'fused-female-v1', 'fused-male-v1']
  .flatMap((m) => ['both', 'sword', 'bow'].map((w) => `<a href="?model=${m}&who=${w}">${m} ${w}</a>`)).join('');

const GLB_URLS = {
  'fused-female-v1': '/models/characters/fused/Female_Fused_v2.glb',
  'fused-male-v1': '/models/characters/fused/Male_Fused_v2.glb',
};

// A held attack button on the sender: each next hit starts at the previous hit's cancel point (the local
// controller's buffer), the last one plays out, then the player is idle again.
const TIMELINES = {
  sword: [[0, 'idle'], [0.3, 'swordCombo1'], [0.7, 'swordCombo2'], [1.08, 'swordCombo3'], [1.9, 'idle']],
  bow: [[0, 'idle'], [0.3, 'bowCombo1'], [0.67, 'bowCombo2'], [0.98, 'bowCombo3'], [1.86, 'idle']],
};
const kinds = who === 'both' ? ['sword', 'bow'] : [who];
const PLAYERS = { sword: { id: 'remote-sword', x: who === 'both' ? -0.8 : 0 }, bow: { id: 'remote-bow', x: who === 'both' ? 0.8 : 0 } };
const SHEET_END = 2.5; // frames up to here
const RUN_END = 3.4; // keep stepping: the stand-in weapon goes 1.2 s after the last swing
const STAMP0 = 1_700_000_000_000;
const stamp = (t) => STAMP0 + Math.round(t * 1000);
const animAt = (kind, t) => TIMELINES[kind].reduce((a, [at, anim]) => (t + 1e-9 >= at ? anim : a), 'idle');

async function loadGlbAssets() {
  const gltf = await new GLTFLoader().loadAsync(GLB_URLS[modelKey]);
  const model = gltf.scene;
  const rigId = gltf.parser.json.extras?.rigId;
  if (rigId) model.userData.rigId = rigId;
  const clip = (name) => gltf.animations.find((c) => c.name === name);
  return { model, idleClip: clip('Idle'), runClip: clip('Run') };
}

// ---- scene ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x34373d);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3530, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2, 4, 3);
const rim = new THREE.DirectionalLight(0xbfd8ff, 1.0);
rim.position.set(-3, 2, -2);
scene.add(key, rim);
scene.add(new THREE.Mesh(new THREE.CircleGeometry(5, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 1 })));
const grid = new THREE.GridHelper(10, 20, 0x777777, 0x555555);
grid.position.y = 0.002;
scene.add(grid);

const TILE_W = who === 'both' ? 400 : 280;
const TILE_H = 360;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(TILE_W, TILE_H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(30, TILE_W / TILE_H, 0.05, 80);
const far = who === 'both' ? 5.6 : 4.4;
if (cam === 'side') camera.position.set(-far, 1.15, 0.35); // from the characters' right
else if (cam === 'top') camera.position.set(0, far + 1, 0.6);
else if (cam === 'three') camera.position.set(-far * 0.62, 1.7, far * 0.8);
else camera.position.set(0, 1.25, far);
camera.lookAt(0, cam === 'top' ? 0 : 0.95, cam === 'top' ? 0.3 : 0.2);

// ---- the manager under test, and MultiplayerSystem's packet flow ----
const manager = createRemotePlayersManager(scene, {
  ...(modelKey === 'archer' ? {} : { loadAssets: loadGlbAssets }),
  comboWeapons: weapons ? {} : false,
});
const merged = new Map(); // MultiplayerSystem's otherPlayersMap
const presence = () => window.dispatchEvent(new CustomEvent('multiplayerPlayersUpdate', { detail: { players: [...merged.values()] } }));
const live = (kind, anim, at) => {
  const p = { player_id: PLAYERS[kind].id, x: PLAYERS[kind].x, y: 0.001, z: 0, yaw: 0, anim, last_update: stamp(at), display_name: kind };
  window.dispatchEvent(new CustomEvent('webrtcMovementUpdate', { detail: p }));
  merged.set(p.player_id, { ...merged.get(p.player_id), ...p });
  presence();
};
const staleRow = (kind, anim, at) => { // a PlayerState subscription event carrying a row written earlier
  const id = PLAYERS[kind].id;
  merged.set(id, { ...merged.get(id), anim, last_update: stamp(at) });
  presence();
};
const remote = (kind) => manager.getRemotes().get(PLAYERS[kind].id);
window.__remoteCombo = { manager, scene, THREE, FBXLoader, bakeRemoteComboClips }; // for inspection from the console
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

async function ready() {
  for (const kind of kinds) live(kind, 'idle', 0);
  const started = performance.now();
  while (kinds.some((k) => !remote(k))) {
    if (performance.now() - started > 60000) throw new Error('remote avatar did not load');
    await new Promise((r) => setTimeout(r, 50));
  }
  if (weapons) {
    // the stand-ins' files, so the stepped run below never waits on the network
    const manifest = await loadWeaponManifest();
    await Promise.all(Object.values(REMOTE_COMBO_STAND_INS).map((id) => remoteWeaponLoader.loadAsync(getWeaponEntry(manifest, id).url)));
  }
  const r = remote(kinds[0]);
  out(`model ${modelKey}: combo clips ${Object.keys(r.comboClips).join(', ') || 'none'}; stand-in weapons ${weapons ? 'on' : 'off'}`);
}

function tile(t) {
  renderer.render(scene, camera);
  const c = document.createElement('canvas');
  c.width = TILE_W;
  c.height = TILE_H;
  const g = c.getContext('2d');
  g.drawImage(renderer.domElement, 0, 0);
  g.font = '13px system-ui, sans-serif';
  g.fillStyle = '#f4efe2';
  g.shadowColor = '#000';
  g.shadowBlur = 3;
  g.fillText(`${t.toFixed(2)} s`, 8, 18);
  kinds.forEach((k, i) => {
    const r = remote(k);
    const w = r.comboWeapon?.getWeapon()?.id;
    g.fillText(`${k}: ${r.current}${w ? ` [${w}]` : ''}`, 8, TILE_H - 10 - 16 * (kinds.length - 1 - i));
  });
  return c;
}

async function stepped() {
  await ready();
  const dt = 1 / 60;
  const tiles = [];
  const transitions = Object.fromEntries(kinds.map((k) => [k, []]));
  const weaponsSeen = Object.fromEntries(kinds.map((k) => [k, new Set()]));
  const arrowsSeen = new Set();
  let ignored = 0;
  let nextTile = 0.2;
  for (let step = 0; step * dt <= RUN_END + 1e-9; step++) {
    const t = step * dt;
    for (const kind of kinds) live(kind, animAt(kind, t), t);
    if (Math.abs(t - 0.85) < dt / 2) {
      // a late packet (sent at 0.60 s, during the first hit) and a stale presence row: neither may restart
      // the first hit nor cut the second one
      const before = kinds.map((k) => remote(k).current).join();
      if (kinds.includes('sword')) live('sword', 'swordCombo1', 0.6);
      if (kinds.includes('bow')) live('bow', 'bowCombo1', 0.6);
      for (const kind of kinds) staleRow(kind, 'idle', 0.25);
      if (kinds.map((k) => remote(k).current).join() === before) ignored++;
    }
    await flush(); // the stand-in's equip resolves (its files are already loaded)
    manager.update(dt);
    for (const kind of kinds) {
      const r = remote(kind);
      const list = transitions[kind];
      if (!list.length || list[list.length - 1].state !== r.current) list.push({ t: Number(t.toFixed(3)), state: r.current });
      const w = r.comboWeapon?.getWeapon()?.id;
      if (w) weaponsSeen[kind].add(w);
    }
    scene.traverse((n) => { if (n.name === 'WeaponPackArrow' && n.parent === scene) arrowsSeen.add(n); });
    if (t + 1e-6 >= nextTile && nextTile <= SHEET_END + 1e-6) { tiles.push(tile(t)); nextTile += every; }
  }
  const weaponAtEnd = Object.fromEntries(kinds.map((k) => [k, remote(k).comboWeapon?.getWeapon()?.id || null]));
  // the sheet
  const sheet = document.getElementById('sheet');
  sheet.width = TILE_W * Math.min(cols, tiles.length);
  sheet.height = TILE_H * Math.ceil(tiles.length / cols);
  const g = sheet.getContext('2d');
  tiles.forEach((c, i) => g.drawImage(c, (i % cols) * TILE_W, Math.floor(i / cols) * TILE_H));
  // checks
  const expected = { sword: ['idle', 'swordCombo1', 'swordCombo2', 'swordCombo3', 'idle'], bow: ['idle', 'bowCombo1', 'bowCombo2', 'bowCombo3', 'idle'] };
  const sequenceOk = kinds.every((k) => transitions[k].map((x) => x.state).join() === expected[k].join());
  const result = {
    model: modelKey, transitions, ignoredStaleAndLate: ignored === 1,
    weaponsSeen: Object.fromEntries(kinds.map((k) => [k, [...weaponsSeen[k]]])), weaponAtEnd,
    arrowsFired: arrowsSeen.size, sequenceOk,
  };
  result.ok = sequenceOk && result.ignoredStaleAndLate
    && (!weapons || kinds.every((k) => result.weaponsSeen[k].length === 1 && !weaponAtEnd[k]))
    && (!weapons || !kinds.includes('bow') || result.arrowsFired === 3);
  for (const k of kinds) out(`${k}: ${transitions[k].map((x) => `${x.state}@${x.t.toFixed(2)}`).join(' -> ')}`);
  out(`late packet + stale row ignored: ${result.ignoredStaleAndLate}; stand-ins seen: ${JSON.stringify(result.weaponsSeen)}; in hand at ${RUN_END} s: ${JSON.stringify(weaponAtEnd)}; arrows fired: ${result.arrowsFired}`);
  out(`OK: ${result.ok}`);
  window.__remoteComboResult = result;
  const save = params.get('save');
  if (save) {
    const res = await fetch(`/__shot?name=${encodeURIComponent(save)}`, { method: 'POST', body: sheet.toDataURL('image/png') });
    out(`saved ${await res.text()}`);
  }
}

async function liveLoop() {
  await ready();
  const sheet = document.getElementById('sheet');
  sheet.replaceWith(renderer.domElement);
  renderer.domElement.style.position = 'static';
  let t = 0;
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t = (t + dt) % RUN_END;
    for (const kind of kinds) live(kind, animAt(kind, t), now / 1000);
    manager.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

(params.get('mode') === 'live' ? liveLoop() : stepped()).catch((err) => { out(`ERROR ${err?.stack || err}`); window.__remoteComboResult = { ok: false, error: String(err) }; });
