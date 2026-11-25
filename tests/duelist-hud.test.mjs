// The match HUD's logic and templates (the owner's spec of 2026-11-20): what the kill feed and the banners announce
// (client/hudFeed.mjs), the level under the portrait (client/progress.mjs), and the transparent frames
// (public/ui/duelist/hud, tools/duelist/hud-templates.mjs). The HUD itself (client/DuelistHud.jsx) is checked in
// the browser.
/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHudFeed, matchPointOf, BANNER_SECONDS, KILL_ROW_SECONDS, KILL_ROWS } from '../src/components/duelist/client/hudFeed.mjs';
import { levelFrom, xpForEvent, xpToNext, XP } from '../src/components/duelist/client/progress.mjs';
import { createMatch, stepMatch, matchView } from '../src/components/duelist/sim/match.mjs';

const names = { you: 'You', ally: 'Maren', foe: 'Kestrel', foe2: 'Oren' };
const teams = { you: 'blue', ally: 'blue', foe: 'red', foe2: 'red' };
const ctx = { me: 'you', myTeam: 'blue', nameOf: (id) => names[id], teamOf: (id) => teams[id], classOf: () => 'duelist' };
const text = (b) => (b ? `${b.tone}: ${b.text}` : null);

test('the kill feed keeps the last five eliminations for a few seconds, with names, teams and classes', () => {
  const feed = createHudFeed();
  for (let i = 0; i < 7; i++) feed.event({ type: 'defeat', by: i % 2 ? 'foe' : 'ally', who: i % 2 ? 'ally' : 'foe' }, i, ctx);
  const rows = feed.kills(6.5);
  assert.equal(rows.length, KILL_ROWS);
  assert.deepEqual({ by: rows.at(-1).byName, who: rows.at(-1).whoName, byTeam: rows.at(-1).byTeam, whoTeam: rows.at(-1).whoTeam, cls: rows.at(-1).byClass, mine: rows.at(-1).mine },
    { by: 'Maren', who: 'Kestrel', byTeam: 'blue', whoTeam: 'red', cls: 'duelist', mine: false });
  feed.event({ type: 'defeat', by: 'you', who: 'foe' }, 7, ctx);
  assert.equal(feed.kills(7.1).at(-1).mine, true, 'your own are marked');
  assert.equal(feed.kills(7 + KILL_ROW_SECONDS + 0.1).length, 0, 'rows fade');
  feed.event({ type: 'defeat', by: null, who: 'ally' }, 20, ctx);
  assert.equal(feed.kills(20.1).length, 0, 'a fall nobody caused is not a kill');
});

test('personal sapphire kill announcements distinguish rapid chains from life streaks; other player feed stays intact', () => {
  const feed = createHudFeed();
  let t = 0;
  const kill = (by, who, delay = 1) => { t += delay; feed.event({ type: 'defeat', by, who, at: t }, t, ctx); return feed.banners(t + 0.1); };
  assert.equal(kill('you', 'foe').kill.text, 'KO');
  assert.equal(kill('you', 'foe2').kill.text, 'DOUBLE KILL');
  const triple = kill('you', 'foe').kill;
  assert.equal(triple.text, 'TRIPLE KILL');
  assert.equal(triple.subtitle, 'KILLING SPREE');
  assert.equal(kill('you', 'foe2', 10).kill.text, 'KO');
  assert.equal(kill('you', 'foe', 10).kill.text, 'SLAUGHTER');
  assert.equal(kill('you', 'foe2', 10).kill.text, 'KO');
  assert.equal(kill('you', 'foe', 10).kill.text, 'UNSTOPPABLE');
  for (let i = 8; i <= 12; i++) {
    const b = kill('you', 'foe', 10).kill;
    if(i === 10) assert.equal(b.text, 'UNTOUCHABLE');
    if(i === 12) assert.equal(b.text, 'GODLIKE');
  }
  kill('foe', 'you', 10);
  assert.equal(feed.streakOf('you'), 0);
  assert.equal(kill('you', 'foe2').kill.text, 'KO');
  t += 10;
  for (let i = 0; i < 3; i++) kill('foe', 'ally');
  assert.equal(text(feed.banners(t + 0.1).event), null);
  assert.equal(kill('foe', 'ally').event.text, 'KESTREL: 5 KILL STREAK');
  t += 10;
  for (let i = 0; i < 4; i++) kill('ally', 'foe2');
  assert.equal(kill('ally', 'foe2').event.text, 'MAREN: 5 KILL STREAK');
});

