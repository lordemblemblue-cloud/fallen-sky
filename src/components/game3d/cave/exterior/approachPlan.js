// Walkable approach from the Quarry Approach trail to the Ashen Cliff mouth.
// Pure data: no meshes. The terrain grade, the ribbon mesh and the colliders
// all read this same polyline so the ground the player sees is the ground
// their feet sample.
import { wolfveilHeight } from '../../wolfveil/WolfveilLayout.js';
import { ASHEN_CLIFF_SITE } from '../caveSite.js';

const MAX_GRADE = 0.24;
const hash = (a, b, c = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

function gradeLeg(from, to, endKind) {
  const pts = [];
  let x = from.x, z = from.z, y = from.y;
  let side = hash(from.x, from.z, 2) > 0.5 ? 1 : -1;
  for (let guard = 0; guard < 70; guard++) {
    const dx = to.x - x, dz = to.z - z;
    const dist = Math.hypot(dx, dz);
    const dy = to.y - y;
    if (dist < 4.2) break;
    if (Math.abs(dy) <= MAX_GRADE * dist + 0.08) {
      const n = Math.max(1, Math.ceil(dist / 6.2));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const wobble = Math.sin(t * Math.PI) * (hash(from.x, to.z, i) - 0.5) * 1.15;
        const nx = -dz / (dist || 1), nz = dx / (dist || 1);
        pts.push({
          x: x + dx * t + nx * wobble,
          z: z + dz * t + nz * wobble,
          y: y + dy * t,
          kind: i === n ? endKind : 'path',
        });
      }
      return pts;
    }
    const step = 6.4 + hash(x, z, guard) * 1.8;
    const fx = dx / dist, fz = dz / dist;
    const dirx = fx * 0.36 + (-fz) * side * 0.93;
    const dirz = fz * 0.36 + fx * side * 0.93;
    const len = Math.hypot(dirx, dirz) || 1;
    const climb = Math.sign(dy || 1) * MAX_GRADE * step;
    const y2 = dy > 0 ? Math.min(to.y, y + climb) : Math.max(to.y, y + climb);
    x += (dirx / len) * step;
    z += (dirz / len) * step;
    y = y2;
    pts.push({ x, z, y, kind: 'turn' });
    if (guard % 3 === 2) side *= -1;
  }
  pts.push({ x: to.x, z: to.z, y: to.y, kind: endKind });
  return pts;
}

function pushUnique(points, point) {
  const last = points[points.length - 1];
  if (last && Math.hypot(last.x - point.x, last.z - point.z) < 0.4) {
    points[points.length - 1] = point;
    return;
  }
  points.push(point);
}

/**
 * Outdoor half-width of the tread. Wider at bends and at the apron so a
 * turn never opens a gap, and the last metres meet the arch.
 */
export function approachHalfWidth(distanceToMouth, kind) {
  if (kind === 'throat' || kind === 'interior') return 2.4;
  const near = Math.max(0, Math.min(1, 1 - distanceToMouth / 14));
  const wave = 0.16 * Math.sin(distanceToMouth * 0.21);
  return 1.78 + wave + near * 0.72;
}

function buildPoints(heightAt) {
  const site = ASHEN_CLIFF_SITE;
  const controls = [
    { x: site.junction.x, z: site.junction.z, kind: 'junction' },
    { x: 372, z: -64, kind: 'bend' },
    { x: 398, z: -98, kind: 'bend' },
    { x: 438, z: -118, kind: 'bend' },
    { x: 468, z: -132, kind: 'bend' },
    { x: 482, z: -118, kind: 'staging' },
    { x: site.mouth.x, z: site.mouth.z, y: site.floorY, kind: 'threshold' },
  ].map(control => ({
    ...control,
    y: control.y ?? heightAt(control.x, control.z),
  }));
  const points = [{ ...controls[0] }];
  for (let i = 1; i < controls.length; i++) {
    for (const point of gradeLeg(controls[i - 1], controls[i], controls[i].kind))
      pushUnique(points, point);
  }
  const mouth = points[points.length - 1];
  const { inward, throatLength, throatDrop } = site;
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pushUnique(points, {
      x: mouth.x + inward.x * throatLength * t,
      z: mouth.z + inward.z * throatLength * t,
      y: mouth.y - throatDrop * t,
      kind: i === steps ? 'interior' : 'throat',
    });
  }
  return points.map(point => Object.freeze({ ...point }));
}

function outdoorLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].kind === 'throat' || points[i].kind === 'interior') break;
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return length;
}

function sampleAt(points, along) {
  let remaining = along;
  const limit = points.findIndex(point => point.kind === 'throat');
  const last = limit === -1 ? points.length - 1 : limit;
  for (let i = 1; i <= last; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) continue;
    if (remaining <= len || i === last) {
      const t = Math.max(0, Math.min(1, remaining / len));
      return {
        x: a.x + dx * t, z: a.z + dz * t, y: a.y + dy * t,
        tx: dx / len, tz: dz / len, kind: b.kind,
      };
    }
    remaining -= len;
  }
  return null;
}

function decorate(points) {
  const length = outdoorLength(points);
  const props = [];
  const solids = [];
  const site = ASHEN_CLIFF_SITE;
  const add = (prop) => {
    props.push(Object.freeze(prop));
    if (prop.solid) solids.push(Object.freeze({
      x: prop.x, z: prop.z, radius: prop.radius, id: prop.id,
    }));
  };

  // Junction sign, off the quarry tread and off our tread.
  const start = points[0];
  const next = points[1];
  const sdx = next.x - start.x, sdz = next.z - start.z;
  const slen = Math.hypot(sdx, sdz) || 1;
  add({
    id: 'junction-sign', kind: 'sign',
    x: start.x - (sdz / slen) * 3.5, z: start.z + (sdx / slen) * 3.5,
    yaw: Math.atan2(sdx, sdz), scale: 1, solid: false, radius: 0,
  });

  let shrinePlaced = false;
  let logPlaced = false;
  let travelled = 12;
  let station = 0;
  while (travelled < length - 11) {
    const gap = 9.5 + hash(travelled, station, 4) * 7.5;
    const sample = sampleAt(points, travelled);
    travelled += gap;
    if (!sample) break;
    station += 1;
    const fraction = travelled / length;
    const side = hash(sample.x, sample.z, station) > 0.48 ? 1 : -1;
    const lateral = 3.45 + hash(station, sample.z, 8) * 1.35;
    const lx = -sample.tz * side;
    const lz = sample.tx * side;
    const x = sample.x + lx * lateral;
    const z = sample.z + lz * lateral;
    const yaw = hash(x, z, 3) * Math.PI * 2;
    const roll = hash(z, x, 5);

    if (!shrinePlaced && fraction > 0.58 && fraction < 0.72) {
      shrinePlaced = true;
      const stones = [
        { dx: 0, dz: 0, h: 2.15, w: 0.55 },
        { dx: 1.5, dz: 0.4, h: 1.55, w: 0.48 },
        { dx: -1.35, dz: 0.2, h: 1.85, w: 0.42 },
        { dx: 0.4, dz: 1.5, h: 0.42, w: 1.3 },
      ];
      stones.forEach((stone, index) => {
        const sx = x + lx * stone.dx + sample.tx * stone.dz;
        const sz = z + lz * stone.dx + sample.tz * stone.dz;
        add({
          id: 'shrine-' + index, kind: index === 3 ? 'fallen-stone' : 'standing-stone',
          x: sx, z: sz, yaw: yaw + index, scale: stone.h, width: stone.w,
          solid: index !== 3, radius: index === 3 ? 0 : 0.55,
        });
      });
      continue;
    }

    if (!logPlaced && fraction > 0.4 && fraction < 0.52 && roll > 0.4) {
      logPlaced = true;
      add({
        id: 'fallen-log', kind: 'log', x, z, yaw: yaw + 0.4,
        scale: 2.4 + roll, solid: true, radius: 0.55,
      });
      continue;
    }

    if (fraction > 0.78) {
      add({
        id: 'torch-' + station, kind: 'torch',
        x: sample.x + lx * 3.35, z: sample.z + lz * 3.35,
        yaw, scale: 1, solid: false, radius: 0,
      });
      if (hash(station, x, 9) > 0.45) {
        add({
          id: 'talus-' + station, kind: 'boulder',
          x, z, yaw, scale: 0.7 + hash(z, station) * 0.85,
          solid: true, radius: 0.72,
        });
      }
      continue;
    }

    const pick = hash(station, fraction, x);
    if (pick > 0.72) {
      add({
        id: 'cairn-' + station, kind: 'cairn', x, z, yaw,
        scale: 0.85 + pick * 0.5, solid: true, radius: 0.62,
      });
    } else if (pick > 0.38) {
      add({
        id: 'boulder-' + station, kind: 'boulder', x, z, yaw,
        scale: 0.55 + hash(x, station, 2) * 1.15,
        pitch: (hash(z, station) - 0.5) * 0.6,
        solid: true, radius: 0.7 + hash(x, z) * 0.35,
      });
    } else {
      const cluster = 3 + Math.floor(hash(station, z, 6) * 3);
      for (let fern = 0; fern < cluster; fern++) {
        const jx = (hash(fern, station, 1) - 0.5) * 2.2;
        const jz = (hash(station, fern, 2) - 0.5) * 2.2;
        add({
          id: 'fern-' + station + '-' + fern, kind: 'fern',
          x: x + lx * jx * 0.35 + sample.tx * jz,
          z: z + lz * jx * 0.35 + sample.tz * jz,
          yaw: hash(fern, x, z) * Math.PI * 2,
          scale: 0.7 + hash(fern, z, station) * 0.7,
          solid: false, radius: 0,
        });
      }
    }
  }

  // Mouth dressing. Asymmetric on purpose: a tall left horn, a low right
  // moss bank, torches, and the bronze ring that makes the arch readable
  // from the quarry trail.
  const mx = site.mouth.x, mz = site.mouth.z;
  const ix = site.inward.x, iz = site.inward.z;
  const sx = -iz, sz = ix;
  const placeMouth = (id, kind, along, lateral, scale, solid, radius, extra = {}) => {
    add({
      id, kind,
      x: mx + ix * along + sx * lateral,
      z: mz + iz * along + sz * lateral,
      yaw: extra.yaw ?? hash(along, lateral) * Math.PI,
      scale, solid, radius, ...extra,
    });
  };
  placeMouth('buttress-left', 'boulder', -1.2, 4.7, 2.15, true, 1.35, { pitch: 0.2 });
  placeMouth('horn-left', 'spire', 0.4, 3.9, 3.4, true, 0.9);
  placeMouth('buttress-right', 'boulder', -0.6, -5.1, 1.45, true, 1.15);
  placeMouth('moss-right', 'boulder', 1.4, -4.4, 1.05, true, 0.85, { pitch: 0.5 });
  placeMouth('torch-left', 'torch', -2.4, 3.55, 1.15, false, 0);
  placeMouth('ember-right', 'ember', -2.2, -3.5, 1, false, 0);
  placeMouth('eye-ring', 'ring', 0.15, 0.2, 1, false, 0, { lift: site.openingHeight - 0.15 });
  for (let tooth = 0; tooth < 7; tooth++) {
    const t = tooth / 6;
    const ang = Math.PI * (1 - t);
    const lateral = Math.cos(ang) * (site.openingWidth / 2) * 0.92;
    const lift = site.openingHeight * 0.42 + Math.sin(ang) * (site.openingHeight * 0.5);
    if (lift < 2.6) continue;
    placeMouth('tooth-' + tooth, 'tooth', -0.25, lateral, 0.45 + (tooth % 3) * 0.28, false, 0, {
      lift, yaw: ang,
    });
  }
  const talus = [
    [-3.2, 6.4, 1.1], [-4.6, 7.6, 0.7], [-2.4, -6.8, 0.9],
    [-5.5, -7.2, 1.3], [-6.2, 5.2, 0.55], [-1.5, 7.1, 0.48],
  ];
  talus.forEach(([along, lateral, scale], index) => {
    placeMouth('mouth-talus-' + index, 'boulder', along, lateral, scale, true, 0.45 + scale * 0.35);
  });

  return { props, solids };
}

