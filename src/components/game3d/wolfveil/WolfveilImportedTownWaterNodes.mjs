// TSL twin of the canal / pond water ShaderMaterial in WolfveilImportedTownWater.mjs, for WebGPURenderer.
// The same fragment maths: flow-aligned fbm ripples (still / canal / waterfall), Fresnel sky, caustics, current
// ribbons, foam and sun glint. Tone mapping / sRGB come from the renderer output, as the GLSL's includes.
import { NodeMaterial } from 'three/webgpu';
import {
  Fn, attribute, positionWorld, cameraPosition, vec2, vec3, vec4, float, fract, sin, dot, floor, mix, normalize,
  step, length, select, pow, clamp, max, smoothstep, reflect,
} from 'three/tsl';
import { uniformOf } from '../../../lib/webgpuNodeKit.js';

const townHash = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123)));
const townNoise = Fn(([p]) => {
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  return mix(mix(townHash(i), townHash(i.add(vec2(1, 0))), f.x),
    mix(townHash(i.add(vec2(0, 1))), townHash(i.add(vec2(1, 1))), f.x), f.y);
});
const townFbm = Fn(([p]) => townNoise(p).mul(0.55)
  .add(townNoise(p.mul(2.13).add(vec2(4.1, -2.7))).mul(0.30))
  .add(townNoise(p.mul(4.41)).mul(0.15)));

export function createWolfveilTownWaterTwin(classic) {
  const time = uniformOf(classic.uniforms.uTownTime, 'float');
  const isFoam = uniformOf(classic.uniforms.uIsFoam, 'float');

  const shade = Fn(() => {
    const flow = attribute('townFlow', 'vec3').toVar();
    const world = positionWorld.toVar();
    const dir = flow.xz.toVar();
    const isFall = step(0.5, flow.y.negate()).toVar();
    const isMoving = step(0.5, length(dir)).toVar();
    const flowDir = select(isMoving.greaterThan(0.5), normalize(dir), vec2(0.7, 0.7)).toVar();
    const across = vec2(flowDir.y.negate(), flowDir.x);

    const uvStill = world.xz.mul(0.42).add(vec2(time.mul(0.09), time.mul(-0.07)));
    const uvCanal = vec2(dot(world.xz, across).mul(0.85), dot(world.xz, flowDir).mul(0.30).sub(time.mul(0.95)));
    const uvFall = vec2(world.x.add(world.z).mul(1.15), world.y.mul(0.55).add(time.mul(3.1)));
    const q = mix(mix(uvStill, uvCanal, isMoving), uvFall, isFall).toVar();

    const hA = townFbm(q).toVar();
    const hB = townFbm(q.mul(2.35).add(vec2(2.7, time.mul(0.32)))).toVar();
    const eps = 0.09;
    const hx = townFbm(q.add(vec2(eps, 0))).sub(hA);
    const hz = townFbm(q.add(vec2(0, eps))).sub(hA);
    const normal = normalize(vec3(hx.mul(-2.4), 1, hz.mul(-2.4))).toVar();

    const viewDir = normalize(cameraPosition.sub(world)).toVar();
    const fresnel = float(0.06).add(pow(float(1).sub(clamp(dot(normal, viewDir), 0, 1)), 4).mul(0.94)).toVar();

    // Sumi-e mineral jade-indigo depth + sunlit caustic web
    const col = mix(vec3(0.055, 0.20, 0.31), vec3(0.16, 0.48, 0.56), hA.mul(0.48).add(0.35)).toVar();
    col.assign(mix(col, vec3(0.58, 0.79, 0.90), clamp(fresnel.mul(0.62), 0, 0.68)));
    const caustic = smoothstep(0.58, 0.90, hA.mul(0.52).add(hB.mul(0.58)));
    col.addAssign(vec3(0.24, 0.52, 0.58).mul(caustic).mul(float(1).sub(isFall)).mul(0.36));

    // brush-ink current ribbons & cascade spray
    const ribbon = smoothstep(0.68, 0.95, hA.mul(0.60).add(hB.mul(0.48))).toVar();
    col.assign(mix(col, vec3(0.90, 0.96, 0.99), clamp(ribbon.mul(isFall.mul(0.50).add(0.34)).add(isFoam.mul(0.65)), 0, 0.92)));

    // specular sun glint
    const sunDir = normalize(vec3(0.42, 0.84, 0.34));
    const spec = pow(max(dot(reflect(sunDir.negate(), normal), viewDir), 0), 72);
    col.addAssign(vec3(1.0, 0.96, 0.86).mul(spec).mul(0.42));

    const alpha = clamp(float(0.76).add(fresnel.mul(0.16)).add(ribbon.mul(0.12)).add(isFall.mul(0.14)).add(isFoam.mul(0.18)), 0.72, 0.96);
    return vec4(col, alpha);
  });

  const m = new NodeMaterial();
  m.fragmentNode = shade();
  return m;
}
