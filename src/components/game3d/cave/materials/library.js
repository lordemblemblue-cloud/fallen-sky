import * as THREE from 'three';
import { getCaveTextureSet, listCaveTextureIds, releaseCaveTextures } from './textures.js';

// One compiled program per define-set. Variation that must stay per draw
// (tint, roughness, repeat) uses material uniforms Three already refreshes.
const CAVE_PARS = /* glsl */`
varying vec3 vCaveWPos;
varying vec3 vCaveWNorm;
const float CAVE_TRI_SCALE = 0.46;

vec3 caveTriWeight(vec3 n) {
  vec3 w = abs(n);
  w = pow(max(w, vec3(0.0001)), vec3(4.0));
  return w / (w.x + w.y + w.z);
}

vec4 caveTriSample(sampler2D tex, vec3 p, vec3 w) {
  vec4 sx = texture2D(tex, p.zy * CAVE_TRI_SCALE);
  vec4 sy = texture2D(tex, p.xz * CAVE_TRI_SCALE);
  vec4 sz = texture2D(tex, p.xy * CAVE_TRI_SCALE);
  return sx * w.x + sy * w.y + sz * w.z;
}

vec3 caveTriNormal(sampler2D tex, vec3 p, vec3 n) {
  vec3 blend = pow(abs(n), vec3(4.0));
  blend /= max(dot(blend, vec3(1.0)), 0.0001);
  vec3 nx = texture2D(tex, p.zy * CAVE_TRI_SCALE).xyz * 2.0 - 1.0;
  vec3 ny = texture2D(tex, p.xz * CAVE_TRI_SCALE).xyz * 2.0 - 1.0;
  vec3 nz = texture2D(tex, p.xy * CAVE_TRI_SCALE).xyz * 2.0 - 1.0;
  nx = vec3(nx.xy + n.zy, abs(nx.z) * n.x);
  ny = vec3(ny.xy + n.xz, abs(ny.z) * n.y);
  nz = vec3(nz.xy + n.xy, abs(nz.z) * n.z);
  return normalize(nx.zyx * blend.x + ny.xzy * blend.y + nz.xyz * blend.z);
}
`;

const CAVE_VERTEX_TAIL = /* glsl */`
#include <fog_vertex>
vec4 caveWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  caveWorld = instanceMatrix * caveWorld;
#endif
#ifdef USE_BATCHING
  caveWorld = batchingMatrix * caveWorld;
#endif
vCaveWPos = (modelMatrix * caveWorld).xyz;
vec3 caveObjN = objectNormal;
#ifdef USE_INSTANCING
  caveObjN = mat3(instanceMatrix) * caveObjN;
#endif
#ifdef USE_BATCHING
  caveObjN = mat3(batchingMatrix) * caveObjN;
#endif
vCaveWNorm = normalize(mat3(modelMatrix) * caveObjN);
`;

const CAVE_MAP = /* glsl */`
#ifdef USE_MAP
  vec3 caveWn = normalize(vCaveWNorm);
  vec3 caveWw = caveTriWeight(caveWn);
  vec4 sampledDiffuseColor;
  #ifdef CAVE_TRIPLANAR
    sampledDiffuseColor = caveTriSample(map, vCaveWPos, caveWw);
  #else
    sampledDiffuseColor = texture2D(map, vMapUv);
  #endif
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
  #endif
  float caveMacro = fract(sin(dot(floor(vCaveWPos.xz * 0.31 + vCaveWPos.y * 0.07), vec2(127.1, 311.7))) * 43758.5453);
  float caveMid = fract(sin(dot(floor(vCaveWPos * 6.5), vec3(41.3, 12.7, 89.1))) * 21935.13);
  float caveGrain = fract(sin(dot(vCaveWPos.xz, vec2(91.7, 27.3)) + vCaveWPos.y * 13.1) * 17345.2);
  sampledDiffuseColor.rgb *= mix(0.90, 1.08, caveMacro);
  sampledDiffuseColor.rgb *= mix(0.93, 1.07, caveMid);
  sampledDiffuseColor.rgb *= mix(0.975, 1.025, caveGrain);
  diffuseColor *= sampledDiffuseColor;
#endif
`;

