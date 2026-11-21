// TSL version of the baked plant-card patch in WolfveilPlantCards.js, for WebGPURenderer.
//  - colour / normal map read through the instance's atlas cell (aCell: uv * zw + xy);
//  - world-space sway: roots stay, tips lean downwind and lay over as a gust front passes, scaled by card height;
//  - card lighting: normal map applied in a tangent frame built from the true card face (screen derivatives,
//    turned toward the viewer), then blended halfway to the soft up-biased vertex normal.
import {
  Fn, attribute, uv, vec2, vec3, vec4, float, sin, normalize, length, cross, dot, max, select, inverseSqrt, mix,
  texture, dFdx, dFdy, positionView, positionLocal, positionGeometry, normalView, faceDirection, materialColor,
  materialReference, modelWorldMatrixInverse,
} from 'three/tsl';
import { liveWindSheetNode } from '../render/liveWindNodes.mjs';
import { uniformOf, instanceMatrix, instanceRootWorld } from '../../../lib/webgpuNodeKit.js';

export function createWolfveilPlantCardNodes(uniforms) {
  const cellUv = uv().mul(attribute('aCell', 'vec4').zw).add(attribute('aCell', 'vec4').xy);

  // sway, in world space (GLSL adds it to modelMatrix * instanceMatrix * position)
  const t = uniformOf(uniforms.uPlantTime, 'float');
  const gust = uniformOf(uniforms.uPlantGust, 'float');
  const sheet = uniformOf(uniforms.uPlantSheet, 'vec2');
  const size = length(instanceMatrix().element(1).xyz);
  const root = instanceRootWorld().toVar();
  const flex = positionGeometry.y.mul(positionGeometry.y);
  const wd = normalize(uniformOf(uniforms.uPlantWind, 'vec2').add(vec2(0.0001))).toVar();
  const front = liveWindSheetNode(root.xz, wd, sheet.x).mul(sheet.y.mul(0.65).add(0.35)).toVar();
  const sway = sin(t.mul(1.9).add(root.x.mul(0.21)).add(root.z.mul(0.17))).mul(0.6)
    .add(sin(t.mul(3.3).add(root.z.mul(0.31)).sub(root.x.mul(0.11))).mul(0.4));
  const lean = wd.mul(sway.mul(gust.mul(0.05).add(0.035)).add(front.mul(gust.mul(0.07).add(0.09)))).mul(flex).mul(size);
  const worldOffset = vec3(lean.x, front.mul(-0.03).mul(flex).mul(size), lean.y);
  const positionNode = positionLocal.add(modelWorldMatrixInverse.mul(vec4(worldOffset, 0)).xyz);

  // the atlas cell for the colour map (getUV context: replaces uv() for every material texture lookup)
  const colorNode = materialColor.context({ getUV: () => cellUv });

  const normalNode = Fn((builder) => {
    const p = positionView;
    const cardN = normalize(cross(dFdx(p), dFdy(p))).toVar();
    cardN.assign(select(dot(cardN, p.negate()).lessThan(0), cardN.negate(), cardN));
    const n = cardN.toVar();
    if (builder.material?.normalMap) {
      // three's getTangentFrame(eye_pos, surf_norm = card face, uv = atlas cell)
      const st = cellUv.toVar();
      const q0 = dFdx(p); const q1 = dFdy(p); const st0 = dFdx(st); const st1 = dFdy(st);
      const q1perp = cross(q1, cardN); const q0perp = cross(cardN, q0);
      const T = q1perp.mul(st0.x).add(q0perp.mul(st1.x)).toVar();
      const B = q1perp.mul(st0.y).add(q0perp.mul(st1.y)).toVar();
      const det = max(dot(T, T), dot(B, B));
      const scale = select(det.equal(0), float(0), inverseSqrt(det));
      const mapN = texture(builder.material.normalMap, st).xyz.mul(2).sub(1).toVar();
      mapN.assign(vec3(mapN.xy.mul(materialReference('normalScale', 'vec2')), mapN.z));
      n.assign(normalize(T.mul(scale).mul(mapN.x).add(B.mul(scale).mul(mapN.y)).add(cardN.mul(mapN.z))));
    }
    const blended = normalize(mix(n, normalize(normalView), 0.5));
    return blended.mul(faceDirection); // three flips back faces again: cancel it, as the GLSL never flips
  })();

  return { positionNode, colorNode, normalNode };
}
