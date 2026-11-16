// Per-rig weapon grips for the Game 3D weapon pack (used by build-weapons.mjs).
// Each rig's hands are measured in its bind pose (inverse bind matrices), the palm frame is derived from the
// finger knuckles (Mixamo rigs) or the single finger bone (v5 rigs), and every weapon gets a "carry" and a
// "combat" transform relative to the holding hand bone. TUNE holds small per-hand trims found with the
// preview renders (tools/game3d-weapons/preview); everything else follows from the rig geometry.
import * as THREE from 'three';
import { readGlb, readAccessor } from '../avatar-motion/glb-io.mjs';
import { palmFromKnuckles, palmFromHandAxis, solveGrip, solveFist } from '../../src/components/game3d/weapons/weaponGripMath.js';

export const RIG_SOURCES = {
  'fused-female-v1': 'public/models/characters/fused/Female_Fused_v2.glb',
  'fused-male-v1': 'public/models/characters/fused/Male_Fused_v2.glb',
  'artemis-v5': 'public/models/characters/Artemis_Character_v5.glb',
  'getsuga-v5': 'public/models/characters/Getsuga_Tensho_Character_v5.glb',
};

const MIXAMO = (side) => {
  const S = side === 'right' ? 'Right' : 'Left';
  return {
    hand: `mixamorig:${S}Hand`,
    chains: Object.fromEntries(['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'].map((f) => [f, [1, 2, 3].map((i) => `mixamorig:${S}Hand${f}${i}`)])),
  };
};

export const RIG_INFO = {
  'fused-female-v1': { kind: 'mixamo', match: { rigId: 'fused-female-v1' } },
  'fused-male-v1': { kind: 'mixamo', match: { rigId: 'fused-male-v1' } },
  // v5 bodies: one finger bone per hand. Their closed hand is sampled from a clip where that hand grips.
  'artemis-v5': {
    kind: 'single', match: { bones: ['hand_r', 'bow_string'] }, hideWhenArmed: ['Bow', 'Bow_Glow'],
    fistClip: { right: ['Lunar_Beam', 2.75], left: ['Combat_Idle', 1.0] },
  },
  'getsuga-v5': {
    kind: 'single', match: { bones: ['hand_r', 'weapon_r'] }, hideWhenArmed: ['SK_Sword', 'SK_EnergyBlade', 'SK_EnergyBladeGlow'],
    fistClip: { right: ['GetsugaTensho', 1.3], left: ['GetsugaTensho', 1.3] },
  },
};

// rig -> side -> { along, palmar, across (fractions of the hand length), tilt, lean, twist (degrees) }
export const TUNE = {};

function loadRig(file) {
  const glb = readGlb(file);
  const J = glb.json;
  const skin = J.skins[0];
  const ibm = readAccessor(glb, skin.inverseBindMatrices);
  const byName = new Map(J.nodes.map((n, i) => [n.name, i]));
  const bind = new Map();
  skin.joints.forEach((j, k) => bind.set(J.nodes[j].name, new THREE.Matrix4().fromArray(ibm[k]).invert()));
  const rest = (name) => new THREE.Quaternion(...(J.nodes[byName.get(name)]?.rotation || [0, 0, 0, 1]));
  let minY = Infinity;
  let maxY = -Infinity;
  J.nodes.forEach((n) => {
    if (n.mesh === undefined || n.skin === undefined) return;
    for (const p of J.meshes[n.mesh].primitives) {
      const a = J.accessors[p.attributes.POSITION];
      minY = Math.min(minY, a.min[1]);
      maxY = Math.max(maxY, a.max[1]);
    }
  });
  return { glb, J, bind, rest, byName, height: maxY - minY };
}

