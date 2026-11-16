# Game 3D clone — interconnected cave entrance and walkability correction (16 November 2026)

**Repository / scope:** `marcusflow1-arch/gitsync-pro` (the GitSync Pro clone), not the separate original `marcusflow1-arch/atom-x-eve-os` and not LAND-WS01–15 terrain-square releases.

## What was broken

1. The four Wolfveil entrance ramps descended to each chamber's **centre**, but the chamber's stone-floor circle begins well before the centre. The ground/collision sampler switched to the chamber in mid-ramp, causing a measured abrupt ~3–4m downward handoff.
2. Some arch interactions accepted E only near the *threshold*, despite the stone arch being several metres farther in and terrain-triangle ground differing from the height sampler at steep waterfall slopes.
3. The four caves had five authored connecting tunnels, but no in-world wayfinding signs to identify the correct branches in the central Wolf-Spirit Rotunda.

## Source corrections

- Each of the four ramps now reaches chamber floor elevation just inside its perimeter, then stays level to the room's centre.
- Each of the five interconnecting tunnels gains level **floor aprons** near both chambers/rotunda, preventing sudden drops exactly where visible tunnel geometry overlaps room floor.
- `planWolfveilCaveInteraction` accepts E at the grounded stone arch **or** the exterior threshold while rejecting activation from a cliff far above. Return remains E from the interior daylight arch only.
- The `buildWolfveilCaveTravelGraph` data is derived directly from the **actual floor corridor waypoints**. Four cave chambers and one hub connect through five real walkable tunnel paths; no map-only teleport connections or invented dungeon rewards.
- In-world floating wayfinding signs label E for cave entry and exit; the rotunda points to all four cave routes. They are non-raycasting, never added as collision surfaces, and their GPU resources are released on scene disposal.
- Preserves solid upper terrain/waterfall roofs from PR #104, 7-foot rim fall protection from PR #103, authored height function, geometry textures, mobs, separate Lunar/Astral dungeon portals, client/server combat authority, 95.2 Combat/Quest safeguards and unrelated UI.

## Geometry and topology source validation

In the local JS-source evaluation (using the actual Wolfveil layout formula with non-cave grading stand-ins), four initial entrance discontinuities of ~3.15–3.92m were reduced to **under 0.5m per ~0.6m route sample**. The five connecting tunnel floors were continuous at the same sample interval, with no missing ground contact. This is source-model evidence, not authenticated game observation or proof of full physics fidelity.

Native test file: `tests/game3d-clone-four-cave-connected-route.test.mjs`

## Required signed-in Game 3D Play acceptance (open)

- Above the waterfall, stand, sprint, jump and mount over the Crystal Vault surface roof near world **X122, Z268**. No dropping into the cave or snapping to an underground floor.
- Walk to each actual stone arch: Jade Grotto **(-216,146)**, Root Hollow **(-312,218)**, Inkstone Cistern **(-82,382)**, Crystal Vault **(122,268)**. Verify E works at the visible arch and its threshold and does not work from a high ledge.
- Inside each entrance, descend continuously, take the connected passage toward Wolf-Spirit Rotunda **(-138,266)**, and use signs to reach every other cave. Check collision around chamber boundaries, tunnel elbows, room transition seams, water/cave floor contacts and ceiling clearance.
- Walk up the actual exit corridor and E at the inner arch. Verify standing outside afterward, without being pulled underground or inadvertently using Lunar/Astral/Waterfall portals.
- Validate rendering/LOD/FPS, signed-in server movement acceptance, checkpoint recovery, and two-client parity. DO NOT certify 100% completion until these observations and owner acceptance exist.

**Deployment limitation:** the separately listed Base44 Copy app does not contain Game 3D source paths and has no GitHub connection. Merging this repository cannot by itself update the screen the owner is viewing. Confirm the actual clone runtime/deployment before claiming live fixes.
