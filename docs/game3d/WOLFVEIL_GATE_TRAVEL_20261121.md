# Wolfveil gates: walking or riding through a torii takes you to the other side

**Date:** 2026-11-21
**Repository:** lordemblemblue-cloud/fallen-sky, branch `claude/wolfveil-gate-travel-20261121` (from `main` d8817383)
**Owner report (2026-11-21, recording `2026-11-21 09-51-34.mp4`):** "You can also see that you can't go through the portals, and that's a problem." Level 38, riding the Fantasy Bear, held at the red torii on the Market Stone Bridge between Wolfveil Town and East Wilds (16–33 s). Both "East Wilds · Optional PvP" and "Wolfveil Town · PvE" banners on screen; sky and fog flicker on alternate frames.

## 1. Was the earlier gates work in `main`?

No. Branch `claude/wolfveil-area-streaming-20261119` (ground streaming plus a gate "carry", tip 34dd317) was pushed but **never opened as a pull request and never merged**. `main` instead took PR #102 (`fix/isolated-wolfveil-portal-scenes`, e39c730b, merged 2026-11-19): every area became its own scene. Only that area's ground, gates and veils are built, and travel remounts `GameWorld3D` into the next area. The Base44 preview runs `main`, so it never had the carry. That older branch no longer fits `main`'s design and should be closed, not merged.

## 2. Why nobody could get through (measured on `main` d8817383, local `vite dev`)

Each area is its own scene, with `mode:'single'` and `preloadMeters:0`. Travel only started when the area loader switched area, and the loader switches **12 m past a border** (hysteresis). In a single-area scene there is no ground 12 m past a border, and `moveWorldActor` refuses any step onto missing ground. So:

