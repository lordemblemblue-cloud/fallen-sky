// TSL twin of the river water ShaderMaterial in WolfveilSilverRiverMaterial.js, for WebGPURenderer.
// Line-for-line the same fragment maths (flow-map advection, wind ruffle, rain rings, footstep wakes, depth tint,
// bed, dapple, sky Fresnel, lace foam, sun glints, night, underwater, fog). Tone mapping / sRGB come from the
// renderer's output like the GLSL's tonemapping_fragment / colorspace_fragment.
import { NodeMaterial } from 'three/webgpu';
import {
  Fn, If, Loop, attribute, positionWorld, cameraPosition, uv, vec2, vec3, vec4, float, fract, sin, dot, floor, mix,
  normalize, abs, smoothstep, clamp, exp, pow, length, atan2, max, min, step, reflect, uniformArray,
} from 'three/tsl';
import { uniformOf } from '../../../lib/webgpuNodeKit.js';

const RIVER_WIDTH = 19;
const FLOW_PERIOD = 2.6;

const riverHash = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123)));
const riverNoise = Fn(([p]) => {
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  return mix(mix(riverHash(i), riverHash(i.add(vec2(1, 0))), f.x),
    mix(riverHash(i.add(vec2(0, 1))), riverHash(i.add(vec2(1, 1))), f.x), f.y);
});
const riverWaves = Fn(([p]) => riverNoise(p).mul(0.5)
  .add(riverNoise(p.mul(2.13).add(vec2(1.7, 9.2))).mul(0.28))
  .add(riverNoise(p.mul(4.37).add(vec2(8.3, 2.8))).mul(0.14))
  .add(riverNoise(p.mul(8.91).add(vec2(3.1, 7.7))).mul(0.08)));
const riverSlope = Fn(([p]) => {
  const e = float(0.07);
  const h = riverWaves(p).toVar();
  return vec2(riverWaves(p.add(vec2(e, 0))).sub(h), riverWaves(p.add(vec2(0, e))).sub(h)).div(e);
});

