// Pledge voices: manifest checks, hash-and-skip, dry-run arithmetic, the refusal to
// record without --yes-spend, the balance guard, and the playback module. Every
// ElevenLabs call here goes to a fake fetch; nothing is sent anywhere.
/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  countChars, estimateCredits, planLines, run, summarize, textHash, validateManifest, emptyIndex,
} from '../scripts/pledge-voices.mjs';
import {
  getPledgeLineUrl, playPledgeLine, resetPledgeVoiceForTests, PLEDGE_VOICE_INDEX_URL,
} from '../src/components/game3d/pledges/voice/pledgeVoice.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures/pledge-voices.sample.json');
const SAMPLE_TEXT = await readFile(SAMPLE, 'utf8');
const sample = () => JSON.parse(SAMPLE_TEXT);

// Hand-counted characters of the four sample lines.
const CHARS = { 'test-ferrier-01': 46, 'test-ferrier-02': 39, 'test-lamplighter-01': 56, 'test-lamplighter-02': 20 };
const TOTAL = 46 + 39 + 56 + 20; // 161

async function tempDir() { return mkdtemp(path.join(os.tmpdir(), 'pledge-voices-')); }

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) };
}
function audioResponse(bytes) {
  return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new Uint8Array(bytes).fill(7).buffer };
}

/** A fake ElevenLabs. remaining = credits left. Records every call. */
function fakeElevenLabs({ remaining = 100000, ttsBytes = 3200, rate = 1 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const u = new URL(url);
    if (u.pathname === '/v1/user/subscription') {
      return jsonResponse({ tier: 'test', character_count: 1000, character_limit: 1000 + remaining, next_character_count_reset_unix: 1800000000 });
    }
    if (u.pathname === '/v1/models') {
      return jsonResponse([{ model_id: 'eleven_multilingual_v2', name: 'Multilingual v2', can_do_text_to_speech: true, model_rates: { character_cost_multiplier: rate } }]);
    }
    if (u.pathname === '/v2/voices') {
      return jsonResponse({ voices: [{ voice_id: 'v1', name: 'Test Voice', category: 'premade', labels: { gender: 'female' } }], has_more: false });
    }
    if (u.pathname.startsWith('/v1/text-to-speech/')) return audioResponse(ttsBytes);
    return jsonResponse({ detail: 'not found' }, 404);
  };
  return { fetch, calls, tts: () => calls.filter((c) => c.url.includes('/text-to-speech/')) };
}

function capture() {
  const out = []; const err = [];
  return { out, err, log: (s) => out.push(String(s)), error: (s) => err.push(String(s)), text: () => out.concat(err).join('\n') };
}

// ------------------------------------------------------------ manifest validation

test('the sample manifest is valid', () => {
  const r = validateManifest(sample());
  assert.equal(r.ok, true, r.errors.join('\n'));
});

test('validation catches unknown speakers, duplicates, empty text, unsafe ids and bad settings', () => {
  const m = sample();
  m.lines.push({ id: 'test-ferrier-01', speaker: 'test-ferrier', text: 'again' });
  m.lines.push({ id: 'Bad Id/..', speaker: 'test-ferrier', text: 'x' });
  m.lines.push({ id: 'ghost-01', speaker: 'nobody', text: 'boo' });
  m.lines.push({ id: 'blank-01', speaker: 'test-ferrier', text: '   ' });
  m.speakers['test-lamplighter'].settings = { stability: 'high', loudness: 3 };
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  const all = r.errors.join('\n');
  assert.match(all, /duplicate id "test-ferrier-01"/);
  assert.match(all, /becomes a file name/);
  assert.match(all, /speaker "nobody" is not in "speakers"/);
  assert.match(all, /text is empty/);
  assert.match(all, /unknown setting "loudness"/);
  assert.match(all, /"stability" has the wrong type/);
});

test('validation rejects a missing model and over-long lines, and warns on an unknown model', () => {
  const m = sample(); delete m.model;
  assert.match(validateManifest(m).errors.join('\n'), /"model"/);
  const long = sample(); long.lines[0].text = 'a'.repeat(5001);
  assert.match(validateManifest(long).errors.join('\n'), /over 5000 characters/);
  const odd = sample(); odd.model = 'eleven_future_v9';
  const r = validateManifest(odd);
  assert.equal(r.ok, true);
  assert.match(r.warnings.join('\n'), /no built-in credit rate/);
});

// ------------------------------------------------------------ hash and skip

test('characters are counted as billed, and the hash ignores surrounding space and line endings', () => {
  for (const line of sample().lines) assert.equal(countChars(line.text), CHARS[line.id], line.id);
  assert.equal(countChars('Gorō'), 4);
  assert.equal(textHash('  Mind the third step.\r\n'), textHash('Mind the third step.'));
  assert.notEqual(textHash('Mind the third step.'), textHash('Mind the third step!'));
});

