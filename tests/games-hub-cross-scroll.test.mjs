import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { URL } from 'node:url';
import {
  GAMES_HUB_FOCUS_STORAGE_KEY,
  GAMES_HUB_TILES,
  isTilePlayable,
  tileBackdrop,
} from '../src/components/games/hub/gamesHubCatalog.mjs';
import {
  clampFocusIndex,
  createHubGamepadNavigator,
  createWheelStepper,
  focusIndexForId,
  hubKeyAction,
  readStoredHubFocus,
  resistedDrag,
  resolveHubChoice,
  stepFocusIndex,
  swipeSteps,
  tilePlacement,
  writeStoredHubFocus,
} from '../src/components/games/hub/gamesHubNavigation.mjs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// The router's table as main has it today: no Fantasy Battle route yet.
const ROUTES_WITHOUT_FANTASY = { '/': {}, '/gameview': {}, '/duelist': {}, '/duelist-next': {}, '/duelist-classic': {} };
const ROUTES_WITH_FANTASY = { ...ROUTES_WITHOUT_FANTASY, '/fantasy-battle': {} };

test('hub catalog lists the three games in menu order, each a single data entry', () => {
  assert.deepEqual(GAMES_HUB_TILES.map((tile) => tile.id), ['fallen-sky', 'duelist', 'fantasy-battle']);
  assert.deepEqual(GAMES_HUB_TILES.map((tile) => tile.to), ['/gameview', '/duelist', '/fantasy-battle']);
  assert.equal(new Set(GAMES_HUB_TILES.map((tile) => tile.id)).size, GAMES_HUB_TILES.length, 'ids are unique');
  for (const tile of GAMES_HUB_TILES) {
    assert.ok(Object.isFrozen(tile), `${tile.id} is frozen data`);
    assert.ok(tile.title && tile.tagline, `${tile.id} has a title and a line`);
    assert.match(tile.to, /^\/[a-z0-9-]+$/, `${tile.id} route`);
    assert.ok(tile.art, `${tile.id} has tile art`);
    assert.match(tile.fallback, /gradient\(/, `${tile.id} has a fallback gradient behind its art`);
    assert.match(tile.accent, /^#[0-9a-f]{6}$/i, `${tile.id} accent`);
    assert.ok(tileBackdrop(tile), `${tile.id} has a background`);
  }
  assert.equal(GAMES_HUB_TILES[2].title, 'Fantasy Battle');
  assert.equal(GAMES_HUB_FOCUS_STORAGE_KEY, 'adamXEve.gamesHub.focusedGame');
});

test('Fantasy Battle art ships as small WebP files in public/hub', () => {
  const fantasy = GAMES_HUB_TILES.find((tile) => tile.id === 'fantasy-battle');
  for (const url of [fantasy.art, fantasy.backdrop]) {
    assert.match(url, /^\/hub\/fantasy-battle-[a-z]+\.webp$/);
    const file = new URL(`../public${url}`, import.meta.url);
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP');
    assert.ok(statSync(file).size < 80 * 1024, `${url} stays under 80 KB`);
  }
  assert.equal(tileBackdrop(fantasy), '/hub/fantasy-battle-backdrop.webp');
  assert.equal(tileBackdrop(GAMES_HUB_TILES[0]), GAMES_HUB_TILES[0].art, 'without a backdrop the tile art is the background');
});

test('a tile plays only once its route is registered: Fantasy Battle goes live by itself', () => {
  const [fallen, duelist, fantasy] = GAMES_HUB_TILES;
  assert.equal(isTilePlayable(fallen, ROUTES_WITHOUT_FANTASY), true);
  assert.equal(isTilePlayable(duelist, ROUTES_WITHOUT_FANTASY), true);
  assert.equal(isTilePlayable(fantasy, ROUTES_WITHOUT_FANTASY), false, 'coming soon until the route exists');
  assert.equal(isTilePlayable(fantasy, ROUTES_WITH_FANTASY), true, 'live as soon as the route file lands');
  assert.equal(isTilePlayable({ ...fantasy, to: '/fantasy-battle/' }, ROUTES_WITH_FANTASY), true, 'trailing slash');
  assert.equal(isTilePlayable(fantasy, undefined), true, 'no router table: trust the catalog');
  assert.equal(isTilePlayable(null, ROUTES_WITH_FANTASY), false);
  assert.equal(isTilePlayable({ id: 'x', to: 'gameview' }, ROUTES_WITH_FANTASY), false, 'relative routes are refused');
});

test('choosing: a playable game launches its route, the coming-soon tile goes nowhere', () => {
  const [fallen, duelist, fantasy] = GAMES_HUB_TILES;
  assert.deepEqual(resolveHubChoice(fallen, true), { launch: '/gameview', blocked: null });
  assert.deepEqual(resolveHubChoice(duelist, true), { launch: '/duelist', blocked: null });
  assert.deepEqual(resolveHubChoice(fantasy, false), { launch: null, blocked: 'coming-soon' });
  assert.deepEqual(resolveHubChoice(undefined, true), { launch: null, blocked: 'missing' });

  // Walk the menu as a player does: two steps right reach Fantasy Battle, Enter does nothing yet.
  let index = 0;
  for (let i = 0; i < 2; i += 1) index = stepFocusIndex(index, 1, GAMES_HUB_TILES.length).index;
  const tile = GAMES_HUB_TILES[index];
  assert.equal(tile.id, 'fantasy-battle');
  assert.equal(resolveHubChoice(tile, isTilePlayable(tile, ROUTES_WITHOUT_FANTASY)).launch, null);
  assert.equal(resolveHubChoice(tile, isTilePlayable(tile, ROUTES_WITH_FANTASY)).launch, '/fantasy-battle');
});

test('left and right move one game and stop clearly at both ends', () => {
  const n = 3;
  assert.deepEqual(stepFocusIndex(0, 1, n), { index: 1, moved: true, edge: null });
  assert.deepEqual(stepFocusIndex(1, 1, n), { index: 2, moved: true, edge: null });
  assert.deepEqual(stepFocusIndex(2, 1, n), { index: 2, moved: false, edge: 'end' }, 'stop at the last game');
  assert.deepEqual(stepFocusIndex(1, -1, n), { index: 0, moved: true, edge: null });
  assert.deepEqual(stepFocusIndex(0, -1, n), { index: 0, moved: false, edge: 'start' }, 'stop at the first game');
  assert.deepEqual(stepFocusIndex(0, 5, n), { index: 2, moved: true, edge: 'end' }, 'a long swipe lands on the last game');
  assert.deepEqual(stepFocusIndex(1, 0, n), { index: 1, moved: false, edge: null });
  // Wrap-around exists as an option but the hub does not use it.
  assert.deepEqual(stepFocusIndex(2, 1, n, { wrap: true }), { index: 0, moved: true, edge: null });
  assert.deepEqual(stepFocusIndex(0, -1, n, { wrap: true }), { index: 2, moved: true, edge: null });
  assert.equal(clampFocusIndex(7, n), 2);
  assert.equal(clampFocusIndex(-3, n), 0);
  assert.equal(clampFocusIndex(Number.NaN, n), 0);
  assert.equal(clampFocusIndex(1, 0), 0);
});

test('the last focused game is remembered, and storage failures are harmless', () => {
  assert.equal(focusIndexForId(GAMES_HUB_TILES, 'fantasy-battle'), 2);
  assert.equal(focusIndexForId(GAMES_HUB_TILES, 'duelist'), 1);
  assert.equal(focusIndexForId(GAMES_HUB_TILES, 'removed-game'), 0, 'unknown id falls back to the first game');
  assert.equal(focusIndexForId(GAMES_HUB_TILES, null), 0);

  const data = new Map();
  const storage = { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)) };
  assert.equal(readStoredHubFocus(storage, GAMES_HUB_FOCUS_STORAGE_KEY), null);
  assert.equal(writeStoredHubFocus(storage, GAMES_HUB_FOCUS_STORAGE_KEY, 'duelist'), true);
  assert.equal(readStoredHubFocus(storage, GAMES_HUB_FOCUS_STORAGE_KEY), 'duelist');

  const broken = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(readStoredHubFocus(broken, GAMES_HUB_FOCUS_STORAGE_KEY), null);
  assert.equal(writeStoredHubFocus(broken, GAMES_HUB_FOCUS_STORAGE_KEY, 'duelist'), false);
  assert.equal(readStoredHubFocus(null, GAMES_HUB_FOCUS_STORAGE_KEY), null);
  assert.equal(writeStoredHubFocus(undefined, GAMES_HUB_FOCUS_STORAGE_KEY, 'duelist'), false);
});

