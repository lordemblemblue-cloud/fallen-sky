/** Static, conservative audit of Duelist's active telekinesis postprocessing. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DUELIST_WARP_PATH = 'src/components/duelist/client/warp.mjs';

export function auditDuelistWarp(source) {
  if (typeof source !== 'string') throw new TypeError('warp source must be a string');
  const blockers = [];
  if (/three\/examples\/jsm\/postprocessing\/EffectComposer\.js/.test(source)) blockers.push('WebGL EffectComposer');
  if (/three\/examples\/jsm\/postprocessing\/ShaderPass\.js/.test(source)) blockers.push('GLSL ShaderPass');
  if (/three\/examples\/jsm\/postprocessing\/OutputPass\.js/.test(source)) blockers.push('WebGL OutputPass');
  if (/\b(?:vertexShader|fragmentShader)\s*:/.test(source)) blockers.push('raw GLSL shader source');
  if (/\btexture2D\s*\(/.test(source)) blockers.push('GLSL texture2D sampling');
  return {
    scene: 'duelist-telekinesis',
    webgpuReady: blockers.length === 0,
    blockers,
    requiresVisualParity: ['outward ring', 'inward ring', 'held lens', 'chromatic fringe', 'glow'],
  };
}

export function auditCheckedInDuelistWarp() {
  const path = new URL('../' + DUELIST_WARP_PATH, import.meta.url);
  return auditDuelistWarp(readFileSync(path, 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = auditCheckedInDuelistWarp();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  // An audit finding is not a CI failure: this is a migration inventory.
}
