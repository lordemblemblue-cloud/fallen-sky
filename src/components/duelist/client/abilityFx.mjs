// The class abilities' effects (owner, 2026-11-22: "they gotta be cool"): a fiery aura for the Warrior's Rage, a
// healing mist on the ground whose light clings to the allies standing in it, light under a levitated body, a violet
// crown over a dominated one, smoke where the Assassin steps through the veil, the Execution's seizing tether and
// the Warrior's crashing landings.
// Built from sprites and floor decals with textures drawn on canvases, the shared particle pool and the bodies' own
// glow (emissive): nothing here has a shader of its own, so it draws the same with WebGPU and WebGL.
import * as THREE from 'three';

const rand = (s = 1) => (Math.random() * 2 - 1) * s;
// bones a body's aura comes off (the fused bodies' Mixamo names)
const AURA_BONES = Object.freeze(['Hips', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
  'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']);
export const FX_COLORS = Object.freeze({
  fire: [0xffd27a, 0xff8a2a, 0xff4a1c, 0xff2e12], ember: 0xffb24a, heat: 0xff6a24,
  mist: 0xe8f6ff, mistBlue: 0x9fd6ff, mend: 0x9effd0,
  levitate: 0xcfe9ff, dominate: 0xb779ff, dominateDeep: 0x6a2bd8, shadow: 0x2a1640, blink: 0xb779ff,
  seize: 0xffcf6a, dust: 0x8a9bb0, slam: 0xffe2b0,
});

