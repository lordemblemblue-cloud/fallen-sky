import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidenceFreshness, DEFAULT_MAX_AGE_MS, MAX_FUTURE_SKEW_MS } from '../scripts/webgpu-evidence-freshness.mjs';

const now = Date.parse('2026-11-23T05:00:00.000Z');
const report = (time) => ({ checkedAt: new Date(time).toISOString() });
test('accepts recent reports including exact age boundary', () => {
  assert.equal(validateEvidenceFreshness([report(now), report(now - DEFAULT_MAX_AGE_MS)], now).ok, true);
});
test('rejects stale reports and identifies offending report', () => {
  assert.deepEqual(validateEvidenceFreshness([report(now), report(now - DEFAULT_MAX_AGE_MS - 1)], now),
    { ok: false, reason: 'stale-check-time', reportIndex: 1 });
});
test('rejects timestamps beyond permitted clock skew', () => {
  assert.equal(validateEvidenceFreshness([report(now + MAX_FUTURE_SKEW_MS)], now).ok, true);
  assert.equal(validateEvidenceFreshness([report(now + MAX_FUTURE_SKEW_MS + 1)], now).reason, 'future-check-time');
});
test('rejects malformed, noncanonical and impossible timestamps', () => {
  for (const value of ['2026-11-23', '2026-11-23T05:00:00Z', '2026-02-30T05:00:00.000Z', null]) {
    assert.equal(validateEvidenceFreshness([{ checkedAt: value }], now).reason, 'invalid-check-time');
  }
});
test('rejects empty or invalid input and invalid time configuration', () => {
  assert.equal(validateEvidenceFreshness([], now).reason, 'invalid-freshness-input');
  assert.equal(validateEvidenceFreshness([report(now)], Infinity).reason, 'invalid-freshness-input');
  assert.equal(validateEvidenceFreshness([report(now)], now, 0).reason, 'invalid-freshness-input');
});

test('custom freshness windows reject stale reports without changing the default window', () => {
  const recent = report(now - 30 * 60 * 1000);
  assert.equal(validateEvidenceFreshness([recent], now).ok, true);
  assert.deepEqual(validateEvidenceFreshness([recent], now, 15 * 60 * 1000),
    { ok: false, reason: 'stale-check-time', reportIndex: 0 });
  assert.equal(validateEvidenceFreshness([recent], now, 30 * 60 * 1000).ok, true);
  for (const invalid of [-1, Number.NaN, Infinity]) {
    assert.equal(validateEvidenceFreshness([recent], now, invalid).reason, 'invalid-freshness-input');
  }
});

test('checks every report and fails closed when later evidence is malformed', () => {
  const good = report(now - 1000);
  assert.deepEqual(
    validateEvidenceFreshness([good, good, { checkedAt: 'not-a-date' }], now),
    { ok: false, reason: 'invalid-check-time', reportIndex: 2 },
  );
  assert.deepEqual(
    validateEvidenceFreshness([good, null], now),
    { ok: false, reason: 'invalid-check-time', reportIndex: 1 },
  );
});

test('CLI fails closed on stale, malformed, and missing report files', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const script = fileURLToPath(new URL('../scripts/webgpu-evidence-freshness.mjs', import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), 'webgpu-freshness-'));
  try {
    const valid = join(dir, 'valid.json');
    const stale = join(dir, 'stale.json');
    const malformed = join(dir, 'malformed.json');
    await writeFile(valid, JSON.stringify(report(Date.now() - 1000)));
    await writeFile(stale, JSON.stringify(report(Date.now() - DEFAULT_MAX_AGE_MS - 60000)));
    await writeFile(malformed, '{broken json');
    const run = (...paths) => spawnSync(process.execPath, [script, ...paths], { encoding: 'utf8' });
    const good = run(valid);
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).ok, true);
    const bad = run(valid, stale);
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).reason, 'stale-check-time');
    assert.equal(JSON.parse(bad.stdout).reportIndex, 1);
    assert.equal(run(malformed).status, 1);
    assert.equal(run(join(dir, 'missing.json')).status, 1);
    assert.equal(run().status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI rejects future and noncanonical timestamps across multiple reports', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const script = fileURLToPath(new URL('../scripts/webgpu-evidence-freshness.mjs', import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), 'webgpu-freshness-matrix-'));
  try {
    const paths = ['good-a.json', 'good-b.json', 'future.json', 'noncanonical.json']
      .map(name => join(dir, name));
    const time = Date.now();
    await Promise.all([
      writeFile(paths[0], JSON.stringify(report(time - 2000))),
      writeFile(paths[1], JSON.stringify(report(time - 1000))),
      writeFile(paths[2], JSON.stringify(report(time + MAX_FUTURE_SKEW_MS + 60000))),
      writeFile(paths[3], JSON.stringify({ checkedAt: new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z') })),
    ]);
    const run = (...files) => spawnSync(process.execPath, [script, ...files], { encoding: 'utf8' });
    const valid = run(paths[0], paths[1]);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).ok, true);
    const future = run(paths[0], paths[2]);
    assert.equal(future.status, 1);
    assert.deepEqual(
      { reason: JSON.parse(future.stdout).reason, reportIndex: JSON.parse(future.stdout).reportIndex },
      { reason: 'future-check-time', reportIndex: 1 },
    );
    const malformed = run(paths[0], paths[3]);
    assert.equal(malformed.status, 1);
    assert.equal(JSON.parse(malformed.stdout).reason, 'invalid-check-time');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
