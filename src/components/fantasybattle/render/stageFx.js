/**
 * Fantasy Battle stage dressing and effects, all drawn procedurally (no image assets): the backdrop, ground shadows,
 * arrows in flight with their trails and hitboxes, hit sparks, the guard ward, the charge glow and screen shake.
 */
import * as THREE from 'three';

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function makeBackdropTexture() {
  return canvasTexture(1600, 900, (g, w, h) => {
    const rand = seeded(17);
    const sky = g.createLinearGradient(0, 0, 0, h * 0.72);
    sky.addColorStop(0, '#141a36'); sky.addColorStop(0.45, '#4a3a6e'); sky.addColorStop(0.8, '#c67b6a'); sky.addColorStop(1, '#f2b37a');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i += 1) { g.fillStyle = `rgba(255,255,240,${0.2 + rand() * 0.6})`; g.fillRect(rand() * w, rand() * h * 0.4, 1.6, 1.6); }
    const sun = g.createRadialGradient(w * 0.5, h * 0.66, 10, w * 0.5, h * 0.66, h * 0.5);
    sun.addColorStop(0, 'rgba(255,228,170,0.95)'); sun.addColorStop(0.18, 'rgba(255,190,120,0.45)'); sun.addColorStop(1, 'rgba(255,160,110,0)');
    g.fillStyle = sun; g.fillRect(0, 0, w, h);
    const ridge = (base, amp, color, step) => {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, h);
      let y = base;
      for (let x = 0; x <= w + step; x += step) { y = Math.max(base - amp, Math.min(base + amp * 0.4, y + (rand() - 0.5) * amp * 0.5)); g.lineTo(x, y); }
      g.lineTo(w, h); g.closePath(); g.fill();
    };
    ridge(h * 0.6, 90, '#5b4170', 40);
    ridge(h * 0.66, 70, '#3c2c52', 32);
    // a broken colonnade on each side
    g.fillStyle = '#2a2140';
    for (const x0 of [w * 0.06, w * 0.16, w * 0.78, w * 0.9]) {
      const ph = h * (0.18 + rand() * 0.12);
      g.fillRect(x0, h * 0.7 - ph, 30, ph);
      g.fillRect(x0 - 8, h * 0.7 - ph - 10, 46, 12);
    }
    const floor = g.createLinearGradient(0, h * 0.7, 0, h);
    floor.addColorStop(0, '#4b3d5c'); floor.addColorStop(1, '#1d1726');
    g.fillStyle = floor; g.fillRect(0, h * 0.7, w, h * 0.3);
    g.strokeStyle = 'rgba(255,220,180,0.10)'; g.lineWidth = 2;
    for (let i = -12; i <= 12; i += 1) { g.beginPath(); g.moveTo(w / 2 + i * 40, h * 0.7); g.lineTo(w / 2 + i * 180, h); g.stroke(); }
    for (let r = 0; r < 6; r += 1) { const y = h * 0.7 + (h * 0.3) * ((r + 1) / 6) ** 1.6; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    const glow = g.createLinearGradient(0, h * 0.66, 0, h * 0.74);
    glow.addColorStop(0, 'rgba(255,200,150,0)'); glow.addColorStop(0.5, 'rgba(255,200,150,0.25)'); glow.addColorStop(1, 'rgba(255,200,150,0)');
    g.fillStyle = glow; g.fillRect(0, h * 0.66, w, h * 0.08);
  });
}

const radial = (stops) => canvasTexture(128, 128, (g, w, h) => {
  const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
});

