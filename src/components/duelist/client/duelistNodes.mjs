// TSL twins of the Duelist's ShaderMaterials (arena floor, depot deck overlay + ceiling, crystal sword glow, VFX
// shells / cones / tether ribbons / particles, sword trails, CTF banners), for WebGPURenderer. Line for line the
// same maths as the GLSL beside each material (webgpuMaterialTwins.js draws a twin in its material's place).
// pow(x, 2) of a value that can be negative is written x * x (GLSL leaves pow of a negative base undefined; the
// GPUs these ran on squared it).
import { NodeMaterial } from 'three/webgpu';
import {
  Fn, If, Loop, Break, attribute, reference, uniformArray, uv, vec2, vec3, vec4, float, int, sin, cos, exp, pow, abs,
  dot, length, normalize, smoothstep, step, fract, floor, mod, max, mix, clamp, select, acos, atan2, varying,
  positionWorld, positionGeometry, positionLocal, positionView, normalGeometry, modelViewMatrix, modelNormalMatrix,
} from 'three/tsl';
import { pointCoord, pointSpriteClip } from '../../../lib/webgpuPointSprites.js';

const R = (u, name, type) => reference('value', type, u[name]);
const sq = (x) => x.mul(x);
const nodeMaterial = (fragment, more = {}) => {
  const m = new NodeMaterial();
  m.fragmentNode = fragment;
  Object.assign(m, more);
  return m;
};
// view-space normal and view direction, per vertex like the GLSL varyings
const viewNormal = () => varyingOf(normalize(modelNormalMatrix.mul(normalGeometry)));
const viewDir = () => varyingOf(normalize(positionView.negate()));
let varyingCount = 0;
const varyingOf = (node) => varying(node, `v_duel${varyingCount++}`);

// ---- floor waves (arena.mjs WAVE_GLSL) -----------------------------------------------------------------------
export const floorWave = (u, xz) => Fn(() => {
  const count = R(u, 'uWaveCount', 'int');
  const waveA = uniformArray(u.uWaveA.value, 'vec4');
  const waveB = uniformArray(u.uWaveB.value, 'vec4');
  const wave = float(0).toVar();
  Loop(6, ({ i }) => {
    If(int(i).greaterThanEqual(count), () => { Break(); });
    const a = waveA.element(i).toVar();
    const b = waveB.element(i).toVar();
    const d = xz.sub(a.xy).toVar();
    const dist = length(d).toVar();
    const facing = vec2(sin(b.x), cos(b.x));
    const along = select(dist.greaterThan(1e-3), dot(d.div(dist), facing), float(1));
    const inArc = smoothstep(b.y.sub(0.12), b.y.add(0.04), along);
    const band = exp(sq(dist.sub(a.z).div(b.z)).negate());
    wave.addAssign(band.mul(inArc).mul(a.w));
  });
  return wave;
})();

const hexEdge = Fn(([p]) => {
  const s = vec2(1, 1.7320508);
  const a = mod(p, s).sub(s.mul(0.5)).toVar();
  const b = mod(p.sub(s.mul(0.5)), s).sub(s.mul(0.5)).toVar();
  const g = select(dot(a, a).lessThan(dot(b, b)), a, b);
  const q = abs(g).toVar();
  return max(dot(q, normalize(vec2(1, 1.7320508))), q.x);
});

