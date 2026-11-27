/** Combined offline gate for the four native WebGPU browser reports.
 * Both deployment coverage and capture freshness must pass. This is not a
 * browser test, screenshot inspection, or performance certification.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeploymentMatrix } from './webgpu-deployment-matrix.mjs';
import { validateEvidenceFreshness } from './webgpu-evidence-freshness.mjs';

export function validateFreshDeploymentMatrix(reports, nowMs = Date.now()) {
  const matrix = validateDeploymentMatrix(reports);
  if (!matrix.ok) return matrix;
  const freshness = validateEvidenceFreshness(reports, nowMs);
  if (!freshness.ok) return { ...freshness, reason: 'freshness:' + freshness.reason };
  return { ...matrix, freshness: freshness.reason };
}

export async function main(paths = process.argv.slice(2)) {
  if (paths.length !== 4) throw new Error('Supply four JSON reports: preview Fallen, preview Duelist, live Fallen, live Duelist');
  const reports = await Promise.all(paths.map(async path => JSON.parse(await readFile(resolve(path), 'utf8'))));
  const result = validateFreshDeploymentMatrix(reports);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('WebGPU fresh deployment evidence error: ' + error.message);
    process.exitCode = 1;
  });
}
