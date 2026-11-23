// Duelist Adventure's announcer (owner, 2026-11-22): the judge decides what to say and when
// (src/components/duelist/client/announcerJudge.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJudge, ANNOUNCER_LINES, LINE_RULES, ANNOUNCER_VOICES, TUNING } from '../src/components/duelist/client/announcerJudge.mjs';

const live = (extra = {}) => ({ mode: 'tdm', phase: 'live', scoreToWin: 30, clockLeft: 300, round: 1, teamScores: { red: 0, blue: 0 },
  people: [{ id: 'you', team: 'blue', defeats: 0 }, { id: 'foe', team: 'red', defeats: 0 }], ...extra });
const fighters = (youHp = 100, foeHp = 100, gap = 3) => [
  { id: 'you', team: 'blue', hp: youHp, max: 100, dead: youHp <= 0, x: 0, z: 0 },
  { id: 'foe', team: 'red', hp: foeHp, max: 100, dead: foeHp <= 0, x: 0, z: gap },
];
// what it says, over `seconds`, each line lasting `length` seconds
function speak(judge, from, seconds, length = 0.8, obs = null) {
  const out = [];
  for (let t = from; t < from + seconds; t += 0.05) {
    if (obs) judge.frame(t, obs);
    const pick = judge.next(t);
    if (pick) { out.push(pick.line); judge.said(pick.line, t, length); }
  }
  return out;
}

test('every line has its words and a rule, and the voices are the game\'s own', () => {
  for (const id of Object.keys(ANNOUNCER_LINES)) assert.ok(LINE_RULES[id], `${id} has a rule`);
  for (const id of Object.keys(LINE_RULES)) assert.ok(ANNOUNCER_LINES[id]?.say, `${id} has words`);
  assert.deepEqual(Object.keys(ANNOUNCER_VOICES), ['alice', 'daniel']);
  assert.equal(ANNOUNCER_LINES.victory.say, 'Victory.');
});

test('victory and defeat end the match, cutting in on a line being said', () => {
  const judge = createJudge({ me: 'you' });
  const view = live();
  judge.event({ type: 'defeat', by: 'you', who: 'foe' }, view, 0);
  const first = judge.next(0);
  assert.equal(first.line, 'firstBlood');
  judge.said(first.line, 0, 1.5);
  judge.event({ type: 'over', winner: 'blue' }, view, 0.2);
  const end = judge.next(0.2);
  assert.deepEqual(end, { line: 'victory', cut: true });
  const lost = createJudge({ me: 'you' });
  lost.event({ type: 'over', winner: 'red' }, view, 1);
  assert.equal(lost.next(1).line, 'defeat');
  const tie = createJudge({ me: 'you' });
  tie.event({ type: 'over', winner: 'draw' }, view, 1);
  assert.equal(tie.next(1).line, 'draw');
});

test('kills: a double that becomes a triple before it is said is called a triple; a streak; payback', () => {
  const judge = createJudge({ me: 'you' });
  const view = live({ mode: 'ffa', people: [{ id: 'you' }, { id: 'a' }, { id: 'b' }, { id: 'c' }] });
  judge.event({ type: 'defeat', by: 'a', who: 'b' }, view, 0); // first blood is someone else's
  judge.said(judge.next(0).line, 0, 3); // still saying it
  judge.event({ type: 'defeat', by: 'you', who: 'a' }, view, 1);
  judge.event({ type: 'defeat', by: 'you', who: 'b' }, view, 2);
  judge.event({ type: 'defeat', by: 'you', who: 'c' }, view, 2.5);
  const said = speak(judge, 3.1, 4);
  assert.ok(said.includes('tripleKill') && !said.includes('doubleKill'), said.join(', '));
  assert.ok(said.includes('streak3'), 'three in a row');
  // the one who took you down falls to you: payback
  judge.event({ type: 'defeat', by: 'c', who: 'you' }, view, 20);
  judge.event({ type: 'defeat', by: 'you', who: 'c' }, view, 30);
  assert.ok(speak(judge, 30, 3).includes('payback'));
});

test('close to death: one hit from defeat once a life; both on the edge is anyone\'s fight; an enemy one hit away', () => {
  const judge = createJudge({ me: 'you' });
  const view = live();
  let said = speak(judge, 0, 3, 0.8, { view, fighters: fighters(15, 80) });
  assert.deepEqual(said, ['nearDeath']);
  said = speak(judge, 3, 20, 0.8, { view, fighters: fighters(15, 80) });
  assert.deepEqual(said, [], 'not again this life');
  const both = createJudge({ me: 'you' });
  assert.deepEqual(speak(both, 0, 3, 0.8, { view, fighters: fighters(20, 25) }), ['bothLow']);
  const theirs = createJudge({ me: 'you' });
  assert.deepEqual(speak(theirs, 0, 3, 0.8, { view, fighters: fighters(80, 15) }), ['foeNearDeath']);
  // nobody near: nothing to say
  const alone = createJudge({ me: 'you' });
  assert.deepEqual(speak(alone, 0, 3, 0.8, { view, fighters: fighters(15, 80, TUNING.near + 5) }), []);
});

