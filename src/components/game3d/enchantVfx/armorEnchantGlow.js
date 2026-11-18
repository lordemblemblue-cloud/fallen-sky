// ARMOR enchantment renderer. Light travels inside each worn piece's own engraving, trim and
// embroidery; there is never an external aura (handoff Data Contract: ArmorRenderer.externalAura
// is always false). Each piece reads its OWN item instance: a cape at 30% and a chest at 150%
// render independently.
//
// The avatar layer runtime (onboarding/customizationRuntime.js) calls applyArmorEnchantGlow from
// apply(), which runs after every appearance update. That covers the world avatar, the character
// viewers and the equipment preview with one hook. An appearance without `game3d_armor_enchant`
// (the character creator, creator cosmetics) is never touched.
import * as THREE from 'three';
import { ENCHANT_ARMOR_SLOT_RULES, resolveEnchantVisualStyle } from './enchantVisualRules.mjs';
import { computeAuthoredMask, computeEnchantGeometryAttributes, computeOrnamentMask } from './enchantMasks.mjs';
import {
  ENCHANT_FLOW_ATTRIBUTE, ENCHANT_TRIM_ATTRIBUTE, clearEnchantGlow, ensureEnchantGlowMaterial,
  getEnchantGlowState, isEnchantableMaterial, makeOrnamentMaskTexture, setEnchantGlowStyle,
} from './enchantGlowMaterial.js';
import { getEnchantQuality } from './enchantQuality.js';

export const ARMOR_ENCHANT_SLOTS = Object.freeze(Object.keys(ENCHANT_ARMOR_SLOT_RULES));
export const ARMOR_ENCHANT_EXPOSURE = 1.35;
const MASK_MAX_SIZE = 512;

// CPU mask data per decoded image and mode, shared by every piece showing that image.
const maskDataByImage = { derived: new WeakMap(), authored: new WeakMap() };

// RGBA pixels of a texture's image (downscaled to maxSize), or null (no image, tainted canvas).
function readTexturePixels(texture, maxSize) {
  const image = texture?.image;
  if (!image || typeof image !== 'object') return null;
  const sourceWidth = image.width || image.videoWidth || 0;
  const sourceHeight = image.height || image.videoHeight || 0;
  if (!sourceWidth || !sourceHeight) return null;
  if (image.data && image.data.length >= sourceWidth * sourceHeight * 4) {
    return { rgba: image.data, width: sourceWidth, height: sourceHeight }; // a DataTexture-style image
  }
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : globalThis.document?.createElement?.('canvas');
  if (!canvas) return null;
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  return { rgba: context.getImageData(0, 0, width, height).data, width, height };
}

function cachedMask(mode, texture, compute, maxSize) {
  const image = texture?.image;
  if (!image || typeof image !== 'object') return null;
  const cache = maskDataByImage[mode];
  if (cache.has(image)) return cache.get(image);
  let result = null;
  try {
    const pixels = readTexturePixels(texture, maxSize);
    if (pixels) result = { data: compute(pixels.rgba, pixels.width, pixels.height), width: pixels.width, height: pixels.height };
  } catch {
    result = null; // a cross-origin image: the trim fallback still works
  }
  cache.set(image, result);
  return result;
}

/** Ornament mask derived from a base-colour texture, or null (no image, or a tainted canvas). */
export function ornamentMaskDataForTexture(texture, maxSize = MASK_MAX_SIZE) {
  return cachedMask('derived', texture, computeOrnamentMask, maxSize);
}

/** An artist-authored mask (the piece's own emissive texture): its brightness IS the mask. */
export function authoredMaskDataForTexture(texture, maxSize = MASK_MAX_SIZE) {
  return cachedMask('authored', texture, computeAuthoredMask, maxSize);
}

/**
 * The mask for one material: an authored emissive texture when the piece ships one (separate from
 * its colour map; docs/game3d/ENCHANTMENT_VFX_20261118.md "Artist masks"), else derived from the colour map.
 */
export function enchantMaskDataForMaterial(material) {
  const emissiveMap = material?.emissiveMap;
  if (emissiveMap && emissiveMap !== material.map && emissiveMap.image && emissiveMap.image !== material.map?.image) {
    const authored = authoredMaskDataForTexture(emissiveMap);
    if (authored) return authored;
  }
  return material?.map ? ornamentMaskDataForTexture(material.map) : null;
}

// Positions as a plain xyz Float32Array (interleaved or quantized attributes included).
function positionsOf(attribute) {
  if (!attribute) return null;
  if (!attribute.isInterleavedBufferAttribute && attribute.itemSize === 3 && attribute.array instanceof Float32Array && !attribute.normalized) {
    return attribute.array;
  }
  const out = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    out[i * 3] = attribute.getX(i); out[i * 3 + 1] = attribute.getY(i); out[i * 3 + 2] = attribute.getZ(i);
  }
  return out;
}

