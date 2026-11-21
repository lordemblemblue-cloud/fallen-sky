// The Duelist's bent-space pass (warp.mjs WarpShader) for WebGPURenderer: three's node PostProcessing with a scene
// pass and the same displacement maths in TSL. Its output transform (tone mapping, sRGB) plays the OutputPass.
import { PostProcessing, Vector2, Vector4, Color } from 'three/webgpu';
import {
  Fn, If, Loop, Break, pass, uniform, uniformArray, uv, vec2, vec3, vec4, float, int, exp, pow, length, max, min,
  smoothstep, cos, sin, select,
} from 'three/tsl';
import { createWarpField, MAX_WARP_EFFECTS } from './warpField.mjs';

const MAX = MAX_WARP_EFFECTS;

export function createWarpWebGPU(renderer, scene, camera) {
  const post = new PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  const aspect = uniform(1);
  const count = uniform(0, 'int');
  const a = Array.from({ length: MAX }, () => new Vector4());
  const b = Array.from({ length: MAX }, () => new Vector4());
  const uA = uniformArray(a, 'vec4');
  const uB = uniformArray(b, 'vec4');
  const tint = uniform(new Color(0x9fdcff));

  post.outputNode = Fn(() => {
    // the GLSL's maths in WebGL's uv convention (v up, as the projected centres); lookups in three's (v down)
    const vUv = vec2(uv().x, uv().y.oneMinus()).toVar();
    const rt = (u) => vec2(u.x, u.y.oneMinus());
    const p = vec2(vUv.x.mul(aspect), vUv.y).toVar();
    const offset = vec2(0).toVar();
    const glow = float(0).toVar();
    const split = float(0).toVar();
    Loop(MAX, ({ i }) => {
      If(int(i).greaterThanEqual(count), () => { Break(); });
      const ai = uA.element(i).toVar();
      const bi = uB.element(i).toVar();
      const d = p.sub(vec2(ai.x.mul(aspect), ai.y)).toVar();
      const r = length(d).toVar();
      const n = select(r.greaterThan(1e-5), d.div(r), vec2(0));
      If(bi.x.lessThan(1.5), () => {
        // a ring: pixels near it are pulled from inside (out) or from outside (in)
        const band = exp(pow(r.sub(ai.z).div(max(1e-4, bi.y)), 2).negate()).toVar();
        const s = ai.w.mul(band).toVar();
        offset.addAssign(n.mul(select(bi.x.lessThan(0.5), s.negate(), s)));
        split.addAssign(s);
        glow.addAssign(band.mul(ai.w));
      }).Else(() => {
        // a lens: inside the radius the picture swells and turns
        const inside = smoothstep(ai.z.mul(0.15), ai.z, r).oneMinus().toVar();
        const ang = bi.z.mul(inside).mul(inside).toVar();
        const turned = vec2(d.x.mul(cos(ang)).sub(d.y.mul(sin(ang))), d.x.mul(sin(ang)).add(d.y.mul(cos(ang))));
        offset.addAssign(turned.sub(d).sub(d.mul(inside).mul(ai.w)));
        split.addAssign(inside.mul(ai.w).mul(0.25));
        glow.addAssign(inside.mul(ai.w).mul(0.35));
      });
    });
    offset.x.divAssign(aspect);
    const warped = vUv.add(offset).toVar();
    const fringe = offset.mul(split.mul(8).add(1)).mul(0.35).toVar();
    const c = vec3(color.uv(rt(warped.add(fringe))).r, color.uv(rt(warped)).g, color.uv(rt(warped.sub(fringe))).b).toVar();
    c.addAssign(tint.mul(min(0.6, glow.mul(1.6))));
    return vec4(c, 1);
  })();

  const field = createWarpField();
  const size = new Vector2();
  return {
    field,
    write(project) {
      renderer.getSize(size);
      aspect.value = size.x / Math.max(1, size.y);
      count.value = field.write(project, (i, x, y, radius, strength, kind, thickness, spin) => {
        a[i].set(x, y, radius, strength);
        b[i].set(kind, thickness, spin, 0);
      });
    },
    render() { post.render(); },
    dispose() { scenePass.dispose?.(); post.dispose?.(); },
  };
}
