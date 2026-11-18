// Tileable water-detail material for Game 2's Training Grounds abyss pond.
// RG: tangent-space ripple direction encoded 0..255 (neutral=127/128)
// B: patchy microfoam / sparkle mask; A: small-scale roughness variation.
// This texture is deliberately NOT an 8K GPU allocation: repeated world-space
// sampling and mipmaps provide dense detail without an enormous memory cost.
// No external assets, runtime randomness, collisions or gameplay state.
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = t => t * t * (3 - 2 * t);
const wrap = (n, period) => ((n % period) + period) % period;

function hash(ix, iz, period, salt) {
  const x = wrap(ix, period), z = wrap(iz, period);
  let h = Math.imul(x + salt * 17, 0x45d9f3b) ^
    Math.imul(z + salt * 71, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

function periodicNoise(u, v, period, salt) {
  const x = u * period, z = v * period, ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz, period, salt), b = hash(ix + 1, iz, period, salt);
  const c = hash(ix, iz + 1, period, salt), d = hash(ix + 1, iz + 1, period, salt);
  return ((a * (1 - fx) + b * fx) * (1 - fz) +
    (c * (1 - fx) + d * fx) * fz) * 2 - 1;
}

function height(u, v) {
  // Integer frequencies ensure continuous repeat across BOTH texture edges.
  const major = periodicNoise(u, v, 8, 5) * 0.43 +
    periodicNoise(u, v, 19, 13) * 0.27;
  const minor = periodicNoise(u, v, 41, 31) * 0.17 +
    periodicNoise(u, v, 79, 47) * 0.08;
  const directional = Math.sin(2 * Math.PI * (13 * u + 7 * v)) *
    Math.sin(2 * Math.PI * (-9 * u + 17 * v)) * 0.05;
  return major + minor + directional;
}

export function makeTrainingWaterMaterialPixels(size = 256) {
  if (!Number.isInteger(size) || size < 64 || size > 1024 ||
    (size & (size - 1)) !== 0) {
    throw new RangeError('Training water texture size must be power-of-two, 64..1024');
  }
  const pixels = new Uint8ClampedArray(size * size * 4);
  const delta = 1 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const gx = height(u + delta, v) - height(u - delta, v);
    const gz = height(u, v + delta) - height(u, v - delta);
    const rippleX = Math.max(-1, Math.min(1, gx * 2.65));
    const rippleZ = Math.max(-1, Math.min(1, gz * 2.65));
    const foam = clamp01(0.48 + 0.31 * periodicNoise(u, v, 15, 59) +
      0.17 * periodicNoise(u, v, 53, 67) +
      0.08 * Math.sin(2 * Math.PI * (21 * u - 15 * v)));
    const roughness = clamp01(.49 + .27 * periodicNoise(u, v, 23, 83) +
      .15 * periodicNoise(u, v, 61, 97));
    const i = (y * size + x) * 4;
    pixels[i] = Math.round((rippleX * .5 + .5) * 255);
    pixels[i + 1] = Math.round((rippleZ * .5 + .5) * 255);
    pixels[i + 2] = Math.round(foam * 255);
    pixels[i + 3] = Math.round(roughness * 255);
  }
  return { width: size, height: size, pixels };
}

export function createTrainingWaterMaterialCanvas(size = 256) {
  if (typeof document === 'undefined') return null;
  const { pixels, width, height } = makeTrainingWaterMaterialPixels(size);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  return canvas;
}
