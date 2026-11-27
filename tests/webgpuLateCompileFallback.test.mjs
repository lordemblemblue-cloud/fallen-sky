import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileLateObjectsInBackground, settleBackgroundPipeline, LATE_COMPILE_WAIT_MS, LATE_COMPILE_STUCK_MS,
  LATE_COMPILE_MAX_FORCED,
} from '../src/lib/webgpuSceneRenderer.js';

// The parts of three r171's WebGPURenderer that compileLateObjectsInBackground patches, as r171 has them:
// Pipelines.getForRender caches one pipeline per shader key and has the backend make its GPU pipeline;
// WebGPUPipelineUtils.createRenderPipeline sets it at once (promises === null) or when createRenderPipelineAsync
// resolves (no catch); Renderer._renderObjectDirect calls updateForRender, then backend.draw.
function fakeRenderer(makeAsync) {
  const data = new WeakMap();
  const get = (o) => { let d = data.get(o); if (!d) data.set(o, (d = {})); return d; };
  const device = { direct: 0, createRenderPipeline: () => ({ made: 'direct', n: ++device.direct }) };
  device.createRenderPipelineAsync = makeAsync(device);
  const drawn = [];
  const backend = {
    isWebGPUBackend: true, device, get,
    createRenderPipeline(renderObject, promises) {
      const pipelineData = get(renderObject.pipeline);
      if (promises === null) { pipelineData.pipeline = device.createRenderPipeline({}); return; }
      promises.push(new Promise((resolve) => {
        device.createRenderPipelineAsync({}).then((pipeline) => { pipelineData.pipeline = pipeline; resolve(); });
      }));
    },
    draw(renderObject) { drawn.push(renderObject.object.name); },
  };
  const caches = new Map();
  const pipelines = {
    caches,
    getForRender(renderObject, promises = null) {
      const own = get(renderObject);
      if (own.pipeline === undefined) {
        let pipeline = caches.get(renderObject.shaderKey);
        if (pipeline === undefined) {
          pipeline = { cacheKey: renderObject.shaderKey };
          caches.set(renderObject.shaderKey, pipeline);
          renderObject.pipeline = pipeline;
          backend.createRenderPipeline(renderObject, promises);
        } else renderObject.pipeline = pipeline;
        own.pipeline = pipeline;
      }
      return own.pipeline;
    },
    updateForRender(renderObject) { this.getForRender(renderObject); },
  };
  const renderer = { __sceneState: { backgroundCompile: true }, _pipelines: pipelines, backend, _currentRenderBundle: null,
    info: { render: { frame: 0 } } };
  const frame = (renderObjects) => { // one frame, drawn the way r171 draws each object
    drawn.length = 0;
    for (const renderObject of renderObjects) { pipelines.updateForRender(renderObject); backend.draw(renderObject); }
    renderer.info.render.frame++;
    return [...drawn];
  };
  return { renderer, device, frame };
}
const person = (name) => ({ object: { name }, shaderKey: 'townsperson-skin' }); // all share one shader
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const FRAME_MS = 1000 / 60;

test('a background compile that never finishes: the object and others of its kind are drawn after the wait', () => {
  let clock = 0;
  const { renderer, device, frame } = fakeRenderer(() => () => new Promise(() => {}));
  compileLateObjectsInBackground(renderer, { now: () => clock });
  const [first, second, third] = [person('elder'), person('smith'), person('courier')];
  let frames = 0;
  let drawn = [];
  while (!drawn.length && frames < 200) { drawn = frame([first, second]); frames++; clock += FRAME_MS; }
  assert.deepEqual(drawn, ['elder', 'smith'], 'both are drawn on the same frame');
  assert.ok(frames <= Math.ceil(LATE_COMPILE_WAIT_MS / FRAME_MS) + 2, `drawn on frame ${frames}`);
  assert.ok(frames > 2, 'a compile is not forced on its first frames');
  assert.equal(device.direct, 1, 'one pipeline made directly, shared by every object of the shader');
  assert.deepEqual(frame([first, second, third]), ['elder', 'smith', 'courier'], 'one that arrives later is drawn at once');
  assert.equal(device.direct, 1);
});

test('a background compile that fails: made directly, the object and others of its kind are drawn on the next frame', async () => {
  let clock = 0;
  const reported = [];
  const busy = Object.assign(new Error('GPU process busy'), { reason: 'internal' });
  const { renderer, device, frame } = fakeRenderer((dev) => () =>
    settleBackgroundPipeline(Promise.reject(busy), () => dev.createRenderPipeline({}), (error) => reported.push(error)));
  compileLateObjectsInBackground(renderer, { now: () => clock });
  const [first, second] = [person('elder'), person('smith')];
  assert.deepEqual(frame([first]), []);
  await settle();
  clock += FRAME_MS;
  assert.deepEqual(frame([first, second]), ['elder', 'smith']);
  assert.equal(device.direct, 1);
  assert.equal(reported.length, 0);
});

