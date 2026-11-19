# Game 3D — Wolfveil natural-zone streaming and horizon continuity audit

**Date:** 2026-11-18  
**Repository:** lordemblemblue-cloud/fallen-sky  
**Status:** SOURCE / MAP / STORED-SCREENSHOT REVIEW; IMPLEMENTATION PROPOSAL — NOT GAMEPLAY ACCEPTED  
**Goal:** The player passes through deliberately designed transitions, Metroid Prime-style. Once a transition finishes, the previous playable zone is fully released from client runtime memory (except intentional reusable global assets and lightweight non-interactive horizon facades). The next zone can be rendered independently. The player must never see terrain, water, sky or trees end in an obvious straight cut.

## 0. What was actually reviewed, and what was not

Reviewed the current main-branch Game 3D wiring in:
- src/components/game3d/GameWorld3D.jsx
- src/components/game3d/wolfveil/WolfveilScene.js
- src/components/game3d/wolfveil/WolfveilLayout.js
- src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs
- src/components/game3d/wolfveil/WolfveilMapDesign.mjs
- src/components/game3d/wolfveil/WolfveilTerrainAreaStream.mjs
- src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs
- src/components/game3d/wolfveil/streaming/WolfveilAreaPortalPlan.mjs
- src/components/game3d/wolfveil/streaming/WolfveilAreaVeils.mjs
- src/components/game3d/wolfveil/streaming/WolfveilAreaLoader.mjs
- src/components/game3d/wolfveil/WolfveilAreaGates.js
- src/components/game3d/wolfveil/WolfveilCaveLayout.mjs
- Existing dated world-streaming, area-gate, cave, landscape and performance notes under docs/game3d.

Inspected repository-generated images (not a signed-in gameplay recording):
- docs/game3d/landscaping/WOLFVEIL_MAP_DESIGN_20261116.jpg — a design/topographic overview, not proof of the current deployed visual result.
- docs/game3d/screenshots-area-gates-20261118/fs-west-veil.jpg — west forest/ridge with the broad veil.
- docs/game3d/screenshots-area-gates-20261118/fs-market-bridge-gate.jpg — torii/gate and membrane on the bridge.

**Not done:** direct walking, gliding, swimming, mounted crossing, camera-rotation sightline survey, GPU-memory profiling or live Base44 visual approval. Direct Base44 sandbox code access was rejected by the connected workspace plan. GitHub source being changed does not prove Base44 has deployed it. Every proposed border below requires in-game 360-degree inspection before geometry is changed.

## 1. Existing behavior and the exact gap

The existing five-area plan uses rectangles in Wolfveil-local metres (Game 3D world Z = local Z + 70): west x = -190, east x = 122, north z = 240, south z = -265. Areas are Town, South, West, East and North. Existing bridge gateways are on the east border around (122,-98), (122,35), (122,205), with additional trail gateways on west, north and south borders: eleven in total.

This is **not full zone unloading**. The area loader explicitly keeps one physical world: river, world/gameplay state, much collision, numerous cross-border assets, caves, some skyline and shared foliage. It hides area-owned scenery and creates/disposes instance batches. Graphics settings may prewarm nearby areas (browser default 90 m) and optionally release some GPU resources after a delay. The terrain-area streamer does replace/dispose its area terrain mesh, but it does not by itself partition the entire physical simulation, water, entity lifecycle, audio, navigation or asset ownership.

The 2026-11-18 veil work adds collision and torii membranes at rectangle borders. The screenshot of the west veil shows how a long bright veil can expose an artificial division across open terrain/forest. The bridge screenshot is visually better because the membrane has a deliberate architectural frame, but the open banks and distant terrain remain a sightline concern. The client-only border collision is not an authoritative traversal policy, and current cave tunnels intentionally bypass those border walls.

**Decision:** Retire rectangles as the *final* world design. Keep them only as temporary compatibility/analytics regions until polygonal natural zones, authored gateways and complete independent zone lifecycle are proven. Do not abruptly delete the existing loader or current portal positions.

