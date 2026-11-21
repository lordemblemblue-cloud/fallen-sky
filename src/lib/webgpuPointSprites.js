/**
 * Points with a size, on WebGPURenderer.
 *
 * WebGPU draws a point as exactly one pixel (no point size), and three r171's WebGL2 backend writes
 * `gl_PointSize = 1.0` too, so every PointsMaterial cloud (stars, snow, hail, ash, sparks) would shrink to dots.
 * webgpuSceneRenderer.js asks `pointSpriteFor(points, material, renderer)` for a stand-in and draws that instead: one
 * quad per point, instanced, reading the SAME position (and colour) arrays as the Points geometry, so the game keeps
 * animating its BufferAttributes as before (their needsUpdate is followed by version).
 *
 * Sizes are WebGL's (three's points shader): with sizeAttenuation gl_PointSize = size * pixelRatio * (cssHeight / 2)
 * / -z, which is a clip-space half-size of size/2 vertically (times height/width horizontally); without it `size`
 * CSS pixels. Texture lookups use WebGL's point coordinates (v up, as `1 - gl_PointCoord.y`).
 */
import { InstancedBufferAttribute, InstancedBufferGeometry, BufferAttribute, Mesh, Vector2 } from 'three';
import { NodeMaterial } from 'three/webgpu';
import {
  attribute, positionGeometry, modelViewMatrix, cameraProjectionMatrix, vec2, vec4, uniform, texture, uv, select,
  materialReference, output, varying,
} from 'three/tsl';
import { classicOutput, classicOutputPolicyForMaterial } from './webgpuClassicOutput.js';

const proxies = new WeakMap(); // Points -> stand-in
const drawingSize = new Vector2();
const reportedOffsets = new WeakSet();

function baseQuad() {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

function syncAttribute(source, mirror) {
  if (mirror.array !== source.array) {
    mirror.array = source.array;
    mirror.count = source.count;
    mirror.needsUpdate = true;
  } else if (mirror.__sourceVersion !== source.version) {
    mirror.needsUpdate = true;
  }
  mirror.__sourceVersion = source.version;
}

function buildMaterial(classic, hasColor, viewport, attenuation) {
  const m = new NodeMaterial();
  m.lights = false;
  const center = attribute('instancePosition', 'vec3');
  const corner = positionGeometry.xy;
  const size = materialReference('size', 'float', classic);
  const clip = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(center, 1))).toVar();
  const attenuated = corner.mul(size).mul(vec2(viewport.y.div(viewport.x), 1));
  const fixed = corner.mul(size).mul(2).div(viewport).mul(clip.w);
  // (a uniform float, not a bool property: WGSL has no bool uniforms)
  const offset = select(attenuation.greaterThan(0.5), attenuated, fixed);
  m.vertexNode = vec4(clip.xy.add(offset), clip.zw);
  let color = vec4(materialReference('color', 'color', classic), materialReference('opacity', 'float', classic));
  if (hasColor) color = color.mul(vec4(attribute('instanceColor', 'vec3'), 1));
  if (classic.map) color = color.mul(texture(classic.map, uv()));
  if (classic.alphaMap) color = vec4(color.rgb, color.a.mul(texture(classic.alphaMap, uv()).g));
  m.colorNode = color; // alpha already carries the classic opacity
  // PointsMaterial's own output order (webgpuClassicOutput.js), fogged at the point's centre
  m.fog = false;
  m.outputNode = classicOutput(output, { ...classicOutputPolicyForMaterial(classic),
    fogDepth: varying(modelViewMatrix.mul(vec4(center, 1)).z.negate(), 'v_scenePointFogDepth') });
  return m;
}

/** The instanced-quad stand-in for a Points object drawn with a PointsMaterial (null for other materials). */
export function pointSpriteFor(points, material, renderer) {
  if (!points?.isPoints || !material?.isPointsMaterial) return null;
  const source = points.geometry;
  const position = source?.getAttribute?.('position');
  if (!position) return null;
  const hasColor = material.vertexColors === true && !!source.getAttribute('color');
  let proxy = proxies.get(points);
  if (proxy && (proxy.classic !== material || proxy.hasColor !== hasColor || proxy.map !== material.map || proxy.alphaMap !== material.alphaMap
    || proxy.toneMapped !== material.toneMapped || proxy.fog !== material.fog)) {
    proxy.material.dispose();
    proxy.material = buildMaterial(material, hasColor, proxy.viewport, proxy.attenuation);
    proxy.mesh.material = proxy.material;
    Object.assign(proxy, { classic: material, hasColor, map: material.map, alphaMap: material.alphaMap, toneMapped: material.toneMapped, fog: material.fog });
  }
  if (!proxy) {
    const geometry = baseQuad();
    const positionAttr = new InstancedBufferAttribute(position.array, 3);
    geometry.setAttribute('instancePosition', positionAttr);
    const viewport = uniform(new Vector2(1, 1));
    const attenuation = uniform(1);
    proxy = { geometry, positionAttr, colorAttr: null, viewport, attenuation, classic: material, hasColor,
      map: material.map, alphaMap: material.alphaMap, toneMapped: material.toneMapped, fog: material.fog };
    proxy.material = buildMaterial(material, hasColor, viewport, attenuation);
    proxy.mesh = new Mesh(geometry, proxy.material);
    proxy.mesh.frustumCulled = false;
    proxy.mesh.matrixAutoUpdate = false;
    proxy.mesh.name = (points.name || 'Points') + ' (sprites)';
    proxies.set(points, proxy);
    source.addEventListener('dispose', () => { geometry.dispose(); proxy.material.dispose(); proxies.delete(points); });
  }
  if (hasColor && !proxy.colorAttr) {
    const color = source.getAttribute('color');
    proxy.colorAttr = new InstancedBufferAttribute(color.array, color.itemSize);
    proxy.geometry.setAttribute('instanceColor', proxy.colorAttr);
  }
  // follow the game's attribute updates, draw range, transform and render state
  syncAttribute(position, proxy.positionAttr);
  if (proxy.colorAttr) syncAttribute(source.getAttribute('color'), proxy.colorAttr);
  const start = source.drawRange?.start || 0;
  if (start !== 0 && !reportedOffsets.has(points)) {
    reportedOffsets.add(points);
    console.warn(`[webgpu] ${points.name || 'Points'}: drawRange.start ${start} is drawn from 0 as sprites`);
  }
  proxy.geometry.instanceCount = Math.max(0, Math.min(position.count, source.drawRange?.count ?? Infinity));
  proxy.mesh.matrixWorld.copy(points.matrixWorld);
  proxy.mesh.renderOrder = points.renderOrder;
  for (const key of ['transparent', 'depthWrite', 'depthTest', 'blending', 'alphaTest', 'premultipliedAlpha', 'visible']) {
    if (proxy.material[key] !== material[key]) {
      proxy.material[key] = material[key];
      if (key !== 'visible') proxy.material.needsUpdate = true;
    }
  }
  proxy.attenuation.value = material.sizeAttenuation === false ? 0 : 1;
  renderer.getDrawingBufferSize(drawingSize);
  const ratio = renderer.getPixelRatio() || 1;
  proxy.viewport.value.set(drawingSize.x / ratio, drawingSize.y / ratio);
  return proxy;
}