test('a pipeline the GPU rejects as invalid is never drawn, never retried and reported once', async () => {
  let clock = 0;
  const reported = [];
  const invalid = Object.assign(new Error('invalid WGSL'), { reason: 'validation' });
  const { renderer, device, frame } = fakeRenderer((dev) => () =>
    settleBackgroundPipeline(Promise.reject(invalid), () => dev.createRenderPipeline({}), (error) => reported.push(error)));
  compileLateObjectsInBackground(renderer, { now: () => clock });
  const [first, second] = [person('elder'), person('smith')];
  assert.deepEqual(frame([first]), []);
  await settle();
  for (let i = 0; i < 3; i++) {
    clock += LATE_COMPILE_WAIT_MS; // drawing an invalid pipeline would void the whole frame
    assert.deepEqual(frame([first, second]), []);
  }
  assert.equal(device.direct, 0);
  assert.deepEqual(reported, [invalid]);
});

test('a background compile that finishes in time is used as it is, never forced', async () => {
  let clock = 0;
  let finish;
  const { renderer, device, frame } = fakeRenderer(() => () => new Promise((resolve) => { finish = resolve; }));
  compileLateObjectsInBackground(renderer, { now: () => clock });
  const first = person('elder');
  assert.deepEqual(frame([first]), []);
  clock += LATE_COMPILE_WAIT_MS / 2;
  finish({ made: 'background' });
  await settle();
  assert.deepEqual(frame([first]), ['elder']);
  assert.equal(device.direct, 0);
});

test('settleBackgroundPipeline: success, invalid, other failure, and a direct make that throws', async () => {
  const reported = [];
  const report = (error) => reported.push(error.message);
  assert.deepEqual(await settleBackgroundPipeline(Promise.resolve({ ok: 1 }), () => ({ direct: 1 }), report), { ok: 1 });
  assert.equal(await settleBackgroundPipeline(Promise.reject(Object.assign(new Error('bad'), { reason: 'validation' })),
    () => ({ direct: 1 }), report), null);
  assert.deepEqual(await settleBackgroundPipeline(Promise.reject(new Error('lost')), () => ({ direct: 1 }), report), { direct: 1 });
  assert.equal(await settleBackgroundPipeline(Promise.reject(new Error('lost')), () => { throw new Error('no device'); }, report), null);
  assert.deepEqual(reported, ['bad', 'no device']);
});

test('a busy GPU is not forced: while background compiles keep finishing, a waiting one is left to finish', () => {
  let clock = 0;
  const { renderer, device, frame } = fakeRenderer(() => () => new Promise(() => {}));
  compileLateObjectsInBackground(renderer, { now: () => clock });
  const waiting = person('elder');
  // others finish now and then (state.backgroundPipelineAt, set by the device wrapper as each finishes)
  for (let t = 0; t < 3000; t += FRAME_MS) {
    clock = t;
    if (Math.round(t) % 600 < FRAME_MS) renderer.__sceneState.backgroundPipelineAt = clock;
    assert.deepEqual(frame([waiting]), [], `forced at ${Math.round(t)} ms while others were finishing`);
  }
  assert.equal(device.direct, 0);
  // they stop finishing: stuck, so it is made directly once nothing has finished for LATE_COMPILE_STUCK_MS
  const lastFinished = renderer.__sceneState.backgroundPipelineAt;
  let drawn = [];
  while (!drawn.length && clock < lastFinished + 5000) { clock += FRAME_MS; drawn = frame([waiting]); }
  assert.deepEqual(drawn, ['elder']);
  assert.ok(clock - lastFinished >= LATE_COMPILE_STUCK_MS && clock - lastFinished < LATE_COMPILE_STUCK_MS + 3 * FRAME_MS,
    `made ${Math.round(clock - lastFinished)} ms after the last one finished`);
  assert.equal(device.direct, 1);
});

test('when many are stuck, only a few are made directly per frame', () => {
  let clock = 0;
  const { renderer, device, frame } = fakeRenderer(() => () => new Promise(() => {}));
  compileLateObjectsInBackground(renderer, { now: () => clock });
  const kinds = ['tree', 'rock', 'grass', 'river', 'cart'].map((name) => ({ object: { name }, shaderKey: name }));
  assert.deepEqual(frame(kinds), []);
  clock += LATE_COMPILE_WAIT_MS;
  const counts = [];
  for (let i = 0; i < 4; i++) { counts.push(frame(kinds).length); clock += FRAME_MS; }
  assert.deepEqual(counts, [LATE_COMPILE_MAX_FORCED, 2 * LATE_COMPILE_MAX_FORCED, 5, 5]);
  assert.equal(device.direct, 5);
});
