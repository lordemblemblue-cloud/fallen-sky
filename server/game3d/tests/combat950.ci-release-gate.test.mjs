import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../.github/workflows/game3d-combat-950.yml', import.meta.url), 'utf8');
const fullOfflineCommand = /^\s+node server\/game3d\/tools\/verifyCombatQuest851\.mjs\s*$/m;
const contractTestCommand = /^\s+node --test server\/game3d\/tests\/combat851\.offline\.test\.mjs\s*$/m;
const selfTestCommand = /^\s+node --test server\/game3d\/tests\/combat950\.ci-release-gate\.test\.mjs\s*$/m;

function hasUnskippedOfflineGate(workflow) {
  return fullOfflineCommand.test(workflow) &&
    !/^\s*continue-on-error:\s*true\s*$/m.test(workflow) &&
    !/^\s*node server\/game3d\/tools\/verifyCombatQuest851\.mjs\s*\|\|\s*true\s*$/m.test(workflow);
}

test('95.0 workflow executes the entire original 85.1 offline suite, not only its manifest test', () => {
  assert.match(source, contractTestCommand);
  assert.equal(hasUnskippedOfflineGate(source), true);
  assert.match(source, selfTestCommand);
});

test('manifest contract alone cannot authorize complete original-source CI evidence', () => {
  const contractOnly = source.replace(fullOfflineCommand, '');
  assert.match(contractOnly, contractTestCommand);
  assert.equal(hasUnskippedOfflineGate(contractOnly), false);
});

test('a commented-out or ignored full-suite command fails the CI gate', () => {
  assert.equal(hasUnskippedOfflineGate(source.replace(fullOfflineCommand,
    '          # node server/game3d/tools/verifyCombatQuest851.mjs')), false);
  assert.equal(hasUnskippedOfflineGate(source.replace(fullOfflineCommand,
    '          node server/game3d/tools/verifyCombatQuest851.mjs || true')), false);
  assert.equal(hasUnskippedOfflineGate(source + '\n      continue-on-error: true\n'), false);
});


function eventPathBlock(workflow, event) {
  const header = new RegExp('^  ' + event + ':[ \\t]*$', 'm');
  const found = header.exec(workflow);
  assert.ok(found, event + ' trigger is missing');
  const remaining = workflow.slice(found.index + found[0].length);
  const next = remaining.search(/^  [a-z][a-z_-]*:/m);
  const segment = next < 0 ? remaining : remaining.slice(0, next);
  const paths = segment.match(/^      - '[^']+'$/gm) ?? [];
  return paths.map(line => line.trim().slice(3, -1));
}

const expectedReleasePaths = [
  'server/game3d/**',
  'server/game3d/privateCombatQuestScheduler844.mjs',
  'server/game3d/tests/combat*.test.mjs',
  'server/game3d/tools/verifyCombatQuest851.mjs',
  '.github/workflows/game3d-combat-950.yml',
];
function triggersAllSourceAndTests(workflow) {
  const pr = eventPathBlock(workflow, 'pull_request');
  const push = eventPathBlock(workflow, 'push');
  return expectedReleasePaths.every(path => pr.includes(path) && push.includes(path))
    && pr.length === push.length && pr.every(path => push.includes(path));
}

test('95.0 PR and main triggers cover full offline manifest and CI-guard tests', () => {
  assert.equal(triggersAllSourceAndTests(source), true);
  const originalTestPaths = [
    'combat844.scheduler.test.mjs',
    'combat851.offline.test.mjs',
    'combat871.monotonic-clock.test.mjs',
    'combat873.post-input-lease.test.mjs',
    'combat950.ci-release-gate.test.mjs',
  ];
  for (const testFile of originalTestPaths) {
    assert.ok(/^combat[^/]*\.test\.mjs$/.test(testFile));
  }
});

test('a missing or narrow test trigger cannot silently skip the release gate', () => {
  // Replace the actual wildcard spelling in both event blocks.
  const onlyScheduler = source.replaceAll('combat*.test.mjs', 'combat844.scheduler.test.mjs');
  assert.equal(triggersAllSourceAndTests(onlyScheduler), false);
  assert.equal(triggersAllSourceAndTests(source.replaceAll(
    "      - 'server/game3d/tools/verifyCombatQuest851.mjs'\n", '')), false);
  const pushOnly = source.replace(
    "  push:\n    branches: [main]\n    paths:\n      # Include authority, authentication, quest, and persistence modules too.\n      - 'server/game3d/**'\n      - 'server/game3d/privateCombatQuestScheduler844.mjs'\n      - 'server/game3d/tests/combat*.test.mjs'\n",
    "  push:\n    branches: [main]\n    paths:\n      - 'server/game3d/privateCombatQuestScheduler844.mjs'\n",
  );
  assert.notEqual(pushOnly, source);
  assert.equal(triggersAllSourceAndTests(pushOnly), false);
});



test('95.0 release gate cannot omit unrelated Game 3D server authority changes', () => {
  // A scheduler-only path filter does not cover original authenticated
  // admission, quest projections, kill receipts, or persistence modules.
  const broad = "      - 'server/game3d/**'\n";
  const comment = '      # Include authority, authentication, quest, and persistence modules too.\n';
  const pushPrefix = '  push:\n    branches: [main]\n    paths:\n';
  assert.equal(source.split(broad).length - 1, 2,
    'both pull_request and push must include a broad server source trigger');
  assert.equal(triggersAllSourceAndTests(source.replace(broad, '')), false,
    'pull_request cannot narrow the source coverage');
  assert.ok(source.includes(pushPrefix + comment + broad));
  assert.equal(triggersAllSourceAndTests(source.replace(
    pushPrefix + comment + broad, pushPrefix)), false,
    'push cannot narrow the source coverage');
  assert.equal(triggersAllSourceAndTests(source.replaceAll(broad, '')), false);
});