## 2. Read the geography first: what the landscape demands

The canonical local playable core is about 1,100 x 1,100 m, with valley-edge mountain ranges. The west holds Cedar Spine, Bluewood and a wooded trail; the north holds Wolf Sanctuary, Howling Plateau and Wolf-Ear Range; the south holds the open Southern Gate Fields and Southern Downs; the east holds the river, three bridges, a quarry, ruins and ravines. The topographic map also shows long sightlines across town/southern grassland and from ridge slopes.

**Silverrun is the highest-risk seam.** It is a continuous, approximately 19-m-wide watercourse, following waypoints from around (227,360) via the waterfall and three bridge approaches to (237,-450). The river runs downhill through north, east and south-facing views. A straight clip through the river, water reflection, wet banks, spray or stream particles is unacceptable. **Do not partition the visible water line at x=122 or z=240 just because a rectangle ends there.** Where water crosses a zone, either put the actual seam beyond a rock bend/waterfall curtain/canyon occluder, or render a very cheap, continuous-looking visual river extension from the active zone with matching UVs, world-space phase, weather tint, flow direction and reflections. That extension is only scenery, not a loaded adjacent river simulation.

**Sky is not a zone wall.** Keep one continuous sky/atmosphere solution for the active camera: sky dome/cubemap/procedural stars/clouds, lighting and horizon haze. Backdrop-only ridge silhouettes may remain visible while their playable terrain is completely unloaded. A large vertical black/bright rectangular wall is never the default boundary.

**Paths are also sightlines.** Do not place a screen-width boundary across a long, straight road, bare hillside or grassland. A transition should be hidden by a road bend, wooded choke, gatehouse, canyon switchback, archway tunnel, waterfall curtain or a geographically justified magical veil. When that structure does not exist, the level art must create it without blocking unrelated paths or flight.

## 3. Candidate natural-zone graph — **not a fixed final zone count**

These are *candidate playable ownership units*, NOT rectangular cuts to apply immediately. Add, merge or split zones only after the sightline survey. Natural route gateways are more important than the count. Source coordinates shown are anchor examples, local X/Z (add 70 to Z for Play).

| Candidate zone | Landmarks and approximate anchors | Preferred entrance/exit | Visibility / seam issue | Confidence |
| --- | --- | --- | --- | --- |
| **Town / market hub** | Market (0,-70), town streets, central plaza | South Wolf Gate, framed river crossings, a forest trailhead and sanctuary approach | Town streets must not disappear in an open view from the square; no split through the player spawn or interiors | High as a destination; borders need survey |
| **Southern Gate Fields** | South Wolf Gate (0,-225), open training/fighting field farther south | Stone gate + short winding outward road, earthen embankments on both sides | Open grass and distant downs make a naked border obvious; maintain continuous far-hill silhouette | Medium |
| **Western training / cedar approach** | Training (-165,88), western residential and woodland fork | Tree-covered trail throat; trailhead lodge or rock/cedar arch | The training clearings must stay entirely on one side; west edge should not bisect trees or road junctions | Medium |
| **Deep Bluewood / Cedar Wilds** | Cedar Forest (-320,65), Bluewood camps, inland glades | Curving dense forest road; staggered large trunks / hill cut / mossy stone gate | Use layered foliage and genuine occlusion; avoid one long glowing veil across the tree line | Medium |
| **West ridge / Wolf Stones** | Wolf Stones (-325,235), Cedar Spine, southwest ruins approaches | Rocky saddle, climbing switchback or ruined stone arch between wooded and exposed slopes | High vantage can see behind a fake facade; needs a low-poly ridge/horizon shell from all directions | Low until aerial survey |
| **River crossings / east-bank approach** | Three bridges around x=122 at z=-98,35,205; river housing loop | Torii at a bank landing with a short screened approach or bridge-end gatehouse, NOT mid-water | Water remains visually continuous; distant far bank becomes facade; bridge deck & collision cannot disappear underneath the player | High as crossing routes |
| **Eastern quarry / shadow ravines** | Quarry (350,-40), Ravine (340,-165), ruined watch (295,-205) | Natural rock choke and switchback after the river housing roads | Quarry bowl and ravines are natural occluders; test line of sight from ridge and watchtower | Medium |
| **Highfall / waterfall and vortex basin** | Waterfall (142,179), cave behind falls (163,155), vortex lake (205,320) | Behind waterfall spray, gorge bend, cavern mouth or narrow rock approach | Do **not** slice the falls, upper river, lake or reflections; keep water as one visual composition until a hidden seam exists | Medium as a grouped area |
| **Sanctuary approach** | Sanctuary (4,220), north ridge path | Shrine wall / rock-sided uphill path / procession arch set behind an actual turn | Current north border z=240 is near a visible landmark; move any hidden handoff away from exposed shrine sightlines | Medium |
| **Wolf-Ear highlands / snow ridge** | Twin peaks around (-84,532), (78,538); north ridge beyond | Mountain saddle, enclosed cut in the slope, spiral climb or tunnel | Camera elevation / gliding make horizon discontinuities easy to spot. Preserve a stationary highland impostor skyline | Medium |
| **Cave system: individual mouths, halls and hub** | Four cave mouths: Jade (-360,-400), Root (-500,300), Inkstone (-40,548), Crystal (500,-36); subterranean Rotunda (-6,24) | Cave entrance bend, interior hallway, T-junction, closed stone doors or torch-lit turn | Best early candidate for genuine full unload: walls guarantee occlusion; preserve cave roofs, floor contacts and five connected tunnel paths | High for transition concept |

