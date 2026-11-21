// The surface-light material patch shared by the armor and weapon renderers.
// It turns the piece's own ornament (enchantMasks.mjs: painted filigree, engraving, trim) into lit
// inlay: on those texels the surface colour gives way to the light, and an emissive term coloured
// and animated by the item's enchant stage (and detailed by its rarity, enchantVisualRules.mjs) is
// added. The light is part of the surface: it bends with skinning and cloth and never leaves the
// mesh.
//
// One shader program serves every patched material (customProgramCacheKey), and everything that
// changes with equipment or enchanting is a uniform: an enchant change never recompiles shaders.
import * as THREE from 'three';
import { attachNodes, addMapStageColor } from '../../../lib/webgpuNodeKit.js';
import { enchantGlowNodes } from './enchantGlowNodes.mjs';

export const ENCHANT_GLOW_VERSION = 'axe-enchant-glow-v2';
export const ENCHANT_TRIM_ATTRIBUTE = 'axeEnchTrim';
export const ENCHANT_FLOW_ATTRIBUTE = 'axeEnchFlow';

// One clock for every enchanted surface (updated from material.onBeforeRender, so nothing has to
// tick it and an off-screen piece costs nothing).
export const ENCHANT_TIME = { value: 0 };
const now = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;
function tickEnchantClock() { ENCHANT_TIME.value = now() % 3600; }

