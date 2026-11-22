# Native WebGPU QA — Fallen Sky and Duelist Adventure

This checks an **already-open game in the actual tester's Chrome or Edge browser**. It does not deploy, select an adapter, switch renderer preferences, or upload screenshots. It is not a substitute for visually inspecting rendered pixels.

## 1. Start a local browser-debugging session

On Windows, launch a temporary separate Edge session:

~~~text
msedge.exe --remote-debugging-port=9222 --user-data-dir="%TEMP%\emblem-webgpu-qa"
~~~

Use the full executable path if Edge is not on PATH. Do not expose the debugging port to the network; close the browser when finished.

Open the app and enter real Fallen Sky gameplay (/gameview), or Duelist Adventure gameplay (/duelist-next/play). Wait until the world is visibly moving, not a menu or paused tab. Test the normal default URL first; a separate explicit ?renderer=webgpu run can diagnose why the automatic path differs. A requested WebGPURenderer is not necessarily the native backend.

## 2. Capture native backend evidence and a screenshot

From the repository root with Node 22+ installed:

~~~bash
node scripts/webgpu-native-browser-qa.mjs --scene=fallen-sky --cdp-port=9222 --sample-ms=2500 --out=qa/fallen-sky.json --screenshot
node scripts/webgpu-native-browser-qa.mjs --scene=duelist-adventure --cdp-port=9222 --sample-ms=2500 --out=qa/duelist-adventure.json --screenshot
~~~

Keep exactly one matching game tab open when running each command. If multiple tabs match (or the game runs at the root URL), select a unique URL substring with --tab-contains=YOUR_SUBSTRING. Save screenshots and JSON locally; never commit private player information to GitHub.

A passing JSON report requires the **actual initialized native WebGPU backend**, an available GPUDevice/queue, no recorded device loss, advancing renderer frames, and advancing gameplay frames with draws between two samples. A WebGL2 fallback or classic WebGL session never passes.

**Nonzero counters alone cannot prove visible pixels.** Visually inspect the captured screenshot for Wolfveil terrain, player, sky, ink-wash effects; and Duelist arena, character and warp effects. Record tested commit, browser build, OS, graphics adapter, pixel screenshots, warm-up duration, scene transitions, resizing, fallback and device-loss behavior. Compare performance with WebGL on identical hardware and scenes rather than interpreting draw counts as FPS.

## 3. Failure meanings

- not-native-webgpu:webgl2-fallback: Three.js is on its internal WebGL2 backend (not native WebGPU).
- not-native-webgpu:classic-webgl: classic renderer selected; check selection reason and adapter support.
- gpu-device-not-confirmed or gpu-device-lost: GPU startup or recovery is incomplete.
- gameplay-draw-counter-not-advancing: gameplay may be paused, black/stalled, or still warming up.
- render-frame-counter-not-advancing: renderer loop may have stalled.
- invalid-render-counters: insufficient trustworthy runtime evidence.

A nonzero exit code means the check failed or is inconclusive. Do not disable safe WebGL fallback on unsupported browsers. Do not merge or deploy solely because this probe passes.

## 4. Automated regression tests

~~~bash
node --test tests/webgpuNativeBrowserQa.test.mjs
npm run lint
npm run build
~~~

Unit tests are mock/session tests, not physical browser GPU tests. Marcus Flow 1 remains a separate future migration, after Emblem Blue has passed real-browser verification. The archived /duelist-classic raw WebGL2 engine is outside the scope of the two current games.
