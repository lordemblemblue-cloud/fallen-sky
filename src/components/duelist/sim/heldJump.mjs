/**
 * Duelist 2's original hold-to-ascent jump, written for the shared deterministic
 * arena/mission simulation. Reference: Game 2's fighter.js starts an ordinary
 * jump immediately and switches to a higher Force jump after 50ms of holding
 * Space; releasing immediately cancels upward velocity.
 *
 * Unlike the older per-player implementation, all timing and height stages are
 * computed from server simulation ticks. Clients send only held/not-held input,
 * never a jump level, velocity or destination height.
 */
export const HELD_JUMP = Object.freeze({
  launchSpeed: 5.65, // metres/s, immediate tap launch (Game 2 reference)
  stages: Object.freeze([
    Object.freeze({ after: 0.05, height: 3.3 }),
    Object.freeze({ after: 0.32, height: 5.7 }),
    Object.freeze({ after: 0.60, height: 10.4 }),
  ]),
  terminalVelocity: 35,
});

export function beginHeldJump(body) {
  body.heldJump = { age: 0, stage: 0, origin: body.y, rising: true };
  body.vy = HELD_JUMP.launchSpeed;
}

/**
 * Advance the authoritative body vertically. Returns true only when the body
 * landed; the caller then clears jumped/air-dash state and its old jump action.
 * Pressing jump in midair cannot restart this state. Releasing once makes the
 * upward cutoff permanent until the next grounded jump.
 */
export function advanceHeldJump(body, dt, held, gravity = 18, heightCap = 10.4) {
  const jump = body.heldJump;
  if (!jump || !Number.isFinite(dt) || dt <= 0) return false;
  if (!held || !jump.rising) {
    jump.rising = false;
    body.vy = Math.min(0, body.vy);
  } else {
    jump.age += dt;
    const stage = HELD_JUMP.stages.reduce((n, tier, index) => jump.age + 1e-8 >= tier.after ? index + 1 : n, 0);
    if (stage > jump.stage && body.vy > 0) {
      jump.stage = stage;
      const height = Math.min(HELD_JUMP.stages[stage - 1].height, heightCap);
      const remaining = Math.max(0, height - (body.y - jump.origin));
      if (remaining > 0) body.vy = Math.max(body.vy, Math.sqrt(2 * gravity * remaining));
    }
    if (body.y - jump.origin >= heightCap) {
      body.vy = Math.min(body.vy, 0);
      jump.rising = false;
    }
    if (body.vy <= 0) jump.rising = false;
  }
  body.vy = Math.max(-HELD_JUMP.terminalVelocity, body.vy - gravity * dt);
  body.y = Math.max(0, body.y + body.vy * dt);
  if (body.y > 0) return false;
  body.y = 0;
  body.vy = 0;
  body.heldJump = null;
  return true;
}