test('Capture the Flag: each flag event has its banner, and the indicator shows returned and captured for a moment', () => {
  const feed = createHudFeed();
  const say = (e, at) => { feed.event(e, at, ctx); return feed.banners(at + 0.1); };
  assert.equal(text(say({ type: 'flagTaken', team: 'red', by: 'ally' }, 1).objective), 'good: ENEMY FLAG TAKEN');
  assert.equal(text(say({ type: 'flagTaken', team: 'red', by: 'you' }, 5).objective), 'gold: YOU HAVE THE FLAG: TAKE IT HOME');
  assert.equal(text(say({ type: 'flagTaken', team: 'blue', by: 'foe' }, 10).objective), 'bad: YOUR FLAG HAS BEEN TAKEN');
  assert.equal(text(say({ type: 'flagDropped', team: 'blue', by: 'foe' }, 15).objective), 'neutral: YOUR FLAG HAS BEEN DROPPED');
  assert.equal(text(say({ type: 'flagReturned', team: 'blue', by: 'ally' }, 20).objective), 'good: FLAG RETURNED');
  assert.equal(feed.flagState('blue', 'home', 20.5), 'returned');
  assert.equal(feed.flagState('blue', 'home', 20 + BANNER_SECONDS + 0.1), 'home');
  assert.equal(feed.flagState('red', 'carried', 21), 'taken', 'the match\'s "carried" reads as taken');
  assert.equal(feed.flagState('red', 'dropped', 21), 'dropped');
  assert.equal(text(say({ type: 'captured', team: 'blue', by: 'ally' }, 30).event), 'good: MAREN SCORED!');
  assert.equal(feed.flagState('red', 'home', 30.5), 'captured', 'the flag that was brought home');
  assert.equal(text(say({ type: 'captured', team: 'red', by: 'foe' }, 40).event), 'bad: KESTREL SCORED!');
  assert.equal(feed.banners(40 + BANNER_SECONDS + 0.2).event, null, 'banners fade');
});

test('Three-Point Control: captured, lost, contested and all three, from the events and the view', () => {
  const feed = createHudFeed();
  const points = (a, b, c, contested = null) => [['A', a], ['B', b], ['C', c]].map(([id, owner]) => ({ id, owner, capturing: null, progress: 0, contested: contested === id }));
  const view = (v, at) => { feed.view({ mode: 'control', phase: 'live', round: 1, teamScores: { blue: 0, red: 0 }, ...v }, at, ctx); return feed.banners(at + 0.05); };
  assert.equal(text(view({ controlPoints: points(null, null, null) }, 0).objective), 'neutral: HOLD TWO POINTS TO SCORE');
  feed.event({ type: 'pointCaptured', point: 'A', team: 'blue' }, 5, ctx);
  assert.equal(text(feed.banners(5.1).objective), 'good: POINT A CAPTURED');
  view({ controlPoints: points('blue', null, null) }, 6);
  feed.event({ type: 'pointCaptured', point: 'B', team: 'red' }, 10, ctx);
  assert.equal(text(feed.banners(10.1).objective), 'bad: ENEMY CAPTURED POINT B');
  feed.event({ type: 'pointCaptured', point: 'A', team: 'red' }, 15, ctx);
  assert.equal(text(feed.banners(15.1).objective), 'bad: POINT A LOST');
  assert.equal(text(view({ controlPoints: points('red', 'red', null, 'C') }, 20).objective), 'gold: POINT C CONTESTED');
  assert.equal(text(view({ controlPoints: points('red', 'red', null, 'C') }, 21).objective), 'gold: POINT C CONTESTED', 'said once while it lasts');
  assert.equal(text(view({ controlPoints: points('red', 'red', 'red') }, 30).event), 'bad: ENEMY CONTROLS ALL THREE POINTS');
  assert.equal(text(view({ controlPoints: points('blue', 'blue', 'blue') }, 40).event), 'good: ALL THREE POINTS CONTROLLED');
  assert.equal(text(view({ controlPoints: [{ id: 'C', owner: null, contested: true }] }, 50).objective), 'gold: CONTESTING POINT', 'a single point');
});

