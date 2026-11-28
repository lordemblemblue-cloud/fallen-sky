import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wrapAngle, headingTo, turnToward, stepToward, steerAround, followGoal, followSpeed,
  shouldGreet, walkTimeScale, CAST_WALK_SPEED, CAST_RUN_SPEED,
} from '../src/components/game3d/threeroads/cast/castMotion.mjs';
import {
  captionSeconds, captionOpacity, captionDistanceFade, wrapCaptionText, CAPTION_MAX_DISTANCE,
  CAPTION_LINE_CHARS, CAPTION_MAX_LINES, SUBTITLE_LINE_CHARS, SUBTITLE_MAX_LINES,
} from '../src/components/game3d/threeroads/cast/castCaption.mjs';
import { THREE_ROADS_BANDS } from '../src/components/game3d/threeroads/script/index.mjs';
import {
  castModelFor, castBodyHeight, distinctColours, CAST_MODELS, CAST_MODEL_SOURCES,
  castSourceDef, castFallbackLook, CAST_OWN_CLIPS,
} from '../src/components/game3d/threeroads/cast/castModels.mjs';
import { THREE_ROADS_CAST, threeRoadsPerson } from '../src/components/game3d/threeroads/script/cast.mjs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('headings follow three.js rotation.y: north 0, east +pi/2', () => {
  close(headingTo(0, 0, 0, 5), 0);
  close(headingTo(0, 0, 5, 0), Math.PI / 2);
  close(Math.abs(wrapAngle(Math.PI * 3)), Math.PI, 1e-9);
  close(wrapAngle(-Math.PI / 2 - Math.PI * 4), -Math.PI / 2, 1e-9);
  close(turnToward(0, Math.PI / 2, 0.5), 0.5);
  close(turnToward(3, -3, 0.1), 3.1, 1e-9); // the short way, across pi
  close(turnToward(3, -3, 0.5), -3, 1e-9);
  close(turnToward(0, 0.2, 0.5), 0.2);
});

test('a walk step moves at the given speed, never overshoots, and arrives', () => {
  const out = {};
  stepToward(out, 0, 0, 10, 0, 2, 0.5);
  close(out.x, 1); close(out.z, 0); close(out.heading, Math.PI / 2);
  assert.equal(out.arrived, false);
  close(out.remaining, 9);
  stepToward(out, 9.5, 0, 10, 0, 2, 0.5);
  assert.equal(out.arrived, true);
  close(out.x, 10);
  // 10 m at 1.4 m/s in 60 fps steps takes 10 / 1.4 seconds
  let x = 0, steps = 0;
  while (!out.arrived || steps === 0) { stepToward(out, x, 0, 10, 0, 1.4, 1 / 60); x = out.x; steps++; if (steps > 1e4) break; }
  assert.ok(Math.abs(steps / 60 - 10 / 1.4) < 0.15, String(steps / 60));
});

test('local avoidance turns aside from a blocked step, or stops when boxed in', () => {
  const out = {};
  const wallAhead = (x, z) => z > 0.4 && Math.abs(x) < 0.3;
  steerAround(out, 0, 0, 0, 0.5, wallAhead);
  assert.equal(out.blocked, false);
  assert.ok(Math.abs(out.x) >= 0.2, 'went round');
  steerAround(out, 0, 0, 0, 0.5, () => true);
  assert.equal(out.blocked, true);
  assert.deepEqual([out.x, out.z], [0, 0]);
});

test('a follower aims for a point behind the target at the asked distance', () => {
  const out = {};
  followGoal(out, 0, -10, 0, 0, 2.5);
  close(out.x, 0); close(out.z, -2.5); close(out.gap, 7.5);
  followGoal(out, 0, -2, 0, 0, 2.5);
  assert.ok(out.gap < 0, 'already closer than asked');
  assert.equal(followSpeed(0.2), 0);
  assert.equal(followSpeed(1.5), CAST_WALK_SPEED);
  assert.equal(followSpeed(10), CAST_RUN_SPEED);
  const mid = followSpeed(4);
  assert.ok(mid > CAST_WALK_SPEED && mid < CAST_RUN_SPEED);
});

test('greeting radius and walk playback rate', () => {
  assert.equal(shouldGreet(3.9), true);
  assert.equal(shouldGreet(4.1), false);
  assert.equal(shouldGreet(NaN), false);
  close(walkTimeScale(1.8, 3.6), 0.5);
  assert.equal(walkTimeScale(0.1), 0.45);
  assert.equal(walkTimeScale(20), 1.35);
});

