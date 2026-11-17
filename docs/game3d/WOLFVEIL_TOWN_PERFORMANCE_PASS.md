# Wolfveil town low-poly performance pass

This change is built on the merged walkable Japanese-Egyptian artisan plaza in
Emblem Blue's `fallen-sky` Game 3D repository. The twin-wolf waterfall, 4
interactive vendor storefronts, 8 walk-in residential ground floors, and
door-aware wall collision stay in the same world position.

## What changed
- Automatic **low-poly desktop** and **ultra-low touch/mobile** render tiers;
  `balanced` and `high` are still available explicitly.
- Distant home/shop **3–6 mesh silhouette proxies** replace detailed procedural
  buildings. Full buildings reappear as the player approaches; thresholds use
  5-metre hysteresis so doorway proximity is stable.
- Geometry reduction in roof rafters and tiles, chiseled stone-ring segments,
  fountain rocks, small foliage, and mist. The waterfall meshes, wolf statues,
  magical ribbons, and shop interiors remain recognizable.
- Identical box dimensions reuse one geometry buffer across the district.
  Static batching preserves shared geometries until full scene teardown.
- Animations of hidden shop interiors are skipped. Ultra-low mode hides
  additional secondary point lights; low mode already disables eight porch
  lights.
- Proxy shapes are **render-only**, ignored by camera collision and never
  registered as physical whole-building walls. The original wall/door
  navigation runs regardless of visual detail mode.
- A visible-mesh/triangle diagnostic is accessible from the installed town's
  `visibleGeometryStats` getter, while static build counts remain in
  `performanceStats`.

## Verification
```sh
node --test tests/wolfveil-town-performance.test.mjs
node --test tests/wolfveil-artisan-town-navigation.test.mjs tests/wolfveil-town-cutaway-camera.test.mjs
npm ci && npm run build
```

## Manual FPS acceptance test
Compare the earlier merged version with this branch on the same machine, at
the same graphics settings and player location. Record median and 1% low FPS,
draw calls and rendered triangles (e.g. via Three.js renderer.info), VRAM
usage if available, first-load time, and number of visible lamps.

Check the fountain center, each shop exterior/interior, all 8 home doorways,
sprint collision, Quest NPC interaction and rotating the camera indoors. The
optimized town should show fewer visible meshes and triangles at the plaza
center. **No specific FPS guarantee is made without device benchmarks.**
