# The Conduit — Stage 11 rendering optimization

## Scope
Isolated draft against main. Existing WebGPU renderer owners retain backend selection, compatibility and device-loss recovery. This map optimization works with standard Three.js geometry/materials and does not switch the live game renderer or certify WebGPU. Preserve all 12 staircases, map dimensions, collision records, pickups, navigation, and individually controllable building roofs. Other Conduit drafts remain separate and must be combined before release.

## Implementation
Cache exact BoxGeometry dimensions per arena, retaining original UVs and normals. Batch groups of three or more explicit static addBox products only when they share parent, exact geometry, material, cast/receive shadow flags, layers and culling flag. Preserve local matrices and compute batch bounds. Exclude roof handles, transparent/alpha-tested materials, custom render order/depth/distance materials, children, and special non-box meshes. Existing detail instances reuse one unit-box geometry. No coarse world-wide batches; parent-local grouping limits culling regressions. Animated reactor/pad/pickup meshes remain individually controllable. Original shadow participation retained, but grouped submissions reduce CPU submission opportunities. Teardown disposes instance buffers and deduplicates geometry/material/texture disposal.

Low/medium color maps remain 256/512, bump maps reduced to 128/256; high remains 1024 for both. Two bump maps reduced by 75% in estimated RGBA8 mip allocation at low/medium (not total map memory). No texture compression or measured device allocation claims. A/B constructor flag optimizeRendering:false preserves original construction and texture dimensions. renderOptimization reports CPU scene inventory, mesh object count, represented instances/triangles, unique geometry count, shadow mesh objects and estimated RGBA8 mipmapped texture bytes. These are NOT actual draw calls, GPU timings or memory.

## Validation
Dedicated workflow runs npm ci, syntax checks, original import tests, new real-Three.js fixture and assembled-map tests, build and lint. Tests assert exact transforms, roof/transparent exclusions, unchanged triangle/instance counts, collision/nav/pickup/spawn data, lower mesh/geometry/shadow object counts, texture estimate and disposal. Physical performance, visual parity and renderer compatibility remain unverified. Existing repository-wide lint failures may still block the workflow.

## Release gates
Stage 9 #365 and Stage 10 #366 dedicated CI passed. Stage 2 #357 is still conflicted/unmerged. Reconcile all constructor edits, mount/certify shortcuts, fix traversal, integrate approved server/client authority, then benchmark identical views in Edge/Chrome WebGPU and WebGL fallback on real desktop/mobile: median FPS, 1% lows, p95/p99 frame time, renderer-reported calls, memory, loading, recovery, shadows and texture appearance. No deployment.
