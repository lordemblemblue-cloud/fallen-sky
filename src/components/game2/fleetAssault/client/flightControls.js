// Flight controls on top of Game 2's own Input (pointer lock, the fallback when an embedding page refuses it, clean
// dispose). The mouse moves a virtual stick that drifts back to centre, so a flick turns and letting go levels out.
// W / S speed up and brake (letting go returns to cruise), A / D roll, Shift boosts, left mouse fires, right mouse
// launches a missile at a locked target.
import { Input } from '../../engine/input.js';

const CRUISE = 0.6;

export class FlightControls {
  constructor(canvas, settings = {}) {
    this.input = new Input(canvas);
    this.input.wheelThrottle = 120;
    this.sens = 0.0042 * (settings.sensitivity || 1);
    this.invertY = !!settings.invertY;
    this.stick = [0, 0];
    this.throttle = CRUISE;
    this.missileQueued = false;
    this.shieldQueued = false;
    this.barrelQueued = 0;
    this.engineOff = false;
    this.virtualFire = false;
    this.virtualBoost = false;
    this.fireUntil = 0;
    this.boostUntil = 0;
    this.cmd = { pitch: 0, yaw: 0, roll: 0, throttle: CRUISE, boost: false, fire: false, missile: false };
  }
  // Clickable cockpit buttons feed the exact same commands as keyboard and mouse input.
  queueMissile() { this.missileQueued = true; }
  queueShield() { this.shieldQueued = true; }
  queueBarrel(direction = 1) { this.barrelQueued = direction < 0 ? -1 : 1; }
  toggleEngine() { this.engineOff = !this.engineOff; }
  pulseFire(ms = 250) { this.fireUntil = Math.max(this.fireUntil, performance.now() + ms); }
  pulseBoost(ms = 350) { this.boostUntil = Math.max(this.boostUntil, performance.now() + ms); }
  holdFire(on) { this.virtualFire = !!on; }
  holdBoost(on) { this.virtualBoost = !!on; }
  // read the devices once per rendered frame; command() is then sampled once per 16 ms flight command
  frame(dtMs, enabled = true) {
    const I = this.input, dt = Math.min(0.1, dtMs / 1000);
    const pressed = new Set(I.pressedSet);
    if (!enabled) { this.stick = [0, 0]; this.cmd = { ...this.cmd, pitch: 0, yaw: 0, roll: 0, fire: false, boost: false }; I.endFrame(); return pressed; }
    this.stick[0] += I.dx * this.sens; this.stick[1] += I.dy * this.sens;
    const r = Math.hypot(this.stick[0], this.stick[1]);
    if (r > 1) { this.stick[0] /= r; this.stick[1] /= r; }
    const back = Math.exp(-dt * 1.6);
    this.stick[0] *= back; this.stick[1] *= back;
    const key = c => (I.held(c) ? 1 : 0);
    const pitchKeys = key('ArrowDown') - key('ArrowUp'), yawKeys = key('ArrowRight') - key('ArrowLeft');
    const curve = v => Math.sign(v) * Math.min(1, Math.abs(v) ** 0.8 * 1.15);
    const pitch = (this.invertY ? 1 : -1) * curve(this.stick[1]) + (this.invertY ? 1 : -1) * pitchKeys;
    const want = I.held('KeyW') ? 1 : I.held('KeyS') ? 0.1 : CRUISE;
    this.throttle += Math.sign(want - this.throttle) * Math.min(Math.abs(want - this.throttle), dt * 1.6);
    if (I.btnPressed[2] || pressed.has('KeyF')) this.missileQueued = true;
    if (pressed.has('KeyX')) this.toggleEngine();
    if (pressed.has('KeyB')) this.queueBarrel(1);
    if (pressed.has('KeyN')) this.queueBarrel(-1);
    if (pressed.has('KeyG')) this.queueShield();
    this.cmd = {
      pitch: Math.max(-1, Math.min(1, pitch)), yaw: Math.max(-1, Math.min(1, curve(this.stick[0]) + yawKeys)),
      roll: key('KeyD') + key('KeyE') - key('KeyA') - key('KeyQ'),
      throttle: this.throttle, boost: I.held('ShiftLeft') || I.held('ShiftRight') || I.held('Space') || this.virtualBoost || performance.now() < this.boostUntil,
      fire: I.btn[0] || this.virtualFire || performance.now() < this.fireUntil, missile: false,
      engineOff: this.engineOff, barrel: 0, shield: false,
    };
    I.endFrame();
    return pressed;
  }
  command() {
    const c = { ...this.cmd, engineOff: this.engineOff, missile: this.missileQueued,
      barrel: this.barrelQueued, shield: this.shieldQueued };
    this.missileQueued = false;
    this.barrelQueued = 0;
    this.shieldQueued = false;
    return c;
  }
  get locked() { return this.input.locked; }
  dispose() { this.input.dispose(); }
}
