/**
 * Conservative source inventory for WebGPU migration planning.
 * Matches source constructs, not runtime compatibility; results require manual review.
 * Ignores comments and string literals so documentation examples are not flagged.
 */
const RULES = [
  ['ShaderMaterial', /\b(?:THREE\.)?ShaderMaterial\b/g],
  ['RawShaderMaterial', /\b(?:THREE\.)?RawShaderMaterial\b/g],
  ['onBeforeCompile', /\bonBeforeCompile\b/g],
  ['EffectComposer', /\bEffectComposer\b/g],
  ['ShaderPass', /\bShaderPass\b/g],
  ['WebGLRenderTarget', /\bWebGL(?:Multiple)?RenderTarget\b/g],
  ['getContext', /\.getContext\s*\(/g],
  ['glsl', /\b(?:vertexShader|fragmentShader|glslVersion)\s*:/g],
];

/** Masks comments and quoted strings while preserving line breaks and offsets. */
export function maskNonCode(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/g, (part) =>
    part.replace(/[^\n]/g, ' '));
}

export function auditShaderSource(source, path = '<unknown>') {
  const clean = maskNonCode(source);
  const hits = [];
  for (const [kind, pattern] of RULES) {
    for (const match of clean.matchAll(pattern)) {
      const line = clean.slice(0, match.index).split('\n').length;
      hits.push({ path, line, kind });
    }
  }
  return hits.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));
}