export function makeFxTextures() {
  const glow = radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  const shadow = radial([[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
  const spark = canvasTexture(128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2);
    for (let i = 0; i < 4; i += 1) {
      g.rotate(Math.PI / 4 * (i % 2 ? 1 : 1));
      const grad = g.createLinearGradient(-w / 2, 0, w / 2, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(0, i % 2 ? -4 : -7); g.lineTo(w / 2, 0); g.lineTo(0, i % 2 ? 4 : 7); g.closePath(); g.fill();
    }
  });
  const ring = canvasTexture(256, 256, (g, w, h) => {
    const cx = w / 2; const cy = h / 2;
    const grad = g.createRadialGradient(cx, cy, w * 0.3, cx, cy, w * 0.5);
    grad.addColorStop(0, 'rgba(180,230,255,0)'); grad.addColorStop(0.75, 'rgba(200,240,255,0.55)'); grad.addColorStop(0.9, 'rgba(255,255,255,0.95)'); grad.addColorStop(1, 'rgba(200,240,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(220,245,255,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * w * 0.44, cy + Math.sin(a) * h * 0.44); g.stroke();
    }
    g.beginPath();
    for (let i = 0; i <= 6; i += 1) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; g.lineTo(cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * h * 0.3); }
    g.stroke();
  });
  const trail = canvasTexture(128, 16, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.7, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const fade = g.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.5, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, w, h);
  });
  return { glow, shadow, spark, ring, trail };
}

const TRAIL_STYLES = {
  gold: { color: 0xffc86a, width: 9, glow: 0xffd88a },
  silver: { color: 0xd8e6ff, width: 7, glow: 0xc8dcff },
  radiant: { color: 0xfff1b8, width: 20, glow: 0xffe9a0 },
};