test('match point, round results, and a fresh feed when the room plays again', () => {
  assert.equal(matchPointOf({ mode: 'ctf', phase: 'live', scoreToWin: 3, teamScores: { blue: 2, red: 0 } }), 'blue');
  assert.equal(matchPointOf({ mode: 'ctf', phase: 'live', scoreToWin: 3, teamScores: { blue: 1, red: 1 } }), null);
  assert.equal(matchPointOf({ mode: 'control', phase: 'live', teamScores: { blue: 40, red: 91 } }), 'red');
  assert.equal(matchPointOf({ mode: 'tdm', phase: 'over', scoreToWin: 10, teamScores: { blue: 9, red: 0 } }), null);
  assert.equal(matchPointOf({ mode: 'duel', phase: 'live', rounds: 3, people: [{ id: 'you', roundWins: 1 }, { id: 'foe', roundWins: 0 }] }), 'you');
  assert.equal(matchPointOf({ mode: 'ffa', phase: 'live', scoreToWin: 10, people: [{ id: 'you', defeats: 3 }, { id: 'foe', defeats: 9 }] }), 'foe');
  const feed = createHudFeed();
  const live = { mode: 'ctf', phase: 'live', round: 1, scoreToWin: 3, teamScores: { blue: 2, red: 0 } };
  feed.view(live, 10, ctx);
  assert.equal(text(feed.banners(10.1).event), 'gold: MATCH POINT: BLUE');
  feed.view(live, 11, ctx);
  assert.equal(feed.banners(10 + BANNER_SECONDS + 1).event, null, 'announced once');
  feed.event({ type: 'roundOver', round: 1, winner: 'you' }, 20, ctx);
  assert.equal(text(feed.banners(20.1).event), 'gold: ROUND WON');
  feed.event({ type: 'roundOver', round: 2, winner: 'foe' }, 30, ctx);
  assert.equal(text(feed.banners(30.1).event), 'bad: ROUND LOST');
  feed.event({ type: 'defeat', by: 'you', who: 'foe' }, 31, ctx);
  feed.view({ ...live, phase: 'over' }, 32, ctx);
  feed.view({ ...live, phase: 'countdown', teamScores: { blue: 0, red: 0 } }, 44, ctx);
  assert.equal(feed.kills(44.1).length, 0);
  assert.equal(feed.streakOf('you'), 0);
});

test('a real Capture the Flag match feeds the HUD: its own events and view produce banners and kill rows', () => {
  const m = createMatch({ mode: 'ctf', seed: 7, players: [{ id: 'you', name: 'You', classId: 'warrior' }] });
  const feed = createHudFeed();
  const seat = (id) => m.seats.get(id);
  const live = { me: 'you', myTeam: seat('you').team, nameOf: (id) => seat(id)?.name, teamOf: (id) => seat(id)?.team, classOf: (id) => seat(id)?.classId };
  const said = new Set();
  let kills = 0;
  for (let i = 0; i < 60 * 240 && m.phase !== 'over'; i++) {
    const { events } = stepMatch(m, 1 / 60, {});
    const now = m.world.time;
    for (const e of events) { feed.event(e, now, live); if (e.type === 'defeat' && e.by) kills += 1; }
    if (i % 6 === 0) {
      feed.view(matchView(m, 'you'), now, live);
      const b = feed.banners(now);
      if (b.objective) said.add(b.objective.text);
      if (b.event) said.add(b.event.text);
    }
  }
  assert.ok(said.has('CAPTURE THE ENEMY FLAG'), 'the opening order');
  assert.ok(kills > 0 && [...said].length >= 2, `the match said: ${[...said].join(' | ')}`);
});