/** Add the trim and flow attributes once per geometry (they live and die with the geometry). */
export function prepareEnchantGeometry(geometry, flow, axis = null) {
  const position = geometry?.getAttribute?.('position');
  if (!position) return false;
  const key = axis ? `axis:${axis.origin}:${axis.dir}:${axis.length}:${axis.symmetric ? 1 : 0}` : flow;
  if (geometry.userData.axeEnchantFlow === key && geometry.getAttribute(ENCHANT_TRIM_ATTRIBUTE)) return true;
  const { trim, flow: flowValues } = computeEnchantGeometryAttributes({
    positions: positionsOf(position), indices: geometry.index ? geometry.index.array : null, flow, axis,
  });
  geometry.setAttribute(ENCHANT_TRIM_ATTRIBUTE, new THREE.BufferAttribute(trim, 1));
  geometry.setAttribute(ENCHANT_FLOW_ATTRIBUTE, new THREE.BufferAttribute(flowValues, 1));
  geometry.userData.axeEnchantFlow = key;
  return true;
}

function materialsOf(mesh) {
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean);
}

/** Light (or darken) one armor layer root for a resolved style. */
export function applyEnchantStyleToArmorRoot(root, style, { exposure = ARMOR_ENCHANT_EXPOSURE } = {}) {
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const materials = materialsOf(mesh);
    if (!style?.active) { materials.forEach(clearEnchantGlow); return; }
    prepareEnchantGeometry(mesh.geometry, style.flow);
    for (const material of materials) {
      if (!isEnchantableMaterial(material)) continue;
      let mask = null;
      if (!getEnchantGlowState(material)?.mask) {
        const data = enchantMaskDataForMaterial(material);
        if (data) mask = makeOrnamentMaskTexture(data);
      }
      ensureEnchantGlowMaterial(material, { mask });
      setEnchantGlowStyle(material, style, { exposure });
    }
  });
}

/**
 * layers: Map(armor slot -> { asset, root }) from AvatarCustomizationRuntime.
 * enchant: { [armor slot]: { instanceId, pieceId, rarity, percent } } built from the inventory
 * (enchantVisualState.js), or null/undefined: then nothing is patched or changed.
 * Only layers whose item, stage, rarity or percentage changed are touched.
 */
export function applyArmorEnchantGlow(layers, enchant, { quality = getEnchantQuality() } = {}) {
  if (!layers || typeof layers.forEach !== 'function') return 0;
  let touched = 0;
  layers.forEach((layer, slot) => {
    const root = layer?.root;
    if (!root || !ENCHANT_ARMOR_SLOT_RULES[slot]) return;
    const info = enchant ? enchant[slot] : null;
    if (!info && !root.userData.axeEnchantSignature) return; // never enchanted: leave the material alone
    // the record must describe the piece this layer actually shows
    const matches = Boolean(info) && (!info.pieceId || !layer.asset?.id || info.pieceId === layer.asset.id);
    const style = matches
      ? resolveEnchantVisualStyle({ rarity: info.rarity, percent: info.percent, category: 'armor', slot, quality })
      : null;
    const signature = style?.active
      ? `${info.instanceId || ''}|${style.stageId}|${style.rarity}|${style.percent}|${style.quality}`
      : '';
    if ((root.userData.axeEnchantSignature || '') === signature) return;
    root.userData.axeEnchantSignature = signature;
    root.userData.axeEnchant = style?.active
      ? { slot, instanceId: info.instanceId || null, stage: style.stageLabel, rarity: style.rarity, percent: style.percent, externalAura: false }
      : null;
    applyEnchantStyleToArmorRoot(root, style);
    touched += 1;
  });
  return touched;
}

/** QA: what each worn piece currently shows. */
export function describeArmorEnchantGlow(layers) {
  const out = {};
  layers?.forEach?.((layer, slot) => {
    if (!ENCHANT_ARMOR_SLOT_RULES[slot]) return;
    let patched = 0; let lit = 0; let masks = 0;
    layer.root?.traverse((mesh) => {
      if (!mesh.isMesh) return;
      for (const material of materialsOf(mesh)) {
        const state = getEnchantGlowState(material);
        if (!state) continue;
        patched += 1;
        if (state.uniforms.uAxeGain.value > 0) lit += 1;
        if (state.mask) masks += 1;
      }
    });
    out[slot] = { piece: layer.asset?.id || null, enchant: layer.root?.userData?.axeEnchant || null, patched, lit, masks };
  });
  return out;
}
