import test from 'node:test';
import assert from 'node:assert/strict';
import { HUB_MODE_CARDS, findHubMode, canLaunchHubMode } from '../src/components/duelist/menu/hubModeCatalog.mjs';

test('every mode has a unique stable ID and readable details', () => {
  const ids = HUB_MODE_CARDS.map((mode) => mode.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(HUB_MODE_CARDS.every((mode) => mode.title && mode.description && mode.symbol));
});

test('Duel, Capture the Flag, TDM and Control are routed to existing pages', () => {
  for (const id of ['duel', 'ctf', 'tdm', 'control']) {
    assert.equal(findHubMode(id)?.route, id);
    assert.equal(canLaunchHubMode(id), true);
  }
});

test('practice, online, free-for-all and football preserve the live mode pages', () => {
  for (const id of ['practice', 'online', 'ffa', 'football']) {
    assert.equal(findHubMode(id)?.route, id);
    assert.equal(canLaunchHubMode(id), true);
  }
});

test('Transport is displayed but cannot launch a nonexistent mode', () => {
  const transport = findHubMode('transport');
  assert.equal(transport.title, 'TRANSPORT');
  assert.equal(transport.route, null);
  assert.equal(canLaunchHubMode('transport'), false);
});

test('unknown mode identifiers never gain a play route', () => {
  assert.equal(findHubMode('ranked'), null);
  assert.equal(canLaunchHubMode('ranked'), false);
  assert.equal(findHubMode(''), null);
});

test('mode cards cannot link to arbitrary paths', () => {
  for (const card of HUB_MODE_CARDS) {
    assert.ok(card.route === null || /^[a-z]+$/.test(card.route));
  }
});