function nudgeOffTread(points, props) {
  const segments = buildSegments(points);
  const distance = (x, z) => {
    let best = null;
    for (const segment of segments) {
      const t = Math.max(0, Math.min(1,
        ((x - segment.ax) * segment.dx + (z - segment.az) * segment.dz) / segment.len2));
      const px = segment.ax + segment.dx * t;
      const pz = segment.az + segment.dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, px, pz };
    }
    return best;
  };
  return props.map(prop => {
    if (prop.kind === 'ring' || prop.kind === 'tooth') return prop;
    let x = prop.x, z = prop.z;
    for (let step = 0; step < 6; step++) {
      const near = distance(x, z);
      if (!near || near.d >= 3.05) break;
      const dx = x - near.px, dz = z - near.pz;
      const len = Math.hypot(dx, dz) || 1;
      x = near.px + (dx / len) * 3.2;
      z = near.pz + (dz / len) * 3.2;
    }
    return x === prop.x && z === prop.z ? prop : { ...prop, x, z };
  });
}

function buildSegments(points) {
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-4) continue;
    segments.push(Object.freeze({
      ax: a.x, az: a.z, ay: a.y, dx, dz, dy, len2,
      kind: b.kind,
      minX: Math.min(a.x, b.x) - 12, maxX: Math.max(a.x, b.x) + 12,
      minZ: Math.min(a.z, b.z) - 12, maxZ: Math.max(a.z, b.z) + 12,
    }));
  }
  return Object.freeze(segments);
}

