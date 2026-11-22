// Painted ground: flat shapes (a threshing circle, field strips, a yard,
// graveyard plots) draped on the terrain a few centimetres up, the way the
// paved roads are (wolfveil/WolfveilPavedRoads.js): clipped to the SAME
// terrain triangles the ground mesh is built from, so they follow it exactly.
// Decorative only: nothing here raycasts or collides, and no height changes.
// Pure: returns arrays; the subsystem turns them into one mesh per area.
import { createWolfveilPathSurface } from '../../wolfveil/WolfveilPathSurface.mjs';

export const PAINTED_GROUND_LIFT = 0.06;

// Colours of the kinds of painted ground (linear-ish sRGB hex).
export const PAINTED_SURFACES = Object.freeze({
  packed_earth: 0x7a6449,
  threshing: 0x86755a,
  yard: 0x84704f,
  field_ploughed: 0x5b4733,
  field_stubble: 0x8e8354,
  field_green: 0x5a7440,
  field_flax: 0x7d8a52,
  grave_soil: 0x4c3f31,
  ash: 0x4a4744,
});

// One shape as a list of 3- or 4-corner polygons in LOCAL metres.
//   { circle: [x, z, r] }            a disc, as a fan of thin triangles
//   { quad: [[x, z] x 4] }           any convex four-corner patch
//   { strip: [x0, z0, x1, z1, w] }   a straight strip `w` wide
export function groundShapePolygons(shape, cx = 0, cz = 0) {
  if (shape.circle) {
    const [x, z, r] = shape.circle;
    const n = Math.max(12, Math.min(48, Math.round(r * 2)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      out.push([[cx + x, cz + z],
        [cx + x + Math.cos(a1) * r, cz + z + Math.sin(a1) * r],
        [cx + x + Math.cos(a0) * r, cz + z + Math.sin(a0) * r]]);
    }
    return out;
  }
  if (shape.quad) return [shape.quad.map(([x, z]) => [cx + x, cz + z])];
  if (shape.strip) {
    const [x0, z0, x1, z1, w] = shape.strip;
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = -(z1 - z0) / len * w / 2, nz = (x1 - x0) / len * w / 2;
    return [[[cx + x0 + nx, cz + z0 + nz], [cx + x1 + nx, cz + z1 + nz],
      [cx + x1 - nx, cz + z1 - nz], [cx + x0 - nx, cz + z0 - nz]]];
  }
  return [];
}

const srgbToLinear = byte => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

// Every painted shape of `places`, draped with `heightAt` (local x, z -> y).
// Returns { positions: Float32Array, colors: Float32Array, triangles }.
// Positions are LOCAL; later shapes in a list draw 1 cm above earlier ones so
// a yard painted over a field does not flicker against it.
export function drapePaintedGround(places, heightAt, { lift = PAINTED_GROUND_LIFT } = {}) {
  const triangles = [];
  for (const place of places) {
    const shapes = place.ground || [];
    shapes.forEach((shape, order) => {
      const project = createWolfveilPathSurface({ heightAt, lift: lift + order * 0.01 });
      const colour = PAINTED_SURFACES[shape.surface] ?? PAINTED_SURFACES.packed_earth;
      for (const polygon of groundShapePolygons(shape, place.x, place.z)) {
        const draped = project(polygon);
        if (!draped) continue;
        for (const tri of draped) triangles.push([tri, colour]);
      }
    });
  }
  const positions = new Float32Array(triangles.length * 9);
  const colors = new Float32Array(triangles.length * 9);
  triangles.forEach(([tri, colour], t) => {
    // Vertex colours are read as linear light: convert from sRGB.
    const r = srgbToLinear((colour >> 16) & 255), g = srgbToLinear((colour >> 8) & 255), b = srgbToLinear(colour & 255);
    for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3;
      positions[o] = tri[v][0]; positions[o + 1] = tri[v][1]; positions[o + 2] = tri[v][2];
      colors[o] = r; colors[o + 1] = g; colors[o + 2] = b;
    }
  });
  return { positions, colors, triangles: triangles.length };
}
