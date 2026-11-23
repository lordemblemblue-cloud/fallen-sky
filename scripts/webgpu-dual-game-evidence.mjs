/**
 * Offline evidence gate for BOTH current Emblem Blue games. This does not run
 * a browser or certify visible pixels: it validates saved browser QA reports.
 * Usage: node scripts/webgpu-dual-game-evidence.mjs fallen.json duelist.json
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifySamplePair, SCENE_KEYS } from './webgpu-native-browser-qa.mjs';

const ROUTES = Object.freeze({
  'fallen-sky': '/gameview',
  'duelist-adventure': '/duelist-next/play',
});
const MAX_REPORT_GAP_MS = 60 * 60 * 1000;

function fail(reason) { return { ok: false, reason }; }

export function validateDualGameEvidence(reports) {
  if (!Array.isArray(reports) || reports.length !== 2) return fail('exactly-two-reports-required');
  const seen = new Set();
  const dates = [];
  const origins = new Set();
  for (const report of reports) {
    if (!report || typeof report !== 'object' || !Object.hasOwn(SCENE_KEYS, report.sceneId)) {
      return fail('invalid-scene-id');
    }
    if (seen.has(report.sceneId)) return fail('duplicate-scene-id');
    seen.add(report.sceneId);
    let url;
    try { url = new URL(report.tabUrl); } catch { return fail('invalid-tab-url:' + report.sceneId); }
    const route = ROUTES[report.sceneId];
    // Two passing sessions on different deployments (e.g. preview and live)
    // are not evidence that either deployment runs both games natively.
    // Origin includes the scheme, host and port, so localhost and HTTPS
    // production reports cannot be silently combined.
    origins.add(url.origin);
    // Remote HTTP is not a secure context for native WebGPU browser evidence.
    // Allow loopback HTTP for local QA, but require HTTPS for deployments.
    // Reject credential-bearing URLs rather than accepting/leaking tokens.
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password) {
      return fail('insecure-evidence-origin:' + report.sceneId);
    }
    if (url.pathname !== route && !url.pathname.startsWith(route + '/')) {
      return fail('wrong-playable-route:' + report.sceneId);
    }
    const checkedAt = report.checkedAt;
    if (typeof checkedAt !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(checkedAt)) {
      return fail('invalid-check-time:' + report.sceneId);
    }
    const timestamp = Date.parse(checkedAt);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== checkedAt) {
      return fail('invalid-check-time:' + report.sceneId);
    }
    dates.push(timestamp);
    if (report.first?.sceneId !== report.sceneId || report.last?.sceneId !== report.sceneId) {
      return fail('sample-scene-mismatch:' + report.sceneId);
    }
    // The browser probe verifies that both counter samples came from the same
    // document (URL and navigation start). Reclassifying counters alone would
    // otherwise accept a report whose tab navigated/reloaded between samples.
    // Fail closed for old reports that lack this required identity evidence.
    if (report.documentCheck?.ok !== true ||
      report.documentCheck.reason !== 'same-browser-document') {
      return fail('unverified-browser-document:' + report.sceneId);
    }
    const decision = classifySamplePair(report.first, report.last);
    if (!decision.ok || report.ok !== true || report.reason !== decision.reason) {
      return fail('unverified-native-evidence:' + report.sceneId + ':' + decision.reason);
    }
    // These files are evidence of renderer counters, not visible world pixels.
    // A screenshot path is not proof that someone visually inspected it.
  }
  if (origins.size !== 1) return fail('reports-from-different-origins');
  if (dates[0] > dates[1] + MAX_REPORT_GAP_MS || dates[1] > dates[0] + MAX_REPORT_GAP_MS) {
    return fail('reports-not-from-same-qa-window');
  }
  return { ok: true, reason: 'both-games-have-native-counter-evidence',
    warning: 'Physical screenshots, gameplay visibility, recovery and benchmarks still require human verification.' };
}

export async function main(paths = process.argv.slice(2)) {
  if (paths.length !== 2) throw new Error('Supply Fallen Sky and Duelist Adventure JSON report paths');
  const reports = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))));
  const result = validateDualGameEvidence(reports);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Dual-game WebGPU QA evidence error: ' + error.message);
    process.exitCode = 1;
  });
}