function buildEntrance(points) {
  const site = ASHEN_CLIFF_SITE;
  const threshold = points.find(point => point.kind === 'threshold') ?? points.at(-2);
  const drop = site.throatDrop * (site.interiorDistance / site.throatLength);
  return Object.freeze({
    id: site.id,
    name: site.name,
    position: Object.freeze({ x: threshold.x, y: threshold.y, z: threshold.z }),
    inward: Object.freeze({ x: site.inward.x, y: 0, z: site.inward.z }),
    opening: Object.freeze({ width: site.openingWidth, height: site.openingHeight }),
    interiorStart: Object.freeze({
      x: threshold.x + site.inward.x * site.interiorDistance,
      y: threshold.y - drop,
      z: threshold.z + site.inward.z * site.interiorDistance,
    }),
    // Applied by the village group. These coordinates stay local.
    worldOffsetZ: 70,
    trail: site.junction.trail,
  });
}

let cached = null;

export function createAshenCliffApproach(heightAt = wolfveilHeight) {
  if (typeof heightAt !== 'function') throw new TypeError('heightAt sampler required');
  const points = Object.freeze(buildPoints(heightAt));
  const dressing = decorate(points);
  const props = Object.freeze(nudgeOffTread(points, dressing.props).map(prop => Object.freeze(prop)));
  const solids = Object.freeze(props
    .filter(prop => prop.solid && prop.radius > 0.2)
    .map(prop => Object.freeze({ x: prop.x, z: prop.z, radius: prop.radius, id: prop.id })));
  const entrance = buildEntrance(points);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  }
  return Object.freeze({
    points,
    segments: buildSegments(points),
    props,
    solids,
    entrance,
    bounds: Object.freeze({
      minX: minX - 30, maxX: maxX + 36, minZ: minZ - 24, maxZ: maxZ + 24,
    }),
    maxGrade: MAX_GRADE,
  });
}

/** Singleton used by the terrain grade. Built before the grade is installed. */
export function getAshenCliffApproach() {
  if (!cached) cached = createAshenCliffApproach(wolfveilHeight);
  return cached;
}

export function approachPointDistance(x, z, approach = getAshenCliffApproach()) {
  let best = null;
  for (const segment of approach.segments) {
    if (x < segment.minX || x > segment.maxX || z < segment.minZ || z > segment.maxZ) continue;
    const t = Math.max(0, Math.min(1, ((x - segment.ax) * segment.dx + (z - segment.az) * segment.dz) / segment.len2));
    const px = segment.ax + segment.dx * t;
    const pz = segment.az + segment.dz * t;
    const py = segment.ay + segment.dy * t;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, py, px, pz, kind: segment.kind };
  }
  return best;
}