test('a line is skipped only when its file exists with the same text, voice and model', () => {
  const m = sample();
  const idx = emptyIndex();
  const files = new Set();
  const plan0 = planLines(m, idx, (f) => files.has(f));
  assert.deepEqual(plan0.map((p) => p.status), ['new', 'new', 'new', 'new']);

  for (const p of plan0) {
    idx.lines[p.id] = { file: p.file, textHash: p.hash, speaker: p.speaker, voiceId: p.voiceId, model: m.model, settings: m.speakers[p.speaker].settings ?? null };
    files.add(p.file);
  }
  assert.deepEqual(planLines(m, idx, (f) => files.has(f)).map((p) => p.status), ['skip', 'skip', 'skip', 'skip']);

  const edited = sample();
  edited.lines[1].text = 'Two coins. Four if the goat comes too.';
  edited.speakers['test-lamplighter'].voiceId = 'voice-test-ccc';
  files.delete('test-ferrier/test-ferrier-01.mp3');
  const plan = planLines(edited, idx, (f) => files.has(f));
  const by = Object.fromEntries(plan.map((p) => [p.id, p]));
  assert.equal(by['test-ferrier-01'].status, 'new');
  assert.deepEqual(by['test-ferrier-01'].reasons, ['file missing']);
  assert.equal(by['test-ferrier-02'].status, 'changed');
  assert.deepEqual(by['test-ferrier-02'].reasons, ['text changed']);
  assert.deepEqual(by['test-lamplighter-01'].reasons, ['voice changed']);

  const remodel = sample(); remodel.model = 'eleven_v3';
  files.add('test-ferrier/test-ferrier-01.mp3');
  assert.ok(planLines(remodel, idx, (f) => files.has(f)).every((p) => p.reasons.includes('model changed')));

  const retuned = sample(); retuned.speakers['test-ferrier'].settings = { stability: 0.2 };
  const p2 = planLines(retuned, idx, (f) => files.has(f));
  assert.equal(p2[0].status, 'skip', 'a settings change alone does not pay for the line again');
  assert.match(p2[0].settingsNote, /settings differ/);
});

// ------------------------------------------------------------ dry-run arithmetic

test('dry-run totals per speaker and credits by model', () => {
  const m = sample();
  const plan = planLines(m, emptyIndex(), () => false);
  const s = summarize(plan, m.model);
  assert.deepEqual(s.speakers['test-ferrier'], { lines: 2, chars: 85, todoLines: 2, todoChars: 85 });
  assert.deepEqual(s.speakers['test-lamplighter'], { lines: 2, chars: 76, todoLines: 2, todoChars: 76 });
  assert.equal(s.total.chars, TOTAL);
  assert.equal(s.creditsAll, TOTAL);
  assert.equal(s.creditsTodo, TOTAL);
  assert.equal(summarize(plan, 'eleven_flash_v2_5').creditsAll, Math.ceil(TOTAL * 0.5)); // 81
  assert.equal(estimateCredits(60000, 'eleven_multilingual_v2'), 60000);
  assert.equal(estimateCredits(80000, 'eleven_flash_v2_5'), 40000);
  assert.equal(estimateCredits(10, 'unknown_model'), 10);
});

