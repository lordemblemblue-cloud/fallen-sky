// Procedural seamless Sumi-e pigment & relief textures for Wolfveil Valley.
// Pure CPU Uint8Array DataTextures: works identically in WebGL and Node tests
// with zero external network fetches or flat untextured plastic surfaces.
import * as THREE from 'three';

const clampByte = v => Math.max(0, Math.min(255, Math.round(v)));
const TAU = Math.PI * 2;

// Periodic integer-lattice value noise so every texture wraps seamlessly on [0,1).
function makePeriodicNoise(seed = 1) {
  const hash = (ix, iy, period) => {
    const x = ((ix % period) + period) % period;
    const y = ((iy % period) + period) % period;
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  const layer = (u, v, period) => {
    const x = u * period, y = v * period;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, period), b = hash(ix + 1, iy, period);
    const c = hash(ix, iy + 1, period), d = hash(ix + 1, iy + 1, period);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
  const fbm = (u, v, basePeriod = 6) =>
    layer(u, v, basePeriod) * 0.52 +
    layer(u, v, basePeriod * 2) * 0.28 +
    layer(u, v, basePeriod * 4) * 0.14 +
    layer(u, v, basePeriod * 8) * 0.06;
  return { hash, layer, fbm };
}

function toDataTexture(pixels, size, name, isLinear = false, repeatX = 1, repeatY = 1) {
  const tex = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  tex.name = name;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = isLinear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function buildPair({ size = 256, seed = 1, name, repeat = [1, 1], sample }) {
  const albedo = new Uint8Array(size * size * 4);
  const bump = new Uint8Array(size * size * 4);
  const rng = makePeriodicNoise(seed);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const out = sample(u, v, rng, x, y);
      const idx = (y * size + x) * 4;
      albedo[idx] = clampByte(out.r);
      albedo[idx + 1] = clampByte(out.g);
      albedo[idx + 2] = clampByte(out.b);
      albedo[idx + 3] = 255;
      const h = clampByte(out.h ?? 128);
      bump[idx] = h;
      bump[idx + 1] = h;
      bump[idx + 2] = h;
      bump[idx + 3] = 255;
    }
  }
  return Object.freeze({
    map: toDataTexture(albedo, size, `${name}_Albedo`, false, repeat[0], repeat[1]),
    bumpMap: toDataTexture(bump, size, `${name}_Bump`, true, repeat[0], repeat[1]),
  });
}

let cachedSuite = null;