test('keys: arrows or A / D move, Home / End jump, Enter chooses, Space stays with the browser', () => {
  assert.equal(hubKeyAction('ArrowLeft', 'ArrowLeft'), 'left');
  assert.equal(hubKeyAction('a', 'KeyA'), 'left');
  assert.equal(hubKeyAction('A', 'KeyA'), 'left');
  assert.equal(hubKeyAction('q', 'KeyA'), 'left', 'AZERTY keyboards: the physical A position');
  assert.equal(hubKeyAction('ArrowRight', 'ArrowRight'), 'right');
  assert.equal(hubKeyAction('d', 'KeyD'), 'right');
  assert.equal(hubKeyAction('Home', 'Home'), 'first');
  assert.equal(hubKeyAction('End', 'End'), 'last');
  assert.equal(hubKeyAction('Enter', 'Enter'), 'choose');
  assert.equal(hubKeyAction('Enter', 'NumpadEnter'), 'choose');
  assert.equal(hubKeyAction(' ', 'Space'), null);
  assert.equal(hubKeyAction('ArrowUp', 'ArrowUp'), null);
  assert.equal(hubKeyAction('w', 'KeyW'), null);
});

test('mouse wheel: one notch is one game, a trackpad fling is not a slot machine', () => {
  const wheel = createWheelStepper();
  assert.equal(wheel.push(0, 100, 1000), 1, 'scroll down = next game');
  assert.equal(wheel.push(0, 100, 1040), 0, 'the same burst is ignored');
  assert.equal(wheel.push(0, 100, 1300), 1, 'a new notch after a pause moves again');
  assert.equal(wheel.push(0, -100, 1600), -1, 'scroll up = previous game');
  assert.equal(wheel.push(-120, 10, 2000), -1, 'sideways trackpad swipe uses the horizontal delta');

  const pad = createWheelStepper();
  let steps = 0;
  for (let t = 0; t < 1000; t += 16) steps += pad.push(0, 8, 5000 + t);
  assert.ok(steps >= 1 && steps <= 3, `a one-second fling moves 1-3 games, not ${steps}`);
  pad.reset();
  assert.equal(pad.push(0, 2, 9000, 1), 0, 'two lines = 32 px, under the threshold');
  assert.equal(pad.push(0, 1, 9010, 1), 1, 'three lines reach it');
  assert.equal(pad.push(0, 0, 9600), 0);
});

