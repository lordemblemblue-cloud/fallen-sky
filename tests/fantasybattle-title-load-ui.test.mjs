/* global process */
// Fantasy Battle (Sapphire Adventure) title and Load screens, rendered from the real component (WP-FB-03).
// The component is bundled with esbuild and rendered with react-dom/server. Its save slots are normally read from
// localStorage in an effect, which server rendering never runs, so the test hands the component's first render the
// slots that adventureState's own readSlots() makes from a storage holding real saves (valid, damaged, empty).
// These tests fail if Continue stops requiring a valid save or Load stops listing exactly the valid slots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { SAVE_KEY, createProfile, writeSlot, readSlots } from '../src/components/fantasybattle/core/adventureState.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
}

let renderAdventure;
test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-ui-'));
  const entry = `import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SapphireAdventure from ${JSON.stringify(path.join(root, 'src/components/fantasybattle/SapphireAdventure.jsx'))};
export function renderAdventure({ slots, stack }) {
  const real = React.useState;
  React.useState = (init) => {
    const value = typeof init === 'function' ? init() : init;
    if (slots && value && typeof value === 'object' && Array.isArray(value.slots) && value.slots.length === 0 && 'error' in value) return real(slots);
    if (stack && Array.isArray(value) && value.length === 1 && value[0] === '01') return real(stack);
    return real(init);
  };
  try { return renderToStaticMarkup(React.createElement(SapphireAdventure)); } finally { React.useState = real; }
}`;
  const outfile = path.join(dir, 'adventure.mjs');
  await build({
    stdin: { contents: entry, resolveDir: root, loader: 'jsx', sourcefile: 'adventure-entry.jsx' },
    bundle: true, platform: 'node', format: 'esm', outfile, jsx: 'automatic', logLevel: 'silent',
    alias: { '@': path.join(root, 'src') },
    loader: { '.js': 'jsx', '.css': 'empty', '.html': 'text', '.svg': 'text', '.png': 'empty', '.webp': 'empty', '.jpg': 'empty' },
    resolveExtensions: ['.jsx', '.js', '.mjs', '.json'],
    define: { 'import.meta.env': '{"DEV":false,"PROD":true}', 'process.env.NODE_ENV': '"production"' },
    banner: { js: "import { createRequire as __fbRequire } from 'node:module'; const require = __fbRequire(import.meta.url);" },
  });
  globalThis.localStorage = memoryStorage();
  ({ renderAdventure } = await import(pathToFileURL(outfile).href));
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
});

function storageWith({ valid = [], damaged = [] } = {}) {
  const storage = memoryStorage();
  let t = 0;
  for (const [slot, name] of valid) {
    const profile = createProfile(name);
    profile.xp = 250;
    writeSlot(storage, slot, profile, { overwrite: false });
    // keep saves in a known order: later slots saved later
    const all = JSON.parse(storage.getItem(SAVE_KEY));
    all[slot].savedAt = 1_700_000_000_000 + (t += 1000);
    storage.setItem(SAVE_KEY, JSON.stringify(all));
  }
  if (damaged.length) {
    const all = JSON.parse(storage.getItem(SAVE_KEY) || '{}');
    for (const slot of damaged) all[slot] = { savedAt: 1, profile: { broken: true } };
    storage.setItem(SAVE_KEY, JSON.stringify(all));
  }
  return readSlots(storage);
}

const buttons = (html) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, inner]) => ({
  disabled: /\sdisabled(=|\s|$|>)/.test(attrs) || /\sdisabled=""/.test(attrs),
  text: inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  attrs,
}));
const titleButton = (html, label) => buttons(html).find((b) => b.text === label || b.text.startsWith(`${label} `) || b.text.endsWith(` ${label}`));

test('the saves used by these tests are what the game itself reads', () => {
  const s = storageWith({ valid: [['1', 'Aria']], damaged: ['2'] });
  assert.deepEqual(s.slots.map((x) => [x.id, x.status]), [['1', 'valid'], ['2', 'corrupt']]);
});

test('title: Continue and Load Game are disabled without a valid save', () => {
  for (const slots of [{ slots: [], error: null }, storageWith({ damaged: ['1', '3'] })]) {
    const html = renderAdventure({ slots });
    const cont = titleButton(html, 'Continue');
    const load = titleButton(html, 'Load Game');
    assert.ok(cont && load, 'the title shows Continue and Load Game');
    assert.equal(cont.disabled, true, 'Continue needs a valid save');
    assert.equal(load.disabled, true, 'Load Game needs a valid save');
    assert.equal(titleButton(html, 'Start New Game')?.disabled ?? false, false);
  }
});

test('title: Continue and Load Game are enabled once a valid save exists', () => {
  const html = renderAdventure({ slots: storageWith({ valid: [['2', 'Aria']], damaged: ['1'] }) });
  assert.equal(titleButton(html, 'Continue').disabled, false);
  assert.equal(titleButton(html, 'Load Game').disabled, false);
});

test('Load lists exactly the valid slots: valid ones selectable, damaged and empty ones not', () => {
  const html = renderAdventure({ slots: storageWith({ valid: [['1', 'Aria'], ['3', 'Bryn']], damaged: ['2'] }), stack: ['02'] });
  const slotButtons = buttons(html).filter((b) => /fa-glass-slot\b/.test(b.attrs));
  assert.equal(slotButtons.length, 3, 'one entry per slot');
  const enabled = slotButtons.filter((b) => !b.disabled).map((b) => b.text);
  assert.equal(enabled.length, 2);
  assert.match(enabled[0], /Slot 1 · Aria/);
  assert.match(enabled[1], /Slot 3 · Bryn/);
  const disabled = slotButtons.filter((b) => b.disabled).map((b) => b.text);
  assert.deepEqual(disabled.map((t) => /Slot 2 · Damaged/.test(t)), [true]);
  assert.match(html, /Saved adventures <small>2 of 3<\/small>/);
  assert.match(enabled[1], /Most recent/, 'the latest save is marked');
});

test('Load with only damaged and empty slots offers nothing to load', () => {
  const html = renderAdventure({ slots: storageWith({ damaged: ['3'] }), stack: ['02'] });
  const slotButtons = buttons(html).filter((b) => /fa-glass-slot\b/.test(b.attrs));
  assert.equal(slotButtons.length, 3);
  assert.equal(slotButtons.filter((b) => !b.disabled).length, 0);
  assert.match(html, /Saved adventures <small>0 of 3<\/small>/);
  const loadButton = buttons(html).filter((b) => b.text === 'Load Game').at(-1);
  assert.equal(loadButton.disabled, true, 'nothing selected, nothing to load');
});