function additive(map, color = 0xffffff) {
  return new THREE.MeshBasicMaterial({ map, color, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

/** Distance from point p to segment ab. */
export function segmentPointDistance(ax, ay, bx, by, px, py) {
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

const TRAIL_POINTS = 14;

function sampleAt(samples, t) {
  if (t <= samples[0].t) return [samples[0].x, samples[0].y];
  for (let i = 1; i < samples.length; i += 1) {
    const b = samples[i];
    if (t <= b.t) {
      const a = samples[i - 1];
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return [a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u];
    }
  }
  const last = samples[samples.length - 1];
  return [last.x, last.y];
}

export class FxSystem {
  constructor(scene, arrowTexture) {
    this.scene = scene;
    this.tex = makeFxTextures();
    this.arrowTexture = arrowTexture;
    this.arrows = [];
    this.bursts = [];
    this.wards = new Map();
    this.glows = new Map();
    this.shake = { trauma: 0, time: 0, decay: 1 };
    this.debugHitboxes = false;
    this.hitboxLines = null;
  }

  /**
   * An arrow in flight. Its hitbox (a short segment around the head) is live only while `activeUntil` lasts, and only
   * when the round's roll says it hits; a miss is aimed past the target and never collides.
   */
  spawnArrow({ from, angle, target, aim, speed = 2300, arc = 0.04, scale = 1, style = 'gold', trailLength = 0.1, activeFor = 0.9, result = null, onHit = null, renderBase = 900, impact = {} }) {
    const length = 292 * scale;
    const tail = [from[0], from[1]];
    const head = [tail[0] + Math.cos(angle) * length, tail[1] + Math.sin(angle) * length];
    const dx = aim[0] - head[0]; const dy = aim[1] - head[1];
    const dist = Math.hypot(dx, dy);
    const T = Math.max(0.12, dist / speed);
    const g = arc * 9000;
    const vel = [dx / T, dy / T + 0.5 * g * T];
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(-0.5, 0, 0), new THREE.MeshBasicMaterial({ map: this.arrowTexture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    mesh.scale.set(length, length * (18 / 168), 1);
    mesh.renderOrder = renderBase + 2;
    mesh.frustumCulled = false;
    const st = TRAIL_STYLES[style] || TRAIL_STYLES.gold;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 2 * 3), 3));
    const uv = new Float32Array(TRAIL_POINTS * 2 * 2);
    for (let i = 0; i < TRAIL_POINTS; i += 1) { uv.set([i / (TRAIL_POINTS - 1), 0, i / (TRAIL_POINTS - 1), 1], i * 4); }
    trailGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i += 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    trailGeo.setIndex(idx);
    const trail = new THREE.Mesh(trailGeo, additive(this.tex.trail, st.color));
    trail.renderOrder = renderBase + 1;
    trail.frustumCulled = false;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(this.tex.glow, st.glow));
    glow.scale.setScalar(style === 'radiant' ? 150 : 70);
    glow.renderOrder = renderBase + 3;
    glow.frustumCulled = false;
    this.scene.add(trail, mesh, glow);
    const arrow = { mesh, trail, glow, head, vel, g, length, style: st, styleName: style, trailLength, samples: [{ t: 0, x: head[0], y: head[1] }], age: 0, life: T + 1.2,
      activeUntil: activeFor, target, result, onHit, done: false, impact, hitRadius: 10 + 6 * scale };
    this.arrows.push(arrow);
    this.placeArrow(arrow);
    return arrow;
  }

  placeArrow(a) {
    const angle = Math.atan2(a.vel[1], a.vel[0]);
    a.mesh.position.set(a.head[0], a.head[1], 0);
    a.mesh.rotation.z = angle;
    a.glow.position.set(a.head[0], a.head[1], 0);
    const pos = a.trail.geometry.attributes.position.array;
    // the trail covers the last trailLength seconds of flight, whatever the frame rate
    const pts = [];
    for (let i = 0; i < TRAIL_POINTS; i += 1) pts.push(sampleAt(a.samples, a.age - a.trailLength * (1 - i / (TRAIL_POINTS - 1))));
    for (let i = 0; i < TRAIL_POINTS; i += 1) {
      const p = pts[i];
      const q = pts[Math.min(TRAIL_POINTS - 1, i + 1)];
      const r = pts[Math.max(0, i - 1)];
      let nx = -(q[1] - r[1]); let ny = q[0] - r[0];
      const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      const w = a.style.width * (i / (TRAIL_POINTS - 1)) ** 0.7;
      pos.set([p[0] + nx * w, p[1] + ny * w, 0, p[0] - nx * w, p[1] - ny * w, 0], i * 6);
    }
    a.trail.geometry.attributes.position.needsUpdate = true;
  }

  /** @param hurtboxOf (target) -> {x, y, r} in world units */
  update(dt, hurtboxOf) {
    for (const a of this.arrows) {
      if (a.done) continue;
      a.age += dt;
      const prev = [a.head[0], a.head[1]];
      if (!a.stuck) {
        a.vel[1] -= a.g * dt;
        a.head[0] += a.vel[0] * dt;
        a.head[1] += a.vel[1] * dt;
        a.samples.push({ t: a.age, x: a.head[0], y: a.head[1] });
        while (a.samples.length > 2 && a.samples[1].t < a.age - a.trailLength - 0.05) a.samples.shift();
      }
      a.hitboxLive = !a.stuck && a.age <= a.activeUntil && a.result?.hit === true;
      if (a.hitboxLive && a.target) {
        const hb = hurtboxOf(a.target);
        if (segmentPointDistance(prev[0], prev[1], a.head[0], a.head[1], hb.x, hb.y) <= hb.r + a.hitRadius) {
          a.stuck = true;
          a.stuckAge = 0;
          a.head = [hb.x + (prev[0] - hb.x) * 0.25, Math.max(hb.y - hb.r * 0.6, Math.min(hb.y + hb.r * 0.6, a.head[1]))];
          a.onHit?.(a);
        }
      }
      if (a.stuck) {
        a.stuckAge += dt;
        const fade = Math.max(0, 1 - a.stuckAge / 0.35);
        a.mesh.material.opacity = fade; a.trail.material.opacity = fade * 0.7; a.glow.material.opacity = fade;
        if (fade <= 0) a.done = true;
      } else if (a.age > a.life) {
        a.done = true;
      }
      if (!a.done) this.placeArrow(a);
    }
    for (const a of this.arrows) if (a.done && a.mesh.parent) this.disposeArrow(a);
    this.arrows = this.arrows.filter((a) => !a.done);
    this.updateBursts(dt);
    this.updateWards(dt);
    this.updateShake(dt);
  }

  disposeArrow(a) {
    for (const m of [a.mesh, a.trail, a.glow]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    a.onDone?.(a);
  }

  get flying() { return this.arrows.length; }

  burst(x, y, { crit = false, guarded = false, renderBase = 950 } = {}) {
    const color = guarded ? 0x9fe0ff : crit ? 0xffb84a : 0xffe2a8;
    const star = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(this.tex.spark, color));
    star.position.set(x, y, 0); star.renderOrder = renderBase + 2; star.frustumCulled = false;
    this.scene.add(star);
    const parts = [];
    const n = crit ? 16 : 10;
    for (let i = 0; i < n; i += 1) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(this.tex.glow, color));
      const a = Math.random() * Math.PI * 2; const sp = 300 + Math.random() * (crit ? 700 : 450);
      p.position.set(x, y, 0); p.renderOrder = renderBase + 1; p.frustumCulled = false; p.scale.setScalar(14 + Math.random() * 12);
      p.userData.vel = [Math.cos(a) * sp, Math.sin(a) * sp];
      parts.push(p); this.scene.add(p);
    }
    this.bursts.push({ star, parts, age: 0, life: crit ? 0.45 : 0.35, size: crit ? 300 : guarded ? 190 : 210 });
  }

  updateBursts(dt) {
    for (const b of this.bursts) {
      b.age += dt;
      const t = Math.min(1, b.age / b.life);
      b.star.scale.setScalar(b.size * (0.35 + 0.9 * Math.sqrt(t)));
      b.star.rotation.z += dt * 2;
      b.star.material.opacity = 1 - t;
      for (const p of b.parts) {
        const v = p.userData.vel; v[1] -= 900 * dt; v[0] *= 0.96; v[1] *= 0.96;
        p.position.x += v[0] * dt; p.position.y += v[1] * dt;
        p.material.opacity = 1 - t;
      }
    }
    for (const b of this.bursts) {
      if (b.age < b.life) continue;
      for (const m of [b.star, ...b.parts]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    }
    this.bursts = this.bursts.filter((b) => b.age < b.life);
  }

  /** The guard's ward in front of a fighter, until clearWard. */
  ward(key, x, y, facing, renderBase = 980) {
    let w = this.wards.get(key);
    if (!w) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(this.tex.ring, 0xbfe8ff));
      mesh.renderOrder = renderBase; mesh.frustumCulled = false;
      this.scene.add(mesh);
      w = { mesh, age: 0, flash: 0, fading: false };
      this.wards.set(key, w);
    }
    w.fading = false;
    w.mesh.position.set(x + facing * 150, y, 0);
    w.mesh.scale.set(150, 420, 1);
    return w;
  }

  flashWard(key) { const w = this.wards.get(key); if (w) w.flash = 1; }

  clearWard(key) { const w = this.wards.get(key); if (w) w.fading = true; }

  updateWards(dt) {
    for (const [key, w] of this.wards) {
      w.age += dt;
      w.flash = Math.max(0, w.flash - dt * 3);
      const base = w.fading ? Math.max(0, (w.mesh.material.opacity || 0) - dt * 2.5) : Math.min(0.75, 0.15 + w.age * 2);
      w.mesh.material.opacity = Math.min(1, (w.fading ? base : base * (0.85 + 0.15 * Math.sin(w.age * 6))) + w.flash * 0.6);
      if (w.fading && w.mesh.material.opacity <= 0.01) { this.scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose(); this.wards.delete(key); }
    }
  }

  /** A glow at a point (the charging arrowhead), sized by strength 0..1; strength 0 removes it. */
  glowAt(key, x, y, strength, renderBase = 990) {
    let g = this.glows.get(key);
    if (strength <= 0.01) {
      if (g) { this.scene.remove(g.mesh, ...g.motes); g.mesh.geometry.dispose(); g.mesh.material.dispose(); for (const m of g.motes) { m.geometry.dispose(); m.material.dispose(); } this.glows.delete(key); }
      return;
    }
    if (!g) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(this.tex.glow, 0xffe9a8));
      mesh.renderOrder = renderBase; mesh.frustumCulled = false;
      const motes = Array.from({ length: 8 }, () => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(this.tex.glow, 0xfff3c8));
        m.renderOrder = renderBase + 1; m.frustumCulled = false; m.userData.phase = Math.random() * Math.PI * 2;
        return m;
      });
      this.scene.add(mesh, ...motes);
      g = { mesh, motes, t: 0 };
      this.glows.set(key, g);
    }
    g.t += 1 / 60;
    g.mesh.position.set(x, y, 0);
    g.mesh.scale.setScalar(40 + 160 * strength * (0.9 + 0.1 * Math.sin(g.t * 20)));
    g.mesh.material.opacity = 0.35 + 0.65 * strength;
    g.motes.forEach((m, i) => {
      const ph = m.userData.phase + g.t * (2 + i * 0.3);
      const r = 140 * (1 - ((g.t * 0.9 + i / 8) % 1));
      m.position.set(x + Math.cos(ph) * r, y + Math.sin(ph) * r, 0);
      m.scale.setScalar(10 + 10 * strength);
      m.material.opacity = strength;
    });
  }

  addShake(intensity, duration = 0.15) {
    this.shake.trauma = Math.min(1.6, this.shake.trauma + intensity / 6);
    this.shake.decay = 1 / Math.max(0.05, duration * 2);
  }

  updateShake(dt) {
    this.shake.time += dt;
    this.shake.trauma = Math.max(0, this.shake.trauma - dt * this.shake.decay);
  }

  /** Camera offset for the current shake (world units). Uses wall time so it runs through hit-stop. */
  shakeOffset() {
    const k = this.shake.trauma * this.shake.trauma * 26;
    const t = this.shake.time * 60;
    return [k * (Math.sin(t * 1.7) + Math.sin(t * 3.1) * 0.5) / 1.5, k * (Math.sin(t * 2.3 + 1) + Math.sin(t * 4.3) * 0.5) / 1.5];
  }

  setDebugHitboxes(on) { this.debugHitboxes = on; if (!on && this.hitboxLines) this.hitboxLines.visible = false; }

  /** Debug overlay: hurtbox circles, and the hitbox of every arrow whose hitbox is live. */
  drawHitboxes(circles) {
    if (!this.debugHitboxes) return;
    const SEG = 24;
    const all = [...circles, ...this.arrows.filter((a) => a.hitboxLive).map((a) => ({ x: a.head[0], y: a.head[1], r: a.hitRadius, live: true }))];
    const needed = all.length * SEG * 2 * 3;
    if (!this.hitboxLines || this.hitboxLines.geometry.attributes.position.array.length < needed) {
      if (this.hitboxLines) { this.scene.remove(this.hitboxLines); this.hitboxLines.geometry.dispose(); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(needed, 64 * SEG * 6)), 3));
      this.hitboxLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffef5a, depthTest: false, depthWrite: false, transparent: true }));
      this.hitboxLines.renderOrder = 6000; this.hitboxLines.frustumCulled = false;
      this.scene.add(this.hitboxLines);
    }
    const pos = this.hitboxLines.geometry.attributes.position.array;
    let k = 0;
    for (const c of all) {
      for (let i = 0; i < SEG; i += 1) {
        const a0 = (i / SEG) * Math.PI * 2; const a1 = ((i + 1) / SEG) * Math.PI * 2;
        pos.set([c.x + Math.cos(a0) * c.r, c.y + Math.sin(a0) * c.r, 0, c.x + Math.cos(a1) * c.r, c.y + Math.sin(a1) * c.r, 0], k); k += 6;
      }
    }
    this.hitboxLines.geometry.setDrawRange(0, k / 3);
    this.hitboxLines.geometry.attributes.position.needsUpdate = true;
    this.hitboxLines.visible = true;
  }

  dispose() {
    for (const a of this.arrows) this.disposeArrow(a);
    for (const b of this.bursts) for (const m of [b.star, ...b.parts]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    for (const key of [...this.wards.keys()]) { const w = this.wards.get(key); this.scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose(); }
    for (const key of [...this.glows.keys()]) this.glowAt(key, 0, 0, 0);
    if (this.hitboxLines) { this.hitboxLines.geometry.dispose(); this.hitboxLines.material.dispose(); }
    for (const t of Object.values(this.tex)) t.dispose();
  }
}