test('swipe and drag: left goes to the next game, short or vertical drags do nothing', () => {
  assert.equal(swipeSteps(-80, 4, 104), 1);
  assert.equal(swipeSteps(80, -6, 104), -1);
  assert.equal(swipeSteps(-20, 0, 104), 0, 'a tap jitter is not a swipe');
  assert.equal(swipeSteps(-60, 90, 104), 0, 'mostly vertical');
  assert.equal(swipeSteps(-330, 10, 104), 3, 'a long drag passes several games');
  assert.equal(swipeSteps(-330, 10, 104, { maxSteps: 1 }), 1);
  assert.equal(resistedDrag(50, 0, 3), 50 * 0.35, 'rubber band before the first game');
  assert.equal(resistedDrag(-50, 2, 3), -50 * 0.35, 'rubber band after the last game');
  assert.equal(resistedDrag(-50, 0, 3), -50);
});

test('tile placement: before tiles slide left, the focused one grows, later ones make room', () => {
  assert.deepEqual(tilePlacement(0, 1), { rel: -1, after: 0, focused: false });
  assert.deepEqual(tilePlacement(1, 1), { rel: 0, after: 0, focused: true });
  assert.deepEqual(tilePlacement(2, 1), { rel: 1, after: 1, focused: false });
});

test('gamepad: D-pad or stick moves with hold-to-repeat, A chooses, a held A on arrival does not', () => {
  const pad = (buttons = {}, x = 0) => ({
    connected: true,
    mapping: 'standard',
    axes: [x, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: Boolean(buttons[i]), value: buttons[i] ? 1 : 0 })),
  });
  const nav = createHubGamepadNavigator();
  assert.deepEqual(nav.update(pad({ 0: true }), 0), [], 'first reading only records what is held');
  assert.deepEqual(nav.update(pad({ 0: true }), 16), [], 'still held: no launch');
  assert.deepEqual(nav.update(pad(), 32), []);
  assert.deepEqual(nav.update(pad({ 15: true }), 48), ['right'], 'D-pad right');
  assert.deepEqual(nav.update(pad({ 15: true }), 300), [], 'held, before the repeat delay');
  assert.deepEqual(nav.update(pad({ 15: true }), 480), ['right'], 'held past the delay repeats');
  assert.deepEqual(nav.update(pad(), 500), []);
  assert.deepEqual(nav.update(pad({}, -0.9), 520), ['left'], 'left stick');
  assert.deepEqual(nav.update(pad({}, -0.2), 540), [], 'inside the dead zone');
  assert.deepEqual(nav.update(pad({ 0: true }), 560), ['choose'], 'A press');
  assert.deepEqual(nav.update(pad({ 0: true }), 576), [], 'A held does not repeat');
  assert.deepEqual(nav.update(null, 600), [], 'pad gone');
  assert.deepEqual(nav.update(pad({ 0: true }), 620), [], 'reconnected with A held: baseline again');
});