Potential additional cave/canyon/boss modules remain separate candidate zones. Do not assume draft branch modules are deployed merely because some files exist in main. Actual currently mounted caves, canyon and portals must be checked in GameWorld3D and in a guest Play session before cutting them up.

**Graph sketch (connectivity, not a ground plan):**

Southern Downs ⇄ South Wolf Gate ⇄ Town Hub ⇄ Forest Approach ⇄ Deep Bluewood ⇄ Wolf Stones ⇄ Highland Pass  
Town Hub ⇄ three existing river-bridge gates ⇄ East Bank ⇄ Quarry/Ravines  
Town Hub ⇄ Sanctuary Approach ⇄ Highland Pass  
East Bank ⇄ screened Highfall approach ⇄ Falls/Vortex basin  
Four cave mouths ⇄ short entry halls ⇄ their own cave rooms ⇄ Rotunda hub ⇄ underground branches/canyon (after verification)

Keep the three bridge choices, the existing forest loop, and the north-south connectivity where possible. A connected path in the *design* is not proof of a real walkable route; validate terrain and server collision.

## 4. Recommended presentation: distant scenery without the neighboring playable world

A flat photograph can look convincing from one viewpoint, but from a moving third-person camera it fails perspective/parallax, shadows, weather and changing elevation. A true mirror reflects a different world and may cost as much as an extra render. A live portal camera showing real adjacent assets defeats the memory-saving goal. Prefer an **authored multi-depth horizon facade**, matched to the actual terrain:

1. **Near seam: solid occluder.** Short winding trail, gatehouse, rock cut, dense cedar grove, cave bend, bridge-end torii with deep volumetric mist. It must block the *real camera line of sight*, including elevated or mounted views, before the old zone is destroyed.
2. **Mid-distance: 2.5D impostor.** Low-poly terrain silhouettes plus two or three depth-sorted sprite/impostor layers for mountains, tree canopies and architecture. Bake from multiple camera angles and elevation bands; cross-fade between captured angles if used. Avoid obvious billboard rotation.
3. **Far horizon: static sky-compatible ridge shell / panorama.** Correct mountain outline, atmospheric haze, sun direction, palette and depth. Rendering-only, non-colliding, no AI or world geometry. A shared skybox remains continuous; no distinct skybox cube that visibly ends at a boundary.
4. **Water continuation: special facade.** The *active* area's real river/water shader can end only out of sight, below a lip, around a gorge bend or under mist. A visual-only downstream/upstream extension must match the nearby water height, banks, normal flow, UV/time phase, horizon tint and waterfall particle silhouette. It has no gameplay physics or collisions.
5. **Atmospheric blend: golden/white spirit mist, used locally.** The owner suggested golden smoke: use it as a short, beautifully shaded transition volume in torii passages, caves and mountain doors, NOT an obvious 38-m-tall veil stretching across every open hillside. Its color can match biome, time and weather. No hard planar edge, alpha banding, emissive washout or full-screen flash every few footsteps.

