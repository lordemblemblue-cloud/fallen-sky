# Build rules for The War of Three Roads

For every session that builds part of this plan. Read with `README.md`, `03_QUEST_PLAN.md` and `research/WORLD_TODAY.md`. The owner said "Yes, build it" to the story on 2026-11-21.

## 1. Where things live

| What | Where |
| --- | --- |
| Everything new in the world | `src/components/game3d/threeroads/` |
| The places of the current area and their dressing | `threeroads/places/` |
| Kinds of monster, and groups of them placed at a spot | `threeroads/enemies/` |
| The people: quest givers and actors | `threeroads/cast/` |
| Watching pledge steps in the world; pledge UI | `threeroads/pledgeworld/` |
| Kit loaders (shared low-poly pieces per empire) | `threeroads/kits/` |
| Pledge data and every spoken line | `threeroads/script/` (written by the lead session only) |
| The pledge engine: pure logic, places table, voice playback | `src/components/game3d/pledges/` |
| Models, textures | `public/game3d/threeroads/` |
| Voice files | `public/game3d/voice/pledges/` |
| Tests | `tests/game3d-three-roads-*.test.mjs` |
| Plan, research, build notes, costs | `docs/game3d/three-empires/` |

## 2. The switch

Everything is off unless the page is opened with `?threeRoads=1` (or `localStorage['game3d.threeRoads']='1'`). `threeroads/threeRoadsFlag.mjs` is the only place that decides. The default changes only when the lead says a band is ready.

## 3. Files you do not edit

- `GameWorld3D.jsx`. It has one hook for all of this: it creates `createThreeRoadsWorld(ctx)` behind the switch, calls `update(delta, playerPosition)` each frame, `resolveCollision(position, from, radius)` in the player's collision chain, and `dispose()` on teardown (`threeroads/ThreeRoadsWorld.mjs`; pinned by `tests/game3d-three-roads-world.test.mjs`). Your work goes inside your subsystem. If you need something the context does not give you, stop and ask the lead; it is added once, by the lead.
- `threeroads/subsystems.mjs`, `ThreeRoadsWorld.mjs`, `threeRoadsFlag.mjs`, `coords.mjs`: the lead's.
- Other sessions' ground: `wolfveil/streaming/*`, the height chain in `wolfveil/WolfveilLayout.js`, `wolfveil/WolfveilLandscapeDesign.mjs`, the area veils and gates, `server/game3d/mapCollision.mjs` (Wolfveil doorways session); `src/lib/webgpu*`, `rendererBackendChoice.mjs` (WebGPU session); the player's movement states under `player/` (animations session); `src/components/duelist` (the hub). If your piece cannot be done without one of these, say so to the lead with the exact function and lines.

## 4. The subsystem contract

```js
export function createPlacesSubsystem(ctx) {
  if (ctx.region !== 'wolfveil') return null;   // null = nothing to do in this scene
  // build ...
  return {
    update(dt, playerPosition, ctx) {},
    // optional: push the player out of solid things you built; return true if you moved them
    resolveCollision(position, from, radius, ctx) { return false; },
    dispose() {},
  };
}
```

`ctx` (see the header of `ThreeRoadsWorld.mjs`): `region`, `worldArea`, `areaScenes`, `scene`, `wolfveilWorld`, `renderer`, `camera`, `sampleGroundY(x, z)`, `snapToGround(object, offset)`, `groundMeshes`, `fbxLoader`, `gltfLoader`, `enemies`, `questNPCs`, `getPlayer()`, `bus`.

- A subsystem that throws is switched off and reported; it never takes the world down. Still: catch your own loader failures and carry on without the model.
- **Every area change and every cave or dungeon entry remounts the whole world.** Build for the current scene only, and dispose everything you created (geometries, materials, textures, mixers, listeners) in `dispose()`.
- Talk to other subsystems only through `ctx.bus` (`on(type, fn)`, `emit(type, detail)`), never by importing each other's internals. Event names are listed in `docs/game3d/three-empires/PLEDGE_ENGINE.md` once the engine session has written it; add yours there.
- No allocation per frame in `update`. Work that can wait runs every few hundred milliseconds, as the zombie camps do (`wolfveil/WolfveilZombieHordeRuntime.js`).

### Bus events, version 1

All positions are world metres. A subsystem that does not know an id ignores the event. `→` means "asked of", `←` means "announced by".

| Event | Detail | Meaning |
| --- | --- | --- |
| `enemies:spawnGroup` → enemies | `{ groupId, kind, count, x, z, radius, level, tier }` | Put `count` monsters of `kind` on the ground within `radius` of the point. `level` may be `'player'`. Asking again with a live `groupId` does nothing. |
| `enemies:despawnGroup` → enemies | `{ groupId }` | Remove what is left of the group. |
| `enemies:defeated` ← enemies | `{ groupId, kind, id, tier }` | One of a group's monsters died, whatever killed it. |
| `enemies:groupCleared` ← enemies | `{ groupId, kind }` | The last one died. |
| `cast:spawn` → cast | `{ id, x, z, facing }` (the rest comes from the cast table) | Bring a person into the scene. |
| `cast:despawn` → cast | `{ id }` | Take them out. |
| `cast:moveTo` → cast | `{ id, x, z, speed }` | Walk there. |
| `cast:follow` → cast | `{ id, target, distance }` | Follow the player (`target: 'player'`) or another person, or stop (`target: null`). |
| `cast:arrived` ← cast | `{ id, x, z }` | They got there. |
| `cast:say` → cast | `{ id, lineId, text, seconds }` | Show the line over their head for `seconds`; the voice plays if a file exists. |
| `cast:ready` ← cast | `{ id }` | Their model has loaded and stands on the ground. |
| `places:ready` ← places | `{ area }` | Everything in this area is built and standing on the ground. |
| `pledge:stepStarted` ← pledges | `{ pledgeId, stepId }` | The player has reached this step. |
| `pledge:stepDone` ← pledges | `{ pledgeId, stepId }` | It is finished. |