export function arenaFloorTwin(classic) {
  const u = classic.uniforms;
  const radius = R(u, 'uRadius', 'float'); const time = R(u, 'uTime', 'float');
  const base = R(u, 'uBase', 'color'); const line = R(u, 'uLine', 'color'); const edgeColor = R(u, 'uEdge', 'color');
  const waveColor = R(u, 'uWaveColor', 'color');
  return nodeMaterial(Fn(() => {
    const xz = positionWorld.xz.toVar();
    const r = length(xz).toVar();
    const cells = smoothstep(0.47, 0.5, hexEdge(xz.mul(0.9))).toVar();
    const rings = smoothstep(0.92, 1, abs(sin(r.mul(0.9).sub(time.mul(0.6)))));
    const edge = smoothstep(radius.sub(0.6), radius.sub(0.05), r).mul(smoothstep(radius, radius.add(0.05), r).oneMinus());
    const c = base.add(line.mul(cells.mul(0.35).add(rings.mul(0.12).mul(r.div(radius).oneMinus())))).add(edgeColor.mul(edge).mul(2.2)).toVar();
    c.addAssign(waveColor.mul(floorWave(u, xz)).mul(cells.mul(1.8).add(0.18)));
    return vec4(c, 1);
  })());
}

export function depotOverlayTwin(classic) {
  const u = classic.uniforms;
  const time = R(u, 'uTime', 'float'); const lift = R(u, 'uLift', 'vec4'); const liftFill = R(u, 'uLiftFill', 'float');
  const alarm = R(u, 'uAlarm', 'float'); const waveColor = R(u, 'uWaveColor', 'color');
  return nodeMaterial(Fn(() => {
    const xz = positionWorld.xz.toVar();
    const f = abs(fract(xz.div(2)).sub(0.5));
    const seam = smoothstep(0.46, 0.495, max(f.x, f.y)).toVar();
    const c = waveColor.mul(floorWave(u, xz)).mul(seam.mul(1.7).add(0.12)).toVar();
    const dv = xz.sub(lift.xy).toVar();
    const dl = length(dv).toVar();
    const ring = smoothstep(lift.z.sub(0.2), lift.z.sub(0.1), dl).mul(smoothstep(lift.z, lift.z.add(0.1), dl).oneMinus());
    const turn = atan2(dv.x, dv.y).div(6.2831853).add(0.5).toVar();
    const pad = smoothstep(1.9, 2, dl).mul(smoothstep(2.4, 2.5, dl).oneMinus()).mul(step(0.5, fract(turn.mul(24))));
    const pulse = sin(time.mul(4)).mul(0.5).add(0.5).toVar();
    const hazard = vec3(1, 0.7, 0.2);
    c.addAssign(hazard.mul(ring.mul(lift.w.mul(pulse.mul(0.6).add(0.4)).add(0.3).add(step(turn, liftFill).mul(lift.w).mul(1.4))).add(pad.mul(0.45))));
    c.addAssign(hazard.mul(lift.w).mul(smoothstep(0, lift.z, dl).oneMinus()).mul(0.05).mul(pulse.add(1)));
    c.addAssign(vec3(1, 0.1, 0.06).mul(alarm).mul(seam).mul(sin(time.mul(6)).mul(0.5).add(0.5).mul(0.5).add(0.25)));
    return vec4(c, 1);
  })());
}

export function depotCeilingTwin(classic) {
  const u = classic.uniforms;
  const time = R(u, 'uTime', 'float'); const alarm = R(u, 'uAlarm', 'float');
  return nodeMaterial(Fn(() => {
    const xz = positionWorld.xz.toVar();
    const f = abs(fract(xz.div(4)).sub(0.5));
    const c = vec3(0.022, 0.028, 0.04).add(vec3(0.02, 0.026, 0.036).mul(smoothstep(0.44, 0.5, max(f.x, f.y))));
    const row = abs(fract(xz.y.div(8)).sub(0.5));
    const strip = smoothstep(0.02, 0.035, row).oneMinus().mul(step(0.25, fract(xz.x.div(4))));
    const lamp = mix(vec3(0.75, 0.9, 1), vec3(1, 0.12, 0.08).mul(sin(time.mul(6)).mul(0.5).add(0.5).mul(0.65).add(0.35)), alarm);
    return vec4(c.add(lamp.mul(strip).mul(1.5)), 1);
  })());
}

