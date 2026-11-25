# Duelist armor rendering optimization

Default: maximum performance for personal and other fighters. Local-only preferences, applied on new match/preview; never change authoritative loadouts, stats, collision, powers, team identity or weapons.

- Hidden mode skips creating procedural guard armor. Low mode creates lower-segment guard geometry. Full mode restores original guard geometry and character shadows.
- Fused Huntress/Masked Warrior and Adam/Eve body GLBs contain baked appearance; a safe armor-only unload requires authored replacement files. The current fallback reduces material complexity and shadows but still fetches the original GLB and retains its triangles/textures in the shared cache. Do not describe this as true fused-armor removal.
- `client/armorVariants.mjs` is intentionally empty until rig-compatible files are produced and validated. Register per-body `low` (decimated rigged model) and `hidden` (fully clothed lightweight training suit without armor geometry or textures) URLs there. The loader requests the chosen variant first and falls back if loading fails. Never register an unverified variant.
- Offline asset requirements: preserve bone names, transforms, skin weights, motion retargeting and hand/weapon attachment; preserve silhouette, class/team indicators and an opaque base outfit. Decimate offline, atlas and compress textures, remove hidden armor data, then validate both WebGPU/WebGL before publishing. Avoid runtime decimation during combat.
- Test `node --test tests/duelist-armor-quality.test.mjs`, lint, build; browser test all four bodies, practice/online/story, ghost effects, respawn, return to menus, repeated quality changes, FPS/1% low/p95 frame time, downloaded bytes and GPU resources on mobile and Edge. No claim of zero lag or measured FPS until hardware validation.

## Follow-up
- Low-detail remote procedural armor uses a 30 m hide / 24 m restore threshold; weapons, body and gameplay remain visible.
- Variant retarget caches are keyed by the actual loaded file, not the character selection ID; preview failures release their clone resources.
- The binary GLBs could not be read through the connected GitHub API (UTF-8-only). Use the offline Blender candidate builder below and review the resulting geometry, skinning and animations before registering any asset. No generated binary is claimed in this change.

Candidate command: `blender -b -t 2 --python tools/duelist/blender/armor_lod_candidates.py -- --output /tmp/duelist-lod`. Requires Blender 4.x and checked-out source assets. The builder checks triangle reduction and rig round-trip but does not certify motion/visual fidelity. The hidden variant is intentionally not synthesized from fused geometry.
