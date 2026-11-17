// Wolfveil Overworld Cave & Tunnel System — pure layout, floor elevation,
// terrain mouth cutout, and capsule-corridor collision rules.
//
// Four unique explorable caverns around Wolfveil Valley linked underground via
// a central Subterranean Rotunda and five winding rock-cut tunnels.
// Coordinates are Wolfveil-local (Game 3D applies +70m Z via world.group).
import { wolfveilHeight } from './WolfveilLayout.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

const RAW_ENTRANCES = [
  {
    id: 'jade_lantern_grotto',
    name: 'Jade Lantern Grotto',
    theme: 'lantern_shrine',
    mouth: [-360, -400],
    inwardDir: [-0.55, -0.84], // further SW, away from the south road
    chamberOffset: 30,
    chamberRadius: 15.0,
    ceilingHeight: 8.4,
    lightColor: 0xffb35c,
    accentColor: 0x4fd4a8,
  },
  {
    id: 'whispering_root_hollow',
    name: 'Whispering Root Hollow',
    nameShort: 'Root Hollow',
    theme: 'skylight_roots',
    mouth: [-500, 300],
    inwardDir: [-0.70, 0.71], // NW into the high cedar ridge
    chamberOffset: 32,
    chamberRadius: 16.0,
    ceilingHeight: 8.6,
    lightColor: 0x8de8a8,
    accentColor: 0xd9f59d,
  },
  {
    id: 'sunken_inkstone_cistern',
    name: 'Sunken Inkstone Cistern',
    theme: 'ink_spring',
    mouth: [-40, 548],
    inwardDir: [-0.34, 0.94], // north into the high peaks
    chamberOffset: 34,
    chamberRadius: 16.5,
    ceilingHeight: 8.8,
    lightColor: 0x6ad4e8,
    accentColor: 0xf4c078,
  },
  {
    id: 'echoing_crystal_vault',
    name: 'Echoing Crystal Vault',
    theme: 'crystal_geode',
    mouth: [500, -36],
    inwardDir: [0.86, 0.25], // east into the quarry cliffs
    chamberOffset: 30,
    chamberRadius: 15.5,
    ceilingHeight: 8.6,
    lightColor: 0x8fb8ff,
    accentColor: 0xc084fc,
  },
];

// The deep floor under the valley. Level 1 is higher, just inside each mouth.
// You walk down to this floor. There is no elevator.
export const WOLFVEIL_DUNGEON_FLOOR_Y = -8;
// exitAlong is the arch you press E at to leave. landAlong is only a fallback;
// each cave stores its own level-one hall on the cave object.
export const WOLFVEIL_CAVE_DROP = Object.freeze({ landAlong: 16, exitAlong: 3.5 });

export const WOLFVEIL_EXPLORABLE_CAVES = Object.freeze(
  RAW_ENTRANCES.map(cave => {
    const [mx, mz] = cave.mouth;
    const len = Math.hypot(cave.inwardDir[0], cave.inwardDir[1]) || 1;
    const dx = cave.inwardDir[0] / len, dz = cave.inwardDir[1] / len;
    const mouthY = wolfveilHeight(mx, mz);
    const chamberOffset = cave.chamberOffset;
    const cx = mx + dx * chamberOffset;
    const cz = mz + dz * chamberOffset;
    const surf = wolfveilHeight(cx, cz);
    const thresholdX = mx - dx * 3.5;
    const thresholdZ = mz - dz * 3.5;
    const thresholdY = wolfveilHeight(thresholdX, thresholdZ);
    // Level 1 sits just under this hillside, not at the bottom of the valley.
    // A short stair at the door covers the few metres. The long way down
    // starts only after the hall and the big room.
    const floorY = Math.min(mouthY - 4, surf - cave.ceilingHeight - 3.2);
    const drop = Math.max(0, thresholdY - floorY);
    const beforeRoom = cave.chamberOffset - cave.chamberRadius - 2.5;
    const levelOneAlong = Math.min(beforeRoom, Math.max(11, drop / 0.55));
    return Object.freeze({
      ...cave,
      dir: Object.freeze([dx, dz]),
      mouthY,
      threshold: Object.freeze([thresholdX, thresholdY, thresholdZ]),
      level: 1,
      levelOneAlong,
      chamber: Object.freeze({
        id: cave.id + '_chamber',
        x: cx,
        y: floorY,
        z: cz,
        radius: cave.chamberRadius,
        ceiling: cave.ceilingHeight,
        theme: cave.theme,
        along: chamberOffset,
      }),
    });
  }),
);

