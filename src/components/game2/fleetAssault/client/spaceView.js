// Fleet Assault space scene, drawn with Game 2's own WebGL2 renderer (engine/gl.js), unchanged: this view owns a
// separate Renderer on its own canvas, sets a rolling camera with a long draw distance, and uses the renderer's static
// meshes and additive / alpha billboard batches for lasers, engines, explosions and stars.\n// Optimized uploaded GLBs are loaded as static LOD geometry when available, with safe procedural fallbacks.
import { Renderer, geo } from '../../engine/gl.js';
import { m4 } from '../../engine/math.js';
import { QUALITY_DPR } from '../../settings.js';
import { CRUISER, SUBSYSTEM_IDS } from '../../../../../server/game2/fleet/rules.mjs';
import { BATTLEFIELD } from '../../../../../server/game2/fleet/battlefield.mjs';
import { FLEET_MODEL_ASSETS, loadFleetModelMeshes } from './modelAssets.js';
import { add, addScaled, forwardOf, fromBoxLocal, lerp3, norm, qrot, scale, upOf } from '../../../../../server/game2/fleet/vec.mjs';

const NEAR = 1, FAR = 90000;
const SIDE_COL = {
  republic: { bolt: [1, 0.28, 0.18, 1], glow: [0.45, 0.7, 1, 1], ui: [0.45, 0.8, 1] },
  separatist: { bolt: [0.45, 1, 0.3, 1], glow: [1, 0.6, 0.25, 1], ui: [1, 0.45, 0.35] },
};
const PLANET = { p: [-21000, -15000, -36000], r: 10000 };

