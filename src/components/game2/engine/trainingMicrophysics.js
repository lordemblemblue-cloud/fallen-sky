// Game 2 Training Grounds: localized, client-only atmospheric responses.
// No collision, multiplayer state, movement speed or server inputs are modified.
import { trainingGroundHeight, trainingPavingDistance } from './levels/trainingGround.js';

export const ENVIRONMENT_FX_BUDGET = Object.freeze({
  very_low: 1, medium: 7, high: 13, '4k': 20,
});

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const clamp01 = n => clamp(n, 0, 1);
export const TRAINING_LIGHTING = Object.freeze({
  morning: Object.freeze({sunCol:[.91,.70,.53],ambTop:[.36,.43,.50],ambBot:[.13,.16,.16],fogCol:[.40,.43,.46],fogD:.0022}),
  day: Object.freeze({sunCol:[1.05,1.01,.92],ambTop:[.43,.54,.62],ambBot:[.17,.20,.21],fogCol:[.47,.59,.69],fogD:.0018}),
  sunset: Object.freeze({sunCol:[1.02,.84,.63],ambTop:[.35,.45,.57],ambBot:[.14,.17,.16],fogCol:[.33,.42,.52],fogD:.0022}),
  night: Object.freeze({sunCol:[.18,.23,.37],ambTop:[.09,.15,.25],ambBot:[.035,.055,.09],fogCol:[.09,.15,.23],fogD:.0034}),
});
export function applyTrainingLighting(renderer, timeOfDay = 'sunset') {
  const light = TRAINING_LIGHTING[timeOfDay] || TRAINING_LIGHTING.sunset;
  // Maintain the authored light direction so static shadow-map silhouettes
  // remain aligned with their casters until dynamic shadow re-baking exists.
  for (const name of ['sunCol','ambTop','ambBot','fogCol']) renderer.env[name] = light[name].slice();
  renderer.env.fogD = light.fogD;
}
export function trainingDustSurface(x, z) {
  return x >= -27 && x <= 27 && z >= 13 && z <= 63 &&
    trainingPavingDistance(x, z) >= .05;
}
export class TrainingMicrophysics {
  constructor(random = Math.random) {
    this.random = random;
    this.history = new WeakMap();
  }
  update(fx, actors, dt, { quality = 'medium', temperatureC = 18, timeOfDay = 'sunset', viewer = null } = {}) {
    if (!fx || !Array.isArray(actors) || dt <= 0) return;
    const budget = ENVIRONMENT_FX_BUDGET[quality] ?? ENVIRONMENT_FX_BUDGET.medium;
    for (const actor of actors) {
      if (!actor?.pos || actor.status === 'dead' || actor.status === 'executed') continue;
      const pos = actor.pos;
      let s = this.history.get(actor);
      if (!s) { s = { last: pos.slice(), dust: 0, breath: 0 }; this.history.set(actor, s); continue; }
      const dx = pos[0] - s.last[0], dz = pos[2] - s.last[2];
      s.last = pos.slice();
      const travel = Math.hypot(dx, dz);
      // Teleport, respawn, paused simulation and network warp must not kick up storms.
      const speed = travel / Math.max(dt, .001);
      const near = !viewer || Math.hypot(pos[0] - viewer[0], pos[2] - viewer[2]) < 26;
      const alive = actor.status !== 'down' && actor.status !== 'getup';
      const moving = alive && actor.onGround && near && speed > .45 && speed < 20 && travel < 2;
      if (moving && budget > 0 && trainingDustSurface(pos[0], pos[2])) {
        // A local wake: actual horizontal travel transports displaced dust;
        // a small sideways curl mimics foot turbulence rather than a vertical geyser.
        s.dust += dt * clamp(speed * 2.3, 1, budget);
        const count = Math.min(3, Math.floor(s.dust));
        s.dust -= count;
        const dirX = dx / travel, dirZ = dz / travel;
        const dusk = timeOfDay === 'night' ? .48 : .78;
        for (let i = 0; i < count; i++) {
          const r = this.random(), side = (r - .5) * .45;
          const x = pos[0] - dirX * .28 - dirZ * side, z = pos[2] - dirZ * .28 + dirX * side;
          const floor = trainingGroundHeight(x, z);
          fx.emit({
            p: [x, floor + .035 + this.random() * .055, z],
            v: [dirX * (.28 + r * .52) + dirZ * side * 2,
              .10 + this.random() * .17,
              dirZ * (.28 + r * .52) - dirX * side * 2],
            size: .045 + r * .09, grow: .12, life: .36 + r * .3,
            drag: 1.1, grav: -.07,
            c0: [.55*dusk,.47*dusk,.36*dusk,.13 + .12*r],
            c1: [.50*dusk,.44*dusk,.37*dusk,0],
          });
        }
      } else s.dust = Math.min(s.dust, 1);
      // Condensation occurs only in cold air; rate remains natural at rest.
      if (temperatureC <= 5 && near && alive && budget > 0) {
        s.breath += dt;
        if (s.breath >= 1.5) {
          s.breath %= 1.5;
          const forward = [Math.sin(actor.yaw || 0), Math.cos(actor.yaw || 0)];
          const opacity = clamp01((8 - temperatureC) / 17) * .19;
          fx.emit({ p: [pos[0]+forward[0]*.23, pos[1]+1.52, pos[2]+forward[1]*.23],
            v:[forward[0]*.32,.10,forward[1]*.32], life:.94, size:.085,
            grow:.15, drag:.22, c0:[.74,.84,1,opacity], c1:[.74,.84,1,0] });
        }
      } else s.breath = 0;
    }
  }
  swingWake(fx, actor, {quality='medium'} = {}) {
    if (!fx || !actor?.onGround || !trainingDustSurface(actor.pos[0],actor.pos[2])) return;
    const count = Math.min(3, Math.ceil((ENVIRONMENT_FX_BUDGET[quality] ?? 7)/6));
    const x = actor.pos[0], z = actor.pos[2], forward = [Math.sin(actor.yaw||0),Math.cos(actor.yaw||0)];
    for (let i=0;i<count;i++) {
      const side = (i-(count-1)/2)*.35;
      fx.emit({p:[x+forward[0]*(.6+side),trainingGroundHeight(x,z)+.07,z+forward[1]*(.6+side)],
        v:[forward[0]*(.35+this.random()*.3)-forward[1]*side,
          .14,forward[1]*(.35+this.random()*.3)+forward[0]*side],
        life:.55,size:.08,grow:.11,drag:1,
        c0:[.38,.32,.26,.13],c1:[.38,.32,.26,0]});
    }
  }
}
