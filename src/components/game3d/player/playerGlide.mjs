// Gliding on foot: run or jump off a hill, open the glider and fly down under control.
//
// GameWorld3D runs this every frame right after the feet are glued to the ground (that code is unchanged), with the
// ground under the hero, the water surface (axe/world/game3dWaterSurface.mjs) and the steering input. It owns the
// hero's height only while the hero is in the air:
//   fall   the ground dropped away under the hero (a ledge, a cliff, a jump off a hillside): gravity, as a jump
//   glide  the glider is open: forward speed along a heading the input turns at a limited rate, a steady sink,
//          Shift dives (faster, steeper) and letting go of the dive turns that extra speed back into a little height
// and hands the feet back to the ground code on landing (the run carries on). Over deep water the landing is on the
// surface, where player/playerSwimState.mjs takes over. Space in the air opens and closes the glider (GameWorld3D).
// The glide costs nothing but height; landing does no damage (the game has no fall damage).
export const GLIDE = Object.freeze({
  openHeight: 1.6, // m over the landing (ground or deep water) the glider needs to open
  ledgeDrop: 0.9, // m: the hero would drop at least this much in one frame...
  ledgeSlope: 1.6, // ...and more steeply than this (down per metre across): a ledge, not a slope or stairs
  gravity: 18, // m/s², the controller's jump gravity
  terminalFall: 26,
  trimSpeed: 7.5, // m/s through the air with no dive
  minSpeed: 5,
  maxSpeed: 14,
  trimSink: 1.8, // m/s down at trim: 7.5 / 1.8 ≈ 4.2 m forward per metre of height
  diveSink: 5.4, // m/s down while diving
  diveAccel: 5, // m/s² gained while diving
  bleed: 2.4, // m/s² of extra speed spent back toward trim once the dive ends...
  pullUp: 0.55, // ...each m/s of it holding up this much sink (a dive's speed buys back a little height)
  sinkEase: 4, // how fast the sink settles (1/s): opening eases the fall into the glide
  turnRate: 1.9, // rad/s at most (about 110°/s)
  maxBank: 0.5, // rad of roll at the full turn rate
  swimDepth: 1.45, // water this deep is landed on (the swim takes over); shallower water is waded into
  teleportMeters: 8, // m across in one frame: further than any glide or run, so a teleport (respawn, recall): the air ends
});
export const GLIDE_REACH = GLIDE.trimSpeed / GLIDE.trimSink; // metres forward per metre of height at trim speed

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Where a falling or gliding hero touches down: deep water's surface, otherwise the ground. */
export function glideLandingY(groundY, surfaceY, swimDepth = GLIDE.swimDepth) {
  if (finite(surfaceY) && finite(groundY) && surfaceY - groundY >= swimDepth) return surfaceY;
  return finite(groundY) ? groundY : finite(surfaceY) ? surfaceY : null;
}

/**
 * One hero's air state. update() each frame after the ground glue with
 *   dt, x, z      seconds since the last frame, the hero's position on the ground plane
 *   groundY       the ground the glue found under the hero
 *   surfaceY      the water surface there, or null
 *   heroY         the hero's height after the glue and the controller (a jump included)
 *   steer         {x, z}: where the movement keys point in the world (zero: fly straight on)
 *   dive          Shift held
 *   jumping       the controller's own jump is in the air
 *   allowed       false riding, swimming, dead, in a boss fall, with the Halo Wings flying...: back to the ground code
 * and get { mode, y, changed, landed, heading, speed, bank, velocity }: y is the height to put the hero at, or null
 * to keep what the ground code set; velocity is the glider's travel on the ground plane (m/s).
 */
