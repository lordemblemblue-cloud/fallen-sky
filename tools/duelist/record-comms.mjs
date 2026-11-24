// Records the story missions' comms lines with ElevenLabs text-to-speech, one voice per speaker (CAST below:
// ElevenLabs' premade voices). Each line is saved as public/audio/duelist/voices/<id>.mp3 and listed in
// voices.json, where the game finds it (client/voices.mjs plays a recording instead of the browser's voice).
// Lines that already have a recording are skipped, so after a mission's words change: regenerate lines.json
// (node tools/duelist/comms-lines.mjs), then run this again and only the new or changed lines are recorded.
//
//   node --env-file=<a git-ignored .env file holding ELEVENLABS_API_KEY> tools/duelist/record-comms.mjs
//     --dry            list what would be recorded and the characters it costs; nothing is sent
//     --only id,id     just these lines        --force   record them again even if they have a recording
//     --model <id>     ElevenLabs model (default eleven_v4)    --format <id>   output (default mp3_44100_64)
//
// The key is read from the environment and never printed. Every character spoken costs a credit (about 3,150
// for all 47 lines at the time of writing).
/* global process, console, fetch, setTimeout, Buffer */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineId } from '../../src/components/duelist/client/voices.mjs';

const folder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'audio', 'duelist', 'voices');

// who speaks with which voice (the ids are ElevenLabs' public premade voices); settings: voice_settings to
// send, when a voice needs other than its own defaults
const CAST = {
  Ione: { voice: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' }, // the crew's handler on the radio: confident, warm
  Arden: { voice: 'SAz9YHcvj6GT2YYXdXww', name: 'River' }, // the teacher: calm; a neutral voice (the story gives Arden no pronoun)
  'Arden (recording)': { voice: 'SAz9YHcvj6GT2YYXdXww', name: 'River' },
  Hask: { voice: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' }, // the refuge's keeper
  Crane: { voice: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily' }, // the Warden-Captain
  Dask: { voice: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' }, // the quartermaster who builds the guns: gravelly
  Perrin: { voice: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda' }, // the broker: a cool alto
  Halvane: { voice: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  Rooke: { voice: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' }, // the security chief: firm
  Defender: { voice: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry' }, // a refuge defender at the lock
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const dry = flag('dry');
const force = flag('force');
const only = option('only', '') ? new Set(option('only', '').split(',')) : null;
const model = option('model', 'eleven_v4');
const format = option('format', 'mp3_44100_64');
const kbps = Number(format.split('_')[2]) || 128;

const { lines } = JSON.parse(readFileSync(join(folder, 'lines.json'), 'utf8'));
const listPath = join(folder, 'voices.json');
const recorded = existsSync(listPath) ? JSON.parse(readFileSync(listPath, 'utf8')).lines || {} : {};
for (const l of lines) {
  if (lineId(l.speaker, l.text) !== l.id) throw new Error(`lines.json is out of date at ${l.id}: run node tools/duelist/comms-lines.mjs`);
  if (!CAST[l.speaker]) throw new Error(`no ElevenLabs voice for ${l.speaker}: give them one in CAST`);
}
const has = (l) => recorded[l.id] && existsSync(join(folder, recorded[l.id]));
const todo = lines.filter((l) => (!only || only.has(l.id)) && (force || !has(l)));
const characters = todo.reduce((n, l) => n + l.text.length, 0);
console.log(`${todo.length} of ${lines.length} lines to record: ${characters} characters with ${model} (${format})`);

// voices.json in the order of lines.json; recordings of lines that no longer exist are left out (and named)
const save = () => {
  const list = Object.fromEntries(lines.filter((l) => recorded[l.id]).map((l) => [l.id, recorded[l.id]]));
  writeFileSync(listPath, `${JSON.stringify({ lines: list }, null, 2)}\n`);
};
const gone = Object.keys(recorded).filter((id) => !lines.some((l) => l.id === id));
if (gone.length) console.log(`no longer in any mission (left out of voices.json; delete the files if you like): ${gone.map((id) => recorded[id]).join(', ')}`);

async function speak(line) {
  const part = CAST[line.speaker];
  const body = { text: line.text, model_id: model, ...(part.settings ? { voice_settings: part.settings } : {}) };
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${part.voice}?output_format=${format}`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (r.ok) return { audio: Buffer.from(await r.arrayBuffer()), charged: Number(r.headers.get('x-character-count')) || null };
    const detail = (await r.text()).slice(0, 400);
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await new Promise((ok) => setTimeout(ok, 2000 * attempt)); continue; }
    throw new Error(`ElevenLabs answered ${r.status} for ${line.id}: ${detail}`);
  }
}

if (dry) {
  for (const l of todo) console.log(`  ${l.id} ${l.speaker} (${CAST[l.speaker].name}): ${l.text}`);
} else if (!process.env.ELEVENLABS_API_KEY) {
  console.error('ELEVENLABS_API_KEY is not set: run with node --env-file=<a git-ignored .env file holding it>');
  process.exitCode = 1;
} else {
  let charged = 0;
  for (const line of todo) {
    const { audio, charged: c } = await speak(line);
    const file = `${line.id}.mp3`;
    writeFileSync(join(folder, file), audio);
    recorded[line.id] = file;
    save(); // after every line, so a stopped run keeps what it made
    charged += c ?? line.text.length;
    console.log(`  ${line.id} ${line.speaker} (${CAST[line.speaker].name}): ${(audio.length / 1024).toFixed(0)} KB, about ${((audio.length * 8) / (kbps * 1000)).toFixed(1)} s`);
  }
  if (todo.length === 0) save();
  console.log(`done: ${todo.length} recorded, about ${charged} characters charged; ${lines.filter(has).length} of ${lines.length} lines have a recording`);
}
