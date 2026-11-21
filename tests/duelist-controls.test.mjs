// The player's own key bindings (client/bindings.mjs), the controls that read them (client/controls.mjs, with
// a stand-in window and canvas), and the comms voices' casting (client/voices.mjs).
/* global EventTarget, Event, URL, setTimeout */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIONS, DEFAULT_KEYS, keysFrom, rebind, actionFor, keyLabel, helpLine, bindable } from '../src/components/duelist/client/bindings.mjs';
import { CAST, castVoices, lineId, genderOf, createVoices } from '../src/components/duelist/client/voices.mjs';
import { MISSION_ORDER, commsSeconds } from '../src/components/duelist/sim/mission.mjs';
import { writtenLines } from '../tools/duelist/written-lines.mjs';

test('the default bindings: every action has its own input', () => {
  const keys = keysFrom({});
  assert.deepEqual(keys, { ...DEFAULT_KEYS });
  const inputs = ACTIONS.map(({ id }) => keys[id].replace(/(Left|Right)$/, ''));
  assert.equal(new Set(inputs).size, ACTIONS.length, 'no input does two things');
});

test('rebinding: a free key just moves; a taken one swaps; Shift, Ctrl and Alt count either side', () => {
  let { keys, swapped } = rebind(DEFAULT_KEYS, 'heavy', 'KeyG');
  assert.equal(keys.heavy, 'KeyG');
  assert.equal(swapped, null);
  assert.equal(actionFor(keys, 'KeyE'), null, 'the old key is free');
  ({ keys, swapped } = rebind(keys, 'heavy', 'Digit1'));
  assert.equal(swapped, 'ability1');
  assert.deepEqual([keys.heavy, keys.ability1], ['Digit1', 'KeyG'], 'ability 1 took heavy\'s old key');
  // bindings saved before the classes: the old power keys become the ability keys
  assert.equal(keysFrom({ push: 'KeyB' }).ability1, 'KeyB');
  assert.equal(actionFor(DEFAULT_KEYS, 'ShiftRight'), 'sprint', 'either Shift sprints');
  ({ keys, swapped } = rebind(DEFAULT_KEYS, 'dash', 'ShiftRight'));
  assert.equal(swapped, 'sprint');
  assert.equal(keys.sprint, 'ControlLeft');
  ({ keys, swapped } = rebind(DEFAULT_KEYS, 'guard', 'Mouse4'));
  assert.equal(keys.guard, 'Mouse4', 'mouse buttons can be bound');
});

test('some inputs are never bound, and broken or clashing saved bindings repair themselves', () => {
  for (const code of ['Escape', 'F5', 'F12', 'MetaLeft', 'Nonsense', '', null, 42]) {
    assert.equal(bindable(code), false, String(code));
    const { keys, refused } = rebind(DEFAULT_KEYS, 'roll', code);
    assert.equal(refused, true);
    assert.equal(keys.roll, 'AltLeft');
  }
  assert.equal(rebind(DEFAULT_KEYS, 'fly', 'KeyQ').refused, true, 'no such action');
  const repaired = keysFrom({ forward: 42, back: '<b>', roll: 'KeyE', lock: 'Escape' });
  assert.equal(repaired.forward, 'KeyW');
  assert.equal(repaired.back, 'KeyS');
  assert.equal(repaired.heavy, 'KeyE', 'the first action keeps a clashing key');
  assert.equal(repaired.roll, 'AltLeft', 'the other goes back to its own default');
  assert.equal(repaired.lock, 'Tab');
});