test('a close call, and a clutch kill made on the edge', () => {
  const judge = createJudge({ me: 'you' });
  const view = live();
  speak(judge, 0, 1, 0.5, { view, fighters: fighters(10, 90, 30) });
  assert.deepEqual(speak(judge, 1, 2, 0.5, { view, fighters: fighters(40, 90, 30) }), ['closeCall'], 'healed back from the edge');
  const clutch = createJudge({ me: 'you' });
  clutch.frame(0, { view, fighters: fighters(12, 10) });
  clutch.event({ type: 'defeat', by: 'you', who: 'foe' }, view, 0.1);
  assert.ok(speak(clutch, 0.1, 3).includes('clutch'));
});

test('a line that waited too long is let go, and none comes back before its time', () => {
  const judge = createJudge({ me: 'you' });
  const view = live();
  judge.event({ type: 'fight' }, view, 0);
  judge.said('fight', 0, 5); // talking for five seconds
  judge.event({ type: 'defeat', by: 'you', who: 'foe' }, view, 0.5); // first blood waits ... too long
  assert.deepEqual(speak(judge, 5.4, 2), []);
  const again = createJudge({ me: 'you' });
  again.frame(0, { view, fighters: fighters(20, 20) });
  assert.equal(again.next(0).line, 'bothLow');
  again.said('bothLow', 0, 1);
  assert.deepEqual(speak(again, 2, LINE_RULES.bothLow[1] - 3, 1, { view, fighters: fighters(20, 20) }), []);
});

test('a duel: the round, the last round, match point, and how a round ends', () => {
  const judge = createJudge({ me: 'you' });
  const duel = (wins, phase = 'live', round = 1) => ({ mode: 'duel', phase, round, rounds: 3, scoreToWin: null, clockLeft: 90,
    people: [{ id: 'you', roundWins: wins[0] }, { id: 'foe', roundWins: wins[1] }] });
  judge.frame(0, { view: duel([0, 0], 'countdown'), fighters: fighters() });
  judge.event({ type: 'fight', round: 1 }, duel([0, 0]), 2);
  assert.deepEqual(speak(judge, 0, 4), ['roundOne', 'fight']);
  judge.event({ type: 'roundOver', round: 1, winner: 'you' }, duel([1, 0]), 10);
  assert.deepEqual(speak(judge, 10, 2), ['roundWon']);
  judge.event({ type: 'round', round: 3 }, duel([2, 1], 'countdown', 3), 20);
  assert.deepEqual(speak(judge, 20, 3), ['roundThree', 'matchPoint']);
  judge.event({ type: 'round', round: 5 }, duel([2, 2], 'countdown', 5), 40);
  assert.deepEqual(speak(judge, 40, 3), ['finalRound']);
});

test('the clock and match point are called once', () => {
  const judge = createJudge({ me: 'you' });
  judge.frame(0, { view: live({ clockLeft: 31 }), fighters: fighters() });
  judge.frame(1, { view: live({ clockLeft: 29.9 }), fighters: fighters() });
  assert.equal(judge.next(1).line, 'thirtySeconds');
  judge.said('thirtySeconds', 1, 1);
  judge.frame(3, { view: live({ clockLeft: 28, teamScores: { red: 29, blue: 10 } }), fighters: fighters() });
  assert.equal(judge.next(3).line, 'matchPoint');
  judge.said('matchPoint', 3, 1);
  judge.frame(5, { view: live({ clockLeft: 27, teamScores: { red: 29, blue: 10 } }), fighters: fighters() });
  assert.equal(judge.next(5), null);
});

test('a comeback, and an execution by the player', () => {
  const judge = createJudge({ me: 'you' });
  judge.frame(0, { view: live({ teamScores: { red: 12, blue: 6 } }), fighters: fighters() });
  judge.frame(1, { view: live({ teamScores: { red: 14, blue: 15 } }), fighters: fighters() });
  assert.equal(judge.next(1).line, 'comeback');
  judge.effect({ type: 'execution', attacker: 'you', defender: 'foe' }, 2);
  judge.effect({ type: 'execution', attacker: 'foe', defender: 'you' }, 2);
  assert.deepEqual(speak(judge, 3, 2), ['executed']);
});