const CAVE_ROUGHNESS = /* glsl */`
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  float caveRoughSample;
  #ifdef CAVE_TRIPLANAR
    caveRoughSample = caveTriSample(roughnessMap, vCaveWPos, caveTriWeight(normalize(vCaveWNorm))).g;
  #else
    caveRoughSample = texture2D(roughnessMap, vRoughnessMapUv).g;
  #endif
  roughnessFactor *= caveRoughSample;
#endif
float caveRoughJitter = fract(sin(dot(floor(vCaveWPos.xz * 0.47), vec2(27.1, 91.7))) * 12543.13);
roughnessFactor = clamp(roughnessFactor + (caveRoughJitter - 0.5) * 0.045, 0.04, 1.0);
`;

const CAVE_AO = /* glsl */`
#ifdef USE_AOMAP
  float caveAoSample;
  #ifdef CAVE_TRIPLANAR
    caveAoSample = caveTriSample(aoMap, vCaveWPos, caveTriWeight(normalize(vCaveWNorm))).r;
  #else
    caveAoSample = texture2D(aoMap, vMapUv).r;
  #endif
  float ambientOcclusion = (caveAoSample - 1.0) * aoMapIntensity + 1.0;
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined(USE_ENVMAP) && defined(STANDARD)
    float dotNV = saturate(dot(geometryNormal, geometryViewDir));
    reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNV, ambientOcclusion, material.roughness);
  #endif
#endif
`;

const CAVE_NORMAL = /* glsl */`
#ifdef USE_NORMALMAP_TANGENTSPACE
  #ifdef CAVE_TRIPLANAR
    vec3 caveGeomN = normalize(vCaveWNorm);
    normal = normalize(mat3(viewMatrix) * caveTriNormal(normalMap, vCaveWPos, caveGeomN));
    #ifdef DOUBLE_SIDED
      normal *= faceDirection;
    #endif
  #else
    vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
    mapN.xy *= normalScale;
    normal = normalize(tbn * mapN);
  #endif
#endif
`;

const CAVE_EMISSIVE = /* glsl */`
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor;
  #ifdef CAVE_TRIPLANAR
    emissiveColor = caveTriSample(emissiveMap, vCaveWPos, caveTriWeight(normalize(vCaveWNorm)));
  #else
    emissiveColor = texture2D(emissiveMap, vEmissiveMapUv);
  #endif
  #ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
    emissiveColor = sRGBTransferEOTF(emissiveColor);
  #endif
  totalEmissiveRadiance *= emissiveColor.rgb;
#endif
`;

function caveOnBeforeCompile(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vCaveWPos;\nvarying vec3 vCaveWNorm;`)
    .replace('#include <fog_vertex>', CAVE_VERTEX_TAIL);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${CAVE_PARS}`)
    .replace('#include <map_fragment>', CAVE_MAP)
    .replace('#include <roughnessmap_fragment>', CAVE_ROUGHNESS)
    .replace('#include <normal_fragment_maps>', CAVE_NORMAL)
    .replace('#include <emissivemap_fragment>', CAVE_EMISSIVE)
    .replace('#include <aomap_fragment>', CAVE_AO);
}

function caveProgramKey() {
  return 'cave-surface-v1';
}