// Basement hub under the valley floor, below the river bed, so every
// cross-map tunnel can pass under the lowland instead of floating in the air.
export const WOLFVEIL_CAVE_HUB = Object.freeze({
  id: 'subterranean_wolf_rotunda',
  name: 'Subterranean Wolf-Spirit Rotunda',
  theme: 'ancient_rotunda',
  x: -6,
  y: WOLFVEIL_DUNGEON_FLOOR_Y,
  z: 24,
  radius: 46,
  ceiling: 7.4,
  lightColor: 0xf5b869,
  accentColor: 0x67e8f9,
});

export const WOLFVEIL_CAVE_CHAMBERS = Object.freeze([
  ...WOLFVEIL_EXPLORABLE_CAVES.map(c => c.chamber),
  WOLFVEIL_CAVE_HUB,
]);

function makePolylineCorridor(id, waypoints, halfWidth = 3.6, ceiling = 5.8, kind = 'tunnel') {
  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const lenXZ = Math.hypot(dx, dz) || 0.001;
    segments.push(Object.freeze({
      ax: a[0], ay: a[1], az: a[2],
      bx: b[0], by: b[1], bz: b[2],
      dx, dy, dz, lenXZ,
      startDist: totalLength,
    }));
    totalLength += lenXZ;
  }
  return Object.freeze({ id, kind, halfWidth, ceiling, waypoints, segments, totalLength });
}

const byId = Object.fromEntries(WOLFVEIL_EXPLORABLE_CAVES.map(c => [c.id, c]));

function bendWaypoints(a, b, bendLateral = 16, midDrop = -1.8) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  const p1 = [
    a.x + dx * 0.33 + nx * bendLateral,
    a.y + (b.y - a.y) * 0.33 + midDrop,
    a.z + dz * 0.33 + nz * bendLateral,
  ];
  const p2 = [
    a.x + dx * 0.67 - nx * bendLateral * 0.65,
    a.y + (b.y - a.y) * 0.67 + midDrop * 0.85,
    a.z + dz * 0.67 - nz * bendLateral * 0.65,
  ];
  // The room's floor exists from its perimeter inward. The old curved
  // connector began descending at the room centre, causing an invisible
  // floor handoff at its doorway (up to metres for the western ring).
  // Hold each connector at its adjoining room's Y until almost the rim;
  // then blend grades over the real, long tunnel instead of inside the room.
  const apron=(room,toward)=>{
    const dx=toward[0]-room.x,dz=toward[2]-room.z;
    const len=Math.hypot(dx,dz)||1;
    const extent=Math.min(Math.max(3,(room.radius||15)-2.0),len*.56);
    return [room.x+dx/len*extent,room.y,room.z+dz/len*extent];
  };
  return [
    [a.x,a.y,a.z],apron(a,p1),p1,p2,apron(b,p2),[b.x,b.y,b.z],
  ];
}

// Entry ramps (a real stair, switchbacked when the mountain is tall)
// plus five tunnels buried under the terrain, plus two side alcoves.
const BURY_DEPTH = 12;
const BURY_SLOPE = 0.72;

function rimPoint(room, tx, tz) {
  const dx = tx - room.x, dz = tz - room.z;
  const len = Math.hypot(dx, dz) || 1;
  const extent = Math.min(Math.max(3, (room.radius || 15) - 2.2), len * 0.45);
  return [room.x + dx / len * extent, room.y, room.z + dz / len * extent];
}

function entryWaypoints(c) {
  const [dx, dz] = c.dir;
  const y = c.chamber.y;
  const land = c.levelOneAlong;
  const steps = 4;
  const pts = [[c.threshold[0], c.threshold[1], c.threshold[2]]];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push([
      c.mouth[0] + dx * land * t,
      c.threshold[1] + (y - c.threshold[1]) * t,
      c.mouth[1] + dz * land * t,
    ]);
  }
  const hall = Math.max(land + 8, (c.chamber.along || 30) - c.chamber.radius - 2);
  pts.push([c.mouth[0] + dx * hall, y, c.mouth[1] + dz * hall]);
  pts.push([c.chamber.x, y, c.chamber.z]);
  return pts;
}

