/**
 * Static WebGPU porting inventory for Fallen Sky's active ink-wash postprocess.
 * This is NOT a runtime capability test, shader compiler or readiness switch.
 * Avoid false positives from comments by checking only source text after stripping
 * JavaScript comments (preserving shader template literal bodies).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INK_PASS_FILE = 'src/components/game3d/render/inkWashLook.js';

export const INK_PORT_BLOCKERS = Object.freeze({
  glslFragment: Object.freeze({ expression: /const\s+FRAGMENT\s*=\s*(?:\/\*\s*glsl\s*\*\/\s*)?`/, detail: 'GLSL fragment source requires a WebGPU-compatible TSL/node-material replacement' }),
  glslVertex: Object.freeze({ expression: /const\s+VERTEX\s*=\s*(?:\/\*\s*glsl\s*\*\/\s*)?`/, detail: 'GLSL vertex source requires a WebGPU-compatible full-screen pass' }),
  shaderMaterial: Object.freeze({ expression: /\b(?:new\s+THREE\.)?(?:RawShaderMaterial|ShaderMaterial)\s*\(/, detail: 'Legacy shader material must not be assumed compatible with WebGPURenderer' }),
  renderTarget: Object.freeze({ expression: /\b(?:new\s+THREE\.)?WebGLRenderTarget\s*\(/, detail: 'Render-target setup and depth attachment require backend parity testing' }),
  depthTexture: Object.freeze({ expression: /\b(?:new\s+THREE\.)?DepthTexture\s*\(/, detail: 'Depth sampling/packing and camera near/far parity require validation' }),
  texture2D: Object.freeze({ expression: /\btexture2D\s*\(/, detail: 'GLSL texture sampling requires a WebGPU-compatible shader path' }),
  glFragColor: Object.freeze({ expression: /\bgl_FragColor\b/, detail: 'GLSL fragment output is not a WebGPU TSL output' }),
  glslPacking: Object.freeze({ expression: /#include\s*<packing>/, detail: 'Depth packing/unpacking must be ported with matching precision' }),
  setRenderTarget: Object.freeze({ expression: /\brenderer\.setRenderTarget\s*\(/, detail: 'Render-target binding and restoration require parity tests' }),
});

/** Return each blocker with 1-based line numbers. Never assert readiness from a clean scan. */
export function inventoryInkPass(source) {
  if (typeof source !== 'string') throw new TypeError('ink pass source must be a string');
  const lines = source.split(/\r?\n/);
  const findings = {};
  for (const [id, rule] of Object.entries(INK_PORT_BLOCKERS)) {
    const locations = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Ignore ordinary comment lines; inline GLSL within template strings is
      // deliberately inspected, including preprocessor directives.
      if (/^\s*(?:\/\/|\*)/.test(line)) continue;
      if (rule.expression.test(line)) locations.push(i + 1);
    }
    findings[id] = Object.freeze({ detail: rule.detail, lines: locations });
  }
  return findings;
}

export function summarizeInkPass(findings) {
  const blockers = Object.entries(findings).filter(([, entry]) => entry.lines.length > 0);
  return { blockerTypes: blockers.length, occurrences: blockers.reduce((sum, [, entry]) => sum + entry.lines.length, 0), webgpuValidated: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(process.argv[2] || INK_PASS_FILE);
  const findings = inventoryInkPass(readFileSync(path, 'utf8'));
  console.log(JSON.stringify({ file: path, summary: summarizeInkPass(findings), findings }, null, 2));
}