const CATALOG = [
  spec('roughRock', 'Rough rock', 'Rock', 'Pitted, cracked cave stone with mineral flecks.', { triplanar: true, tileMeters: 2.2, metalness: 0.03, normalScale: 1.2, ao: 1.2 }),
  spec('layeredRock', 'Layered rock', 'Rock', 'Sedimentary beds with shelving lips and vertical fissures.', { triplanar: true, tileMeters: 2.2, metalness: 0.02, normalScale: 1.35, ao: 1.15 }),
  spec('wetRock', 'Wet rock', 'Rock', 'Dark stone with seeps, drips, and a thin water coat.', { triplanar: true, tileMeters: 2.2, metalness: 0.04, normalScale: 0.7, ao: 1, physical: true, clearcoat: 0.62, clearcoatRoughness: 0.28 }),
  spec('mossyRock', 'Mossy rock', 'Rock', 'Rough stone with damp moss packed into pockets and the lower face.', { triplanar: true, tileMeters: 2.2, metalness: 0.02, normalScale: 1.05, ao: 1.15 }),
  spec('crystalRock', 'Crystal-veined rock', 'Rock', 'Charcoal host rock shot through with glowing amethyst and teal veins.', { triplanar: true, tileMeters: 2.2, metalness: 0.06, normalScale: 1.1, ao: 1, physical: true, clearcoat: 0.42, clearcoatRoughness: 0.18, emissive: 0xffffff, emissiveIntensity: 0.9 }),
  spec('cliffRock', 'Cliff rock', 'Approach', 'Bluff face with horizontal ledges, fissures, and lichen on the shelves.', { triplanar: true, tileMeters: 2.2, metalness: 0.02, normalScale: 1.4, ao: 1.2 }),
  spec('gravelFloor', 'Gravel floor', 'Floor', 'Rounded pebbles sitting in dark grit.', { tileMeters: 1.6, metalness: 0.02, normalScale: 1.15, ao: 1.25, swatchTiles: 2 }),
  spec('packedDirt', 'Packed dirt', 'Floor', 'Trodden earth, fine grit, and a couple of footprints.', { tileMeters: 1.8, metalness: 0, normalScale: 0.8, ao: 1, swatchTiles: 2 }),
  spec('wetStoneFloor', 'Wet stone floor', 'Floor', 'Worn slabs with mortar joints and standing water.', { tileMeters: 2, metalness: 0.04, normalScale: 0.9, ao: 1.1, swatchTiles: 2, physical: true, clearcoat: 0.5, clearcoatRoughness: 0.22 }),
  spec('cleanBrick', 'Clean brick', 'Brick', 'A single fired-clay face: pores, sand, and a soft edge.', { tileMeters: 0.42, metalness: 0.01, normalScale: 0.85, ao: 0.9, swatchTiles: 1 }),
  spec('wornBrick', 'Worn brick', 'Brick', 'Rounded clay with salt bloom and chipped arrises.', { tileMeters: 0.42, metalness: 0.01, normalScale: 1, ao: 1, swatchTiles: 1 }),
  spec('brokenBrick', 'Broken brick', 'Brick', 'Cracked clay face with a missing corner bite.', { tileMeters: 0.42, metalness: 0.01, normalScale: 1.15, ao: 1.05, swatchTiles: 1 }),
  spec('mossyBrick', 'Mossy brick', 'Brick', 'Clay with moss creeping along the lower edge.', { tileMeters: 0.42, metalness: 0.01, normalScale: 0.9, ao: 1, swatchTiles: 1 }),
  spec('cleanMasonry', 'Clean masonry', 'Masonry', 'Running-bond wall tile for distant brickwork.', { tileMeters: 3.33, metalness: 0.01, normalScale: 1.1, ao: 1.15, swatchTiles: 1 }),
  spec('wornMasonry', 'Worn masonry', 'Masonry', 'Weathered running bond with efflorescence in the joints.', { tileMeters: 3.33, metalness: 0.01, normalScale: 1.15, ao: 1.15, swatchTiles: 1 }),
  spec('brokenMasonry', 'Broken masonry', 'Masonry', 'Running bond with bricks missing from the bond.', { tileMeters: 3.33, metalness: 0.01, normalScale: 1.2, ao: 1.2, swatchTiles: 1 }),
  spec('mossyMasonry', 'Mossy masonry', 'Masonry', 'Running bond with moss in the mortar and lower courses.', { tileMeters: 3.33, metalness: 0.01, normalScale: 1.05, ao: 1.15, swatchTiles: 1 }),
  spec('mortar', 'Mortar', 'Masonry', 'Lime mortar backing behind instanced bricks.', { tileMeters: 0.8, metalness: 0, normalScale: 0.55, ao: 0.8, swatchTiles: 2 }),
  spec('woodPlank', 'Wood plank', 'Wood', 'Sawn timber with latewood bands and a knot.', { tileMeters: 1.1, metalness: 0, normalScale: 0.85, ao: 0.85, swatchTiles: 1 }),
  spec('woodEnd', 'Wood end grain', 'Wood', 'Cut end of a plank, growth rings centered.', { tileMeters: 0.2, metalness: 0, normalScale: 0.7, ao: 0.8, swatchTiles: 1 }),
  spec('woodSupport', 'Timber support', 'Wood', 'Weathered mine timber with a split and greyed grain.', { tileMeters: 1.2, metalness: 0, normalScale: 1, ao: 0.95, swatchTiles: 1 }),
  spec('forgedIron', 'Forged iron', 'Wood', 'Hammered strap iron with scratches and pits.', { tileMeters: 0.35, metalness: 0.86, normalScale: 0.7, ao: 0.7, swatchTiles: 2, physical: true, clearcoat: 0.18, clearcoatRoughness: 0.4 }),
  spec('dirtPath', 'Dirt path', 'Approach', 'Packed approach with a pair of walking ruts.', { tileMeters: 2, metalness: 0, normalScale: 0.85, ao: 1, swatchTiles: 2 }),
  spec('stonePath', 'Stone path', 'Approach', 'Irregular flagstones, worn centers, moss in the joints.', { tileMeters: 2.2, metalness: 0.03, normalScale: 1.15, ao: 1.15, swatchTiles: 2 }),
  spec('grassEdge', 'Grass edge', 'Approach', 'Turf over thin soil, for the verge of an approach.', { tileMeters: 1.5, metalness: 0, normalScale: 0.9, ao: 1, swatchTiles: 2 }),
  spec('grassBlade', 'Grass blades', 'Approach', 'Alpha-cut blades used as cards along a verge.', { tileMeters: 0.8, metalness: 0, normalScale: 0.4, ao: 0.6, swatchTiles: 1, alphaTest: 0.45, doubleSide: true }),
];

