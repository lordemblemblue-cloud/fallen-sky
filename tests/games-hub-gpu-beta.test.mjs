import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAMES_HUB_TILES, FANTASY_BATTLE_RELEASED, isTilePlayable } from '../src/components/games/hub/gamesHubCatalog.mjs';

const read = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');

test('Duelist launches first, Fallen Sky has an exterior Beta Experimental tag, third game stays locked', () => {
  assert.deepEqual(GAMES_HUB_TILES.map(tile => tile.id), ['duelist', 'fallen-sky', 'fantasy-battle']);
  const [duelist, fallen, third] = GAMES_HUB_TILES;
  assert.equal(isTilePlayable(duelist, { '/duelist': {} }), true);
  assert.equal('gpuPrompt' in duelist, false);
  assert.equal('gpuPrompt' in fallen, false);
  assert.equal(fallen.releaseStatus, 'beta-experimental');
  assert.equal(isTilePlayable(fallen, { '/gameview': {} }), true);
  assert.equal(FANTASY_BATTLE_RELEASED, false);
  assert.equal(third.releaseStatus, 'coming-soon');
  assert.equal(isTilePlayable(third, { '/fantasy-battle': {} }), false);
  const ui = read('components/games/hub/GamesCrossScroll.jsx');
  const css = read('components/games/hub/gamesCrossScroll.css');
  assert.match(ui, /tile\.releaseStatus === 'beta-experimental'/);
  assert.match(ui, /Beta Experimental/);
  assert.match(css, /\.xs-tile-beta\{/);
  assert.doesNotMatch(ui, /GpuLaunchPrompt|pendingLaunch|gpuPrompt/);
});

test('WebGPU notice is passive, top centered and does not gate launch', () => {
  const ui = read('components/games/hub/GamesCrossScroll.jsx');
  const css = read('components/games/hub/gamesCrossScroll.css');
  assert.ok(ui.includes('<p className="xs-webgpu-notice">Enable WebGPU</p>'));
  assert.match(ui, /if \(launch\) \{\s*onLaunch\?\.\(launch, tile\);\s*return;/);
  assert.doesNotMatch(ui, /aria-modal|GpuLaunchPrompt|pendingLaunch|requestAdapter|requestDevice/);
  const rule = css.match(/\.xs-webgpu-notice \{[^}]*\}/)[0];
  assert.match(rule, /top:/);
  assert.match(rule, /left: 50%/);
  assert.match(rule, /pointer-events: none/);
});

test('Fallen Sky explicitly warns at character creation and in-world gameplay', () => {
  const ui = read('components/game3d/FallenSkyBetaNotice.jsx');
  const creator = read('components/game3d/CharacterLoginScreen.jsx');
  const world = read('pages/GameView.jsx');
  assert.match(ui, /EARLY BETA · FALLEN SKY ONLINE/);
  assert.match(ui, /fine-tuned and optimized/);
  assert.match(ui, /lag.*frame-rate drops/);
  assert.match(ui, /Dismiss early beta notice/);
  assert.match(creator, /step !== 'start' && <FallenSkyBetaNotice context="creation" \/>/);
  assert.match(world, /phase === 'world' && <FallenSkyBetaNotice context="world" \/>/);
});
