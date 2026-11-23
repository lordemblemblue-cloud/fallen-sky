// Records Duelist Adventure's sound effects and taunt lines with ElevenLabs (owner, 2026-11-22: "I want you to use
// 11 Labs to like generate voice and maybe sound effects as well for their abilities"; the warrior's Rage "starts
// screaming ... then he starts breathing really hard"). Effects come from the sound-generation endpoint, taunts from
// text-to-speech (the premade voices the comms already use). Each is saved as public/audio/duelist/sfx/<name>.mp3
// (variants <name>-2.mp3 ...) and listed in sfx.json, where client/audio.mjs finds it: a recording plays instead of
// the synthesized sound of the same name, and the synth stays as the fallback. The prompts describe sounds in plain
// words, never another work's.
//
//   node --env-file=<a git-ignored .env file holding ELEVENLABS_API_KEY> tools/duelist/record-ability-sounds.mjs
//     --dry          list what would be made and its rough cost; nothing is sent
//     --only a,b     just these names     --force   make them again even if they exist
//
// The key is read from the environment and never printed.
/* global process, console, fetch, setTimeout, Buffer */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'audio', 'duelist', 'sfx');
mkdirSync(folder, { recursive: true });

// name: { text, seconds, variants, loop, gain, influence } for an effect; { say, voice, gain } for a spoken line
const FX = {
  // ---- the blades and the body (they replace the synthesized basics)
  swing: { text: 'fast energy sword swing whoosh, a humming crystal blade cutting through the air', seconds: 0.6, variants: 3, gain: 0.7 },
  swingHeavy: { text: 'heavy energy greatsword swing, a deep humming whoosh', seconds: 0.8, variants: 2, gain: 0.8 },
  // the hits (owner, 2026-11-22: like energy blades clashing when you hit somebody): an instant crackling electric
  // clash with a buzzing hum, not a thud
  hitBody: { text: 'a humming plasma energy blade slicing into a body, an instant sharp crackling electric zap with a hot sizzle and a buzzing hum, punchy', seconds: 0.6, variants: 3, influence: 0.6, gain: 0.85 },
  hitVeil: { text: 'a humming plasma energy blade striking an energy shield, an instant crackling electric impact with a deep resonant hum', seconds: 0.6, variants: 2, influence: 0.6, gain: 0.75 },
  hitShield: { text: 'a bright hexagonal energy barrier taking a hit, a ringing chime', seconds: 0.5, variants: 2, gain: 0.6 },
  block: { text: 'two buzzing plasma energy blades clashing, an instant loud crackling electric crash with a humming buzz', seconds: 0.6, variants: 3, influence: 0.6, gain: 0.85 },
  parry: { text: 'two humming plasma energy swords locking hard, an instant loud crackling electric crash with spitting sparks and a ringing buzz', seconds: 0.9, variants: 2, influence: 0.6, gain: 0.9 },
  // the push (owner, 2026-11-22: "like wind itself pushing at you ... really devastating"), and the body it hits
  // skidding back across the floor
  push: { text: 'a devastating blast of wind, a deep booming air shockwave rushing outward with a roaring gust', seconds: 1.2, variants: 2, influence: 0.55, gain: 0.95 },
  pushSlide: { text: 'a body skidding hard backward across a stone floor, a long gritty scrape with a rush of wind', seconds: 1.2, influence: 0.55, gain: 0.8 },
  pull: { text: 'a telekinetic pull, air rushing inward, a deep suction whoosh', seconds: 1.0, gain: 0.85 },
  throw: { text: 'a violent telekinetic throw, a heavy whoosh and a body slamming away', seconds: 1.0, gain: 0.9 },
  dash: { text: 'a quick energy dash, a short burst whoosh', seconds: 0.5, gain: 0.7 },
  roll: { text: 'a quick tumble roll across a stone floor, a loud cloth swish and a firm body thump', seconds: 0.8, influence: 0.65, gain: 0.8 },
  knockdown: { text: 'a body falling hard onto a stone floor in light armor', seconds: 0.8, gain: 0.8 },
  collapse: { text: 'an energy shield shattering like crystal glass, a magical break', seconds: 1.2, gain: 0.8 },
  defeat: { text: 'a deep energy dissipating, a fading magical hum', seconds: 1.5, gain: 0.7 },
  // ---- the classes' abilities
  rageRoar_m: { text: 'a deep male warrior roaring in fury, a primal battle scream', seconds: 2.0, influence: 0.6, gain: 1 },
  rageRoar_f: { text: 'a female warrior screaming a fierce furious battle cry', seconds: 2.0, influence: 0.6, gain: 1 },
  rageBreath_m: { text: 'heavy aggressive panting breathing of an enraged man, steady and fierce', seconds: 4, loop: true, influence: 0.6, gain: 0.55 },
  rageBreath_f: { text: 'heavy aggressive panting breathing of an enraged woman, steady and fierce', seconds: 4, loop: true, influence: 0.6, gain: 1.6 }, // recorded about 10 dB quieter than the man's
  fireIgnite: { text: 'fire igniting in a sudden roaring burst, flames whooshing up', seconds: 1.5, gain: 0.9 },
  fireLoop: { text: 'crackling roaring flames burning around a body', seconds: 4, loop: true, gain: 0.35 },
  leapWhoosh: { text: 'a powerful leap into the air, a rising heavy whoosh', seconds: 0.7, gain: 0.8 },
  groundSlam: { text: 'a massive ground slam impact, stone cracking, a shockwave boom', seconds: 1.5, gain: 1 },
  repulseSlam: { text: 'a ground pound shockwave, a deep boom and rumble with debris', seconds: 1.5, gain: 1 },
  mend: { text: 'a gentle magical healing chime, a warm shimmering sparkle', seconds: 1.5, gain: 0.7 },
  sanctuary: { text: 'a soft magical healing mist spreading out, an airy whoosh with bright chimes', seconds: 3, gain: 0.8 },
  levitate: { text: 'an ethereal rising telekinetic hum, something being lifted by magic', seconds: 2, gain: 0.8 },
  dominate: { text: 'an eerie psychic mind pulse, a whispering echo, hypnotic', seconds: 2, gain: 0.8 },
  dominanceBreak: { text: 'a psychic link shattering, a glassy crack and a whoosh', seconds: 1, gain: 0.8 },
  cloak: { text: 'a shimmering invisibility fade, a soft magical vanish', seconds: 1.2, gain: 0.7 },
  blink: { text: 'a dark teleport, a shadowy whoosh vanishing and reappearing', seconds: 1, gain: 0.85 },
  executionPull: { text: 'a powerful telekinetic grip dragging someone forward, a rising rush', seconds: 1, gain: 0.9 },
  executionStab: { text: 'an energy blade stabbing through armor, a deep impact and a sizzle', seconds: 1, gain: 1 },
  shove: { text: 'a telekinetic shove, a heavy push whoosh', seconds: 0.8, gain: 0.9 },
  airDash: { text: 'a very fast dash through the air, an energy burst whoosh', seconds: 0.5, gain: 0.75 },
  airJump: { text: 'a jump off the air, a soft concussive burst', seconds: 0.5, gain: 0.7 },
  counter: { text: 'a plasma energy blade parry and a quick riposte, an instant crackling electric clash then a fast buzzing slash', seconds: 0.8, influence: 0.6, gain: 0.9 },
  quickstep: { text: 'a speed boost, a whoosh with a rising energy tone', seconds: 0.8, gain: 0.7 },
  empower: { text: 'an energy weapon powering up, a charged rising hum', seconds: 1, gain: 0.7 },
  bladeThrow: { text: 'a spinning energy blade thrown through the air, a rotating whoosh', seconds: 1, gain: 0.8 },
};
// the taunts (T): one line per class, in a man's and a woman's voice (the body decides which plays)
const TAUNTS = {
  warrior: { say: 'Is that all you have got?', m: 'N2lVS1w4EtoT3dr4eOWO', f: 'XrExE9yKIg1WjnnlVkGX' },
  duelist: { say: 'Too slow.', m: 'JBFqnCBsd6RMkjVDRZzb', f: 'pFZP5JQG7iQjIQuC4Bku' },
  assassin: { say: 'You never saw me coming.', m: 'SOYHLrjzK2X1ezoPC6cr', f: 'EXAVITQu4vr4xnSDxMaL' },
  healer: { say: 'I will still be standing.', m: 'pNInz6obpgDQGcFmaJgB', f: 'SAz9YHcvj6GT2YYXdXww' },
};
for (const [cls, t] of Object.entries(TAUNTS)) for (const g of ['m', 'f']) FX[`taunt_${cls}_${g}`] = { say: t.say, voice: t[g], gain: 1 };

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const only = option('only', '') ? new Set(option('only', '').split(',')) : null;
const listPath = join(folder, 'sfx.json');
const fileOf = (name, i) => `${name}${i ? `-${i + 1}` : ''}.mp3`;
const todo = [];
for (const [name, spec] of Object.entries(FX)) {
  if (only && !only.has(name)) continue;
  for (let i = 0; i < (spec.variants || 1); i++) {
    if (!flag('force') && existsSync(join(folder, fileOf(name, i)))) continue;
    todo.push({ name, i, spec });
  }
}
const seconds = todo.filter((t) => !t.spec.say).reduce((n, t) => n + t.spec.seconds, 0);
const characters = todo.filter((t) => t.spec.say).reduce((n, t) => n + t.spec.say.length, 0);
console.log(`${todo.length} recordings to make: ${todo.filter((t) => !t.spec.say).length} effects (${seconds.toFixed(1)} s of sound) and ` +
  `${todo.filter((t) => t.spec.say).length} spoken lines (${characters} characters)`);
