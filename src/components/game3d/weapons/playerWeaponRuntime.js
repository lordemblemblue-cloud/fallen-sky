// Puts a weapon-pack model (public/game3d/weapons) in a character's hand and keeps it there.
//
// - The weapon root is a child of the holding hand bone; its transform blends between the manifest's
//   "carry" grip (idle / moving) and "combat" grip (attacking / aiming).
// - After the animation mixer has posed the skeleton, update() closes the holding hand (manifest fist pose),
//   pulls a bow's string to the drawing hand and moves arrows in flight.
// - v5 bodies hide their built-in bow / sword while a pack weapon is held.
// Presentation only: no damage, hit, cooldown or network state lives here.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { palmFromKnuckles, palmFromHandAxis, solveGrip, solveFist } from './weaponGripMath.js';
import { WEAPON_COMBO_STATE_NAMES, WEAPON_IDLE_STATES } from './weaponComboClips.js';

export const WEAPON_MANIFEST_URL = '/game3d/weapons/manifest.json';
export const COMBAT_STATES = new Set(['drawArrow', 'meleeAttack', 'meleeCombo2', 'meleeCombo3', 'heavyAttack',
  'aimWalkForward', 'aimWalkBackward', 'aimWalkLeft', 'aimWalkRight', 'bowDraw',
  'aimRecoil', 'aimOverdraw', 'punch', 'kick', 'block', 'combatIdle', ...WEAPON_COMBO_STATE_NAMES,
  ...WEAPON_IDLE_STATES]); // the weapon stances are baked with the combat grip
const COMBAT_HOLD_S = 0.7; // stay in the combat grip between combo swings
const BLEND_RATE = 9; // 1/s
const sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name);

let manifestPromise = null;
export function loadWeaponManifest(url = WEAPON_MANIFEST_URL, fetchImpl = globalThis.fetch) {
  if (!manifestPromise) {
    manifestPromise = fetchImpl(url).then((r) => {
      if (!r.ok) throw new Error(`weapon manifest ${r.status}`);
      return r.json();
    }).catch((err) => { manifestPromise = null; throw err; });
  }
  return manifestPromise;
}

export function getWeaponEntry(manifest, id) {
  return manifest?.weapons?.find((w) => w.id === id) || null;
}

// Rig id from the manifest: the file's rigId first, then the rig's signature bones.
export function findWeaponRig(model, manifest) {
  if (!model || !manifest?.rigs) return null;
  const rigId = model.userData?.rigId;
  for (const [id, rig] of Object.entries(manifest.rigs)) if (rig.match?.rigId && rig.match.rigId === rigId) return id;
  for (const [id, rig] of Object.entries(manifest.rigs)) {
    if (rig.match?.bones?.length && rig.match.bones.every((b) => model.getObjectByName(sanitize(b)))) return id;
  }
  return null;
}

const MIXAMO_FINGERS = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'];

// Grip + fist for a rig the manifest does not list, solved from the live skeleton's bind matrices.
export function solveFallbackGrip(model, weapon, stanceList = ['carry', 'combat'], bodyHeight = 1.7) {
  const side = weapon.hand === 'left' ? 'left' : 'right';
  let skeleton = null;
  model.traverse((n) => { if (!skeleton && n.isSkinnedMesh && n.skeleton) skeleton = n.skeleton; });
  if (!skeleton) return null;
  const bindOf = (name) => {
    const i = skeleton.bones.findIndex((b) => b.name === sanitize(name) || b.name === name);
    return i < 0 ? null : new THREE.Matrix4().copy(skeleton.boneInverses[i]).invert();
  };
  const S = side === 'right' ? 'Right' : 'Left';
  const s = side === 'right' ? 'r' : 'l';
  const pos = (m) => new THREE.Vector3().setFromMatrixPosition(m);
  let handName = `mixamorig:${S}Hand`;
  let hand = bindOf(handName);
  let palm = null;
  let fist = {};
  if (hand && bindOf(`mixamorig:${S}HandMiddle1`)) {
    const chains = Object.fromEntries(MIXAMO_FINGERS.map((f) => [f, [1, 2, 3].map((i) => `mixamorig:${S}Hand${f}${i}`)]));
    const p = (n) => pos(bindOf(n));
    palm = palmFromKnuckles({ wrist: pos(hand), index: p(chains.Index[0]), middle: p(chains.Middle[0]), pinky: p(chains.Pinky[0]) }, side);
    const bones = {};
    for (const name of Object.values(chains).flat()) {
      const bone = model.getObjectByName(sanitize(name));
      const bind = bindOf(name);
      if (bone && bind) bones[name] = { bind, rest: bone.quaternion.clone() };
    }
    fist = solveFist({ bones, chains, palm });
  } else {
    handName = `hand_${s}`;
    hand = bindOf(handName);
    const fingers = bindOf(`fingers_${s}`);
    if (!hand || !fingers) return null;
    palm = palmFromHandAxis({ wrist: pos(hand), fingers: pos(fingers), medial: new THREE.Vector3(side === 'right' ? 1 : -1, 0, 0) }, side);
  }
  const handBone = model.getObjectByName(sanitize(handName));
  if (!handBone) return null;
  model.updateWorldMatrix(true, true);
  const bindScale = new THREE.Vector3().setFromMatrixScale(hand).x;
  const worldScale = handBone.getWorldScale(new THREE.Vector3()).x;
  const unitsPerMetre = (bodyHeight / 1.7) * (bindScale / Math.max(1e-9, worldScale));
  const grips = {};
  for (const stance of stanceList) grips[stance] = solveGrip({ handBind: hand, palm, cls: weapon.class, stance, radius: weapon.handleRadius, unitsPerMetre });
  return { bone: handName, grips, fist };
}

