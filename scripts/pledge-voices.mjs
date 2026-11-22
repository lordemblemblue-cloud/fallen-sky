#!/usr/bin/env node
/* global process, console, Buffer, URLSearchParams, setTimeout */
// Pledge voices: turns the final lines of the pledges (quests) into MP3 files with
// ElevenLabs, never paying twice for the same line, and prices the job first.
//
//   node scripts/pledge-voices.mjs                      dry run: counts, credits, what is new (no key needed)
//   node --env-file=<.env.local> scripts/pledge-voices.mjs --voices     the account's voices (free)
//   node --env-file=<.env.local> scripts/pledge-voices.mjs --models     the account's models and credit rates (free)
//   node --env-file=<.env.local> scripts/pledge-voices.mjs --balance    credits used, limit, reset date (free)
//   node --env-file=<.env.local> scripts/pledge-voices.mjs --record --yes-spend   records only new or changed lines
//
// Options: --manifest <file>  --out <dir>  --speaker <id>  --limit <n>
//
// The key is ELEVENLABS_API_KEY, read from process.env only. It is never printed,
// logged, written to a file or put in a URL (it travels in the xi-api-key header).
// See docs/game3d/three-empires/VOICE_PIPELINE.md.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_BASE = 'https://api.elevenlabs.io';
export const KEY_ENV = 'ELEVENLABS_API_KEY';
export const OUTPUT_FORMAT = 'mp3_44100_128';
const MP3_BYTES_PER_SECOND = 128000 / 8; // constant bit rate of OUTPUT_FORMAT
export const MAX_LINE_CHARS = 5000; // the tightest per-request limit of the TTS models (eleven_v3)
export const INDEX_VERSION = 1;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_MANIFEST = path.join(ROOT, 'src/components/game3d/pledges/voice/voiceManifest.json');
export const DEFAULT_OUT_DIR = path.join(ROOT, 'public/game3d/voice/pledges');
export const PUBLIC_BASE = '/game3d/voice/pledges';

// Credits per character on ElevenLabs' self-serve plans, used when the account's
// own /v1/models rates are not at hand (dry run without a key). --record replaces
// these with the rates the API reports for the account.
export const CREDITS_PER_CHAR = Object.freeze({
  eleven_v3: 1,
  eleven_multilingual_v2: 1,
  eleven_monolingual_v1: 1,
  eleven_multilingual_v1: 1,
  eleven_flash_v2_5: 0.5,
  eleven_flash_v2: 0.5,
  eleven_turbo_v2_5: 0.5,
  eleven_turbo_v2: 0.5,
});

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const SETTING_KEYS = new Set(['stability', 'similarity_boost', 'style', 'use_speaker_boost', 'speed']);

// ---------------------------------------------------------------- pure helpers

/** Characters as ElevenLabs bills them: Unicode code points of the text sent. */
export function countChars(text) {
  return [...String(text)].length;
}

/** The text exactly as it is sent: trimmed, Windows line endings made plain. */
export function spokenText(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').trim();
}

export function textHash(text) {
  return 'sha256:' + createHash('sha256').update(spokenText(text), 'utf8').digest('hex');
}

export function creditsPerChar(model, rates = CREDITS_PER_CHAR) {
  const r = rates?.[model];
  return typeof r === 'number' && r > 0 ? r : null;
}

export function estimateCredits(chars, model, rates = CREDITS_PER_CHAR) {
  const r = creditsPerChar(model, rates) ?? 1;
  return Math.ceil(chars * r);
}

/**
 * Checks the manifest. Returns { ok, errors, warnings }. voiceId may be empty while
 * casting is open; recording refuses lines whose speaker has no voice.
 */
