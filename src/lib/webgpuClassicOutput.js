/**
 * The classic renderer's output order, for WebGPURenderer (three r171).
 *
 * WebGLRenderer finishes every material in its own shader, in this order: tone mapping (when the material is
 * `toneMapped` and the frame goes to the screen), conversion to the output colour space (sRGB on screen, linear in a
 * render target), then fog mixed in that output space with a fog colour converted the same way. A ShaderMaterial
 * does only what its GLSL includes (`tonemapping_fragment`, `colorspace_fragment`, `fog_fragment`): the sky dome,
 * for example, writes its colours as they are.
 *
 * r171's WebGPURenderer instead draws the frame into a linear half-float target, fogs in linear space, and tone maps
 * and encodes every pixel in a final pass. Skies came out pale, raw-colour shaders were tone mapped, and the fog
 * band turned white. webgpuSceneRenderer.js turns that final pass off and gives each material this output node, so
 * a scene looks the same with either renderer.
 */
import { NoToneMapping, LinearSRGBColorSpace, SRGBColorSpace } from 'three/webgpu';
import {
  Fn, output, vec4, float, mix, smoothstep, exp, positionView, reference, renderGroup, renderOutput,
} from 'three/tsl';

/** What a classic built-in material (MeshStandardMaterial, SpriteMaterial, PointsMaterial...) does. */
export function classicOutputPolicyForMaterial(material) {
  // A lit material drawn on a geometry without a normal attribute: WebGL reads the missing attribute as (0, 0, 0),
  // normalize() makes it NaN and the lit colour comes out black (some grass meshes, e.g. the meadow tufts, draw as
  // dark strokes on WebGL this way). r171 substitutes an up normal instead (lit, pale): keep the classic result.
  const lit = !!(material && !material.flatShading && (material.isMeshStandardMaterial || material.isMeshLambertMaterial
    || material.isMeshPhongMaterial || material.isMeshToonMaterial || material.isMeshMatcapMaterial));
  return { toneMap: material?.toneMapped !== false, encode: true, fog: material?.fog !== false, litNeedsNormals: lit };
}

/** What a ShaderMaterial does: only the steps its fragment shader includes. */
export function classicOutputPolicyForShader(material) {
  const fragment = String(material?.fragmentShader || '');
  return {
    toneMap: material?.toneMapped !== false && /#include\s*<tonemapping_fragment>/.test(fragment),
    encode: /#include\s*<(?:colorspace|encodings)_fragment>/.test(fragment),
    fog: material?.fog === true && /#include\s*<fog_fragment>/.test(fragment),
  };
}

// classic fog factors over the view depth (vFogDepth = -mvPosition.z)
function fogNodesFor(fog, depth) {
  const color = reference('color', 'color', fog).setGroup(renderGroup);
  if (fog.isFogExp2) {
    const density = reference('density', 'float', fog).setGroup(renderGroup);
    return { color, factor: float(1).sub(exp(density.mul(density).mul(depth).mul(depth).negate())) };
  }
  return { color, factor: smoothstep(reference('near', 'float', fog).setGroup(renderGroup), reference('far', 'float', fog).setGroup(renderGroup), depth) };
}

/**
 * `colorNode` (a linear vec4: a material's `output`, or a node twin's fragment colour) finished the classic way.
 * Decided when the shader is built: screen or render target, the renderer's tone mapping and output colour space,
 * the scene's fog. webgpuSceneRenderer.js keys built shaders by the first three; three keys them by the fog.
 * `policy.fogDepth`: the view depth fog is measured at (default: the fragment's).
 */
export function classicOutput(colorNode, policy) {
  return Fn((builder) => {
    const renderer = builder.renderer;
    const toScreen = renderer.getRenderTarget() === null;
    if (policy.litNeedsNormals && builder.geometry?.hasAttribute?.('normal') === false) return vec4(0, 0, 0, vec4(colorNode).a);
    let color = vec4(colorNode);
    if (toScreen) {
      const toneMapping = policy.toneMap ? renderer.toneMapping : NoToneMapping;
      const colorSpace = policy.encode ? renderer.outputColorSpace : LinearSRGBColorSpace;
      if (toneMapping !== NoToneMapping || colorSpace !== LinearSRGBColorSpace) color = renderOutput(color, toneMapping, colorSpace);
    }
    const fog = policy.fog ? builder.scene?.fog : null;
    if (fog && (fog.isFog || fog.isFogExp2)) {
      const { color: fogColor, factor } = fogNodesFor(fog, policy.fogDepth || positionView.z.negate());
      // classic: the fog colour uniform is in the output colour space whenever the frame goes to the screen
      const encodeFog = toScreen && renderer.outputColorSpace === SRGBColorSpace;
      const outputFog = encodeFog ? renderOutput(vec4(fogColor, 1), NoToneMapping, SRGBColorSpace).rgb : fogColor;
      color = vec4(mix(color.rgb, outputFog, factor), color.a);
    }
    return color;
  })();
}

/** Give a converted classic material (three's node version of it) the classic output. */
export function applyClassicOutput(classic, nodeMaterial) {
  if (!nodeMaterial || nodeMaterial.__sceneClassicOutput) return nodeMaterial;
  const policy = classicOutputPolicyForMaterial(classic);
  if (nodeMaterial.fragmentNode) nodeMaterial.fragmentNode = classicOutput(nodeMaterial.fragmentNode, policy);
  else if (!nodeMaterial.outputNode) nodeMaterial.outputNode = classicOutput(output, policy);
  nodeMaterial.fog = false; // fog is part of the classic output above
  nodeMaterial.__sceneClassicOutput = true;
  return nodeMaterial;
}

/** Give a ShaderMaterial's node twin the output its GLSL had. */
export function applyClassicShaderOutput(classic, twin) {
  if (!twin || twin.__sceneClassicOutput) return twin;
  const policy = classicOutputPolicyForShader(classic);
  if (twin.fragmentNode) twin.fragmentNode = classicOutput(twin.fragmentNode, policy);
  else twin.outputNode = classicOutput(twin.outputNode || output, policy);
  twin.fog = false;
  twin.__sceneClassicOutput = true;
  return twin;
}

/** Key for a built shader: what classicOutput() decided from the renderer. */
export function classicOutputKey(renderer) {
  return renderer.getRenderTarget() === null ? `|out:s${renderer.toneMapping}${renderer.outputColorSpace}` : '|out:t';
}