test('the default mode is a dry run: no key, no network, numbers printed', async () => {
  const dir = await tempDir();
  try {
    const fake = fakeElevenLabs(); const io = capture();
    const code = await run(['--manifest', SAMPLE, '--out', dir], { fetch: fake.fetch, env: {}, log: io.log, error: io.error });
    assert.equal(code, 0, io.text());
    assert.equal(fake.calls.length, 0);
    assert.match(io.text(), /TOTAL\s+4\s+161\s+4 \/ 161/);
    assert.match(io.text(), /Estimated credits, every line:\s+161/);
    assert.match(io.text(), /new\s+test-lamplighter-02/);
    assert.equal(existsSync(path.join(dir, 'voiceIndex.json')), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------ recording guards

test('--record without --yes-spend refuses before any call, even with a key', async () => {
  const dir = await tempDir();
  try {
    const fake = fakeElevenLabs(); const io = capture();
    const code = await run(['--record', '--manifest', SAMPLE, '--out', dir], { fetch: fake.fetch, env: { ELEVENLABS_API_KEY: 'test-key' }, log: io.log, error: io.error });
    assert.equal(code, 2);
    assert.equal(fake.calls.length, 0);
    assert.match(io.text(), /Refusing to record/);
    assert.match(io.text(), /Estimated credits/, 'the summary is printed first');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a missing key is a clear error, never a call', async () => {
  const dir = await tempDir();
  try {
    for (const argv of [['--voices'], ['--balance'], ['--record', '--yes-spend', '--manifest', SAMPLE, '--out', dir]]) {
      const fake = fakeElevenLabs(); const io = capture();
      const code = await run(argv, { fetch: fake.fetch, env: {}, log: io.log, error: io.error });
      assert.equal(code, 1, argv.join(' '));
      assert.equal(fake.calls.length, 0);
      assert.match(io.text(), /ELEVENLABS_API_KEY is not set/);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('recording stops before spending when the balance is below the estimate', async () => {
  const dir = await tempDir();
  try {
    const fake = fakeElevenLabs({ remaining: 100 }); const io = capture();
    const code = await run(['--record', '--yes-spend', '--manifest', SAMPLE, '--out', dir], { fetch: fake.fetch, env: { ELEVENLABS_API_KEY: 'test-key' }, log: io.log, error: io.error });
    assert.equal(code, 3);
    assert.equal(fake.tts().length, 0);
    assert.match(io.text(), /Stopping before spending: 161 credits needed, 100 left/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('recording writes only missing or changed lines, keeps the key out of URLs and output, and never pays twice', async () => {
  const dir = await tempDir();
  const key = 'test-key-never-printed';
  try {
    const fake = fakeElevenLabs({ ttsBytes: 32000 }); const io = capture();
    const env = { ELEVENLABS_API_KEY: key };
    const deps = { fetch: fake.fetch, env, log: io.log, error: io.error, now: () => new Date('2026-11-21T00:00:00Z') };
    assert.equal(await run(['--record', '--yes-spend', '--manifest', SAMPLE, '--out', dir], deps), 0, io.text());
    assert.equal(fake.tts().length, 4);
    for (const c of fake.calls) {
      assert.ok(!c.url.includes(key), 'key never in a URL');
      assert.equal(c.headers['xi-api-key'], key);
    }
    assert.ok(!io.text().includes(key), 'key never printed');
    const first = fake.tts()[0];
    assert.match(first.url, /\/v1\/text-to-speech\/voice-test-aaa\?output_format=mp3_44100_128$/);
    assert.deepEqual(JSON.parse(first.body), {
      text: 'The ferry leaves at dusk. Bring your own rope.', model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });
    assert.equal(JSON.parse(fake.tts()[2].body).voice_settings, undefined, 'no settings sent when the speaker has none');

    const idx = JSON.parse(await readFile(path.join(dir, 'voiceIndex.json'), 'utf8'));
    const e = idx.lines['test-lamplighter-02'];
    assert.equal(e.file, 'test-lamplighter/test-lamplighter-02.mp3');
    assert.equal(e.textHash, textHash('Mind the third step.'));
    assert.equal(e.voiceId, 'voice-test-bbb');
    assert.equal(e.model, 'eleven_multilingual_v2');
    assert.equal(e.bytes, 32000);
    assert.equal(e.durationSec, 2);
    assert.equal(existsSync(path.join(dir, e.file)), true);

    // Same manifest again: nothing to record, nothing spent.
    const again = fakeElevenLabs(); const io2 = capture();
    assert.equal(await run(['--record', '--yes-spend', '--manifest', SAMPLE, '--out', dir], { ...deps, fetch: again.fetch, log: io2.log, error: io2.error }), 0);
    assert.equal(again.calls.length, 0);
    assert.match(io2.text(), /Nothing to record/);

    // One line edited: exactly that line is recorded again.
    const edited = JSON.parse(SAMPLE_TEXT);
    edited.lines[3].text = 'Mind the fourth step.';
    const editedPath = path.join(dir, 'edited.json');
    await writeFile(editedPath, JSON.stringify(edited));
    const third = fakeElevenLabs();
    assert.equal(await run(['--record', '--yes-spend', '--manifest', editedPath, '--out', dir], { ...deps, fetch: third.fetch, log: () => {}, error: () => {} }), 0);
    assert.equal(third.tts().length, 1);
    assert.equal(JSON.parse(third.tts()[0].body).text, 'Mind the fourth step.');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an API failure mid-run stops the run and keeps the lines already paid for', async () => {
  const dir = await tempDir();
  try {
    const base = fakeElevenLabs();
    let n = 0;
    const fetch = async (url, init) => {
      if (String(url).includes('/text-to-speech/') && ++n === 3) return jsonResponse({ detail: { message: 'quota_exceeded' } }, 401);
      return base.fetch(url, init);
    };
    const io = capture();
    const code = await run(['--record', '--yes-spend', '--manifest', SAMPLE, '--out', dir], { fetch, env: { ELEVENLABS_API_KEY: 'k' }, log: io.log, error: io.error });
    assert.equal(code, 1);
    assert.match(io.text(), /ElevenLabs answered 401: quota_exceeded/);
    const idx = JSON.parse(await readFile(path.join(dir, 'voiceIndex.json'), 'utf8'));
    assert.deepEqual(Object.keys(idx.lines).sort(), ['test-ferrier-01', 'test-ferrier-02']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('--speaker and --limit narrow a recording run', async () => {
  const dir = await tempDir();
  try {
    const fake = fakeElevenLabs();
    const code = await run(['--record', '--yes-spend', '--speaker', 'test-lamplighter', '--limit', '1', '--manifest', SAMPLE, '--out', dir],
      { fetch: fake.fetch, env: { ELEVENLABS_API_KEY: 'k' }, log: () => {}, error: () => {} });
    assert.equal(code, 0);
    assert.equal(fake.tts().length, 1);
    assert.match(fake.tts()[0].url, /voice-test-bbb/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('--voices and --balance read the free endpoints only', async () => {
  const fake = fakeElevenLabs({ remaining: 5000 }); const io = capture();
  assert.equal(await run(['--voices'], { fetch: fake.fetch, env: { ELEVENLABS_API_KEY: 'k' }, log: io.log, error: io.error }), 0);
  assert.equal(await run(['--balance'], { fetch: fake.fetch, env: { ELEVENLABS_API_KEY: 'k' }, log: io.log, error: io.error }), 0);
  assert.deepEqual(fake.calls.map((c) => [c.method, new URL(c.url).pathname]), [['GET', '/v2/voices'], ['GET', '/v1/user/subscription']]);
  assert.ok(io.text().includes('v1  Test Voice  [premade]  gender=female'));
  assert.match(io.text(), /Credits used: 1000 of 6000; remaining 5000/);
});

// ------------------------------------------------------------ playback

function fakeAudio() {
  const made = [];
  const createAudio = (url) => {
    const a = { url, volume: 0.123, paused: true, play() { this.paused = false; made.push(this); return Promise.reject(new Error('autoplay blocked')); }, pause() { this.paused = true; } };
    return a;
  };
  return { made, createAudio };
}

test('playback: caption always shown; audio only when the index lists the line', async () => {
  resetPledgeVoiceForTests();
  const requested = [];
  const index = { version: 1, publicBase: '/game3d/voice/pledges', lines: { 'l-01': { file: 'spk/l-01.mp3' } } };
  const audio = fakeAudio();
  const deps = { fetch: async (u) => { requested.push(u); return jsonResponse(index); }, createAudio: audio.createAudio };

  const captions = [];
  const a = await playPledgeLine('l-01', { caption: 'Hello there.', onCaption: (c) => captions.push(c) }, deps);
  assert.equal(a.url, '/game3d/voice/pledges/spk/l-01.mp3');
  assert.equal(a.audio.volume, 1, 'same default volume as the quest dialogue');
  assert.equal(a.audio.paused, false);

  const b = await playPledgeLine('not-recorded', { caption: 'Silent line.', onCaption: (c) => captions.push(c) }, deps);
  assert.equal(b.url, null);
  assert.equal(b.audio, null);
  assert.deepEqual(captions, ['Hello there.', 'Silent line.']);
  assert.equal(a.audio.paused, true, 'a new line stops the previous one');
  assert.deepEqual(requested, [PLEDGE_VOICE_INDEX_URL], 'the index is fetched once');
  assert.equal(await getPledgeLineUrl('l-01', deps), '/game3d/voice/pledges/spk/l-01.mp3');
});

test('playback: a missing index means captions only, no error', async () => {
  resetPledgeVoiceForTests();
  const audio = fakeAudio();
  const deps = { fetch: async () => jsonResponse({}, 404), createAudio: audio.createAudio };
  const r = await playPledgeLine('l-01', { caption: 'Still shown.' }, deps);
  assert.equal(r.caption, 'Still shown.');
  assert.equal(r.url, null);
  assert.equal(audio.made.length, 0);
  resetPledgeVoiceForTests();
  const throwing = { fetch: async () => { throw new Error('offline'); }, createAudio: audio.createAudio };
  assert.equal(await getPledgeLineUrl('l-01', throwing), null);
});

test('nothing loads until a pledge line is asked for', async () => {
  resetPledgeVoiceForTests();
  // Importing the module above made no request; only a call does.
  const calls = [];
  await getPledgeLineUrl('', { fetch: async (u) => { calls.push(u); return jsonResponse({ lines: {} }); }, createAudio: () => null });
  assert.equal(calls.length, 0, 'an empty id asks for nothing');
});

test('the shipped manifest is valid and its voice ids look like ElevenLabs ids', async () => {
  const shipped = JSON.parse(await readFile(path.join(HERE, '../src/components/game3d/pledges/voice/voiceManifest.json'), 'utf8'));
  const r = validateManifest(shipped);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.warnings, []);
  for (const [id, sp] of Object.entries(shipped.speakers)) {
    assert.ok(sp.voiceId === '' || /^[A-Za-z0-9]{20}$/.test(sp.voiceId), `${id}: ${sp.voiceId}`);
  }
});
