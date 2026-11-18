// Physical space of an authored mission level. Walking collision is the same BSPCollision the imported Raven arena
// uses (floor triangles + wall segments), so characters move exactly as they do in the duel. On top of it:
// sliding doors, ceilings, trigger zones and box ray tests for line of sight, blaster bolts and the camera.
// Pure maths (no WebGL) so the unit tests can load a level headless.
import { BSPCollision } from '../rbsp.js';

const DOOR_SPEED = 1.15;   // fraction of the door height per second
const DOOR_PASS = 0.82;    // a door this far up no longer blocks people
export const BRIDGE_WARN = 0.6;  // s an energy bridge flickers after its console is used, before it drops
export const BRIDGE_DOWN = 10;   // s it stays off before it reforms

export class LevelSpace {
  constructor(level) {
    this.level = level;
    this.collision = new BSPCollision({ tris: level.tris, spawns: [] });
    this.solids = level.solids;      // visible boxes: block rays (sight, bolts, camera)
    this.pillarCylinders = level.pillarCylinders || [];
    this.clips = level.clips;        // invisible play-area clip: blocks walking only
    this.interiors = level.interiors;
    this.zones = new Map(level.zones.map(z => [z.id, z]));
    this.doors = new Map(level.doors.map(d => [d.id, { ...d, want: !!d.open, lift: d.open ? 1 : 0 }]));
    this.interactables = new Map(level.interactables.map(i => [i.id, i]));
    // energy bridges: 'on' -> (console) 'warn' (still carries you) -> 'off' (nothing under you) -> 'on' again
    this.bridges = new Map((level.bridges || []).map(b => [b.id, { ...b, state: 'on', t: 0 }]));
    this.onBridge = null; // (bridge) => void, called on every state change
    // 4 m buckets of solid / clip boxes for fast point tests (navigation asks a lot of them)
    this.cell = 4; this.grid = new Map();
    for (const s of [...this.solids, ...this.clips]) for (let i = Math.floor(s.min[0] / 4); i <= Math.floor(s.max[0] / 4); i++) for (let j = Math.floor(s.min[2] / 4); j <= Math.floor(s.max[2] / 4); j++) { const k = i + ',' + j; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(s); }
  }
  // ---------- doors
  setDoor(id, open) { const d = this.doors.get(id); if (!d) throw new Error('unknown door ' + id); d.want = !!open; }
  snapDoor(id, open) { const d = this.doors.get(id); d.want = !!open; d.lift = open ? 1 : 0; }
  doorOpen(id) { const d = this.doors.get(id); return !!d && d.lift >= DOOR_PASS; }
  doorBox(d) { const h = d.max[1] - d.min[1], dy = d.lift * h * 0.96; return { min: [d.min[0], d.min[1] + dy, d.min[2]], max: [d.max[0], d.max[1] + dy, d.max[2]] }; }
  // ---------- energy bridges
  dropBridge(id) { const b = this.bridges.get(id); if (!b || b.state !== 'on') return false; b.state = 'warn'; b.t = BRIDGE_WARN; this.onBridge?.(b); return true; }
  bridgeOpen(id) { const b = this.bridges.get(id); return !!b && b.state === 'on'; } // safe to walk onto (navigation)
  bridgeAt(p) { for (const b of this.bridges.values()) if (p[0] >= b.x0 && p[0] <= b.x1 && p[2] >= b.z0 && p[2] <= b.z1) return b; return null; }
  update(dt) {
    let moved = false;
    for (const b of this.bridges.values()) { if (b.state === 'on') continue; b.t -= dt; if (b.t > 0) continue; if (b.state === 'warn') { b.state = 'off'; b.t = BRIDGE_DOWN; } else { b.state = 'on'; b.t = 0; } this.onBridge?.(b); }
    for (const d of this.doors.values()) { const t = d.want ? 1 : 0; if (d.lift !== t) { const s = DOOR_SPEED * dt; d.lift = Math.abs(t - d.lift) <= s ? t : d.lift + Math.sign(t - d.lift) * s; moved = true; } }
    return moved;
  }
  // ---------- walking
  // the highest floor at or below top; a bridge that is on (or still flickering) is a floor too (bridges = false: without them)
  floorAt(x, z, top = Infinity, bridges = true) {
    let y = this.collision.floorAt(x, z, top);
    if (bridges) for (const b of this.bridges.values()) if (b.state !== 'off' && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y <= top + 0.005 && (y === null || b.y > y)) y = b.y;
    return y;
  }
  collide(pos, r) {
    this.collision.collide(pos, r);
    for (const d of this.doors.values()) {
      if (d.lift >= DOOR_PASS) continue;
      const b = this.doorBox(d); if (pos[1] + 1.6 < b.min[1] || pos[1] > b.max[1]) continue;
      pushOutOfRect(pos, r, b.min[0], b.min[2], b.max[0], b.max[2]);
    }
    for (const it of this.interiors) { // no jumping through ceilings
      if (pos[0] < it.x0 || pos[0] > it.x1 || pos[2] < it.z0 || pos[2] > it.z1) continue;
      const lim = it.ceil - 1.85; if (pos[1] > lim && pos[1] < it.ceil) pos[1] = lim;
    }
  }
  // ---------- rays: returns the hit fraction along a->b, or null when the segment is clear
  raycast(a, b, o = {}) {
    let best = null; const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const test = (mn, mx) => { const t = rayBox(a[0], a[1], a[2], dx, dy, dz, mn, mx); if (t !== null && (best === null || t < best)) best = t; };
    for (const s of this.solids) test(s.min, s.max);
    for (const c of this.pillarCylinders) {
      const t = rayCylinder(a,b,c);
      if (t !== null && (best === null || t < best)) best = t;
    }
    if (!o.ignoreDoors) for (const d of this.doors.values()) { if (d.lift >= 0.98) continue; const bx = this.doorBox(d); test(bx.min, bx.max); }
    return best;
  }
  lineOfSight(a, b) { return this.raycast(a, b) === null; }
  // Wall traversal needs the physical face normal, not the probe direction.
  // Preserve raycast's fractional API for camera and AI callers.
  raycastContact(a, b, o = {}) {
    let best = null;
    const test = (min, max) => {
      const fraction = rayBox(a[0], a[1], a[2], b[0]-a[0], b[1]-a[1], b[2]-a[2], min, max);
      if (fraction === null || (best && fraction >= best.fraction)) return;
      const point = a.map((v, i) => v + (b[i]-v)*fraction);
      let axis = 0, sign = 0, distance = Infinity;
      for (let i = 0; i < 3; i++) for (const [face, direction] of [[min[i], -1], [max[i], 1]]) {
        const d = Math.abs(point[i]-face);
        if (d < distance) { axis = i; sign = direction; distance = d; }
      }
      const normal = [0, 0, 0]; normal[axis] = sign;
      best = { fraction, normal, point };
    };
    for (const s of this.solids) test(s.min, s.max);
    for (const c of this.pillarCylinders) {
      const fraction = rayCylinder(a, b, c);
      if (fraction === null || (best && fraction >= best.fraction)) continue;
      const point = a.map((v, i) => v + (b[i]-v)*fraction);
      let normal;
      if (Math.abs(point[1]-c.y0) < 1e-7) normal = [0,-1,0];
      else if (Math.abs(point[1]-c.y1) < 1e-7) normal = [0,1,0];
      else { const x = point[0]-c.cx, z = point[2]-c.cz, len = Math.hypot(x,z); normal = [x/len,0,z/len]; }
      best = { fraction, normal, point };
    }
    if (!o.ignoreDoors) for (const d of this.doors.values()) {
      if (d.lift >= 0.98) continue;
      const box = this.doorBox(d); test(box.min, box.max);
    }
    return best;
  }
  cameraClip(target, eye) {
    const t = this.raycast(target, eye); if (t === null) return eye;
    const len = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]) || 1, k = Math.max(0, t * len - 0.3) / len;
    return [target[0] + (eye[0] - target[0]) * k, target[1] + (eye[1] - target[1]) * k, target[2] + (eye[2] - target[2]) * k];
  }
  insideSolid(x, y, z, pad = 0) {
    for (const p of this.pillarCylinders) if (y >= p.y0 && y < p.y1 &&
      Math.hypot(x-p.cx,z-p.cz) < p.radius+pad) return true;
    const c = this.cell;
    for (let i = Math.floor((x - pad) / c); i <= Math.floor((x + pad) / c); i++) for (let j = Math.floor((z - pad) / c); j <= Math.floor((z + pad) / c); j++) {
      for (const s of this.grid.get(i + ',' + j) || []) if (x > s.min[0] - pad && x < s.max[0] + pad && z > s.min[2] - pad && z < s.max[2] + pad && y > s.min[1] && y < s.max[1]) return true;
    }
    return false;
  }
  // ---------- zones / interactables
  inZone(id, p) { const z = this.zones.get(id); if (!z) throw new Error('unknown zone ' + id); return p[0] >= z.x0 && p[0] <= z.x1 && p[2] >= z.z0 && p[2] <= z.z1; }
  interiorAt(p) { for (const it of this.interiors) if (p[0] >= it.x0 && p[0] <= it.x1 && p[2] >= it.z0 && p[2] <= it.z1 && p[1] < it.ceil) return it; return null; }
}

