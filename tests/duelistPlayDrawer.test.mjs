import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { HUB_MODE_CARDS } from '../src/components/duelist/menu/hubModeCatalog.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('src/components/duelist/menu/MenuPages.jsx');
const css = read('src/components/duelist/menu/duelistMenuOverlays.css');
const hub = source.split('export function DuelistHub({ initialPanel = null }) {')[1].split('function Button(')[0];

test('real home overlay uses persistent normal/ranked playlists and mode detail, not a centered modal wizard', () => {
  assert.ok(hub);
  assert.match(hub, /duelist-hub-play-layout/);
  assert.match(hub, /duelist-hub-playlists/);
  assert.match(hub, /duelist-hub-mode-list/);
  assert.match(hub, /duelist-hub-mode-detail/);
  assert.match(hub, /setPlaylist\('normal'\)/);
  assert.match(hub, /setPlaylist\('ranked'\)/);
  assert.doesNotMatch(hub, /playStep|SELECT PLAY MODE|duelist-hub-overlay-backdrop/);
  assert.match(css, /inset:\s*91px/);
  assert.match(css, /calc\(var\(--dui-rail\)/);
});

test('normal mode includes practice and online per mode without pretending ranked is playable', () => {
  assert.match(hub, /navigate\(\{ to: '\/duelist-next\/play', search: \{ mode: selected\.route, online:/);
  assert.match(hub, /playlist === 'normal'/);
  assert.match(hub, /MENU_MODES\[selected\.route\]\?\.online && lobby\.online/);
  assert.match(hub, /disabled=\{!canPractice\}/);
  assert.match(hub, /disabled=\{!canPlayOnline\}/);
  assert.match(hub, /RANKED PLAY/);
  assert.match(hub, /Ranked matchmaking is planned/);
  assert.doesNotMatch(hub, /mode: 'ranked'/);
});

test('mode drawer preserves Transport name, and existing battle destinations', () => {
  const ids = HUB_MODE_CARDS.map(mode => mode.id);
  assert.deepEqual(ids.filter(id => ['duel','ctf','transport','tdm'].includes(id)), ['duel','ctf','transport','tdm']);
  assert.equal(HUB_MODE_CARDS.find(mode => mode.id === 'transport')?.route, 'escort');
  assert.match(hub, /\['practice', 'online'\]/);
});

test('home navigation only keeps Play, Story Campaign, Character and minimal footer', () => {
  assert.doesNotMatch(hub, /CLASSIC ARENA|SELECT FIGHTER|THE HANGAR|LOADOUT|MISSIONS|COLLECTION|CLAN/);
  assert.match(hub, /STORY CAMPAIGN/);
  assert.match(hub, /CHARACTER/);
  assert.match(hub, /SETTINGS/);
  const footer = hub.split('<footer className="duelist-hub-footer"')[1].split('</footer>')[0];
  assert.doesNotMatch(footer, /BATTLE PASS|PLUS/);
  assert.match(hub, /Ranked matchmaking is planned/);
  assert.match(hub, /aria-expanded=\{activePanel === 'play'\}/);
});
