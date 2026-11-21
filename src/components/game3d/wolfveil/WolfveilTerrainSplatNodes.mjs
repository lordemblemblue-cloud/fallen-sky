// TSL version of the splat terrain patch in WolfveilTerrainSplat.js, for WebGPURenderer (either backend).
// Same layers, scales, anti-tiling, triplanar rock, macro normal / cavity / AO / flow / scree maps, height blend,
// meadow tone, roughness, AO and normal as the GLSL. Differences, both invisible in practice:
//  - layers are still skipped when their weight is ~0, but sampled with explicit gradients (`grad`), because WGSL
//    forbids implicit-derivative sampling inside branches that depend on per-pixel values;
//  - the macro AO is applied as three's aoNode, which also dims indirect specular a little (terrain roughness ~0.9).
// Uniforms sit in the shared render group; textures keep their default group (r171 declares no sampler for a
// texture in a shared group) and the material bumps nodeVersion when one is swapped (webgpuThreeFixes.js).
import {
  Fn, If, attribute, positionWorld, cameraPosition, cameraViewMatrix, texture, vec2, vec3, vec4, float,
  max, min, mix, smoothstep, clamp, normalize, sqrt, dot, abs, pow, sign, length, step, dFdx, dFdy, property,
  materialColor,
} from 'three/tsl';
import { uniformOf, sinValueNoise2, geometryNormalWorld } from '../../../lib/webgpuNodeKit.js';

// a texture uniform `{ value }` as a shared texture node that follows its value (placeholder -> loaded texture)
const liveTexture = (u) => texture(u.value).onRenderUpdate(() => u.value);