// ---- textures, drawn once on first use (the module loads in the browser only)
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const make = (size, draw) => {
    const c = globalThis.document.createElement('canvas');
    c.width = size; c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const blob = (g, x, y, r, inner, outer = 'rgba(255,255,255,0)') => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  TEX = {
    glow: make(128, (g, s) => blob(g, s / 2, s / 2, s / 2, 'rgba(255,255,255,1)')),
    // a tongue of flame: wide and bright at its foot, ragged and thin at its tip
    flame: make(128, (g, s) => {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const t = i / 15;
        blob(g, s / 2 + Math.sin(i * 2.3) * s * 0.07 * t, s * (0.8 - 0.6 * t), s * (0.27 - 0.17 * t), `rgba(255,255,255,${0.55 - 0.35 * t})`);
      }
    }),
    // soft cloud: many faint overlapping puffs
    mist: make(256, (g, s) => {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 52; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.pow(rnd(), 0.7) * s * 0.3;
        blob(g, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.07 + rnd() * 0.15), 'rgba(255,255,255,0.15)');
      }
    }),
    // a shock ring with a soft edge
    ring: make(256, (g, s) => {
      for (let i = 0; i < 8; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.08 + i * 0.06})`;
        g.lineWidth = s * 0.06 * (1 - i / 8);
        g.beginPath(); g.arc(s / 2, s / 2, s * 0.43, 0, Math.PI * 2); g.stroke();
      }
    }),
    // a cracked crater: jagged rays from the middle and a scorched centre
    crack: make(256, (g, s) => {
      blob(g, s / 2, s / 2, s * 0.22, 'rgba(255,255,255,0.55)');
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineCap = 'round';
      for (let i = 0; i < 13; i++) {
        let x = s / 2; let y = s / 2;
        let a = (i / 13) * Math.PI * 2 + rnd() * 0.3;
        g.lineWidth = s * 0.012;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          a += (rnd() - 0.5) * 0.6;
          const step = s * (0.035 + rnd() * 0.04);
          x += Math.cos(a) * step; y += Math.sin(a) * step;
          g.lineTo(x, y);
          g.lineWidth *= 0.8;
        }
        g.stroke();
      }
    }),
    // a circle of light with rune marks (under a levitated body, over a dominated one)
    glyph: make(256, (g, s) => {
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = s * 0.014;
      for (const r of [0.44, 0.36]) { g.beginPath(); g.arc(s / 2, s / 2, s * r, 0, Math.PI * 2); g.stroke(); }
      g.lineWidth = s * 0.02;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = s * 0.37; const r1 = s * (i % 3 ? 0.42 : 0.47);
        g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * r0, s / 2 + Math.sin(a) * r0);
        g.lineTo(s / 2 + Math.cos(a + 0.12) * r1, s / 2 + Math.sin(a + 0.12) * r1); g.stroke();
      }
      g.lineWidth = s * 0.01;
      g.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const x = s / 2 + Math.cos(a) * s * 0.33; const y = s / 2 + Math.sin(a) * s * 0.33;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      blob(g, s / 2, s / 2, s * 0.2, 'rgba(255,255,255,0.35)');
    }),
    // an eye of violet light over a dominated mind
    eye: make(128, (g, s) => {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.moveTo(s * 0.06, s / 2);
      g.quadraticCurveTo(s / 2, s * 0.12, s * 0.94, s / 2);
      g.quadraticCurveTo(s / 2, s * 0.88, s * 0.06, s / 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      blob(g, s / 2, s / 2, s * 0.17, 'rgba(0,0,0,1)', 'rgba(0,0,0,0.9)');
      g.globalCompositeOperation = 'lighter';
      blob(g, s / 2, s / 2, s * 0.09, 'rgba(255,255,255,1)');
    }),
  };
  return TEX;
}

// ---- pools: sprites (camera-facing) and decals (flat on the floor), one texture and blending each
function createSprites(scene, map, { size = 120, additive = true } = {}) {
  const items = [];
  for (let i = 0; i < size; i++) {
    const material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.frustumCulled = false;
    sprite.renderOrder = 3;
    scene.add(sprite);
    items.push({ sprite, material, life: 0, ttl: 0, v: new THREE.Vector3(), s0: 1, s1: 1, o: 1, fadeIn: 0.1, stretch: 1, spin: 0, rise: 0 });
  }
  let cursor = 0;
  return {
    spawn(at, { velocity = null, scale = [0.4, 0.4], ttl = 0.5, hex = 0xffffff, opacity = 1, fadeIn = 0.1, stretch = 1, spin = 0, rotation = Math.random() * Math.PI * 2 } = {}) {
      const it = items[cursor];
      cursor = (cursor + 1) % size;
      it.sprite.position.copy(at);
      it.v.set(velocity?.x || 0, velocity?.y || 0, velocity?.z || 0);
      it.life = 0; it.ttl = ttl; it.s0 = scale[0]; it.s1 = scale[1]; it.o = opacity; it.fadeIn = fadeIn; it.stretch = stretch; it.spin = spin;
      it.material.color.setHex(hex);
      it.material.rotation = rotation;
      it.material.opacity = 0;
      it.sprite.visible = true;
    },
    update(dt) {
      for (const it of items) {
        if (!it.sprite.visible) continue;
        it.life += dt;
        if (it.life >= it.ttl) { it.sprite.visible = false; continue; }
        const k = it.life / it.ttl;
        it.sprite.position.addScaledVector(it.v, dt);
        const s = it.s0 + (it.s1 - it.s0) * k;
        it.sprite.scale.set(s, s * it.stretch, 1);
        it.material.rotation += it.spin * dt;
        it.material.opacity = it.o * Math.min(1, it.life / Math.max(1e-3, it.fadeIn)) * (1 - k) * (1 - k * 0.3);
      }
    },
    dispose() { for (const it of items) { it.material.dispose(); it.sprite.removeFromParent(); } },
  };
}

const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function createDecals(scene, map, { size = 14, additive = true } = {}) {
  const items = [];
  for (let i = 0; i < size; i++) {
    const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(PLANE, material);
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    items.push({ mesh, material, life: 0, ttl: 0, r0: 1, r1: 1, o: 1, spin: 0, follow: null, hold: 0 });
  }
  let cursor = 0;
  return {
    // hold: seconds at full strength before it fades; follow: an Object3D whose x/z it keeps under
    spawn(x, y, z, { from = 0.5, to = 2, ttl = 0.6, hex = 0xffffff, opacity = 1, spin = 0, hold = 0, follow = null } = {}) {
      const it = items[cursor];
      cursor = (cursor + 1) % size;
      it.mesh.position.set(x, y, z);
      it.mesh.rotation.y = Math.random() * Math.PI * 2;
      it.life = 0; it.ttl = ttl; it.r0 = from; it.r1 = to; it.o = opacity; it.spin = spin; it.hold = hold; it.follow = follow;
      it.material.color.setHex(hex);
      it.material.opacity = 0;
      it.mesh.visible = true;
      return it;
    },
    update(dt) {
      for (const it of items) {
        if (!it.mesh.visible) continue;
        it.life += dt;
        if (it.life >= it.ttl) { it.mesh.visible = false; it.follow = null; continue; }
        const k = it.life / it.ttl;
        const grow = 1 - Math.pow(1 - Math.min(1, it.life / Math.max(1e-3, it.ttl - it.hold)), 3);
        const r = it.r0 + (it.r1 - it.r0) * grow;
        it.mesh.scale.set(r * 2, 1, r * 2);
        it.mesh.rotation.y += it.spin * dt;
        if (it.follow) { it.mesh.position.x = it.follow.position.x; it.mesh.position.z = it.follow.position.z; }
        const fade = it.life < it.hold ? 1 : 1 - (it.life - it.hold) / Math.max(1e-3, it.ttl - it.hold);
        it.material.opacity = it.o * Math.min(1, it.life / 0.06) * Math.max(0, fade) * (1 - 0.2 * k);
      }
    },
    dispose() { for (const it of items) { it.material.dispose(); it.mesh.removeFromParent(); } },
  };
}

/**
 * The ability effects. particles: the duel's particle pool ({ spawn }); warp / arena: the picture-warp rings and the
 * floor's light (optional), as vfx.mjs has them.
 */
export function createAbilityFx(scene, { particles, warp = null, arena = null } = {}) {
  const tex = textures();
  const flames = createSprites(scene, tex.flame, { size: 260 });
  const glows = createSprites(scene, tex.glow, { size: 90 });
  const mists = createSprites(scene, tex.mist, { size: 200 });
  const smoke = createSprites(scene, tex.mist, { size: 40, additive: false });
  const eyes = createSprites(scene, tex.eye, { size: 6 });
  const rings = createDecals(scene, tex.ring, { size: 16 });
  const cracks = createDecals(scene, tex.crack, { size: 8, additive: false });
  const glyphs = createDecals(scene, tex.glyph, { size: 10 });
  const mistFloor = createDecals(scene, tex.mist, { size: 12 });
  const at = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const delayed = []; // { at: seconds, run }
  let time = 0;
  const bonesOf = new WeakMap();
  const bones = (actor) => {
    if (!bonesOf.has(actor)) bonesOf.set(actor, AURA_BONES.map((n) => actor.model?.getObjectByName(`mixamorig${n}`)).filter(Boolean));
    return bonesOf.get(actor);
  };
  const boneAt = (actor, out) => {
    const list = bones(actor);
    if (!list.length) return out.copy(actor.chest());
    return list[(Math.random() * list.length) | 0].getWorldPosition(out);
  };
  const head = (actor, out) => {
    const h = actor.model?.getObjectByName('mixamorigHead');
    return h ? h.getWorldPosition(out) : out.copy(actor.chest()).add(tmp.set(0, 0.45, 0));
  };
  const feet = (actor) => actor.root.position;
  // a point on the body pushed out past its outline (so a flame or a wisp shows round the body, not inside it)
  const outline = (actor, out, reach = 0.16) => {
    boneAt(actor, out);
    const r = actor.root.position;
    let dx = out.x - r.x; let dz = out.z - r.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.03) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= len; dz /= len; }
    const k = reach * (0.7 + Math.random() * 0.6);
    return out.set(out.x + dx * k + rand(0.04), out.y + rand(0.05), out.z + dz * k + rand(0.04));
  };
  const later = (seconds, run) => delayed.push({ at: time + seconds, run });
  const motes = (where, count, speed, opts) => {
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1; const a = Math.random() * Math.PI * 2; const r = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.6);
      particles.spawn(where.x, where.y, where.z, r * Math.cos(a) * v, u * v, r * Math.sin(a) * v, opts);
    }
  };
  const dust = (x, z, count, speed) => {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2; const v = speed * (0.5 + Math.random() * 0.5);
      particles.spawn(x + rand(0.4), 0.08, z + rand(0.4), Math.sin(a) * v, 0.6 + Math.random() * 1.6, Math.cos(a) * v,
        { hex: FX_COLORS.dust, size: 0.14 + Math.random() * 0.12, ttl: 0.8 + Math.random() * 0.5, damping: 2.6, fall: 2.2 });
    }
  };

  // ---- a body's own glow, toward a colour (its materials become its own the first time, as a ghost's do)
  const tints = new Map(); // actor -> { hex, amount, target, colour }
  const ownMaterials = (actor) => {
    const list = [];
    actor.model?.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (!o.userData.ownMaterial) {
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        o.userData.ownMaterial = true;
      }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m.emissive) continue;
        if (!m.userData.baseEmissive) m.userData.baseEmissive = { colour: m.emissive.clone(), intensity: m.emissiveIntensity ?? 1 };
        list.push(m);
      }
    });
    return list;
  };
  const tint = (actor, hex, amount) => {
    let t = tints.get(actor);
    if (!t) { t = { amount: 0, target: 0, colour: new THREE.Color(hex), materials: ownMaterials(actor) }; tints.set(actor, t); }
    if (amount >= t.target || t.target === 0) { t.colour.setHex(hex); t.target = amount; }
  };
  const stepTints = (dt) => {
    for (const [actor, t] of tints) {
      t.amount += (t.target - t.amount) * Math.min(1, dt * 6);
      t.target = 0; // a tint lasts while it is asked for, frame by frame
      const pulse = 0.85 + 0.15 * Math.sin(time * 5);
      for (const m of t.materials) {
        const base = m.userData.baseEmissive;
        m.emissive.copy(base.colour).lerp(t.colour, Math.min(1, t.amount));
        m.emissiveIntensity = base.intensity + t.amount * 0.55 * pulse;
      }
      if (t.amount < 0.004) {
        for (const m of t.materials) { m.emissive.copy(m.userData.baseEmissive.colour); m.emissiveIntensity = m.userData.baseEmissive.intensity; }
        tints.delete(actor);
      }
      if (!actor.model) tints.delete(actor);
    }
  };

  // ---- the healing mist (the Healer's Sanctuary): zone id -> { x, z, radius, left, ttl, decals }
  const fields = new Map();
  // ttl: how long it stands (the zone ends at its own time; the effect does not carry the world clock)
  const openField = (e, ttl = 5) => {
    if (fields.has(e.id)) return;
    const decals = [];
    for (let i = 0; i < 3; i++) {
      decals.push(mistFloor.spawn(e.x, 0.05 + i * 0.03, e.z, { from: e.radius * (0.5 + i * 0.2), to: e.radius * (1.02 + i * 0.05), ttl,
        hold: ttl - 0.8, hex: i === 0 ? FX_COLORS.mist : FX_COLORS.mistBlue, opacity: 0.26 - i * 0.05, spin: (i % 2 ? -1 : 1) * (0.12 + i * 0.05) }));
    }
    decals.push(rings.spawn(e.x, 0.06, e.z, { from: e.radius * 0.96, to: e.radius, ttl, hold: ttl - 0.6, hex: FX_COLORS.mistBlue, opacity: 0.45 }));
    fields.set(e.id, { x: e.x, z: e.z, radius: e.radius, left: ttl, ttl });
    // it blooms out from the Healer
    rings.spawn(e.x, 0.07, e.z, { from: 0.3, to: e.radius * 1.1, ttl: 0.7, hex: FX_COLORS.mist, opacity: 0.9 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2; const v = 4 + Math.random() * 2;
      mists.spawn(at.set(e.x, 0.35, e.z), { velocity: tmp.set(Math.sin(a) * v, 0.3, Math.cos(a) * v), scale: [0.9, 2.2], ttl: 1.1, hex: i % 3 ? FX_COLORS.mist : FX_COLORS.mistBlue, opacity: 0.55 });
    }
    warp?.ring({ at: new THREE.Vector3(e.x, 0.5, e.z), kind: 'out', r0: 0.3, r1: e.radius, strength: 0.03, ttl: 0.5 });
    arena?.arc({ x: e.x, z: e.z, arc: 360, from: 0.4, to: e.radius, width: 0.7, strength: 0.9, ttl: 0.6 });
  };
  const stepFields = (dt) => {
    for (const [id, f] of fields) {
      f.left -= dt;
      if (f.left <= 0) { fields.delete(id); continue; }
      const fade = Math.min(1, f.left / 0.8) * Math.min(1, (f.ttl - f.left) / 0.3);
      // low puffs drift over the floor and rise a little; motes of light wander up through them
      if (Math.random() < dt * 22 * fade) {
        const a = Math.random() * Math.PI * 2; const d = Math.sqrt(Math.random()) * f.radius * 0.95;
        mists.spawn(at.set(f.x + Math.sin(a) * d, 0.15 + Math.random() * 0.4, f.z + Math.cos(a) * d),
          { velocity: tmp.set(rand(0.25), 0.18 + Math.random() * 0.2, rand(0.25)), scale: [1.1, 2.4], ttl: 2.2, fadeIn: 0.6,
            hex: Math.random() < 0.45 ? FX_COLORS.mist : FX_COLORS.mistBlue, opacity: 0.16 * fade, spin: rand(0.3) });
      }
      if (Math.random() < dt * 30 * fade) {
        const a = Math.random() * Math.PI * 2; const d = Math.sqrt(Math.random()) * f.radius;
        particles.spawn(f.x + Math.sin(a) * d, 0.1, f.z + Math.cos(a) * d, rand(0.15), 0.5 + Math.random() * 0.7, rand(0.15),
          { hex: Math.random() < 0.5 ? 0xffffff : FX_COLORS.mistBlue, size: 0.035, ttl: 1.4, damping: 0.6 });
      }
    }
  };

  const api = {
    /** Rage begins: a roar of fire off the Warrior, the floor scorched round its feet. */
    rage(actor) {
      const f = feet(actor);
      const c = actor.chest();
      cracks.spawn(f.x, 0.04, f.z, { from: 0.6, to: 2.4, ttl: 2.2, hold: 1.2, hex: 0x3a1a10, opacity: 0.85 });
      rings.spawn(f.x, 0.06, f.z, { from: 0.4, to: 5.5, ttl: 0.6, hex: FX_COLORS.fire[1], opacity: 1 });
      glows.spawn(c, { scale: [1.2, 4.5], ttl: 0.55, hex: FX_COLORS.heat, opacity: 0.9 });
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2; const v = 3 + Math.random() * 3;
        flames.spawn(at.set(f.x + Math.sin(a) * 0.4, 0.3 + Math.random() * 1.2, f.z + Math.cos(a) * 0.4),
          { velocity: tmp.set(Math.sin(a) * v, 2 + Math.random() * 2, Math.cos(a) * v), scale: [0.7, 0.2], ttl: 0.55, stretch: 1.5,
            hex: FX_COLORS.fire[i % 4], opacity: 0.95, rotation: 0 });
      }
      motes(c, 60, 7, { hex: FX_COLORS.ember, size: 0.05, ttl: 0.9, damping: 1.6, fall: -1 });
      warp?.ring({ at: c, kind: 'out', r0: 0.3, r1: 6, strength: 0.06, ttl: 0.55 });
      arena?.arc({ x: f.x, z: f.z, arc: 360, from: 0.4, to: 6, width: 0.9, strength: 1.4, ttl: 0.6 });
    },
    /** Every frame while a body rages: it burns (tongues of flame off its limbs, embers, a heat glow and its own glow). */
    burn(actor, dt) {
      tint(actor, FX_COLORS.heat, 0.16);
      for (let n = Math.ceil(dt * 95); n > 0; n--) {
        outline(actor, at, 0.2);
        flames.spawn(at, { velocity: tmp.set(rand(0.3), 1.4 + Math.random() * 1.3, rand(0.3)),
          scale: [0.48 + Math.random() * 0.3, 0.1], ttl: 0.3 + Math.random() * 0.22, stretch: 1.7, hex: FX_COLORS.fire[(Math.random() * 4) | 0],
          opacity: 0.95, rotation: rand(0.25), fadeIn: 0.04 });
      }
      if (Math.random() < dt * 18) {
        boneAt(actor, at);
        particles.spawn(at.x, at.y, at.z, rand(0.6), 1.4 + Math.random() * 1.4, rand(0.6), { hex: FX_COLORS.ember, size: 0.04, ttl: 0.9, damping: 0.8 });
      }
      if (Math.random() < dt * 7) glows.spawn(actor.chest(), { scale: [1.3, 1.5], ttl: 0.35, hex: FX_COLORS.heat, opacity: 0.2 });
    },
    /** The Sanctuary: a healing mist over the floor. */
    mistField: openField,
    /** Every frame while an ally stands in the mist: its light clings to the body's outline. */
    sheltered(actor, dt) {
      tint(actor, FX_COLORS.mistBlue, 0.1);
      for (let n = Math.ceil(dt * 30); n > 0; n--) {
        outline(actor, at, 0.14);
        mists.spawn(at,{ velocity: tmp.set(rand(0.12), 0.45 + Math.random() * 0.3, rand(0.12)),
          scale: [0.32, 0.6], ttl: 0.7, hex: Math.random() < 0.5 ? FX_COLORS.mist : FX_COLORS.mistBlue, opacity: 0.35, fadeIn: 0.15 });
      }
      if (Math.random() < dt * 14) {
        boneAt(actor, at);
        particles.spawn(at.x, at.y, at.z, rand(0.2), 0.6 + Math.random() * 0.5, rand(0.2), { hex: 0xffffff, size: 0.03, ttl: 0.8, damping: 0.8 });
      }
    },
    /** Mend: a stream of light from the Healer's hand to whoever it heals, and a bloom on them. */
    mend(healer, target) {
      const from = healer.hand();
      const to = target.chest();
      for (let i = 0; i < 28; i++) {
        const t = Math.random();
        const p = tmp.copy(from).lerp(to, t);
        p.y += Math.sin(t * Math.PI) * 0.6;
        particles.spawn(p.x, p.y, p.z, rand(0.2), 0.3, rand(0.2), { hex: i % 3 ? FX_COLORS.mend : 0xffffff, size: 0.045, ttl: 0.35 + t * 0.3, damping: 2 });
      }
      glows.spawn(to, { scale: [0.6, 2.2], ttl: 0.6, hex: FX_COLORS.mend, opacity: 0.8 });
      for (let i = 0; i < 10; i++) {
        boneAt(target, at);
        mists.spawn(at, { velocity: tmp.set(rand(0.2), 0.6, rand(0.2)), scale: [0.3, 0.7], ttl: 0.8, hex: FX_COLORS.mend, opacity: 0.4 });
      }
    },
    /** Every frame while a body mends: a soft green-white glow. */
    mending(actor, dt) {
      tint(actor, FX_COLORS.mend, 0.06);
      if (Math.random() < dt * 10) { boneAt(actor, at); particles.spawn(at.x, at.y, at.z, rand(0.1), 0.7, rand(0.1), { hex: FX_COLORS.mend, size: 0.035, ttl: 0.7, damping: 1 }); }
    },
    /** Levitate takes hold: a circle of light opens under the body and it is lifted off its feet. */
    levitate(caster, target) {
      const f = feet(target);
      glyphs.spawn(f.x, 0.06, f.z, { from: 0.4, to: 1.3, ttl: 2.1, hold: 1.6, hex: FX_COLORS.levitate, opacity: 0.95, spin: 0.9, follow: target.root });
      rings.spawn(f.x, 0.07, f.z, { from: 0.2, to: 2.2, ttl: 0.5, hex: FX_COLORS.levitate, opacity: 0.9 });
      glows.spawn(at.set(f.x, 1, f.z), { scale: [1.2, 1.6], ttl: 0.6, hex: FX_COLORS.levitate, opacity: 0.7, stretch: 2.6 });
      for (let i = 0; i < 30; i++) particles.spawn(f.x + rand(0.6), 0.1, f.z + rand(0.6), rand(0.3), 2.5 + Math.random() * 2, rand(0.3),
        { hex: i % 3 ? FX_COLORS.levitate : 0xffffff, size: 0.04, ttl: 0.7, damping: 1.4 });
      if (caster) {
        const hand = caster.hand();
        for (let i = 0; i < 18; i++) { const p = tmp.copy(hand).lerp(target.chest(), Math.random()); particles.spawn(p.x, p.y, p.z, 0, 0.4, 0, { hex: FX_COLORS.levitate, size: 0.035, ttl: 0.3, damping: 2 }); }
      }
    },
    /** Every frame while a body floats: motes circle it, light falls from it to the floor. */
    floating(actor, dt) {
      tint(actor, FX_COLORS.levitate, 0.08);
      const c = actor.chest();
      for (let i = 0; i < 2; i++) {
        const a = time * 4 + i * Math.PI + rand(0.3);
        particles.spawn(c.x + Math.cos(a) * 0.55, c.y - 0.6 + Math.random() * 1.2, c.z + Math.sin(a) * 0.55, -Math.sin(a) * 1.2, 0.3, Math.cos(a) * 1.2,
          { hex: FX_COLORS.levitate, size: 0.035, ttl: 0.45, damping: 1 });
      }
      if (Math.random() < dt * 20) particles.spawn(c.x + rand(0.3), c.y - 0.9, c.z + rand(0.3), 0, -1.6, 0, { hex: 0xffffff, size: 0.03, ttl: 0.5, damping: 0.5 });
      // a faint column of light from the circle on the floor up to the body
      if (Math.random() < dt * 7) glows.spawn(tmp.set(c.x, c.y / 2, c.z), { scale: [0.5, 0.55], stretch: Math.max(1, c.y / 0.5), ttl: 0.5, hex: FX_COLORS.levitate, opacity: 0.16, rotation: 0 });
    },
    /** Mind Dominance takes hold: a violet crown of light over the head and an eye that watches. */
    dominate(caster, target) {
      const h = head(target, at);
      glyphs.spawn(h.x, h.y + 0.32, h.z, { from: 0.2, to: 0.45, ttl: 2, hold: 1.5, hex: FX_COLORS.dominate, opacity: 0.95, spin: 2.4, follow: target.root });
      eyes.spawn(tmp.copy(h).add(new THREE.Vector3(0, 0.62, 0)), { scale: [0.2, 0.42], ttl: 0.9, hex: FX_COLORS.dominate, opacity: 1, rotation: 0 });
      glows.spawn(h, { scale: [0.4, 1.6], ttl: 0.5, hex: FX_COLORS.dominate, opacity: 0.9 });
      motes(h, 30, 2.5, { hex: FX_COLORS.dominate, size: 0.04, ttl: 0.6, damping: 2 });
      if (caster) {
        const from = caster.hand();
        for (let i = 0; i < 20; i++) { const p = tmp.copy(from).lerp(h, Math.random()); particles.spawn(p.x, p.y, p.z, rand(0.2), rand(0.2), rand(0.2), { hex: FX_COLORS.dominate, size: 0.035, ttl: 0.35, damping: 2 }); }
      }
      warp?.ring({ at: h.clone(), kind: 'in', r0: 0.1, r1: 1.6, strength: 0.03, ttl: 0.4 });
    },
    /** Every frame while a body is dominated: violet wisps round the head, its own glow violet. */
    dominated(actor, dt) {
      tint(actor, FX_COLORS.dominate, 0.1);
      head(actor, at);
      if (Math.random() < dt * 30) {
        const a = time * 6 + rand(1);
        mists.spawn(tmp.set(at.x + Math.cos(a) * 0.25, at.y + 0.15, at.z + Math.sin(a) * 0.25), { velocity: new THREE.Vector3(0, 0.5, 0),
          scale: [0.18, 0.4], ttl: 0.6, hex: Math.random() < 0.5 ? FX_COLORS.dominate : FX_COLORS.dominateDeep, opacity: 0.6 });
      }
      if (Math.random() < dt * 3) eyes.spawn(tmp.copy(at).add(new THREE.Vector3(0, 0.62, 0)), { scale: [0.18, 0.2], ttl: 0.6, hex: FX_COLORS.dominate, opacity: 0.6, rotation: 0 });
    },
    /** The second hit breaks a Mind Dominance: the crown shatters. */
    dominanceBroken(actor) {
      const h = head(actor, at);
      motes(h, 46, 5, { hex: FX_COLORS.dominate, size: 0.05, ttl: 0.5, damping: 3 });
      glows.spawn(h, { scale: [0.3, 1.4], ttl: 0.3, hex: 0xffffff, opacity: 0.8 });
    },
    /** The Assassin steps through the veil: smoke where she was and where she comes out, a dark streak between. */
    blink(actor, from, to) {
      for (const p of [from, to]) {
        for (let i = 0; i < 10; i++) {
          smoke.spawn(at.set(p.x + rand(0.4), 0.4 + Math.random() * 1.4, p.z + rand(0.4)), { velocity: tmp.set(rand(0.8), 0.4 + Math.random() * 0.4, rand(0.8)),
            scale: [0.7, 1.6], ttl: 0.9, hex: FX_COLORS.shadow, opacity: 0.75, spin: rand(0.6) });
        }
        mists.spawn(at.set(p.x, 1, p.z), { scale: [1, 2.2], ttl: 0.5, hex: FX_COLORS.blink, opacity: 0.7 });
        motes(at.set(p.x, 1, p.z), 26, 3.5, { hex: FX_COLORS.blink, size: 0.045, ttl: 0.5, damping: 2.5 });
      }
      for (let i = 0; i < 40; i++) {
        const t = Math.random();
        particles.spawn(from.x + (to.x - from.x) * t, 0.6 + Math.random() * 1.0, from.z + (to.z - from.z) * t, 0, 0.2, 0,
          { hex: i % 2 ? FX_COLORS.blink : FX_COLORS.shadow, size: 0.05, ttl: 0.25 + t * 0.25, damping: 2 });
      }
      warp?.ring({ at: new THREE.Vector3(to.x, 1, to.z), kind: 'in', r0: 0.2, r1: 2.4, strength: 0.05, ttl: 0.35 });
    },
    /** The Execution seizes its target: a golden tether from the Duelist's hand (every frame while it draws it in). */
    seizing(holder, held, dt) {
      const a = holder.hand();
      const b = held.chest();
      for (let n = Math.ceil(dt * 260); n > 0; n--) {
        const t = Math.random();
        const p = tmp.copy(a).lerp(b, t);
        p.y += Math.sin(t * Math.PI) * 0.15 + rand(0.04);
        particles.spawn(p.x, p.y, p.z, (a.x - b.x) * 0.8, 0, (a.z - b.z) * 0.8, { hex: n % 3 ? FX_COLORS.seize : 0xffffff, size: 0.06, ttl: 0.18, damping: 3 });
      }
      tint(held, FX_COLORS.seize, 0.08);
      // beads of light along the tether
      for (let i = 0; i < 2; i++) glows.spawn(tmp.copy(a).lerp(b, Math.random()), { scale: [0.2, 0.1], ttl: 0.12, hex: FX_COLORS.seize, opacity: 0.8 });
    },
    /** The blade comes out and the body is pushed away. */
    shove(holder, held) {
      const c = held.chest();
      glows.spawn(c, { scale: [0.5, 2.4], ttl: 0.4, hex: FX_COLORS.seize, opacity: 0.85 });
      motes(c, 40, 6, { hex: FX_COLORS.seize, size: 0.05, ttl: 0.45, damping: 3 });
      const f = feet(held);
      rings.spawn(f.x, 0.06, f.z, { from: 0.3, to: 2.4, ttl: 0.45, hex: FX_COLORS.seize, opacity: 0.8 });
      warp?.ring({ at: c.clone(), kind: 'out', r0: 0.2, r1: 3, strength: 0.05, ttl: 0.4 });
    },
    /** Leap Strike: light trails the leap, and the landing cracks the floor. */
    leap(actor, landIn = 0.4) {
      const trail = (left) => {
        if (left <= 0 || !actor.model) return;
        const c = actor.chest();
        for (let i = 0; i < 5; i++) particles.spawn(c.x + rand(0.2), c.y + rand(0.5), c.z + rand(0.2), 0, -0.2, 0, { hex: FX_COLORS.fire[1], size: 0.06, ttl: 0.35, damping: 2 });
        later(1 / 30, () => trail(left - 1 / 30));
      };
      trail(landIn);
      later(landIn, () => api.slam(actor, { big: true }));
    },
    /** A slam: a ring of force over the floor, cracks, dust thrown up. */
    slam(actor, { big = false } = {}) {
      const f = feet(actor);
      cracks.spawn(f.x, 0.04, f.z, { from: 0.4, to: big ? 2.2 : 1.7, ttl: 2.4, hold: 1.4, hex: 0x2a2018, opacity: 0.9 });
      rings.spawn(f.x, 0.06, f.z, { from: 0.3, to: big ? 4.5 : 6, ttl: 0.45, hex: FX_COLORS.slam, opacity: 1 });
      rings.spawn(f.x, 0.08, f.z, { from: 0.2, to: big ? 3 : 4, ttl: 0.6, hex: FX_COLORS.fire[1], opacity: 0.7 });
      dust(f.x, f.z, big ? 40 : 54, big ? 5 : 6.5);
      glows.spawn(at.set(f.x, 0.4, f.z), { scale: [1, 3.4], ttl: 0.3, hex: FX_COLORS.slam, opacity: 0.8 });
      warp?.ring({ at: new THREE.Vector3(f.x, 0.4, f.z), kind: 'out', r0: 0.3, r1: big ? 4 : 5.5, strength: 0.06, ttl: 0.45 });
      arena?.arc({ x: f.x, z: f.z, arc: 360, from: 0.3, to: big ? 5 : 6.5, width: 0.8, strength: 1.4, ttl: 0.5 });
    },
    /** Someone thrown up by a Repulse: streaks under them as they leave the floor. */
    launched(actor) {
      const f = feet(actor);
      for (let i = 0; i < 16; i++) particles.spawn(f.x + rand(0.3), 0.1, f.z + rand(0.3), rand(0.4), 4 + Math.random() * 3, rand(0.4), { hex: FX_COLORS.slam, size: 0.045, ttl: 0.4, damping: 2 });
    },
    /** A dash in the air: an after-image streak of light. */
    airDash(actor, dir) {
      const c = actor.chest();
      for (let i = 0; i < 34; i++) {
        const back = Math.random() * 2.2;
        particles.spawn(c.x - dir.x * back + rand(0.2), c.y + rand(0.6), c.z - dir.z * back + rand(0.2), -dir.x * 2, rand(0.3), -dir.z * 2,
          { hex: i % 4 ? 0xbfe6ff : 0xffffff, size: 0.05, ttl: 0.3, damping: 3 });
      }
      glows.spawn(c, { scale: [0.8, 0.3], ttl: 0.25, hex: 0xbfe6ff, opacity: 0.6, stretch: 0.5 });
      warp?.ring({ at: c.clone(), kind: 'out', r0: 0.2, r1: 2.2, strength: 0.03, ttl: 0.3 });
    },
    /** The second jump: a ring of force kicked off the air under the feet. */
    airJump(actor) {
      const f = feet(actor);
      rings.spawn(f.x, Math.max(0.06, f.y + 0.05), f.z, { from: 0.15, to: 1.4, ttl: 0.35, hex: 0xd8f2ff, opacity: 0.9 });
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; particles.spawn(f.x, f.y + 0.05, f.z, Math.sin(a) * 3, -0.6, Math.cos(a) * 3, { hex: 0xd8f2ff, size: 0.04, ttl: 0.3, damping: 3 }); }
    },
    /** A taunt: the class's colour flares off the body. */
    taunt(actor, hex) {
      const c = actor.chest();
      glows.spawn(c, { scale: [0.6, 2.4], ttl: 0.6, hex, opacity: 0.6 });
      for (let i = 0; i < 16; i++) { boneAt(actor, at); mists.spawn(at, { velocity: tmp.set(rand(0.3), 0.8, rand(0.3)), scale: [0.25, 0.6], ttl: 0.7, hex, opacity: 0.45 }); }
    },
    update(dt) {
      time += dt;
      for (let i = delayed.length - 1; i >= 0; i--) if (delayed[i].at <= time) { const { run } = delayed[i]; delayed.splice(i, 1); run(); }
      stepFields(dt);
      stepTints(dt);
      flames.update(dt); glows.update(dt); mists.update(dt); smoke.update(dt); eyes.update(dt);
      rings.update(dt); cracks.update(dt); glyphs.update(dt); mistFloor.update(dt);
    },
    dispose() {
      flames.dispose(); glows.dispose(); mists.dispose(); smoke.dispose(); eyes.dispose();
      rings.dispose(); cracks.dispose(); glyphs.dispose(); mistFloor.dispose();
      for (const t of tints.values()) for (const m of t.materials) { m.emissive.copy(m.userData.baseEmissive.colour); m.emissiveIntensity = m.userData.baseEmissive.intensity; }
      tints.clear(); fields.clear(); delayed.length = 0;
    },
  };
  return api;
}