// ---------- arrows ----------
function createArrowFactory() {
  const shaftGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.7, 6).rotateX(Math.PI / 2).translate(0, 0, 0.35);
  const headGeo = new THREE.ConeGeometry(0.012, 0.06, 8).rotateX(Math.PI / 2).translate(0, 0, 0.73);
  const finGeo = new THREE.PlaneGeometry(0.03, 0.09).translate(0.015, 0, 0.07);
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.8, roughness: 0.3 });
  const finMat = new THREE.MeshStandardMaterial({ color: 0xe9e3d3, roughness: 0.9, side: THREE.DoubleSide });
  const make = () => {
    const g = new THREE.Group();
    g.name = 'WeaponPackArrow';
    g.add(new THREE.Mesh(shaftGeo, shaftMat), new THREE.Mesh(headGeo, headMat));
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.rotation.z = (i * Math.PI * 2) / 3;
      g.add(fin);
    }
    g.traverse((n) => { if (n.isMesh) { n.castShadow = false; n.frustumCulled = true; } });
    return g;
  };
  const dispose = () => [shaftGeo, headGeo, finGeo, shaftMat, headMat, finMat].forEach((x) => x.dispose());
  return { make, dispose };
}

// ---------- daggers (weapon frame: grip at the origin, blade +Y, edge +Z, metres) ----------
// The pair's own model: two curved daggers in one file, each in the weapon frame, named DaggerRight and
// DaggerLeft (tools/game3d-weapons/prepare_lowpoly_weapons.py). The blades modelled below stand in for it
// wherever that file cannot be loaded.
export const DAGGER_PAIR_MODEL = Object.freeze({
  url: '/game3d/weapons/curved_daggers.glb', nodes: Object.freeze({ right: 'DaggerRight', left: 'DaggerLeft' }),
  handleRadius: 0.0155, tip: Object.freeze([0, 0.38, -0.09]), bladeBase: Object.freeze([0, 0.075, 0]),
});
function createDaggerFactory() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.021, 0.06); shape.lineTo(-0.024, 0.1); shape.quadraticCurveTo(-0.019, 0.27, 0, 0.37);
  shape.quadraticCurveTo(0.012, 0.27, 0.019, 0.1); shape.lineTo(0.016, 0.06); shape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0025, bevelThickness: 0.002, bevelSegments: 1, curveSegments: 10 })
    .translate(0, 0, -0.003).rotateY(Math.PI / 2); // width along +Z (edge), thickness along X
  const guardGeo = new THREE.BoxGeometry(0.022, 0.016, 0.085).translate(0, 0.052, 0);
  const gripGeo = new THREE.CylinderGeometry(0.0135, 0.0155, 0.1, 10);
  const pommelGeo = new THREE.SphereGeometry(0.019, 12, 8).translate(0, -0.062, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9d3dc, metalness: 0.92, roughness: 0.22 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.85, roughness: 0.34 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x2a2320, metalness: 0.1, roughness: 0.8 });
  const make = () => {
    const g = new THREE.Group();
    g.name = 'WeaponDagger';
    for (const [geo, mat] of [[bladeGeo, steel], [guardGeo, brass], [gripGeo, wrap], [pommelGeo, brass]]) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      g.add(mesh);
    }
    return g;
  };
  const dispose = () => [bladeGeo, guardGeo, gripGeo, pommelGeo, steel, brass, wrap].forEach((x) => x.dispose());
  return { make, dispose };
}