function sampleRotation(rig, animName, nodeName, t) {
  const { glb, J, byName } = rig;
  const anim = J.animations.find((a) => a.name === animName);
  const node = byName.get(nodeName);
  const ch = anim?.channels.find((c) => c.target.node === node && c.target.path === 'rotation');
  if (!ch) return null;
  const s = anim.samplers[ch.sampler];
  const times = readAccessor(glb, s.input).map((r) => r[0]);
  const vals = readAccessor(glb, s.output);
  const stride = s.interpolation === 'CUBICSPLINE' ? 3 : 1;
  const at = (i) => new THREE.Quaternion(...vals[i * stride + (stride === 3 ? 1 : 0)]);
  let i = times.findIndex((x) => x > t);
  if (i <= 0) return (i === 0 ? at(0) : at(times.length - 1)).normalize();
  const f = (t - times[i - 1]) / (times[i] - times[i - 1]);
  return at(i - 1).slerp(at(i), s.interpolation === 'STEP' ? 0 : f).normalize();
}

const posOf = (m) => new THREE.Vector3().setFromMatrixPosition(m);

function palmOf(rig, info, side) {
  if (info.kind === 'mixamo') {
    const { hand, chains } = MIXAMO(side);
    const p = (n) => posOf(rig.bind.get(n));
    return palmFromKnuckles({ wrist: p(hand), index: p(chains.Index[0]), middle: p(chains.Middle[0]), pinky: p(chains.Pinky[0]), thumb: p(chains.Thumb[1]) }, side);
  }
  const s = side === 'right' ? 'r' : 'l';
  return palmFromHandAxis({ wrist: posOf(rig.bind.get(`hand_${s}`)), fingers: posOf(rig.bind.get(`fingers_${s}`)), medial: new THREE.Vector3(side === 'right' ? 1 : -1, 0, 0) }, side);
}

export function loadRigs(root = '.') {
  const rigs = {};
  for (const [id, file] of Object.entries(RIG_SOURCES)) {
    const info = RIG_INFO[id];
    const rig = loadRig(`${root}/${file}`);
    const hands = {};
    for (const side of ['right', 'left']) {
      const palm = palmOf(rig, info, side);
      let bone;
      let fist;
      if (info.kind === 'mixamo') {
        const { hand, chains } = MIXAMO(side);
        bone = hand;
        const bones = {};
        for (const name of Object.values(chains).flat()) if (rig.bind.has(name)) bones[name] = { bind: rig.bind.get(name), rest: rig.rest(name) };
        fist = solveFist({ bones, chains, palm });
      } else {
        const s = side === 'right' ? 'r' : 'l';
        bone = `hand_${s}`;
        const [clip, t] = info.fistClip[side];
        const q = sampleRotation(rig, clip, `fingers_${s}`, t);
        fist = q ? { [`fingers_${s}`]: q.toArray().map((v) => Number(v.toFixed(6))) } : {};
      }
      hands[side] = { bone, palm, fist, handBind: rig.bind.get(bone) };
    }
    rigs[id] = { id, info, rig, hands, unitsPerMetre: rig.height / 1.7 };
  }
  return rigs;
}

export function rigManifest(rigs) {
  return Object.fromEntries(Object.values(rigs).map((r) => [r.id, {
    match: r.info.match,
    unitsPerMetre: Number(r.unitsPerMetre.toFixed(6)),
    hideWhenArmed: r.info.hideWhenArmed || [],
    hands: Object.fromEntries(Object.entries(r.hands).map(([side, h]) => [side, { bone: h.bone, fist: h.fist }])),
  }]));
}

export function solveWeaponGrips(cls, meta, rigs) {
  const side = cls === 'bow' ? 'left' : 'right';
  const out = {};
  for (const r of Object.values(rigs)) {
    const h = r.hands[side];
    const tune = TUNE[r.id]?.[side] || {};
    const one = (stance) => solveGrip({ handBind: h.handBind, palm: h.palm, cls, stance, radius: meta.handleRadius, unitsPerMetre: r.unitsPerMetre, tune: { ...tune, ...(tune[stance] || {}) } });
    out[r.id] = { carry: one('carry'), combat: one('combat') };
  }
  return out;
}
