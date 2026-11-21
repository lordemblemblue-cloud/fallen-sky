// TSL versions of the Verdant Wilds forest shader patches (forestBiomeRuntime.js, Game3DForestLongGrass.js,
// forestBiomeWildlife.js), for WebGPURenderer. Each mirrors its GLSL line for line.
import { NodeMaterial } from 'three/webgpu';
import {
  Fn, If, attribute, uv, vec2, vec3, vec4, float, sin, exp, pow, length, fract, max, mix, clamp, smoothstep,
  normalize, cameraPosition, positionWorld, positionGeometry, positionLocal, modelWorldMatrix, diffuseColor,
  materialRoughness,
} from 'three/tsl';
import {
  attachNodes, uniformOf, instanceRootWorld, offsetBeforeInstancing,
} from '../../../lib/webgpuNodeKit.js';

// a colour change after vertex colours (GLSL right after #include <color_fragment>)
function colorStageSetup(transform) {
  return (nodeMaterial) => {
    const setupDiffuseColor = nodeMaterial.setupDiffuseColor;
    nodeMaterial.setupDiffuseColor = function forestColorStage(builder) {
      setupDiffuseColor.call(this, builder);
      diffuseColor.rgb.assign(transform(diffuseColor.rgb));
    };
  };
}

/** wetShader(): darker when wet, wet films catch highlights. */
export function attachForestWetNodes(material, uniforms, mode) {
  const wet = uniformOf(uniforms.uForestWetness, 'float');
  const soil = mode === 'soil';
  attachNodes(material, { roughnessNode: mix(materialRoughness, soil ? 0.37 : 0.62, clamp(wet.mul(0.84), 0, 1)) },
    { setup: colorStageSetup((rgb) => rgb.mul(mix(1, soil ? 0.58 : 0.68, wet))) });
}

/** windShader(): gusts, rain weight and (grass) footstep bend, before instancing; wet darkening. */
export function attachForestWindNodes(material, uniforms, mode) {
  const canopy = mode === 'canopy';
  const time = uniformOf(uniforms.uForestTime, 'float'); const gustU = uniformOf(uniforms.uForestGust, 'float');
  const rain = uniformOf(uniforms.uForestRain, 'float'); const wind = uniformOf(uniforms.uForestWind, 'vec2');
  const player = uniformOf(uniforms.uForestPlayer, 'vec2'); const wet = uniformOf(uniforms.uForestWetness, 'float');
  const p = positionGeometry;
  const bend = clamp(attribute('aFlex', 'float'), 0, 1);
  const gust = sin(time.mul(1.8).add(p.x.mul(0.33)).add(p.z.mul(0.47))).mul(0.62)
    .add(sin(time.mul(2.93).sub(p.x.mul(0.21)).add(p.z.mul(0.39))).mul(0.38));
  const amplitude = gustU.mul(bend).mul(canopy ? 0.15 : 0.39);
  let xz = normalize(wind.add(vec2(0.0001))).mul(gust.mul(0.48).add(0.52)).mul(amplitude);
  let y = rain.mul(bend).mul(canopy ? 0.042 : 0.16).negate();
  if (!canopy) {
    const difference = p.xz.sub(player);
    const proximity = smoothstep(0.15, 1.5, length(difference)).oneMinus();
    xz = xz.add(normalize(difference.add(vec2(0.0001))).mul(proximity).mul(bend).mul(0.16));
    y = y.sub(proximity.mul(bend).mul(0.1));
  }
  attachNodes(material, { positionNode: offsetBeforeInstancing(vec3(xz.x, y, xz.y)) },
    { setup: colorStageSetup((rgb) => rgb.mul(mix(1, canopy ? 0.77 : 0.66, clamp(wet.mul(0.7).add(rain.mul(0.3)), 0, 1)))) });
}

