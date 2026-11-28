import { Color, FrontSide } from 'three';

// The TSL nodes the WebGPU watercolor material needs; sapphireWorld.js falls back to WebGL2 when one is missing.
export const WATERCOLOR_TSL_NODES = Object.freeze(['uniform', 'vec4', 'texture', 'positionWorld', 'normalWorld', 'normalLocal', 'modelNormalMatrix', 'varying']);

/**
 * The world-space normal the painterly tone reads.
 * three r171 builds `normalWorld` as a varying of `normalView`, so the vertex shader computes it, and for a
 * flat-shaded material `normalView` is the face normal from screen derivatives (dpdx/dpdy), which only fragment
 * shaders have. The vertex shader then fails to compile, the pipeline is invalid and WebGPU rejects every frame that
 * draws it (the arena's bedrock and crystals, 2026-11-28). A faceted material takes the mesh's own normal instead, as
 * the WebGL version of this shader does (vWNorm); three's lighting still uses the flat normal.
 */
export function watercolorWorldNormal(TSL, faceted) {
  const { normalize, normalWorld, varying, modelNormalMatrix, normalLocal } = TSL;
  if (!faceted) return normalize(normalWorld);
  return normalize(varying(modelNormalMatrix.mul(normalLocal), 'v_watercolorNormalWorld'));
}

// WebGPU: the watercolor ("sumi") look as a MeshStandardNodeMaterial with a TSL colour node, built from the WebGL
// material `mat`; `u` holds the shared TSL uniforms (uInk, uSat, uDiff, uReal, uEdge, uHigh, uGran).
export function createWatercolorNodeMaterial(WGPU, TSL, mat, opts, u) {
  const { color, vec3, vec4, float, positionWorld, cameraPosition, mix, smoothstep, dot, abs, sin, cos, fract, clamp, normalize, texture } = TSL;
  const nm = new WGPU.MeshStandardNodeMaterial({
    color: mat.color, map: mat.map || null, normalMap: mat.normalMap || null, roughnessMap: mat.roughnessMap || null,
    aoMap: mat.aoMap || null, aoMapIntensity: mat.aoMapIntensity ?? 0.65,
    emissive: mat.emissive || new Color(0x000000), emissiveMap: mat.emissiveMap || null, emissiveIntensity: mat.emissiveIntensity || 0,
    alphaMap: mat.alphaMap || null, depthWrite: mat.depthWrite, alphaTest: mat.alphaTest || 0,
    transparent: mat.transparent || false, opacity: mat.opacity ?? 1, roughness: mat.roughness ?? 0.85, metalness: mat.metalness ?? 0,
    envMapIntensity: mat.envMapIntensity ?? 1, side: mat.side ?? FrontSide, polygonOffset: mat.polygonOffset || false, polygonOffsetFactor: mat.polygonOffsetFactor || 0,
    polygonOffsetUnits: mat.polygonOffsetUnits || 0, flatShading: Boolean(opts.faceted)
  });
  const cRec = color(opts.recess || '#10182B'), cMid = color(opts.mid || '#2859B8'), cHi = color(opts.high || '#DBE1E8');
  const wp = positionWorld, wn = watercolorWorldNormal(TSL, Boolean(opts.faceted));
  const large = sin(wp.x.mul(0.24).add(cos(wp.z.mul(0.22)))).mul(0.25).add(cos(wp.y.mul(0.28).sub(wp.x.mul(0.18))).mul(0.25)).add(0.5);
  const pool = sin(wp.x.mul(1.3).add(large.mul(2.4))).mul(cos(wp.z.mul(1.3).sub(wp.y.mul(0.9)))).mul(0.5).add(0.5);
  const brush = sin(wp.x.mul(5.2).add(wp.y.mul(1.5)).add(large.mul(3.0))).mul(0.5).add(0.5);
  const fine = fract(sin(dot(wp.mul(14.0), vec3(91.7, 23.1, 57.3))).mul(19341.2));
  const ndl = clamp(dot(wn, normalize(vec3(0.55, 0.75, 0.38))).mul(0.5).add(0.5), 0.0, 1.0);
  const up = clamp(wn.y.mul(0.5).add(0.5), 0.0, 1.0);
  const baseCol = mat.map ? texture(mat.map).rgb.mul(color(mat.color)) : color(mat.color);
  const baseLuma = dot(baseCol, vec3(0.299, 0.587, 0.114));
  const tone = clamp(baseLuma.mul(0.42).add(up.mul(0.30)).add(ndl.mul(0.28)).add(large.sub(0.5).mul(0.26).mul(u.uDiff)).add(brush.sub(0.5).mul(0.12).mul(u.uDiff)), 0.0, 1.0);
  let ramp = mix(cRec, cMid, smoothstep(0.08, 0.54, tone));
  ramp = mix(ramp, cHi, smoothstep(0.48, 0.94, tone).mul(float(0.55).add(u.uHigh.mul(0.65))));
  const recMask = float(1.0).sub(smoothstep(0.06, 0.50, tone)).mul(u.uInk);
  const poolEdge = smoothstep(0.42, 0.52, pool).mul(float(1.0).sub(smoothstep(0.52, 0.64, pool)));
  ramp = mix(ramp, cRec.mul(0.62), clamp(recMask.mul(0.65).add(poolEdge.mul(0.24).mul(u.uDiff)), 0.0, 0.82));
  ramp = ramp.mul(float(1.0).add(fine.sub(0.5).mul(0.18).mul(u.uGran)));
  const fres = float(1.0).sub(abs(dot(wn, normalize(cameraPosition.sub(wp)))));
  ramp = mix(ramp, cRec.mul(0.55), smoothstep(0.56, 0.94, fres).mul(smoothstep(0.28, 0.8, brush)).mul(u.uEdge).mul(0.7));
  ramp = mix(ramp, cHi, smoothstep(0.54, 0.92, fres).mul(smoothstep(0.45, 0.92, ndl)).mul(u.uHigh).mul(0.42));
  const blended = mix(ramp, baseCol, clamp(u.uReal.mul(0.78), 0.12, 0.86));
  const pigmentRGB = mix(vec3(dot(blended, vec3(0.299, 0.587, 0.114))), blended, float(0.58).add(u.uSat.mul(0.82)));
  nm.colorNode = vec4(pigmentRGB, mat.map ? texture(mat.map).a : float(1.0));
  return nm;
}
