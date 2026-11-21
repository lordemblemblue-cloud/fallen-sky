// TSL twins of the weapon enchant aura shell and spark ShaderMaterials (weaponEnchantVfx.js), for WebGPURenderer.
// Output (tone mapping, sRGB) follows the GLSL's includes (webgpuClassicOutput.js).
import { NodeMaterial } from 'three/webgpu';
import {
  Fn, attribute, reference, vec4, float, sin, pow, abs, dot, mix, smoothstep, step, fract, select, clamp,
  normalize, length, max, varying, positionGeometry, normalGeometry, modelViewMatrix, modelNormalMatrix,
  cameraProjectionMatrix,
} from 'three/tsl';
import { pointCoord, pointSpriteClip } from '../../../lib/webgpuPointSprites.js';

export function createWeaponAuraTwin(classic, flowAttribute) {
  const u = classic.uniforms;
  const U = (name, type) => reference('value', type, u[name]);
  const width = U('uWidth', 'float');
  const mv = modelViewMatrix.mul(vec4(positionGeometry, 1)).xyz;
  const n = normalize(modelNormalMatrix.mul(normalGeometry));
  const inflated = mv.add(n.mul(width));
  const vNormal = varying(n, 'v_auraNormal');
  const vView = varying(normalize(inflated.negate()), 'v_auraView');
  const vFlow = varying(attribute(flowAttribute, 'float'), 'v_auraFlow');
  const colA = U('uColA', 'color'); const colB = U('uColB', 'color'); const colC = U('uColC', 'color');
  const strength = U('uStrength', 'float'); const time = U('uTime', 'float'); const motion = U('uMotion', 'float');
  const stage = U('uStage', 'float'); const layer = U('uLayer', 'float'); const bow = U('uBow', 'float');
  const shade = Fn(() => {
    const fres = pow(float(1).sub(abs(dot(normalize(vNormal), normalize(vView)))), 2).toVar();
    const wave = sin(vFlow.mul(9).sub(time.mul(mix(0.6, 3, motion))).add(layer.mul(1.7))).mul(0.5).add(0.5).toVar();
    const sparkStage = step(1.5, stage).mul(step(stage, 4.5));
    const flick = float(1).sub(sparkStage.mul(0.12).mul(sin(time.mul(13).add(vFlow.mul(31))).mul(0.5).add(0.5)));
    const col = mix(colB, colA, fres).toVar();
    col.assign(mix(col, colC, smoothstep(0.7, 1, wave).mul(motion).mul(0.6)));
    const band = fract(vFlow.mul(2).sub(time.mul(0.08)).add(layer.mul(0.33)));
    col.assign(select(stage.greaterThan(5.5), select(band.lessThan(0.5), mix(colA, colB, fres), mix(colA, colC, fres)), col));
    const alpha = strength.mul(fres.mul(0.82).add(0.18)).mul(mix(1, wave.mul(0.55).add(0.65), motion)).mul(flick)
      .mul(mix(smoothstep(0.04, 0.2, vFlow), 1, bow.mul(0.4))).toVar();
    return vec4(col.mul(alpha), alpha);
  });
  const m = new NodeMaterial();
  m.vertexNode = cameraProjectionMatrix.mul(vec4(inflated, 1));
  m.fragmentNode = shade();
  return m;
}

export function createWeaponSparkTwin(classic) {
  const u = classic.uniforms;
  const scale = reference('value', 'float', u.uScale);
  const colA = reference('value', 'color', u.uColA); const colB = reference('value', 'color', u.uColB);
  const center = attribute('instancePosition', 'vec3');
  const life = attribute('aLife', 'float');
  const mv = modelViewMatrix.mul(vec4(center, 1));
  const sizePixels = clamp(attribute('aSize', 'float').mul(scale).div(max(0.05, mv.z.negate())), 1.5, 9).mul(step(0.001, life));
  const vLife = varying(life, 'v_sparkLife');
  const shade = Fn(() => {
    const d = pointCoord().sub(0.5);
    const r = length(d).toVar();
    r.greaterThan(0.5).discard();
    const core = smoothstep(0.5, 0, r).toVar();
    const a = core.mul(core).mul(vLife);
    return vec4(mix(colB, colA, core).mul(a), a);
  });
  const m = new NodeMaterial();
  m.vertexNode = pointSpriteClip(center, sizePixels);
  m.fragmentNode = shade();
  m.isPointSpriteTwin = true;
  return m;
}