export function validateManifest(manifest) {
  const errors = [];
  const warnings = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['The manifest must be a JSON object.'], warnings };
  }
  if (typeof manifest.model !== 'string' || !manifest.model.trim()) {
    errors.push('"model" must be a model id such as "eleven_multilingual_v2".');
  } else if (!creditsPerChar(manifest.model)) {
    warnings.push(`Model "${manifest.model}" has no built-in credit rate; the dry run counts 1 credit per character.`);
  }
  const speakers = manifest.speakers;
  if (!speakers || typeof speakers !== 'object' || Array.isArray(speakers)) {
    errors.push('"speakers" must be an object keyed by speaker id.');
  } else {
    for (const [id, sp] of Object.entries(speakers)) {
      if (!ID_PATTERN.test(id)) errors.push(`Speaker id "${id}" must be lower case letters, digits, "-" or "_".`);
      if (!sp || typeof sp !== 'object') { errors.push(`Speaker "${id}" must be an object.`); continue; }
      if (sp.voiceId != null && typeof sp.voiceId !== 'string') errors.push(`Speaker "${id}": voiceId must be a string.`);
      if (sp.settings != null) {
        if (typeof sp.settings !== 'object' || Array.isArray(sp.settings)) {
          errors.push(`Speaker "${id}": settings must be an object.`);
        } else {
          for (const [k, v] of Object.entries(sp.settings)) {
            if (!SETTING_KEYS.has(k)) errors.push(`Speaker "${id}": unknown setting "${k}".`);
            else if (k === 'use_speaker_boost' ? typeof v !== 'boolean' : typeof v !== 'number') {
              errors.push(`Speaker "${id}": setting "${k}" has the wrong type.`);
            }
          }
        }
      }
    }
  }
  if (!Array.isArray(manifest.lines)) {
    errors.push('"lines" must be an array.');
  } else {
    const seen = new Set();
    manifest.lines.forEach((line, i) => {
      const where = `lines[${i}]`;
      if (!line || typeof line !== 'object') { errors.push(`${where} must be an object.`); return; }
      if (typeof line.id !== 'string' || !ID_PATTERN.test(line.id)) {
        errors.push(`${where}: id must be lower case letters, digits, "-" or "_" (it becomes a file name).`);
      } else if (seen.has(line.id)) {
        errors.push(`${where}: duplicate id "${line.id}".`);
      } else seen.add(line.id);
      if (typeof line.speaker !== 'string' || !speakers || !Object.hasOwn(speakers, line.speaker)) {
        errors.push(`${where} (${line.id}): speaker "${line.speaker}" is not in "speakers".`);
      }
      const text = typeof line.text === 'string' ? spokenText(line.text) : '';
      if (!text) errors.push(`${where} (${line.id}): text is empty.`);
      else if (countChars(text) > MAX_LINE_CHARS) errors.push(`${where} (${line.id}): text is over ${MAX_LINE_CHARS} characters; split it.`);
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function emptyIndex() {
  return { version: INDEX_VERSION, publicBase: PUBLIC_BASE, lines: {} };
}

/**
 * Decides, per line, whether a file already holds it. A line is skipped only when
 * its file exists and the index records the same text hash, voice and model.
 * fileExists(relPath) -> boolean.
 */
export function planLines(manifest, index, fileExists) {
  const entries = index?.lines || {};
  const plan = [];
  for (const line of manifest.lines) {
    const sp = manifest.speakers[line.speaker] || {};
    const text = spokenText(line.text);
    const hash = textHash(text);
    const voiceId = sp.voiceId || '';
    const file = `${line.speaker}/${line.id}.mp3`;
    const prev = entries[line.id];
    const reasons = [];
    let status;
    if (!prev) { status = 'new'; reasons.push('no recording'); }
    else if (!fileExists(prev.file || file)) { status = 'new'; reasons.push('file missing'); }
    else {
      if (prev.textHash !== hash) reasons.push('text changed');
      if (prev.voiceId !== voiceId) reasons.push('voice changed');
      if (prev.model !== manifest.model) reasons.push('model changed');
      if (prev.speaker !== line.speaker) reasons.push('speaker changed');
      if ((prev.file || file) !== file) reasons.push('file moved');
      status = reasons.length ? 'changed' : 'skip';
    }
    const settingsNote = status === 'skip' && JSON.stringify(prev.settings ?? null) !== JSON.stringify(sp.settings ?? null)
      ? 'voice settings differ from the recording (kept; delete the index entry to re-record)' : null;
    plan.push({ id: line.id, speaker: line.speaker, text, hash, voiceId, file, chars: countChars(text), status, reasons, settingsNote });
  }
  return plan;
}

/** Totals per speaker and overall; "todo" counts only new or changed lines. */
export function summarize(plan, model, rates = CREDITS_PER_CHAR) {
  const speakers = {};
  const total = { lines: 0, chars: 0, todoLines: 0, todoChars: 0, skipped: 0 };
  for (const p of plan) {
    const s = speakers[p.speaker] ||= { lines: 0, chars: 0, todoLines: 0, todoChars: 0 };
    s.lines += 1; s.chars += p.chars; total.lines += 1; total.chars += p.chars;
    if (p.status === 'skip') total.skipped += 1;
    else { s.todoLines += 1; s.todoChars += p.chars; total.todoLines += 1; total.todoChars += p.chars; }
  }
  return {
    model,
    creditsPerChar: creditsPerChar(model, rates) ?? 1,
    speakers,
    total,
    creditsAll: estimateCredits(total.chars, model, rates),
    creditsTodo: estimateCredits(total.todoChars, model, rates),
  };
}

export function formatSummary(summary, plan, { maxListed = 60 } = {}) {
  const out = [];
  out.push(`Model: ${summary.model} (${summary.creditsPerChar} credit per character)`);
  out.push('');
  out.push('Speaker                      lines   chars   to record (lines / chars)');
  for (const [id, s] of Object.entries(summary.speakers).sort()) {
    out.push(`${id.padEnd(28)} ${String(s.lines).padStart(5)} ${String(s.chars).padStart(7)}   ${String(s.todoLines).padStart(5)} / ${s.todoChars}`);
  }
  const t = summary.total;
  out.push(`${'TOTAL'.padEnd(28)} ${String(t.lines).padStart(5)} ${String(t.chars).padStart(7)}   ${String(t.todoLines).padStart(5)} / ${t.todoChars}`);
  out.push('');
  out.push(`Estimated credits, every line:        ${summary.creditsAll}`);
  out.push(`Estimated credits, new/changed only:  ${summary.creditsTodo}`);
  out.push(`Already recorded and unchanged (skipped): ${t.skipped}`);
  const todo = plan.filter((p) => p.status !== 'skip');
  if (todo.length) {
    out.push('');
    out.push('New or changed:');
    for (const p of todo.slice(0, maxListed)) out.push(`  ${p.status.padEnd(7)} ${p.id} (${p.speaker}, ${p.chars} chars: ${p.reasons.join(', ')})`);
    if (todo.length > maxListed) out.push(`  … and ${todo.length - maxListed} more`);
  }
  const notes = plan.filter((p) => p.settingsNote);
  if (notes.length) {
    out.push('');
    for (const p of notes) out.push(`  note: ${p.id}: ${p.settingsNote}`);
  }
  return out.join('\n');
}

export function parseArgs(argv) {
  const opts = { mode: 'dry', yesSpend: false, manifest: null, out: null, speaker: null, limit: null, unknown: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];
    const value = () => (inline != null ? inline : argv[++i]);
    if (flag === '--voices') opts.mode = 'voices';
    else if (flag === '--models') opts.mode = 'models';
    else if (flag === '--balance') opts.mode = 'balance';
    else if (flag === '--record') opts.mode = 'record';
    else if (flag === '--yes-spend') opts.yesSpend = true;
    else if (flag === '--manifest') opts.manifest = value();
    else if (flag === '--out') opts.out = value();
    else if (flag === '--speaker') opts.speaker = value();
    else if (flag === '--limit') opts.limit = Number(value());
    else opts.unknown.push(a);
  }
  return opts;
}

// ---------------------------------------------------------------- API (all free except textToSpeech)

async function apiError(res) {
  let detail = '';
  try {
    const body = await res.json();
    const d = body?.detail;
    detail = typeof d === 'string' ? d : (d?.message || d?.status || '');
  } catch { /* not JSON */ }
  return new Error(`ElevenLabs answered ${res.status}${detail ? `: ${detail}` : ''}`);
}

function headers(key, extra = {}) {
  return { 'xi-api-key': key, accept: 'application/json', ...extra };
}

export async function fetchVoices(fetchImpl, key) {
  const voices = [];
  let token = null;
  for (let page = 0; page < 50; page += 1) {
    const q = new URLSearchParams({ page_size: '100' });
    if (token) q.set('next_page_token', token);
    const res = await fetchImpl(`${API_BASE}/v2/voices?${q}`, { headers: headers(key) });
    if (!res.ok) throw await apiError(res);
    const body = await res.json();
    voices.push(...(body.voices || []));
    if (!body.has_more || !body.next_page_token) break;
    token = body.next_page_token;
  }
  return voices.map((v) => ({
    id: v.voice_id, name: v.name, category: v.category || '', labels: v.labels || {}, description: v.description || '',
  }));
}

export async function fetchModels(fetchImpl, key) {
  const res = await fetchImpl(`${API_BASE}/v1/models`, { headers: headers(key) });
  if (!res.ok) throw await apiError(res);
  const body = await res.json();
  return (Array.isArray(body) ? body : body.models || []).map((m) => ({
    id: m.model_id,
    name: m.name,
    tts: m.can_do_text_to_speech !== false,
    creditsPerChar: m.model_rates?.character_cost_multiplier ?? null,
    maxChars: m.maximum_text_length_per_request ?? null,
    languages: (m.languages || []).length,
  }));
}

export async function fetchBalance(fetchImpl, key) {
  const res = await fetchImpl(`${API_BASE}/v1/user/subscription`, { headers: headers(key) });
  if (!res.ok) throw await apiError(res);
  const b = await res.json();
  const used = Number(b.character_count) || 0;
  const limit = Number(b.character_limit) || 0;
  const reset = b.next_character_count_reset_unix ? new Date(b.next_character_count_reset_unix * 1000) : null;
  return { tier: b.tier || '', status: b.status || '', used, limit, remaining: Math.max(0, limit - used), reset };
}

export async function textToSpeech(fetchImpl, key, { voiceId, model, text, settings }) {
  const body = { text, model_id: model };
  if (settings && Object.keys(settings).length) body.voice_settings = settings;
  const url = `${API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`;
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: headers(key, { 'content-type': 'application/json', accept: 'audio/mpeg' }),
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    // 429 (busy) is not billed: wait and try again a few times. Anything else stops the run.
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw await apiError(res);
  }
}

// ---------------------------------------------------------------- files

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function loadIndex(outDir) {
  const file = path.join(outDir, 'voiceIndex.json');
  if (!existsSync(file)) return emptyIndex();
  const idx = await readJson(file);
  if (!idx || typeof idx !== 'object' || !idx.lines) throw new Error(`${file} is not a voice index.`);
  return idx;
}

async function writeAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

export async function saveIndex(outDir, index) {
  const sorted = Object.fromEntries(Object.entries(index.lines).sort(([a], [b]) => a.localeCompare(b)));
  await writeAtomic(path.join(outDir, 'voiceIndex.json'), JSON.stringify({ ...index, lines: sorted }, null, 2) + '\n');
}

// ---------------------------------------------------------------- run

/**
 * Runs one mode. Returns the exit code. deps: { fetch, env, log, error, manifestPath, outDir, now }.
 * Exit codes: 0 done, 1 bad input or API failure, 2 refused to spend, 3 not enough credits.
 */
export async function run(argv, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const env = deps.env || process.env;
  const log = deps.log || ((s) => console.log(s));
  const error = deps.error || ((s) => console.error(s));
  const now = deps.now || (() => new Date());
  const opts = parseArgs(argv);
  if (opts.unknown.length) { error(`Unknown option(s): ${opts.unknown.join(' ')}`); return 1; }

  const needKey = () => {
    const key = env[KEY_ENV];
    if (!key || !String(key).trim()) {
      error(`${KEY_ENV} is not set. Start node with --env-file=<path to the .env.local that holds it>; the key is never read from anywhere else.`);
      return null;
    }
    return String(key).trim();
  };

  try {
    if (opts.mode === 'voices') {
      const key = needKey(); if (!key) return 1;
      const voices = await fetchVoices(fetchImpl, key);
      log(`${voices.length} voices on the account:`);
      for (const v of voices) {
        const labels = Object.entries(v.labels).map(([k, val]) => `${k}=${val}`).join(', ');
        log(`${v.id}  ${v.name}  [${v.category}]${labels ? `  ${labels}` : ''}`);
      }
      return 0;
    }
    if (opts.mode === 'models') {
      const key = needKey(); if (!key) return 1;
      for (const m of await fetchModels(fetchImpl, key)) {
        if (!m.tts) continue;
        log(`${m.id}  ${m.name}  credits/char=${m.creditsPerChar ?? '?'}  max chars/request=${m.maxChars ?? '?'}  languages=${m.languages}`);
      }
      return 0;
    }
    if (opts.mode === 'balance') {
      const key = needKey(); if (!key) return 1;
      const b = await fetchBalance(fetchImpl, key);
      log(`Plan: ${b.tier}${b.status ? ` (${b.status})` : ''}`);
      log(`Credits used: ${b.used} of ${b.limit}; remaining ${b.remaining}`);
      log(`Resets: ${b.reset ? b.reset.toISOString() : 'unknown'}`);
      return 0;
    }

    // dry run and record both start from the manifest and the index
    const manifestPath = path.resolve(opts.manifest || deps.manifestPath || DEFAULT_MANIFEST);
    const outDir = path.resolve(opts.out || deps.outDir || DEFAULT_OUT_DIR);
    const manifest = await readJson(manifestPath);
    const check = validateManifest(manifest);
    for (const w of check.warnings) log(`warning: ${w}`);
    if (!check.ok) { for (const e of check.errors) error(`error: ${e}`); return 1; }
    const index = await loadIndex(outDir);
    const fileExists = (rel) => existsSync(path.join(outDir, rel));

    let plan = planLines(manifest, index, fileExists);
    const orphans = Object.keys(index.lines).filter((id) => !manifest.lines.some((l) => l.id === id));
    log(`Manifest: ${path.relative(process.cwd(), manifestPath) || manifestPath}`);
    log(formatSummary(summarize(plan, manifest.model), plan));
    if (orphans.length) log(`\nIn the index but no longer in the manifest (kept, not deleted): ${orphans.join(', ')}`);

    if (opts.mode !== 'record') return 0;

    log('');
    if (!opts.yesSpend) {
      error('Refusing to record: recording spends ElevenLabs credits. Run again with --record --yes-spend once the lines are final.');
      return 2;
    }
    let todo = plan.filter((p) => p.status !== 'skip');
    if (opts.speaker) todo = todo.filter((p) => p.speaker === opts.speaker);
    if (Number.isFinite(opts.limit) && opts.limit >= 0) todo = todo.slice(0, opts.limit);
    if (!todo.length) { log('Nothing to record.'); return 0; }
    const uncast = [...new Set(todo.filter((p) => !p.voiceId).map((p) => p.speaker))];
    if (uncast.length) { error(`No voiceId yet for: ${uncast.join(', ')}. Cast them in the manifest first.`); return 1; }

    const key = needKey(); if (!key) return 1;

    // The account's own credit rate for the model, if the API reports one.
    let rates = CREDITS_PER_CHAR;
    try {
      const models = await fetchModels(fetchImpl, key);
      const m = models.find((x) => x.id === manifest.model);
      if (!m) { error(`Model "${manifest.model}" is not offered to this account.`); return 1; }
      if (m.creditsPerChar) rates = { ...CREDITS_PER_CHAR, [manifest.model]: m.creditsPerChar };
    } catch (e) {
      log(`(could not read model rates, using the built-in table: ${e.message})`);
    }
    const todoChars = todo.reduce((n, p) => n + p.chars, 0);
    const estimate = estimateCredits(todoChars, manifest.model, rates);
    const balance = await fetchBalance(fetchImpl, key);
    log(`This run: ${todo.length} lines, ${todoChars} characters, about ${estimate} credits. Remaining on the account: ${balance.remaining}.`);
    if (balance.remaining < estimate) {
      error(`Stopping before spending: ${estimate} credits needed, ${balance.remaining} left (resets ${balance.reset ? balance.reset.toISOString() : 'unknown'}).`);
      return 3;
    }

    let done = 0;
    for (const p of todo) {
      const sp = manifest.speakers[p.speaker];
      const audio = await textToSpeech(fetchImpl, key, { voiceId: p.voiceId, model: manifest.model, text: p.text, settings: sp.settings });
      if (!audio.length) throw new Error(`Empty audio for ${p.id}.`);
      await writeAtomic(path.join(outDir, p.file), audio);
      const bytes = (await stat(path.join(outDir, p.file))).size;
      index.lines[p.id] = {
        file: p.file,
        textHash: p.hash,
        speaker: p.speaker,
        voiceId: p.voiceId,
        model: manifest.model,
        settings: sp.settings ?? null,
        chars: p.chars,
        bytes,
        durationSec: Math.round((bytes / MP3_BYTES_PER_SECOND) * 100) / 100,
        recordedAt: now().toISOString(),
      };
      // Saved after every line, so a stopped run never loses a line it paid for.
      await saveIndex(outDir, index);
      done += 1;
      log(`recorded ${p.id} (${p.chars} chars, ${bytes} bytes)`);
    }
    log(`Done: ${done} line(s) recorded into ${outDir}.`);
    return 0;
  } catch (e) {
    error(`Failed: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