/** The stream / puddle water ShaderMaterial as a node twin. */
export function createForestWaterTwin(classic) {
  const u = classic.uniforms;
  const U = (name, type) => uniformOf(u[name], type);
  const time = U('uForestTime', 'float'); const rain = U('uForestRain', 'float'); const wetness = U('uForestWetness', 'float');
  const mud = U('uForestMud', 'float'); const night = U('uForestNight', 'float');
  const wind = U('uForestWind', 'vec2'); const fogNearFar = U('uForestFogNearFar', 'vec2');
  const skyColor = U('uForestSkyColor', 'color'); const fogColor = U('uForestFogColor', 'color');
  const footstep = U('uForestFootstep', 'vec4');
  const m = new NodeMaterial();
  // vertex: a small swell from the world position, applied in the object's own space (GLSL p.y before instancing)
  const w = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  m.positionNode = offsetBeforeInstancing(vec3(0, sin(w.x.mul(1.4).add(w.z.mul(0.72)).sub(time.mul(1.62))).mul(0.021)
    .add(sin(w.z.mul(2).sub(w.x.mul(0.6)).add(time.mul(2.33))).mul(0.014)), 0));
  m.fragmentNode = Fn(() => {
    const world = positionWorld.toVar();
    const vUV = uv();
    const p = world.xz.add(wind.mul(time).mul(0.36)).toVar();
    const ripple = sin(p.x.mul(1.85).add(p.y.mul(0.74)).sub(time.mul(1.8))).mul(0.4)
      .add(sin(p.y.mul(3.2).sub(p.x.mul(1.08)).add(time.mul(2.4))).mul(0.3))
      .add(sin(p.x.mul(2).add(p.y.mul(2.25)).add(time.mul(1.1))).mul(0.3)).toVar();
    const water = mix(vec3(0.065, 0.27, 0.27), vec3(0.18, 0.46, 0.40), ripple.mul(0.45).add(0.55)).toVar();
    const muddy = mix(vec3(0.20, 0.13, 0.078), vec3(0.40, 0.25, 0.13), ripple.mul(0.45).add(0.55));
    water.assign(mix(water, muddy, mix(clamp(wetness.mul(0.52), 0, 0.58), 1, mud)));
    const view = normalize(cameraPosition.sub(world));
    const fresnel = pow(float(1).sub(clamp(view.y, 0, 1)), 2.8);
    const clouds = sin(world.x.mul(0.016).add(world.z.mul(0.011)).add(time.mul(0.08))).mul(0.5).add(0.5);
    const sky = mix(skyColor.mul(0.79), skyColor.mul(1.18), clouds);
    water.assign(mix(water, sky, fresnel.mul(0.55).add(0.20).mul(float(1).sub(mud.mul(0.44)))));
    const bankMud = smoothstep(0.73, 0.99, length(vUV.sub(0.5).mul(2)));
    const bankStream = smoothstep(0.79, 0.99, vUV.x.mul(2).sub(1).abs());
    const isMud = mud.greaterThan(0.5);
    const bank = isMud.select(bankMud, bankStream);
    const edgeWaves = sin(world.x.mul(2.1).add(world.z.mul(0.83)).sub(time.mul(2.5))).mul(0.045).add(0.06);
    water.assign(mix(water, isMud.select(vec3(0.48, 0.35, 0.20), vec3(0.64, 0.77, 0.73)), bank.mul(edgeWaves)));
    const drops = rain.mul(pow(max(0, sin(length(fract(p.mul(1.8)).sub(0.5)).mul(42).sub(time.mul(27)))), 6));
    water.addAssign(drops.mul(0.15).add(max(0, ripple).mul(0.09)));
    const since = time.sub(footstep.z).toVar();
    If(since.greaterThanEqual(0).and(since.lessThan(1.8)), () => {
      const d = length(world.xz.sub(footstep.xy));
      const ring = sin(d.mul(16).sub(since.mul(15))).mul(exp(d.mul(-2.6))).mul(exp(since.mul(-2)));
      water.addAssign(vec3(0.17, 0.20, 0.19).mul(ring).mul(footstep.w));
    });
    water.mulAssign(mix(1, 0.42, night));
    const mist = smoothstep(fogNearFar.x, fogNearFar.y, length(cameraPosition.sub(world)));
    water.assign(mix(water, fogColor, mist));
    return vec4(water, float(1).sub(mud.mul(0.2)));
  })();
  return m;
}

/** Owner 2 m grass tiles: tip sway + footstep bend from the tile root, before instancing. */
export function attachForestTileGrassNodes(material, { time, wind, gust, player }) {
  const root = instanceRootWorld().xz;
  const tip = smoothstep(0.05, 1.05, positionGeometry.y);
  const swing = sin(uniformOf(time, 'float').mul(1.5).add(root.x.mul(0.11)).add(root.y.mul(0.15)));
  const away = root.sub(uniformOf(player, 'vec2'));
  const stepBend = smoothstep(0.3, 1.9, length(away)).oneMinus();
  const push = normalize(uniformOf(wind, 'vec2').add(vec2(0.001))).mul(swing.mul(uniformOf(gust, 'float').mul(0.15).add(0.03)))
    .add(normalize(away.add(vec2(0.001))).mul(stepBend).mul(0.1)).mul(tip);
  attachNodes(material, { positionNode: offsetBeforeInstancing(vec3(push.x, 0, push.y)) });
}

/** Deer / boar gait: alternating lower legs (aFlex > .5), before instancing. */
export function attachForestAnimalGaitNodes(material, gaitUniform) {
  const flex = attribute('aFlex', 'float');
  const p = positionGeometry;
  const ankle = smoothstep(0.14, 1.2, p.y).oneMinus();
  const phaseWave = sin(uniformOf(gaitUniform, 'float').mul(5.1).add(flex.mul(1.570796)).add(p.x.mul(0.6)));
  const on = flex.greaterThan(0.5).select(float(1), float(0));
  attachNodes(material, { positionNode: offsetBeforeInstancing(vec3(0, max(0, phaseWave).mul(ankle).mul(0.055).mul(on),
    phaseWave.mul(ankle).mul(0.1).mul(on))) });
}