**Cost contract for each facade (initial target; profile before final):** few draw calls, preferably well below 30k triangles, small atlas/textures, no skinned actors, AI, physics bodies, audio emitters or update loops. Measure the actual total residency; count facades separately from loaded gameplay zones. A facade is explicitly *not* a second loaded map.

### Particular art decisions

- **West forest screenshot:** broad bright field across forest = wrong default solution. Reframe the actual crossing as a curving forest corridor with dark foreground cedar silhouettes, layered trees, a small spirit arch and localized golden dust. Beyond it keep only a matched depth facade. Ensure the ridge peaks do not suddenly jump.
- **Market bridge screenshot:** the framed torii membrane already supplies a useful visual transition. Improve the staging with near-bank rocks/trees, a brief bridge-end occlusion zone, bank-to-bank river continuation and no white washed-out void beyond the gate. Do not force a world switch halfway across an exposed bridge.
- **Southern fields:** open sky and long grass views mean the south gate needs architectural depth and a road bend; otherwise a screen effect alone is not adequate.
- **Highfall and vortex:** prioritize natural occlusion (waterfall spray, gorge walls and bends). Never use two water planes with a visible flat joining line.
- **Caves:** most robust demonstration of the Metroid Prime technique. A closed stone door or curved entrance passage lets the old area fully disappear without demanding a false horizon.

## 5. Runtime architecture required for **full** zone unload

Introduce a declarative *natural zone graph* instead of making all decisions from X/Z rectangles. Each zone has:
- unique id, polygon/compound volumes, biome, and explicit player-entry spawn anchors;
- one **zone-owned root** containing the loaded scene, instantiated GLB meshes, local terrain geometry/BVH, material variants, texture handles, river segment, local foliage, particles, audio, zone lights, navigation, physics objects, NPC/enemy renderers, subscriptions and timers;
- an explicit list of authored transitions (from, to, gate geometry, line-of-sight occluder, direction, safe spawn, server-valid movement, facade variant);
- a dependency manifest (assets, shared safe caches, ownership and disposal) and test fixtures;
- a separate, **noninteractive facade manifest** for how the zone looks from adjacent playable zones.

Shared persistent systems: player/companion state, camera, HUD, input, clock/weather, sky/environment palette, network/session, character saves, quests, loot authority and the *server's* authoritative world state. These should not be recreated per zone. Shared GPU resources may be retained only when explicitly owned by a global cache and genuinely reused by active scenery; otherwise release reference counts. The phrase **100% unload** means **zero retained playable-scene objects, local physics/BVH, active AI/renderers, zone audio and zone-specific CPU/GPU allocations for the exited zone after its transition**, not deleting shared player/server/sky state or lightweight facades.

### Doorway / portal state machine

