// Records Duelist Adventure's announcer with ElevenLabs text-to-speech (owner, 2026-11-22: "a person saying victory
// ... not computer-like"). The words and the voices are the game's own (src/components/duelist/client/
// announcerJudge.mjs: ANNOUNCER_LINES, ANNOUNCER_VOICES). Each line is saved as
// public/audio/duelist/announcer/<voice>/<line>.mp3 (more takes: <line>-2.mp3 ...), listed in that folder's
// lines.json, where client/announcer.mjs finds it.
//
//   node --env-file=<a git-ignored .env file holding ELEVENLABS_API_KEY> tools/duelist/record-announcer.mjs
//     --dry          list what would be made; nothing is sent
//     --voice a,b    just these voices     --only a,b   just these lines     --force   make them again
//
// The key is read from the environment and never printed.
/* global process, console, fetch, setTimeout, Buffer */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANNOUNCER_LINES, ANNOUNCER_VOICES } from '../../src/components/duelist/client/announcerJudge.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'audio', 'duelist', 'announcer');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? new Set(args[i + 1].split(',')) : null;
};
const voices = option('voice');
const only = option('only');
const fileOf = (line, take) => `${line}${take ? `-${take + 1}` : ''}.mp3`;

const todo = [];
for (const [voice, v] of Object.entries(ANNOUNCER_VOICES)) {
  if (voices && !voices.has(voice)) continue;
  mkdirSync(join(root, voice), { recursive: true });
  for (const [line, spec] of Object.entries(ANNOUNCER_LINES)) {
    if (only && !only.has(line)) continue;
    for (let take = 0; take < (spec.takes || 1); take++) {
      if (!flag('force') && existsSync(join(root, voice, fileOf(line, take)))) continue;
      todo.push({ voice, voiceId: v.voiceId, line, take, say: spec.say });
    }
  }
}
console.log(`${todo.length} lines to record (${todo.reduce((n, t) => n + t.say.length, 0)} characters)`);
const list = () => {
  for (const voice of Object.keys(ANNOUNCER_VOICES)) {
    if (!existsSync(join(root, voice))) continue;
    const lines = {};
    for (const [line, spec] of Object.entries(ANNOUNCER_LINES)) {
      const files = Array.from({ length: spec.takes || 1 }, (_, take) => fileOf(line, take)).filter((f) => existsSync(join(root, voice, f)));
      if (files.length) lines[line] = files;
    }
    writeFileSync(join(root, voice, 'lines.json'), `${JSON.stringify({ voice: ANNOUNCER_VOICES[voice].name, lines }, null, 2)}\n`);
  }
};
if (flag('dry')) { for (const t of todo) console.log(` ${t.voice}/${fileOf(t.line, t.take)}: ${t.say}`); process.exit(0); }
if (!process.env.ELEVENLABS_API_KEY) { console.error('ELEVENLABS_API_KEY is not set (run with --env-file)'); process.exit(1); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function make(t) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${t.voiceId}?output_format=mp3_44100_128`;
  const body = { text: t.say, model_id: 'eleven_v4' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify(body) });
    if (r.ok) { writeFileSync(join(root, t.voice, fileOf(t.line, t.take)), Buffer.from(await r.arrayBuffer())); return true; }
    const text = (await r.text()).slice(0, 300);
    if (r.status === 429 || r.status >= 500) { await wait(2000 * (attempt + 1)); continue; }
    console.error(`${t.voice}/${fileOf(t.line, t.take)}: ${r.status} ${text}`);
    return false;
  }
  return false;
}
let made = 0;
for (const t of todo) if (await make(t)) { made++; console.log(` made ${t.voice}/${fileOf(t.line, t.take)}`); }
list();
console.log(`${made} of ${todo.length} made`);