function buryWaypoints(xz, y0, y1) {
  if (Math.abs(y1 - y0) < 0.5) {
    return xz.map(p => [p[0], y0, p[1]]);
  }
  const pts = [[xz[0][0], xz[0][1]]];
  for (let i = 1; i < xz.length; i++) {
    const [ax, az] = pts[pts.length - 1];
    const [bx, bz] = xz[i];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 18));
    for (let k = 1; k <= n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  let total = 0;
  const acc = [0];
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    acc.push(total);
  }
  const y = pts.map((p, i) => {
    const t = total ? acc[i] / total : 0;
    const lerp = y0 + (y1 - y0) * t;
    return Math.min(lerp, wolfveilHeight(p[0], p[1]) - BURY_DEPTH);
  });
  y[0] = y0;
  y[y.length - 1] = y1;
  const limit = (forward) => {
    const order = forward ? y.map((_, i) => i) : y.map((_, i) => i).reverse();
    for (let n = 1; n < order.length; n++) {
      const i = order[n], prev = order[n - 1];
      const d = Math.hypot(pts[i][0] - pts[prev][0], pts[i][1] - pts[prev][1]) || 0.001;
      const lo = y[prev] - BURY_SLOPE * d, hi = y[prev] + BURY_SLOPE * d;
      if (y[i] < lo) y[i] = lo;
      else if (y[i] > hi) y[i] = hi;
    }
  };
  limit(true);
  y[y.length - 1] = y1;
  limit(false);
  y[0] = y0;
  limit(true);
  return pts.map((p, i) => [p[0], y[i], p[1]]);
}

function exitPoint(room, tx, tz) {
  const dx = tx - room.x, dz = tz - room.z;
  const len = Math.hypot(dx, dz) || 1;
  const extent = (room.radius || 15) + 1.6;
  return [room.x + dx / len * extent, room.z + dz / len * extent];
}

function tunnelWaypoints(a, b, lateral) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  const p1 = [a.x + dx * 0.36 + nx * lateral, a.z + dz * 0.36 + nz * lateral];
  const p2 = [a.x + dx * 0.68 - nx * lateral * 0.45, a.z + dz * 0.68 - nz * lateral * 0.45];
  const start = exitPoint(a, p1[0], p1[1]);
  const end = exitPoint(b, p2[0], p2[1]);
  const buried = buryWaypoints([start, p1, p2, end], a.y, b.y);
  return [
    [a.x, a.y, a.z],
    [start[0], a.y, start[1]],
    ...buried.slice(1),
    [b.x, b.y, b.z],
  ];
}

function sideAlcove(anchor, nx, nz, length, id) {
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  const rim = (anchor.radius || 15) + 2;
  const at = (dist) => [anchor.x + nx * dist, anchor.y, anchor.z + nz * dist];
  return makePolylineCorridor(id, [
    at(rim),
    at(rim + length * 0.55),
    at(rim + length),
  ], 4.2, 5.8, 'alcove');
}

export const WOLFVEIL_CAVE_CORRIDORS = Object.freeze([
  ...WOLFVEIL_EXPLORABLE_CAVES.map(c => makePolylineCorridor(
    `entry_${c.id}`,
    entryWaypoints(c),
    3.3,
    6.0,
    'entry',
  )),
  makePolylineCorridor(
    'tunnel_grotto_to_roots',
    tunnelWaypoints(byId.jade_lantern_grotto.chamber, byId.whispering_root_hollow.chamber, -28),
    3.5, 6.0,
  ),
  makePolylineCorridor(
    'tunnel_grotto_to_rotunda',
    tunnelWaypoints(byId.jade_lantern_grotto.chamber, WOLFVEIL_CAVE_HUB, 18),
    3.6, 6.0,
  ),
  makePolylineCorridor(
    'tunnel_roots_to_rotunda',
    tunnelWaypoints(byId.whispering_root_hollow.chamber, WOLFVEIL_CAVE_HUB, -18),
    3.5, 6.0,
  ),
  makePolylineCorridor(
    'tunnel_rotunda_to_cistern',
    tunnelWaypoints(WOLFVEIL_CAVE_HUB, byId.sunken_inkstone_cistern.chamber, 16),
    3.6, 6.0,
  ),
  makePolylineCorridor(
    'tunnel_rotunda_to_crystal',
    tunnelWaypoints(WOLFVEIL_CAVE_HUB, byId.echoing_crystal_vault.chamber, 20),
    3.7, 6.2,
  ),
  // Quiet side rooms off the rotunda. Not part of the travel graph — places
  // to stand, look, and find by walking, not a teleport or a loot button.
  sideAlcove(WOLFVEIL_CAVE_HUB, -1, 0.15, 36, 'alcove_west_quiet_basin'),
  sideAlcove(WOLFVEIL_CAVE_HUB, 0.2, 1, 34, 'alcove_north_offering'),
]);

/**
 * Legacy cave mouth footprint used for decoration/QA ONLY. The overhead
 * terrain must not remove triangles here: one heightfield cannot represent
 * both an intact hillside roof and a separate underground cave floor.
 */