| Crossing on `main` | Where the player stopped | Travel |
|---|---|---|
| Market Stone Bridge, on foot, town → east | x = 133.96, 11.96 m past the border (deck end) | never |
| Market Stone Bridge, riding the Fantasy Bear, town → east | x = 129.45, 7.45 m past | never |
| Market Stone Bridge, on foot, east → town | 10.4 m past (deck end on the town side) | never |
| Ridge Path (trail gate), on foot, town → north | 0.13 m before the gate plane (the trail's ground ends at the border) | never |

- **Mounted vs on foot:** both stop. A rider stops sooner, so riding never got past the gate either.
- **Area state:** in a single live world the loader's area does not flip at the border. It stays on the scene's area (hysteresis), and nothing travels.
- **World status:** it used the raw position. Every step across the border line at a gate switched it between "Wolfveil Town · PvE" and "East Wilds · Optional PvP", and each switch posted a banner. That is why both banners were on screen.
- **Arrival:** a scene loaded after travel briefly placed its loader at the town centre while the player model loaded. That posted "Entering Wolfveil Town" while arriving in East.

## 3. What changed

- **`wolfveil/streaming/WolfveilGateTravel.mjs` (new, pure, no three.js).** It decides when the player goes through a gate:
  - `wolfveilGateTravel` fires when the player crosses a gate's plane inside its opening, towards an area that isn't loaded. This covers bridge decks, which run on through the gate.
  - `wolfveilGatePush` fires when the player walks or rides into the opening, within 5 m in front of the gate and heading into it (within 60°), and the world holds them up. On a trail the ground ends at the border, which can be a few metres short of a gate turned along its path.
  - Walking freely towards a gate, beside it or along it, stepping back, a teleport, or the area already loaded never travels.
  - The landing is on the gate's axis, 6 m past its plane and inside the destination area, facing on.
- **`GameWorld3D.jsx`:**
  - Both checks run on every live frame: the plane check after the gates update, the push check after the player's WASD or click-to-move step, on foot or mounted.
  - They never run on the title screen, in caves, natural zones or duels, or after travel has already started.
  - A pass posts the usual "Entering … · <gate>" notice and mist flash, then `game3dPortalTravel` to the destination area. The loader's 12 m switch stays as the fallback.
  - While the arriving player model loads, the loader and gates use the arrival point instead of the town centre.
  - A rider who went through a gate rides on: once the scene's mount has loaded, it is placed under the player and mounted through the ordinary F path, with the same checks.
- **`GameView.jsx`:** the landing keeps `heading` and `mounted` through the scene swap. The world-status panel is given the loaded area.
- **`pvp/WorldPvpRules.mjs`, `pvp/WorldPvpControl.jsx`:** the panel shows the status of the loaded area scene (`resolveWorldPvpSceneZone`). It changes once when you go through a gate, not on every step across the line. The server's `resolveWorldPvpZone` is unchanged: it still resolves the trusted position and ignores any area field.
- **Unchanged:** the one-area-per-scene design (PR #102), gate and veil positions and collision, the loader, server movement and saves, and the renderer and render loop.

## 4. Results in the running game

Setup: local `vite dev`, guest, on foot, sound muted, WebGL. Each run walked with keyboard input from 8 m before the gate.

| Gate | Direction | Triggered | Arrived |
|---|---|---|---|
| Market Stone Bridge | east → town | crossing, 0.13 m past the plane | 6 m past, on the deck, 7.2 s |
| Market Stone Bridge | town → east | crossing, 0.04 m past | 6 m past, 6.3 s |
| Residential Timber Bridge | town → east | crossing, 0.12 m past | 6 m past, 4.0 s |
| Residential Timber Bridge | east → town | crossing, 1.46 m past (slow frame) | 6 m past, 14.3 s |
| Outrider Rope Bridge | town → east | crossing, 0.09 m past | 6 m past, 10.6 s |
| Outrider Rope Bridge | east → town | crossing, 0.13 m past | 6 m past |
| Ridge Path | town → north | push, held up 0.26 m short | 6 m past, 9.4 s |
| Hunter's Loop · East | north → east | crossing, 0.24 m past | 6 m past, 8.7 s |
| Hunter's Loop · East | east → north | push, held up 2.23 m short | 6 m past, 7.1 s |

- **Every arrival:** on the ground (no drop), in the right area. There was one area change (through the gate), one travel, one "Entering … · <gate>" notice and one correct world-status banner.
- **Ridge Path, north → town:** one run failed while the pane was hidden. A 10.2 m frame was rejected as a teleport by the first version's 8 m guard. That was fixed with the 30 m guard and the "standing past the plane" rule, and is unit-tested, but not re-run in the browser.
- **Not walked in the browser after the fix:** Southern Fields Way, South Residential, West Residential, Training Forest, Hunter's Loop · Cedar Spine and West Woodland Fork. The browser pane was hidden and throttled to a few frames. The unit tests cover every gate in both directions.
- **Riding:** not re-run after the fix. Before the fix, riding reproduced the stall at 7.45 m past the Market Stone Bridge border.
- **Test-harness pitfall (not a game bug):** a `requestAnimationFrame` → `setTimeout` patch without a matching `cancelAnimationFrame` keeps the previous scene's loop alive after travel. Two worlds then alternate and flip the world status every frame. With the browser's own `requestAnimationFrame`, travel left exactly one world running.

## 5. Tests

`tests/game3d-wolfveil-gate-travel.test.mjs` (9 tests) covers:

- Every gate, both ways: the plane crossing travels to the far side with a valid landing and heading.
- Every gate, both ways: being held up in the opening travels, both walking and riding. A free step does not.
- No travel beside a gate, along it, too far in front, heading away, after a teleport, or into the loaded area.
- The world status holds the scene's area, and the server rule still ignores any client area.
- The wiring in `GameWorld3D` and `GameView`.

Also updated:

- `game3d-wolfveil-area-gates` now matches `main`'s area-filtered gates. That assertion already failed on `main`.
- `game3d-pvp-inline-weather-quest` allows the new `area` prop.

Related suites (five-area loading, four-region streaming, area gates, world PvP) pass: 74/74. ESLint is clean on every changed file, and `vite build` succeeds.

## 6. Not verified

- A deployed Base44 build. This was a local `vite dev` in the desktop app's browser pane, with WebGL.
- Gliding or flying through a gate.
- Remote players watching someone go through.
- Mobile and the desktop app.
- **The flicker.** The recording alternates whole frames (town street, then a green field with a pink sky) at 9 s in town, far from any gate. That is the renderer or render loop, not the area or gate code. Locally, a single world had one player-position publisher and no per-frame area flip. It was reported to the WebGPU session rather than edited here.

## 7. What the owner has to do

1. Open a PR from `claude/wolfveil-gate-travel-20261121` into `main`, review it and merge it.
2. Publish the app in Base44 (or let the preview pick up `main`), then hard-refresh the preview.
3. Close the unmerged `claude/wolfveil-area-streaming-20261119` branch. It conflicts with the one-area-per-scene design.

## 8. Rollback

Revert the commit. Without it, travel goes back to the loader's 12 m switch, which can't be reached.
