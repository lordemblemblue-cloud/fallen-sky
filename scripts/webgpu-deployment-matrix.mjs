/**
 * Require separate native-counter evidence for both current Emblem Blue games
 * on EACH deployment (preview and live). This is not pixel or GPU benchmarking.
 *
 * node scripts/webgpu-deployment-matrix.mjs \
 *   preview-fallen.json preview-duelist.json live-fallen.json live-duelist.json
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDualGameEvidence } from './webgpu-dual-game-evidence.mjs';

function fail(reason) { return { ok: false, reason }; }

function reportOrigin(report) {
  try {
    const url = new URL(report?.tabUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Positional inputs are [preview Fallen Sky, preview Duelist Adventure,
 * live Fallen Sky, live Duelist Adventure]. Never infer the environment
 * from a hostname: the operator must supply and label the correct reports.
 */
export function validateDeploymentMatrix(reports) {
  if (!Array.isArray(reports) || reports.length !== 4) return fail('four-reports-required');
  const preview = validateDualGameEvidence(reports.slice(0, 2));
  if (!preview.ok) return fail('preview:' + preview.reason);
  const live = validateDualGameEvidence(reports.slice(2, 4));
  if (!live.ok) return fail('live:' + live.reason);
  const previewOrigin = reportOrigin(reports[0]);
  const liveOrigin = reportOrigin(reports[2]);
  if (!previewOrigin || !liveOrigin) return fail('invalid-deployment-origin');
  if (previewOrigin === liveOrigin) return fail('preview-and-live-share-origin');
  return {
    ok: true,
    reason: 'preview-and-live-both-games-native-counter-evidence',
    previewOrigin,
    liveOrigin,
    warning: 'Labels and environment ownership are operator supplied. Review visible pixels, GPU device-loss recovery, fallback and performance on actual hardware before release.',
  };
}

export async function main(paths = process.argv.slice(2)) {
  if (paths.length !== 4) throw new Error(
    'Provide four JSON paths: preview Fallen Sky, preview Duelist Adventure, live Fallen Sky, live Duelist Adventure');
  const reports = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))));
  const result = validateDeploymentMatrix(reports);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('WebGPU deployment matrix QA error: ' + error.message);
    process.exitCode = 1;
  });
}