export function createPlayerGlide({ glide = GLIDE } = {}) {
  let mode = 'ground', y = null, vy = 0, speed = 0, heading = 0, bank = 0;
  let lastY = null, lastX = null, lastZ = null, lastVy = 0, planar = 0;
  const velocity = { x: 0, z: 0 };
  const result = (patch) => ({ mode, y: mode === 'ground' ? null : y, heading, speed, bank, velocity: { ...velocity }, changed: false, landed: false, ...patch });

  const setVelocity = () => {
    velocity.x = mode === 'glide' ? Math.sin(heading) * speed : 0;
    velocity.z = mode === 'glide' ? Math.cos(heading) * speed : 0;
  };
  const toGround = () => { mode = 'ground'; y = null; vy = 0; speed = 0; bank = 0; setVelocity(); };

  return {
    mode: () => mode,
    isGliding: () => mode === 'glide',
    isAirborne: () => mode !== 'ground',
    velocity: () => ({ ...velocity }),
    speed: () => speed,
    bank: () => bank,
    heading: () => heading,
    planarSpeed: () => planar,

    /**
     * Space in the air. Opens the glider over a falling or jumping hero high enough above the landing, closes an open
     * one (the hero falls). { ok, action: 'opened' | 'closed', reason }
     */
    toggle({ heroY, groundY, surfaceY = null, bodyHeading = heading, horizontalSpeed = 0, jumping = false } = {}) {
      if (mode === 'glide') {
        mode = 'fall'; vy = Math.min(0, vy); bank = 0; setVelocity();
        return { ok: true, action: 'closed' };
      }
      if (mode !== 'fall' && !jumping) return { ok: false, reason: 'on_ground' };
      const startY = mode === 'fall' ? y : heroY;
      const landY = glideLandingY(groundY, surfaceY, glide.swimDepth);
      if (!finite(startY) || !finite(landY) || startY - landY < glide.openHeight) return { ok: false, reason: 'too_low' };
      mode = 'glide';
      y = startY;
      vy = finite(lastVy) ? Math.min(0, lastVy) : 0; // opening catches the fall and eases it into the glide's sink
      heading = finite(bodyHeading) ? bodyHeading : 0;
      // the run (or the jump's carry) goes into the glide: never slower than most of trim, never past the dive limit
      speed = Math.max(glide.minSpeed, Math.min(glide.maxSpeed, Math.max(glide.trimSpeed * 0.85, horizontalSpeed || 0, planar)));
      bank = 0;
      setVelocity();
      return { ok: true, action: 'opened' };
    },

    update({ dt = 0, x = null, z = null, groundY = null, surfaceY = null, heroY = null, steer = null, dive = false,
      jumping = false, allowed = true } = {}) {
      const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
      const stepMeters = finite(x) && finite(z) && finite(lastX) && finite(lastZ) ? Math.hypot(x - lastX, z - lastZ) : 0;
      const landY = glideLandingY(groundY, surfaceY, glide.swimDepth);
      if (step > 0 && finite(lastX)) planar = stepMeters / step;
      const before = mode;
      let landed = false;
      if (!allowed) {
        if (mode !== 'ground') toGround();
        lastY = finite(heroY) ? heroY : lastY; lastX = x; lastZ = z; lastVy = 0;
        return result({ changed: before !== mode });
      }
      if (stepMeters > glide.teleportMeters) {
        // Moved somewhere else: whatever was in the air ends, and the ground code places the hero; no ledge either.
        if (mode !== 'ground') toGround();
        planar = 0;
        lastY = finite(heroY) ? heroY : lastY; lastX = x; lastZ = z; lastVy = 0;
        return result({ changed: before !== mode });
      }
      if (mode === 'ground') {
        // A ledge: the ground (or the jump arc riding on it) drops away under the hero more steeply than any slope.
        const drop = finite(lastY) && finite(heroY) ? lastY - heroY : 0;
        if (drop >= glide.ledgeDrop && drop > glide.ledgeSlope * stepMeters && finite(landY) && lastY - landY >= glide.ledgeDrop) {
          mode = 'fall'; y = lastY; vy = jumping ? Math.max(0, lastVy) : 0;
        }
      }
      if (mode === 'fall') {
        vy = Math.max(-glide.terminalFall, vy - glide.gravity * step);
        y += vy * step;
      } else if (mode === 'glide') {
        // Steering: the keys' direction pulls the heading round at a limited rate; no keys fly straight on.
        let turn = 0;
        if (steer && (steer.x || steer.z)) {
          const want = Math.atan2(steer.x, steer.z);
          const d = wrap(want - heading);
          turn = Math.max(-glide.turnRate * step, Math.min(glide.turnRate * step, d));
          heading = wrap(heading + turn);
        }
        const turnShare = step > 0 ? turn / (glide.turnRate * step) : 0;
        bank += ((-turnShare * glide.maxBank) - bank) * Math.min(1, step * 6);
        // Height for speed: a dive gains speed and sinks fast; after it, the extra speed holds the sink up (or
        // climbs a little) while it bleeds back to trim.
        let sinkTarget;
        if (dive) {
          speed = Math.min(glide.maxSpeed, speed + glide.diveAccel * step);
          sinkTarget = -glide.diveSink;
        } else {
          const extra = speed - glide.trimSpeed;
          if (extra > 0) speed = Math.max(glide.trimSpeed, speed - glide.bleed * step);
          else speed = Math.min(glide.trimSpeed, speed + glide.bleed * 0.5 * step);
          sinkTarget = -glide.trimSink + Math.max(0, extra) * glide.pullUp;
        }
        speed = Math.max(glide.minSpeed, speed);
        vy += (sinkTarget - vy) * Math.min(1, step * glide.sinkEase);
        y += vy * step;
      }
      setVelocity();
      if (mode !== 'ground' && finite(landY) && y <= landY && vy <= 0) {
        // Touchdown: the ground code owns the feet again; the run carries on (or the swim starts on deep water).
        y = landY; landed = true;
        const touched = y;
        toGround();
        lastY = touched; lastX = x; lastZ = z; lastVy = 0;
        return result({ changed: true, landed: true, y: touched, mode: 'ground' });
      }
      if (mode === 'ground') {
        lastVy = finite(heroY) && finite(lastY) && step > 0 ? (heroY - lastY) / step : 0;
        lastY = heroY;
      } else {
        lastVy = vy; lastY = y;
      }
      lastX = x; lastZ = z;
      return result({ changed: before !== mode, landed });
    },
    reset() { toGround(); lastY = null; lastX = null; lastZ = null; lastVy = 0; planar = 0; },
  };
}