export function isWolfveilCaveMouthCutout(x, z) {
  for (const c of WOLFVEIL_EXPLORABLE_CAVES) {
    const rx = x - c.mouth[0], rz = z - c.mouth[1];
    const along = rx * c.dir[0] + rz * c.dir[1];
    const lateral = Math.abs(-rx * c.dir[1] + rz * c.dir[0]);
    if (along >= -0.8 && along <= 8.8 && lateral <= 3.75) return true;
  }
  return false;
}

/**
 * Evaluates cave containment & smooth floor elevation at Wolfveil-local (x, z).
 * Returns { inside, floorY, ceilingY, clearance } where clearance > 0 means inside.
 */
export function sampleWolfveilCaveSpace(x, z, margin = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null;
  const consider = (clearance, floorY, ceilingY, kind) => {
    if (clearance < 0) return;
    if (!best || clearance > best.clearance) {
      best = { inside: true, clearance, floorY, ceilingY, kind };
    }
  };

  for (const ch of WOLFVEIL_CAVE_CHAMBERS) {
    const d = Math.hypot(x - ch.x, z - ch.z);
    const clear = ch.radius - margin - d;
    if (clear >= 0) {
      // Gentle bowl relief toward chamber rim, flat walkable center
      const rimLift = smooth((d - ch.radius * 0.65) / (ch.radius * 0.35)) * 0.25;
      consider(clear, ch.y + rimLift, ch.y + ch.ceiling, 'chamber');
    }
  }

  for (const cor of WOLFVEIL_CAVE_CORRIDORS) {
    const allowed = cor.halfWidth - margin;
    if (allowed <= 0) continue;
    for (const seg of cor.segments) {
      const len2 = seg.lenXZ * seg.lenXZ;
      const t = clamp(((x - seg.ax) * seg.dx + (z - seg.az) * seg.dz) / len2, 0, 1);
      const px = seg.ax + seg.dx * t;
      const pz = seg.az + seg.dz * t;
      const d = Math.hypot(x - px, z - pz);
      const clear = allowed - d;
      if (clear >= 0) {
        const y = seg.ay + seg.dy * t;
        consider(clear, y, y + cor.ceiling, cor.kind);
      }
    }
  }
  return best;
}

/**
 * Returns authoritative cave floor Y when an actor at local (x, y, z) is
 * actually travelling inside or entering a cave (never hijacks an actor walking
 * 25m overhead across the exterior mountain top).
 */
export function sampleWolfveilPlayerCaveFloorY(localX, currentY, localZ,
    {insideCave=false}={}) {
  const space = sampleWolfveilCaveSpace(localX, localZ, 0.15);
  if (!space || !Number.isFinite(currentY)) return null;
  // Critical waterfall fix: the old ceiling-only test accepted OUTDOOR feet
  // standing above some entrance passages as underground feet, causing an
  // immediate snap from the surface down into the cave. Use the canonical
  // terrain height as a distinct exterior layer, not just a cave ceiling.
  const outsideY=wolfveilHeight(localX,localZ);
  if(!insideCave && Number.isFinite(outsideY) &&
     currentY >= outsideY-0.75)return null;
  if (currentY <= space.ceilingY + 1.8 &&
      currentY >= space.floorY - 6.0) {
    return space.floorY;
  }
  return null;
}

// Closed 2.5D surface + E-interaction at the existing modeled cave arch.
// The existing subterranean rooms and connected corridors stay on their
// original coordinates; entry/exit never needs a missing terrain polygon.
export function planWolfveilCaveInteraction(localPosition,{insideCave=false,radius=7.0}={}) {
  if(!localPosition||![localPosition.x,localPosition.y,localPosition.z,radius]
    .every(Number.isFinite)||radius<=0)return null;
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    const [mx,mz]=cave.mouth,[dx,dz]=cave.dir;
    // Entry lands safely past the rock arch, while the return interaction
    // is INSIDE that same arch. A player walks back toward daylight and uses
    // E there instead of finding a teleport button 13 metres inside a room.
    const insideX = mx + dx * cave.levelOneAlong;
    const insideZ = mz + dz * cave.levelOneAlong;
    const exitX = mx + dx * WOLFVEIL_CAVE_DROP.exitAlong;
    const exitZ = mz + dz * WOLFVEIL_CAVE_DROP.exitAlong;
    if(insideCave){
      if(Math.hypot(localPosition.x-exitX,localPosition.z-exitZ)>radius)
        continue;
      return {
        action:'exit',caveId:cave.id,name:cave.name,
        x:cave.threshold[0],y:cave.threshold[1]+0.12,z:cave.threshold[2],
      };
    }
    // Some entrances are embedded in steep waterfall rock. The player may
    // press E beside the actual stone mouth rather than standing behind it
    // at the exact exterior threshold: accept either grounded approach.
    const nearThreshold=Math.hypot(localPosition.x-cave.threshold[0],
      localPosition.z-cave.threshold[2])<=radius;
    const nearMouth=Math.hypot(localPosition.x-mx,localPosition.z-mz)
      <=Math.min(radius,5.25);
    if(!nearThreshold&&!nearMouth)continue;
    const validHeight=(nearThreshold &&
      Math.abs(localPosition.y-cave.threshold[1])<=3.5)
      ||(nearMouth&&Math.abs(localPosition.y-cave.mouthY)<=3.5);
    if(!validHeight)continue;
    const space=sampleWolfveilCaveSpace(insideX,insideZ,0.75);
    if(!space)continue;
    return {
      action:'enter',caveId:cave.id,name:cave.name,
      x:insideX,y:space.floorY+0.1,z:insideZ,
    };
  }
  return null;
}