const save = () => {
  const sounds = {};
  for (const [name, spec] of Object.entries(FX)) {
    const files = Array.from({ length: spec.variants || 1 }, (_, i) => fileOf(name, i)).filter((f) => existsSync(join(folder, f)));
    if (files.length) sounds[name] = { files, gain: spec.gain ?? 1, ...(spec.loop ? { loop: true } : {}) };
  }
  writeFileSync(listPath, `${JSON.stringify({ sounds }, null, 2)}\n`);
};
if (flag('dry')) { for (const t of todo) console.log(` ${fileOf(t.name, t.i)}: ${t.spec.say || t.spec.text}`); process.exit(0); }
if (!process.env.ELEVENLABS_API_KEY) { console.error('ELEVENLABS_API_KEY is not set (run with --env-file)'); process.exit(1); }
const headers = { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function make({ name, i, spec }) {
  const url = spec.say
    ? `https://api.elevenlabs.io/v1/text-to-speech/${spec.voice}?output_format=mp3_44100_128`
    : 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
  const body = spec.say
    ? { text: spec.say, model_id: 'eleven_v4' }
    : { text: spec.text, duration_seconds: spec.seconds, prompt_influence: spec.influence ?? 0.45, ...(spec.loop ? { loop: true } : {}) };
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (r.ok) { writeFileSync(join(folder, fileOf(name, i)), Buffer.from(await r.arrayBuffer())); return true; }
    const text = (await r.text()).slice(0, 300);
    // an older account without seamless loops: ask again without it
    if (r.status === 422 && body.loop) { delete body.loop; continue; }
    if (r.status === 429 || r.status >= 500) { await wait(2000 * (attempt + 1)); continue; }
    console.error(`${fileOf(name, i)}: ${r.status} ${text}`);
    return false;
  }
  return false;
}
let made = 0;
for (const t of todo) {
  if (await make(t)) { made++; console.log(` made ${fileOf(t.name, t.i)}`); save(); }
}
save();
console.log(`${made} of ${todo.length} made; ${Object.keys(JSON.parse(readFileSync(listPath, 'utf8')).sounds).length} sounds listed in sfx.json`);