export function crystalShellTwin(classic) {
  const u = classic.uniforms;
  const color = R(u, 'uColor', 'color'); const intensity = R(u, 'uIntensity', 'float');
  const time = R(u, 'uTime', 'float'); const flickerOn = R(u, 'uFlicker', 'float');
  const vN = viewNormal(); const vV = viewDir(); const vY = varyingOf(positionGeometry.y);
  return nodeMaterial(Fn(() => {
    const rim = pow(float(1).sub(abs(dot(vN, vV))), 1.6);
    const flow = sin(vY.mul(22).sub(time.mul(7))).mul(0.25).add(0.75);
    const flicker = mix(1, step(0.35, fract(sin(floor(time.mul(24)).mul(12.9898)).mul(43758.5453))), flickerOn);
    const a = rim.mul(flow).mul(intensity).mul(flicker).toVar();
    return vec4(color.mul(a).mul(1.6), a);
  })());
}

export function particlesTwin() {
  const center = attribute('instancePosition', 'vec3');
  const mv = modelViewMatrix.mul(vec4(center, 1));
  const sizePixels = attribute('aSize', 'float').mul(float(300).div(max(0.1, mv.z.negate())));
  const vAlpha = varyingOf(attribute('aAlpha', 'float'));
  const vColor = varyingOf(attribute('aColor', 'vec3'));
  const m = nodeMaterial(Fn(() => {
    const d = pointCoord().sub(0.5);
    const r = dot(d, d).toVar();
    r.greaterThan(0.25).discard();
    const a = vAlpha.mul(float(1).sub(r.mul(4))).toVar();
    return vec4(vColor.mul(a).mul(1.8), a);
  })());
  m.vertexNode = pointSpriteClip(center, sizePixels);
  m.isPointSpriteTwin = true;
  return m;
}

const hexLines = Fn(([p]) => {
  const q = vec2(atan2(p.z, p.x).mul(3), p.y.mul(5));
  const s = vec2(1, 1.7320508);
  const a = mod(q, s).sub(s.mul(0.5)).toVar();
  const b = mod(q.sub(s.mul(0.5)), s).sub(s.mul(0.5)).toVar();
  const h = abs(select(dot(a, a).lessThan(dot(b, b)), a, b)).toVar();
  return smoothstep(0.42, 0.5, max(dot(h, normalize(vec2(1, 1.7320508))), h.x));
});

export function vfxShellTwin(classic) {
  const u = classic.uniforms;
  const color = R(u, 'uColor', 'color'); const age = R(u, 'uAge', 'float'); const origin = R(u, 'uOrigin', 'vec3');
  const ripple = R(u, 'uRipple', 'float'); const hex = R(u, 'uHex', 'float'); const core = R(u, 'uCore', 'float');
  const vN = viewNormal(); const vV = viewDir(); const vLocal = varyingOf(normalize(positionGeometry));
  return nodeMaterial(Fn(() => {
    const facing = abs(dot(vN, vV)).toVar();
    const rim = sq(float(1).sub(facing));
    const fade = age.oneMinus();
    const d = acos(clamp(dot(vLocal, origin), -1, 1)).toVar();
    const isRipple = ripple.greaterThan(0.5);
    const wave = select(isRipple, exp(sq(d.sub(age.mul(2.6)).mul(6)).negate()), float(0));
    const spot = select(isRipple, exp(d.mul(d).mul(-10)).mul(age.oneMinus()), float(0));
    const hexV = select(hex.greaterThan(0.5), hexLines(vLocal).mul(0.8), float(0));
    const coreV = core.mul(pow(facing, 3));
    const a = rim.mul(0.55).add(wave.mul(0.9)).add(spot).add(hexV.mul(rim)).add(coreV).mul(fade).toVar();
    return vec4(color.mul(a).mul(1.5), a);
  })());
}

