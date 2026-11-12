export const AXE_STATION_CONFIG = Object.freeze({
  reuseRadius: 15, interactionRange: 9, presenceRadius: 13,
  visibilityRadius: 85, renderCap: 12, idleTimeoutMs: 20_000, summonCooldownMs: 5_000,
  regionalRadius: 100, regionalCap: 6, perGroupCap: 2, capacity: 6,
  // Encloses the 4.9 × 4.3m platform's corners as well as its edges.
  radius: 3.3, clearance: 0.8, maxSlope: 0.2, maxHeightDifference: 0.8,
  leaseTimeoutMs: 8_000, heartbeatMs: 2_000,
});

export const AXE_STATION_GROUPS = Object.freeze({
  blacksmith: { label: 'Blacksmith', serviceId: 'reinforcement' },
  shrine: { label: 'Spiritual Shrine', serviceId: 'core' },
  appearance: { label: 'Appearance Pavilion', serviceId: 'cape' },
  stable: { label: 'Creature Stable', serviceId: 'pet' },
  elixirs: { label: 'Elixir Workstation', serviceId: 'elixir' },
});

export const stationDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function findAXEStationPlacement({ player, yaw = 0, sampleGround, isBlocked, stations = [], players = [], config = AXE_STATION_CONFIG }) {
  if (!player || !sampleGround) return null;
  const radius = config.radius;
  for (const distance of [6.5, 8, 9]) {
    for (const angle of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI]) {
      const x = player.x + Math.sin(yaw + angle) * distance;
      const z = player.z + Math.cos(yaw + angle) * distance;
      const y = sampleGround(x, z);
      if (!Number.isFinite(y)) continue;
      let min = y, max = y, valid = true;
      for (const [dx, dz] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const height = sampleGround(x + dx * radius, z + dz * radius);
        if (!Number.isFinite(height) || Math.abs(height - y) / radius > config.maxSlope) { valid = false; break; }
        min = Math.min(min, height); max = Math.max(max, height);
      }
      const position = { x, y: max, z };
      if (!valid || max - min > config.maxHeightDifference || isBlocked?.(position, radius)) continue;
      if (stations.some(s => stationDistance(s.position, position) < radius * 2 + config.clearance)) continue;
      if (players.some(p => stationDistance(p, position) < radius + config.clearance)) continue;
      return position;
    }
  }
  return null;
}

export function resolveAXEStationCollision(position, stations, playerRadius = .62, config = AXE_STATION_CONFIG) {
  let pushed = false;
  for (const station of stations) {
    const dx = position.x - station.position.x, dz = position.z - station.position.z;
    const distance = Math.hypot(dx, dz), min = config.radius + playerRadius;
    if (distance >= min || Math.abs((position.y ?? station.position.y) - station.position.y) > 4) continue;
    position.x = station.position.x + (distance > .001 ? dx / distance : 1) * min;
    position.z = station.position.z + (distance > .001 ? dz / distance : 0) * min;
    pushed = true;
  }
  return pushed;
}
