# Game 3D cave-approach landscaping — parallel handoff to cave builder

**Repository:** `lordemblemblue-cloud/fallen-sky`
**Branch:** `feat/game3d-cave-approach-landscaping-companion-20261117`
**Owner request:** Work alongside Grok on cave fronts and scenic approach landscaping, without clobbering the active cave, stairs, doors or underground progress.

## Division of work

| Existing cave/entrance team keeps authority over | This independent visual pass owns |
| --- | --- |
| Cave entrances, holes and mountain geometry | Landscape color palette and small ground props |
| Exterior approach grade, sidewalk/paving and stairs | Natural ground cover and irregular border stones off the route |
| Player/mount collision, roof sealing and raycasts | No-collision InstancedMesh scenery, explicitly no raycasts |
| Interaction (E), walk-in, exits, subterranean floor | Absolutely no triggers, no world position change |
| Cave maps, region streaming and server validation | Four named approach themes based on existing cave style IDs |

**Important:** PR #36 (cave system + underground map) and PRs #1/#2 were merged before this work. Do **not** reset them or replay old `marcusflow1-arch/Fallen-sky-` PR #106. There is a separate review-only exact-square audit in PR #3; this pass claims no exclusive terrain square and changes no heights/colliders.

## Visual design by entrance

- **Jade Lantern Grotto (southwest):** weathered moss-coloured stone, cedar/fern clusters, restrained soft jade accents, low waystones.
- **Whispering Root Hollow (northwest):** crooked exposed-root forms, green understory, earthy cobbles. The approach should remain readable even through cedar woodland.
- **Sunken Inkstone Cistern (northern ridge):** slate, reeds at the path margins (never on wet water), cool mineral accents and quiet waystones.
- **Echoing Crystal Vault (eastern quarry):** sparse faceted crystalline spires, blue/purple-toned boulders, reflected icy accents. Crystals do not replace collision rock.

All four approaches are **already paved** in `WolfveilCaveAccessGeometry.mjs`. This pass increases their scenery quality; it does not add extra overlapping walkable floor.

## Implementation boundary

- `WolfveilCaveLandscapePlan.mjs` computes deterministic, finite decorative placements along the real `WOLFVEIL_CAVE_APPROACHES` waypoints. It rejects positions inside the reserved cave tread/apron, too near existing roads/river, on unsafe cross-grade, or in protected tree/building areas.
- `WolfveilCaveLandscapeVisuals.js` renders the placements as a bounded number of low-poly **instanced** scenery meshes. The meshes have `raycast=()=>{}` and are not added to the terrain BVH, `world.walkableSurfaces` or any server collision list. It reuses the real Wolfveil heightfield in local coordinates.
- The one-line hook from `WolfveilCaveSystem.js` installs the visuals after the original cave approach geometry. Stats (`landscapeDecor`, `landscapeDrawGroups`) are exposed for inspection through `approachBuild`.
- All materials are registered under `world.ownedMaterials`; meshes are children of the already-owned cave group and release their geometries with its normal teardown.

## Integration instructions for Grok / cave engineer

1. Review this PR against your current entrance branch. Keep *your* arch, stairs, and road authority; the **only potential shared-file conflict** is the small `WolfveilCaveSystem.js` import/hook. If you move the entrance builder, move the hook to the new post-approach phase; do not copy the older whole file.
2. If you relocate or reroute a cave, update the authoritative `WOLFVEIL_CAVE_APPROACHES` data. This landscaping automatically regenerates beside the new path on next scene build; do not hardcode a second set of mouth coordinates.
3. Keep physical stairs, floor seams, rail collisions, waterfall roof and E/entrance triggers unchanged. Reject any prop on the player's 3.4 m route tread or 6.8 m apron.
4. Review 4 viewpoints per cave: arrival from the valley trail, first bend, forecourt at the gate, and from the gate looking back. Verify daylight/dusk, forest overlap and low graphics presets. Adjust density *only* after in-game screenshots.
5. Verify `node --test tests/game3d-clone-cave-approach-landscaping-companion.test.mjs tests/game3d-clone-cave-sealed-roof-access.test.mjs tests/game3d-clone-four-cave-connected-route.test.mjs`. Run `npm run lint` and `npm run build`, plus signed-in clone-play walk-through. Do not merge if route or map checks regress.

## Explicit limitations

This work does **not** certify that all four entrance approaches are visually perfect, that old cave clipping/ground falls are fixed, or that an agent named Grok has accepted the handoff. No signed-in Play screenshots have been produced from this chat; source-level checks and PR CI should be reviewed before merging.
