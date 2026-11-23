import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldDrawWatchdog } from '../src/components/game3d/render/liveRendererRecovery.mjs';
import { chooseSceneRendererFor, rememberRendererFailure, retryWebGPU } from '../src/lib/rendererBackendChoice.mjs';
import { getWebGPURuntimeEvidence } from '../src/lib/webgpuRuntimeDiagnostics.mjs';

test('live and preview worlds take the shared WebGPU choice on a capable host', () => {
  const world = readFileSync(new URL('../src/components/game3d/GameWorld3D.jsx', import.meta.url), 'utf8');
  assert.match(world, /: chooseSceneRendererFor\('fallen-sky', window\)/);
  for (const search of ['', '?preview=1']) for (const scene of ['fallen-sky','duelist-adventure']) {
    assert.equal(chooseSceneRendererFor(scene, { navigator: { gpu: {} }, location: {search} }).kind, 'webgpu');
  }
});

test('hidden tabs, held frames and intermittent empty submissions do not force fallback', () => {
  const check = createWorldDrawWatchdog();
  for (let i=0; i<120; i++) assert.equal(check(i*200, false, 0), false);
  assert.equal(check(30000, true, 0),false);
  assert.equal(check(120000, true, 0),false);
  for (let i=1; i<120; i++) assert.equal(check(120000+i*200,true,i%30===0?1:0),false);
  for (let i=0; i<50; i++) check(150000+i*200,true,0);
  assert.equal(check(160000,true,0),true);
});

test('one scene can recover independently and a Settings retry preserves the play URL', () => {
  const store = new Map();
  let next;
  const host = { navigator: { gpu: {} }, sessionStorage: {
    getItem:k=>store.get(k), setItem:(k,v)=>store.set(k,v), removeItem:k=>store.delete(k),
  }, location: { href:'https://example.com/duelist-next/play?mode=control#match', assign:url=>{next=url;} } };
  rememberRendererFailure(host,'fallen-sky');
  assert.equal(chooseSceneRendererFor('fallen-sky',host).kind,'webgl');
  assert.equal(chooseSceneRendererFor('duelist-adventure',host).kind,'webgpu');
  retryWebGPU('fallen-sky',host);
  assert.equal(chooseSceneRendererFor('fallen-sky',host).kind,'webgpu');
  assert.equal(next,'https://example.com/duelist-next/play?mode=control&renderer=webgpu#match');
});

test('empty renders and a full-screen pass cannot verify gameplay draws', () => {
  const renderer = { isWebGPURenderer:true, __sceneState:{ ready:true, gameplayFrames:0 },
    backend:{ isWebGPUBackend:true, device:{createCommandEncoder(){},queue:{submit(){}}} },
    info:{ render:{ frame:500, drawCalls:1 } } };
  assert.equal(getWebGPURuntimeEvidence(renderer).status,'waiting-for-world-draws');
});
