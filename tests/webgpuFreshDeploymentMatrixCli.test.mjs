import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('../scripts/webgpu-fresh-deployment-matrix.mjs', import.meta.url);
const run = paths => spawnSync(process.execPath, [script.pathname, ...paths], { encoding: 'utf8' });

test('CLI fails closed when four reports are not supplied', () => {
  const result = run([]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Supply four JSON reports/);
});

test('CLI fails closed when one report is malformed JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webgpu-matrix-'));
  try {
    const paths = [];
    for (let i = 0; i < 4; i++) {
      const path = join(dir, `report-${i}.json`);
      await writeFile(path, i === 3 ? '{invalid' : '{}');
      paths.push(path);
    }
    const result = run(paths);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /WebGPU fresh deployment evidence error:/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI rejects four syntactically valid but unverified reports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webgpu-matrix-'));
  try {
    const paths = [];
    for (let i = 0; i < 4; i++) {
      const path = join(dir, `report-${i}.json`);
      await writeFile(path, '{}');
      paths.push(path);
    }
    const result = run(paths);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