// Segment intersection with upright circular pillars. This matches their
// authored collision facets and prevents AI vision or blaster rays cutting
// straight through a tower's central stone core.
export function rayCylinder(a,b,{cx,cz,radius,y0,y1}) {
  const ox=a[0]-cx,oz=a[2]-cz,dx=b[0]-a[0],dz=b[2]-a[2],dy=b[1]-a[1];
  let lo=0,hi=1;
  const A=dx*dx+dz*dz,B=2*(ox*dx+oz*dz),C=ox*ox+oz*oz-radius*radius;
  if(A<1e-10){if(C>0)return null;}
  else{
    const D=B*B-4*A*C;
    if(D<0)return null;
    const t0=(-B-Math.sqrt(D))/(2*A),t1=(-B+Math.sqrt(D))/(2*A);
    lo=Math.max(lo,t0);hi=Math.min(hi,t1);
  }
  if(Math.abs(dy)<1e-10){if(a[1]<y0||a[1]>y1)return null;}
  else{
    const t0=(y0-a[1])/dy,t1=(y1-a[1])/dy;
    lo=Math.max(lo,Math.min(t0,t1));
    hi=Math.min(hi,Math.max(t0,t1));
  }
  return lo<=hi ? lo : null;
}

function pushOutOfRect(pos, r, x0, z0, x1, z1) {
  const cx = Math.max(x0, Math.min(pos[0], x1)), cz = Math.max(z0, Math.min(pos[2], z1));
  const dx = pos[0] - cx, dz = pos[2] - cz, d = Math.hypot(dx, dz);
  if (d > 1e-5) { if (d < r) { pos[0] = cx + dx / d * r; pos[2] = cz + dz / d * r; } return; }
  // centre inside the rectangle: leave through the nearest side
  const l = pos[0] - x0, rr = x1 - pos[0], b = pos[2] - z0, t = z1 - pos[2], m = Math.min(l, rr, b, t);
  if (m === l) pos[0] = x0 - r; else if (m === rr) pos[0] = x1 + r; else if (m === b) pos[2] = z0 - r; else pos[2] = z1 + r;
}

// slab test; t in [0, 1] along the segment, null when missed (a start point inside the box counts as t = 0)
export function rayBox(ox, oy, oz, dx, dy, dz, mn, mx) {
  let t0 = 0, t1 = 1;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) return null; continue; }
    let a = (mn[k] - o[k]) / d[k], b = (mx[k] - o[k]) / d[k]; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return null;
  }
  return t0;
}