1. **ACTIVE(A):** A alone owns playable map geometry. Other destinations have only facade objects, optional downloaded bytes or small shared caches; no instantiated neighboring 3D scene.
2. **APPROACH_GATE:** Detect a valid, authored crossing. Optionally fetch/decompress asset bytes ahead of time into bounded caches without constructing B. Maintain A for play.
3. **OCCLUDE:** Player enters a genuinely screened transition pocket. Lock/restrict camera lines of sight only where art supports it. Close the rear gate or cover both exits with natural stone/mist. Preserve input responsiveness; show subtle world loading feedback if needed.
4. **LOAD(B):** Pause/restrict crossing safely; create B scene, terrain collider, local NPCs and water. If unavoidable, B and A may *briefly* coexist behind an opaque door, but not as stable residency.
5. **COMMIT(B):** Confirm assets, authoritative movement destination, collision and spawn grounding are ready; move player exactly once. B becomes sole active playable zone.
6. **UNLOAD(A):** Stop and unsubscribe A's systems, cancel pending async loads, remove objects, dispose render targets, geometries, textures, materials (only when no shared reference), mesh BVHs, collision bodies, audio nodes and workers; clear timers/caches specific to A. Verify all owned references are gone. Retain only A's optional facade as a separately owned object.
7. **ACTIVE(B):** Re-open the gate and present the new area. Returning uses the reciprocal gate, not the old resident A.

A strict one-playable-zone residency policy is achievable **after** step 6; a transient memory peak while loading is not zero and must be budgeted. For low-memory mobile, do not instantiate B until A is unloaded and a sealed transition visual can bridge the load. If B loading fails, return safely to A or an authenticated checkpoint; never leave the character over a missing floor.

### Critical correctness rules

- No arbitrary coordinate-triggered handoffs when walking near a border. Cross through a specified physical gateway/volume.
- No client-only collision as the sole protection: server movement validation and multiplayer teleport/reconnect rules must agree with zone graph and entry anchors.
- Players in different zones preserve authoritative characters/quests/loot, but do not keep every remote player renderer, enemy AI clone or audio emitter in the active client scene.
- Flying, mounted movement, knockback, dodge, jump, swimming/waterfall traversal, portal teleports, respawn, login at last position and camera zoom must resolve to an unambiguous zone safely. Prevent bypassing a transition via gliding over a low wall.
- Cave surface roofs and ramps remain solid at all times. Never accidentally route surface feet to a cave floor, nor make a tunnel collider disappear during an in-zone crossing.
- A loading boundary is separate from the Level-of-Detail boundary. Even inside the current zone, use near/medium/far foliage and efficient instancing.

## 6. Implement in small, reviewable increments — do not swap the whole world in one patch

**Phase A: Survey / border proposal (documentation first).** In a running Play build, capture 8 directions at standing + mounted/gliding heights from each proposed doorway. Overlay the current five borders on the map. Mark every river, road, sightline, camera collision, enemy camp and cave crossing. Reject any candidate where an uninformed player sees a bare cutoff. Split/merge candidates accordingly.

**Phase B: Prototype a fully isolated cave or enclosed trail segment.** Use an existing real entry hall and a second door/turn. Build ZoneRuntime's ownership/disposal, transition graph and dedicated facade. Instrument heap/GPU/object/physics counts across 30 round-trips. Prove the old cave is actually gone. Keep the current five-area system as rollback.

**Phase C: Town ↔ forest at ONE curated trailhead.** Replace a rectangular west veil along that passage with a short authored cedar/rock choke, a matched multi-depth forest facade, and a real two-stage transition. Preserve the forest route, walking, mounts and player saves. First visual acceptance check.

**Phase D: Town ↔ river at ONE bridge.** Keep the real bridge deck stable during transition; place the occluder at a bank/gatehouse. Prove that 360-degree camera views of water, banks, sky and remote shore remain continuous and zero destination playable objects exist until the gate commits.

**Phase E: Extend via the zone graph.** Only now handle the remaining bridge, south road, sanctuary pass, rocky east/north subzones and deeper caves. Do not assign every field a portal by formula. Each new edge requires explicit artwork, camera checks and tests.

**Phase F: Retire old rectangles.** Remove or disable the five-area compatibility renderer only after all actual traversal edges have been migrated, old owners are disposed, multiplayer and mobile pass, and staged rollback works. Preserve overall map, quests, equipment, towns, entrances, area names and save coordinates.

## 7. QA matrix / acceptance gates