test('keys are written the way people say them; the help line and HUD follow the bindings', () => {
  const cases = [['KeyE', 'E'], ['Digit1', '1'], ['ControlLeft', 'Ctrl'], ['ShiftRight', 'Shift'], ['Space', 'Space'], ['Mouse0', 'Left mouse'],
    ['Mouse2', 'Right mouse'], ['Numpad4', 'Num 4'], ['ArrowUp', '↑'], ['Backquote', '`'], [null, 'unbound']];
  for (const [code, label] of cases) assert.equal(keyLabel(code), label, String(code));
  assert.equal(keyLabel('Mouse2', { short: true }), 'RMB');
  const line = helpLine(DEFAULT_KEYS);
  for (const part of ['WASD move', 'Shift sprint', 'LMB light', 'E heavy', 'RMB guard', 'Space jump', 'Alt roll', '1 push', 'Tab lock on']) assert.ok(line.includes(part), part);
  assert.ok(!line.includes('use'), 'using things only in the story');
  assert.ok(helpLine(DEFAULT_KEYS, { story: true }).includes('F (hold) use'));
  const arrows = rebind(rebind(rebind(rebind(DEFAULT_KEYS, 'forward', 'ArrowUp').keys, 'left', 'ArrowLeft').keys, 'back', 'ArrowDown').keys, 'right', 'ArrowRight').keys;
  assert.ok(helpLine(arrows).startsWith('Click to fight · ↑←↓→ move'));
});

// a stand-in browser: a window and a canvas that take listeners, a document that says whether the mouse is captured
function fakeBrowser() {
  const win = new EventTarget();
  const canvas = new EventTarget();
  canvas.requestPointerLock = () => { globalThis.document.pointerLockElement = canvas; };
  globalThis.window = win;
  globalThis.document = { pointerLockElement: canvas, exitPointerLock() {} };
  const ev = (type, props) => Object.assign(new Event(type, { cancelable: true }), props);
  return {
    canvas,
    key: (type, code, extra = {}) => win.dispatchEvent(ev(type, { code, repeat: false, ...extra })),
    mouse: (type, button) => (type === 'mousedown' ? canvas : win).dispatchEvent(ev(type, { button })),
    blur: () => win.dispatchEvent(ev('blur')),
    done() { delete globalThis.window; delete globalThis.document; },
  };
}

test('the controls follow the player\'s bindings: presses, held keys, guard and grip, mouse buttons, letting go on blur', async () => {
  const b = fakeBrowser();
  const { createControls } = await import('../src/components/duelist/client/controls.mjs');
  const mine = rebind(rebind(DEFAULT_KEYS, 'heavy', 'KeyG').keys, 'guard', 'KeyV').keys;
  const controls = createControls(b.canvas, { keys: mine });
  b.key('keydown', 'KeyG');
  b.key('keydown', 'KeyE'); // no longer anything
  assert.deepEqual(controls.read().presses, ['heavy']);
  b.key('keydown', 'KeyV');
  b.key('keydown', 'KeyV', { repeat: true }); // a held key repeats: nothing more
  b.key('keyup', 'KeyV');
  assert.deepEqual(controls.read().presses, ['blockDown', 'blockUp'], 'the guard is held while the key is');
  b.key('keydown', 'Digit3');
  b.key('keyup', 'Digit3');
  assert.deepEqual(controls.read().presses, ['ability3', 'release'], 'an ability key lets go when released (a held grip throws)');
  b.key('keydown', 'KeyW');
  b.key('keydown', 'KeyF');
  b.key('keydown', 'ShiftRight');
  const held = controls.read();
  assert.ok(held.move.z > 0.99, 'forward');
  assert.equal(held.interact, true);
  assert.equal(held.sprint, true, 'either Shift');
  b.key('keydown', 'Space');
  assert.deepEqual(controls.read().presses, ['jump']);
  assert.equal(controls.read().jumpHeld, true);
  b.key('keyup', 'Space');
  assert.equal(controls.read().jumpHeld, false);
  b.key('keyup', 'KeyW');
  b.key('keyup', 'KeyF');
  b.key('keyup', 'ShiftRight');
  b.mouse('mousedown', 0);
  b.mouse('mouseup', 0);
  assert.deepEqual(controls.read().presses, ['light']);
  b.key('keydown', 'Tab');
  assert.equal(controls.takeLockToggle(), true);
  b.key('keydown', 'Digit3');
  b.blur();
  assert.deepEqual(controls.read().presses, ['ability3', 'release', 'blockUp'], 'leaving the window lets go of everything');
  assert.equal(controls.read().move.z, 0);
  controls.dispose();
  b.done();
});

