# Owner modular cave kit — integrated Wolfveil draft (2026-11-17)

**Destination:** `lordemblemblue-cloud/fallen-sky` only. **Merge/release state: NOT ACCEPTED**.

## Input and interpretation
The owner-supplied `ancient_sumi_e_corridor_3d_viewer (1).html` defines four independent 3D viewer pieces:

1. Hallway A: 24m path, branching cave tunnel, 3× expanded decorative treasure vault, stair atrium.
2. Hallway B: uninterrupted straight stone corridor.
3. T-junction: 56.84m crossbar and 14m south stem.
4. **Larger detached open area:** 10× canyon-and-water-gorge module, 180×140m, separate entrance, bridge routes, side ledges, ascent/switchbacks and boss arena in the reference.

The first integration pass uses **the modules' junction/room/path roles and scale**, not a one-to-one copy of every high-poly mesh. It respects the existing Wolfveil cave architecture and avoids duplicating entry/session code.

## Canonical first-pass layout (Wolfveil-local metres; Game 3D adds +70 world Z)

| Piece | Area | Interaction |
| --- | --- | --- |
| Existing Wolf-Spirit Rotunda | (-6, -8, 24), radius 46m | Remains the canonical internal hub |
| Hallway B then A | x=-6, z=24 to -95 | Connected straight stone pathway with no hidden teleport |
| T-junction | (-6, -8, -95) | Three-way physical floor connection |
| Treasure vault | (-61, -8, -95), radius 12m | Decorative treasure chests (no grants yet) |
| Cave connector | T through (18,-95), (32,-116), (41,-150) to (57,-160) | Turns into the larger area |
| **Open canyon** | x=40..220, z=-230..-90, floor Y=-8 | 180×140m playable rock floor |
| Water gorge | x=108..148, z=-214..-106 | Lower water visual; **not** solid floor or swimmable water yet |
| Three crossing bridges | z=-198, -162, -126 | Real walkable stone floors with matching collision mask |
| Arena platform | (181,-8,-162), radius 18m | Destination/visual only; no boss combat or reward contract yet |

All underground floor/collision and travel-graph data originate in `WolfveilModularCaveKit.mjs`. `WolfveilCaveLayout.mjs` adds the three modular paths, treasure room, and canyon/water mask to its EXISTING authoritative local navigation sample and collision resolver. `WolfveilCaveSystem.js` uses the same geometry, adds low-cost rock walls/water/lighting/decor, and retains the existing mountain roof and E session safety. No changes to world map terrain, water server, multiplayer combat or loot systems.

The first pass is a **functional navigation skeleton**. It is not yet the full 55m vertical relief, hand-sculpted entrance, or cinematic scenery from the HTML prototype. The canyon water is presentation-only. Treasure and boss stage deliberately have NO gameplay reward/summon/authority code.

## Tested/untested

Validated by a pure V8 execution of the repository's **actual new Kit + Layout source** with stubbed terrain height for imports: all 4 modular navigation graph edges connected correctly, all 1,365 rendered canyon floor cells sampled as walkable, the middle river has no floor, all 3 bridges are traversable, and an actor trying to step sideways off the middle bridge was returned to the bridge. This is **isolated source evaluation only**, not an authenticated Game 3D session or native Node/Vite build.

Run in native clone checkout:

```sh
node --test tests/game3d-clone-modular-cave-canyon.test.mjs
node --test tests/game3d-clone-four-cave-connected-route.test.mjs tests/game3d-clone-cave-sealed-roof-access.test.mjs
npm run lint
npm run build
```

Then sign in to **Clone Game 3D Play** and check every physical connection (hub→hall A/B→T→vault, T→canyon→all three bridges→arena), 3D seams and rock walls, entrance/exit E, non-walkable water gorge with no falls through the world, mount/dodge/knockback, 2-player/server collision parity, streamer chunk and material FPS/LOD, cave source/texture memory, relog and checkpoint. Fix any geometry intersections and certify owner acceptance **before merging**. Native results/screenshots have NOT been acquired.

## Coordination
Other active new-repository PRs [#44](https://github.com/lordemblemblue-cloud/fallen-sky/pull/44) (Ashen Cliff exterior) and [#45](https://github.com/lordemblemblue-cloud/fallen-sky/pull/45) (Ashroot Hollow independent cave) are **separate, unmerged workstreams**, not overwritten, cherry-picked or silently approved here. The earlier original/main repository LAND claim hub was inaccessible, and no landscaping square ownership was reassigned. This PR must remain DRAFT until physical/gameplay validation and review.
