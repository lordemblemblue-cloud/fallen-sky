// Small vector / quaternion helpers for Fleet Assault. Arrays, not classes, so states serialise as plain JSON and the
// same code runs on Railway and in the browser. Quaternions are [x, y, z, w]; ships look down their local -Z axis
// (the WebGL convention engine/gl.js uses), +Y is up and +X is right.

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function norm(a) {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const finite = n => typeof n === 'number' && Number.isFinite(n);
export const finite3 = a => Array.isArray(a) && a.length === 3 && a.every(finite);

export const QUAT_ID = Object.freeze([0, 0, 0, 1]);
export function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return l > 1e-9 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : [0, 0, 0, 1];
}
export function qaxis(axis, angle) {
  const h = angle / 2, s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}
// rotate vector v by unit quaternion q
export function qrot(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export const qconj = q => [-q[0], -q[1], -q[2], q[3]];
export const forwardOf = q => qrot(q, [0, 0, -1]);
export const upOf = q => qrot(q, [0, 1, 0]);
export const rightOf = q => qrot(q, [1, 0, 0]);
// the rotation that turns -Z to look along dir with +Y as near the given up as possible
export function qlook(dir, up = [0, 1, 0]) {
  const f = norm(dir);
  let r = cross(f, up);
  if (len(r) < 1e-6) r = cross(f, [1, 0, 0]);
  r = norm(r);
  const u = cross(r, f);
  // rotation matrix columns: right = r, up = u, back = -f
  const m00 = r[0], m01 = u[0], m02 = -f[0];
  const m10 = r[1], m11 = u[1], m12 = -f[1];
  const m20 = r[2], m21 = u[2], m22 = -f[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return qnorm(q);
}
export function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) return qnorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}

// Closest approach of a moving point (segment p0 → p1) to a sphere: true when the segment passes within r of c.
export function segmentHitsSphere(p0, p1, c, r) {
  const d = sub(p1, p0), m = sub(p0, c);
  const dd = dot(d, d);
  const t = dd > 1e-12 ? clamp(-dot(m, d) / dd, 0, 1) : 0;
  const q = addScaled(m, d, t);
  return dot(q, q) <= r * r ? t : -1;
}

// A point in a yaw-only oriented box (cruisers): centre c, yaw (radians about +Y), half extents h = [hx, hy, hz].
export function toBoxLocal(p, c, yaw) {
  const dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2];
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  return [cs * dx - sn * dz, dy, sn * dx + cs * dz];
}
export function fromBoxLocal(l, c, yaw) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  return [c[0] + cs * l[0] + sn * l[2], c[1] + l[1], c[2] - sn * l[0] + cs * l[2]];
}
export function insideBox(p, c, yaw, h, pad = 0) {
  const l = toBoxLocal(p, c, yaw);
  return Math.abs(l[0]) <= h[0] + pad && Math.abs(l[1]) <= h[1] + pad && Math.abs(l[2]) <= h[2] + pad;
}
// Segment against a yaw-oriented box (slab test in box space). Returns the entry fraction or -1.
export function segmentHitsBox(p0, p1, c, yaw, h) {
  const a = toBoxLocal(p0, c, yaw), b = toBoxLocal(p1, c, yaw);
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-12) {
      if (a[i] < -h[i] || a[i] > h[i]) return -1;
      continue;
    }
    let ta = (-h[i] - a[i]) / d, tb = (h[i] - a[i]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  return t0;
}