function fighterMesh(rep) {
  const g = geo();
  const hull = rep ? [0.82, 0.84, 0.88] : [0.6, 0.5, 0.37], accent = rep ? [0.72, 0.16, 0.13] : [0.34, 0.42, 0.56], dark = [0.16, 0.17, 0.2], glass = [0.08, 0.12, 0.2];
  if (rep) {
    g.box(0, 0, 0, 1.6, 1.2, 9, hull).box(0, 0.75, -1.6, 1.0, 0.6, 2.2, glass).box(0, 0, -5.1, 1.0, 0.8, 1.4, accent);
    for (const s of [-1, 1]) {
      g.box(s * 3.1, 0, 1.1, 4.6, 0.25, 3.2, hull).box(s * 3.1, 0.14, 1.1, 4.6, 0.04, 0.7, accent);
      g.box(s * 3.2, -0.5, -2.4, 0.35, 0.35, 4.2, dark).box(s * 1.25, 0, 4.6, 0.9, 0.9, 1.6, dark);
    }
  } else {
    g.box(0, 0, 0.6, 2.2, 2.2, 4, hull).box(0, 0.9, -0.8, 1.2, 0.5, 1.2, glass).box(0, 0, 2.9, 1.4, 1.4, 1.2, dark);
    for (const s of [-1, 1]) {
      g.box(s * 1.5, 0, -3.1, 0.5, 0.9, 5, hull).box(s * 3.4, 0, 0.8, 3, 0.3, 2.2, accent).box(s * 4.7, 1.0, 0.8, 0.3, 2.6, 2.2, hull);
      g.box(s * 3.2, -0.5, -2.4, 0.3, 0.3, 4.2, dark);
    }
  }
  return g.build();
}
// level 2: a heavier gunship; level 3: a slim Jedi interceptor (Republic) or a dark one (Separatist)
function commandMesh(rep) {
  const g = geo();
  const hull = rep ? [0.8, 0.82, 0.86] : [0.58, 0.49, 0.36], accent = rep ? [0.72, 0.16, 0.13] : [0.34, 0.42, 0.56], dark = [0.16, 0.17, 0.2], glass = [0.08, 0.12, 0.2];
  if (rep) {
    g.box(0, 0, 0, 3.2, 2.2, 12, hull).box(0, 1.4, -3, 1.8, 0.8, 3, glass).box(0, 0, -6.6, 2.2, 1.6, 1.4, accent);
    for (const s of [-1, 1]) g.box(s * 3.6, 0, 1, 5, 0.4, 5, hull).box(s * 3.6, 0.22, 1, 5, 0.04, 1, accent).box(s * 1.5, 0, 6.6, 1.4, 1.4, 1.6, dark);
  } else {
    g.box(0, 0, 0.5, 4, 3, 10, hull).box(0, 2.4, 1, 0.5, 2.4, 5, accent).box(0, 1.2, -2.6, 1.6, 0.7, 2, glass).box(0, 0, 6, 2, 2, 1.4, dark);
    for (const s of [-1, 1]) g.box(s * 1.8, 0, -5, 0.8, 1.2, 4, hull).box(s * 3.6, -0.3, 1, 3.6, 0.5, 4, hull);
  }
  for (const s of [-1, 1]) g.box(s * 4.2, -0.6, -3.5, 0.4, 0.4, 4, dark).box(s * 2.2, 0.8, -3.7, 0.35, 0.35, 4.2, dark);
  return g.build();
}
function jediMesh(rep) {
  const g = geo();
  const dark = [0.12, 0.12, 0.14], glass = [0.08, 0.12, 0.2];
  if (rep) {
    const hull = [0.86, 0.72, 0.22], accent = [0.7, 0.16, 0.12];
    g.box(0, 0, 0, 1.0, 0.7, 6, hull).box(0, 0.45, -1, 0.7, 0.4, 1.6, glass).box(0, 0, -3.4, 0.6, 0.5, 1, accent);
    for (const s of [-1, 1]) g.box(s * 2.2, 0, 1.2, 3.6, 0.15, 2.6, hull).box(s * 3.6, 0.1, 1.2, 0.8, 0.05, 2.4, accent).box(s * 3.2, -0.5, -2.4, 0.25, 0.25, 4.2, dark).box(s * 0.6, 0, 3.1, 0.5, 0.5, 0.8, dark);
  } else {
    const edge = [0.62, 0.08, 0.08];
    g.box(0, 0, 0, 1.6, 1.6, 3, dark).box(0, 0, -1.6, 1.0, 1.0, 0.6, glass);
    for (const s of [-1, 1]) g.box(s * 2.6, 0, 0.3, 0.3, 4.2, 3.2, dark).box(s * 2.62, 2.1, 0.3, 0.32, 0.12, 3.2, edge).box(s * 2.62, -2.1, 0.3, 0.32, 0.12, 3.2, edge).box(s * 1.4, 0, 0.3, 2.4, 0.4, 0.6, dark).box(s * 3.2, -0.5, -2.4, 0.25, 0.25, 4.2, dark);
  }
  return g.build();
}
// engine nozzles (local x) and how far back they sit, per side and ship class
const ENGINES = {
  republic: { fighter: [[-1.25, 1.25], 5.6], breacher: [[-1.4, 1.4], 7.3], command: [[-1.5, 1.5], 7.4], jedi: [[-0.6, 0.6], 3.5] },
  separatist: { fighter: [[0], 3.6], breacher: [[-1.4, 1.4], 7.3], command: [[0], 6.8], jedi: [[0], 1.8] },
};
const JEDI_GLOW = { republic: [0.45, 0.75, 1, 1], separatist: [1, 0.2, 0.15, 1] };
function breacherMesh(rep) {
  const g = geo();
  const hull = rep ? [0.7, 0.72, 0.76] : [0.55, 0.47, 0.36], accent = rep ? [0.72, 0.16, 0.13] : [0.34, 0.42, 0.56], dark = [0.15, 0.16, 0.19];
  g.box(0, 0, 0, 4, 3, 12, hull).box(0, -0.2, -6.8, 3, 2, 1.6, accent).box(0, 1.7, 1, 2.4, 0.5, 6, dark);
  for (const s of [-1, 1]) g.box(s * 1.4, 0, 6.5, 1.2, 1.2, 1.2, dark).box(s * 2.3, -0.6, 0, 0.6, 1.4, 8, hull);
  return g.build();
}
function cruiserMesh(rep) {
  const g = geo();
  const hull = rep ? [0.6, 0.62, 0.66] : [0.56, 0.48, 0.38], light = rep ? [0.74, 0.75, 0.78] : [0.66, 0.58, 0.46];
  const accent = rep ? [0.66, 0.15, 0.12] : [0.3, 0.38, 0.52], dark = [0.14, 0.15, 0.18];
  if (rep) {
    // the lower hull leaves the hangar tunnel open (CRUISER.bay: x through the hull, y -35..-5, z -35..35)
    g.box(0, -20, -117.5, 140, 40, 165, hull).box(0, -20, 147.5, 140, 40, 225, hull).box(0, -2.5, 0, 140, 5, 70, hull).box(0, -37.5, 0, 140, 5, 70, hull);
    g.box(0, -20, -205, 112, 36, 50, hull).box(0, -20, -245, 76, 30, 30, hull);
    g.box(0, 8, 50, 112, 18, 380, light).box(0, 24, 100, 80, 14, 260, light).box(0, -31, -170, 141, 6, 160, accent);
  } else {
    g.box(0, 0, -147.5, 118, 60, 225, hull).box(0, 0, 147.5, 118, 60, 225, hull).box(0, 12.5, 0, 118, 35, 70, hull).box(0, -33, 0, 118, 6, 70, hull);
    g.box(0, 0, -250, 80, 50, 30, hull);
    for (let z = -200; z <= 200; z += 80) g.box(0, 0, z, 140, 90, 14, light);
    g.box(0, -25, -142.5, 120, 10, 215, accent).box(0, -25, 142.5, 120, 10, 215, accent);
  }
  g.box(0, 46, 150, 40, 30, 50, dark).box(0, 64, 150, 70, 8, 20, light);              // bridge
  g.box(0, 40, 70, 50, 12, 40, dark).box(-12, 48, 70, 4, 4, 36, dark).box(12, 48, 70, 4, 4, 36, dark); // weapons battery
  g.sphere(0, 46, -120, 14, [0.55, 0.62, 0.72], 12);                                  // shield generator
  g.box(0, 52, -30, 6, 22, 6, dark).box(0, 64, -30, 24, 2, 24, light);                // comms
  g.box(0, 0, 250, 70, 56, 24, dark);                                                  // hyperdrive / engine block
  for (const s of [-1, 1]) g.box(s * 40, -5, 263, 34, 34, 6, [0.25, 0.27, 0.3]);
  for (const t of CRUISER.turrets) g.box(t[0] * 0.98, t[1], t[2], 8, 6, 8, dark);
  return g.build();
}
function planetMesh() {
  const g = geo();
  g.sphere(0, 0, 0, 1, [0.58, 0.29, 0.19], 40);
  return g.build();
}
// Shared low-poly geometry, one upload for the entire 3D asteroid field.
// Slightly jagged surfaces and vertex tint break the obvious perfect spheres.
function asteroidMesh() {
  const g = geo();
  g.sphere(0, 0, 0, 1, [0.30, 0.31, 0.33], 7);
  const mesh = g.build();
  for (let i = 0; i < mesh.pos.length / 3; i++) {
    const a = i * 3;
    const x = mesh.pos[a], y = mesh.pos[a + 1], z = mesh.pos[a + 2];
    const bump = 0.82 + 0.27 * Math.sin(x * 9.7 + y * 4.2 + z * 8.1) * Math.cos(x * 5.4 - z * 7.2);
    mesh.pos[a] *= bump; mesh.pos[a + 1] *= bump; mesh.pos[a + 2] *= bump;
    const shade = 0.62 + 0.25 * Math.sin((x + y + z) * 8.5);
    mesh.col[i * 4] = Math.round(125 * shade);
    mesh.col[i * 4 + 1] = Math.round(135 * shade);
    mesh.col[i * 4 + 2] = Math.round(149 * shade);
  }
  return mesh;
}