const hash1 = (n) => fract(sin(n).mul(43758.5453));
export function coneTwin(classic) {
  const u = classic.uniforms;
  const color = R(u, 'uColor', 'color'); const age = R(u, 'uAge', 'float'); const pull = R(u, 'uPull', 'float');
  const seed = R(u, 'uSeed', 'float');
  const vN = viewNormal(); const vV = viewDir();
  return nodeMaterial(Fn(() => {
    const vUv = uv();
    const along = vUv.y.oneMinus().toVar();
    const rim = pow(float(1).sub(abs(dot(normalize(vN), normalize(vV)))), 1.3);
    const isPull = pull.greaterThan(0.5);
    const frontAt = select(isPull, age.oneMinus(), age.mul(0.18).add(0.82));
    const front = exp(sq(along.sub(frontAt).mul(8)).negate());
    const dir = select(isPull, float(1), float(-1));
    const rippleV = pow(sin(along.mul(28).add(dir.mul(age).mul(42))).mul(0.5).add(0.5), 10);
    const streak = pow(hash1(floor(vUv.x.mul(56)).add(seed)), 7).mul(smoothstep(0.08, 0.7, along));
    const fade = age.oneMinus().mul(smoothstep(0, 0.12, along));
    const a = rim.mul(0.2).add(front.mul(0.7)).add(rippleV.mul(0.16)).add(streak.mul(0.45)).mul(fade).toVar();
    return vec4(color.mul(a).mul(1.15), a.mul(0.7));
  })());
}

export function ribbonTwin(classic) {
  const u = classic.uniforms;
  const color = R(u, 'uColor', 'color'); const time = R(u, 'uTime', 'float'); const alpha = R(u, 'uAlpha', 'float');
  const vV = varyingOf(attribute('aV', 'float')); const vSide = varyingOf(attribute('aSide', 'float'));
  return nodeMaterial(Fn(() => {
    const across = abs(vSide).oneMinus().toVar();
    const pulse = pow(sin(vV.mul(34).sub(time.mul(16))).mul(0.5).add(0.5), 5).toVar();
    const ends = smoothstep(0, 0.08, vV).mul(smoothstep(1, 0.85, vV));
    const a = sq(across).mul(0.55).add(pulse.mul(across).mul(0.9)).mul(ends).mul(alpha).toVar();
    return vec4(mix(color, vec3(1), pulse.mul(0.5)).mul(a).mul(1.6), a);
  })());
}

export function trailTwin(classic) {
  const u = classic.uniforms;
  const color = R(u, 'uColor', 'color'); const strength = R(u, 'uStrength', 'float');
  const vAlpha = varyingOf(attribute('aAlpha', 'float')); const vEdge = varyingOf(attribute('aEdge', 'float'));
  return nodeMaterial(Fn(() => {
    const core = pow(vEdge, 2.5).toVar();
    const a = vAlpha.mul(core.mul(0.75).add(0.25)).mul(strength).toVar();
    return vec4(mix(color, vec3(1), core.mul(0.6)).mul(a).mul(1.4), a);
  })());
}

export function bannerTwin(classic) {
  const u = classic.uniforms;
  const color = R(u, 'uColor', 'color'); const time = R(u, 'uTime', 'float');
  const vUv = uv();
  const wave = sin(vUv.x.mul(7).sub(time.mul(6))).mul(0.07).mul(vUv.x).add(sin(vUv.x.mul(13).sub(time.mul(9))).mul(0.02).mul(vUv.x));
  const m = nodeMaterial(Fn(() => {
    const t = uv();
    const edge = smoothstep(0, 0.08, t.y).mul(smoothstep(1, 0.92, t.y));
    const sheen = sin(t.x.mul(9).sub(time.mul(4))).mul(0.35).add(0.65);
    const mark = step(0.38, abs(t.y.sub(0.5))).mul(0.4);
    return vec4(color.mul(sheen.add(mark)).mul(edge.mul(0.25).add(0.75)), 0.92);
  })());
  m.positionNode = positionLocal.add(vec3(0, 0, wave));
  return m;
}