// the voices a Windows browser usually offers, and one that is not English
const VOICES = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
  { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true },
  { name: 'Microsoft Mark - English (United States)', lang: 'en-US', localService: true },
  { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false },
  { name: 'Microsoft Guy Online (Natural) - English (United States)', lang: 'en-US', localService: false },
  { name: 'Google UK English Female', lang: 'en-GB', localService: false },
  { name: 'Google UK English Male', lang: 'en-GB', localService: false },
  { name: 'Google US English', lang: 'en-US', localService: false },
  { name: 'Microsoft Julie - French (France)', lang: 'fr-FR', localService: true },
];

test('the voices are cast: everyone their own, women and men as written, the natural voices first, never French', () => {
  const cast = castVoices(VOICES);
  const gender = (speaker) => genderOf({ name: cast[speaker].voice });
  for (const s of ['Ione', 'Crane', 'Perrin']) assert.equal(gender(s), 'female', s);
  for (const s of ['Hask', 'Dask', 'Rooke', 'Defender']) assert.equal(gender(s), 'male', s);
  assert.match(cast.Ione.voice, /Aria Online \(Natural\)/, 'the best voice goes first');
  const own = Object.keys(CAST).filter((s) => !CAST[s].as).map((s) => cast[s].voice);
  assert.equal(new Set(own).size, own.length, 'nobody shares while there are voices enough');
  assert.ok(!own.some((v) => /French/.test(v)));
  assert.equal(cast['Arden (recording)'].voice, cast.Arden.voice, 'a recording of Arden is Arden');
  assert.ok(cast['Arden (recording)'].volume < 1);
  assert.deepEqual(Object.keys(cast), Object.keys(CAST), 'in the order they are listed');
  assert.equal(typeof castVoices(VOICES, [...Object.keys(CAST), 'Stranger']).Stranger.voice, 'string', 'someone unlisted gets a voice too');
  // the old Windows pair: the women share the one woman's voice rather than take the man's
  const pair = castVoices(VOICES.slice(0, 2));
  for (const s of ['Ione', 'Crane', 'Perrin']) assert.match(pair[s].voice, /Zira/, s);
  for (const s of ['Hask', 'Dask', 'Rooke', 'Defender']) assert.match(pair[s].voice, /David/, s);
  // few voices: some must share, but never two speakers of the same mission at about the same pitch
  const { lines } = JSON.parse(readFileSync(new URL('../public/audio/duelist/voices/lines.json', import.meta.url), 'utf8'));
  const missions = Object.groupBy(lines, (l) => l.mission);
  const pane = VOICES.slice(0, 3); // David, Zira, Mark: what a Windows desktop browser without online voices has
  for (const [name, set] of [['three voices', pane], ['two voices', VOICES.slice(0, 2)], ['eight voices', VOICES]]) {
    const c = castVoices(set);
    for (const [mission, said] of Object.entries(missions)) {
      const speakers = [...new Set(said.map((l) => l.speaker))].filter((s) => !CAST[s].as);
      for (const a of speakers) {
        for (const b of speakers) {
          if (a < b && c[a].voice === c[b].voice) assert.ok(Math.abs(c[a].pitch - c[b].pitch) >= 0.1 - 1e-9, `${name}, ${mission}: ${a} and ${b} sound alike`);
        }
      }
    }
  }
  // one voice on the whole system: everyone uses it, told apart by pitch
  const one = castVoices([{ name: 'Only Voice', lang: 'en-US' }]);
  assert.ok(Object.values(one).every((p) => p.voice === 'Only Voice'));
  assert.notEqual(one.Hask.pitch, one.Perrin.pitch);
  assert.ok(Object.values(castVoices([])).every((p) => p.voice === null), 'no voices at all: nothing to cast');
});

