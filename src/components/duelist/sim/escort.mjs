import { isDown } from '../core/index.mjs';
import { bodyOf } from './world.mjs';

export const ESCORT_RADIUS = 3.5;
export const ESCORT_SPEED = 1.35;
export const ESCORT_ROUTE = Object.freeze([
  { x: 0, z: -18 }, { x: -5, z: -8 }, { x: -5, z: 1 }, { x: 5, z: 8 }, { x: 1, z: 18 },
].map(Object.freeze));
const legs = ESCORT_ROUTE.slice(1).map((end, i) => {
  const start = ESCORT_ROUTE[i], dx = end.x - start.x, dz = end.z - start.z;
  return { start, dx, dz, length: Math.hypot(dx, dz), yaw: Math.atan2(dx, dz) };
});
export const ESCORT_LENGTH = legs.reduce((sum, leg) => sum + leg.length, 0);

export function payloadPose(distance) {
  let remaining = Math.max(0, Math.min(distance, ESCORT_LENGTH));
  for (const leg of legs) {
    if (remaining <= leg.length || leg === legs.at(-1)) {
      const t = Math.min(1, remaining / leg.length);
      return { x: leg.start.x + t * leg.dx, z: leg.start.z + t * leg.dz, yaw: leg.yaw };
    }
    remaining -= leg.length;
  }
}

export function makeEscort() {
  return { distance: 0, progress: 0, ...payloadPose(0), attackers: 0, defenders: 0, moving: false, contested: false, overtime: false };
}

// Only the authority samples fighters. Delivery takes precedence over the final tick of the clock.
export function stepEscort(match, dt) {
  const cart = match.escort;
  let attackers = 0, defenders = 0;
  for (const fighter of match.world.fighters.values()) {
    if (fighter.vitals.dead || isDown(fighter, match.world.time) || fighter.heldBy ||
        fighter.activeRelicUntil > match.world.time) continue;
    const body = bodyOf(match.world, fighter.id);
    if (!body || body.y > 2 || Math.hypot(body.x - cart.x, body.z - cart.z) > ESCORT_RADIUS) continue;
    if (fighter.team === 'red') attackers++;
    if (fighter.team === 'blue') defenders++;
  }
  cart.attackers = attackers;
  cart.defenders = defenders;
  cart.contested = attackers > 0 && defenders > 0;
  cart.moving = attackers > 0 && defenders === 0;
  if (cart.moving) {
    cart.distance = Math.min(ESCORT_LENGTH, cart.distance + dt * ESCORT_SPEED);
    Object.assign(cart, payloadPose(cart.distance));
    cart.progress = cart.distance / ESCORT_LENGTH * 100;
  }
  cart.overtime = match.clock >= match.def.clock && attackers > 0 && cart.distance < ESCORT_LENGTH;
  if (cart.distance >= ESCORT_LENGTH) return 'red';
  if (match.clock >= match.def.clock && !attackers) return 'blue';
  return null;
}