function spec(id, label, group, description, extra) {
  return {
    id,
    label,
    group,
    description,
    triplanar: false,
    tileMeters: 2,
    roughness: 1,
    metalness: 0,
    normalScale: 1,
    ao: 1,
    physical: false,
    clearcoat: 0,
    clearcoatRoughness: 0.4,
    emissive: 0x000000,
    emissiveIntensity: 1,
    swatchTiles: 2,
    alphaTest: 0,
    doubleSide: false,
    ...extra,
  };
}

const byId = new Map(CATALOG.map((entry) => [entry.id, entry]));
const materialCache = new Map();
const repeatedTextures = [];

export const CAVE_MATERIAL_IDS = Object.freeze(CATALOG.map((entry) => entry.id));

export function listCaveMaterials() {
  return CATALOG.map((entry) => ({
    id: entry.id,
    label: entry.label,
    group: entry.group,
    description: entry.description,
    triplanar: entry.triplanar,
    tileMeters: entry.tileMeters,
    swatchTiles: entry.swatchTiles,
  }));
}

export function getCaveMaterialSpec(id) {
  const entry = byId.get(id);
  if (!entry) {
    throw new Error(`Unknown cave material "${id}". Known: ${CAVE_MATERIAL_IDS.join(', ')}`);
  }
  return entry;
}

