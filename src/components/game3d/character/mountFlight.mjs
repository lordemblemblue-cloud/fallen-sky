// Mount flight: a ridden winged mount takes off, cruises a few metres above the ground (following the terrain
// height sampled under it) and lands again. Pure state, no three.js: GameWorld3D adds the altitude to the ground
// height it already samples for the mount and the rider, picks the `fly` clip while airborne, and tilts the mount
// by `pitch`. Remote players receive the rider's Y through the normal position packet.
export const MOUNT_FLIGHT = Object.freeze({
  cruiseAltitude: 3.2,     // metres above the ground sample
  takeoffSeconds: 0.9,     // ease to cruise altitude
  landingSeconds: 0.7,     // ease back to the ground
  airborneAltitude: 0.35,  // above this the wings beat (the `fly` clip)
  speedMultiplier: 1.25,   // mounted travel speed while flying
  hoverBob: 0.12,          // hover bob amplitude (metres) while not moving
  hoverBobHz: 0.9,
  travelBob: 0.05,
  pitchMovingRad: 0.14,    // nose down while travelling
  pitchLandingRad: -0.1,   // nose up while landing
});

export function createMountFlightController(config = {}) {
  const c = { ...MOUNT_FLIGHT, ...config };
  let phase = 'ground'; // ground | takeoff | air | landing
  let altitude = 0;
  let pitch = 0;
  let airTime = 0;

  const ease = (current, target, seconds, delta) => current + (target - current) * (1 - Math.exp(-delta * 4 / Math.max(0.05, seconds)));

  const api = {
    /** Space while riding: take off from the ground (or while landing), land while in the air. */
    toggle() {
      if (phase === 'ground' || phase === 'landing') { phase = 'takeoff'; return 'takeoff'; }
      phase = 'landing';
      return 'landing';
    },
    /** Dismount or a forced stop: drop the flight state at once (immediate) or glide down. */
    land(immediate = false) {
      if (immediate) { phase = 'ground'; altitude = 0; pitch = 0; airTime = 0; return; }
      if (phase !== 'ground') phase = 'landing';
    },
    update(delta, { mounted = true, moving = false } = {}) {
      const dt = Number.isFinite(delta) ? Math.max(0, Math.min(0.1, delta)) : 0;
      if (!mounted) { api.land(true); return api.state(); }
      if (phase === 'takeoff') {
        altitude = ease(altitude, c.cruiseAltitude, c.takeoffSeconds, dt);
        if (altitude >= c.cruiseAltitude - 0.12) phase = 'air';
      } else if (phase === 'air') {
        airTime += dt;
        const bob = (moving ? c.travelBob : c.hoverBob) * Math.sin(airTime * Math.PI * 2 * c.hoverBobHz);
        altitude = ease(altitude, c.cruiseAltitude + bob, 0.45, dt);
      } else if (phase === 'landing') {
        altitude = ease(altitude, 0, c.landingSeconds, dt);
        if (altitude <= 0.04) { altitude = 0; phase = 'ground'; airTime = 0; }
      } else {
        altitude = 0;
      }
      const targetPitch = phase === 'landing' ? c.pitchLandingRad : (phase !== 'ground' && moving ? c.pitchMovingRad : 0);
      pitch = ease(pitch, targetPitch, 0.35, dt);
      return api.state();
    },
    state() {
      return { phase, altitude, pitch, airborne: phase !== 'ground' && altitude >= c.airborneAltitude, flying: phase !== 'ground' };
    },
    isFlying: () => phase !== 'ground',
    isAirborne: () => phase !== 'ground' && altitude >= c.airborneAltitude,
    getAltitude: () => altitude,
    getPhase: () => phase,
    speedMultiplier: () => (phase === 'ground' ? 1 : c.speedMultiplier),
    config: c,
  };
  return api;
}