// a stand-in for the browser's speech: it says nothing until the player has touched the page
function fakeSpeech() {
  const page = new EventTarget();
  const spoken = [];
  const state = { allowed: false };
  page.speechSynthesis = Object.assign(new EventTarget(), {
    speaking: false,
    pending: false,
    getVoices: () => VOICES.slice(0, 3),
    cancel() {},
    speak(u) { if (state.allowed) spoken.push(u); else u.onerror?.({ error: 'not-allowed' }); },
  });
  globalThis.window = page;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const clips = [];
  globalThis.Audio = class {
    constructor(src) { this.src = src; clips.push(this); }
    play() { return state.allowed ? Promise.resolve() : Promise.reject(Object.assign(new Error('not yet'), { name: 'NotAllowedError' })); }
    pause() {}
  };
  return {
    page, spoken, clips, state,
    touch: (type = 'keydown') => page.dispatchEvent(new Event(type)),
    done() { delete globalThis.window; delete globalThis.SpeechSynthesisUtterance; delete globalThis.Audio; },
  };
}

test('the voices speak as loud as the game sounds, not at all when it is muted, and a line the browser held back at the first key', () => {
  const s = fakeSpeech();
  try {
    const audio = { muted: false, volume: 0.5 };
    const voices = createVoices({ audio });
    voices.say('Ione', 'Open the marked crates.');
    assert.equal(s.spoken.length, 0, 'nothing before the player has touched the page');
    s.state.allowed = true;
    s.touch();
    assert.deepEqual(s.spoken.map((u) => u.text), ['Open the marked crates.'], 'said at the first key');
    assert.match(s.spoken[0].voice.name, /Zira/);
    assert.deepEqual([s.spoken[0].pitch, s.spoken[0].rate, s.spoken[0].volume], [CAST.Ione.pitch, CAST.Ione.rate, 0.5]);
    s.touch('pointerdown');
    assert.equal(s.spoken.length, 1, 'once');
    audio.muted = true;
    voices.say('Hask', 'Hold.');
    audio.muted = false;
    voices.setEnabled(false);
    voices.say('Hask', 'Hold.');
    assert.equal(s.spoken.length, 1, 'silent while muted or switched off');
    voices.setEnabled(true);
    voices.say('Arden (recording)', 'You came.');
    assert.equal(s.spoken[1].volume, 0.375, 'a recording is quieter');
    voices.dispose();
    s.state.allowed = false;
    voices.say('Ione', 'Gone.');
    s.state.allowed = true;
    s.touch();
    assert.equal(s.spoken.length, 2, 'put away: no longer listening for keys');
  } finally {
    s.done();
  }
});

test('a recorded line plays instead of the browser\'s voice once voices.json lists it', async () => {
  const s = fakeSpeech();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: url === '/audio/duelist/voices/voices.json', json: async () => ({ lines: { [lineId('Ione', 'Recorded.')]: 'ione-recorded.mp3' } }) });
  try {
    const voices = createVoices({ audio: { muted: false, volume: 0.8 } });
    await new Promise((r) => setTimeout(r, 0)); // voices.json read
    voices.say('Ione', 'Recorded.');
    await new Promise((r) => setTimeout(r, 0)); // the browser refuses: not touched yet
    assert.deepEqual(s.clips.map((c) => [c.src, c.volume]), [['/audio/duelist/voices/ione-recorded.mp3', 0.8]]);
    s.state.allowed = true;
    s.touch('pointerdown');
    assert.equal(s.clips.length, 2, 'played again at the first click');
    voices.say('Ione', 'Not recorded.');
    assert.deepEqual(s.spoken.map((u) => u.text), ['Not recorded.'], 'other lines: the browser\'s voice');
    voices.dispose();
  } finally {
    globalThis.fetch = realFetch;
    s.done();
  }
});

// a constant-rate MP3's length: the bytes after its ID3 tag at the first frame's bit rate (MPEG layer III)
function mp3Seconds(buf) {
  let at = buf.toString('latin1', 0, 3) === 'ID3' ? 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)) : 0;
  while (at < buf.length - 2 && !(buf[at] === 0xff && (buf[at + 1] & 0xe0) === 0xe0)) at++;
  const mpeg1 = ((buf[at + 1] >> 3) & 3) === 3;
  const kbps = (mpeg1 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[buf[at + 2] >> 4];
  return ((buf.length - at) * 8) / (kbps * 1000);
}

