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
// Ground more than 2 m above the hero in the air is a wall, not a landing: an open glider samples the ground ahead and
// slides along such a face or is held at it, sinking all the while; a move that still ends in it (a long frame, a fall
// steered at a cliff) is taken back. So the air never lifts the hero onto ground it could not land on from below.
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
  teleportMeters: 8, // m across in one frame (a respawn, a recall): the air ends...
  teleportSpeed: 20, // ...when that is also faster than any glide or run over the frame's time (a long frame is a move)
  wallHeight: 2, // m: ground this far above the hero in the air is a wall (held, or sliding along it), never a landing
  wallReach: 0.6, // m: an open glider samples the ground this far ahead (about the body's 0.62 m collider)...
  wallLookSeconds: 0.1, // ...plus this much of its travel
  wallSample: 0.6, // m: spacing of the samples that find which way a face rises
  wallSlope: 0.8, // m up per metre across at least: a face to slide along (no face found: held)
  wallSlideMin: 0.5, // m/s: slower than this along a face is held
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
 *   groundAt      (x, z, y) => the ground the glue would find at x, z from height y: an open glider samples ahead
 * and get { mode, y, x, z, changed, landed, heading, speed, bank, velocity, wall }: y is the height to put the hero
 * at, or null to keep what the ground code set; x, z (else null) take back a move into a wall; velocity is the
 * glider's travel on the ground plane (m/s), along a face or nothing when held; wall is 'clear', 'slide' or 'held'.
 */
export function createPlayerGlide({ glide = GLIDE } = {}) {
  let mode = 'ground', y = null, vy = 0, speed = 0, heading = 0, bank = 0;
  let lastY = null, lastX = null, lastZ = null, lastVy = 0, planar = 0, lastGround = null, lastSurface = null;
  let wall = 'clear';
  const velocity = { x: 0, z: 0 };
  const result = (patch) => ({ mode, y: mode === 'ground' ? null : y, x: null, z: null, heading, speed, bank,
    velocity: { ...velocity }, wall, changed: false, landed: false, ...patch });

  const setVelocity = () => {
    velocity.x = mode === 'glide' ? Math.sin(heading) * speed : 0;
    velocity.z = mode === 'glide' ? Math.cos(heading) * speed : 0;
  };
  const toGround = () => { mode = 'ground'; y = null; vy = 0; speed = 0; bank = 0; setVelocity(); };

  // The ground ahead of an open glider: more than wallHeight above it is a wall. The glide slides along the face (the
  // part of its travel into the face is dropped) or, head-on or in a corner, is held there; either way it goes on
  // sinking, and lands at the foot of the face or wherever the ground ahead comes within reach.
  const clearOfWalls = (x, z, groundAt) => {
    const travel = Math.hypot(velocity.x, velocity.z);
    if (!(travel > 0) || !finite(x) || !finite(z) || !finite(y)) return;
    const reach = glide.wallReach + travel * glide.wallLookSeconds;
    const ground = (px, pz) => { const g = groundAt(px, pz, y); return finite(g) ? g : null; };
    const isWall = (g) => g !== null && g > y + glide.wallHeight;
    const px = x + velocity.x / travel * reach, pz = z + velocity.z / travel * reach;
    if (!isWall(ground(px, pz))) return;
    // Which way the face rises, from the ground's slope around that spot.
    const e = glide.wallSample;
    const xp = ground(px + e, pz), xm = ground(px - e, pz), zp = ground(px, pz + e), zm = ground(px, pz - e);
    let ux = xp !== null && xm !== null ? (xp - xm) / (2 * e) : 0;
    let uz = zp !== null && zm !== null ? (zp - zm) / (2 * e) : 0;
    const rise = Math.hypot(ux, uz);
    let sx = 0, sz = 0;
    if (rise >= glide.wallSlope) {
      ux /= rise; uz /= rise;
      const into = Math.max(0, velocity.x * ux + velocity.z * uz);
      sx = velocity.x - into * ux; sz = velocity.z - into * uz;
    }
    const along = Math.hypot(sx, sz);
    if (along > glide.wallSlideMin && !isWall(ground(x + sx / along * reach, z + sz / along * reach))) {
      velocity.x = sx; velocity.z = sz; wall = 'slide';
    } else {
      velocity.x = 0; velocity.z = 0; wall = 'held';
    }
  };

  return {
    mode: () => mode,
    isGliding: () => mode === 'glide',
    isAirborne: () => mode !== 'ground',
    velocity: () => ({ ...velocity }),
    travelSpeed: () => Math.hypot(velocity.x, velocity.z), // what the world moves the hero by: less along a face
    wall: () => wall,
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
      jumping = false, allowed = true, groundAt = null } = {}) {
      const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
      const stepMeters = finite(x) && finite(z) && finite(lastX) && finite(lastZ) ? Math.hypot(x - lastX, z - lastZ) : 0;
      if (step > 0 && finite(lastX)) planar = stepMeters / step;
      const before = mode;
      let landed = false;
      wall = 'clear';
      const keep = () => { lastX = x; lastZ = z; lastGround = groundY; lastSurface = surfaceY; };
      if (!allowed) {
        if (mode !== 'ground') toGround();
        lastY = finite(heroY) ? heroY : lastY; lastVy = 0; keep();
        return result({ changed: before !== mode });
      }
      if (stepMeters > glide.teleportMeters && stepMeters > glide.teleportSpeed * Math.max(0, Number(dt) || 0)) {
        // Moved somewhere else: whatever was in the air ends, and the ground code places the hero; no ledge either.
        // (A long frame's move is not this: the world's frame time is not capped, so it goes on to the checks below.)
        if (mode !== 'ground') toGround();
        planar = 0;
        lastY = finite(heroY) ? heroY : lastY; lastVy = 0; keep();
        return result({ changed: before !== mode });
      }
      // In the air, ground more than wallHeight above the hero is a wall, never a landing: a move that still went into
      // it (a long frame, or a fall steered at a cliff) is taken back to where the hero was.
      let back = null;
      if (mode !== 'ground' && finite(groundY) && finite(y) && groundY > y + glide.wallHeight && finite(lastX) && finite(lastZ)) {
        back = { x: lastX, z: lastZ };
        x = lastX; z = lastZ; groundY = lastGround; surfaceY = lastSurface;
        planar = 0; wall = 'held';
      }
      const landY = glideLandingY(groundY, surfaceY, glide.swimDepth);
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
      if (mode === 'glide' && typeof groundAt === 'function') clearOfWalls(x, z, groundAt);
      else if (mode === 'glide' && back) { velocity.x = 0; velocity.z = 0; } // nothing to look ahead with: wait there
      if (mode !== 'ground' && finite(landY) && y <= landY) {
        // Touchdown (ground at most wallHeight above): the ground code owns the feet again; the run carries on (or the
        // swim starts on deep water). Even climbing out of a dive, ground met is landed on, never flown through.
        y = landY; landed = true;
        const touched = y;
        toGround();
        lastY = touched; lastVy = 0; keep();
        return result({ changed: true, landed: true, y: touched, mode: 'ground', ...back });
      }
      if (mode === 'ground') {
        lastVy = finite(heroY) && finite(lastY) && step > 0 ? (heroY - lastY) / step : 0;
        lastY = heroY;
      } else {
        lastVy = vy; lastY = y;
      }
      keep();
      return result({ changed: before !== mode, landed, ...back });
    },
    reset() { toGround(); lastY = null; lastX = null; lastZ = null; lastVy = 0; planar = 0; lastGround = null; lastSurface = null; wall = 'clear'; },
  };
}