/**
 * Keeps an underground explorer inside the chambers and tunnels.
 * The hillside in front of a mouth is not a tunnel. Leaving is E at the
 * inner arch, not a walk out through the mountain.
 */
function isInFrontOfCaveMouth(x, z) {
  for (const cave of WOLFVEIL_EXPLORABLE_CAVES) {
    const rx = x - cave.mouth[0], rz = z - cave.mouth[1];
    const along = rx * cave.dir[0] + rz * cave.dir[1];
    const lateral = Math.abs(-rx * cave.dir[1] + rz * cave.dir[0]);
    if (along < 0.45 && along > -14 && lateral <= 4.8) return true;
  }
  return false;
}
export function resolveWolfveilCaveWallCollision(localPos, prevLocalPos, radius = 0.62) {
  if (!localPos || !prevLocalPos) return false;
  if(!sampleWolfveilCaveSpace(prevLocalPos.x,prevLocalPos.z,radius))return false;
  if(isInFrontOfCaveMouth(prevLocalPos.x, prevLocalPos.z))return false;
  const indoors = (x, z) => sampleWolfveilCaveSpace(x, z, radius)
    && !isInFrontOfCaveMouth(x, z);
  if (indoors(localPos.x, localPos.z)) return false;

  // Try axis slide before full revert so curved tunnel walls feel buttery smooth
  const slideX = indoors(localPos.x, prevLocalPos.z);
  if (slideX) {
    localPos.z = prevLocalPos.z;
    return true;
  }
  const slideZ = indoors(prevLocalPos.x, localPos.z);
  if (slideZ) {
    localPos.x = prevLocalPos.x;
    return true;
  }
  localPos.x = prevLocalPos.x;
  localPos.z = prevLocalPos.z;
  return true;
}

/**
 * Explorable underground travel graph, derived from the same corridor nodes
 * used to build REAL tunnel floor meshes. No fake map-only teleport links.
 * Each of four caves is connected to the Wolf-Spirit Rotunda by tunnel routes.
 */
export function buildWolfveilCaveTravelGraph() {
  const nodes=[
    ...WOLFVEIL_EXPLORABLE_CAVES.map(c=>({
      id:c.chamber.id,name:c.name,x:c.chamber.x,y:c.chamber.y,z:c.chamber.z,
      caveId:c.id,kind:'cave',
    })),
    {id:WOLFVEIL_CAVE_HUB.id,name:WOLFVEIL_CAVE_HUB.name,
      x:WOLFVEIL_CAVE_HUB.x,y:WOLFVEIL_CAVE_HUB.y,
      z:WOLFVEIL_CAVE_HUB.z,kind:'hub'},
  ];
  const nearest=(x,z)=>nodes.reduce((best,n)=>{
    const d=Math.hypot(x-n.x,z-n.z);
    return !best||d<best.distance?{id:n.id,distance:d}:best;
  },null);
  const edges=[];
  for(const corridor of WOLFVEIL_CAVE_CORRIDORS) {
    if(corridor.kind!=='tunnel')continue;
    const a=corridor.waypoints[0],b=corridor.waypoints.at(-1);
    const from=nearest(a[0],a[2]),to=nearest(b[0],b[2]);
    if(!from||!to||from.distance>1||to.distance>1||from.id===to.id)continue;
    edges.push({id:corridor.id,from:from.id,to:to.id,
      length:corridor.totalLength});
  }
  return {nodes,edges,hubId:WOLFVEIL_CAVE_HUB.id};
}
