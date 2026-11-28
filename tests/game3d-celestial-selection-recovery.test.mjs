import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const jsx = read('../src/components/game3d/CharacterLoginScreen.jsx');
const css = read('../src/components/game3d/CharacterCelestialSelection.css');

test('post-server selection retains owner-approved celestial theme wiring', () => {
  assert.match(jsx, /import '\.\/CharacterCelestialSelection\.css'/);
  assert.ok(jsx.includes("data-selection-theme={step==='select'?'celestial-v2':undefined}"));
  assert.ok(jsx.includes('axe-chronicle-intro axe-celestial-identity'));
  assert.ok(jsx.includes('axe-celestial-medallion'));
  assert.ok(jsx.includes('SelectedCharacterArmorPreview'));
  assert.ok(jsx.includes('ENTER WORLD'));
});

test('celestial scene and transparent information rail are scoped to selection', () => {
  const scope = '[data-entry-step="select"][data-selection-theme="celestial-v2"]';
  assert.ok(css.includes(scope + ' .axe-login-scene {'));
  assert.ok(css.includes('6441dedadbf552e1a9782302a29003db'));
  assert.ok(css.includes(scope + ' .axe-login-stats-panel.axe-login-info-rail'));
  assert.ok(css.includes('background:none;box-shadow:none;border:0;backdrop-filter:none'));
  assert.ok(css.includes('prefers-reduced-motion:reduce'));
});

test('creation and faction retain the same celestial art while using existing controls', () => {
  assert.ok(css.includes('[data-entry-step="creator"] .axe-login-scene'));
  assert.ok(css.includes('[data-entry-step="faction"] .axe-login-scene'));
  assert.ok(css.includes('[data-entry-step="creator"] .axe-login-creator-inworld .creator-save'));
  assert.ok(jsx.includes('<CharacterCreationModal embedded factionId={selectedFaction}'));
  assert.ok(jsx.includes('setStep(\'select\')'));
});
test('vital meter uses recorded maximum and never fabricates missing values', () => {
  assert.ok(jsx.includes('Number.isFinite(maximum) && maximum > 0'));
  assert.ok(jsx.includes('celestialFraction(selected.chi ?? selected.currentChi,selected.maxChi)'));
  assert.ok(css.includes('.axe-celestial-meter-row'));
});