export class SpaceView {
  constructor(canvas, { quality = 'balanced', fov = 62 } = {}) {
    const r = this.r = new Renderer(canvas);
    r.maxDpr = QUALITY_DPR[quality] || 1.5;
    r.env = { sunDir: norm([0.55, 0.35, 0.75]), sunCol: [1.2, 1.1, 1.0], ambTop: [0.24, 0.26, 0.34], ambBot: [0.09, 0.09, 0.12], fogCol: [0.01, 0.012, 0.03], fogD: 0.0000025 };
    this.mesh = {
      republic: { fighter: r.uploadStatic(fighterMesh(true)), breacher: r.uploadStatic(breacherMesh(true)), command: r.uploadStatic(commandMesh(true)), jedi: r.uploadStatic(jediMesh(true)), cruiser: r.uploadStatic(cruiserMesh(true)) },
      separatist: { fighter: r.uploadStatic(fighterMesh(false)), breacher: r.uploadStatic(breacherMesh(false)), command: r.uploadStatic(commandMesh(false)), jedi: r.uploadStatic(jediMesh(false)), cruiser: r.uploadStatic(cruiserMesh(false)) },
      // Lightweight shield bloom shell, reused for the whole fleet and
      // attached to the same real rigid-body quaternion as each supplied GLB.
      shield: r.uploadStatic((() => {
        const shield = geo();
        shield.sphere(0, 0, 0, 1, [0.18, 0.65, 0.98], 14);
        return shield.build();
      })()),
      planet: r.uploadStatic(planetMesh()),
      asteroid: r.uploadStatic(asteroidMesh()),
    };
    let s = 1234567;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    // Bound FX batching and vertex traffic with 100 active fighter craft.
    this.stars = Array.from({ length: quality === 'high' ? 1450 : quality === 'low' ? 550 : 950 }, () => {
      const d = norm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
      const tint = rnd();
      return { d, size: 30 + rnd() ** 4 * 140, c: tint < 0.15 ? [1, 0.8, 0.6] : tint < 0.35 ? [0.7, 0.8, 1] : [1, 1, 1], a: 0.35 + rnd() * 0.65 };
    });
    this.nebula = Array.from({ length: 10 }, (_, i) => ({ d: norm([rnd() * 2 - 1, rnd() * 0.8 - 0.4, rnd() * 2 - 1]), size: 9000 + rnd() * 13000, c: i % 4 === 0 ? [0.36, 0.16, 0.08] : i % 4 === 1 ? [0.07, 0.23, 0.19] : [0.08, 0.16, 0.32] }));
    this.baseFov = fov;
    this.cam = { p: null, up: [0, 1, 0], fov: fov + 8, orbit: { yaw: 0.9, pitch: 0.3, dist: 1700 } };
    this.model = new Float32Array(16);
    this.time = 0;
    this.assetMeshes = {};
    this.assetAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    loadFleetModelMeshes(r, this.assetAbort?.signal).then(meshes => {
      if (!this.disposed) this.assetMeshes = meshes;
    }).catch(() => { /* the in-engine meshes remain playable without the asset pack */ });
  }
  setCamera(eye, target, up, fovDeg) {
    const r = this.r;
    r.cam = eye;
    m4.lookAt(eye, target, up, r.view);
    m4.perspective(fovDeg * Math.PI / 180, r.aspect || 1, NEAR, FAR, r.proj);
    m4.mul(r.proj, r.view, r.vp);
    r.camR = [r.view[0], r.view[4], r.view[8]]; r.camU = [r.view[1], r.view[5], r.view[9]]; r.camF = [-r.view[2], -r.view[6], -r.view[10]];
  }
  begin() { // Renderer.begin() without the duel's sky dome: space is black, the stars are billboards
    const r = this.r, gl = r.gl;
    gl.clearColor(0.004, 0.006, 0.016, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
    for (const f of r.fx) f.n = 0;
  }
  // camera behind the player's ship; or, without a ship (commander on the bridge, waiting to launch), an orbit
  // around the home cruiser that the mouse can turn
  updateCamera(client, dtMs, orbitInput) {
    const dt = Math.min(0.1, dtMs / 1000);
    const p = client.renderPos(), q = client.renderQuat();
    const boosting = client.pred?.boosting;
    const wantFov = this.baseFov + 8 + (boosting ? 14 : 0);
    this.cam.fov += (wantFov - this.cam.fov) * (1 - Math.exp(-dt * 4));
    if (p && q) {
      const f = forwardOf(q), u = upOf(q);
      const eye = add(addScaled(p, f, -22 - (boosting ? 6 : 0)), scale(u, 6.5));
      const k = 1 - Math.exp(-dt * 14);
      this.cam.p = this.cam.p ? lerp3(this.cam.p, eye, k) : eye;
      this.cam.up = norm(lerp3(this.cam.up, u, 1 - Math.exp(-dt * 7)));
      this.cam.mode = 'chase';
      this.setCamera(this.cam.p, addScaled(addScaled(p, f, 80), u, 2), this.cam.up, this.cam.fov);
      return;
    }
    const o = this.cam.orbit;
    if (orbitInput) { o.yaw += orbitInput.dx * 0.004; o.pitch = Math.max(-1.3, Math.min(1.3, o.pitch + orbitInput.dy * 0.004)); o.dist = Math.max(500, Math.min(6000, o.dist * (1 + orbitInput.wheel * 0.1))); }
    o.yaw += dt * 0.04;
    // aboard a ship (yours or the enemy's) the camera circles that ship, otherwise your home cruiser
    const aboard = client.you?.b?.area?.startsWith('ship:') ? client.cruisers.get(+client.you.b.area.slice(5)) : null;
    const home = aboard || client.cruisers.get(client.you?.home) || [...client.cruisers.values()].find(c => c.side === client.me?.side) || { p: [0, 0, 0] };
    const focus = home.p;
    const eye = add(focus, [Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist, Math.sin(o.pitch) * o.dist, Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist]);
    this.cam.p = eye; this.cam.up = [0, 1, 0]; this.cam.mode = 'orbit';
    this.setCamera(eye, focus, [0, 1, 0], this.cam.fov);
  }
  render(client, dtMs, orbitInput) {
    const r = this.r, T = client.now();
    this.time += dtMs / 1000; r.time = this.time;
    r.resize();
    this.updateCamera(client, dtMs, orbitInput);
    this.begin();
    const eye = this.cam.p;
    // explosion light
    const flashes = client.effects.filter(f => f.kind === 'explosion' && T >= f.t).slice(-4);
    r.lights.forEach((l, i) => {
      const f = flashes[i];
      if (!f) { l.r = 0; return; }
      const k = 1 - (T - f.t) / f.life;
      l.p = f.p; l.r = f.size * 9; l.c = [3 * k, 1.6 * k, 0.6 * k];
    });
    // planet
    m4.trs(PLANET.p, [0, 0, 0, 1], [PLANET.r, PLANET.r, PLANET.r], this.model);
    r.drawMesh(this.mesh.planet, this.model, { spec: 0.05 });
    // True spherical combat: rocks exist above, below and between both fleets.
    // Near rocks use shared low-poly mesh, distant ones become cheap billboards.
    for (const rock of client.asteroids || []) {
      const d = Math.hypot(rock.p[0] - eye[0], rock.p[1] - eye[1], rock.p[2] - eye[2]);
      if (d > BATTLEFIELD.visualRadius + 3000) continue;
      if (d > 2700 || (this.r.maxDpr < 1.2 && d > 1750)) {
        r.billboard(rock.p, rock.r, [0.30, 0.33, 0.39, 0.76], 1);
      } else {
        m4.trs(rock.p, [0, 0, 0, 1], [rock.r, rock.r * 0.9, rock.r * 1.07], this.model);
        r.drawMesh(this.mesh.asteroid, this.model, { spec: 0.035 });
      }
    }
    // Capital hulls use one GPU upload per side, never an expensive clone per ship.
    for (const c of client.cruisers.values()) {
      if (c.state === 'escaped' || c.state === 'destroyed') continue;
      const d = Math.hypot(c.p[0] - eye[0], c.p[1] - eye[1], c.p[2] - eye[2]);
      if (d > 11500) continue;
      if (d > 7300) {
        r.billboard(c.p, 105, c.side === 'republic' ? [0.34, 0.60, 0.92, 0.7] : [0.78, 0.36, 0.32, 0.7], 1);
        continue;
      }
      m4.fromYaw(c.yaw, c.p, this.model);
      const asset = this.assetMeshes[FLEET_MODEL_ASSETS[c.side]?.cruiser];
      r.drawMesh(asset || this.mesh[c.side].cruiser, this.model, { spec: 0.25, emis: c.spooling ? [0.05, 0.08, 0.16] : [0, 0, 0] });
    }
    // ships
    const me = client.me?.eid;
    const drawShip = (side, cls, p, q, flags, shields = 0) => {
      const distance = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
      if (distance > 9200) return;
      if (distance > 2400) {
        // High-volume LOD: one tiny billboard rather than 100 full mesh draw calls.
        const col = SIDE_COL[side].glow;
        r.billboard(p, cls.id === 'command' ? 7 : 4.8, [col[0], col[1], col[2], 0.85]);
        // Motion cue for distant live fighters; derives from the actual ship quaternion, not a fake shot.
        if (!(flags & 8))
          r.beam(p, addScaled(p, forwardOf(q), -24), 0.9, [col[0], col[1], col[2], 0.7], [col[0], col[1], col[2], 0]);
        return;
      }
      m4.trs(p, q, null, this.model);
      const asset = this.assetMeshes[FLEET_MODEL_ASSETS[side]?.[cls.id]];
      r.drawMesh(asset || this.mesh[side][cls.id], this.model,
        { spec: 0.78, emis: (flags & 8) ? [0, 0, 0] : [0.015, 0.04, 0.09] });
      // Independent aqua shield shell follows the actual animated ship pose,
      // disappearing on collapse and reappearing with the server rebuff.
      if (shields > 0 && distance < 800) {
        m4.trs(p, q, [cls.radius * 1.55, cls.radius * 1.25, cls.radius * 2], this.model);
        r.drawMesh(this.mesh.shield, this.model, {
          spec: 0.92, alpha: 0.13 + Math.min(0.10, shields / cls.shieldMax * 0.10),
          doubleSided: true, emis: [0.02, 0.18, 0.27],
        });
      }
      const boost = flags & 1;
      const engineOff = !!(flags & 8);
      const back = qrot(q, [0, 0, 1]), col = cls.id === 'jedi' ? JEDI_GLOW[side] : SIDE_COL[side].glow;
      const [nozzles, aft] = ENGINES[side][cls.id] || ENGINES[side].fighter;
      if (!engineOff) for (const x of nozzles) {
        const e = add(p, add(qrot(q, [x, 0, 0]), scale(back, aft)));
        r.billboard(e, boost ? 2.6 : 1.5, [col[0], col[1], col[2], 0.95]);
        r.beam(e, addScaled(e, back, boost ? 26 : 9), boost ? 0.9 : 0.5, [col[0], col[1], col[2], 0.55], [col[0] * 0.3, col[1] * 0.3, col[2] * 0.3, 0]);
      }
    };
    for (const sh of client.ships.values()) {
      if (sh.eid === me) continue;
      const pose = client.shipPose(sh);
      if (pose && sh.cls) drawShip(sh.side, sh.cls, pose.p, pose.q, sh.flags, sh.shield);
    }
    const ownP = client.renderPos();
    if (ownP) drawShip(client.me.side, client.predCls, ownP, client.renderQuat(),
      (client.pred.boosting ? 1 : 0) |
      (client.pred.engineOff ? 8 : 0) |
      (client.pred.barrelRemaining > 0 ? 16 : 0), client.you?.sh ?? 0);
    // fx: stars and nebula first (far), then cruiser lights, bolts, missiles, explosions
    for (const n of this.nebula) r.billboard(addScaled(eye, n.d, 60000), n.size, [n.c[0] * 0.5, n.c[1] * 0.5, n.c[2] * 0.5, 0.5]);
    for (const st of this.stars) r.billboard(addScaled(eye, st.d, 70000), st.size, [st.c[0], st.c[1], st.c[2], st.a]);
    r.billboard(PLANET.p, PLANET.r * 2.35, [0.9, 0.31, 0.14, 0.24]);
    for (const c of client.cruisers.values()) {
      if (c.state !== 'active' && c.state !== 'spooling') continue;
      const col = SIDE_COL[c.side].glow;
      for (const s of [-1, 1]) r.billboard(fromBoxLocal([s * 40, -5, 268], c.p, c.yaw), 26, [col[0], col[1], col[2], 0.9]);
      // Small running lights make the spread-out fleet legible in every direction.
      // Green = friendly navigation, red-orange = hostile identification, never simulated impacts.
      for (const s of [-1, 1]) {
        const p = fromBoxLocal([s * 69, 23, -140], c.p, c.yaw);
        const friendly = c.side === client.me?.side;
        const pulse = 0.56 + 0.25 * Math.sin(this.time * 3.4 + c.eid + s * 2);
        r.billboard(p, 8, friendly ? [0.25, 1, 0.67, pulse] : [1, 0.34, 0.2, pulse]);
      }
      const fresh = 1 - Math.min(1, (T - c.shieldHitAt) / 350);
      if (fresh > 0 && c.shields > 0) for (let k = -2; k <= 2; k++) r.billboard(fromBoxLocal([0, 0, k * 110], c.p, c.yaw), 150, [0.3 * fresh, 0.55 * fresh, 1 * fresh, 0.5 * fresh]);
      // hangar force fields: dim for our own ships, bright and closed to us while their shields hold, flickering open after
      const B = CRUISER.bay, mine = c.side === client.me?.side, open = mine || c.shields <= 0;
      for (const s of [-1, 1]) {
        const x = B.center[0] + s * B.half[0] + s * 0.5, y0 = B.center[1] - B.half[1], y1 = B.center[1] + B.half[1], z0 = B.center[2] - B.half[2], z1 = B.center[2] + B.half[2];
        const P = (y, z) => fromBoxLocal([x, y, z], c.p, c.yaw);
        const a = mine ? 0.12 : open ? 0.1 + 0.08 * Math.sin(this.time * 17 + s) : 0.4 + 0.08 * Math.sin(this.time * 3 + s);
        const col = mine ? [0.4, 0.7, 1, a] : open ? [0.4, 1, 0.55, a] : [0.35, 0.6, 1, a];
        r.quad(P(y0, z0), P(y0, z1), P(y1, z1), P(y1, z0), col, 0);
      }
      if (c.spooling) r.billboard(fromBoxLocal([0, 0, 250], c.p, c.yaw), 120 + 40 * Math.sin(this.time * 8), [0.4, 0.6, 1, 0.8]);
      for (const sub of SUBSYSTEM_IDS) if (c.subs[sub] <= 0) r.billboard(fromBoxLocal(CRUISER.subsystems[sub].at, c.p, c.yaw), 40 + 10 * Math.sin(this.time * 9 + c.eid), [1, 0.45, 0.1, 0.8]);
    }
    for (const b of client.bolts) {
      const head = client.boltPos(b, T);
      if (!head) continue;
      const col = b.kind === 1 ? [1, 0.75, 0.35, 1] : (SIDE_COL[b.side]?.bolt || [1, 1, 1, 1]);
      const tail = addScaled(head, norm(b.v), b.kind === 1 ? -22 : -14);
      r.beam(head, tail, b.kind === 1 ? 1.15 : 0.76, col, [col[0], col[1], col[2], 0.25]);
      r.billboard(head, b.kind === 1 ? 2.9 : 2.0, [col[0], col[1], col[2], 0.88]);
    }
    for (const ms of client.missiles.values()) {
      const k = Math.min(1, (T - ms.at) / 66);
      const p = lerp3(ms.from, ms.p, k);
      r.billboard(p, 2.2, [1, 0.85, 0.6, 1]);
      r.beam(p, lerp3(ms.from, ms.p, Math.max(0, k - 0.8)), 0.6, [1, 0.6, 0.3, 0.6], [0.4, 0.4, 0.45, 0]);
    }
    for (const f of client.effects) {
      if (T < f.t) continue;
      const k = (T - f.t) / f.life;
      if (f.kind === 'explosion') {
        if (k < 0.25) r.billboard(f.p, f.size * (0.6 + k * 3), [1, 0.95, 0.85, 1 - k * 4]);
        r.billboard(f.p, f.size * (0.8 + k * 1.6), [1, 0.5 * (1 - k), 0.15 * (1 - k), (1 - k) * 0.9]);
        r.billboard(f.p, f.size * (1.2 + k * 2.2), [0.08, 0.07, 0.07, (1 - k) * 0.5], 1);
      } else if (f.kind === 'mark') {
        r.billboard(f.p, 60 + 20 * Math.sin(this.time * 6), f.attack ? [1, 0.3, 0.2, 0.7] : [0.3, 0.7, 1, 0.7]);
      }
    }
    r.flushFx();
    return { vp: r.vp, eye, width: r.canvas.width, height: r.canvas.height, mode: this.cam.mode };
  }
  dispose() {
    this.disposed = true;
    this.assetAbort?.abort();
    try { this.r.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ }
  }
}

export { SIDE_COL };