test('level and EXP: earned from what the match reports, and a level is never lost', () => {
  assert.deepEqual(levelFrom(0), { level: 1, into: 0, need: 100, progress: 0, capped: false });
  assert.deepEqual(levelFrom(99), { level: 1, into: 99, need: 100, progress: 0.99, capped: false });
  assert.deepEqual(levelFrom(100), { level: 2, into: 0, need: 160, progress: 0, capped: false });
  assert.equal(levelFrom(100 + 160 + 220 + 10).level, 4);
  assert.equal(levelFrom(-5).level, 1);
  assert.equal(levelFrom(NaN).level, 1);
  assert.equal(xpToNext(3), 220);
  assert.deepEqual(levelFrom(1e9), { level: 25, into: 0, need: 0, progress: 1, capped: true }, 'a class stops at level 25');
  const who = { me: 'you', myTeam: 'blue' };
  assert.equal(xpForEvent({ type: 'defeat', by: 'you', who: 'foe' }, who), XP.elimination);
  assert.equal(xpForEvent({ type: 'defeat', by: 'foe', who: 'you' }, who), 0);
  assert.equal(xpForEvent({ type: 'defeat', by: 'you', who: 'you' }, who), 0);
  assert.equal(xpForEvent({ type: 'captured', team: 'blue', by: 'you' }, who), XP.capture);
  assert.equal(xpForEvent({ type: 'captured', team: 'blue', by: 'ally' }, who), 0);
  assert.equal(xpForEvent({ type: 'pointCaptured', point: 'A', team: 'blue' }, who), XP.point);
  assert.equal(xpForEvent({ type: 'pointCaptured', point: 'A', team: 'red' }, who), 0);
  assert.equal(xpForEvent({ type: 'over', winner: 'blue' }, who), XP.played + XP.win);
  assert.equal(xpForEvent({ type: 'over', winner: 'red' }, who), XP.played);
  assert.equal(xpForEvent({ type: 'over', winner: 'you' }, { me: 'you', myTeam: null }), XP.played + XP.win);
  assert.equal(xpForEvent({ type: 'defeat', by: 'you', who: 'foe' }, {}), 0, 'nobody to credit');
});

test('the HUD templates: eight 1920 x 1080 RGBA sheets and twelve frames, transparent, with no values baked in', () => {
  const dir = new URL('../public/ui/duelist/hud/', import.meta.url);
  const sheets = ['universal-hud', 'scoreboard-capture-the-flag', 'scoreboard-three-point-control', 'scoreboard-single-control-point',
    'scoreboard-team-deathmatch', 'scoreboard-duel', 'notification-objective', 'notification-event'];
  for (const name of sheets) {
    const file = new URL(`templates/${name}.png`, dir);
    const png = readFileSync(file);
    assert.equal(png.toString('latin1', 1, 4), 'PNG', name);
    // IHDR: width, height, bit depth, colour type (6: red, green, blue and alpha)
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]], [1920, 1080, 8, 6], `${name}: 1920 x 1080, 8-bit RGBA`);
    assert.ok(png.length > 2000 && png.length < 400000, `${name}: mostly empty (${png.length} bytes)`);
  }
  const parts = readdirSync(new URL('parts/', dir)).filter((f) => f.endsWith('.svg'));
  assert.equal(parts.length, 12);
  for (const f of parts) {
    const svg = readFileSync(new URL(`parts/${f}`, dir), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+" viewBox=/);
    assert.doesNotMatch(svg, /<text[ >]|<image[ >]/i, `${f}: no words, numbers or pictures in a frame`);
    assert.doesNotMatch(svg, /<rect[^>]*fill="(?:white|black|#000|#fff)/i, `${f}: no background`);
  }
  // the live HUD draws every frame it has
  const css = readFileSync(new URL('../src/components/duelist/client/duelistHud.css', import.meta.url), 'utf8');
  for (const f of parts) assert.ok(css.includes(`/ui/duelist/hud/parts/${f}`), `${f} is used by the HUD`);
});
