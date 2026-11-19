# Wolfveil areas: ground streams in at the gates, and the gates carry you through

**Date:** 2026-11-19
**Repository:** lordemblemblue-cloud/fallen-sky, branch `claude/wolfveil-area-streaming-20261119` (from `main` ab603e4)
**Owner feedback (2026-11-19):** "You were really supposed to divide it, but it looks like all you did was put a barrier up. Also, the portals that are supposed to allow you to the other side, they don't work. … make sure that it loads the area as it's going in there, as you're entering."

## 1. What `main` did with default settings (measured in a local Play build)

- The natural-zone prototype (`?naturalZones=1`) is **off by default**. With default settings the owner gets only the five-area system: one area loaded, spirit veils on every border, torii gates.
- **The ground beyond a border did not exist.** `WolfveilTerrainAreaStream` built exactly one terrain section (the current area's), and the player's ground rays only hit that section. The area loader preloaded the neighbour's *scenery* within 90 m, but not its *ground*. So past every border, trees floated over the sky.
- **The gates were walls.** Walking straight into a gate with the keyboard:

| Gate | On `main` |
|---|---|
| Training Forest | stopped 0.37 m past the gate plane |
| Southern Fields Way | stopped 0.81 m past |
| Market Stone Bridge | walked 8 m along the walkable deck, then stuck at the deck end over the void |

  `moveWorldActor` refuses a step onto missing ground. The area only switches 12 m inside the new area (hysteresis), and its ground only loaded after the switch. So you could never reach the point where it loaded. The bridge decks were the only exception, because decks are walkable surfaces in their own right.

## 2. What changed

- **The ground streams in as you approach a gate** (`WolfveilTerrainAreaStream.mjs`).
  - The current area's ground is always built, plus every area within the platform's preload distance (browser 90 m, desktop app 140 m, mobile 60 m).
  - Neighbouring sections are built ahead of time, one per frame, from per-area triangle lists precomputed at start-up.
  - Each triangle belongs to exactly one area, so the loaded sections tile the ground with no gap and no overlap along a border.
  - When you walk on, a section out of range (plus 25 m slack) is released with its raycast BVH.
  - The full-screen "Loading <area>…" overlay is gone. A teleport into an area that wasn't preloaded gets its ground in the same frame.
- **The gates carry you through** (`WolfveilAreaGates.js`). Stepping into a torii opening towards its plane starts a carry that moves you through the membrane to 4.2 m past it, in 0.3-0.75 s.
  - It runs through the game's ordinary movement (`moveWorldActor`), so collision and ground checks still apply.
  - It works in both directions, mounted or on foot.
  - Walking beside a gate (into the veil), standing in front of it, or stepping back out does not trigger it.
  - A blocked carry gives up, and a teleport cancels it.
- **Wiring** (`GameWorld3D.jsx`, `WolfveilScene.js`): the ground streamer follows the platform's preload distance, and the carry is applied once per frame in the main loop.
- **Unchanged:** the five-area scenery loader, the veil borders and their collision, the gate positions, server movement and saves. The veils still stand on the borders, so you still cross only at a gate; what changed is that the gates now work.

## 3. Results in the running game (local `vite dev`, guest, desktop browser pane, default settings)

Every gate was walked from both sides with keyboard input, starting 8 m before the gate:

| Gate | Area beside the gate | Ground of the far side loaded before reaching the gate | Crossed both ways |
|---|---|---|---|
| Market Stone Bridge | town + east | yes | yes, 13.4 / 13.6 m past |
| Residential Timber Bridge | town + east | yes | yes |
| Outrider Rope Bridge | town + east + north | yes | yes |
| Southern Fields Way | town + south | yes | yes |
| South Residential | town + south + west | yes | yes |
| West Residential | town + west | yes | yes |
| Training Forest | town + west | yes | yes (carried from −1.6 m to +4.0 m) |
| West Woodland Fork | town + west | yes | yes (12.6 / 13.1 m past) |
| Ridge Path | town + north | yes | yes |
| Hunter's Loop · East | east + north | yes | yes |
| Hunter's Loop · Cedar Spine | north + west | yes | yes |

Raw walk logs: `docs/game3d/zones-20261118/gate-crossing-20261119.json`. The gates that are turned 30° to their border (Ridge Path, the Hunter's Loop gates, Woodland Fork) need you to walk roughly along the gate's own axis. A first test that walked 25-35° off that axis ran into the veil beside the opening, as intended. A steering test that aimed for the far side crossed them all. After you walk on, the area changes (with the existing arrival notice) and the old area's ground and scenery are released once out of range.

## 4. Tests

`tests/game3d-wolfveil-gate-crossing.test.mjs` (8 tests):

- Far from a border, only one area has ground.
- At every gate, from both sides, both areas are streamed in and there is ground every 0.5 m along the whole crossing.
- One section is built per frame; the old ground is released on walking on.
- A teleport gets its ground in the same frame.
- Every gate, both ways, carries the player to the far side; no carry beside a gate, when standing still or when walking away.
- A blocked carry gives up, and a teleport cancels it.
- The `GameWorld3D` wiring.

The existing gate and five-area suites still pass.

## 5. Not verified

- Mounted and gliding crossings in play (the code path is the same `moveWorldActor`).
- Mobile and desktop-app preload distances in play.
- Remote players and AI crossing (they don't use the carry; AI paths keep the existing veil rules).
- A deployed Base44 build.
- Whether the owner wants the veils themselves softened now that the far side is real ground. They are unchanged.

## 6. Rollback

Revert the commit. Nothing else depends on it.

## 7. Update: merged with `main` 0b3fd6b (PR #98/#100, civic town NPCs)

- **The one conflict:** `WolfveilTerrainAreaStream.mjs`. Main's 79f5d85 made removing the old "Loading <area>…" overlay safe in headless runs. This branch had already replaced that overlay and its deferred build with synchronous per-area streaming, so the branch side was kept: there is no overlay left to remove.
- **Main's headless report script** (`scripts/report-wolfveil-area-loading.mjs`) now steps queued animation frames and checks that the streamed ground stays drawable. Both still hold.
- **Tests on the merge:** the gate-crossing tests, #98's `wolfveil-town-civic-ai` and `game3d-clone-town-living-quarter` tests, and the five-area and gate suites pass (74/74). The headless real-valley loading test fails on `main` as well (four far-outline checks; asset downloads are unavailable headless).
- **Live check on the merge** (sound muted, default settings; `zones-20261118/gate-crossing-merged-20261119.json`):
  - All 11 gates crossed from both sides, with the far side's ground loaded before arrival.
  - All 14 town NPCs were present. Over 30 s both guards patrolled ~32 m, residents took short walks, and vendors stayed at their counters.
  - Speech bubbles appeared for both guards and a vendor.
