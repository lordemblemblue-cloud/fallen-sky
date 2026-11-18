/* eslint-disable */
import { parseGLB } from './glb.js';
import { fetchGame2Binary } from './chunked.js';
import { Skeleton, withDerivedAnims } from './actor.js';
import { parseRBSP } from './rbsp.js';
import { GAME2_ARENA_MAPS } from './arenaMaps.js';
import { loadOwnerRancor } from './bossWay/rancorAsset.js';
import { GAME2_MISSION_ARCHIVE } from './missionArchive.js';
import { readMissionArchive } from './missionArchiveStorage.js';
import { auditArchiveMission } from './missionArchiveAudit.js';
import { validateAcademyBank } from './academyAnimations.js';

const fetchBuf = fetchGame2Binary;

// Drive-sourced JSON must be real game data, not an HTML SPA fallback.
// Fail visibly rather than silently launching Game Two with missing rig/moves.
export async function fetchGame2Json(base, filename, request = (...args) => fetch(...args)) {
  const response = await request(base + filename);
  if (!response.ok || response.headers?.get?.('content-type')?.includes('text/html')) {
    throw new Error('Game 2 required asset unavailable: ' + filename + ' (HTTP ' + response.status + ')');
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Game 2 required asset has invalid JSON: ' + filename);
  }
}
async function gunzip(buf) {
  const ds = new DecompressionStream('gzip'); const stream = new Blob([buf]).stream().pipeThrough(ds); return new Response(stream).arrayBuffer();
}
export async function loadBank(base, progress = () => { }) {
  let qbuf;
  try { progress('animation bank (gz)'); qbuf = await gunzip(await fetchBuf(base + 'bank_q.bin.gz')); }
  catch (e) { console.warn('gz bank failed, falling back to raw', e); progress('animation bank'); qbuf = await fetchBuf(base + 'bank_q.bin'); }
  const pbuf = await fetchBuf(base + 'bank_pel.bin');
  return { q: new Int16Array(qbuf), pel: new Float32Array(pbuf) };
}
// Optional Jedi Academy animations (dual sabers, saberstaff, katas…) built on this PC from the user's own install by
// tools/game2/ja-anim-bank.mjs into local/ja/ (never committed or deployed). They are appended after the Jedi Outcast
// bank, so every existing animation keeps its index; without them (the live site) nothing changes and the moves that
// would use them fall back to Jedi Outcast animations.
export async function loadLocalBank(base, rigJson, bank, progress = () => { }, request = (...a) => fetch(...a)) {
  const get = async f => { const r = await request(base + 'local/ja/' + f); if (!r.ok || r.headers?.get?.('content-type')?.includes('text/html')) throw new Error('missing ' + f); return r; };
  let meta; try { meta = await (await get('ja_anims.json')).json(); } catch { return { rigJson, bank }; }
  try {
    validateAcademyBank(meta, rigJson);
    progress('Jedi Academy animations (local)');
    const raw = await (await get('ja_q.bin.gz')).arrayBuffer(), z = new Uint8Array(raw, 0, 2); // a server may send it already unpacked (Content-Encoding: gzip)
    const q = new Int16Array(z[0] === 0x1f && z[1] === 0x8b ? await gunzip(raw) : raw), pel = new Float32Array(await (await get('ja_pel.bin')).arrayBuffer());
    const NB4 = rigJson.rig.nBones * 4, F0 = bank.q.length / NB4;
    if (q.length !== meta.frames * NB4 || pel.length !== meta.frames * 3) throw new Error('size mismatch');
    if (!pel.every(Number.isFinite)) throw new Error('non-finite Academy pelvis translation');
    const mq = new Int16Array(bank.q.length + q.length); mq.set(bank.q); mq.set(q, bank.q.length);
    const mp = new Float32Array(bank.pel.length + pel.length); mp.set(bank.pel); mp.set(pel, bank.pel.length);
    const anims = [...rigJson.anims, ...meta.anims.map(a => ({ ...a, first: a.first + F0, ja: true }))];
    return { rigJson: { ...rigJson, rig: { ...rigJson.rig, nFrames: F0 + meta.frames }, anims, jaAnims: meta.anims.length }, bank: { q: mq, pel: mp } };
  } catch (e) { console.warn('Game 2: local Jedi Academy animations unusable', e); return { rigJson, bank }; }
}
export async function loadAll(base = 'assets/', progress = () => { }, o = {}) { // o.map === false: missions build their own level
  progress('rig'); let rigJson = await fetchGame2Json(base, 'rig.json');
  let bank = await loadBank(base, progress);
  ({ rigJson, bank } = withDerivedAnims(rigJson, bank)); // before the optional local bank: same indices for every player
  ({ rigJson, bank } = await loadLocalBank(base, rigJson, bank, progress));
  progress('model'); const glb = parseGLB(await fetchBuf(base + 'Explorer_G2_Game.glb'));
  const skel = new Skeleton(rigJson, bank.q, bank.pel, glb);
  const J = glb.json, prim = J.meshes[0].primitives[0], A = prim.attributes;
  const body = { pos: glb.accessor(A.POSITION).data, nrm: glb.accessor(A.NORMAL).data, col: glb.accessor(A.COLOR_0).data, joints: glb.accessor(A.JOINTS_0).data, weights: glb.accessor(A.WEIGHTS_0).data, idx: glb.accessor(prim.indices).data };
  const lp = J.meshes.find(m => m.name === 'Explorer_Body_LOD1'), lod = lp ? (() => { const pr = lp.primitives[0], a = pr.attributes; return { pos: glb.accessor(a.POSITION).data, nrm: glb.accessor(a.NORMAL).data, col: glb.accessor(a.COLOR_0).data, joints: glb.accessor(a.JOINTS_0).data, weights: glb.accessor(a.WEIGHTS_0).data, idx: glb.accessor(pr.indices).data }; })() : null;
  const hp = J.meshes[1].primitives[0], HA = hp.attributes;
  const hilt = { pos: glb.accessor(HA.POSITION).data, nrm: glb.accessor(HA.NORMAL).data, col: glb.accessor(HA.COLOR_0).data, idx: glb.accessor(hp.indices).data };
  const node = n => J.nodes.find(x => x.name === n);
  const holster = node('Saber_Hilt'), grip = node('Saber_Grip_R');
  const attach = { holster: { t: holster.translation, q: holster.rotation, bone: 'rfemurYZ' }, grip: { t: grip.translation, q: grip.rotation, s: grip.extras.hilt_scale, bone: 'rhand' }, hiltLen: holster.extras.length_m };
  progress('saber moves'); const saberData = await fetchGame2Json(base, 'sabermoves.json');
  if (o.map === false) {
    const rancorModel = o.bossWay ? await loadOwnerRancor(base) : null;
    return { rigJson, skel, body, lod, hilt, attach, glb, saberData, duelMap: null, rancorModel };
  }
  const archive = !!o.archiveId;
  const selected = archive ? GAME2_MISSION_ARCHIVE[o.archiveId] : GAME2_ARENA_MAPS[o.mapId || 'training'];
  if (!selected) throw new Error('Unknown Game 2 map: ' + (o.archiveId || o.mapId));
  progress(selected.label + ' · actual Raven BSP geometry');
  let mapBuffer;
  if (archive) {
    // Browser-imported mission BSPs are read from IndexedDB; if the owner
    // installs assets in public/game2/maps/archive/ they are fetched directly.
    // An unavailable level must NOT silently render a different mission.
    // Private Base44 asset chunks replace the previous requirement to reach
    // the Azure/Google Drive gateway each time a mission is selected.
    const {base44}=await import('@/api/base44Client');
    mapBuffer = o.archiveBuffer || await readMissionArchive(selected.id,base,(...args)=>fetch(...args),{cloudClient:base44});
  } else {
    const raw = await fetch(base + 'maps/' + selected.filename);
    if (!raw.ok || raw.headers?.get?.('content-type')?.includes('text/html'))
      throw new Error('Game 2 map could not load: ' + selected.filename + ' (HTTP ' + raw.status + ')');
    mapBuffer = await raw.arrayBuffer();
  }
  const duelMap = parseRBSP(mapBuffer, {
    source: selected.filename,
    name: selected.label,
    singlePlayer: archive,
  });
  if (!duelMap.tris?.length || duelMap.source !== selected.filename) {
    throw new Error('Game 2 map content invalid: ' + selected.filename);
  }
  if(archive)duelMap.archiveAudit=auditArchiveMission(duelMap);
  // Fetch only original textures imported from the user's Drive. Other shader
  // references stay clearly color-shaded until their original assets are supplied.
  const have = new Set([
    'ceiling', 'goldblock', 'met_floor01', 'metalrandom1worn', 'metalstockworn',
    'stone_tile2', 'temple_basicwall3', 'temple_basicwall4',
    'temple_interiorsmall3', 'temple_stone2', 'tileblock', 'trim_stone06', 'trim_stone10',
  ]);
  duelMap.textureBitmaps = new Map();
  await Promise.all(duelMap.texturedMeshes.map(async ({ shader }) => {
    const match = /^textures\/yavin\/([a-z0-9_]+)$/.exec(shader);
    if (!match || !have.has(match[1])) return;
    const url = base + 'maps/' + shader + '.jpg';
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const bitmap = await createImageBitmap(await res.blob());
      duelMap.textureBitmaps.set(shader, bitmap);
    } catch (e) { console.warn('Game 2 texture unavailable:', url, e); }
  }));
  return { rigJson, skel, body, lod, hilt, attach, glb, saberData, duelMap };
}