test('caption timing: given seconds, reading time, fades, and 25 m', () => {
  assert.equal(captionSeconds('x', 4), 4);
  assert.equal(captionSeconds('x', 999), 30);
  assert.equal(captionSeconds('one two', undefined), 2.5);
  assert.ok(captionSeconds('word '.repeat(20)) > 7);
  assert.equal(captionOpacity(-1, 4), 0);
  close(captionOpacity(0.1, 4), 0.5);
  assert.equal(captionOpacity(2, 4), 1);
  close(captionOpacity(3.8, 4), 0.5);
  assert.equal(captionOpacity(4, 4), 0);
  assert.equal(captionDistanceFade(10), 1);
  close(captionDistanceFade(23.5), 0.5);
  assert.equal(captionDistanceFade(CAPTION_MAX_DISTANCE), 0);
  assert.equal(captionDistanceFade(40), 0);
});

test('captions wrap to their width and only an overlong text is cut', () => {
  const lines = wrapCaptionText('The truce holds while the stone stands, and the stone stands while we keep it.');
  assert.ok(lines.length >= 2 && lines.length <= CAPTION_MAX_LINES);
  for (const line of lines) assert.ok(line.length <= CAPTION_LINE_CHARS + 6, line);
  const long = wrapCaptionText('word '.repeat(80));
  assert.equal(long.length, CAPTION_MAX_LINES);
  assert.ok(long.at(-1).endsWith('…'));
});

test('every scripted line fits whole, over a head and as a subtitle', () => {
  const all = THREE_ROADS_BANDS.flatMap(band => Object.entries(band.lines));
  assert.ok(all.length > 100);
  for (const [id, line] of all) {
    for (const [chars, max] of [[CAPTION_LINE_CHARS, CAPTION_MAX_LINES], [SUBTITLE_LINE_CHARS, SUBTITLE_MAX_LINES]]) {
      const wrapped = wrapCaptionText(line.text, chars, max);
      assert.equal(wrapped.join(' '), line.text.trim().split(/\s+/).join(' '), id + ' is cut at ' + chars + ' x ' + max);
    }
  }
});

test('every person of a cast gets a model with a known source, height and two colours; the table holds the eight own models', () => {
  // The table lists only the people who have a model of their own. Everyone else wears the shared figure.
  assert.deepEqual(Object.keys(CAST_MODELS).sort(), ['aelia_sabina', 'bram_lamplighter', 'elder_maren', 'master_hesper',
    'mizuhara_jun', 'paneb_scribe', 'sable_vey', 'watch_warden_south']);
  for (const id of Object.keys(CAST_MODELS)) assert.equal(CAST_MODELS[id].own, true, id);
  for (const person of THREE_ROADS_CAST.filter(p => !p.existing)) {
    const model = castModelFor(person);
    assert.ok(castSourceDef(model.source), person.id);
    if (model.own) assert.ok(CAST_MODEL_SOURCES[model.fallback], person.id + ' has a shared figure to fall back to');
    assert.equal(model.colours.length, 2);
  }
  assert.equal(castBodyHeight('m'), 1.7);
  assert.equal(castBodyHeight('child'), 1.2);
  assert.equal(castBodyHeight('elder_f'), 1.6);
  assert.equal(castModelFor(threeRoadsPerson('elder_maren')).height, 1.6);
});

test('two people with the same colours are told apart (Paneb and Henut)', () => {
  const paneb = castModelFor(threeRoadsPerson('paneb_scribe')).colours;
  const henut = castModelFor(threeRoadsPerson('traveller_henut')).colours;
  assert.deepEqual(paneb, henut, 'the cast table gives them one pair');
  const other = distinctColours(henut, [paneb]);
  assert.notDeepEqual(other, paneb);
  assert.deepEqual(distinctColours(henut, []), henut);
});

test('a person with a file of their own wears it untinted, at the table height, with the shared figure behind', () => {
  const bram = castModelFor(threeRoadsPerson('bram_lamplighter'));
  assert.equal(bram.own, true);
  assert.equal(bram.source, 'own:bram_lamplighter');
  assert.equal(bram.height, 1.6, 'elder_m');
  assert.equal(bram.width, 1, 'no build squeeze on an own model');
  const def = castSourceDef(bram.source);
  assert.equal(def.url, '/game3d/threeroads/cast/bram_lamplighter.glb');
  assert.equal(def.kind, 'glb');
  assert.equal(def.tint, 'none');
  assert.deepEqual({ ...def.clips }, { ...CAST_OWN_CLIPS });
  const shared = castFallbackLook(bram);
  assert.equal(shared.source, 'archer');
  assert.equal(shared.own, false);
  assert.equal(shared.width, bram.buildWidth);
  assert.equal(castFallbackLook(castModelFor(threeRoadsPerson('goro_sergeant'))), null, 'the shared figure has nothing behind it');
});
