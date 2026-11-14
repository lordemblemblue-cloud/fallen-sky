import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame3DEntryAudio } from '../src/components/game3d/audio/Game3DEntryAudio.mjs';
import { createGame3DWorldEntryCamera } from
  '../src/components/game3d/player/Game3DWorldEntryCamera.mjs';

// Minimal stand-in for HTMLAudioElement: tracks play/pause and created copies.
const created = [];
class FakeAudio {
  constructor(url) {
    this.url = url;
    this.paused = true;
    this.volume = 0;
    this.loop = false;
    this.currentTime = 0;
    this.preload = '';
    this.listeners = new Map();
    created.push(this);
  }
  play() { this.paused = false; this.playCount = (this.playCount || 0) + 1; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn));
  }
  removeAttribute() { this.src = ''; }
  load() {}
}

const themeCopies = () => created.filter(audio => /character_login_theme/.test(audio.url));
const playingThemes = () => themeCopies().filter(audio => !audio.paused && !audio.disposedByRemoval);
const makeTransport = () => createGame3DEntryAudio({
  createAudio: url => new FakeAudio(url),
  clock: () => 0,
  setTick: () => 1,
  clearTick: () => {},
});

test('a second title/world transport never layers a second copy of the theme', () => {
  created.length = 0;
  const first = makeTransport();
  first.start();
  assert.equal(playingThemes().length, 1, 'the first transport plays one theme');

  const second = makeTransport();
  second.start();
  assert.equal(first.getStatus().titlePlaying, false, 'the superseded transport goes silent');
  assert.equal(playingThemes().length, 1, 'exactly one theme element is ever audible');

  // A third host (a later re-entry) keeps the same invariant.
  const third = makeTransport();
  third.start();
  assert.equal(playingThemes().length, 1);

  third.dispose();
  assert.equal(playingThemes().length, 0, 'leaving the game silences the theme');
});

test('returning to character select and re-entering keeps a single theme element', () => {
  created.length = 0;
  const audio = makeTransport();
  audio.start();
  audio.setPhase('world');
  audio.setPhase('login');
  audio.setPhase('world');

  assert.equal(themeCopies().filter(copy => copy.src !== '').length, 1,
    're-entry reuses one theme element instead of creating another');
});

test('an entry camera that was never requested never claims input', () => {
  const camera = createGame3DWorldEntryCamera({ enabled: false });
  camera.start();
  assert.equal(camera.isActive(), false,
    'movement and click-to-move must stay available when the handoff is off');
});

test('an active handoff finishes even with no actor to frame', () => {
  const camera = createGame3DWorldEntryCamera({ enabled: true, duration: 0.3 });
  camera.start();
  assert.equal(camera.isActive(), true);
  for (let i = 0; i < 8; i++) camera.update(0.1, {});
  assert.equal(camera.isActive(), false, 'an unframeable handoff cannot lock input forever');
});