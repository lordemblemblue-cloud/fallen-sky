import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultOutcome, resultsScoreText, VICTORY_HOLD_MS } from '../src/components/duelist/client/resultPresentation.mjs';

test('victory renders for player or winning team and never during an active match', () => {
  assert.equal(resultOutcome({ phase: 'live', winner: 'you' }), null);
  assert.equal(resultOutcome({ phase: 'over', winner: 'you' }), 'VICTORY');
  assert.equal(resultOutcome({ phase: 'over', winner: 'blue', me: { id: 'p1' } }, 'blue'), 'VICTORY');
  assert.equal(resultOutcome({ phase: 'over', winner: 'red', me: { id: 'p1' } }, 'blue'), 'DEFEAT');
  assert.equal(resultOutcome({ phase: 'over', winner: 'draw' }), 'DRAW');
  assert.equal(resultOutcome({ phase: 'over', winner: 'p1', me: { id: 'p1' } }), 'VICTORY');
  assert.equal(resultOutcome({ phase: 'over', winner: 'red', me: { id: 'p1' } }), 'DEFEAT');
});

test('scoreboard keeps authoritative mode-specific scores', () => {
  assert.equal(resultsScoreText({ mode: 'tdm', teamScores: { red: 8, blue: 7 } }), 'Red 8   •   7 Blue');
  assert.equal(resultsScoreText({ mode: 'control', teamScores: { red: 63.9, blue: 41.2 } }), 'Red 63%   •   41% Blue');
  assert.equal(resultsScoreText({ mode: 'ctf', teamScores: { red: 2, blue: 1 } }), 'Red 2   •   1 Blue');
  assert.equal(resultsScoreText({ mode: 'duel', teamScores: { red: 5, blue: 2 } }), '');
  assert.equal(resultsScoreText({ mode: 'football', teamScores: { red: 1, blue: 2 } }), 'Red 1   •   2 Blue');
});

test('victory ornament uses a transparent image and staged reveal', () => {
  const svg = readFileSync(new URL('../public/ui/duelist/glass-victory.svg', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/duelist/client/glassVictory.css', import.meta.url), 'utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /fill="url\(#glass\)"/);
  assert.doesNotMatch(svg, /<text[ >]/, 'Result text must remain dynamic DOM, not baked into the template');
  assert.ok(VICTORY_HOLD_MS >= 1500 && VICTORY_HOLD_MS <= 4000);
  assert.match(css, /duelist-win-burst/);
  assert.match(css, /duelist-win-sweep/);
  assert.match(css, /prefers-reduced-motion/);
});