test('every recorded voice ends before its line leaves the screen (the next line would cut it off)', (t) => {
  const { lines: recorded } = JSON.parse(readFileSync(new URL('../public/audio/duelist/voices/voices.json', import.meta.url), 'utf8'));
  let worst = Infinity;
  for (const mission of MISSION_ORDER) {
    const source = readFileSync(new URL(`../src/components/duelist/sim/missions/${mission}.mjs`, import.meta.url), 'utf8');
    for (const { speaker, text, seconds } of writtenLines(source)) {
      const file = recorded[lineId(speaker, text)];
      if (!file) continue;
      const voice = mp3Seconds(readFileSync(new URL(`../public/audio/duelist/voices/${file}`, import.meta.url)));
      const shown = seconds ?? commsSeconds(text);
      worst = Math.min(worst, shown - voice);
      assert.ok(voice + 0.25 <= shown, `${speaker} (${file}): the voice takes ${voice.toFixed(2)} s, the line is up for ${shown.toFixed(2)} s: ${text}`);
    }
  }
  t.diagnostic(`the tightest line still has ${worst.toFixed(2)} s after its voice`);
});

test('every line of the story has a speaker with a part, and an id its recording takes', (t) => {
  assert.equal(lineId('Ione', 'Open the marked crates.'), lineId('Ione', 'Open the marked crates.'));
  assert.notEqual(lineId('Ione', 'Hold.'), lineId('Hask', 'Hold.'));
  assert.match(lineId('Arden', 'You came.'), /^[0-9a-f]{8}$/);
  const { lines } = JSON.parse(readFileSync(new URL('../public/audio/duelist/voices/lines.json', import.meta.url), 'utf8'));
  assert.ok(lines.length >= 40, `${lines.length} lines`);
  for (const l of lines) {
    assert.ok(CAST[l.speaker], `${l.speaker} has a voice`);
    assert.equal(l.id, lineId(l.speaker, l.text));
  }
  assert.deepEqual(new Set(lines.map((l) => l.mission)), new Set(MISSION_ORDER));
  // every line written in a mission's file is listed, the opening lines included
  for (const mission of MISSION_ORDER) {
    const source = readFileSync(new URL(`../src/components/duelist/sim/missions/${mission}.mjs`, import.meta.url), 'utf8');
    const written = writtenLines(source);
    assert.ok(written.length >= 20, `${mission}: ${written.length} lines found in its file`);
    for (const { speaker, text } of written) {
      assert.ok(lines.some((l) => l.id === lineId(speaker, text)), `not in lines.json (run node tools/duelist/comms-lines.mjs): ${speaker}: ${text}`);
    }
  }
  // the recordings (tools/duelist/record-comms.mjs): each one listed is there, is an MP3 and belongs to a line
  // of today's missions (a changed line has a new id and needs recording again; until then the browser speaks it)
  const { lines: recorded } = JSON.parse(readFileSync(new URL('../public/audio/duelist/voices/voices.json', import.meta.url), 'utf8'));
  for (const [id, file] of Object.entries(recorded)) {
    assert.ok(lines.some((l) => l.id === id), `${file}: a line no mission says any more`);
    assert.equal(file, `${id}.mp3`);
    const head = readFileSync(new URL(`../public/audio/duelist/voices/${file}`, import.meta.url)).subarray(0, 3);
    assert.ok(head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), `${file} is an MP3`);
  }
  t.diagnostic(`${Object.keys(recorded).length} of ${lines.length} lines recorded`);
  // without a browser there is nothing to speak with, and nothing breaks
  const voices = createVoices({ audio: { muted: false, volume: 1 } });
  assert.equal(voices.supported, false);
  voices.say('Ione', 'Anyone there?');
  voices.dispose();
});