export function createWolfveilSplatNodes(uniforms) {
  const tA = [0, 1, 2, 3].map((i) => liveTexture(uniforms['tSplatA' + i]));
  const tN = [0, 1, 2, 3].map((i) => liveTexture(uniforms['tSplatN' + i]));
  const tMacroN = liveTexture(uniforms.tMacroN);
  const tMacroM = liveTexture(uniforms.tMacroM);
  const scale = uniformOf(uniforms.uSplatScale, 'vec4');
  const rough = uniformOf(uniforms.uSplatRough, 'vec4');
  const macroRect = uniformOf(uniforms.uMacroRect, 'vec4');
  const macroOn = uniformOf(uniforms.uMacroOn, 'float');
  const macroFade = uniformOf(uniforms.uMacroFade, 'float');
  const rockMean = uniformOf(uniforms.uRockMean, 'vec3');

  const outNormalWorld = property('vec3', 'wvSplatNormalWorld');
  const outRoughness = property('float', 'wvSplatRoughness');
  const outAO = property('float', 'wvSplatMacroAO');

  const surface = Fn(() => {
    const world = positionWorld.toVar();
    const xz = world.xz.toVar();
    // gradients for every lookup, taken here in uniform control flow
    const dX = dFdx(world).toVar();
    const dY = dFdy(world).toVar();
    const nV = normalize(geometryNormalWorld).toVar();
    const nW = nV.toVar();

    const mIn = float(0).toVar(); const mAO = float(1).toVar(); const mFlow = float(0).toVar();
    const mDepo = float(0).toVar(); const mCav = float(0).toVar();
    If(macroOn.greaterThan(0.5), () => {
      const muv = xz.sub(macroRect.xy).mul(macroRect.zw).toVar();
      const edge = min(muv, vec2(1).sub(muv)).div(macroRect.zw);
      mIn.assign(smoothstep(0, macroFade, min(edge.x, edge.y)));
      const gx = dX.xz.mul(macroRect.zw); const gy = dY.xz.mul(macroRect.zw);
      const mn = tMacroN.uv(muv).grad(gx, gy).toVar();
      const mm = tMacroM.uv(muv).grad(gx, gy).toVar();
      If(mIn.greaterThan(0), () => {
        const nxz = mn.rg.mul(2).sub(1).toVar();
        const mN = vec3(nxz.x, sqrt(max(0.0001, float(1).sub(dot(nxz, nxz)))), nxz.y);
        nW.assign(normalize(mix(nV, mN, mIn)));
        mAO.assign(mix(1, mm.r, mIn));
        mFlow.assign(mm.g.mul(mIn));
        mDepo.assign(mm.b.mul(mIn));
        mCav.assign(mn.b.sub(0.5).mul(2).mul(mIn));
      });
    });

    const macro = sinValueNoise2(xz.mul(0.045)).mul(0.65).add(sinValueNoise2(xz.mul(0.17)).mul(0.35)).toVar();
    const w = max(attribute('aSplat', 'vec4'), vec4(0)).toVar();
    w.divAssign(max(0.0001, w.x.add(w.y).add(w.z).add(w.w)));
    If(mIn.greaterThan(0), () => {
      const mt = smoothstep(0.04, 0.3, w.z.add(w.w));
      const rV = smoothstep(0.1, 0.3, float(1).sub(nV.y));
      const rP = smoothstep(0.1, 0.3, float(1).sub(nW.y));
      const dR = rP.sub(rV).mul(mt).add(max(mCav, 0).mul(0.3).mul(mt)).toVar();
      w.z.assign(clamp(w.z.add(dR), 0, 1));
      w.x.assign(max(0, w.x.sub(max(dR, 0))));
      w.w.assign(clamp(w.w.mul(float(1).sub(smoothstep(0.2, 0.42, float(1).sub(nW.y)).mul(0.8)))
        .mul(mFlow.mul(0.7).add(1)).mul(float(1).sub(max(mCav, 0).mul(0.6))), 0, 1));
      w.y.addAssign(mFlow.mul(0.5).add(mDepo.mul(0.8)).mul(mt));
      w.divAssign(max(0.0001, w.x.add(w.y).add(w.z).add(w.w)));
    });

    // Planar (XZ) layer: two scales cross-faded by the macro noise (anti-tiling); whiteout normal blend.
    const planar = (ta, tn, s, outA, outN, outH) => {
      const uvA = xz.mul(s);
      const uvB = xz.mul(s).mul(0.37).add(vec2(0.31, 0.67));
      const gAx = dX.xz.mul(s); const gAy = dY.xz.mul(s);
      const gBx = gAx.mul(0.37); const gBy = gAy.mul(0.37);
      const nA = tn.uv(uvA).grad(gAx, gAy); const nB = tn.uv(uvB).grad(gBx, gBy);
      const k = clamp(macro.mul(0.5).add(0.25), 0, 1);
      outA.assign(mix(ta.uv(uvA).grad(gAx, gAy).rgb, ta.uv(uvB).grad(gBx, gBy).rgb, k));
      const n = mix(nA, nB, k).toVar();
      const t3 = n.xyz.mul(2).sub(1).toVar();
      const b = vec3(t3.xy.add(nW.xz), abs(t3.z).mul(nW.y));
      outN.assign(normalize(b.xzy));
      outH.assign(n.a);
    };
    // Triplanar rock: never stretched on steep faces; the bedding wanders a few metres.
    const triplanarAt = (ta, tn, s, outA, outN, outH) => {
      const wt = pow(abs(nW), vec3(4)).toVar();
      wt.divAssign(wt.x.add(wt.y).add(wt.z));
      const p = world.mul(s).toVar();
      p.y.addAssign(macro.sub(0.5).mul(2.5).add(sinValueNoise2(xz.mul(0.011)).sub(0.5).mul(5)).mul(s));
      const sg = sign(nW.add(vec3(1e-4))).toVar();
      const uvX = vec2(p.z.mul(sg.x), p.y); const uvY = vec2(p.x, p.z.mul(sg.y)); const uvZ = vec2(p.x.negate().mul(sg.z), p.y);
      const px = dX.mul(s); const py = dY.mul(s);
      const gX = [vec2(px.z.mul(sg.x), px.y), vec2(py.z.mul(sg.x), py.y)];
      const gY = [vec2(px.x, px.z.mul(sg.y)), vec2(py.x, py.z.mul(sg.y))];
      const gZ = [vec2(px.x.negate().mul(sg.z), px.y), vec2(py.x.negate().mul(sg.z), py.y)];
      const nX = tn.uv(uvX).grad(...gX).toVar(); const nY = tn.uv(uvY).grad(...gY).toVar(); const nZ = tn.uv(uvZ).grad(...gZ).toVar();
      outA.assign(ta.uv(uvX).grad(...gX).rgb.mul(wt.x).add(ta.uv(uvY).grad(...gY).rgb.mul(wt.y)).add(ta.uv(uvZ).grad(...gZ).rgb.mul(wt.z)));
      const tX = nX.xyz.mul(2).sub(1).toVar(); const tY = nY.xyz.mul(2).sub(1).toVar(); const tZ = nZ.xyz.mul(2).sub(1).toVar();
      tX.x.mulAssign(sg.x); tZ.x.mulAssign(sg.z.negate());
      const bX = vec3(tX.xy.add(nW.zy), abs(tX.z).mul(nW.x));
      const bY = vec3(tY.xy.add(nW.xz), abs(tY.z).mul(nW.y));
      const bZ = vec3(tZ.xy.add(nW.xy), abs(tZ.z).mul(nW.z));
      outN.assign(normalize(bX.zyx.mul(wt.x).add(bY.xzy.mul(wt.y)).add(bZ.xyz.mul(wt.z))));
      outH.assign(nX.a.mul(wt.x).add(nY.a.mul(wt.y)).add(nZ.a.mul(wt.z)));
    };
    // Near: fine strata. Far: 3.4x larger bands; distant cliffs relax toward the mean.
    const triplanar = (ta, tn, s, outA, outN, outH) => {
      const dist = length(cameraPosition.sub(world)).toVar();
      const far = smoothstep(80, 200, dist).toVar();
      const aN = vec3(0).toVar(); const nN = nW.toVar(); const hN = float(0).toVar();
      const aF = vec3(0).toVar(); const nF = nW.toVar(); const hF = float(0).toVar();
      If(far.lessThan(0.999), () => { triplanarAt(ta, tn, s, aN, nN, hN); });
      If(far.greaterThan(0.001), () => { triplanarAt(ta, tn, s.mul(0.29), aF, nF, hF); });
      const veil = smoothstep(140, 420, dist).toVar();
      outA.assign(mix(mix(aN, aF, far), rockMean.mul(macro.mul(0.28).add(0.86)), veil.mul(0.55)));
      outN.assign(normalize(mix(mix(nN, nF, far), nW, veil.mul(0.6))));
      outH.assign(mix(hN, hF, far));
    };

    const a0 = vec3(0).toVar(); const a1 = vec3(0).toVar(); const a2 = vec3(0).toVar(); const a3 = vec3(0).toVar();
    const n0 = nW.toVar(); const n1 = nW.toVar(); const n2 = nW.toVar(); const n3 = nW.toVar();
    const h0 = float(0).toVar(); const h1 = float(0).toVar(); const h2 = float(0).toVar(); const h3 = float(0).toVar();
    If(w.x.greaterThan(0.004), () => { planar(tA[0], tN[0], scale.x, a0, n0, h0); });
    If(w.y.greaterThan(0.004), () => { planar(tA[1], tN[1], scale.y, a1, n1, h1); });
    If(w.z.greaterThan(0.004), () => { triplanar(tA[2], tN[2], scale.z, a2, n2, h2); });
    If(w.w.greaterThan(0.004), () => { planar(tA[3], tN[3], scale.w, a3, n3, h3); });
    // Height-based blending: rock and stones poke through grass naturally.
    const hw = w.add(vec4(h0, h1, h2, h3).mul(0.55)).toVar();
    const top = max(max(hw.x, hw.y), max(hw.z, hw.w)).sub(0.22);
    const b = max(hw.sub(top), vec4(0)).mul(step(vec4(0.004), w)).toVar();
    b.divAssign(max(0.0001, b.x.add(b.y).add(b.z).add(b.w)));
    const albedo = a0.mul(b.x).add(a1.mul(b.y)).add(a2.mul(b.z)).add(a3.mul(b.w)).toVar();
    // Meadow life at a distance; ridges catch light, creases and damp gullies darken, valleys get sky AO.
    const mv = sinValueNoise2(xz.mul(0.021).add(7.3)).mul(0.6).add(sinValueNoise2(xz.mul(0.067).sub(2.1)).mul(0.4));
    const meadowTone = mix(vec3(0.76, 0.92, 0.72), vec3(1.28, 1.13, 0.7), smoothstep(0.3, 0.75, mv));
    albedo.mulAssign(mix(vec3(1), meadowTone, b.x.mul(0.9)));
    albedo.mulAssign(clamp(mCav.mul(0.35).add(1), 0.6, 1.3).mul(float(1).sub(mFlow.mul(0.18).mul(b.y.add(b.z)))).mul(mix(1, mAO, 0.35)));
    outNormalWorld.assign(normalize(n0.mul(b.x).add(n1.mul(b.y)).add(n2.mul(b.z)).add(n3.mul(b.w))));
    outRoughness.assign(dot(b, rough).sub(mFlow.mul(0.12).mul(b.z)));
    outAO.assign(mAO);
    return albedo;
  });

  // diffuseColor.rgb *= albedo after map_fragment (vertex colours are applied after this, as in the GLSL)
  const colorNode = vec4(materialColor.rgb.mul(surface()), materialColor.a);
  return {
    colorNode,
    roughnessNode: outRoughness,
    // world normal -> view; three applies faceDirection (DoubleSide) as the GLSL does
    normalNode: normalize(cameraViewMatrix.mul(vec4(outNormalWorld, 0)).xyz),
    aoNode: mix(1, outAO.mul(outAO), 0.9),
  };
}
