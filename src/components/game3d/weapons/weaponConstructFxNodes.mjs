// TSL version of the oil-metal construction shaders in weaponConstructFx.js, for WebGPURenderer.
//  - constructNodes(): the construction front on a patched weapon material (swell, noisy discard edge, oil
//    colour / roughness / metalness, thin-film + molten emissive). One graph for every patched material: each mesh
//    reads its own effect's values from mesh.userData.cfUniforms (a reference to the drawn object; a material
//    reference would make the graph contain itself through the material that holds it).
//  - createDropletTwin(): the glossy oil beads (gl_PointSize sphere impostors) as an instanced-quad sprite twin.
import { NodeMaterial } from 'three/webgpu';
import {
  Fn, reference, attribute, vec3, vec4, float, dot, abs, max, select, smoothstep, sin, cos, fract, floor, mix, pow,
  clamp, normalize, sqrt, reflect, varying, positionGeometry, positionLocal, normalLocal,
  positionView, modelViewMatrix, transformedNormalView, materialRoughness, materialMetalness, materialEmissive,
} from 'three/tsl';
import { pointCoord, pointSpriteClip } from '../../../lib/webgpuPointSprites.js';

const cfHash = Fn(([p0]) => {
  const p = fract(p0.mul(0.3183099).add(0.1)).mul(17).toVar();
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
});
const cfNoise = Fn(([x]) => {
  const i = floor(x).toVar();
  const f = fract(x).toVar();
  f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  const h = (dx, dy, dz) => cfHash(i.add(vec3(dx, dy, dz)));
  return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y), f.z);
});

let construct = null;
export function constructNodes() {
  if (construct) return construct;
  const R = (name, type) => reference(`userData.cfUniforms.${name}.value`, type);
  const front = R('uCF_front', 'float'); const band = R('uCF_band', 'float'); const time = R('uCF_time', 'float');
  const flash = R('uCF_flash', 'float'); const kind = R('uCF_kind', 'float');
  const reachPos = R('uCF_reachPos', 'float'); const reachNeg = R('uCF_reachNeg', 'float');
  const axis = R('uCF_axis', 'vec3'); const grip = R('uCF_grip', 'vec3'); const meshToRoot = R('uCF_meshToRoot', 'mat4');

  // vertex: distance along the weapon from the grip, and the swell of the advancing front
  const root = meshToRoot.mul(vec4(positionGeometry, 1)).xyz;
  const t = dot(root.sub(grip), axis);
  const d = select(kind.greaterThan(0.5), abs(t).div(max(reachPos, reachNeg)),
    select(t.lessThan(0), t.negate().div(max(1e-4, reachNeg)).mul(0.14), t.div(max(1e-4, reachPos))));
  const swell = smoothstep(front.sub(0.16), front, d).mul(smoothstep(front, front.add(0.03), d).oneMinus());
  const positionNode = positionLocal.add(normalLocal.mul(swell.mul(0.0035).mul(sin(time.mul(21).add(d.mul(70))).add(1.2))));

  // fragment
  const vD = varying(d, 'v_cfD');
  const vPos = varying(root, 'v_cfPos');
  const n1 = cfNoise(vPos.mul(26).add(vec3(0, time.mul(-1.9), time.mul(0.7))));
  const n2 = cfNoise(vPos.mul(71).add(time.mul(2.6)));
  const edge = front.add(n1.sub(0.5).mul(0.11)).add(n2.sub(0.5).mul(0.035));
  const bandW = smoothstep(edge.sub(band), edge, vD);
  const cool = smoothstep(edge.sub(band.mul(3.2)), edge.sub(band), vD);
  const oil = clamp(max(bandW, cool.mul(0.75)), 0, 1);

  // (GLSL: discard right after clipping, oil colour right after the base texture)
  const mapStageNodes = new WeakMap();
  const mapStage = (color) => {
    if (!mapStageNodes.has(color)) mapStageNodes.set(color, Fn(() => {
      vD.greaterThan(edge).discard();
      return vec4(mix(color.rgb, vec3(0.008, 0.008, 0.011), oil), color.a);
    })());
    return mapStageNodes.get(color);
  };

  const ndv = clamp(abs(dot(transformedNormalView, normalize(positionView.negate()))), 0, 1);
  const fres = pow(float(1).sub(ndv), 2.2);
  const film = cos(vec3(0, 0.33, 0.67).add(float(1).sub(ndv).mul(1.7)).add(n1.mul(0.9)).mul(6.28318)).mul(0.5).add(0.5);
  const hot = smoothstep(0.62, 1, bandW);
  const molten = mix(vec3(1, 0.36, 0.08), vec3(1, 0.9, 0.62), hot.mul(hot));
  construct = {
    mapStage,
    nodes: {
      positionNode,
      roughnessNode: mix(materialRoughness, 0.06, oil),
      metalnessNode: mix(materialMetalness, 1, oil),
      emissiveNode: materialEmissive.add(film.mul(fres.mul(1.05).add(0.16)).mul(oil))
        .add(molten.mul(hot).mul(n2.mul(1.2).add(2.1)))
        .add(vec3(1, 0.66, 0.36).mul(flash).mul(fres.mul(0.65).add(0.06))),
    },
  };
  return construct;
}
export function createDropletTwin(classic) {
  const scale = reference('value', 'float', classic.uniforms.uScale);
  const center = attribute('instancePosition', 'vec3');
  const mv = modelViewMatrix.mul(vec4(center, 1));
  const sizePixels = attribute('aSize', 'float').mul(scale).div(max(0.05, mv.z.negate()));
  const vAlpha = varying(attribute('aAlpha', 'float'), 'v_cfDropAlpha');
  const vHeat = varying(attribute('aHeat', 'float'), 'v_cfDropHeat');
  const shade = Fn(() => {
    const c = pointCoord().mul(2).sub(1).toVar();
    const r2 = dot(c, c).toVar();
    r2.greaterThan(1).or(vAlpha.lessThanEqual(0)).discard();
    const n = vec3(c.x, c.y.negate(), sqrt(float(1).sub(r2))).toVar();
    const fres = pow(float(1).sub(n.z), 2);
    const film = cos(vec3(0, 0.33, 0.67).add(fres.mul(1.5)).add(c.x.mul(0.4)).mul(6.28318)).mul(0.5).add(0.5);
    const spec = pow(max(dot(reflect(normalize(vec3(-0.4, -0.75, -0.5)), n), vec3(0, 0, 1)), 0), 36);
    const col = vec3(0.01).add(film.mul(fres).mul(0.85)).add(vec3(spec).mul(1.4))
      .add(vec3(1, 0.45, 0.12).mul(vHeat).mul(float(1).sub(r2)).mul(2.2));
    return vec4(col, vAlpha.mul(n.z.mul(0.25).add(0.75)));
  });
  const m = new NodeMaterial();
  m.vertexNode = pointSpriteClip(center, sizePixels);
  m.fragmentNode = shade();
  m.isPointSpriteTwin = true;
  return m;
}