export function getCaveMaterial(id, options = {}) {
  const entry = getCaveMaterialSpec(id);
  const base = getBaseMaterial(entry);
  const seed = options.seed | 0;
  const repeat = normalizeRepeat(options.repeat);
  const tint = options.tint == null ? null : new THREE.Color(options.tint);
  const roughness = options.roughness;
  const metalness = options.metalness;
  const triplanar = options.triplanar;
  if (!seed && !repeat && !tint && roughness == null && metalness == null && triplanar == null) {
    return base;
  }
  const triKey = triplanar == null ? (entry.triplanar ? 'tri' : 'uv') : (triplanar ? 'tri' : 'uv');
  const repeatKey = repeat ? `${round3(repeat[0])}x${round3(repeat[1])}` : 'base';
  const tintKey = tint ? tint.getHexString() : 'none';
  const key = `${entry.id}|${seedBucket(seed)}|${repeatKey}|${tintKey}|${roughness ?? ''}|${metalness ?? ''}|${triKey}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const material = base.clone();
  stamp(material, entry, triplanar == null ? entry.triplanar : !!triplanar);
  if (seed) material.color.multiply(seedTint(seedBucket(seed) + 1));
  if (tint) material.color.multiply(tint);
  if (roughness != null) material.roughness = roughness;
  if (metalness != null) material.metalness = metalness;
  if (repeat) applyRepeat(material, repeat[0], repeat[1]);
  materialCache.set(key, material);
  return material;
}

export function prepareCaveSurface(geometry) {
  if (!geometry || geometry.userData?.caveUvReady) return geometry;
  const uv = geometry.getAttribute('uv');
  if (uv && !geometry.getAttribute('uv2')) geometry.setAttribute('uv2', uv);
  geometry.userData.caveUvReady = true;
  return geometry;
}

export function releaseCaveMaterials() {
  for (const material of materialCache.values()) material.dispose();
  materialCache.clear();
  for (const texture of repeatedTextures) texture.dispose();
  repeatedTextures.length = 0;
  releaseCaveTextures();
}

export function seedTint(seed) {
  const warm = (Math.abs(seed | 0) % 2) === 0;
  const color = new THREE.Color();
  color.setRGB(
    0.9 + hashUnit(seed) * 0.12,
    0.88 + hashUnit(seed + 5) * 0.12,
    warm ? 0.82 + hashUnit(seed + 9) * 0.08 : 0.94 + hashUnit(seed + 9) * 0.08,
  );
  return color;
}

function getBaseMaterial(entry) {
  const key = `${entry.id}|0|base|none||||${entry.triplanar ? 'tri' : 'uv'}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const maps = getCaveTextureSet(entry.id);
  const Material = entry.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const params = {
    name: `Cave/${entry.id}`,
    map: maps.albedo,
    normalMap: maps.normal,
    roughnessMap: maps.roughness,
    aoMap: maps.ao,
    emissiveMap: maps.emissive || null,
    color: 0xffffff,
    roughness: entry.roughness,
    metalness: entry.metalness,
    emissive: entry.emissive,
    emissiveIntensity: maps.emissive ? entry.emissiveIntensity : 0,
    aoMapIntensity: entry.ao,
    normalScale: new THREE.Vector2(entry.normalScale, entry.normalScale),
    alphaTest: entry.alphaTest,
    side: entry.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    dithering: true,
  };
  if (entry.physical) {
    params.clearcoat = entry.clearcoat;
    params.clearcoatRoughness = entry.clearcoatRoughness;
  }
  const material = new Material(params);
  stamp(material, entry, entry.triplanar);
  materialCache.set(key, material);
  return material;
}

function stamp(material, entry, triplanar) {
  material.name = `Cave/${entry.id}`;
  material.userData = {
    caveMaterialId: entry.id,
    caveTriplanar: !!triplanar,
    caveTileMeters: entry.tileMeters,
    caveGroup: entry.group,
    caveShared: true,
  };
  if (triplanar) material.defines.CAVE_TRIPLANAR = '';
  else delete material.defines.CAVE_TRIPLANAR;
  material.onBeforeCompile = caveOnBeforeCompile;
  material.customProgramCacheKey = caveProgramKey;
  material.needsUpdate = true;
}

function applyRepeat(material, x, y) {
  for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap']) {
    if (!material[key]) continue;
    const texture = material[key].clone();
    texture.repeat.set(x, y);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    material[key] = texture;
    repeatedTextures.push(texture);
  }
}

function normalizeRepeat(repeat) {
  if (!repeat) return null;
  const x = Array.isArray(repeat) ? repeat[0] : repeat.x ?? repeat;
  const y = Array.isArray(repeat) ? repeat[1] : repeat.y ?? x;
  return [x, y];
}

function seedBucket(seed) {
  if (!seed) return 0;
  return Math.abs(seed | 0) % 5;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function hashUnit(seed) {
  const n = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

export function caveTextureIdsMatchCatalog() {
  const textures = new Set(listCaveTextureIds());
  return CAVE_MATERIAL_IDS.every((id) => textures.has(id));
}