test('hub page keeps the install button, intro and landscape gate, and the menu respects reduced motion', () => {
  const hub = source('src/pages/GamesHub.jsx');
  assert.match(hub, /<MobileTouchControls game="duelist" disabled \/>/);
  assert.match(hub, /<InstallAppButton \/>/);
  assert.match(hub, /<LiveAppIntro onComplete=/);
  assert.match(hub, /<GamesCrossScroll routesByPath=\{router\?\.routesByPath\}/);

  const menu = source('src/components/games/hub/GamesCrossScroll.jsx');
  assert.match(menu, /readStoredHubFocus\(hubStorage\(\), GAMES_HUB_FOCUS_STORAGE_KEY\)/);
  assert.match(menu, /function hubStorage\(\) \{\s*try \{\s*return window\.localStorage;/);
  assert.match(menu, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/);
  assert.match(menu, /getGamepads/);
  assert.match(menu, /prefers-reduced-motion: reduce/);

  const css = source('src/components/games/hub/gamesCrossScroll.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const tileRule = css.match(/\.xs-tile \{[^}]*\}/)[0];
  assert.match(tileRule, /transition: transform [^;]*, opacity [^;]*;/, 'tiles animate transform and opacity only');
  assert.doesNotMatch(css, /transition:[^;]*\b(left|width|height|margin|top)\b/, 'no layout properties are animated');
  assert.match(css, /\.xs-play \{[^}]*min-height: 50px/);
  assert.match(css, /\.xs-pager-button \{[^}]*width: 48px;[^}]*height: 48px/);
  assert.match(css, /@media \(max-height: 520px\)[\s\S]*min-height: 46px/);
});