export function createWolfveilRiverTwin(classic) {
  const u = classic.uniforms;
  const U = (name, type) => uniformOf(u[name], type);
  const flowTime = U('uFlowTime', 'float'); const rain = U('uRain', 'float'); const wet = U('uWet', 'float');
  const windStrength = U('uWindStrength', 'float'); const night = U('uNight', 'float');
  const sunStrength = U('uSunStrength', 'float'); const contactTime = U('uContactTime', 'float');
  const wind = U('uWind', 'vec2'); const fogNearFar = U('uFogNearFar', 'vec2');
  const sunDirection = U('uSunDirection', 'vec3'); const sunColor = U('uSunColor', 'color');
  const skyTint = U('uSkyTint', 'color'); const fogTint = U('uFogTint', 'color');
  const ripples = uniformArray(u.uContactRipples.value, 'vec4');

  const shade = Fn(() => {
    const world = positionWorld.toVar();
    const bankUv = uv().toVar();
    const flow = attribute('riverFlow', 'vec3').toVar();
    const travel = attribute('riverTravel', 'float').toVar();
    const downstream = normalize(flow.xy.add(vec2(0.00001))).toVar();
    const across = vec2(downstream.y.negate(), downstream.x);
    const bankDist = abs(bankUv.x.mul(2).sub(1)).toVar();
    const depthFactor = float(1).sub(smoothstep(0.22, 0.97, bankDist)).toVar();
    const cascade = clamp(flow.z, 0, 1).toVar();

    const speed = depthFactor.mul(1.35).add(0.45).mul(cascade.mul(1.6).add(1)).toVar();
    const channel = vec2(bankUv.x.sub(0.5).mul(RIVER_WIDTH), travel).mul(0.34).toVar();
    const phaseA = fract(flowTime.div(FLOW_PERIOD)).toVar();
    const phaseB = fract(flowTime.div(FLOW_PERIOD).add(0.5)).toVar();
    const weightA = float(1).sub(abs(phaseA.mul(2).sub(1)));
    const slopeA = riverSlope(channel.sub(vec2(0, phaseA.mul(FLOW_PERIOD).mul(speed).mul(0.34))));
    const slopeB = riverSlope(channel.sub(vec2(0, phaseB.mul(FLOW_PERIOD).mul(speed).mul(0.34))).add(vec2(0.43, 0.71)));
    const slope = mix(slopeB, slopeA, weightA).toVar();
    const windSlope = riverSlope(world.xz.mul(0.85).add(wind.mul(flowTime).mul(0.55)).add(vec2(5.3, 1.9)));
    const roughness = float(1).sub(depthFactor).mul(0.1).add(0.11).add(cascade.mul(0.16));
    const tilt = across.mul(slope.x).add(downstream.mul(slope.y)).mul(roughness)
      .add(windSlope.mul(windStrength.mul(0.09).add(0.035))).toVar();

    If(rain.greaterThan(0.02), () => {
      const cell = floor(world.xz.mul(1.6));
      const seed = riverHash(cell);
      const rAge = fract(flowTime.mul(1.35).add(seed)).toVar();
      const local = fract(world.xz.mul(1.6)).sub(0.5).toVar();
      const ring = exp(pow(length(local).sub(rAge.mul(0.46)).div(0.055), 2).negate()).mul(float(1).sub(rAge)).mul(rain);
      tilt.addAssign(normalize(local.add(vec2(0.001))).mul(ring).mul(0.08));
    });

    const wake = float(0).toVar();
    Loop(4, ({ i }) => {
      const r = ripples.element(i);
      const age = contactTime.sub(r.z).toVar();
      If(age.greaterThanEqual(0).and(age.lessThan(1.6)), () => {
        const fromContact = world.xz.sub(r.xy).toVar();
        const radius = age.mul(2.45).add(0.16);
        const angle = atan2(fromContact.y, fromContact.x);
        const irregular = sin(angle.mul(3).add(age.mul(2))).mul(0.075);
        const width = age.mul(0.08).add(0.08);
        const ring = exp(pow(length(fromContact).sub(radius).sub(irregular).div(width), 2).negate());
        const force = r.w.mul(ring).mul(exp(age.mul(-0.95))).toVar();
        tilt.addAssign(normalize(fromContact.add(vec2(0.0001))).mul(force).mul(0.13));
        wake.addAssign(force);
      });
    });

    const normal = normalize(vec3(tilt.x.negate(), 1, tilt.y.negate())).toVar();
    const viewDir = normalize(cameraPosition.sub(world)).toVar();
    const ndv = clamp(dot(normal, viewDir), 0, 1);
    const fresnel = pow(float(1).sub(ndv), 5).mul(0.98).add(0.02).toVar();

    const body = mix(vec3(0.105, 0.17, 0.12), vec3(0.04, 0.12, 0.12), smoothstep(0, 0.5, depthFactor)).toVar();
    body.assign(mix(body, vec3(0.016, 0.06, 0.075), smoothstep(0.45, 1, depthFactor)));
    const bed = riverNoise(world.xz.mul(0.65)).mul(0.6).add(riverNoise(world.xz.mul(2.4).add(slope.mul(0.15))).mul(0.4));
    body.assign(mix(body, vec3(0.17, 0.15, 0.1).mul(bed.mul(0.55).add(0.65)), float(1).sub(depthFactor).mul(0.42)));
    const dapple = smoothstep(0.55, 0.95, riverWaves(channel.mul(1.9).sub(vec2(0, flowTime.mul(0.6).mul(speed)))));
    body.addAssign(vec3(0.05, 0.07, 0.05).mul(dapple).mul(float(1).sub(depthFactor)).mul(clamp(sunStrength, 0, 1)));

    const reflected = reflect(viewDir.negate(), normal);
    const zenith = mix(vec3(0.16, 0.3, 0.48), skyTint, 0.45);
    const horizon = mix(vec3(0.58, 0.68, 0.76), fogTint, 0.35);
    const sky = mix(horizon, zenith, smoothstep(0, 0.55, reflected.y));
    const color = mix(body, sky, clamp(fresnel.mul(0.92), 0, 1)).toVar();

    const lace = riverWaves(channel.mul(1.6).add(vec2(2.1, flowTime.negate().mul(0.5).mul(speed)))).toVar();
    const bankFoam = smoothstep(0.88, 0.99, bankDist).mul(smoothstep(0.48, 0.78, lace)).mul(rain.mul(0.3).add(0.55));
    const cascadeFoam = cascade.mul(cascade).mul(smoothstep(0.52, 0.84, lace));
    const totalFoam = clamp(bankFoam.mul(0.5).add(cascadeFoam.mul(0.6)).add(wake.mul(0.35)), 0, 0.8).toVar();
    color.assign(mix(color, vec3(0.84, 0.89, 0.91), totalFoam));

    const halfVector = normalize(normalize(sunDirection).add(viewDir));
    const nh = max(dot(normal, halfVector), 0).toVar();
    const specTight = pow(nh, 240).mul(1.4);
    const specBroad = pow(nh, 38).mul(0.1);
    color.addAssign(sunColor.mul(specTight.add(specBroad)).mul(clamp(sunStrength, 0, 1.5)));
    color.assign(mix(color, vec3(0.46, 0.34, 0.24).mul(0.5).add(color.mul(0.5)), wet.mul(0.06)));
    color.assign(mix(color, color.mul(vec3(0.45, 0.61, 0.8)), night.mul(0.72)));

    const alpha = mix(0.5, 0.9, depthFactor).add(fresnel.mul(0.3)).add(totalFoam.mul(0.3)).add(wake.mul(0.04)).toVar();
    alpha.mulAssign(smoothstep(1, 0.92, bankDist));
    alpha.assign(clamp(alpha, 0, 0.95));
    const underwater = float(1).sub(step(0, viewDir.y));
    color.assign(mix(color, vec3(0.04, 0.16, 0.2).add(sunColor.mul(min(sunStrength, 0.8)).mul(0.03)), underwater.mul(0.74)));
    alpha.assign(mix(alpha, 0.1, underwater));

    const fog = smoothstep(fogNearFar.x, fogNearFar.y, length(cameraPosition.sub(world)));
    color.assign(mix(color, fogTint, fog.mul(0.35)));
    alpha.assign(mix(alpha, 0.42, fog.mul(0.18)));
    return vec4(color, alpha);
  });

  const m = new NodeMaterial();
  m.fragmentNode = shade();
  return m;
}
