// TSL twin of the sumi-e ink wash pass (inkWashLook.js FRAGMENT), for WebGPURenderer: the same full-screen
// triangle, the same off-screen colour + depth target, line for line the same maths in WebGL's uv convention
// (origin bottom left). Render-target lookups take three's node convention (v down; its WebGL2 backend flips it
// back), so every lookup goes through rt().
import { NodeMaterial } from 'three/webgpu';
import {
  Fn, If, texture, reference, vec2, vec3, vec4, float, floor, fract, dot, mix, smoothstep, clamp, max, min, abs, pow,
  step, length, select, varying, positionGeometry, perspectiveDepthToViewZ,
} from 'three/tsl';

const hash = Fn(([p0]) => {
  const p = fract(p0.mul(vec2(123.34, 456.21))).toVar();
  p.addAssign(dot(p, p.add(45.32)));
  return fract(p.x.mul(p.y));
});
const vnoise = Fn(([p]) => {
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(float(3).sub(f.mul(2))).toVar();
  return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y);
});
const fbm = Fn(([p0]) => {
  const p = vec2(p0).toVar();
  const s = float(0).toVar();
  let a = 0.5;
  for (let i = 0; i < 4; i++) { s.addAssign(vnoise(p).mul(a)); p.mulAssign(2.03); a *= 0.5; }
  return s;
});
const luma = (c) => dot(c, vec3(0.299, 0.587, 0.114));
// a brightness as ink: lifted, the paper left bare for the light, a hint of layered washes
const washTone = Fn(([L, wet]) => {
  const lift = L.div(L.add(0.16)).mul(1.16);
  const t = smoothstep(0.1, 0.92, clamp(lift.add(wet), 0, 1)).toVar();
  const bands = floor(t.mul(3)).add(smoothstep(0.2, 0.8, fract(t.mul(3)))).div(3);
  return mix(t, bands, 0.3);
});

