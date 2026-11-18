// AAA-inspired *render-only* finish for Game 2's existing 28 x 28 m training hall.
// Uses the shipped stone material and the existing custom WebGL2 renderer.
// No new collision, network data, combat logic, or third-party art assets.
import { meshBuilder } from '../level/builder.js';

export const HALL_FINISH_BOUNDS = Object.freeze({ x: [-14, 14], z: [-16, 12], y: [0, 10] });
const PALETTE = Object.freeze({
  limestone: [0.53, 0.49, 0.42],
  recessed: [0.28, 0.265, 0.25],
  gold: [0.76, 0.56, 0.28],
  gilded: [0.91, 0.74, 0.41],
  bronze: [0.41, 0.30, 0.20],
  navy: [0.075, 0.115, 0.22],
});

export function buildTrainingHallFinish() {
  const floor = meshBuilder(), stone = meshBuilder(), metal = meshBuilder();
  const emblem = meshBuilder(), banners = meshBuilder(), fire = meshBuilder();
  const box = (mesh, lo, hi, tint) => mesh.box(lo, hi, tint);
  const top = (x, z, size = 1.35) => {
    // A separate micro-elevated surface gives the existing bevelled paving a
    // lacquered/wet sheen without replacing any of its physical floor data.
    const j = Math.sin(x * 3.71 + z * 5.19) * Math.cos(z * 2.17 - x * 1.49);
    const k = 0.84 + 0.10 * j;
    box(floor, [x + 0.016, 0.048, z + 0.016],
      [x + size - 0.016, 0.057, z + size - 0.016],
      [k * 0.56, k * 0.52, k * 0.45]);
  };
  for (let x = -13.8; x < 14; x += 1.4)
    for (let z = -15.8; z < 12; z += 1.4) top(x, z);
  // Independent, physically projecting wall trims. The brick relief underneath
  // remains exposed. These are not shader-only painted stripes.
  for (const side of [-1, 1]) {
    const face = side * 13.69;
    const inner = side * 13.40;
    const extents = [Math.min(face, inner), Math.max(face, inner)];
    for (const [y, h, depth, col] of [
      [0.22, 0.22, 0.30, PALETTE.recessed],
      [0.50, 0.10, 0.34, PALETTE.gold],
      [5.65, 0.16, 0.19, PALETTE.limestone],
      [8.28, 0.23, 0.33, PALETTE.limestone],
      [8.55, 0.085, 0.39, PALETTE.gold],
      [9.24, 0.31, 0.30, PALETTE.limestone],
    ]) {
      const a = side * (13.69 - depth), b = side * 13.88;
      box(col === PALETTE.gold ? metal : stone,
        [Math.min(a, b), y, -15.78], [Math.max(a, b), y + h, 11.74], col);
    }
    // Pilasters with multiple projecting bases/capitals; not blank cuboids.
    for (const z of [-12.0, -3.8, 4.2, 9.7]) {
      box(stone, [extents[0], 0.50, z - 0.43],
        [extents[1], 8.45, z + 0.43], PALETTE.limestone);
      for (const [y, h, reach, w, mesh, col] of [
        [0.38, 0.26, 0.35, 0.66, stone, PALETTE.recessed],
        [7.99, 0.24, 0.47, 0.65, stone, PALETTE.limestone],
        [8.25, 0.17, 0.50, 0.75, metal, PALETTE.gold],
      ]) {
        const d = side * (13.65 - reach);
        box(mesh, [Math.min(d, face), y, z - w],
          [Math.max(d, face), y + h, z + w], col);
      }
      // Inset shafts give the pilasters visible vertical profiles.
      const x = side * 13.37;
      for (const dz of [-0.25, 0.25])
        box(stone, [x - 0.045, 1.04, z + dz - 0.045],
          [x + 0.045, 7.95, z + dz + 0.045], PALETTE.recessed);
    }
  }
  // Framed back wall and gate-side return; leave the 6 m opening completely clear.
  for (const y of [0.36, 5.65, 8.44, 9.28]) {
    const h = y > 9 ? 0.30 : 0.17;
    box(stone, [-13.69, y, -15.79], [13.69, y + h, -15.41], PALETTE.limestone);
  }
  for (const x of [-12, -9.8, 9.8, 12]) {
    box(stone, [x - 0.36, 0.5, -15.69], [x + 0.36, 8.45, -15.28], PALETTE.limestone);
    box(metal, [x - 0.49, 8.34, -15.75], [x + 0.49, 8.46, -15.18], PALETTE.gold);
  }
  for (const [lo, hi] of [[-13.75, -3.18], [3.18, 13.75]]) {
    for (const y of [0.52, 8.40, 9.24])
      box(stone, [lo, y, 11.60], [hi, y + 0.20, 11.90], PALETTE.limestone);
  }
  for (const x of [-3.25, 3.25]) {
    box(stone, [x - 0.23, 0.1, 11.48], [x + 0.23, 8.56, 11.87], PALETTE.limestone);
    box(metal, [x - 0.39, 8.60, 11.42], [x + 0.39, 8.77, 11.92], PALETTE.gold);
  }
  // Decorative radial courses and a recessed circular Republic-style phoenix
  // sigil, centered on the floor. These lie just above the stone tops.
  const cx = 0, cz = -2.1, Y = 0.073;
  const ring = (mesh, inner, outer, color, start = 0, end = Math.PI * 2) => {
    const n = 96;
    for (let i = 0; i < n; i++) {
      const a = start + (end - start) * i / n;
      const b = start + (end - start) * (i + 1) / n;
      const p = (r, t) => [cx + Math.cos(t) * r, Y, cz + Math.sin(t) * r];
      mesh.quad(p(inner, a), p(outer, a), p(outer, b), p(inner, b), [0, 1, 0], color);
    }
  };
  ring(emblem, 2.85, 2.94, PALETTE.gold);
  ring(emblem, 2.63, 2.68, PALETTE.bronze);
  ring(emblem, 0.36, 0.44, PALETTE.gilded);
  // Each feather is a separate polygon with meaningful silhouette, not a decal.
  const blade = (a, b, c, color) => emblem.triangle(
    [cx + a[0], Y + 0.003, cz + a[1]],
    [cx + b[0], Y + 0.003, cz + b[1]],
    [cx + c[0], Y + 0.003, cz + c[1]], [0, 1, 0], color);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const s = 0.5 + i * 0.39, t = 0.46 + i * 0.31;
      blade([side * 0.25, -0.28], [side * s, -t],
        [side * (s + 0.21), -t + 0.41], PALETTE.gilded);
      blade([side * 0.22, 0.02], [side * s, t],
        [side * (s + 0.16), t - 0.32], PALETTE.gold);
    }
  }
  blade([0, -1.78], [-0.22, -0.15], [0.22, -0.15], PALETTE.gilded);
  blade([0, 1.85], [-0.20, 0.15], [0.20, 0.15], PALETTE.gilded);
  // Indigo embroidered banners on the two long walls. Folded vertical strips
  // and projecting hems yield actual silhouettes and cloth highlights.
  for (const side of [-1, 1]) {
    for (const z of [-7.6, 4.3]) {
      const wallX = side * 13.69, towardCenter = -side;
      const normal = [towardCenter, 0, 0];
      const p = (zz, yy, flutter = 0) => [
        wallX + towardCenter * (0.08 + flutter), yy, zz,
      ];
      const width = 2.9, z0 = z - width / 2;
      for (let i = 0; i < 8; i++) {
        const a = z0 + width * i / 8;
        const b = z0 + width * (i + 1) / 8;
        const foldA = 0.09 * Math.cos(i * Math.PI / 2);
        const foldB = 0.09 * Math.cos((i + 1) * Math.PI / 2);
        const k = i % 2 ? 0.86 : 1;
        const color = PALETTE.navy.map(n => n * k);
        banners.quad(p(a, 8.60, foldA), p(b, 8.60, foldB),
          p(b, 3.18 + 0.15 * (i % 2), foldB + 0.05),
          p(a, 3.18 + 0.15 * ((i + 1) % 2), foldA + 0.05), normal, color);
      }
      box(metal, [wallX - 0.14, 8.59, z0 - 0.29],
        [wallX + 0.14, 8.75, z0 + width + 0.29], PALETTE.bronze);
      box(metal, [wallX - 0.10, 3.14, z0],
        [wallX + 0.10, 3.22, z0 + width], PALETTE.gold);
      // A relief crest stitched to the banner's visible front.
      const f = wallX + towardCenter * 0.30;
      for (const dir of [-1, 1]) {
        const p3 = (dy, dz) => [f, 5.99 + dy, z + dir * dz];
        banners.triangle(p3(0.34, 0.08), p3(-0.12, 1.02),
          p3(-0.08, 0.30), normal, PALETTE.gilded);
        banners.triangle(p3(0.14, 0.06), p3(-0.32, 0.70),
          p3(-0.20, 0.12), normal, PALETTE.gold);
      }
      banners.triangle([f, 6.64, z], [f, 5.55, z - 0.18],
        [f, 5.55, z + 0.18], normal, PALETTE.gilded);
    }
  }
  // Wall-mounted torch brackets, sconces, bowls, and layered flame planes.
  // The actual warm point lights are part of the authored level, not here.
  for (const side of [-1, 1]) {
    const x = side * 12.88;
    for (const z of [-11.1, 8.2]) {
      box(metal, [x - 0.25, 3.89, z - 0.34],
        [x + 0.25, 4.30, z + 0.34], PALETTE.bronze);
      box(metal, [Math.min(x, side * 13.54), 4.14, z - 0.11],
        [Math.max(x, side * 13.54), 4.28, z + 0.11], PALETTE.gold);
      box(metal, [x - 0.39, 4.28, z - 0.38],
        [x + 0.39, 4.43, z + 0.38], PALETTE.bronze);
      box(metal, [x - 0.25, 4.43, z - 0.27],
        [x + 0.25, 4.50, z + 0.27], PALETTE.gilded);
      const flameColors = [
        [1, 0.75, 0.24], [1, 0.40, 0.065], [0.86, 0.17, 0.018],
      ];
      for (let layer = 0; layer < 3; layer++) {
        const c = flameColors[layer], w = 0.21 - layer * 0.052;
        const h = 0.95 - layer * 0.10;
        const n = [0, 0, 1];
        fire.quad([x - w, 4.46, z], [x + w, 4.46, z],
          [x + w * 0.21, 4.46 + h, z], [x - w * 0.21, 4.46 + h, z], n, c);
        fire.quad([x, 4.46, z - w], [x, 4.46, z + w],
          [x, 4.46 + h, z + w * 0.21], [x, 4.46 + h, z - w * 0.21],
          [1, 0, 0], c);
      }
    }
  }
  return {
    floor: floor.build(), stone: stone.build(), metal: metal.build(),
    emblem: emblem.build(), banners: banners.build(), flames: fire.build(),
  };
}
