# Clone Game 3D — Living Wolfveil Town Quarter
**Date:** November 14, 2026  
**Repository:** `marcusflow1-arch/gitsync-pro`  
**Branch:** `game3d/clone-town-living-quarter-patrols-20261114`

## Architecture
Nine new authored structures, added **after** the imported town's existing Blender cleanup, leveling and collision bake. No original brick floor, terrain tile, gate or central tree is overwritten:

- **Northwatch Longhouse**, world (X=2, Z=54), 26×15 metres, a single detached residence/guard lodge about twice the width of a shop.
- Four buildings on the **left**, facing the central avenue at X=−39: Cedar Tea House (Z=−44), Moon Thread Tailor (−23), Clay and Ink (8), Cedar Hearth (29).
- Four buildings on the **right**, facing the avenue at X=+39: Riverstone Provisions (−44), Lantern Apothecary (−23), Ironleaf Smith (8), Orchid Cottage (29).
- Buildings use independent walls, doors, pitched tiled roofs, real stone footings, warm windows, and small shop signs. They stand on sampled world elevations, not a second solid floor plate.
- The central tree is at about X=−7.85, Z≈0. All placement stays at least 13.5m from its nearest footprint; a broad corridor down the centre and the original south gate remain open.
- Each footprint tests **all four corners and the centre** against the post-clearance collision grid. Unsafe, blocked, missing-floor or heavily sloped placements **do not spawn** and appear in `livingQuarterReport.rejected`. Never force a house onto a canal, bridge or raised tile.
- New house walls participate in `isSolid` and slide-style `resolveCollision` alongside the existing imported town collision. This does not mutate the inherited tile BVH, brick floor or server map.

## Residents
- **Four patrol guards** — Sera and Ren on the west side, Daro and Mira on the east — traverse opposite-direction north/south routes, turn to face their partners and briefly converse when their paths meet.
- **Warden Ilan**, near the large north lodge.
- **Eight shopkeepers/townspeople**, one by each small building, with subtle nearby idle/walking motions and authored merchant/resident roles.
- Lightweight stylized 3D NPC bodies have moving legs/arms and guards carry recognizable helmets and staffs. They are not enemies or combat hit targets.
- Each agent independently selects a conversation every ~11–27 seconds and displays a **small speech bubble** above their head for ~4–5 seconds **only if the player is within 24 metres**. The bubbles are not HP bars, use bounded textures, and clean up on world unmount.

## Conversation and quests
- `WolfveilTownDialogueBrain.mjs` is a **local autonomous rule/grammar-based AI**, not a cloud LLM. It varies weather, patrol, market and rumor topics from an agent's identity, pseudorandom memory, nearby conversational partner and visit context; no remote API bills or long-running requests.
- Press **E** near a resident to speak. The same Game 3D dialogue system manages input and avoids overlapping the regular quest prompts.
- Shopkeepers and guards occasionally refer the player to a quest **only through the existing** `getAXENPCQuestHandoff()` gating. The familiar quest offer, objective tracking, completion check and reward path remain responsible for any XP/items.
- **Conversation itself gives no items, XP, currency or account entitlements.** This design intentionally avoids a client-modifiable item faucet; merchant trading and server-validated inventory grants require separate authorized implementation.
- Townspeople are local autonomous visuals, **not shared multiplayer state**, and their lines differ between clients. This is intentional for the prototype; authoritative shared AI would need a dedicated service and synchronization contract.

## Files
- `src/components/game3d/wolfveil/WolfveilTownLivingQuarterLayout.mjs` — 9 footprints, central tree and path protection, safe placement checks
- `src/components/game3d/wolfveil/WolfveilTownDialogueBrain.mjs` — local bounded spontaneous and paired chatter
- `src/components/game3d/wolfveil/WolfveilTownLivingQuarterScene.mjs` — 3D structures, guard walk cycles, citizen idle, small speech sprites, cleanup and house collision
- `src/components/game3d/wolfveil/WolfveilImportedTownScene.mjs` — load integration after repaired imported town collision
- `src/components/game3d/GameWorld3D.jsx` — E prompt and approved quest handoff
- `tests/game3d-clone-town-living-quarter.test.mjs` — 9-plots, dialogue, authored collision, town integration

## Release/QA gate
1. `npm ci --ignore-scripts && node --test tests/game3d-clone-town-living-quarter.test.mjs && npm run build`.
2. Confirm **all 9 houses** appear without clipping the old bridge/canal, signs face the avenue, gate/brick remain intact, and the center tree has clear space on all sides.
3. Walk around every house and its door, along both patrol lanes, around the big hall and across the whole town perimeter. No invisible blocker or floor seam is allowed.
4. Observe four separate guards pacing back and forth, paired conversation replies and small bubbles. Test E on the guard and shopkeepers, show optional original quest offer; verify no client reward without a legitimate quest completion.
5. Test mobile/web input, user mount collision, nearby quest NPC priority, reload, multiple players, and low-end GPU frame times.

**Status:** GitHub branch code, automated tests and CI configuration created. No claim of a running signed-in Base44 preview, GPU video, deployment or map-wide independent walk QA. The connected clone's Base44 sandbox file tools require a higher workspace plan and its current build state reports an error. Keep this PR as draft until the visible game and tests actually pass.