Record **before / after** numbers with the same camera/graphics settings: median and p95 frame time, FPS, draw calls, triangles, JS heap, render geometry/texture counts, estimated resident GPU texture/geometry bytes, collision body/BVH counts, active sounds, actors and listeners. Use web browser first, then desktop and mobile.

Run a scripted transition loop on each edge: stand still, walk, sprint, mounted, gliding, jump, dodge, shove/knockback, reverse direction, spin camera 360°, raise camera, reconnect, reload saved position, die/respawn, and repeat 30–100 times. Compare memory before first entry and after each exit; **memory must stabilize** and the prior playable zone must show zero owned resources. Keep full-map export/test tooling able to assemble a separate offline authoring view without forcing every zone resident during gameplay.

Per-portal visual captures:
- 360° at 5 m, 15 m, 40 m and a high vantage point; both travel directions;
- clear weather, fog, nighttime and dynamic wind;
- river surface/foam/reflections continuously joining or hidden behind geology;
- no straight skyline/vegetation cut, photo parallax mismatch, foliage scale jump, mesh pop, occluder hole, texture flash, duplicated bridge, floating rock or shadow discontinuity;
- no player/companion falling through terrain; no AI stuck against a wall; no quest target unreachable.

**Acceptance means:** one player-occupied zone at steady state, 0 objects/resources owned by the exited playable zone, no broken geometry or visible cutoff from normal or elevated camera, both sides of every validated route traversable, FPS/p95 and memory materially improved, and owner approves the visuals in the *actual* running app. Source tests and static screenshots alone cannot satisfy this.

## 8. Existing test and debug footholds

Existing loader reports: window.__gw3dAreaLoader.getStats(), window.__gw3dAreaLoader.getReport(), and graphics performance metrics. Inspect getReport().alwaysLoaded.largest first; it enumerates large current exceptions. Current tests include tests/game3d-clone-wolfveil-five-area-loading.test.mjs, tests/game3d-wolfveil-area-gates.test.mjs and cave route/roof regression tests. Add independent-zone lifetime, ref-count, transition-gateway geometry, water-seam, reconnection, glider and multiplayer tests. The old graphics option Whole valley / loader disable is the initial runtime rollback, not the final zone engine rollback.

Related notes:
- docs/game3d/CLONE_WOLFVEIL_FOUR_REGION_STREAMING_20261115.md (superseded)
- docs/game3d/CLONE_WOLFVEIL_FIVE_AREA_PORTALS_PLATFORM_GRAPHICS_20261117.md
- docs/game3d/CLONE_WOLFVEIL_AREA_GATES_VEILS_20261118.md
- docs/game3d/WOLFVEIL_FOUR_SIDES_LANDSCAPE.md
- docs/game3d/CLONE_FOUR_CAVE_CONNECTIVITY_QA_20261116.md
- docs/game3d/landscaping/WOLFVEIL_LANDSCAPE_DESIGN_20261116.md

## 9. Decision register

- **Confirmed from code:** current five-area scheme streams visibility/selected terrain but does not fully unload the old physical scene.
- **Confirmed from source map:** continuous river and open sightlines make a naive vertical/horizontal split visually unsafe.
- **Confirmed from stored screenshot:** torii bridge provides a natural framed portal; broad west veil is visibly more artificial.
- **Recommended:** author natural polygonal zones with doors/occluders; use independent zone ownership and disposal; bake 2.5D/low-poly horizon facades rather than loading neighboring gameplay.
- **Rejected as the only solution:** flat photo across free camera movement; planar mirror; rendering an actually live adjacent world through a portal; a giant sky-colored wall; a full-screen smoke wall across every field.
- **Pending verification:** exact final zone count, polygons, portal placement, line-of-sight offsets, facade art, original-versus-hosted map parity, gameplay movement checks, device memory and frame-time gains.

**Change scope of this audit:** documentation only. No runtime system, world map, server movement, collision, quest, character or Base44 deployment was changed by this note.