// ---------- runtime ----------
export function createPlayerWeaponRuntime({ model, scene, manifest = null, manifestUrl = WEAPON_MANIFEST_URL,
  loader = new GLTFLoader(), bodyHeight = 1.7, onError = (e) => console.warn('[weapons]', e) } = {}) {
  const sceneCache = new Map();
  const arrows = createArrowFactory();
  const daggers = createDaggerFactory();
  const flying = [];
  let manifestData = manifest;
  let current = null;
  let equipToken = 0;
  let stanceWeight = 0;
  let combatHold = 0;
  let disposed = false;
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  const getManifest = async () => manifestData || (manifestData = await loadWeaponManifest(manifestUrl));
  const loadScene = (url) => {
    if (!sceneCache.has(url)) sceneCache.set(url, loader.loadAsync(url).then((g) => g.scene).catch((e) => { sceneCache.delete(url); throw e; }));
    return sceneCache.get(url);
  };

  const toTransform = (g) => ({
    position: new THREE.Vector3().fromArray(g.position),
    quaternion: new THREE.Quaternion().fromArray(g.quaternion),
    scale: g.scale,
  });

  function applyGrip() {
    if (!current) return;
    const w = stanceWeight;
    for (const part of current.parts) {
      const { carry, combat } = part.grips;
      part.root.position.lerpVectors(carry.position, combat.position, w);
      part.root.quaternion.slerpQuaternions(carry.quaternion, combat.quaternion, w);
      part.root.scale.setScalar(carry.scale + (combat.scale - carry.scale) * w);
    }
  }

  function detach() {
    if (!current) return;
    for (const part of current.parts) part.root.removeFromParent();
    current.disposeOwned?.();
    current.string?.forEach((m) => m.geometry.dispose());
    current.nocked?.removeFromParent();
    for (const { node, visible } of current.hidden) node.visible = visible;
    for (const f of current.fist) if (f.restore) f.bone.quaternion.copy(f.restore);
    current = null;
  }

  // Equip a weapon-pack id (null / unknown id = nothing in hand). Resolves to true when a model is shown.
  async function equip(id) {
    const token = ++equipToken;
    if (!id) { detach(); return false; }
    if (current?.id === id) { current.releasing = false; return true; }
    let m;
    try { m = await getManifest(); } catch (e) { onError(e); return false; }
    const weapon = getWeaponEntry(m, id);
    if (!weapon) { if (token === equipToken) detach(); return false; }
    const rigId = findWeaponRig(model, m);
    const rig = rigId ? m.rigs[rigId] : null;
    let grip = rigId ? weapon.grips?.[rigId] : null;
    let handName = rig?.hands?.[weapon.hand]?.bone;
    let fistPose = rig?.hands?.[weapon.hand]?.fist || {};
    if (!grip) {
      const solved = solveFallbackGrip(model, weapon, ['carry', 'combat'], bodyHeight);
      if (!solved) { onError(new Error(`no ${weapon.hand} hand found for ${id}`)); if (token === equipToken) detach(); return false; }
      grip = solved.grips; handName = solved.bone; fistPose = solved.fist;
    }
    const handBone = model.getObjectByName(sanitize(handName));
    if (!handBone) { onError(new Error(`hand bone ${handName} missing`)); return false; }
    let source;
    try { source = await loadScene(weapon.url); } catch (e) { onError(e); return false; }
    if (token !== equipToken || disposed) return false;
    detach();
    const root = new THREE.Group();
    root.name = `WeaponPack_${id}`;
    const mesh = source.clone(true);
    mesh.traverse((n) => {
      if (!n.isMesh) return;
      n.castShadow = true;
      n.receiveShadow = false;
      if (weapon.emissive && n.material?.map) {
        n.material = n.material.clone();
        n.material.emissive = new THREE.Color(weapon.emissive.color);
        n.material.emissiveMap = n.material.map;
        n.material.emissiveIntensity = weapon.emissive.intensity ?? 0.8;
      }
    });
    root.add(mesh);
    // anchors in the weapon frame: blade base/tip for trails, the nock for arrows
    const anchor = (name, p) => { const o = new THREE.Object3D(); o.name = name; if (p) o.position.fromArray(p); root.add(o); return o; };
    const pts = weapon.points || {};
    const tip = pts.tip ? anchor('WeaponTip', pts.tip) : null;
    const base = pts.tip ? anchor('WeaponBladeBase', pts.bladeBase || [0, 0.08, 0]) : null;
    const nock = pts.nock ? anchor('WeaponNock', pts.nock) : null;
    handBone.add(root);
    const fist = Object.entries(fistPose).map(([name, q]) => {
      const bone = model.getObjectByName(sanitize(name));
      return bone ? { bone, q: new THREE.Quaternion().fromArray(q), restore: bone.quaternion.clone() } : null;
    }).filter(Boolean);
    const hidden = (rig?.hideWhenArmed || []).map((n) => model.getObjectByName(sanitize(n))).filter(Boolean)
      .map((node) => { const visible = node.visible; node.visible = false; return { node, visible }; });
    const grips = { carry: toTransform(grip.carry), combat: toTransform(grip.combat) };
    current = { id, cls: weapon.class, hand: weapon.hand, weapon, rigId, root, handBone, tip, base, nock, fist, hidden,
      grips, parts: [{ root, handBone, side: weapon.hand, grips }], drawHand: null, string: null, nocked: null };
    if (weapon.class === 'bow') setupBow();
    applyGrip();
    return true;
  }

  // Dual daggers (the dual_blades family): one short blade in each hand, the pair's own model when it loads
  // and the blades modelled above otherwise, gripped with the same solver as the pack swords.
  async function equipDaggers() {
    const token = ++equipToken;
    if (current?.id === 'daggers') return true;
    let m = null;
    try { m = await getManifest(); } catch { /* the bind-pose solver below still works */ }
    let pair = null;
    try { pair = await loadScene(DAGGER_PAIR_MODEL.url); } catch { /* the modelled blades stand in */ }
    if (token !== equipToken || disposed) return false;
    const rigId = m ? findWeaponRig(model, m) : null;
    const rig = rigId ? m.rigs[rigId] : null;
    const parts = [];
    const fist = [];
    // The grip and the fingers are solved from the hands as they are now, so open whatever the weapon being
    // put away had closed: solved from a closed fist, the fingers would not reach the new handle.
    if (current) for (const f of current.fist) if (f.restore) f.bone.quaternion.copy(f.restore);
    for (const side of ['right', 'left']) {
      const own = pair?.getObjectByName(DAGGER_PAIR_MODEL.nodes[side]) || null;
      const solved = solveFallbackGrip(model, { hand: side, class: 'sword', handleRadius: own ? DAGGER_PAIR_MODEL.handleRadius : 0.014 }, ['carry', 'combat'], bodyHeight);
      if (!solved) continue;
      const handBone = model.getObjectByName(sanitize(solved.bone));
      if (!handBone) continue;
      const root = new THREE.Group();
      root.name = `WeaponPack_dagger_${side}`;
      if (own) {
        const blade = own.clone(true);
        blade.position.set(0, 0, 0); blade.quaternion.identity(); blade.scale.setScalar(1);
        blade.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = true; } });
        root.add(blade);
      } else root.add(daggers.make());
      handBone.add(root);
      parts.push({ root, handBone, side, grips: { carry: toTransform(solved.grips.carry), combat: toTransform(solved.grips.combat) } });
      const pose = Object.keys(solved.fist).length ? solved.fist : rig?.hands?.[side]?.fist || {};
      for (const [name, q] of Object.entries(pose)) {
        const bone = model.getObjectByName(sanitize(name));
        if (bone) fist.push({ bone, q: new THREE.Quaternion().fromArray(q), restore: bone.quaternion.clone() });
      }
    }
    if (!parts.length) { onError(new Error('no hands found for daggers')); return false; }
    detach();
    const hidden = (rig?.hideWhenArmed || []).map((n) => model.getObjectByName(sanitize(n))).filter(Boolean)
      .map((node) => { const visible = node.visible; node.visible = false; return { node, visible }; });
    const first = parts[0];
    const tip = new THREE.Object3D(); tip.name = 'WeaponTip'; first.root.add(tip);
    const base = new THREE.Object3D(); base.name = 'WeaponBladeBase'; first.root.add(base);
    if (pair) { tip.position.fromArray(DAGGER_PAIR_MODEL.tip); base.position.fromArray(DAGGER_PAIR_MODEL.bladeBase); }
    else { tip.position.set(0, 0.36, 0); base.position.set(0, 0.08, 0); }
    current = { id: 'daggers', cls: 'dagger', hand: 'both', weapon: { id: 'daggers', class: 'dagger', hand: 'both' }, rigId,
      root: first.root, handBone: first.handBone, tip, base, nock: null, fist, hidden, grips: first.grips, parts,
      drawHand: null, string: null, nocked: null };
    applyGrip();
    return true;
  }

  function setupBow() {
    const w = current.weapon;
    const s = w.hand === 'left' ? 'Right' : 'Left'; // the string hand is the other one
    current.drawHand = model.getObjectByName(sanitize(`mixamorig:${s}HandMiddle1`)) || model.getObjectByName(w.hand === 'left' ? 'fingers_r' : 'fingers_l');
    if (w.dynamicString && w.points?.stringTop && w.points?.stringBottom) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xe8e2cf });
      current.string = [0, 1].map(() => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 1, 4), mat);
        m.name = 'WeaponBowString';
        current.root.add(m);
        return m;
      });
      current.stringTop = new THREE.Vector3().fromArray(w.points.stringTop);
      current.stringBottom = new THREE.Vector3().fromArray(w.points.stringBottom);
    }
    current.nockRest = new THREE.Vector3().fromArray(w.points?.nock || [0, 0.03, -0.25]);
    current.nockPoint = current.nockRest.clone();
    current.drawWeight = 0;
  }

  const placeSegment = (mesh, a, b) => {
    tmpV.subVectors(b, a);
    const len = tmpV.length();
    mesh.position.addVectors(a, b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, tmpV.divideScalar(Math.max(1e-6, len)));
    mesh.scale.set(1, len, 1);
  };

  // Show an arrow on the string while drawing (drawing=true) and hide it on release.
  function setNocked(drawing) {
    if (!current || current.cls !== 'bow') return;
    if (drawing && !current.nocked) {
      current.nocked = arrows.make(); // the weapon frame is in metres, like the arrow
      current.root.add(current.nocked);
    }
    if (current.nocked) current.nocked.visible = !!drawing;
  }

  function updateBow(delta, drawing) {
    const c = current;
    const target = drawing ? 1 : 0;
    c.drawWeight += (target - c.drawWeight) * Math.min(1, delta * (drawing ? 10 : 22));
    c.nockPoint.copy(c.nockRest);
    if (c.drawHand && c.drawWeight > 0.01) {
      c.drawHand.getWorldPosition(tmpV2);
      c.root.worldToLocal(tmpV2);
      // only pull towards a hand that is behind the bow and within a believable draw length
      const pull = tmpV2.z < c.nockRest.z && tmpV2.distanceTo(c.nockRest) < 0.85;
      if (pull) c.nockPoint.lerp(tmpV2, c.drawWeight);
    }
    if (c.string) { placeSegment(c.string[0], c.stringTop, c.nockPoint); placeSegment(c.string[1], c.nockPoint, c.stringBottom); }
    if (c.nocked) {
      c.nocked.position.copy(c.nockPoint);
      tmpV.set(0, c.nockRest.y, 0.05).sub(c.nockPoint).normalize(); // towards the arrow rest on the riser
      c.nocked.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmpV);
    }
  }

  // Release an arrow from the nock towards `target` (world). Visual only.
  function fireArrow({ target = null, direction = null, speed = 42, maxDistance = 40 } = {}) {
    if (!current || current.cls !== 'bow' || disposed) return null;
    model.updateWorldMatrix(true, true);
    const origin = current.root.localToWorld(current.nockPoint.clone());
    const dir = new THREE.Vector3();
    if (target) dir.subVectors(target, origin);
    if (dir.lengthSq() < 1e-6) {
      if (direction) dir.copy(direction);
      else dir.set(0, 0, 1).applyQuaternion(model.getWorldQuaternion(tmpQ));
    }
    dir.normalize();
    const distance = target ? Math.min(maxDistance, origin.distanceTo(target)) : maxDistance;
    const arrow = arrows.make();
    arrow.position.copy(origin);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    scene?.add(arrow);
    flying.push({ arrow, dir, speed, left: distance, life: 0, stuck: 0 });
    while (flying.length > 12) { const f = flying.shift(); f.arrow.removeFromParent(); }
    setNocked(false);
    return arrow;
  }

  function updateArrows(delta) {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.life += delta;
      if (f.left > 0) {
        const step = Math.min(f.left, f.speed * delta);
        f.arrow.position.addScaledVector(f.dir, step);
        f.left -= step;
      } else {
        f.stuck += delta; // briefly stays where it landed
      }
      if (f.stuck > 0.6 || f.life > 3) { f.arrow.removeFromParent(); flying.splice(i, 1); }
    }
  }

  // Call after the mixer has posed the skeleton. state: the animation controller's current state.
  // drawing: true / false while a bow combo draws / has loosed (shows the nocked arrow); null = from state.
  function update(delta, { state = null, aiming = false, drawing = null } = {}) {
    updateArrows(delta);
    if (!current) return;
    const combat = aiming || COMBAT_STATES.has(state);
    combatHold = combat ? COMBAT_HOLD_S : Math.max(0, combatHold - delta);
    const target = combatHold > 0 ? 1 : 0;
    stanceWeight += (target - stanceWeight) * Math.min(1, delta * BLEND_RATE);
    applyGrip();
    // The hand closes around the (still empty) grip first and opens again when the weapon is released.
    // Bones the mixer does not animate start from their rest pose each frame, so opening really opens.
    current.fistWeight = Math.min(1, Math.max(0, (current.fistWeight ?? 0)
      + ((current.releasing ? 0 : 1) - (current.fistWeight ?? 0)) * Math.min(1, delta * 12)));
    for (const f of current.fist) {
      const base = f.last && f.bone.quaternion.equals(f.last) ? f.restore : f.bone.quaternion.clone();
      f.last ||= new THREE.Quaternion();
      f.last.copy(base).slerp(f.q, current.fistWeight);
      f.bone.quaternion.copy(f.last);
    }
    if (current.cls === 'bow') {
      if (typeof drawing === 'boolean') setNocked(drawing);
      updateBow(delta, drawing ?? state === 'drawArrow');
    }
  }

  return {
    equip,
    equipDaggers,
    unequip: () => { equipToken++; detach(); },
    // Hand the current weapon's roots to the caller (still attached, e.g. to melt them away while the next
    // weapon forms) and forget them; hidden built-ins and the hand pose are restored.
    orphan: () => {
      if (!current) return [];
      const roots = current.parts.map((p) => p.root);
      for (const { node, visible } of current.hidden) node.visible = visible;
      for (const f of current.fist) if (f.restore) f.bone.quaternion.copy(f.restore);
      current = null;
      return roots;
    },
    // open the hand while the weapon melts away (the weapon stays attached until unequip)
    releaseHand: () => { if (current) current.releasing = true; },
    setHandClosed: (closed = true) => { if (current) { current.releasing = !closed; current.fistWeight = closed ? 1 : 0; } },
    update,
    fireArrow,
    setNocked,
    getCurrent: () => (current ? { id: current.id, cls: current.cls, hand: current.hand, rigId: current.rigId,
      length: current.weapon?.length ?? (current.cls === 'dagger' ? 0.37 : null) } : null),
    getRoots: () => current?.parts.map((p) => p.root) || [],
    // Pack weapons on this body that the runtime no longer holds (a melt that never finished, an error
    // in the middle of a switch) are removed; `keep` lists roots still melting away on purpose.
    sweepStrays: (keep = []) => {
      const held = new Set([...(current?.parts.map((p) => p.root) || []), ...keep]);
      const strays = [];
      model.traverse((n) => { if (n !== model && /^WeaponPack_/.test(n.name) && !held.has(n)) strays.push(n); });
      for (const n of strays) n.removeFromParent();
      return strays.length;
    },
    getHands: () => current?.parts.map((p) => ({ side: p.side, handBone: p.handBone, gripQuaternion: p.grips.combat.quaternion })) || [],
    getRoot: () => current?.root || null,
    getBladeAnchors: () => (current?.tip ? { base: current.base, tip: current.tip } : null),
    getStanceWeight: () => stanceWeight,
    setStanceWeight: (w) => { stanceWeight = Math.max(0, Math.min(1, w)); combatHold = stanceWeight > 0.5 ? COMBAT_HOLD_S : 0; applyGrip(); },
    // keep the combat grip (e.g. while the summon gesture shows the weapon off)
    holdCombat: (seconds = COMBAT_HOLD_S) => { combatHold = Math.max(combatHold, seconds); },
    dispose() {
      disposed = true;
      equipToken++;
      detach();
      flying.splice(0).forEach((f) => f.arrow.removeFromParent());
      arrows.dispose();
      daggers.dispose();
    },
  };
}