const VERTEX_DECL = /* glsl */`
attribute float ${ENCHANT_TRIM_ATTRIBUTE};
attribute float ${ENCHANT_FLOW_ATTRIBUTE};
varying float vAxeTrim;
varying float vAxeFlow;
varying vec2 vAxeUv;
`;
const VERTEX_BODY = /* glsl */`
vAxeTrim = ${ENCHANT_TRIM_ATTRIBUTE};
vAxeFlow = ${ENCHANT_FLOW_ATTRIBUTE};
vAxeUv = uv;
`;
const FRAGMENT_DECL = /* glsl */`
uniform float uAxeTime;
uniform float uAxeGain;
uniform float uAxeExposure;
uniform float uAxeInlay;
uniform float uAxeCoverage;
uniform float uAxeSharp;
uniform float uAxeMotion;
uniform float uAxeStage;
uniform float uAxeReach;
uniform float uAxeAccentAmt;
uniform float uAxeNodes;
uniform float uAxeGlass;
uniform float uAxeTexMix;
uniform float uAxeTrimMix;
uniform vec3 uAxeColA;
uniform vec3 uAxeColB;
uniform vec3 uAxeColC;
uniform vec3 uAxeAccent;
uniform vec3 uAxeAccent2;
#ifdef AXE_ENCHANT_MASK
uniform sampler2D uAxeMask;
#endif
varying float vAxeTrim;
varying float vAxeFlow;
varying vec2 vAxeUv;
float axeHash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;
// Where the light lives on this texel; the lit channel's own colour gives way to the light.
const FRAGMENT_MASK = /* glsl */`
float axeOrnV = 0.0;
float axeLineV = 0.0;
float axeCoreV = 0.0;
float axeTrimV = 0.0;
float axeMaskV = 0.0;
float axeSpreadV = 0.0;
if (uAxeGain > 0.0) {
  #ifdef AXE_ENCHANT_MASK
  axeOrnV = texture2D(uAxeMask, vAxeUv).r;
  #endif
  float axeCov = uAxeCoverage;
  float axeSoft = mix(0.55, 0.15, uAxeSharp) * axeCov;
  // the strongest (coverage) share of the ornament carries light; its brightest part is the core
  axeLineV = smoothstep(1.0 - axeCov - axeSoft, 1.0 - axeCov + axeSoft * 0.5, axeOrnV) * uAxeTexMix;
  axeCoreV = smoothstep(1.0 - axeCov * 0.45, 1.0 - axeCov * 0.1, axeOrnV) * uAxeTexMix;
  axeTrimV = pow(clamp(vAxeTrim, 0.0, 1.0), 4.0) * uAxeTrimMix;
  axeMaskV = max(axeLineV, axeTrimV);
  // the light starts at the piece's focal point and spreads further with each stage
  axeSpreadV = 1.0 - smoothstep(uAxeReach - 0.2, uAxeReach + 0.03, vAxeFlow);
  diffuseColor.rgb *= 1.0 - uAxeInlay * clamp(axeMaskV * axeSpreadV, 0.0, 1.0);
}
`;
const FRAGMENT_LIGHT = /* glsl */`
if (uAxeGain > 0.0) {
  float axeM = uAxeMotion;
  float axeT = uAxeTime;
  // Lit Glass breathes slowly; higher stages become a current travelling along the piece
  float axeWave = 0.5 + 0.5 * sin(vAxeFlow * 7.0 - axeT * mix(0.35, 2.2, axeM));
  float axeBreath = 0.8 + 0.2 * sin(axeT * 0.6);
  float axeFlowLight = mix(axeBreath, 0.55 + 0.6 * pow(axeWave, 3.0), smoothstep(0.1, 0.6, axeM));
  // restrained electrical flicker on the spark stages (Verdant, Golden, Azure)
  float axeSparkStage = step(1.5, uAxeStage) * step(uAxeStage, 4.5);
  float axeFlick = 1.0 - axeSparkStage * 0.16 * step(0.9, axeHash12(floor(vec2(vAxeFlow * 36.0 + vAxeUv.x * 9.0, axeT * 5.0))));
  // the stage hue: the primary dominates every lit texel, the secondary tints the line's edge,
  // and a thin tertiary crest rides the current
  vec3 axeCol = mix(uAxeColB, uAxeColA, clamp(0.55 + axeCoreV + axeTrimV, 0.0, 1.0));
  axeCol = mix(axeCol, uAxeColC, smoothstep(0.82, 1.0, axeWave) * axeM * 0.35 * axeCoreV);
  if (uAxeStage > 5.5) {
    // Ascended Resonance: silver cores, separate crimson and blue channels, never blended
    float axeBand = fract(vAxeFlow * 2.4 - axeT * 0.05);
    vec3 axeChannel = axeBand < 0.5 ? uAxeColB : uAxeColC;
    float axeBandEdge = smoothstep(0.0, 0.04, abs(axeBand - 0.5)) * smoothstep(0.0, 0.04, min(axeBand, 1.0 - axeBand));
    axeCol = mix(uAxeColA, axeChannel, (1.0 - axeCoreV * 0.75) * axeBandEdge);
  }
  // rarity: a thin accent along the very edge of each line (cyan rare, violet elite, gold
  // legendary), never across the line itself, so the stage hue stays readable
  float axeEdge = clamp(axeLineV * (1.0 - axeLineV) * 4.0, 0.0, 1.0) * (1.0 - axeCoreV);
  axeCol = mix(axeCol, uAxeAccent, axeEdge * uAxeAccentAmt);
  // linked inlay nodes (elite, legendary): the very strongest ornament points pulse
  float axeNode = uAxeNodes * smoothstep(0.988, 0.998, axeOrnV) * (0.55 + 0.45 * sin(axeT * 1.7 + vAxeFlow * 11.0)) * uAxeTexMix;
  // multi-layer glass (legendary): a faint band hugging the lines, inside the surface
  float axeGlass = uAxeGlass * smoothstep(1.0 - uAxeCoverage * 1.6, 1.0 - uAxeCoverage, axeOrnV) * uAxeTexMix * (1.0 - axeLineV);
  vec3 axeLight = axeCol * (axeMaskV * axeFlowLight * axeFlick + axeNode) * axeSpreadV
    + mix(uAxeColA, uAxeAccent2, 0.3) * axeGlass * axeSpreadV * 0.14;
  totalEmissiveRadiance += axeLight * uAxeGain * uAxeExposure;
}
`;

function makeUniforms() {
  return {
    uAxeTime: ENCHANT_TIME,
    uAxeGain: { value: 0 },
    uAxeExposure: { value: 1.35 },
    uAxeInlay: { value: 0 },
    uAxeCoverage: { value: 0.1 },
    uAxeSharp: { value: 0.7 },
    uAxeMotion: { value: 0 },
    uAxeStage: { value: 0 },
    uAxeReach: { value: 1 },
    uAxeAccentAmt: { value: 0 },
    uAxeNodes: { value: 0 },
    uAxeGlass: { value: 0 },
    uAxeTexMix: { value: 0 },
    uAxeTrimMix: { value: 1 },
    uAxeColA: { value: new THREE.Color(1, 1, 1) },
    uAxeColB: { value: new THREE.Color(1, 1, 1) },
    uAxeColC: { value: new THREE.Color(1, 1, 1) },
    uAxeAccent: { value: new THREE.Color(1, 1, 1) },
    uAxeAccent2: { value: new THREE.Color(1, 1, 1) },
    uAxeMask: { value: null },
  };
}

export const isEnchantableMaterial = (material) => Boolean(material?.isMeshStandardMaterial);

// Per-material state lives here, NOT in material.userData: Material.copy() JSON-clones userData,
// and the weapon construct effect clones materials while it plays.
const glowStates = new WeakMap();
export const getEnchantGlowState = (material) => (material ? glowStates.get(material) || null : null);

/**
 * Patch a material once (idempotent) and return its enchant state { uniforms, mask }.
 * mask: an optional THREE.Texture holding the ornament mask (R channel), owned by the material
 * from now on: it is disposed with the material.
 */
export function ensureEnchantGlowMaterial(material, { mask = null } = {}) {
  if (!isEnchantableMaterial(material)) return null;
  let state = glowStates.get(material);
  if (!state) {
    const uniforms = makeUniforms();
    state = { uniforms, mask: null };
    glowStates.set(material, state);
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      if (typeof previousCompile === 'function' && previousCompile !== THREE.Material.prototype.onBeforeCompile) {
        previousCompile.call(material, shader, renderer);
      }
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_DECL}`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>\n${VERTEX_BODY}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAGMENT_DECL}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT_MASK}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAGMENT_LIGHT}`);
    };
    material.customProgramCacheKey = () => {
      const base = typeof previousKey === 'function' && previousKey !== THREE.Material.prototype.customProgramCacheKey
        ? previousKey.call(material) : '';
      return `${base}|${ENCHANT_GLOW_VERSION}|${state.mask ? 'm' : ''}`;
    };
    const previousRender = material.onBeforeRender;
    material.onBeforeRender = function onEnchantRender(...args) {
      tickEnchantClock();
      if (typeof previousRender === 'function') previousRender.apply(this, args);
    };
    material.addEventListener('dispose', () => {
      state.mask?.dispose();
      state.mask = null;
    });
    material.defines = { ...(material.defines || {}) };
    // WebGPURenderer: the same light in TSL, its values read from this material
    material.__axeEnchantUniforms = uniforms;
    attachEnchantNodes(material, false);
    material.needsUpdate = true;
  }
  if (mask && state.mask !== mask) {
    state.mask?.dispose();
    state.mask = mask;
    state.uniforms.uAxeMask.value = mask;
    material.defines.AXE_ENCHANT_MASK = '';
    attachEnchantNodes(material, true);
    material.needsUpdate = true;
  }
  return state;
}

// The TSL light: map stage (inlay) + emissive. The mask variant replaces the plain one; the material's other
// emissive nodes (if any) stay underneath.
function attachEnchantNodes(material, withMask) {
  const nodes = enchantGlowNodes({ time: ENCHANT_TIME, trimAttribute: ENCHANT_TRIM_ATTRIBUTE, flowAttribute: ENCHANT_FLOW_ATTRIBUTE, withMask });
  if (material.__axeEnchantMapStage) material.__mapStageColor = (material.__mapStageColor || []).filter((fn) => fn !== material.__axeEnchantMapStage);
  material.__axeEnchantMapStage = nodes.mapStage;
  if (!('__axeEnchantBaseEmissive' in material)) material.__axeEnchantBaseEmissive = material.emissiveNode || null;
  const base = material.__axeEnchantBaseEmissive;
  attachNodes(material, { emissiveNode: base ? base.add(nodes.emissive) : nodes.emissiveNode });
  addMapStageColor(material, nodes.mapStage);
}

const setColor = (uniform, hex, fallback) => uniform.value.set(hex || fallback || '#ffffff');

/**
 * Write a resolved style (enchantVisualRules.resolveEnchantVisualStyle) into a patched material.
 * Only uniform values change. `exposure` scales the whole light (armor and weapons differ).
 */
export function setEnchantGlowStyle(material, style, { exposure = 1.35, emphasis = 1 } = {}) {
  const state = getEnchantGlowState(material);
  if (!state) return false;
  const u = state.uniforms;
  const active = Boolean(style?.active);
  u.uAxeGain.value = active ? Math.min(1, style.emissiveGain * (style.emphasis ?? 1) * emphasis) : 0;
  if (!active) return true;
  const hasMask = Boolean(state.mask);
  u.uAxeExposure.value = exposure;
  // the lit channel's own colour gives way to the light: a little at Lit Glass, mostly at 200%
  u.uAxeInlay.value = Math.min(0.92, (0.3 + 0.7 * (style.stageEmissive ?? 0.5)) * (0.55 + 0.45 * (style.vfxMultiplier ?? 1)));
  u.uAxeCoverage.value = style.coverage * (style.slot === 'cape' ? 0.8 : 1);
  u.uAxeSharp.value = style.sharpness;
  u.uAxeMotion.value = style.motion;
  u.uAxeStage.value = style.stageIndex;
  u.uAxeReach.value = style.reach;
  u.uAxeAccentAmt.value = style.accent ? style.accentAmount : 0;
  u.uAxeNodes.value = style.nodes;
  u.uAxeGlass.value = style.slot === 'cape' ? 0 : style.glass;
  // With an ornament mask the mesh trim is only a faint secondary channel (a little more on the
  // basic rarities, whose look is "a tiny highlight on existing edges"); without one it is the
  // whole, documented fallback.
  u.uAxeTexMix.value = hasMask ? 1 : 0;
  u.uAxeTrimMix.value = hasMask ? (style.detailRank <= 1 ? 0.22 : 0.12) : 0.8;
  setColor(u.uAxeColA, style.palette?.primary);
  setColor(u.uAxeColB, style.palette?.secondary);
  setColor(u.uAxeColC, style.palette?.tertiary);
  setColor(u.uAxeAccent, style.accent, style.palette?.secondary);
  setColor(u.uAxeAccent2, style.accent2, style.palette?.tertiary);
  return true;
}

/** Turn the light off without unpatching (keeps the shared program; costs one branch). */
export function clearEnchantGlow(material) {
  const state = getEnchantGlowState(material);
  if (state) state.uniforms.uAxeGain.value = 0;
}

/** An R8 texture for an ornament mask computed by enchantMasks.computeOrnamentMask. */
export function makeOrnamentMaskTexture({ data, width, height }) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = 'AXE_EnchantOrnamentMask';
  texture.flipY = false; // the same row order as the glTF base colour it was computed from
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