Named points inside a place (where a wagon stands, where a person waits) are data, not events: `threeroads/places/layouts/*.mjs` exports them and any subsystem may import those files.

## 5. Coordinates

Two frames (`threeroads/coords.mjs`). The places table and all layout files are in **local** Wolfveil metres. The scene, the player, enemies and people are in **world** metres: `world z = local z + 70`. Scenery added under `ctx.wolfveilWorld.group` is positioned in local metres and is managed by the area loader and cut at area borders; people and monsters go straight into `ctx.scene` in world metres. With `areaScenes` true only `worldArea` exists: build only what lies in it. Keep new things at least 30 m inside an area's border.

## 6. Room on screen

The game's budget for one area in a browser is 500 draw calls and 1.5 million triangles. Before this work the worst single views already used 207 to 280 draw calls and 0.77 to 1.24 million triangles; the west is over on triangles and the east is at the limit.

- One place: at most about **10 draw calls and 15,000 triangles in view**, with a low-poly version at about a third of that beyond 60 m, and nothing but an outline beyond 150 m.
- Repeat a piece with `InstancedMesh`, one batch per piece per area. Many small separate meshes is the failure this project has already had once (the caves: 790 draw calls for 53,000 triangles).
- **Materials.** Use `MeshStandardMaterial` or `MeshBasicMaterial` and share them. Every distinct material is a pipeline the WebGPU renderer has to compile, and a new one appearing in the middle of play can hitch. No GLSL `ShaderMaterial` unless it has a node twin registered with `setNodeTwin` (`src/lib/webgpuMaterialTwins.js`).
- **Lights.** At most two to four real lights per place; the rest is emissive material. No new shadow-casting lights.
- **Animated bodies.** The game holds at most 30 animated enemies at once. People and monsters you add count against the same room: at most 8 people and 12 monsters of yours in a scene unless you have measured more.
- **Measure.** Before and after, on WebGPU, with the probe from `research/PERF_BASELINE_WEBGPU.md` once it has landed; until then report draw calls and triangles from `renderer.info` at the place's vantage point. Put the numbers in your report.

## 7. Kits

Each empire, and the valley, has one kit: a GLB at `public/game3d/threeroads/kits/<name>.glb`.

- About 12 pieces, all sharing **one** base-colour atlas (2048 px) and one material.
- Each piece as `<piece>_LOD0` (at most 6,000 triangles) and `<piece>_LOD1` (at most 1,500). The whole kit at most 60,000 triangles at LOD0 and 3 MB on disk.
- Metres, Y up, the piece standing on y = 0 with its pivot at the centre of its footprint, front toward +Z.
- Sizes from the body: a person is 1.8 m, a door 2.2 to 2.5 m, a road 4 m, a house footprint about 8 by 6 m, a tower 15 to 18 m.

## 8. Shaping a place: the loop the owner asked for

1. Read the place's entry in `03_QUEST_PLAN.md` section 3 and the pattern card for its kind in `research/REFERENCE_LAND_NOTES.md`.
2. Go back to the timestamps on that card in the reference video and look again, frame by frame where the camera crosses ground. Note what you looked at.
3. Shape and dress ours. Look at it in the browser from its vantage point and from 300 m, 100 m and 50 m on its approach.
4. Compare with what you saw, fix, repeat until it reads right.
5. Measure (section 6) and write the place's numbers down.

The reference is for craft only: how land is shaped and a kind of place laid out. None of that game's map, places, names, characters, quests, art or music is used.

## 9. Story and words

Every name, title and spoken line comes from `threeroads/script/`, written by the lead. Do not invent story text; where you need a line that does not exist yet, use a visible placeholder (`[line: lyra_m01_offer_1]`) and list it in your report.

## 10. Rewards and the server

Nothing of value is granted by the player's browser: no experience, currency, item or standing for a pledge. Pledges carry an empty `reward`. Progress shown to the player is presentation; what a server would have to verify is written down beside the code. No database or entity change, no new deployed function, no secret in the repo. The owner deploys.

## 11. Credits

- **Meshy.** The owner allowed creating and downloading models. Check the balance first, generate only what the plan needs, never regenerate something that exists, and add a line to `COSTS.md` for every generation (date, what, credits).
- **ElevenLabs.** Nothing is recorded without the lead's go. Never open or print the key file.

## 12. Branches, tests, reports

- Your own worktree under `C:\Users\marcu\.copilot\repos\fallen-sky-worktrees\`, your own branch `claude/three-roads-<piece>-20261121`, cut from `origin/claude/three-empire-war-20261121`. The lead merges your branch into that one. Never push or merge into `main`.
- Commit as the owner identity with `-c` flags; push each verified piece: `GIT_TERMINAL_PROMPT=0 timeout 100 git push origin <branch>`.
- Never run `python`. Use `node`; for mesh work, Blender's own Python: `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P script.py -- args`. Never touch a Blender window the owner has open.
- Tests: pure logic in `.mjs` with explicit extensions so node can import it. Run your own test files and the ones that pin what you touched; compare failing names with a baseline at your starting commit. The suite has failures on `main`; never write "all pass" for it. `npx eslint` on what you add.
- Live check: the dev server from your worktree on a free port (never 5321), the page `/gameview?threeRoads=1`, a guest character. The notes on driving a hidden browser pane are in `research/PERF_BASELINE_WEBGPU.md` and in the perf session's brief.
- Report: branch and commit first; files; test commands and results; draw calls and triangles before and after; what you looked at in the reference; placeholders used; credits spent; what you could not verify.
