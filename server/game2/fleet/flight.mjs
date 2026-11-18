// Fleet Assault flight model, shared by the server (authority) and the browser (prediction), the way Jedi Outcast's
// bg_pmove.c runs on both sides: the client sends commands, the server runs them with this code, the client runs the same
// code ahead of the server and replays its unacknowledged commands when a snapshot arrives.
import { QUAT_ID, add, addScaled, clamp, finite, forwardOf, len, norm, qaxis, qmul, qnorm, qrot, scale } from './vec.mjs';

const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

export function newFlightState(cls, p = [0, 0, 0], q = QUAT_ID) {
  return {
    p: [...p], q: [...q], v: scale(forwardOf(q), cls.minSpeed), speed: cls.minSpeed,
    energy: cls.boostMax, boostIdle: 0, boosting: false,
    engineOff: false, barrelRemaining: 0, barrelCooldown: 0, barrelDir: 0,
    heat: 0, lockout: 0, fireCd: 0, gun: 0,
  };
}

export const cloneFlight = s => ({ ...s, p: [...s.p], q: [...s.q], v: [...s.v] });

// Commands come from the network: clamp everything. ms is the time the command covers (Quake 3 usercmd_t.serverTime delta).
export function sanitizeCmd(c) {
  if (!c || typeof c !== 'object') return null;
  const seq = Number(c.seq);
  if (!Number.isInteger(seq) || seq < 0) return null;
  const axis = v => (finite(v) ? clamp(v, -1, 1) : 0);
  return {
    seq, ms: clamp(Math.round(finite(c.ms) ? c.ms : 0), 1, 100),
    pitch: axis(c.pitch), yaw: axis(c.yaw), roll: axis(c.roll),
    throttle: finite(c.throttle) ? clamp(c.throttle, 0, 1) : 0.5,
    boost: !!c.boost, fire: !!c.fire, missile: !!c.missile,
    engineOff: c.engineOff === true, barrel: c.barrel === -1 ? -1 : c.barrel === 1 ? 1 : 0,
    shield: c.shield === true,
    lock: Number.isInteger(c.lock) && c.lock > 0 ? c.lock : 0,
  };
}

// Advance one ship by one command. Mutates s; returns the guns fired during the step (indices into cls.guns).
export function stepShip(s, cls, cmd) {
  const dt = cmd.ms / 1000;
  // Barrel-roll ability is a real 360-degree flight manoeuvre over 0.64s,
  // shared between prediction and server simulation. It changes the ship's
  // actual quaternion (not just the camera) and cannot be speed-hacked by
  // resending the command during its 3.2s cooldown.
  s.barrelCooldown = Math.max(0, (s.barrelCooldown || 0) - dt);
  if (cmd.barrel && s.barrelCooldown <= 0 && !(s.barrelRemaining > 0)) {
    s.barrelRemaining = 0.64;
    s.barrelCooldown = 3.2;
    s.barrelDir = cmd.barrel;
  }
  const rolled = Math.min(dt, s.barrelRemaining || 0);
  s.barrelRemaining = Math.max(0, (s.barrelRemaining || 0) - dt);
  const barrelRate = rolled > 0 ? (Math.PI * 2 / 0.64) * rolled * s.barrelDir : 0;
  // Steering remains possible during the roll, but the rapid roll animation
  // rotates the real hitbox and model synchronously.
  const controlRate = cmd.engineOff ? 0.82 : 1;
  const dq = qmul(qmul(qaxis(X, cmd.pitch * cls.pitchRate * dt * controlRate),
    qaxis(Y, -cmd.yaw * cls.yawRate * dt * controlRate)),
    qaxis(Z, -cmd.roll * cls.rollRate * dt + barrelRate));
  s.q = qnorm(qmul(s.q, dq));
  s.engineOff = !!cmd.engineOff;

  // boost: a meter that drains while held and refills after a short pause once the button is let go; it needs a little
  // charge to light up again
  const wantBoost = !s.engineOff && cmd.boost && (s.boosting ? s.energy > 0 : s.energy >= cls.boostMin);
  if (wantBoost) {
    s.energy = Math.max(0, s.energy - cls.boostDrain * dt);
    s.boostIdle = 0;
  } else if (cmd.boost) {
    s.boostIdle = 0; // held without enough charge: nothing happens, and nothing refills until it is let go
  } else {
    s.boostIdle += dt;
    if (s.boostIdle >= cls.boostDelay) s.energy = Math.min(cls.boostMax, s.energy + cls.boostRegen * dt);
  }
  s.boosting = wantBoost;

  const fwd = forwardOf(s.q), vl = len(s.v);
  if (s.engineOff) {
    // Kill the engines, not the ship's inertia. While coasting, the player
    // can turn to face their pursuer, reignite engines and accelerate at them.
    // Very slight space drag prevents an unlimited drift exploit.
    s.v = scale(s.v, Math.exp(-0.008 * dt));
    s.speed = len(s.v);
  } else {
    const target = s.boosting ? cls.boostSpeed : cls.minSpeed + cmd.throttle * (cls.maxSpeed - cls.minSpeed);
    const rate = s.speed < target ? (s.boosting ? cls.boostAccel : cls.accel) : cls.decel;
    s.speed = s.speed < target ? Math.min(target, s.speed + rate * dt) : Math.max(target, s.speed - rate * dt);
    const k = 1 - Math.exp(-(s.boosting ? cls.boostGrip : cls.grip) * dt);
    const dir = vl > 1e-9 ? scale(s.v, 1 / vl) : fwd;
    s.v = scale(norm(addScaled(dir, [fwd[0] - dir[0], fwd[1] - dir[1], fwd[2] - dir[2]], k)), s.speed);
  }
  s.p = addScaled(s.p, s.v, dt);

  const shots = [];
  const L = cls.lasers;
  if (!L) return shots;
  s.fireCd = Math.max(0, s.fireCd - dt);
  s.lockout = Math.max(0, s.lockout - dt);
  s.heat = Math.max(0, s.heat - L.cool * dt);
  if (cmd.fire) {
    while (s.fireCd <= 0 && s.lockout <= 0) {
      shots.push(s.gun);
      s.gun = (s.gun + 1) % cls.guns.length;
      s.fireCd += L.interval;
      s.heat += L.heat;
      if (s.heat >= L.overheat) s.lockout = L.lockout;
    }
  }
  return shots;
}

export const muzzleOf = (s, cls, gun) => add(s.p, qrot(s.q, cls.guns[gun]));
export const boltVelocity = (s, cls) => addScaled(s.v, forwardOf(s.q), cls.lasers.speed);
