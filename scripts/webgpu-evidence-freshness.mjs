/** Supplemental freshness check for saved native WebGPU QA reports.
 * This does NOT validate renderer evidence; run the existing game/deployment
 * validators separately. Usage: node scripts/webgpu-evidence-freshness.mjs reports/*.json
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const STRICT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function validateEvidenceFreshness(reports, nowMs = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (!Array.isArray(reports) || reports.length === 0 ||
      !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
    return { ok: false, reason: 'invalid-freshness-input' };
  }
  for (let i = 0; i < reports.length; i++) {
    const checkedAt = reports[i]?.checkedAt;
    if (typeof checkedAt !== 'string' || !STRICT_UTC.test(checkedAt)) {
      return { ok: false, reason: 'invalid-check-time', reportIndex: i };
    }
    const timestamp = Date.parse(checkedAt);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== checkedAt) {
      return { ok: false, reason: 'invalid-check-time', reportIndex: i };
    }
    if (timestamp > nowMs + MAX_FUTURE_SKEW_MS) {
      return { ok: false, reason: 'future-check-time', reportIndex: i };
    }
    if (nowMs - timestamp > maxAgeMs) {
      return { ok: false, reason: 'stale-check-time', reportIndex: i };
    }
  }
  return { ok: true, reason: 'report-times-within-freshness-window',
    warning: 'Fresh timestamps do not prove native WebGPU, visible pixels, or trustworthy browser evidence.' };
}

export async function main(paths = process.argv.slice(2)) {
  if (!paths.length) throw new Error('Supply one or more saved browser QA JSON paths');
  const reports = await Promise.all(paths.map(async path => JSON.parse(await readFile(resolve(path), 'utf8'))));
  const result = validateEvidenceFreshness(reports);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('WebGPU QA freshness error: ' + error.message);
    process.exitCode = 1;
  });
}
