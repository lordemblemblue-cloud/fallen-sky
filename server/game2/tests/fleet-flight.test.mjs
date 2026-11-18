import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_CLASSES } from '../fleet/rules.mjs';
import { cloneFlight, newFlightState, sanitizeCmd, stepShip } from '../fleet/flight.mjs';
import { forwardOf, len, qlook, dot } from '../fleet/vec.mjs';

const F = SHIP_CLASSES.fighter;
const cmd = (seq, o = {}) => sanitizeCmd({ seq, ms: 33, throttle: 1, ...o });

test('the same commands give the same ship on the server and in client prediction', () => {
  const a = newFlightState(F, [10, 20, 30], qlook([1, 0, 0.3]));
  const b = cloneFlight(a);
  const cmds = Array.from({ length: 240 }, (_, i) => cmd(i, { pitch: Math.sin(i / 9), yaw: Math.cos(i / 13), roll: (i % 40) / 40 - 0.5, boost: i % 50 < 20, fire: i % 3 === 0 }));
  for (const c of cmds) stepShip(a, F, c);
  for (const c of cmds) stepShip(b, F, JSON.parse(JSON.stringify(c))); // as it arrives over the network
  assert.deepEqual(b, a);
});

test('boost: faster than full throttle, drains the meter, needs a little charge to relight, refills after a pause', () => {
  const s = newFlightState(F);
  for (let i = 0; i < 90; i++) stepShip(s, F, cmd(i)); // 3 s full throttle
  assert.ok(Math.abs(s.speed - F.maxSpeed) < 1e-6, 'full throttle settles on maxSpeed');
  let peak = 0, i = 100;
  for (; s.energy > 0 && i < 1000; i++) { stepShip(s, F, cmd(i, { boost: true })); peak = Math.max(peak, s.speed); }
  assert.ok(peak > F.maxSpeed * 1.8, 'boost reaches about twice cruise speed: ' + peak.toFixed(1));
  assert.ok(Math.abs(s.energy) < 1e-9);
  const seconds = (i - 100) * 0.033;
  assert.ok(Math.abs(seconds - F.boostMax / F.boostDrain) < 0.1, 'a full meter lasts boostMax / boostDrain seconds');
  stepShip(s, F, cmd(i++, { boost: true }));
  assert.equal(s.boosting, false, 'an empty meter will not boost');
  for (let k = 0; k < 20; k++) stepShip(s, F, cmd(i++, { boost: true }));
  assert.equal(s.energy, 0, 'holding the button keeps it from refilling');
  for (let k = 0; k < 30; k++) stepShip(s, F, cmd(i++));
  assert.equal(s.energy, 0, 'no refill during the boost delay (1.2 s)');
  for (let k = 0; k < 30; k++) stepShip(s, F, cmd(i++));
  assert.ok(s.energy > 0 && s.energy < F.boostMin, 'refilling, but not yet enough to relight');
  stepShip(s, F, cmd(i++, { boost: true }));
  assert.equal(s.boosting, false);
});

test('boosting through a turn drifts: the velocity trails the nose more than at cruise', () => {
  const slip = boost => {
    const s = newFlightState(F);
    for (let i = 0; i < 60; i++) stepShip(s, F, cmd(i, { boost }));
    for (let i = 60; i < 75; i++) stepShip(s, F, cmd(i, { boost, pitch: 1 }));
    return Math.acos(Math.min(1, dot(forwardOf(s.q), s.v) / len(s.v)));
  };
  assert.ok(slip(true) > slip(false) * 1.8, 'boost slip ' + slip(true).toFixed(3) + ' vs cruise ' + slip(false).toFixed(3));
});

test('lasers alternate guns at the fire interval and overheat into a lockout', () => {
  const s = newFlightState(F);
  const guns = [];
  let i = 0;
  while (s.lockout <= 0 && i < 400) guns.push(...stepShip(s, F, cmd(i++, { fire: true })));
  assert.deepEqual(guns.slice(0, 4), [0, 1, 0, 1]);
  // the guns cool while they fire, so a burst lasts overheat / (heat per second - cooling per second)
  const burst = F.lasers.overheat / (F.lasers.heat / F.lasers.interval - F.lasers.cool);
  assert.ok(Math.abs(guns.length - burst / F.lasers.interval) <= 3, 'shots before overheating: ' + guns.length);
  const rate = guns.length / (i * 0.033);
  assert.ok(Math.abs(rate - 1 / F.lasers.interval) < 1.2, 'about one shot per interval: ' + rate.toFixed(2));
  const during = [];
  for (let k = 0; k < 40; k++) during.push(...stepShip(s, F, cmd(i++, { fire: true })));
  assert.equal(during.length, 0, 'locked out after overheating');
});

test('commands from the network are clamped; garbage is dropped', () => {
  assert.equal(sanitizeCmd(null), null);
  assert.equal(sanitizeCmd({ seq: -1 }), null);
  assert.equal(sanitizeCmd({ seq: 1.5 }), null);
  const c = sanitizeCmd({ seq: 3, ms: 9999, pitch: 50, yaw: -Infinity, roll: 'x', throttle: 7, boost: 1, lock: -4 });
  assert.deepEqual(c, { seq: 3, ms: 100, pitch: 1, yaw: 0, roll: 0, throttle: 1, boost: true, fire: false, missile: false, engineOff: false, barrel: 0, shield: false, lock: 0 });
});