export function createInkWashTwin(classic) {
  const u = classic.uniforms;
  const R = (name, type) => reference('value', type, u[name]);
  // the target is replaced on resize: follow the uniform
  const tColor = texture(u.tColor.value).onRenderUpdate(() => u.tColor.value);
  const tDepth = texture(u.tDepth.value).onRenderUpdate(() => u.tDepth.value);
  const resolution = R('uResolution', 'vec2');
  const near = R('uNear', 'float'); const far = R('uFar', 'float'); const level = R('uLevel', 'float');
  const colorKeep = R('uColorKeep', 'float'); const lineWidth = R('uLineWidth', 'float');
  const mistNear = R('uMistNear', 'float'); const mistFar = R('uMistFar', 'float');
  const vibrant = R('uVibrant', 'float'); const washLift = R('uWashLift', 'float'); const vibrance = R('uVibrance', 'float');
  const lineStrength = R('uLineStrength', 'float'); const mistStrength = R('uMistStrength', 'float'); const skyMist = R('uSkyMist', 'float');
  const paper = R('uPaper', 'vec3'); const ink = R('uInk', 'vec3'); const mistColor = R('uMistColor', 'vec3');

  const vUv = varying(positionGeometry.xy.mul(0.5).add(0.5), 'v_inkUv');

  // the renderer's own tone mapping (and exposure), then sRGB
  const toDisplay = (hdr) => Fn((builder) => {
    const mapping = builder.renderer.toneMapping;
    const c = (mapping ? clamp(vec4(hdr, 1).toneMapping(mapping).rgb, 0, 1) : clamp(hdr, 0, 1)).toVar();
    return mix(c.mul(12.92), pow(c, vec3(1 / 2.4)).mul(1.055).sub(0.055), step(0.0031308, c));
  })();
  const rt = (uvNode) => vec2(uvNode.x, uvNode.y.oneMinus());
  const colorAt = (uvNode) => toDisplay(tColor.uv(rt(uvNode)).rgb);
  const distAt = (uvNode) => perspectiveDepthToViewZ(tDepth.uv(rt(uvNode)).x, near, far).negate();
  const foldAt = (uvNode, dist, o) => {
    const dN = distAt(uvNode.add(vec2(0, o.y))); const dS = distAt(uvNode.sub(vec2(0, o.y)));
    const dE = distAt(uvNode.add(vec2(o.x, 0))); const dW = distAt(uvNode.sub(vec2(o.x, 0)));
    return abs(dN.add(dS).sub(dist.mul(2))).add(abs(dE.add(dW).sub(dist.mul(2)))).div(max(dist, 0.5));
  };

  const shade = Fn(() => {
    const uv0 = vUv.toVar();
    const px = uv0.mul(resolution).toVar();
    const texel = vec2(1).div(resolution).toVar();
    const raw = tDepth.uv(rt(uv0)).x.toVar();
    // only the sky dome here: its colours are already as shown
    const sky = raw.greaterThanEqual(0.99999);
    const c = select(sky, clamp(tColor.uv(rt(uv0)).rgb, 0, 1), colorAt(uv0)).toVar();
    const L = luma(c).toVar();
    const dist = distAt(uv0).toVar();

    const blot = fbm(px.div(150).add(3.1)).sub(0.5).toVar();
    const tone = washTone(L, blot.mul(0.06)).toVar();
    tone.addAssign(vnoise(px.div(2.5)).sub(0.5).mul(0.12).mul(tone).mul(tone.oneMinus()));
    const stroke = vec2(px.x.mul(0.94).add(px.y.mul(-0.34)), px.x.mul(0.34).add(px.y.mul(0.94))).toVar(); // mat2(.94,.34,-.34,.94)*px
    const dry = smoothstep(0.62, 0.92, vnoise(vec2(stroke.x.div(160), stroke.y.div(9))).mul(0.75)
      .add(vnoise(stroke.div(vec2(24, 3.5))).mul(0.25)));
    tone.addAssign(select(sky, float(0), dry.mul(0.2).mul(smoothstep(0, 0.32, tone).oneMinus())));
    const wash = mix(ink, paper, clamp(tone, 0, 1)).toVar();
    const mx = max(c.r, max(c.g, c.b)).toVar(); const mn = min(c.r, min(c.g, c.b));
    const sat = select(mx.greaterThan(1e-3), mx.sub(mn).div(mx), float(0)).toVar();
    const keep = colorKeep.mul(smoothstep(0.3, 0.85, sat).mul(0.75).add(0.25)).mul(smoothstep(0.12, 0.5, mx));
    const tinted = clamp(c.mul(luma(wash).div(max(L, 0.04))), 0, 1);
    const col = mix(wash, tinted, keep).toVar();
    If(vibrant.greaterThan(0.5), () => {
      const targetL = mix(L, luma(wash), washLift.mul(smoothstep(0.015, 0.18, L)));
      const pigment = c.mul(targetL.div(max(L, 0.0001))).toVar();
      const center = luma(pigment).toVar();
      const chroma = pigment.sub(vec3(center)).mul(vibrance.mul(sat.oneMinus()).add(1)).toVar();
      const hi = max(chroma.r, max(chroma.g, chroma.b)); const lo = min(chroma.r, min(chroma.g, chroma.b));
      const fit = min(1, min(center.oneMinus().div(max(hi, 0.0001)), center.div(max(lo.negate(), 0.0001))));
      pigment.assign(vec3(center).add(chroma.mul(max(fit, 0))));
      const paperTone = wash.mul(center.div(max(luma(wash), 0.0001)));
      col.assign(mix(paperTone, pigment, colorKeep));
    });

    // ink lines, two brush widths
    If(level.greaterThanEqual(2), () => {
      const brush = vnoise(px.div(11)).toVar();
      const o = texel.mul(lineWidth).mul(brush.mul(0.9).add(0.6)).toVar();
      const line = max(smoothstep(0.03, 0.12, foldAt(uv0, dist, o)), smoothstep(0.08, 0.3, foldAt(uv0, dist, o.mul(1.7))).mul(0.45)).toVar();
      If(level.greaterThanEqual(3), () => {
        const lE = luma(tColor.uv(rt(uv0.add(vec2(o.x, 0)))).rgb); const lW = luma(tColor.uv(rt(uv0.sub(vec2(o.x, 0)))).rgb);
        const lN = luma(tColor.uv(rt(uv0.add(vec2(0, o.y)))).rgb); const lS = luma(tColor.uv(rt(uv0.sub(vec2(0, o.y)))).rgb);
        const g = abs(lE.sub(lW)).add(abs(lN.sub(lS))).div(lE.add(lW).add(lN).add(lS).add(0.08)).mul(2);
        line.assign(max(line, smoothstep(0.35, 0.9, g).mul(0.7)));
      });
      line.mulAssign(smoothstep(60, 320, dist).oneMinus().mul(brush.mul(0.4).add(0.6)));
      col.assign(mix(col, ink, line.mul(lineStrength)));
    });

    // mist in the world's own pigment
    col.assign(mix(col, mistColor, select(sky, skyMist, smoothstep(mistNear, mistFar, dist).mul(mistStrength))));

    // the paper
    const fibre = vnoise(vec2(px.x.mul(0.06), px.y.mul(0.6))).mul(0.5).add(vnoise(vec2(px.x.mul(0.6), px.y.mul(0.05))).mul(0.5));
    col.mulAssign(fibre.mul(0.05).add(0.94).add(hash(floor(px)).mul(0.03)).sub(blot.mul(0.04)));
    const q = uv0.sub(0.5);
    col.mulAssign(float(1).sub(smoothstep(0.35, 0.75, length(q.mul(vec2(1, 0.8)))).mul(0.18)));
    return vec4(col, 1);
  });

  const m = new NodeMaterial();
  m.vertexNode = vec4(positionGeometry.xy, 0, 1);
  m.fragmentNode = shade();
  return m;
}
