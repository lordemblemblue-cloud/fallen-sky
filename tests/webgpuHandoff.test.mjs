import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const handoff = readFileSync(new URL('../docs/webgpu/AGENT_HANDOFF.md', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/webgpu-ci.yml', import.meta.url), 'utf8');

test('handoff includes game ownership and branch safety rules', () => {
  for (const token of ['Fallen Sky', 'Duelist Adventure', 'AGENTS.md', '#109', '#110', '#111', 'draft PR', 'WebGL']) {
    assert.ok(handoff.includes(token), `Missing handoff token: ${token}`);
  }
});
test('CI executes unit tests, lint and build', () => {
  for (const command of ['npm ci', 'node --test tests/*.test.mjs', 'npm run lint', 'npm run build']) {
    assert.ok(workflow.includes(command), `Missing CI command: ${command}`);
  }
});
test('CI requires read-only repository access', () => {
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(workflow, /pull-requests: write|contents: write/);
});
