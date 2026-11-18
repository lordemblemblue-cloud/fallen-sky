// Grenade launcher: the Fleet Assault heavy trooper's kit (fleetAssault/boarding). An arcing grenade that bursts when it
// touches a wall, the floor or a foe, or when its fuse runs out; everyone hostile to the shooter inside the blast (with a
// clear line from its centre) is hurt through the shared Combat.damage, so Protect, Absorb-free bodies, kill credit and
// the online hooks (Game.net) all apply, and thrown back with the knockdown push. Original tuning, after the role of
// Jedi Outcast's heavy-weapon alternate fire (the repeater's plasma grenade); no Raven code. The player presses the
// right mouse button (Game.updatePistol hands it here when a launcher is fitted).
import { v3 } from './math.js';
import { hostile } from './combat.js';

export const LAUNCHER = Object.freeze({
  cooldown: 1.1,   // s between grenades
  speed: 17,       // m/s along the aim
  lift: 3.2,       // m/s extra upward, so it lobs
  gravity: 14,     // m/s^2 (a light round: JO's grenades fall slower than people)
  fuse: 2.2,       // s before it bursts on its own
  radius: 3.6,     // m blast radius
  damage: 70,      // at the centre; 40% of it at the edge
  knock: 7,        // m/s push at the centre
  ammo: 6, reload: 5, // grenades in a load, s to reload an empty one
});

export class GrenadeLauncher {
  constructor(g, owner) { this.g = g; this.owner = owner; this.nades = []; this.cool = 0; this.ammo = LAUNCHER.ammo; this.reloadT = 0; }
  ready() { return this.cool <= 0 && this.ammo > 0 && this.owner.status === 'normal'; }
  // fire at a world point (Game.aimPoint for the player)
  fire(target) {
    if (!this.ready()) return false;
    const f = this.owner, from = f.actor.bonePos('rhand'), dir = v3.norm(v3.sub(target, from));
    const v = [dir[0] * LAUNCHER.speed, dir[1] * LAUNCHER.speed + LAUNCHER.lift, dir[2] * LAUNCHER.speed];
    this.nades.push({ p: v3.addS(from, dir, 0.35), v, t: 0 });
    this.cool = LAUNCHER.cooldown; this.ammo--; if (!this.ammo) this.reloadT = LAUNCHER.reload;
    f.playForce?.('BOTH_ATTACK2', { durMs: 320 });
    this.g.sfxAt('push', f.pos, 0.5); this.g.fx.sparks(from, dir, 4, [1, 0.7, 0.3, 1]);
    return true;
  }
  update(dt) {
    const g = this.g, L = LAUNCHER;
    this.cool -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = L.ammo; }
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i], old = n.p.slice();
      n.t += dt; n.v[1] -= L.gravity * dt; n.p = v3.addS(n.p, n.v, dt);
      let burst = n.t >= L.fuse;
      if (!burst && g.world.boltBlocked(old, n.p)) { burst = true; n.p = old; }
      const fl = g.world.floorAt(n.p[0], n.p[2], old[1] + 0.2);
      if (!burst && fl !== null && n.p[1] <= fl + 0.05) { burst = true; n.p[1] = fl + 0.1; }
      if (!burst) for (const f of g.fighters()) {
        if (!hostile(this.owner, f) || f.status === 'dead') continue;
        const c = f.chest(); if (Math.hypot(c[0] - n.p[0], c[2] - n.p[2]) < 0.55 && n.p[1] > f.pos[1] && n.p[1] < f.pos[1] + 1.9) { burst = true; break; }
      }
      if (burst) { this.nades.splice(i, 1); this.explode(n.p); }
    }
  }
  explode(p) {
    const g = this.g, L = LAUNCHER, A = this.owner;
    g.fx.burst(p, 50, { s0: 2, s1: 8, l0: 0.3, l1: 0.9, z0: 0.04, z1: 0.12, c0: [1, 0.75, 0.35, 1], c1: [1, 0.25, 0.05, 0], grav: -5 });
    g.fx.ring({ p: [p[0], p[1] + 0.05, p[2]], n: [0, 1, 0], r0: 0.3, r1: L.radius, life: 0.45, w: 0.2, c: [1, 0.6, 0.25, 0.9] });
    g.flashLight(p, [1, 0.6, 0.3], 0.35); g.sfxAt('hit3', p, 1); g.shake(Math.max(0, 0.45 - v3.dist(p, g.player.pos) * 0.03));
    for (const f of g.fighters()) {
      if (!hostile(A, f) || f.status === 'dead') continue;
      const c = f.chest(), d = v3.dist(c, p); if (d > L.radius || !g.world.lineOfSight(p, c)) continue;
      const k = 1 - d / L.radius, dir = v3.norm([c[0] - p[0], 0, c[2] - p[2]]);
      g.combat.damage(A, f, c, L.damage * (0.4 + 0.6 * k), { explosion: true });
      if (f.status === 'normal') f.push(dir, L.knock * k + 2, 3.5);
    }
  }
  draw(R) { for (const n of this.nades) { R.billboard(n.p, 0.16, [1, 0.6, 0.25, 0.9], 0); R.billboard(n.p, 0.32, [1, 0.45, 0.15, 0.3], 0); } }
}
