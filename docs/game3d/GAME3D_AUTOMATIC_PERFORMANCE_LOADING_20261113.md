# Game 3D automatic performance preparation — 2026-11-13

This is a **draft performance foundation** for both Game 3D repositories:
- Main: `marcusflow1-arch/atom-x-eve-os`
- Clone: `marcusflow1-arch/gitsync-pro`

It is **not** a map rewrite, quest feature, authority change, deployed release, or proof that reported first-combat frame stalls are resolved.

## What runs automatically

1. `Game3DPerformanceBootstrap.jsx` mounts only in the Game 3D GameView and reattaches on world/portal scene changes. It does not delay actual character readiness.
2. `SceneWarmup.mjs` incrementally discovers 3D scene meshes, including later-added enemies, portals, cave props and effects. It schedules GPU shader precompilation using `WebGLRenderer.compileAsync` when available and uploads already decoded textures using `initTexture`. Work is serialized, queue-limited, deferred to idle time where available, suspended in hidden tabs and stopped on scene teardown.
3. Nearby enemy meshes take priority (within 65 horizontal world units), even when scenery tasks are queued. Future scene additions are found automatically on rescans. Optional `game3dPerformancePrime` events can prioritize a freshly mounted boss or effect: `window.dispatchEvent(new CustomEvent('game3dPerformancePrime', {detail: {root: threeObject}}))`.
4. `public/game3d-asset-sw.js` is an optional, browser-managed static asset cache. Its root scope is necessary because GameView itself lives outside `/game3d/`, but its fetch handler touches **only same-origin public /game3d/** static models/textures/audio. The browser installs it automatically on GameView; users install nothing.
5. The worker does not cache any dynamic API, auth/session, private content, save data, payments, page navigations, or assets from other games. It skips ranged requests, files above 12 MiB, responses marked private/no-store and unexpected HTML. It caps entries at 72 and tolerates browser quota eviction. If another root service worker is installed, this feature does not replace it; browser HTTP caching remains available.
6. Existing Game 3D sound preloading, player-model compilation, managed terrain asset reuse and optional render stats remain untouched.

## Future asset workflow

- **New public static Game 3D assets:** serve under `public/game3d/`. On loading, they automatically qualify for cache according to type and size. Use content-hashed names for updated assets, or increment the worker `CACHE_NAME` when replacing the same filename so users do not retain stale versions. External Base44/CDN files rely on server-provided HTTP caching, not this origin-specific worker.
- **New world, cave, AI and effect meshes:** once added to the *active* Three.js scene, they join the idle shader/texture warmup scan. For high-priority first encounter effects dispatch the optional priority event when the object mounts.
- **New attack animations and sounds:** keep their *actual* loader preloads and pre-create animation actions where appropriate. GPU shader compilation does not compile FBX/GLB geometry files or decode animation clips.
- **Asset pipeline quality:** compressed KTX2/Basis textures, simplified LOD meshes, static-prop GPU instancing, AI/collision throttling and per-biome streaming require explicit reviewed work in their existing owning systems. This PR deliberately does not rewrite geometry, collide with active terrain tile ownership or invent fallback low-poly assets.

## Validation before merge/deploy

- Execute `node --test tests/game3d-scene-warmup.test.mjs` with real repository Node.
- Run both apps' appropriate lint, build, and tests; confirm the SW URL serves JavaScript with the correct mime type and scope and does not replace an existing app worker.
- In a **signed-in browser** run cold cache and warm cache comparisons: frame time (p95/p99), shader/material compile time, first enemy attack, cave/portal entry, texture upload, audio first hit, refresh/cache version updates, low-storage/private-mode, and slow-network fallback.
- Observe real Wolfveil bridges, imported town, 5m tile seams, mountains, houses, cave navigation, player movement, combat and server/multiplayer parity. Never treat a code test as a gameplay test.
- Validate desktop and mobile GPU behavior; if idle warmup worsens frame pacing, disable only `Game3DPerformanceBootstrap` in GameView and retain previous engine and game state.

**Status:** source committed on two isolated feature branches; not signed-in browser playtested or deployed. GPU texture compression, geometry instancing/LOD, streaming and AI/collision optimization still require separately validated changes.