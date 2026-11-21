// TSL version of the enchant surface-light patch in enchantGlowMaterial.js, for WebGPURenderer.
// Like the GLSL (one program for every patched material), one node graph per variant (with / without an ornament
// mask) serves every enchanted material: each material's values are read from material.__axeEnchantUniforms
// (webgpuNodeKit.js materialValue), so an enchant change never rebuilds a shader.
import { Color } from 'three';
import {
  vec2, vec3, vec4, float, uv, sin, pow, clamp, max, min, mix, smoothstep, step, select, fract, floor, abs,
  materialEmissive,
} from 'three/tsl';
import { materialValue, optionalAttribute, uniformOf, sinHash21 } from '../../../lib/webgpuNodeKit.js';

const WHITE = new Color(1, 1, 1);
const variants = new Map();

/** { mapStage(color), emissiveNode } for materials with (`withMask`) or without an ornament mask. */
export function enchantGlowNodes({ time, trimAttribute, flowAttribute, withMask }) {
  const key = withMask ? 'mask' : 'plain';
  if (variants.has(key)) return variants.get(key);
  const V = (name, type, fallback) => materialValue(`__axeEnchantUniforms.${name}.value`, type, fallback);
  const gain = V('uAxeGain', 'float', 0); const exposure = V('uAxeExposure', 'float', 1.35);
  const inlay = V('uAxeInlay', 'float', 0); const coverage = V('uAxeCoverage', 'float', 0.1);
  const sharp = V('uAxeSharp', 'float', 0.7); const motion = V('uAxeMotion', 'float', 0);
  const stage = V('uAxeStage', 'float', 0); const reach = V('uAxeReach', 'float', 1);
  const accentAmt = V('uAxeAccentAmt', 'float', 0); const nodesAmt = V('uAxeNodes', 'float', 0);
  const glass = V('uAxeGlass', 'float', 0); const texMix = V('uAxeTexMix', 'float', 0);
  const trimMix = V('uAxeTrimMix', 'float', 1);
  const colA = V('uAxeColA', 'color', WHITE); const colB = V('uAxeColB', 'color', WHITE);
  const colC = V('uAxeColC', 'color', WHITE); const accent = V('uAxeAccent', 'color', WHITE);
  const accent2 = V('uAxeAccent2', 'color', WHITE);
  const t = uniformOf(time, 'float');
  const trim = optionalAttribute(trimAttribute);
  const flow = optionalAttribute(flowAttribute);
  const uvA = uv();

  // where the light lives on this texel
  const orn = withMask ? V('uAxeMask', 'texture').r : float(0); // default uv = vAxeUv (uv channel 0)
  const soft = mix(0.55, 0.15, sharp).mul(coverage);
  const line = smoothstep(coverage.oneMinus().sub(soft), coverage.oneMinus().add(soft.mul(0.5)), orn).mul(texMix);
  const core = smoothstep(coverage.mul(0.45).oneMinus(), coverage.mul(0.1).oneMinus(), orn).mul(texMix);
  const trimV = pow(clamp(trim, 0, 1), 4).mul(trimMix);
  const maskV = max(line, trimV);
  const spread = smoothstep(reach.sub(0.2), reach.add(0.03), flow).oneMinus();
  const mapStage = (color) => vec4(color.rgb.mul(select(gain.greaterThan(0),
    float(1).sub(inlay.mul(clamp(maskV.mul(spread), 0, 1))), float(1))), color.a);

  // the light
  const wave = sin(flow.mul(7).sub(t.mul(mix(0.35, 2.2, motion)))).mul(0.5).add(0.5);
  const breath = sin(t.mul(0.6)).mul(0.2).add(0.8);
  const flowLight = mix(breath, pow(wave, 3).mul(0.6).add(0.55), smoothstep(0.1, 0.6, motion));
  const sparkStage = step(1.5, stage).mul(step(stage, 4.5));
  const flick = float(1).sub(sparkStage.mul(0.16).mul(step(0.9, sinHash21(floor(vec2(flow.mul(36).add(uvA.x.mul(9)), t.mul(5)))))));
  let col = mix(colB, colA, clamp(core.add(trimV).add(0.55), 0, 1));
  col = mix(col, colC, smoothstep(0.82, 1, wave).mul(motion).mul(0.35).mul(core));
  const band = fract(flow.mul(2.4).sub(t.mul(0.05)));
  const channel = select(band.lessThan(0.5), colB, colC);
  const bandEdge = smoothstep(0, 0.04, abs(band.sub(0.5))).mul(smoothstep(0, 0.04, min(band, band.oneMinus())));
  col = select(stage.greaterThan(5.5), mix(colA, channel, core.mul(0.75).oneMinus().mul(bandEdge)), col);
  const edge = clamp(line.mul(line.oneMinus()).mul(4), 0, 1).mul(core.oneMinus());
  col = mix(col, accent, edge.mul(accentAmt));
  const node = nodesAmt.mul(smoothstep(0.988, 0.998, orn)).mul(sin(t.mul(1.7).add(flow.mul(11))).mul(0.45).add(0.55)).mul(texMix);
  const glassV = glass.mul(smoothstep(coverage.mul(1.6).oneMinus(), coverage.oneMinus(), orn)).mul(texMix).mul(line.oneMinus());
  const light = col.mul(maskV.mul(flowLight).mul(flick).add(node)).mul(spread)
    .add(mix(colA, accent2, 0.3).mul(glassV).mul(spread).mul(0.14));
  const result = {
    mapStage,
    emissive: select(gain.greaterThan(0), light.mul(gain).mul(exposure), vec3(0)),
    emissiveNode: materialEmissive.add(select(gain.greaterThan(0), light.mul(gain).mul(exposure), vec3(0))),
  };
  variants.set(key, result);
  return result;
}
