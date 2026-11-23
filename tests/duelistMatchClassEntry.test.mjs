import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_CHOICE_PROMPT_SECONDS, shouldShowMatchClassPicker, classChoiceSecondsLeft,
} from '../src/components/duelist/client/matchClassEntry.mjs';

const modes = ['practice', 'duel', 'ffa', 'tdm', 'ctf', 'escort', 'football', 'control'];
for (const mode of modes) {
  test(`${mode}: first entry stays open throughout countdown and play until class is selected`, () => {
    for (const phase of ['countdown', 'roundOver', 'live']) {
      assert.equal(shouldShowMatchClassPicker({ match: { mode, phase }, confirmed: false }), true);
      assert.equal(shouldShowMatchClassPicker({ match: { mode, phase }, confirmed: true }), false);
      assert.equal(shouldShowMatchClassPicker({
        match: { mode, phase }, confirmed: true, manuallyOpened: true,
      }), true);
    }
    assert.equal(shouldShowMatchClassPicker({ match: { mode, phase: 'over' } }), false);
  });
}

test('story missions and uninitialized matches never show the match picker', () => {
  assert.equal(shouldShowMatchClassPicker({ match: null }), false);
  assert.equal(shouldShowMatchClassPicker({ match: { phase: 'countdown' }, mission: true }), false);
});

test('five-second entry clock is advisory and never auto-selects or closes the picker', () => {
  const start = 1000;
  assert.equal(CLASS_CHOICE_PROMPT_SECONDS, 5);
  assert.equal(classChoiceSecondsLeft(start, start), 5);
  assert.equal(classChoiceSecondsLeft(start, start + 1000), 4);
  assert.equal(classChoiceSecondsLeft(start, start + 4999), 1);
  assert.equal(classChoiceSecondsLeft(start, start + 5000), 0);
  assert.equal(classChoiceSecondsLeft(start, start + 10000), 0);
  assert.equal(shouldShowMatchClassPicker({ match: { phase: 'live' }, confirmed: false }), true);
});

test('invalid and missing clock samples do not crash the prompt', () => {
  for (const value of [NaN, Infinity, undefined, null, '1234']) {
    assert.equal(classChoiceSecondsLeft(value, 3000), 5);
    assert.equal(classChoiceSecondsLeft(3000, value), 5);
  }
});