export function getWolfveilSumiETextures() {
  if (cachedSuite) return cachedSuite;

  // 1. Dirt Trail & Loam: compacted soil clods, wheel/foot ruts, scattered pebbles & dry-brush ink strokes
  const dirt = buildPair({
    size: 256, seed: 11, name: 'Wolfveil_SumiE_Dirt', repeat: [1, 1],
    sample(u, v, rng) {
      const clod = rng.fbm(u, v, 8);
      const grit = rng.layer(u, v, 32);
      const pebbleCell = rng.layer(u * 1.1, v * 1.1, 24);
      const pebble = pebbleCell > 0.80 ? (pebbleCell - 0.80) * 5.0 : 0;
      const rut = 0.5 + 0.5 * Math.cos(TAU * (u * 2 + 0.14 * Math.sin(TAU * v * 2)));
      const brush = Math.pow(Math.max(0, Math.sin(TAU * (v * 19 + u * 3 + clod * 0.8))), 12);
      const damp = Math.max(0, 0.55 - clod) * 0.55;
      const shade = 0.78 + 0.30 * clod + 0.10 * (grit - 0.5) - 0.12 * (1 - rut) - 0.16 * brush - damp * 0.22 + pebble * 0.18;
      return {
        r: 178 * shade + pebble * 22,
        g: 151 * shade + pebble * 22,
        b: 121 * shade + pebble * 24,
        h: 118 + clod * 70 + pebble * 55 - (1 - rut) * 26 - brush * 22,
      };
    },
  });

  // 2. Meadow Turf & Moss Wash: layered sumi-e ink grass strokes + soil undertones
  const turf = buildPair({
    size: 256, seed: 23, name: 'Wolfveil_SumiE_Turf', repeat: [1, 1],
    sample(u, v, rng) {
      const wash = rng.fbm(u, v, 6);
      const fine = rng.layer(u, v, 28);
      const strokeA = Math.pow(Math.max(0, Math.sin(TAU * (u * 26 + 0.35 * Math.sin(TAU * v * 5)))), 14);
      const strokeB = Math.pow(Math.max(0, Math.sin(TAU * (v * 22 - 0.30 * Math.cos(TAU * u * 6)))), 16);
      const loamPatch = Math.max(0, wash - 0.66) * 2.1;
      const lum = 222 + (wash - 0.5) * 34 + (fine - 0.5) * 18 - strokeA * 26 - strokeB * 18;
      return {
        r: lum - loamPatch * 10,
        g: lum + 5 - loamPatch * 16,
        b: lum - 9 - loamPatch * 22,
        h: 124 + wash * 42 + fine * 28 - strokeA * 30,
      };
    },
  });

  // 3. Hand-Troweled Washi & Lime Plaster: subtle vertical rain-wash, warm rice-paper fibers & sumi edge grain
  const plaster = buildPair({
    size: 256, seed: 37, name: 'Wolfveil_SumiE_Plaster', repeat: [0.22, 0.22],
    sample(u, v, rng) {
      const wash = rng.fbm(u, v, 5);
      const streak = rng.fbm(u * 2, v * 0.5, 8);
      const fiberH = Math.pow(Math.max(0, Math.sin(TAU * (v * 37 + wash * 1.4))), 18);
      const fiberV = Math.pow(Math.max(0, Math.sin(TAU * (u * 31 - wash * 1.1))), 18);
      const trowel = rng.layer(u, v, 18);
      const base = 228 + (wash - 0.5) * 26 - (streak - 0.5) * 18 + (trowel - 0.5) * 12 - (fiberH + fiberV) * 12;
      return {
        r: base + 5,
        g: base + 1,
        b: base - 10,
        h: 132 + (trowel - 0.5) * 38 + (wash - 0.5) * 30 - fiberH * 16,
      };
    },
  });

  // 4. Aged Cedar & Hinoki Timber: longitudinal wood grain, growth cathedral rings, plank joints & sumi ink lines
  const wood = buildPair({
    size: 256, seed: 53, name: 'Wolfveil_SumiE_Cedar', repeat: [0.35, 0.35],
    sample(u, v, rng) {
      const plankIndex = Math.floor(u * 6);
      const plankEdge = Math.min((u * 6) % 1, 1 - ((u * 6) % 1));
      const seam = plankEdge < 0.035 ? (1 - plankEdge / 0.035) : 0;
      const warp = rng.fbm(u, v * 0.35, 6);
      const rings = 0.5 + 0.5 * Math.sin(TAU * (u * 18 + warp * 4.2 + plankIndex * 0.37));
      const fibers = rng.layer(u * 4, v * 0.5, 16);
      const plankTone = 0.90 + ((plankIndex * 37) % 5) * 0.045;
      const shade = (0.76 + rings * 0.22 + (fibers - 0.5) * 0.14) * plankTone * (1 - seam * 0.52);
      return {
        r: 196 * shade,
        g: 154 * shade,
        b: 118 * shade,
        h: 138 + rings * 36 + (fibers - 0.5) * 26 - seam * 95,
      };
    },
  });

  // 5. Indigo-Slate Kawara Roof Tiles: overlapping curved tile flutes, drip shadows & lichen ink wash
  const roof = buildPair({
    size: 256, seed: 71, name: 'Wolfveil_SumiE_KawaraRoof', repeat: [0.42, 0.42],
    sample(u, v, rng) {
      const cols = 10, rows = 8;
      const cu = (u * cols) % 1, cv = (v * rows) % 1;
      const flute = 0.5 + 0.5 * Math.cos(TAU * cu);
      const courseLip = cv < 0.11 ? (1 - cv / 0.11) : 0;
      const patina = rng.fbm(u, v, 7);
      const glaze = 0.74 + flute * 0.26 + (patina - 0.5) * 0.18 - courseLip * 0.36;
      return {
        r: 162 * glaze,
        g: 178 * glaze,
        b: 198 * glaze,
        h: 110 + flute * 78 - courseLip * 72 + (patina - 0.5) * 20,
      };
    },
  });

  // 6. Dressed Ashlar & Courtyard Flagstone: staggered stone courses, mortar grooves, moss & mineral fleck
  const stone = buildPair({
    size: 256, seed: 89, name: 'Wolfveil_SumiE_Flagstone', repeat: [0.26, 0.26],
    sample(u, v, rng) {
      const rows = 6, cols = 4;
      const row = Math.floor(v * rows);
      const su = (u * cols + (row % 2) * 0.5) % cols;
      const blockId = row * cols + Math.floor(su);
      const fu = su % 1, fv = (v * rows) % 1;
      const edgeU = Math.min(fu, 1 - fu), edgeV = Math.min(fv, 1 - fv);
      const mortar = Math.max(
        edgeU < 0.045 ? 1 - edgeU / 0.045 : 0,
        edgeV < 0.055 ? 1 - edgeV / 0.055 : 0,
      );
      const grain = rng.fbm(u, v, 10);
      const speckle = rng.layer(u, v, 40);
      const blockTint = 0.90 + ((blockId * 19) % 7) * 0.03;
      const moss = mortar * Math.max(0, grain - 0.48) * 1.4;
      const shade = (0.82 + (grain - 0.5) * 0.24 + (speckle - 0.5) * 0.12) * blockTint * (1 - mortar * 0.38);
      return {
        r: 204 * shade - moss * 28,
        g: 206 * shade + moss * 12,
        b: 199 * shade - moss * 32,
        h: 146 + (grain - 0.5) * 44 + (speckle - 0.5) * 22 - mortar * 98,
      };
    },
  });

  // 7. Twisted 3-Strand Hemp Rope: helical braid relief & natural fiber grain
  const rope = buildPair({
    size: 128, seed: 103, name: 'Wolfveil_SumiE_TwistedRope', repeat: [1, 6],
    sample(u, v, rng) {
      const strand = Math.abs(Math.sin(TAU * (v * 3 + u * 1.5)));
      const fiber = rng.layer(u * 2, v * 6, 16);
      const shade = 0.62 + strand * 0.40 + (fiber - 0.5) * 0.16;
      return {
        r: 198 * shade,
        g: 166 * shade,
        b: 122 * shade,
        h: 92 + strand * 120 + (fiber - 0.5) * 28,
      };
    },
  });

  // 8. Subterranean Stratified Cave Basalt & Wet Mineral Veins
  const caveRock = buildPair({
    size: 256, seed: 131, name: 'Wolfveil_SumiE_CaveBasalt', repeat: [0.20, 0.20],
    sample(u, v, rng) {
      const strata = 0.5 + 0.5 * Math.sin(TAU * (v * 7 + rng.fbm(u, v, 5) * 2.2));
      const crag = rng.fbm(u, v, 12);
      const fissure = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(TAU * (u * 5 + crag * 2.4))) * 4.5), 2);
      const mineral = Math.max(0, crag - 0.72) * 2.4;
      const shade = 0.66 + strata * 0.22 + crag * 0.24 - fissure * 0.38;
      return {
        r: 138 * shade - mineral * 12,
        g: 148 * shade + mineral * 22,
        b: 162 * shade + mineral * 28,
        h: 128 + strata * 48 + (crag - 0.5) * 64 - fissure * 96,
      };
    },
  });

  // 9. Brushed Gilt Bronze & Temple Lacquer
  const gilt = buildPair({
    size: 128, seed: 149, name: 'Wolfveil_SumiE_GiltBronze', repeat: [0.5, 0.5],
    sample(u, v, rng) {
      const brush = rng.fbm(u * 2, v * 0.5, 10);
      const patina = Math.max(0, rng.fbm(u, v, 6) - 0.62) * 1.4;
      const shade = 0.84 + brush * 0.22 - patina * 0.24;
      return {
        r: 238 * shade,
        g: 204 * shade + patina * 8,
        b: 136 * shade + patina * 14,
        h: 130 + (brush - 0.5) * 32 - patina * 28,
      };
    },
  });

  cachedSuite = Object.freeze({
    dirt, turf, plaster, wood, roof, stone, rope, caveRock, gilt,
  });
  return cachedSuite;
}

export function cloneRepeatedTexture(texture, repeatX, repeatY) {
  const copy = texture.clone();
  copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
  copy.repeat.set(repeatX, repeatY);
  copy.needsUpdate = true;
  return copy;
}