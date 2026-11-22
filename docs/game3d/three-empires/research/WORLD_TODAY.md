# Game 3D world today: an inventory for the Three Empires plan

Research input for session `three-empires`, written 2026-11-21 from the code on branch
`claude/three-empire-war-20261121` (cut from `main` 14df01b0). Every claim names the
file and line it was read from. All paths below are relative to `src/components/game3d/`
unless they start with `src/`, `base44/`, `server/`, `docs/` or `tests/`.

Status words used throughout:

- **live**: built and run by the published game on `/gameview` with default settings.
- **flag**: present but off unless a URL parameter / localStorage key / server setting turns it on.
- **paused**: code exists but is not mounted, not called, or switched off in code.
- **private server**: code under `server/` that the published Base44 game does not call.
- **unconfirmed**: I could not prove it from code in the time I had.

Two coordinate frames appear in the code. **Local** Wolfveil metres are what the layout
files use. **World** (render) metres are what the player position, NPC spots and the
HUD use. They differ only in Z: `world z = local z + 70`
(`wolfveil/streaming/WolfveilFiveAreaPlan.mjs:8`, `wolfveil/WolfveilScene.js` sets
`world.group.position.z=offsetZ` with `offsetZ=70` when `originAtMarket`). Unless a table
says "world", coordinates in this document are **local**.

---

## 1. The map

### 1.1 Frame, units, extent, start

| Fact | Value | Source |
|---|---|---|
| Axes | +X east, +Z north, +Y up; 1 unit = 1 metre | `wolfveil/WolfveilLayout.js:12-14`, `:23-29` (`north:'+z'`, `metersPerUnit:1`) |
| Playable square | local −550…+550 on X and Z (1,100 m × 1,100 m; "playableHalfSpan" 528) | `wolfveil/WolfveilLandscapeDesign.mjs:17-19`, `streaming/WolfveilFiveAreaPlan.mjs:9` |
| Terrain mesh | one 1,100 m heightfield, 310 segments (≈3.55 m vertex spacing) | `wolfveil/WolfveilScene.js` `buildWolfveilTerrain({span:1100,segments:310})` (≈ line 86) |
| Beyond the square | a streamed "solid meadow" and outer snow ranges drawn as skyline only | `WolfveilLandscapeDesign.mjs:78-86` (`outer:true` ranges) |
| Town origin | the old market at local (0, −70) is world (0, 0) | `WolfveilLayout.js:32`, `GameWorld3D.jsx:930` (`originAtMarket:true`) |
| New-player spawn | world (−7, 8) = local (−7, −62), on the town plaza | `wolfveil/WolfveilImportedTownLayout.mjs:51`; used at `GameWorld3D.jsx:2260-2263` |
| Fallback start when no spawn applies | world (0, 70) = local (0, 0) | `GameWorld3D.jsx:921-923` |
| Elevation | south gate ≈ 0 m, market plaza ≈ 22.7 m, sanctuary ≈ 76 m, valley floor north ≈ 80–110 m, summits 237–298 m | computed with `wolfveilHeight()` (`WolfveilLayout.js:323`) by a node script, see 1.6 |

The valley climbs about 80 m from the southern gate to the sanctuary
(`WolfveilLayout.js:221-223`), side hills rise 30 m beyond |x| 145 m (`:225-228`) and the far
north rises another 44 m beyond z 250 (`:229`). Boundary mountain ranges are added on top
(`WolfveilLandscapeDesign.mjs:67-86`).

### 1.2 The five areas

Defined in `wolfveil/streaming/WolfveilFiveAreaPlan.mjs:13-27`. Borders: `westX −190`,
`eastX 122`, `northZ 240`, `southZ −265` (local). North wins over west/east; the middle
column is split into town and south (`:43-49`). Each area is a rectangle that runs on past
the 1,100 m square (`:55-65`).

| id | Label (in code) | Side | Local rectangle (clamped to the square) | Area | Neighbours (share a border) |
|---|---|---|---|---|---|
| `town` | Wolfveil Town | centre | x −190…122, z −265…240 | 157,560 m² | south, west, east, north |
| `south` | Southern Gate Fields | front | x −190…122, z −550…−265 | 88,920 m² | town, west, east |
| `west` | Western Cedar Wilds | left | x −550…−190, z −550…240 | 284,400 m² | town, south, north |
| `east` | Eastern Riverlands | right | x 122…550, z −550…240 | 338,120 m² | town, south, north |
| `north` | Northern Highlands | back | x −550…550, z 240…550 | 341,000 m² | town, west, east |

(Areas and neighbours computed from `wolfveilAreaRect` / `WOLFVEIL_AREA_NEIGHBORS`,
`WolfveilFiveAreaPlan.mjs:55-69`, `:111-118`.) The code descriptions are at `:17-26`.

**How they load (live).** Portal scenes are ON by default: each area is its own scene and
the far side of every border is not drawn and has no ground
(`streaming/WolfveilAreaScenes.mjs:1-10`, `:31-40`; `GameWorld3D.jsx:924-929`).
`?wholeWorld=1` (or `localStorage['game3d.wolfveilWholeWorld']='1'`) loads the whole valley
in one scene with gates decorative (`WolfveilAreaScenes.mjs:6-9`). The area loader runs in
`mode:'single'`, `preloadMeters:0`, `releaseGpuMemory:true` (`GameWorld3D.jsx:960-966`).
Walking into a gate opening calls `wolfveilGateTravel` / `wolfveilGatePush`
(`streaming/WolfveilGateTravel.mjs:61-131`) and fires `game3dPortalTravel` with
`target:'wolfveil-area'` (`GameWorld3D.jsx:976-977`); the player lands 6 m past the gate in
the new scene (`WolfveilGateTravel.mjs:22-23`). Invisible "spirit veil" walls stop crossing
anywhere else (`streaming/WolfveilAreaVeils.mjs:1-10`, `:129-139`; `GameWorld3D.jsx:1055-1059`).
Physics, server movement and saved coordinates stay in one continuous world frame
(`WolfveilAreaVeils.mjs:7-9`).

Things placed per area at scene start (live): the quarry dragon only when the scene is the
east area (`GameWorld3D.jsx:1738`), the lake storm dragon only in the area holding
local (263, 350) = north (`:1768`), the Vortex Lake only in its area (`:1145`), the Lunar and
Astral gates only in the east scene (`:1158-1159`), Wolfveil hostiles filtered to the
current area (`:1839-1840`), the artisan town only in the town scene (`:1139`).

### 1.3 Every gate between areas

Gates are not hand-placed: they are computed wherever a road, frontier trail or bridge
crosses a border (`streaming/WolfveilAreaPortalPlan.mjs:1-30`), crossings within 30 m merge
(`WolfveilFiveAreaPlan.mjs:133-185`), road crossings inside the river channel are dropped
(`WolfveilAreaPortalPlan.mjs:22-30`). Each becomes a torii gate
(`WolfveilAreaVeils.mjs:44-71`). Evaluated with node on this branch (local coordinates,
`y` = walking surface):

| Gate id | Kind | Label | Areas | x | z | y | Half opening (m) |
|---|---|---|---|---|---|---|---|
| `town_east_market_bridge` | bridge | Market Stone Bridge | town ↔ east | 122.0 | −98.0 | 17.1 | 3.9 |
| `town_east_residential_footbridge` | bridge | Residential Timber Bridge | town ↔ east | 122.0 | 35.0 | 50.3 | 2.6 |
| `town_east_outer_trail_bridge` | bridge | Outrider Rope Bridge | town ↔ east | 122.0 | 205.0 | 78.0 | 2.1 |
| `town_south_south_fields_way` | trail | Southern Fields Way Gate | town ↔ south | 8.6 | −265.0 | −2.8 | 3.5 |
| `town_west_south_residential` | trail | South Residential Gate | town ↔ west | −190.0 | −260.0 | 4.1 | 3.2 |
| `town_west_west_residential` | trail | West Residential Gate | town ↔ west | −190.0 | −111.3 | 18.7 | 3.2 |
| `town_west_west_woodland_fork` | trail | West Woodland Fork Gate | town ↔ west | −190.0 | −64.5 | 30.6 | 2.8 |
| `town_west_training_forest` | trail | Training Forest Gate | town ↔ west | −190.0 | 79.2 | 62.8 | 2.8 |
| `town_north_ridge_path` | trail | Ridge Path Gate | town ↔ north | −22.2 | 240.0 | 74.9 | 2.8 |
| `east_north_hunters_loop_east` | trail | Hunter's Loop · East Gate | east ↔ north | 343.7 | 240.0 | 94.2 | 3.1 |
| `west_north_hunters_loop_west` | trail | Hunter's Loop · Cedar Spine Gate | west ↔ north | −409.5 | 240.0 | 91.6 | 3.0 |

Eleven gates. **The south area has exactly one gate, to town**; there is no south↔west or
south↔east gate and no west↔east connection except through town or the north. Any new
trail that crosses a border creates a new gate automatically (the planner reads
`WOLFVEIL_ROUTES` + `WOLFVEIL_FRONTIER_TRAILS`, `WolfveilAreaPortalPlan.mjs:13-20`).

### 1.4 Named places, with coordinates (local; world z = +70)

**Town and its buildings.** The town the player sees is the owner's artisan plaza
(`wolfveil/WolfveilArtisanTownScene.mjs:1-30`) built by `createAXETownPlaza`
(`wolfveil/AXETownPlaza.js:15`), centred on local (0, −70) = world (0, 0), footprint
130 m × 141 m (`WolfveilImportedTownLayout.mjs:4-7`). The older procedural village buildings
in `WOLFVEIL_BUILDINGS` (`WolfveilLayout.js:76-103`: inn, forge, apothecary, clan hall,
archive, bathhouse, training hall, sanctuary hall, 18 residences) are **archived and not
drawn**: `WOLFVEIL_ACTIVE_TOWN_BUILDINGS=[]` (`:345-348`). The housing plots
(`:104-117`) are `reserved_visual_plot_only`, `buildable:false`.

| Place | World x, z (render) | Source |
|---|---|---|
| Plaza fountain basin (collider r 6.55) | 0, 0 | `AXETownPlaza.js:3016`, `WolfveilArtisanTownScene.mjs:47-51` |
| Blacksmith (shop interior) | −15.5, −15.5 (rot 45°) | `AXETownPlaza.js:1622-1626` (relative to plaza group at world 0,0) |
| Tailor Atelier | 15.5, −15.5 | `AXETownPlaza.js:2091-2095` |
| Potion Apothecary | 15.5, 15.5 | `AXETownPlaza.js:2234-2238` |
| Model Showroom (mount previews) | −15.5, 15.5 | `AXETownPlaza.js:2413-2417` |
| Residences (enterable) | ring of houses, ids `residence-N` | `AXETownPlaza.js:2656` |
| Ancient tree on the plaza | ≈ −6.6, −0.2 | `WolfveilImportedTownLayout.mjs:32-40` |
| Player spawn | −7, 8 | `WolfveilImportedTownLayout.mjs:51` |
| Quest givers Lyra / Vex / Kira / Noor / Zephyr | (−4,10) (−32,−52) (28,−45) (−32,39) (27,45) | `WolfveilImportedTownLayout.mjs:54-60` |
| Respawn checkpoints (shrines drawn at each) | see 1.4 "Respawn" below | `mapSpawnPoints.js:11-23` |

Shop stock: `wolfveil/WolfveilArtisanShopCatalog.mjs:3-40` (blacksmith, potion, tailor,
models showroom).

**Sites** (`WolfveilLayout.js:30-47`; heights from `wolfveilHeight`; area from
`wolfveilAreaAtLocal`):

| Site id | Label | Local x, z | Ground y | Area |
|---|---|---|---|---|
| `wolfveil_south_gate` | Southern Wolf Gate | 0, −225 | 0.3 | town |
| `wolfveil_market` / `wolfveil_fountain` | Wolf-Spirit Market / Fountain | 0, −70 / 0, −69 | 22.7 | town |
| `wolfveil_sanctuary` | Wolf Sanctuary | 4, 220 | 75.8 | town |
| `wolfveil_training` | Shadow Wolf Training Grounds | −165, 88 | 65.9 | town |
| `wolfveil_twin_peaks` | Split Wolf-Ear Peaks | 2, 470 | 118.9 | north |
| `wolfveil_hot_spring` | Mountain Hot Springs | −105, 330 | 89.0 | north |
| `wolfveil_snow_ridge` | Snow Ridge | 35, 680 | 125.1 | north (outside the square) |
| `wolfveil_living_perspectives_vortex` | The World Beneath the World (Vortex Lake) | 205, 320 | 77.5 | north |
| `wolfveil_high_waterfall` | Hidden Waterfall | 142, 179 | 37.5 | east |
| `wolfveil_waterfall_cave` | Secret Cave Behind Falls | 163, 155 | 68.9 | east |
| `wolfveil_quarry` | Abandoned Stone Quarry (dragon boss) | 350, −40 | 51.3 | east |
| `wolfveil_hostile_ravine` | Shadow Ravine | 340, −165 | 20.7 | east |
| `wolfveil_ruined_watch` | Ruined Watch Station | 295, −205 | 12.8 | east |
| `wolfveil_cedar_forest` | Western Cedar Forest | −320, 65 | 69.0 | west |
| `wolfveil_wolfstone_arena` | Wind-Carved Wolf Stones | −325, 235 | 84.6 | west |

**Luna palace** ("Luna Dashboard mansion", the one active Wolfveil residence): pad centred
local (0, 115), ≈ 53 m × 33 m grade box (`WolfveilLayout.js:196-199`, `:297-317`,
`WolfveilScene.js` `addWolfveilLunaPalace`), town area.

**Districts** (named, `WolfveilLayout.js:334-343`): Wolf-Spirit Market (0,−70), Cedar
Housing Terraces (−297,−136), Riverside Terraces (269,61), Sun Terraces (−285,−280),
Western Cedar Forest (−320,65), Training Courtyard (−165,88), Wolf Sanctuary (4,220),
Abandoned Quarry (350,−40).

**Water.**
- Silverrun River (map name, `wolfveil/WolfveilMapDesign.mjs:39-41`): 19 m wide, control
  points with water height from (227,360,99) in the north highlands through the waterfall
  drop between z 184 and 166 (`waterfallRange`), down the town's east edge (x≈103–123 from
  z 115 to −98), then south-east to (237,−450,−25) (`WolfveilLayout.js:122-135`). It is
  swimmable (`GameWorld3D.jsx:2072-2076`).
- Hidden Waterfall (142,179) (`WolfveilLayout.js:36`).
- Vortex Lake: centre (205,320), water y 82.6, ellipse 43 × 37 m, mountain mouth at
  (215,358) 32 m wide (`wolfveil/VortexLakeLayout.mjs:4-14`), swimmable; its portal leads
  into the Lunar Cave dungeon (`:13`, `VortexLakeScene.mjs:313`).
- Mountain Hot Springs (−105,330) (`WolfveilLayout.js:42`); a canal runs inside the town
  model (`WolfveilImportedTownLayout.mjs:41-50`).

**Bridges** (`WolfveilLayout.js:71-75`): Market Stone Bridge (63,−98)→(134,−98) 6 m stone;
Residential Timber Bridge (82,35)→(146,35) 3.3 m; Outrider Rope Bridge (87,205)→(173,205)
2.4 m. All three cross the town/east border and are gates.

**Mountains and summits** (`WolfveilLandscapeDesign.mjs:67-96`): Wolf-Ear Range (north edge,
z≈510–556), Cedar Spine (west edge, x≈−566…−640), Highfall Range (east edge,
x≈566…592), Southern Downs (south edge, z≈−600…−626); outer skyline ranges Snow Ridge, Far
Cedar Peaks, Far Highfall Peaks, Southern Far Hills. Summits: West Wolf-Ear (−84,532) y 298;
East Wolf-Ear (78,538) y 260; Cedar Crown (−566,190) y 242; Highfall Crown (580,360) y 237;
Snow Ridge (−150,812) y 473.

**Open fighting grounds** (no monster spawns; `WolfveilLandscapeDesign.mjs:202-213`):

| id | Name | Local x, z | Radius | y | Area | Purpose (code text) |
|---|---|---|---|---|---|---|
| `moonlit_commons` | Moonlit Commons | −205, −30 | 46 | 37.3 | west | "Open duel field beside town" |
| `southern_gate_fields` | Southern Gate Fields | 25, −390 | 85 | 3.0 | south | "Wide open battlefield south of the gate — group and faction fights" |
| `howling_plateau` | Howling Plateau | −240, 400 | 52 | 114.6 | north | "High mountain shelf under the Wolf-Ear peaks" |

**Mob areas** (scorched camp hollows graded into the terrain; `WolfveilLandscapeDesign.mjs:215-237`).
The three "hostile" ones are the C1 enemy zones; the ten "camp" ones are the zombie camps
(`wolfveil/WolfveilZombieCamps.mjs:8-19`, 15 zombies each); the "boss" one is the quarry dragon.

| id | Name | Local x, z | r | Levels | y | Area |
|---|---|---|---|---|---|---|
| `wolfveil_shadow_ravine` | Shadow Ravine | 340, −165 | 24 | 2–5 | 20.7 | east |
| `wolfveil_ruined_watch` | Ruined Watch (champions) | 296, −205 | 19 | 4–6 | 12.8 | east |
| `wolfveil_wolfstone_outskirts` | Wolfstone Outskirts | −325, 235 | 18 | 5–8 | 84.6 | west |
| `scarred_south` | Scarred South | 310, −260 | 24 | 3 | 8.6 | east |
| `fallen_gate` | Fallen Gate | 390, −230 | 24 | 10 | 10.6 | east |
| `quarry_dragon` | Abandoned Stone Quarry (boss) | 350, −40 | 30 | 12 | 51.3 | east |
| `red_ravine` | Red Ravine | 420, −95 | 24 | 15 | 39.7 | east |
| `east_quarry` | East Quarry | 385, 55 | 24 | 20 | 79.8 | east |
| `hidden_falls` | Hidden Falls Outskirts | 380, 175 | 24 | 25 | 98.3 | east |
| `northern_rift` | Northern Rift | 300, 285 | 24 | 30 | 84.8 | north |
| `wolfstone_reach` | Wolfstone Reach | −380, 295 | 24 | 35 | 93.3 | north |
| `western_cedar` | Western Cedar | −430, 165 | 24 | 40 | 79.6 | west |
| `bluewood` | Bluewood Hollow | −430, 5 | 24 | 45 | 55.0 | west |
| `southwest_ruins` | Southwest Ruins | −390, −190 | 24 | 50 | 16.4 | west |

**Safe zones as drawn on the HUD map** (`WolfveilMapDesign.mjs:61-65`, world z):
town (0,0) r 150; Training Grounds (−165,158) r 65; Wolf Sanctuary (4,290) r 50. The same
three circles are the "safe" zone names in `wolfveilLandscapeZoneAt`
(`WolfveilLandscapeDesign.mjs:600-616`). Whether combat is actually blocked inside them is
in section 6.

**Roads and trails.** Town routes (`WolfveilLayout.js:48-70`): `public_gate_market_sanctuary`
(primary, 6 m: south gate → market → sanctuary), `west_residential`, `south_residential`,
`riverside_loop`, `river_housing_loop`, `west_woodland_fork` (→ Wolf Stones),
`training_forest`, `quarry_approach`, `ridge_path` (sanctuary → hot springs → peaks → Snow
Ridge), `waterfall_cave`. Frontier trails (`WolfveilLandscapeDesign.mjs:239-257`): Hunter's
Loop East / Highlands / Cedar Spine (one loop visiting every camp in level order, Lv 3 in
the south-east to Lv 50 in the south-west), Southern Fields Way (south gate → fields),
Commons Spur. Cave access paths (`wolfveil/WolfveilCaveAccessPlan.mjs:7-32`) run from
trail junctions to the four cave mouths.

**Respawn points and shrines (live).** Nine checkpoints, all on or beside the town plaza,
in **world** coordinates (`mapSpawnPoints.js:11-23`): Town Plaza (−12,12, default), North
Ridge (6,−22), Forest Edge (58,−10), Old Ruins (−26,18), Town East (16,8), Town West (−30,8),
Ridge Approach (−12,−56), Forest Path (44,−16), Ruins Approach (−32,26). A small glowing
shrine is drawn at each one that has clear ground (`death/WorldRespawnShrines.js:1-60`,
mounted at `GameWorld3D.jsx:2183-2184`). **There is no respawn point outside the town.**
The names ("North Ridge", "Old Ruins") are left over from an older map and do not match
places on Wolfveil.

**Cave mouths, dungeon gates and portals** (detail in section 2):

| Entrance | Local x, z | y | Area | Leads to | Source |
|---|---|---|---|---|---|
| Jade Lantern Grotto mouth | −360, −400 | 14.9 | west | `wolfveil-caves` region | `wolfveil/WolfveilCaveLayout.mjs:21-33`, `WolfveilDungeonPortals.js:21-25` |
| Whispering Root Hollow mouth | −500, 300 | 140.8 | north | `wolfveil-caves` | `WolfveilCaveLayout.mjs:34-46` |
| Sunken Inkstone Cistern mouth | −40, 548 | 191.6 | north | `wolfveil-caves` | `WolfveilCaveLayout.mjs:47-58` |
| Echoing Crystal Vault mouth | 500, −36 | 98.9 | east | `wolfveil-caves` | `WolfveilCaveLayout.mjs:59-70` |
| Lunar mountain gate | world 171, 222 (local 171,152); approach world (165,208) | — | east | `lunar-cave` region | `dungeons/LunarCaveLayout.mjs:4-10` |
| Astral mountain gate | world 197, 224 (local 197,154); approach world (197,207) | — | east | `astral-dungeon` region | `dungeons/AstralDungeonLayout.mjs:6-8` |
| Vortex Lake portal | lake mouth local (215,358) | — | north | `lunar-cave` | `wolfveil/VortexLakeLayout.mjs:9-13` |

Five more points are protected in the terrain as "cave mouths" / "cave hub exit":
(−216,76), (−312,148), (−82,312), (122,198), (−138,196)
(`WolfveilLandscapeDesign.mjs:265-266`, `WolfveilLayout.js:283-285`). No current cave uses
them (**unconfirmed** legacy; treat them as protected anyway). The Ashroot Hollow "book
cave" mouth is local (252,58) (`cave/caveLayout.js:37-38`), but that cave is not built (2.5).

### 1.5 One table per area

**Town (Wolfveil Town, centre; x −190…122, z −265…240).** Gates: 3 bridges east, 4 trails
west, 1 south, 1 north.

| Contents | Where (local) |
|---|---|
| Artisan town plaza, 4 shops, enterable homes, fountain, ancient tree | (0,−70) ±65 m |
| Player spawn, 5 quest givers, 9 respawn shrines | around (0,−70) |
| Southern Wolf Gate (arrival) | (0,−225) |
| Luna palace | (0,115) |
| Shadow Wolf Training Grounds (safe) | (−165,88) |
| Wolf Sanctuary (safe) | (4,220) |
| River along the east edge, west banks of the 3 bridges | x≈100–122 |
| No hostile spawns (spawns refused within 100 m of market, 60 m of south gate, 50 m of sanctuary, 65 m of training) | `WolfveilEnemySpawns.mjs:45-53` |

**South (Southern Gate Fields; x −190…122, z < −265).** One gate (town).

| Contents | Where |
|---|---|
| Southern Gate Fields fighting ground, r 85 m, nearly flat (y≈3) | (25,−390) |
| Southern Fields Way ends at (16,−300) | `WolfveilLandscapeDesign.mjs:253-254` |
| Southern Downs range along the south edge | z≈−600 |
| No monsters, no caves, no NPCs | — |

**West (Western Cedar Wilds; x < −190, z < 240).** Gates: 4 to town; 1 to north.

| Contents | Where |
|---|---|
| Moonlit Commons duel field | (−205,−30) r 46 |
| Western Cedar Forest | (−320,65) |
| Wind-Carved Wolf Stones + Wolfstone Outskirts (C1 hostiles Lv 5–8) | (−325,235) |
| Zombie camps Western Cedar 40, Bluewood Hollow 45, Southwest Ruins 50 | (−430,165), (−430,5), (−390,−190) |
| Jade Lantern Grotto cave mouth | (−360,−400) |
| Cedar and Sun housing terraces (visual plots only) | (−297,−136), (−285,−280) |
| Cedar Spine range on the west edge | x≈−570 |

**East (Eastern Riverlands; x > 122, z < 240).** Gates: 3 bridges to town; 1 to north.

| Contents | Where |
|---|---|
| River and its south-east outlet | x 122–240 |
| Hidden Waterfall, Secret Cave Behind Falls | (142,179), (163,155) |
| Lunar gate, Astral gate | (171,152), (197,154) |
| Abandoned Stone Quarry + quarry dragon boss Lv 12 | (350,−40) |
| Shadow Ravine (C1 Lv 2–5), Ruined Watch (C1 champions Lv 4–6) | (340,−165), (296,−205) |
| Zombie camps Scarred South 3, Fallen Gate 10, Red Ravine 15, East Quarry 20, Hidden Falls 25 | see table above |
| Echoing Crystal Vault cave mouth | (500,−36) |
| Riverside Terraces (visual plots) | (269,61) |
| Highfall Range on the east edge | x≈570 |

**North (Northern Highlands; z > 240).** Gates: 1 to town (Ridge Path), 1 to east, 1 to west.

| Contents | Where |
|---|---|
| Mountain Hot Springs | (−105,330) |
| Howling Plateau fighting ground | (−240,400) r 52 |
| Vortex Lake (portal to Lunar Cave) + lake storm dragon | (205,320); dragon at (263,350) |
| Zombie camps Northern Rift 30, Wolfstone Reach 35 | (300,285), (−380,295) |
| Whispering Root Hollow and Sunken Inkstone Cistern cave mouths | (−500,300), (−40,548) |
| Split Wolf-Ear peaks, Wolf-Ear Range | z≈470–556 |
| Snow Ridge (outside the square, skyline) | (35,680) |

### 1.6 Sketch map (local coordinates, north up, not to scale)

```
                                   N (+Z)
                                     ^
 x=-550               x=-190                       x=122                        x=550
z=550 +--------------------------------------------------------------------------+
      |  W.Wolf-Ear(-84,532)  Inkstone Cistern cave(-40,548)  E.Wolf-Ear(78,538)  |
      |                      NORTH: Northern Highlands                           |
      | Root Hollow cave      Howling Plateau      Hot Springs     Vortex Lake    |
      |   (-500,300)          [FIGHT](-240,400)    (-105,330)      (205,320)~~    |
      | Wolfstone Reach Z35 (-380,295)                    Northern Rift Z30 (300,285)
z=240 +----G(-409.5,240)-------+------G(-22,240)--------+--------G(343.7,240)-----+
      | WEST: Cedar Wilds      | TOWN                    ~ EAST: Riverlands        |
      | Wolf Stones C1 5-8     | Sanctuary(4,220)  ~~~~~~G Rope bridge(122,205)    |
      |   (-325,235)           |                   river ~ Waterfall(142,179)      |
      | W.Cedar Z40(-430,165)  | Luna palace(0,115)      ~ Lunar(171,152) Astral(197,154)
      | Cedar Forest(-320,65)  G(-190,79) Training(-165,88)  Hidden Falls Z25(380,175)
      |                        |                    ~~~~~G Timber bridge(122,35)    |
      | Bluewood Z45(-430,5)   G(-190,-64)                  East Quarry Z20(385,55) |
      | Moonlit Commons[FIGHT] |  PLAZA/SPAWN(0,-70) ~~~~G Market bridge(122,-98) |
      |   (-205,-30)           G(-190,-111)         ~      Quarry DRAGON(350,-40)  |
      |                        |                     ~     Crystal Vault(500,-36)  |
      | SW Ruins Z50(-390,-190)|                      ~    Red Ravine Z15(420,-95) |
      |                        | S.Wolf Gate(0,-225)   ~   Shadow Ravine C1 2-5    |
      |                        G(-190,-260)              ~ Ruined Watch C1 4-6     |
z=-265|                        +---G(8.6,-265)--------+  ~ Fallen Gate Z10 Scarred South Z3
      | Jade Grotto cave       | SOUTH: Gate Fields    |   ~ (river to SE outlet)  |
      |   (-360,-400)          | [FIGHT](25,-390) r85  |                           |
z=-550+--------------------------------------------------------------------------+
   G = gate between areas   ~ = Silverrun River   Z## = zombie camp level   C1 = C1 hostiles
```

### 1.7 Open land for new adventure spots

Found by a node script that sampled `wolfveilHeight` every 20 m and kept circles that are
at least 25 m from every site, building, housing plot, fighting ground, mob area/zombie
camp (+35 m), cave mouth (40 m), the palace, the dungeon gates and the Vortex Lake; 40 m
from the river; 12 m from every road and frontier trail; 15 m from area borders; and below
mountainness 0.25 (`wolfveilMountainness`, `WolfveilLandscapeDesign.mjs:485-487`).
"Slope" is the steepest of nine samples inside 60 % of the radius, in degrees. Ranked by size.

| Area | Centre (local x, z) | Free radius | Ground y | Max slope | Nearest existing things |
|---|---|---|---|---|---|
| east | 350, −410 | 80 m | 10 | 12° | Scarred South camp 96 m |
| north | 30, 330 | 70 m | 84 | 14° | Wolf Sanctuary 68 m (just north of the Ridge Path gate) |
| west | −270, −430 | 55 m | 12 | 14° | Jade Lantern Grotto 55 m, Sun Terraces |
| west | −450, −450 | 50 m | 20 | 15° | Jade Lantern Grotto 63 m (far south-west corner) |
| town | −110, 170 | 50 m | 78 | 8° | Training Grounds 54 m, Luna palace 63 m |
| south | −130, −350 | 45 m | 3 | 7° | Southern Gate Fields 50 m |
| south | −130, −450 | 45 m | −2 | 11° | Southern Gate Fields 56 m |
| west | −250, 130 | 45 m | 82 | 20° | Training Grounds 50 m, Cedar Forest 51 m |
| west | −330, −30 | 45 m | 43 | 24° | Bluewood Hollow 47 m, Cedar Terraces 50 m |
| east | 270, 170 | 40 m | 99 | 17° | Northern Rift 38 m, Astral gate 45 m |
| east | 170, −470 | 30 m | 4 | 6° | south of the river outlet bend, near the south border |
| north | −250, 290 | 30 m | 86 | 13° | Howling Plateau 33 m, Wolfstone Outskirts 40 m |
| town | 70, −210 | 25 m | 4 | 4° | Southern Wolf Gate 27 m |
| town | 70, 190 | 25 m | 75 | 6° | Sanctuary 27 m, waterfall 28 m |
| west | −230, −150 | 25 m | 12 | 11° | Cedar Terraces plots 24 m |

Steeper but large spots (≥ 30°, good for cliffs or hollows): north (410,370) r 50,
north (−370,390) r 35, east (470,−350…−410) r 30.

The south area is almost all flat (y −2…4) and empty apart from the fighting ground; the
east area south of z −300 is the largest empty lowland. Everything nearer than ~50 m to
the area borders is a poor site because the veil walls and the per-area clipping run there
(`WolfveilAreaVeils.mjs:28-39`, `GameWorld3D.jsx:1010-1025`).

---

## 2. Underground and separate places

All of these are separate **regions** (separate scenes loaded through `game3dPortalTravel`),
except the Vortex Lake landmark which sits in the north area.

### 2.1 The four Wolfveil caves (`wolfveil-caves` region): live

- **Entry.** On the surface the cave interiors are not built: `GameWorld3D.jsx:931` passes
  `loadCaves:false`, so `enableCaves` is false (`wolfveil/WolfveilScene.js:85`) and the
  village reports `caves:'entrances_visual_interior_unbuilt'` (`WolfveilScene.js` ≈ line
  361). Instead a glowing ring portal stands 2.2 m above each mouth in the area that holds
  it (`wolfveil/WolfveilDungeonPortals.js:21-25`); walking within 3.25 m of it travels to
  region `wolfveil-caves` (`:46-55`; created at `GameWorld3D.jsx:1155-1156`). This changed
  on 2026-11-18 (`git log -S loadCaves:false`: 56130b67 "Apply portal-streamed cave
  changes on latest main").
- **Inside.** `createWolfveilCaveDestination` (`WolfveilScene.js:51-75`) builds the whole
  network: the four caves, the hub and the corridors (`createWolfveilCaveSystem`), and the
  cave watch guards in `'inside'` mode. The player arrives at world (−6, −7.9, 94) or
  (−6, 124) when sent to the gate (`GameWorld3D.jsx:2260-2263`). One return ring at world
  (−6, −5.8, 132) sends the player back to Wolfveil (`WolfveilDungeonPortals.js:26`, `:53-55`).
- **Layout** (`wolfveil/WolfveilCaveLayout.mjs`): four caves, each a mouth, a stair hall and
  a chamber 15–16.5 m radius with 8.4–8.8 m ceilings (`:21-71`, `:80-119`); a central
  "Subterranean Wolf-Spirit Rotunda" at local (−6, y −8, 24), radius 46 m (`:123-134`);
  five buried tunnels (Grotto↔Roots, Grotto↔Rotunda, Roots↔Rotunda, Rotunda↔Cistern,
  Rotunda↔Crystal) 3.5–3.7 m half width (`:302-334`); two side alcoves (`:337-338`); plus
  the owner's modular canyon/vault/treasure room kit (`WolfveilModularCaveKit.mjs`,
  `:339-342`). Floor level −8 m (`:75`).
- **Story text** (`wolfveil/WolfveilCaveNarrative.mjs:10-60+`): four "unfinished sumi-e
  painting" floors in order Jade Grotto (Ink Hare Lv 6, boss The Painted Stag Lv 10), Root
  Hollow (Root Ember 12, The Root Pyre 16), Inkstone Cistern (Ink Koi 18, The Drowned Ink
  24), Crystal Vault ("Floor of the Last Brush"). The module says "Nothing here grants loot,
  silver, or experience" (`:7-8`). It is used only to paint murals and light flames when a
  floor is "awake" (`WolfveilCaveSystem.js:827-874`).
- **Enemies.** None of the narrative mobs or bosses are spawned: the cave system reports
  `bossGameplayImplemented:false` and `treasureChestsDecorativeOnly:true`
  (`WolfveilCaveSystem.js:1192`). The enemy list for this region falls through to the
  legacy `ENEMY_SPAWNS` (22 enemies around old AXE arena coordinates such as (40,−150),
  (−560,−250), (620,−520)) because `GameWorld3D.jsx:1836-1840` only special-cases
  lunar/astral/wolfveil (`enemySpawnConfig.jsx:8-13`). Whether those 22 land anywhere
  walkable in the cave scene is **unconfirmed**.
- **NPCs.** Captain Arlen (quest giver `wolfveil_jade_watch_captain`, quest
  `q_wolfveil_jade_watch_side`) stands **outside** the Jade Grotto mouth and a silent Tunnel
  Sentry inside (`wolfveil/WolfveilCaveWatchPlan.mjs:7-43`). The destination builds the
  watch with `mode:'inside'` (`WolfveilScene.js:64`), which shows only the sentry
  (`WolfveilCaveWatch.mjs:56`); the surface builds no watch because `caveSystem` is null.
  So **Captain Arlen is not shown anywhere today** (inferred from those two lines;
  unconfirmed in a running game).
- **Loot.** None (decorative chests only).
- **HUD.** An underground map panel exists (`hud/WolfveilUndergroundMapPanel.jsx`,
  `hud/undergroundMapModel.mjs`, `hud/wolfveilUndergroundDiscovery.mjs`).

### 2.2 Lunar Cave (`lunar-cave` region): live

- **Entry.** The Lunar mountain gate in the east area at world (171, 222), walk through
  its portal plane (`dungeons/LunarCaveLayout.mjs:4-10`, `dungeons/LunarCaveScene.js:255-305`,
  `GameWorld3D.jsx:1158`, `:3529`); or the Vortex Lake portal in the north
  (`VortexLakeScene.mjs:313`). Return portal at the water end (−26, 624), plane z 649
  (`LunarCaveLayout.mjs:22`); the player comes back to the gate approach or the lake's safe
  return (`GameWorld3D.jsx:2251-2257`).
- **Inside.** Five round halls, radius 40 m, joined by 20 m-wide passages
  (`LunarCaveLayout.mjs:11-21`): Moonstone Threshold (0,80) Lv 1, Echoing Gallery (38,190)
  Lv 5, Shadowed Vault (−36,300) Lv 9, Runebound Hollow (32,410) Lv 13, Eclipse Sanctuary
  (−26,520) Lv 17. Overall z −35…675 (`:76`), map bounds x ±390 (`hud/worldMapData.js:24`).
- **Enemies.** 5 per hall = 25, level = hall level + 0..2, `dungeonTrainingSpawn:true`
  (`LunarCaveLayout.mjs:56-73`), using the shared legacy creature model (see section 4).
- **Loot.** One treasure cache per hall; "Visual discovery does NOT grant Silver/items/XP;
  trusted server completion and chest settlement are required" (`LunarCaveLayout.mjs:24-31`;
  inspected at `GameWorld3D.jsx:2641`).
- **Extras.** A "vortex echo" light trail inside the cave is decoration only
  (`dungeons/VortexDungeonEcho.mjs:1-3`). Minimap: `hud/LunarCaveMinimap.jsx`.

### 2.3 Astral dungeon "Moonfall Expanse" (`astral-dungeon` region): live

- **Entry.** The Astral mountain gate in the east area at world (197, 224)
  (`dungeons/AstralDungeonLayout.mjs:6-8`, `GameWorld3D.jsx:1159`, `:3531-3532`). Return
  portal at (0, −14) (`:50`).
- **Inside.** Four "spine" pads of radius 26 m (Lunar Arrival (0,0) Lv 45, Starfall Crossing
  (22,84) Lv 52, Astral Observatory (−17,168) Lv 60, Eclipse Sanctum (15,252) Lv 70) and
  eight flank pads 78 m to each side (Lv +1, 3 monsters each), joined by 11 m-wide bridges
  (`:9-49`). Map bounds x ±200, z −60…340 (`hud/worldMapData.js:25`).
- **Enemies.** 6/7/8/9 on the spine pads + 3 per flank pad = 54; the last one on each pad is
  `elite` (`AstralDungeonLayout.mjs:62-76`).
- **Loot.** `ASTRAL_LOOT_PROFILE`: levels 45–75, Rare/Epic/Legendary,
  `rewardAuthority:'server-required'` (`:77-81`). Which server function settles it is
  **unconfirmed**.

### 2.4 The Vortex Lake: live landmark in the north area

Lake, mountain mouth and portal (`wolfveil/VortexLakeLayout.mjs:4-14`,
`wolfveil/VortexLakeScene.mjs`, created at `GameWorld3D.jsx:1145-1154`). Its portal sends
the player to the Lunar Cave (`VortexLakeScene.mjs:313`). A second instance of the quarry
dragon GLB, "Dragon of Living Perspectives", guards the eastern rim at local (263, 350)
(`GameWorld3D.jsx:1765-1794`).

### 2.5 Other separate places

| Place | State | Evidence |
|---|---|---|
| Ashroot Hollow "book cave" (`cave/`), mouth local (252,58), hall + hub + farm spots | **paused**: only built when `enableCaves` is true, which Game 3D never sets; not part of the cave destination either | `cave/caveInterior.js:1-20`, `cave/caveLayout.js:37-38`, `WolfveilScene.js` (`bookCave=enableCaves?…:null`), `WolfveilScene.js:51-75` |
| AXE dungeons "Stone Vein Caverns" (4 rooms incl. "SOS Vault") and "Sealed Sanctum" (3 rooms), bosses Cavern Warden and Sealed Guardian | **paused / data only**: rooms placed at x≈6,000–6,446, z −6,000, "temporary browser-Game3D blockout coordinates"; a boss-spawn hook `window.__gw3dSpawnAXEDungeonBoss` exists but nothing in `src/` calls it; Services are disabled while a dungeon session is active | `axe/dungeons/AXEDungeonSystem.js:1-3`, `:39-176`; `GameWorld3D.jsx:1795-1830`; `axe/services/useAXEServiceMode.js:19` |
| Natural zones prototype (`wolfveil/zones/`): the Jade Lantern Grotto as two isolated zones behind authored doorways | **flag**, OFF by default: `?naturalZones=1` or `localStorage['game3d.naturalZones']='1'` | `wolfveil/zones/WolfveilNaturalZoneFlag.mjs:1-31`, `zones/WolfveilGrottoZonePlan.mjs:1-14`, `GameWorld3D.jsx:1032-1050` |
| Suigen world variant (another map skin with its own caves, `suigenActive`) | present, switched by a world-variant setting (**unconfirmed** which) | `GameWorld3D.jsx:878-895`, `:3473` |
| Legacy "First Territory" forest test world (`region` other than wolfveil) | selectable, 36.5 m arena radius | `GameWorld3D.jsx:910-912`, `:2577`; `hud/worldMapData.js:21` |

---

## 3. Terrain

### 3.1 One analytic height function feeds everything

Ground height is a pure function, `wolfveilHeight(x, z)` (local), in
`wolfveil/WolfveilLayout.js:323-327`. It is a chain of grades, each a plain function of
x/z, applied in this order:

1. `wolfveilValleyHeight` (`WolfveilLayout.js:219-236`): the 80 m south-to-north rise,
   plaza undulation, side hills, far-north rise, cliff bands, the western hillside
   (`WolfveilWestHillside.mjs`) and fine undulation (`:192-203`).
2. `gradeWolfveilLandscapeFeatures` (`WolfveilLandscapeDesign.mjs:450-468`): mountain ranges
   (masked off protected sites, the river corridor and every trail, `:259-320`), then
   levelled fighting grounds and sunken mob-camp hollows with a rubble rim open toward the
   trail (`:420-449`).
3. Riverbank channel (`WolfveilRiverBanks.mjs`), Lunar cave approach (`WolfveilLayout.js:206-215`),
   Vortex Lake basin (`VortexLakeLayout.mjs:25+`), flattened discs at market, south gate and
   sanctuary (`WolfveilLayout.js:270-278`), all inside `wolfveilSculptedHeight` (`:248-280`).
4. Road beds: trails are cut and filled to a level tread except near listed sites
   (`wolfveilNaturalHeight`, `:281-293`; `WolfveilLandscapeDesign.mjs:365+`).
5. Palace rear mountain and palace pad (`:302-317`), bridge-bank grades (`:321-322`),
   the artisan town plateau (`WolfveilImportedTownLayout.mjs:69-80`), and last the cave
   approach benches installed by the cave access plan (`WolfveilLayout.js:328-333`,
   `WolfveilCaveAccessPlan.mjs:5`).

The same function is read by: the terrain mesh (`wolfveil/WolfveilGeometry.js:127-135`,
1,100 m, 310 segments), its raycast BVH, planting and rock placement, the HUD map renders,
the portal heights (`streaming/WolfveilAreaPortalPlan.mjs:36-53`), and the private duel
worker's map (`server/game3d/mapCollision.mjs:5`, `:114`, `:155`).

**Protected sites** whose height must never move are listed twice:
`PROTECTED_SITES` (`WolfveilLandscapeDesign.mjs:259-273`) masks mountains and camps off
them, and `ROAD_BED_EXCLUDED` (`WolfveilLayout.js:283-285`) keeps road grading off them.

### 3.2 Ground materials

- Vertex colours from `wolfveilLandscapeSurface` (`WolfveilLandscapeDesign.mjs:502-588`):
  meadow, riverbank, trail shoulders, fighting-ground turf ring, scorched camp ground, scree,
  rock, strata, snow above y≈232. It also returns grass/dirt/rock/snow weights.
- Those weights become per-vertex splat weights (`WolfveilGeometry.js:159-160`) for the
  baked-texture terrain material `createWolfveilTerrainSplatMaterial`
  (`WolfveilTerrainSplat.js`, used in `WolfveilScene.js` ≈ lines 129-139), which also
  samples **macro maps baked from the height function** (`WolfveilTerrainMacro.mjs:15-22`,
  files in `public/game3d/landscape/`).
- Paved roads (granite setts on the main road, herringbone brick lanes) and trail
  surfaces are decorative drapes, no raycast, no collider
  (`tests/game3d-clone-wolfveil-landscape-bakes.test.mjs:202-240`).

### 3.3 Water, rocks, plants

- River: control points with water height (`WolfveilLayout.js:122-135`), flow-mapped
  surface (`WolfveilSilverRiverFlow.mjs`, `WolfveilSilverRiverMaterial.js`); deep water uses
  the river's and the lake's own surfaces for swimming (`GameWorld3D.jsx:2072-2076`).
- Rocks: one baked field from `wv_rocks.glb`, six sculpt-baked variants × three LODs sharing
  one atlas (`WolfveilBakedRocks.js`; test `landscape-bakes.test.mjs:105-180`); range
  outcrops on steep flanks (`WolfveilRangeOutcrops.mjs`).
- Plants: high-poly plants baked into one card atlas (`wv_plants.json`), three crossed
  quads per card (`WolfveilPlantCards.js`; test `:294-351`); trees from
  `WolfveilForestLayout.js` / `WolfveilNature.js`; streamed near grass
  (`WolfveilNearGrassStream.js`) and meadow beyond the edge.
- Wayfinding markers (field rings, Hunter's Loop cairns, camp gateways) are decorative,
  no colliders (`WolfveilScene.js`, `buildWolfveilLandscapeMarkers`).

### 3.4 Collision

- **Client feet**: downward raycasts against `groundMeshes` (`GameWorld3D.jsx:856`, filled
  at `:946`, `:1135-1164`): the visible terrain area mesh plus every registered walkable
  surface (bridge decks, house floors, stairs, the town's own floor at `:891-894`).
- **Client walls**: the palace shell, town building navigation
  (`WolfveilTownInteriorNavigation.mjs`), trunk circles (`WolfveilTrunkColliders.mjs`),
  the plaza fountain, dungeon `resolveCollision` calls (`GameWorld3D.jsx:3415-3418`),
  and the invisible area veils (`:1055-1059`).
- **Private duel worker**: `server/game3d/mapCollision.mjs` rebuilds obstacles from the same
  layout and fingerprints the source text of the height functions, river, palace and
  bridges (`:108-130`). Its header says the client's GLB interiors, stairs, bridges and
  props are not represented and "Never enable this for ranked play" (`:1-4`).

### 3.5 What breaks, or must be re-baked, after a height change

| Pinned thing | Where | What to do |
|---|---|---|
| Exact heights of 24 anchors (market, south gate, sanctuary, palace, training, the five protected "cave" points, hot spring, lake, waterfall, waterfall cave, Lunar and Astral gates, both ends of all three bridges, spawn) to 0.001 m | `tests/game3d-clone-wolfveil-landscape-design.test.mjs:29-40` | keep the change away from them, or update with a reason |
| Terrain macro maps checksum = `wolfveilHeight` | `tests/game3d-clone-wolfveil-landscape-bakes.test.mjs:33-48` | re-run `node scripts/bake-wolfveil-terrain-macro.mjs` |
| Camp spawns on walkable ground (≤ 1.8 m rise per metre) | `landscape-design.test.mjs:59-69`; runtime check `WolfveilEnemySpawns.mjs:83-92` | keep slopes under that |
| Open fighting grounds level and far from mob areas | `landscape-design.test.mjs:100-116` | — |
| Ranges continuous, no hidden cliffs | `landscape-design.test.mjs:193+` | — |
| Rocks rest on the lowest ground under them; outcrops clear of trails, river, encounter sites | `landscape-bakes.test.mjs:132-158` | — |
| HUD world map underlay image (rendered from the height + surface functions) | `WolfveilMapDesign.mjs:19-26`, `scripts/render-wolfveil-map.mjs` | re-render the underlay |
| Duel worker map fingerprint (any change to the height source text changes it and invalidates stored duel map checkpoints) | `server/game3d/mapCollision.mjs:108-130` | expected; say so in the PR |
| Gate heights and positions (computed from trails crossing borders) | `streaming/WolfveilAreaPortalPlan.mjs:28-53`; tests `game3d-wolfveil-area-gates.test.mjs`, `game3d-wolfveil-gate-travel.test.mjs`, `game3d-clone-wolfveil-five-area-loading.test.mjs` | re-run those tests |
| Cave mouths and chambers take their floor from the height at the mouth | `WolfveilCaveLayout.mjs:85-99`; tests `game3d-clone-wolfveil-sumi-caves*.test.mjs` | re-run |

### 3.6 How to add landform features (current pattern)

All landforms are entries in authored data that the grade functions already loop over;
nothing is painted by hand.

- **Flattened camp site / hollow**: add an entry to `WOLFVEIL_MOB_AREAS`
  (`WolfveilLandscapeDesign.mjs:222-237`; `shape:'ravine'` gives a long sunk ravine,
  `'quarry'` a pit). This carves a level floor and a rubble rim, scorches the ground, stops
  tall grass, cuts a notch in any range (`:315-318`), shows on the minimap and world map
  (`WolfveilMapDesign.mjs:56-60`) and names the zone on the HUD (`:601-606`). But the test
  at `landscape-design.test.mjs:42-58` requires every mob area to match an entry in
  `WOLFVEIL_HOSTILE_ZONES` or `WOLFVEIL_ZOMBIE_CAMPS` (or the quarry boss), so a new hollow
  needs a spawn-table entry too, or the test must change.
- **Open level field**: add to `WOLFVEIL_FIGHTING_GROUNDS` (`:206-213`).
- **Hill or mountain**: add a range spine (`[x, z, crest lift, half width]`) to
  `WOLFVEIL_MOUNTAIN_RANGES` (`:67-86`); it is masked off protected sites, the river and
  trails automatically. There is no single-hill helper.
- **Cliff**: no cliff primitive exists. Steep faces come from range flanks and camp rims;
  the surface turns to bare rock where slope exceeds about 0.55–1.15 (`:560-583`).
- **Cave mouth**: add to `RAW_ENTRANCES` (`WolfveilCaveLayout.mjs:21-71`) plus an access
  trail in `WOLFVEIL_CAVE_ACCESS_TRAILS` (`WolfveilCaveAccessPlan.mjs:7-32`; it throws if
  one is missing). The surface heightfield is never cut: the mouth moves the player into
  the separate cave scene (`WolfveilCaveLayout.mjs:345-349`, `WolfveilGeometry.js:207-209`).
- **New trail**: add to `WOLFVEIL_FRONTIER_TRAILS` (`:245-257`): graded road bed, textured
  surface, map line, and **a new gate wherever it crosses an area border**.
- Then add the spot to `PROTECTED_SITES` if later edits must not move it, re-bake the macro
  maps, re-render the map underlay, and update the anchor table if needed.

### 3.7 How the area loader treats objects you add

(`wolfveil/streaming/WolfveilAreaLoader.mjs`)

- It scans `world.group.children` (the Wolfveil group) down to depth 3 (`:447-450`,
  `:389-442`). Objects added straight to `scene` are not managed by it (in portal-scene play
  only the current area's scene exists anyway, so place them per area as the dragons are).
- An object whose whole footprint lies inside one area is drawn only while that area is
  loaded (`:1-12`; `wolfveilAreaOfRect`, `WolfveilFiveAreaPlan.mjs:73-79`). Anything
  straddling a border stays loaded ("spans several areas", `:445`). Tall slender objects
  of 40 m or more stay on the skyline (`:86`, `:407-415`).
- Never managed: names matching `/^(WV_Area_|WV_Stream_|WV_Portal_)|Terrain|Cave/i`,
  grass, meadow and bird names, `userData.isTerrain`, `userData.wolfveilAreaShared`,
  `userData.wolfveilAreaClone`, lights, cameras, and whatever the caller's `exclude` returns
  (`:26-28`, `:142-150`).
- Instanced scenery is split into one batch per area once it has been static for
  `settleSeconds` (`:84`, `:258-264`, `:347`). Skinned meshes count as actors (`:163`).
- In portal-scene play the area clipper also cuts any mesh under the Wolfveil group, the
  streamed meadow and the Suigen tree set at the border, including while it streams in
  (`GameWorld3D.jsx:1014-1025`, `streaming/WolfveilAreaClip.mjs:1-16`); the gates' root and
  the floor group are excluded. A new mesh that crosses a border is cut off at the line.
- Visibility is "virtual": the loader wraps `object.visible`, so an owner's own hide/show
  is kept (`WolfveilAreaLoader.mjs:30-55`).

### 3.8 What a new area, or a new interior scene, needs today

**A sixth surface area** is not a data change. `WOLFVEIL_AREAS`, the four border constants,
`wolfveilAreaAtLocal` and `wolfveilAreaRect` are written for five rectangles
(`WolfveilFiveAreaPlan.mjs:13-65`), as are the veil lines (`WolfveilAreaVeils.mjs:28-39`),
the area colours (`:22-26`), the `WOLFVEIL_AREA_IDS` check in `src/pages/GameView.jsx:282-286`
and the terrain area stream (`WolfveilTerrainAreaStream.mjs`). It belongs to the Wolfveil
doorways session.

**A new interior / dungeon scene** follows the Lunar Cave and Astral pattern:

1. A layout module with a region id string, entrance (world x/z, approach, portal plane),
   rooms, spawns and a return portal (`dungeons/LunarCaveLayout.mjs`,
   `dungeons/AstralDungeonLayout.mjs`).
2. A scene builder returning ground, `isWalkable`, `resolveCollision`, `update`, `dispose`
   (`dungeons/LunarCaveScene.js`, `AstralDungeonScene.js`), and an entrance-gate builder
   placed only in the surface area that holds it (`GameWorld3D.jsx:1158-1159`).
3. In `GameWorld3D.jsx`: create the scene for the region (`:1131-1133`), add it to the
   tone-mapping, walkability, arena-radius and collision branches (`:633`, `:2577-2581`,
   `:3415-3418`), choose its spawn list (`:1836-1840`), dispatch `game3dPortalTravel` from
   its gate (`:3529-3532`), and add a return path (`:2251-2263`).
4. In `src/pages/GameView.jsx:286`: add the region id to the allowed `target` list, and a
   `returnToGate` branch (`:337-340`).
5. HUD bounds and markers in `hud/worldMapData.js:21-55`.

Every area change and every region change remounts `GameWorld3D` with a new React key
(`src/pages/GameView.jsx:661`): a loading screen and a fresh scene each time.

---

## 4. Enemies and monsters

### 4.1 Enemy types in the game today

| Type | Where used | Model file | Triangles | Animations | Level / tier | Rewards on kill | State |
|---|---|---|---|---|---|---|---|
| **C1 hostile** (owner's Admin Model3D "C1", an Erika Archer FBX) | 3 Wolfveil hostile zones, 10 spawns (`wolfveil/WolfveilEnemySpawns.mjs:14-33`) | remote `…/3f915913a_ErikaArcher.fbx` (`wolfveil/WolfveilEnemyAssets.mjs:5-21`) | **unconfirmed** (remote file, not in the repo) | idle, run, attack (kick), death, hit (actually a block clip), dodge; patrol = slowed copy of run (`WolfveilEnemyAssets.mjs:22-62`) | zone levels 2–5 / 4–6 champion / 5–8 | **none**: `xpReward:0` (`GameWorld3D.jsx:1937`), no gold, no quest credit, no peer kill broadcast (`:5122-5137`); comment: "NOT a server-owned enemy seed yet" | live |
| **Zombie** (owner's "Vampire A Lusth" Mixamo zombie) | 10 camps × 15 = 150 planned, at most 30 rigged at once, streamed within 115 m, released at 158 m (`wolfveil/WolfveilZombieHordeRuntime.js:1-18`, `WolfveilZombieCamps.mjs:6-19`) | remote `…Vampire_A_Lusth_Zombie_Attack.fbx` (mesh + skeleton) + 6 clip FBX (`wolfveil/WolfveilZombieOwnerAssets.mjs:1-18`) | **unconfirmed** | idle, idle variant, run, attack, dying, death | camp level 3…50, tier always `normal` (`WolfveilZombieHordeRuntime.js:117-121`); attack level rises with the player up to camp+8 (`WolfveilZombieCamps.mjs:25-30`) | **XP only** `round(4+2.75n+0.045n²)` (`WolfveilZombieCamps.mjs:21-24`); no gold, no quest credit (`GameWorld3D.jsx:5128-5137`) | live |
| **Legacy creature** ("Survivor A Lusth" + mutant clip set) | Lunar Cave and Astral spawns, quest-spawned enemies, the legacy `ENEMY_SPAWNS` | remote `…3e8b3e64d_SurvivorALusth.fbx` (`creatureAssets.jsx:7-8`) | **unconfirmed** | idle, breathing, walk, run, attack (swipe), punch, jump attack, jump, roar, flex, three turns, death (`creatureAssets.jsx:13-28`) | per spawn table; tier from `pickTier`/`fixedTier` | dungeon spawns: none (`dungeonTrainingSpawn`, `GameWorld3D.jsx:1937`, `:5125-5127`); quest spawns and legacy spawns: XP by tier, gold 15/30/60, quest credit | live |
| **Quarry dragon** "wolfveil_quarry_dragon" | quarry (350,−40), east scene only (`GameWorld3D.jsx:1735-1764`) | remote GLB `…852c0eeaa_dragon_character_3d_by_oscar_creativo.glb` (`boss/QuarryDragonAerialSlam.js:9-10`), loaded when the player approaches | **unconfirmed** | GLB clips; one warned jump-and-ground slam, 30 damage, plus "living fire" patterns (`QuarryDragonAerialSlam.js:1-17`, `boss/DragonLivingFire*.mjs`) | stats of `getAXEEnemyStats(25,'worldBoss')` with 10 HP tanks (`:109-124`). The map labels it **Lv 12** (`WolfveilLandscapeDesign.mjs:236`): the two disagree | none: "Client-side preview encounter only: no XP, loot, server damage or quest grants" (`:3`), `xpReward:0` (`:124`) | live |
| **Dragon of Living Perspectives** (second copy of the same GLB) | Vortex Lake rim (263,350), north scene (`GameWorld3D.jsx:1765-1794`) | same GLB | — | same | same | none | live |
| Legacy world bosses Ironmaw, Voidshade, Emberwarden | — | — | — | — | — | — | **paused**: `setBosses([])` "Default world boss disabled" (`GameWorld3D.jsx:1732-1734`; data `bossData.jsx:21-36`) |
| AXE dungeon bosses Cavern Warden, Sealed Guardian | — | spawned through `spawnWorldBoss` with the legacy creature | — | — | — | — | **paused** (no caller of `window.__gw3dSpawnAXEDungeonBoss`, `GameWorld3D.jsx:1795-1830`) |
| "Rogue player" AI (red-tinted archer, chases, 180 HP, drops loot, 25 s respawn) | mounted on the page (`src/pages/GameView.jsx:850`) | player archer model | — | — | — | 8 XP, 75 gold | **paused**: `ENEMY_PLAYER_SPAWNS=[]` (`enemyPlayerSpawnConfig.jsx:5-7`, `:19-31`) |
| Cave narrative mobs and bosses (Ink Hare, Painted Stag, Root Ember, Root Pyre, Ink Koi, Drowned Ink…) | — | — | — | — | Lv 6–24 | — | **text only** (`wolfveil/WolfveilCaveNarrative.mjs`; `WolfveilCaveSystem.js:1192`) |

The triangle counts could not be read: none of these enemy models are in the repository;
all are URLs on the owner's Base44 media store. Downloading them was outside what this
research task should do without asking. A node GLB/FBX reader can measure them once a copy
is on disk.

Model scaling: every non-boss enemy is scaled so its largest dimension is 1.7 m × the tier
scale (1.00 normal … 3.00 world boss) (`GameWorld3D.jsx:1874-1878`,
`gameWorldConfig.jsx:49-57`).

### 4.2 Tiers, levels, health and damage

Tiers (`gameWorldConfig.jsx:49-57`): normal (weight 0.70, XP 1), champion (0.20, XP 3),
elite (0.10, XP 5), miniBoss (XP 12), caveBoss (XP 30), gateBoss (XP 50), worldBoss (XP 150);
the last four are never rolled, only fixed. `pickTier(tierRoll)` uses a deterministic
per-spawn roll so every client gets the same tier (`GameWorld3D.jsx:1868-1871`).

Stats come from one shared curve, `getAXEEnemyStats(level, tier)`
(`base44/shared/axePowerBudget.ts:289-313`, re-exported by
`axe/balance/AXEPowerBudget.js:4`), also used by the backend duel system. A normal enemy
takes 5 average hits from the "par hero" of its level and kills that hero in 17 of its own
hits; tiers multiply HP / damage (champion 2.5/1.25, elite 5/1.5, miniBoss 15/2,
caveBoss 30/2.4, gateBoss 50/2.8, worldBoss 120/3.2) (`:102-120`). Level cap is 155
(`:11`). Evaluated with node:

| Level | normal HP / dmg | champion | elite | miniBoss | caveBoss | worldBoss | par hero HP |
|---|---|---|---|---|---|---|---|
| 1 | 107 / 26 | 259 / 32 | 498 / 38 | 1,437 / 51 | 2,802 / 61 | 10,427 / 82 | 182 |
| 5 | 520 / 62 | 1,266 / 77 | 2,440 / 92 | 7,065 / 123 | 13,812 / 148 | 51,785 / 197 | 505 |
| 10 | 906 / 92 | 2,209 / 115 | 4,264 / 138 | 12,362 / 184 | 24,188 / 221 | 90,918 / 294 | 756 |
| 15 | 1,386 / 130 | 3,381 / 162 | 6,526 / 195 | 18,925 / 260 | 37,033 / 312 | 139,232 / 416 | 1,063 |
| 20 | 1,967 / 184 | 4,798 / 230 | 9,260 / 276 | 26,850 / 368 | 52,536 / 442 | 197,480 / 589 | 1,496 |
| 25 | 2,572 / 239 | 6,275 / 299 | 12,112 / 359 | 35,122 / 478 | 68,728 / 574 | 258,414 / 765 | 1,936 |
| 30 | 3,116 / 277 | 7,600 / 346 | 14,670 / 415 | 42,542 / 553 | 83,250 / 664 | 313,041 / 885 | 2,234 |
| 40 | 4,609 / 405 | 11,248 / 506 | 21,724 / 607 | 63,031 / 809 | 123,383 / 971 | 464,299 / 1,295 | 3,228 |
| 50 | 6,367 / 522 | 15,540 / 653 | 30,019 / 784 | 87,113 / 1,045 | 170,539 / 1,254 | 641,910 / 1,671 | 4,136 |
| 70 | 11,664 / 884 | 28,466 / 1,105 | 54,983 / 1,326 | 159,532 / 1,768 | 312,272 / 2,121 | 1,174,863 / 2,828 | 6,787 |
| 100 | 26,338 / 1,808 | 64,275 / 2,261 | 124,132 / 2,713 | 360,090 / 3,617 | 704,731 / 4,340 | 2,649,747 / 5,787 | 13,321 |
| 155 | 57,939 / 4,086 | 141,489 / 5,107 | 273,499 / 6,128 | 794,012 / 8,171 | 1,554,682 / 9,805 | 5,852,117 / 13,074 | 29,403 |

The player XP table runs only 10 steps then 200 per level (`gameWorldConfig.jsx:69-75`);
whether a level-155 progression branch changes it is outside this branch
(memory note: level-cap work is on an unmerged branch).

### 4.3 Where enemies spawn

| Table | Region / area | Count | Positions | Source |
|---|---|---|---|---|
| `WOLFVEIL_HOSTILE_ZONES` | Wolfveil east/west | 4 + 3 + 3 = 10 | fixed points: Shadow Ravine (325,−169)(337,−181)(352,−160)(347,−185); Ruined Watch (285,−213)(298,−220)(309,−206); Wolfstone (−338,230)(−324,222)(−314,243). Dropped if within 100 m of market, 60 m of south gate, 50 m of sanctuary, 65 m of training, 10 m of the river, 9 m of a bridge, or on ground rising > 1.8 m per metre | `WolfveilEnemySpawns.mjs:14-107` |
| `WOLFVEIL_ZOMBIE_CAMPS` | Wolfveil east/north/west | 10 × 15 | Fibonacci disc of radius 4.8–16.8 m around each camp centre | `WolfveilZombieCamps.mjs:8-19`, `:31-45` |
| `LUNAR_CAVE_TRAINING_SPAWNS` | `lunar-cave` | 25 | 5 per hall, ring of r 16/23 m | `dungeons/LunarCaveLayout.mjs:56-73` |
| `ASTRAL_MONSTER_SPAWNS` | `astral-dungeon` | 54 | per pad, r 16/20 m; last one per pad elite | `dungeons/AstralDungeonLayout.mjs:62-76` |
| `ENEMY_SPAWNS` (legacy AXE first region) | any other region, **including `wolfveil-caves`** | 8 + 10 + 3 + 1 = 22 | seeded random around (40,−150) r 90; (−560,−250) r 150 champions; (−700,−350) elites; (620,−520) mini boss | `enemySpawnConfig.jsx:8-13`, `:35+`; chosen at `GameWorld3D.jsx:1836-1840` |
| Quest spawns | wherever the player accepts the quest | `spawnCount` of the quest | a ring 8–14 m around the **player's position at accept time**, at the **player's level** | `questEnemySpawner.jsx:15-40`; called at `GameWorld3D.jsx:6154-6160` |

Wolfveil hostiles are filtered to the current area scene (`GameWorld3D.jsx:1839-1840`);
the zombie runtime streams by distance regardless of area (`:1843-1846`).

### 4.4 Respawn rules

- Ordinary enemies: 10 s after death, at their home point with full HP
  (`enemySpawnConfig.jsx:15-16`, `GameWorld3D.jsx:5096-5097`). Zombies: 18 s
  (`WolfveilZombieHordeRuntime.js:18`, `GameWorld3D.jsx:5097`). Quest spawns never respawn
  (`respawnAt=null`). Rogue AI: 25 s (paused).
- Bosses: the dragon's HP tanks reset on its own rules (**unconfirmed** detail).

### 4.5 AI

- One AI loop in `GameWorld3D.jsx` owns all ordinary enemies (`:1563-1567`: "Do not update
  the separate legacy EnemyAISystem").
- Decisions come from `ai/EnemyCombatIntelligence.mjs` (no timers or side effects): profiles
  `standard` (aggro 8 m, leash 15 m, speed 2.2, windup 0.72 s, cooldown 2.2 s, reach 2.2 m),
  `aggressive` (champions/elites and the Ruined Watch: aggro 10, leash 18, speed 2.7),
  `quest` (aggro 10, leash 17) and `bruiser` (mini bosses) (`:3-27`).
- Attack telegraphs: `ai/EnemyAttackTelegraphs.jsx` (created at `GameWorld3D.jsx:1567`).
- Bosses: `boss/BossEncounterController.js`, `boss/updateBossMovement.js`, boss HP tanks,
  `boss/BossCombatDialogue.js` (lines a boss speaks during combat).

### 4.6 Network sync of enemies

- Peer-to-peer, host-elected: the player with the lowest id is host
  (`network/hostElectionStore.jsx:1-12`); the host samples `window.__gw3dEnemies` at 5 Hz and
  broadcasts positions/HP over WebRTC (`network/enemySyncBroadcaster.jsx:1-30`); others
  apply them (`network/enemySyncReceiver.jsx`); same for bosses (`bossSync*`). Mounted by
  `<WorldSyncMount/>` (`src/pages/GameView.jsx:772`). Live, but not authoritative.
- Kills of legacy/quest enemies are broadcast as `enemy_killed` and replayed by peers
  (`GameWorld3D.jsx:5125-5126`, `:1568-1580`); Wolfveil hostiles, dungeon spawns and zombies
  are not broadcast.
- A private world server client exists (`network/privateWorldClient144.mjs` and
  `privateWorld*`), see section 6.

### 4.7 Kill credit is inconsistent

The main melee/skill hit path refuses XP and quest credit for C1 hostiles and dungeon
monsters and gives zombies XP only (`GameWorld3D.jsx:5122-5137`). But two other kill paths
call `reportEnemyKill(QUESTS, tier)` and award XP for **any** enemy they kill:
legacy targeted abilities (`legacyTargetedAbilities.jsx:43-56`) and companion abilities
(`companionAbilityHandler.jsx:38-50`). A quest designer cannot rely on "this monster never
counts" or "this monster always counts" until that is unified.

### 4.8 What adding a new monster type takes today

1. A rigged model + clips the browser can load (today they are Base44 media URLs). Put the
   URLs in an asset module like `wolfveil/WolfveilEnemyAssets.mjs` or
   `WolfveilZombieOwnerAssets.mjs`.
2. A spawn table with fixed ids, home points, levels and tier
   (`WolfveilEnemySpawns.mjs` pattern: deterministic, grounded with the runtime sampler).
3. A loader: `createSharedSkinnedFBXSpawner(loader, url)` downloads and parses once and
   clones skeletons, max 2 per frame (`performance/SharedSkinnedFBXSpawner.mjs:1-20`).
   For GLB monsters there is no shared spawner; the dragon loads its own GLB
   (`boss/QuarryDragonAerialSlam.js:178`).
4. In `GameWorld3D.jsx`: today the enemy model is chosen by **one** source per region
   (`wolfveilEnemySource||creatureSource`, `:1859-1864`) and clip roles by a few flags
   (`wolfveilVisualSpawn`, `wolfveilZombieCampSpawn`, `:5111-5114`). A second Wolfveil
   monster type means adding a per-spawn model key there (spawn entries already carry
   `modelAssetKey:'admin_model_c1'`, `WolfveilEnemySpawns.mjs:100`, but nothing reads it
   yet; **unconfirmed** beyond that grep) or a runtime like the zombie horde that pushes into
   the shared `enemies` array.
5. Decide rewards: the flags above decide XP/quest credit (4.7).
6. A mob-area entry for the camp hollow and map label (3.6), which the landscape test
   requires to match the spawn table.
7. Tests to extend: `tests/game3d-clone-wolfveil-landscape-design.test.mjs:42-69`; the
   zombie and hostile spawn tests (grep `WOLFVEIL_ZOMBIE_CAMPS` / `WOLFVEIL_HOSTILE_ZONES`
   in `tests/`).

---

## 5. Quests

### 5.1 All quest data on this branch

Everything lives in one array, `QUESTS` (`questData.jsx:20-295`): **32 quests**.

| Group | Ids | Giver | Objectives | Source |
|---|---|---|---|---|
| Starter set (10) | `q1_first_blood` … `q10_arena_master` | the 5 archers, 2 each | `kill` 3–25 or `kill_tier` elite/champion 1–2 | `questData.jsx:20-130` |
| Story arc "The Hollow Crown" (10, chained by `requires`, unlock levels 2–12) | `q11_echoes_below` … `q20_hollow_crown` | the 5 archers | `kill` / `kill_tier`; rewards include abilities (Shadow Teleport, Lightning Strike, Frost Tornado) and class changes (Berserker, Paladin, Shadow Ranger) | `questData.jsx:132-258`. Story text: "a sealed divine reactor" under "the arena" |
| Living Quest "Demons of the Bleeding Moon" | `q_living_bleeding_moon` | `living_artemis` | `kill` 5 with `targetId:'kali_bleeding_moon_demon'` (no event ever carries that target, so it cannot complete by design); reward 0 | `questData.jsx:260-277` |
| AXE campaign "First Steps Beyond the Gate" + "Paths Unseen" (3) | `axe_q_first_patrol`, `axe_q_first_elite`, `axe_q_cave_scout` | Lyra, Lyra, Noor | kill 3; elite 1 (+ optional no-death); `discover_location AXE_POI_CaveEntrance` | `axe/quests/AXEQuestFramework.js:67-127` |
| Echo Chronicle chapters 14–18 + 2 optional branches (7) | `echo_ch_14_first_echo` … `echo_branch_broken_road` | archers | kill, kill_tier, `discover_location` of the exploration nodes `ft_spirit_vein` and `ft_weathered_tablet` | `axe/quests/AXEEchoChapters.js:3-51` |
| Jade Grotto side quest | `q_wolfveil_jade_watch_side` | `wolfveil_jade_watch_captain` (Captain Arlen) | kill 3 | `questData.jsx:281-295` |

Campaign records: `AXE_CAMPAIGNS` (`AXEQuestFramework.js:21-49`). Clan quests are a separate
backend entity (`base44/entities/ClanQuest.jsonc`), not in `QUESTS`.

A quest definition can already carry (`AXEQuestFramework.js:51-65`, `questData.jsx:301-334`):
`npcId`, `unlockLevel`, `requires` (one quest id), `factionId` (only offered to that faction),
`storyFlagsRequired`, `storyFlagsOnComplete`, `repeatable`, `priority`, `objectives[]` with
`optional`, `reward {xp, points, contribution, reputation, unlock}`, `spawnCount`,
`spawnTier`, `choiceHooks`, `failureRules`, `recommendedLevel/Power`. `choiceHooks` and
`failureRules` are declared but nothing reads them (a grep of `src/`, `base44/` and `server/`
finds them only in `AXEQuestFramework.js`).

### 5.2 The store

`useQuestStore.jsx` keeps per-character state in browser storage
(`characterScopedStorage('axe_quest_state_v2')`, `:14`): accepted, completed, per-objective
progress, story flags, choices, abandoned, completion counts (`:17-27`). API:
`acceptQuest` (checks `requires`, repeatable, story flags, `:102-131`), `completeQuest`
(checks objectives, sets completion flags, `:133-164`), `abandonQuest`, `reportQuestEvent`
(`:183-217`), `reportEnemyKill` (`:220-226`), `reportLocationDiscovery`, `setQuestStoryFlag`,
`setQuestChoice`, `shareQuestWithParty` (only dispatches `axeQuestShareRequested`,
`:278-286`). Event matching: `objectiveMatchesAXEQuestEvent` maps objective types to
event types and checks tier, targetId, itemId, recipeId, factionId
(`AXEQuestFramework.js:144-171`). Progress maths: `axe/quests/AXEQuestEventProgress.js`.

A global bridge turns window events `axeQuestEvent` and `axePOIDiscovered` into quest
progress, **but only for `AXE_QUESTS`** (AXE + Echo quests), not the q1–q20 set
(`useQuestStore.jsx:288-303`).

### 5.3 Which of the 14 objective types really advance

Declared types: `AXEQuestFramework.js:4-19`. Emitters found by grepping `src/` for each
event name:

| Objective type | Event | Who emits it today | Live? |
|---|---|---|---|
| `kill` | `enemy_killed` | `reportEnemyKill` from the melee/skill kill path (legacy creature and quest-spawned enemies only), legacy targeted abilities and companion abilities (any enemy) (`GameWorld3D.jsx:5137`, `legacyTargetedAbilities.jsx:56`, `companionAbilityHandler.jsx:50`) | **yes**, but in Wolfveil only quest-spawned enemies count on the main path (4.7) |
| `kill_tier` | `enemy_killed` + tier | same | **yes**, same caveat |
| `discover_location` | `location_discovered` | exploration discovery nodes when the hero comes within 30 m (`exploration/ExplorationDiscoveryMount.jsx:13`, `:174`); Echo living encounters (`social/echoLivingEncounters.js:21`). `axePOIDiscovered` would also feed it, but its emitter `AXEWorldStreamingMount` is **paused** (`src/pages/GameView.jsx:774`), so `axe_q_cave_scout` (`AXE_POI_CaveEntrance`) cannot complete | **partly** |
| `interact` | `world_interact` | gathering an exploration node (`exploration/explorationDiscoveryStore.js:92`) | **yes** (5 nodes) |
| `collect_item` | `item_collected` | each material unit from a node (`explorationDiscoveryStore.js:93`) | **yes** (5 nodes) |
| `enter_cave` | `cave_entered` | AXE dungeon store (`axe/dungeons/AXEDungeonStore.js:190`) | **no**: AXE dungeons are paused; entering the Wolfveil caves, Lunar Cave or Astral dungeon emits nothing |
| `defeat_boss` | `boss_killed` | AXE dungeon store (`AXEDungeonStore.js:354`) | **no** (paused); the dragons emit nothing |
| `talk` | `npc_talked` | nobody | no |
| `escort` | `escort_completed` | nobody | no |
| `defend` | `defend_completed` | nobody | no |
| `capture` | `capture_completed` | nobody | no |
| `craft` | `craft_completed` | nobody | no |
| `faction_war` | `faction_war_participated` | nobody | no |
| `explore` | `exploration_completed` | nobody | no |

So of 14 declared types, 5 can advance today (`kill`, `kill_tier`, `discover_location`
via the 5 exploration nodes, `interact`, `collect_item`), and only for AXE/Echo quests for
the last three.

**Exploration nodes** (live; `base44/shared/explorationDiscoveries.ts:70-100`, world
coordinates, region tag `AXE_Region_FirstTerritory`): Spirit Crystal Vein (48,−62), 20 min
respawn; Reinforcement Stone Outcrop (−84,36), 15 min; Soul Fragment Bloom (122,104), 30 min;
Hidden Divine Cache (−158,−146), once; Weathered Stone Tablet (170,−175), once, placeholder
skill. The mount adds them to whatever scene is current without a region check
(`ExplorationDiscoveryMount.jsx:121-122`), so in Wolfveil they sit at local
(48,−132) town, (−84,−34) town, (122,34) on the town/east border, (−158,−216) town and
(170,−245) east. They were placed for an older map (**unconfirmed** whether they stand on
sensible ground). Claims go to the server (`base44/functions/characterVault/entry.ts`).

### 5.4 Quest givers

| Giver | Where (world x, z) | How spawned / animated | Source |
|---|---|---|---|
| Lyra the Seeker | (−4, 10), by the spawn | `loadAXEQuestNPCVisual` loads an authored GLB with an embedded idle clip when present, else the archer FBX tinted; scaled to 1.7 m; faces the spawn; yellow ring; snapped to ground | spots `wolfveil/WolfveilImportedTownLayout.mjs:54-66`; spawn loop `GameWorld3D.jsx:2346-2392`; GLBs `npc/axeAnimatedQuestNpcGLB.mjs:11-25` (Lyra = `Artemis_Character_v5.glb`, Vex = `Getsuga_Tensho_Character_v5.glb`, Zephyr = `luna-hi3d/warrior.glb`) |
| Vex the Hunter | (−32, −52) | same | same |
| Kira the Scout | (28, −45) | same (archer FBX) | same |
| Noor the Wanderer | (−32, 39) | same (archer FBX) | same |
| Zephyr the Silent | (27, 45) | same | same |
| Artemis (Living Quest) | (16, −14) | `spawnLivingQuestNPC` + cinematic camera, branching dialogue | `npc/spawnLivingQuestNPC.jsx:7`, `:18-25`; `GameWorld3D.jsx:2465`; `src/components/livingquest/livingQuestData.js` |
| Captain Arlen (Jade Grotto watch) | outside the Jade Grotto mouth, local ≈ (−352,−388) | cave watch guards | `wolfveil/WolfveilCaveWatchPlan.mjs:11-43`; not built on the surface today (2.1) |

The five archers are spawned in every region except the Lunar and Astral dungeons
(`GameWorld3D.jsx:2351`), always at their town spots in Wolfveil. In the west, east, north
and south area scenes those spots are outside the loaded area (**unconfirmed** what the
player sees). Town NPCs without quests (patrols, civic AI) live in
`wolfveil/WolfveilTownCivicAI.mjs`, `WolfveilTownCivicTasks.mjs` and
`WolfveilTownDialogueBrain.mjs`.

Interaction: walk near, press **E** ("Speak with …" prompt, `GameWorld3D.jsx:6117-6134`); the
NPC's state (offer / in progress / ready) comes from `getAXENPCQuestHandoff`
(`axe/quests/AXENPCQuestHandoff.js:1-40`), the offered quest from `getAvailableQuestForNPC`
(highest `priority`, then lowest unlock level, filtered by faction and story flags,
`questData.jsx:301-334`).

### 5.5 Accept, fight, turn in (what actually happens)

- **Accept** (`GameWorld3D.jsx:6145-6162`): `acceptQuest`, then if the quest has
  `spawnCount`, `spawnQuestEnemies` puts that many legacy-creature enemies **in a ring 8–14 m
  around wherever the player stands**, at the player's own level, with a red/orange/purple
  ring (`questEnemySpawner.jsx:15-40`). They never respawn. Quests are therefore not tied to
  places on the map today.
- **Turn in** (`:6165-6211`): `completeQuest`, then `grantQuestReward(q)` and `awardXP` in
  the browser.

### 5.6 UI

- Dialogue box: `QuestDialogueBox.jsx` (accept / decline / claim; plays a per-quest audio URL
  if one is stored, `:62`). Cinematic dialogue for the Living Quest:
  `npc/CinematicQuestDialogue.jsx` + `livingquest/cinematicCamera.js`.
- Tracker: `hud/JadeQuestTracker.jsx` + `hud/questTrackerViewModel.js`.
- World breadcrumb trail to the tracked objective: `hud/AXEQuestTrailMount.jsx` (mounted at
  `src/pages/GameView.jsx:734`); it uses `getQuestNavigationTarget`
  (`hud/worldMapData.js:110-140`), which points kill quests at mob markers of a matching
  tier and location quests only at a known POI marker.
- Questbook: the Services "Quest Logbook" workspace (`axe/services/AXEQuestLogbookWorkspace.jsx`)
  and a server-verified questbook (`AXEVerifiedQuestbookMount172`, mounted at
  `src/pages/GameView.jsx:733`), which only works when the server flag is on (5.8).
- Floating label over givers: `QuestFloatingLabel.jsx`; reward toast `QuestRewardToast.jsx`.

### 5.7 Voice and audio

- **Per-quest voice-over**: `questAudioStore.jsx` maps quest id → audio URL in the browser's
  own `localStorage` (`:1-52`). Nothing in `src/` calls `setQuestAudio` any more (grep), so
  no player hears quest voice-over today (**dead path**).
- **Generated speech**: `src/functions/generateStoryAudio.js` calls
  `base44.integrations.Core.GenerateSpeech({text, voice:'river'})` (`:6-16`) and returns an MP3.
  Its only caller is the Living Quest cinematic, which voices each line live
  (`npc/CinematicQuestDialogue.jsx:63-80`). The comment there says "via ElevenLabs"; the code
  calls Base44's speech integration, so which provider is behind it is **unconfirmed**.
- A case-insensitive grep for `elevenlabs` in `src/`, `base44/`, `server/` and `scripts/` finds
  only that comment. No API key or ElevenLabs client is in this code (no `.env` was opened).
- Combat/boss lines: `boss/BossCombatDialogue.js`; sound effects through `combatAudioStore.jsx`
  and `playActionSound('quest_accept'|'quest_complete'|…)`.

### 5.8 Rewards: who decides

| Path | What | State |
|---|---|---|
| Browser, on turn-in | XP + stat points (`awardXP`), contribution (`progression/contributionStore`), faction reputation (`addAXEFactionReputation`), ability/skill/class unlocks (`questRewards.jsx:1-84`; `GameWorld3D.jsx:6172-6199`) | **live**; nothing is checked by a server |
| Browser, on kill | XP by tier, gold 15/30/60/250, title kills (`GameWorld3D.jsx:5127-5169`) | live |
| Exploration node claim | materials / skill, decided by the server `characterVault` function using `base44/shared/explorationDiscoveries.ts` (reach check, respawn, level) | **live**, server-decided |
| `base44/functions/game3dQuestAction174` (NPC quest / rival consent intent) | authenticates, signs a short-lived request, forwards to a private worker URL; replies always say `rewardsIssued:false, productionReady:false` | **flag**: refuses unless `GAME3D_QUEST_ACTION_174_ENABLED` and `GAME3D_QUESTBOOK_ENABLED` are `'true'` (`entry.ts:62-66`); called from `axe/quests/AXEQuestIntent174.js:27` |
| `base44/functions/game3dQuestbookRead` | verified questbook read | **flag** `GAME3D_QUESTBOOK_ENABLED` (`entry.ts:73-75`); called from `AXEQuestbookRemoteReader170.js:24` |
| `server/game3d/privateQuest*`, `trustedQuestRules.mjs`, `privateWorldKillCommit153.mjs`, … (≈ 70 files) | private authoritative quest pipeline; `trustedQuestRules.mjs` mirrors only the 3 AXE quests with empty `awards` (`:1-20`) | **private server**, not called by the published game except through the flagged functions above |
| `base44/entities/Quest.jsonc`, `UserQuest.jsonc`, `StoryProgress.jsonc`, `base44/shared/questProgress.ts` | backend entities and daily/weekly period helpers | no Game 3D caller found in `src/` (**unconfirmed** whether another page uses them) |

Whether the two flags are on in production cannot be seen from the repo (**unconfirmed**).

---

## 6. Factions and PvP

### 6.1 The three factions

Ids and names come from `axe/factions/AXEFactionWeaponConfig.js:40-63`: `AXE_Faction_1`,
`AXE_Faction_2`, `AXE_Faction_3`, with **display names "Faction 1", "Faction 2", "Faction 3"**
("Exact legacy faction/weapon names remain intentionally unresolved", `:1-4`). Each has a
placeholder capital id `AXE_City_FactionN_Capital`, a god-realm id, weapon families
(blade / polearm / bow, the same for all three) and a colour token `faction-N`. Unassigned
characters carry `AXE_Faction_Unassigned`.

Presentation-only "dossiers" (`axe/factions/factionDossierPresentation.mjs:1-50`; the file
says they are not world coordinates, lore or grants):

| Id | Title | Beast / starter mount | Motto | Homeland concept | Armor look | Accent |
|---|---|---|---|---|---|---|
| `AXE_Faction_1` | The Resolute | Fantasy Bear | "Endurance is the beginning of strength." | Highland Forests: high valleys, cedar forests, fortified mountain halls | Nightscale | `#dcb58a` |
| `AXE_Faction_2` | The Vigilant | Armored Wolf | "A shared path, guarded beneath the moon." | Northern Citadels: moonlit fortresses over misty evergreen valleys | Frostwarden | `#a5cbe9` |
| `AXE_Faction_3` | The Radiant | Fantasy Tiger | "Courage moves where the sun rises." | Sunlit Expanse: sandstone shrines, desert gardens, ancient riverways | Dune Scavenger | `#edc18a` |

**No faction has a home place on the Wolfveil map**: there is no faction field in any site,
area or spawn table, and every character spawns on the same plaza.

Mounts (`axe/factions/AXEFactionMountAssets.mjs:5-41`): Faction 1 bear
`/models/mounts/faction_bear.glb` (measured with node: 6,949 triangles in **73 meshes**,
clips Idle/Walk/Run, 3.3 MB); Faction 2 armored winged wolf (remote GLB #158, triangles
**unconfirmed**); Faction 3 tiger `/models/mounts/faction_tiger_rigged_v1.glb` (32,639
triangles, 1 mesh, clips Fly/Idle/Run/Walk, 6.2 MB). The starter mount follows the faction
(`getGame3DStarterMountDefinitionId`, `:47-49`). Pets/companions are not faction-bound
(`companionData.jsx`, **unconfirmed** beyond a grep).

**Where the choice is made**: on the character select screen before creation
(`CharacterLoginScreen.jsx:590-593`, passed into `CharacterCreationModal` at `:715`), stored
by `createCharacter` (`characterStore.jsx:120-128`); it can be changed later with
`setActiveCharacterFaction` (`characterStore.jsx:303-316`). A "Faction" comparison window
(`FactionCommandModal.jsx`, `axe/factions/FactionOverview.jsx`) is opened from the page
(`src/pages/GameView.jsx:941`).

### 6.2 Faction war, reputation, contribution

- **War rules** (`axe/factions/AXEFactionWarSystem.js`): an hourly cycle (10 min registration,
  35 min battle, 5 min resolution, `:10-19`), four power brackets (`:21-26`), five war "maps"
  with prototype positions world (−90,110) … (−270,170) (`:28-64`), shields/towers/core with
  25k–90k HP (`:75-83`), rewards in contribution and war tokens (`:85-91`).
- **War store** (`axe/factions/AXEFactionWarStore.js`): per-character browser state with an
  "authority gateway when available" (`:1-3`). Its only caller in `src/` is the rogue-AI
  spawner (`EnemyPlayerSpawner.jsx:228`), which has no spawns. **Paused / data only**: no war
  map, capture point or defense exists in any scene.
- **Reputation** (`axe/factions/AXEFactionReputationStore.js:1-20`): per character, ranks
  Outsider 0 / Known 100 / Trusted 500 / Honored 1,500 / …; fed by quest rewards
  (`questRewards.jsx`). Browser-only. A private server version exists
  (`server/game3d/privateFactionReputation163.mjs`, private).
- **Contribution** (`progression/contributionStore.jsx:3`, storage key
  `twelvesky_contribution_v1`): browser-only, fed by quests and war rewards.
- **Faction announcements** ticker: shows only announcements the server marks as authorized
  from a faction leader or vice (`axe/factions/factionAnnouncementModel.mjs:1-14`); mounted at
  `src/pages/GameView.jsx:750`. Which server sends them is **unconfirmed**.

### 6.3 Who can attack whom, and where

- **Monsters** can be fought anywhere they exist; town has no spawns (4.3).
- **Open-world PvP rules** (`pvp/WorldPvpRules.mjs:1-54`): town is "Wolfveil Town · PvE";
  south, west, east and north areas are "Optional PvP"; every other region (caves, dungeons)
  and private homes are PvE (`:10-23`). Both players must be in the same world instance and
  the same area, both alive, and **both** must have switched to PvP mode (`:36-54`). There is
  **no faction rule**: two players of the same faction in PvP mode could fight, and players of
  rival factions in PvE mode cannot.
- **The PvP switch** (`pvp/WorldPvpControl.jsx`, mounted at `src/pages/GameView.jsx:748`)
  sends `game3dWorldPvpFlagRequested` and only calls the flag active after a
  `game3dWorldPvpFlagCommitted` reply "from a verified world server" (`:1-6`). Nothing in
  `src/`, `base44/` or `server/` sends that reply on this branch (grep), so **open-world PvP
  never switches on today**. The server side is a private state machine
  (`server/game3d/worldPvpAuthority.mjs:1-4`: "Internal-only … before enabling open-world
  player damage").
- **Duels (live)**: one player challenges another; a `DuelSession` entity is created, both
  duelists get a red ring, and each attack on the locked opponent within range is sent to the
  `duelSystem` Base44 function, which rolls it with the shared combat rules and decides the
  winner (`social/DuelSystem.jsx:1-20`, `:130-183`; `base44/functions/duelSystem/entry.ts`;
  ranges 3 m melee / 7 m ranged, `pvpCombatRules.js:4-5`). Kill credit = the session's
  `winner_id`. Duel mastery is stored (`base44/entities/Game3DDuelMastery.jsonc`).
- **Dedicated duel worker** (private): a signed match worker can take over a duel
  (`base44/shared/duelDedicatedHandoff.mjs:1-15`), using the server map collision of section 3
  and fixed spawn presets such as `wolfveil-south-approach-v1` at local (0,−80) ±3 m
  (`base44/shared/duelWorldSpawnPreset.mjs:1-12`). Whether production uses it is
  **unconfirmed**; the map module says never for ranked play (`server/game3d/mapCollision.mjs:1-4`).

### 6.4 Death and respawn

HP 0 → fall animation → ash dissolve → respawn menu (`death/DeathFlowController.jsx:1-20`,
`death/deathSequence.mjs`, `death/playerDeathAsh.js`). Choices: a safe spot 2–12 m from where
you died (`death/nearbyRespawnRules.mjs:1-20`) or any activated checkpoint
(`death/activatedCheckpointRules.mjs`, `mapSpawnPoints.js:26-48`), all of which are in town
(1.4). Choosing a checkpoint in another area reloads that area (`src/pages/GameView.jsx:299-313`).
No death penalty was found (grep for xp loss / drop / gold in the death files). All of it
runs in the browser.

### 6.5 What is server-decided

Server-decided and live: duel outcomes (`duelSystem`), exploration node claims
(`characterVault`), clan and party records (below). Server-decided but behind flags or private:
quest actions and questbook (5.8), world PvP authority, faction reputation, kill commits, the
whole `server/game3d/privateWorld*` world server (its browser client
`network/privateWorldClient144.mjs` is imported by nothing outside `network/`). Browser-decided:
XP, levels, quest progress and rewards, reputation, contribution, gold from kills, death and
respawn, enemy AI (host-elected peer sync).

### 6.6 Parties and clans

Parties are live Base44 records (`base44/functions/partySystem`, `managePartyMembership`,
`partyLifecycle`, `partyLaunchGame`; entities `Party`, `PartyMember`, `PartyInvite`,
`PartySession`; UI `social/PartyPanel.jsx`); a quest can be "shared" only as a window event
(`useQuestStore.jsx:278-286`) and quest progress is not shared. Clans are a large live
backend (`clanSystem`, `clanOperations`, `clanForumOperations`, `secureClanAccess`; entities
`Clan`, `ClanMember`, `ClanHall`, `ClanQuest`, `ClanVaultItem`, `ClanVote`, `ClanEvent`, …;
client `clan/clanStore.jsx`), separate from factions: a clan is not tied to one of the three
factions in any file I read (**unconfirmed**).

### 6.7 Anything like "the pledge system"?

A case-insensitive search of `src/`, `base44/` and `server/` for `pledge` finds nothing. The
nearest existing things are: (1) **faction allegiance** chosen at character creation, which
already gates quests (`factionId` on a quest, `questData.jsx:313-318`) and routes reputation
rewards (`questRewards.jsx`); (2) the quest **"Oath of the Dawn"** (`q18_oath_of_dawn`,
`questData.jsx:222-233`), the only oath, which is just a champion-kill quest that unlocks the
Paladin class; (3) **rival consent** in `game3dQuestAction174`, where a quest can ask a player to
accept another player as a "rival" or "friendly rival" or decline
(`base44/functions/game3dQuestAction174/entry.ts`, `choices=new Set(['rival','friendly_rival','decline'])`;
private and flag-gated); (4) the PvE/PvP **mode switch** (6.3); (5) a clan mission card
labelled "Bounty: Hunt down a champion enemy across the world" (`clan/ClanOverlayMissions.jsx:6`)
and a kill-count store that mentions "future bounty/title logic" (`killCountStore.jsx:4`).
Whole-word search: `pledge` 0 files, `vow` 0, `oath` 1 (the quest above), `allegiance` 1
(`FactionDossier.jsx`, display text), `contract` only in the programmer sense. If the owner said
"pledge", the code that comes closest is "pledging" to a faction at creation plus quests filtered
by `factionId`; read as "PvE", it matches the PvE/PvP switch; read as "quest", it is the quest
system of section 5. Which one the owner meant is a question for the owner.

---

## 7. Performance facts

### 7.1 Budgets in code

Per loaded area at its busiest view (`performance/Game3DAreaBudget.mjs:1-22`):

| Platform | Draw calls (scenery share) | Triangles (scenery share) | FPS target / floor |
|---|---|---|---|
| Browser | 500 (350) | 1.5 M (1.0 M) | 60 / 30 |
| Desktop app | 1,000 (700) | 2.0 M (1.4 M) | 60 / 30 |
| Mobile | 200 (140) | 0.75 M (0.5 M) | 30 / 24 |

"Scenery" is the world; the rest is kept for players, enemies, companions and effects. An area
may hold at most 420,000 m² before its scenery alone passes the browser triangle budget
(`:18-22`). For comparison the current areas are 89k (south) to 341k (north) m² (1.2).

Other caps in code: at most 30 rigged zombies at once (`WolfveilZombieCamps.mjs:7`); skinned
enemies cloned at most 2 per frame (`performance/SharedSkinnedFBXSpawner.mjs:12-15`); far
outline ≤ 30,000 triangles per area; far scenery batches ≤ 60,000 triangles
(`WolfveilAreaLoader.mjs:90-91`); cave draw budget rules
(`wolfveil/WolfveilCaveDrawBudget.mjs:21-27`).

### 7.2 Measured numbers already in the repo

From `docs/game3d/CLONE_WOLFVEIL_FIVE_AREA_PORTALS_PLATFORM_GRAPHICS_20261117.md`
(script `scripts/report-wolfveil-area-loading.mjs --town`, Three.js r171, counted not timed;
measured before WebGPU became the default):

| Area | One area loaded, all directions (calls / tris) | One camera view, worst / average |
|---|---|---|
| town | 481 / 1.35 M | 280 / 0.84 M · 178 / 0.76 M |
| south | 270 / 1.01 M | 207 / 0.77 M · 110 / 0.67 M |
| west | 361 / 1.68 M (over) | 249 / 1.24 M · 141 / 0.95 M |
| east | 356 / 1.43 M | 243 / 1.02 M · 142 / 0.83 M |
| north | 347 / 1.22 M | 212 / 0.89 M · 132 / 0.75 M |

(doc lines 167-188). The whole valley measured 222–961 calls and 1.97–2.86 M triangles per view
before areas (`:131-132`). Other measured facts in that doc: ground = 310 × 310 grid, 192,200
triangles, 8–12 % of what is drawn; **grass is 55–70 %** (`:258`, `:274-275`); near grass
59,400 blades, 448,200 triangles after LOD (`:198-202`); caves 791 draw calls as built, 65 on the
surface and 150 inside after the draw-budget pass (`:195-197`); the town hands the renderer
185 draw calls and 11,094 triangles from the square (`:206-209`); 6–12 lights on wherever the
player stands (`:217-218`).

Measured here with node: faction bear mount 6,949 triangles in 73 meshes (73 draw calls per
bear), faction tiger 32,639 triangles in 1 mesh (6.1).

Not in the repo as measurements: frame times on WebGPU, per-enemy cost, the triangle counts of
the enemy models (4.1).

### 7.3 Conventions for new content

- **Instance repeated props.** `performance/Game3DStaticInstancing.mjs` merges identical
  static props into instanced batches (used by the cave draw budget). The area loader then
  splits instanced scenery per area (3.7). Many small separate meshes is the known failure
  mode (the caves: 790 calls for 53,000 triangles, `WolfveilCaveDrawBudget.mjs:4-7`).
- **Low-poly + baked detail.** Rocks are six sculpt-baked variants × three LODs sharing one
  atlas; plants are baked card atlases (3.3). The landscape round-2 rule is "high-poly →
  baked → low-poly" (`tests/game3d-clone-wolfveil-landscape-bakes.test.mjs:1-5`).
- **Distance detail** exists for grass (three blade LODs) and far proxies; there is no general
  LOD system for props (**unconfirmed** beyond these).
- **Bury what is underground.** Cave interiors are only drawn underground.
- **Shared skinned sources.** One download/parse per enemy URL, cloned skeletons.
- **Adaptive graphics**: pixel-ratio caps per quality and GPU profile
  (`performance/AdaptiveGraphics.mjs:1-25`), platform graphics settings
  (`Game3DPlatformGraphics.mjs`), frame pacing (`Game3DFramePacing.mjs`), world graphics budget
  driven by the pause-menu preset (`Game3DWorldGraphicsBudget.mjs:1-3`).

### 7.4 What a new material costs on WebGPU

- `GameWorld3D.jsx:543-585` picks the renderer through `src/lib/rendererBackendChoice.mjs`: the
  classic WebGLRenderer until the scene is marked WebGPU-ready, then three's `WebGPURenderer`
  (WebGPU, or its own WebGL2 fallback).
- WebGPURenderer cannot draw GLSL `ShaderMaterial`/`RawShaderMaterial`. Every custom shader
  material needs a **TSL node "twin"** registered with `setNodeTwin(material, factory)`
  (`src/lib/webgpuMaterialTwins.js:1-30`; example `dungeons/VortexDungeonEcho.mjs:8-21`).
  Standard `MeshStandardMaterial`/`MeshBasicMaterial` need nothing extra.
- Each distinct material/state combination is a render pipeline that must be compiled; the
  game warms them up on load with `renderer.compileAsync` (`performance/SceneWarmup.mjs:170-173`,
  `GameWorld3D.jsx:2289`). A new material that first appears mid-play can hitch while it
  compiles (**unconfirmed** size of the hitch). Reusing existing materials is the cheap path.
- A note from earlier sessions (team memory, not a repo measurement): lit pixels cost about
  twice as much on Chrome WebGPU with an AMD GPU here as on WebGL; there is no committed
  speed comparison.

---

## 8. Plug-in points

Ownership warning: the **Wolfveil doorways session** owns the area loader, gates, ground height
and collision (`wolfveil/streaming/*`, `WolfveilLayout.js` height chain,
`WolfveilLandscapeDesign.mjs` grading, `WolfveilAreaVeils.mjs`, `WolfveilGateTravel.mjs`,
`server/game3d/mapCollision.mjs`); the **WebGPU session** owns the renderer
(`src/lib/webgpu*`, `rendererBackendChoice.mjs`, `gameWebGPURenderer.js`); the **animations
session** owns the player's movement states (`player/`). All of them, and others, edit
`GameWorld3D.jsx` (≈ 6,300 lines). Keep each change there to a few lines that call into a new
module.

| Want to add | Extend these (file: function / data) | Tests that pin it | Who owns |
|---|---|---|---|
| **A quest line** | Add entries to `QUESTS` (`questData.jsx:20-295`) or a new module spread into it like `AXE_QUESTS` / `AXE_ECHO_QUESTS` (`questData.jsx:279`, `AXEQuestFramework.js:67-129`); campaign record in `AXE_CAMPAIGNS` (`:21-49`); gating with `requires`, `factionId`, `storyFlagsRequired`, `storyFlagsOnComplete`, `priority` (`questData.jsx:301-334`). Note the event bridge only feeds `AXE_QUESTS` (`useQuestStore.jsx:288-303`): put new location/interaction quests there or widen the bridge. Server mirror if ever verified: `server/game3d/trustedQuestRules.mjs` | `tests/game3d-wolfveil-two-guards-tunnel-watch.test.mjs` (Jade side quest); few other quest tests exist (grep) | free (quests); `GameWorld3D.jsx` accept/claim handlers shared |
| **A new objective type** | Add the type to `AXE_QUEST_OBJECTIVE_TYPES` and the event map in `objectiveMatchesAXEQuestEvent` (`AXEQuestFramework.js:4-19`, `:144-171`) if new; then **emit the event** with `window.dispatchEvent(new CustomEvent('axeQuestEvent',{detail:{type,targetId,count:1}}))` from where it happens (pattern: `exploration/explorationDiscoveryStore.js:92-93`). Kill events: `reportEnemyKill` (`useQuestStore.jsx:220-226`) carries only `tier`; adding `targetId` (enemy type / camp id) needs the three kill paths (4.7). Navigation: `getQuestNavigationTarget` (`hud/worldMapData.js:110-140`) | none specific found | free, except kill paths inside `GameWorld3D.jsx` |
| **A voiced quest giver** | Spot: `WOLFVEIL_TOWN_QUEST_NPC_SPOTS` (`WolfveilImportedTownLayout.mjs:54-60`, town only, world coords) or a per-area spot via `wolfveilQuestNpcSpot` (`:62-66`); definition in `QUEST_NPCS` (`questData.jsx:12-18`); model in `AXE_QUEST_NPC_GLBS` (`npc/axeAnimatedQuestNpcGLB.mjs:11-25`, GLB with an embedded idle clip); spawn loop `GameWorld3D.jsx:2346-2392` (spawns all NPCs in every non-dungeon scene; filter by area). Voice: `generateStoryAudio` (`src/functions/generateStoryAudio.js`) as the Living Quest does (`npc/CinematicQuestDialogue.jsx:63-80`), or pre-made audio files played from `QuestDialogueBox.jsx:62` (the `questAudioStore` map is per-browser and has no writer; replace with shipped files) | `tests/game3d-wolfveil-two-guards-tunnel-watch.test.mjs` (guard NPC pattern) | free; `GameWorld3D.jsx` spawn loop shared |
| **A new monster** | Asset module (URLs) like `wolfveil/WolfveilZombieOwnerAssets.mjs`; spawn table like `WolfveilEnemySpawns.mjs` (fixed ids/points/levels/tier) or a runtime like `WolfveilZombieHordeRuntime.js` that pushes into the shared `enemies` array; per-spawn model choice and kill-reward flags in `GameWorld3D.jsx:1836-1870`, `:5111-5137`; camp hollow in `WOLFVEIL_MOB_AREAS` (3.6); stats come free from `getAXEEnemyStats` | `tests/game3d-clone-wolfveil-landscape-design.test.mjs:42-69`, `tests/game3d-shared-enemy-spawns.test.mjs` | spawn tables free; terrain hollow = doorways session; `GameWorld3D.jsx` shared |
| **An adventure spot** (camp, ruin, shrine, cave mouth) | Terrain: `WOLFVEIL_MOB_AREAS` / `WOLFVEIL_FIGHTING_GROUNDS` / `PROTECTED_SITES` (`WolfveilLandscapeDesign.mjs:206-273`), cave mouths `WolfveilCaveLayout.mjs:21-71` + `WolfveilCaveAccessPlan.mjs:7-32`, trails `WOLFVEIL_FRONTIER_TRAILS`. Props: a builder added under the Wolfveil `world.group` so the area loader and clipper handle it (3.7); instanced. Map label: `WolfveilMapDesign.mjs` marker lists. A discoverable point that advances quests: an entry in `EXPLORATION_DISCOVERIES` (`base44/shared/explorationDiscoveries.ts:70-100`, server-claimed) | landscape design + bakes tests (3.5), anchor heights, cave tests | terrain and caves = **doorways session**; props/markers free |
| **A new area** | Not data: five rectangles are hard-coded (3.8). A new **interior** (dungeon, keep, catacomb) follows the Lunar/Astral region pattern (3.8 steps 1-5) | `tests/game3d-clone-wolfveil-five-area-loading.test.mjs`, `game3d-wolfveil-area-gates.test.mjs`, `game3d-wolfveil-gate-travel.test.mjs` | **doorways session** for areas; interiors free except `GameWorld3D.jsx` and `GameView.jsx` hooks |
| **Faction-specific content** | `factionId` on quests (offer filter), `AXE_FACTIONS` names (`AXEFactionWeaponConfig.js:40-63`, today "Faction 1/2/3"), dossiers (`factionDossierPresentation.mjs`), reputation store, war system data (`AXEFactionWarSystem.js`, unmounted) | `tests/game3d-faction-dossier.test.mjs`, `game3d-faction-overview.test.mjs`, `game3d-faction-announcement.test.mjs` | free |
| **PvP meeting points** | Zone rules `pvp/WorldPvpRules.mjs` (area-level only today); the flag commit needs a server (6.3); duels work now (`social/DuelSystem.jsx`) | `tests/game3d-world-pvp-and-announcements.test.mjs` | private server for real damage |

Not mounted and not to be confused with live map content: `wolfveil/map-additions/scenes/b03/nature/`
holds a static, "UNAPPROVED" nature/architecture footprint audit (its header,
`architectureSeamAudit.mjs:1-7`) with its own tests; nothing outside the folder imports it.

---

## Unknowns and things I could not confirm

1. Triangle counts and clip lists of every enemy model (C1 Erika Archer FBX, zombie FBX,
   Survivor creature FBX, dragon GLB) and of the Faction 2 mount: all remote files, not
   downloaded.
2. Whether the five archer quest givers are visible (or float) in the west/east/north/south
   area scenes, since they are always placed at town spots.
3. Whether Captain Arlen (Jade Grotto quest giver) appears anywhere: the code suggests not.
4. Whether the 22 legacy `ENEMY_SPAWNS` land on walkable ground inside the `wolfveil-caves`
   region scene.
5. Whether the five exploration nodes (placed for an older map) sit on sensible ground in
   Wolfveil, especially Soul Fragment Bloom on the town/east border.
6. Production values of `GAME3D_QUESTBOOK_ENABLED` and `GAME3D_QUEST_ACTION_174_ENABLED`, and
   whether any private worker is deployed.
7. Which provider sits behind `base44.integrations.Core.GenerateSpeech` (the code comment says
   ElevenLabs).
8. Whether the dedicated duel worker is used in production.
9. The quarry dragon's intended level (map label 12 vs code level 25 world boss).
10. What the five protected "cave mouth" points (−216,76), (−312,148), (−82,312), (122,198),
    (−138,196) were for; no current cave uses them, but their heights are pinned by tests.
11. Which world-variant switch turns on `suigenActive`, and what the Suigen map contains.
12. (Resolved: `choiceHooks` / `failureRules` are read nowhere; quest choices and failure
    conditions would be new code.)
13. Whether `base44/entities/Quest.jsonc`, `UserQuest.jsonc`, `StoryProgress.jsonc` and
    `base44/shared/questProgress.ts` are used by another page.
14. Frame-time cost of the areas on WebGPU (all measured numbers predate the WebGPU default).
15. The size of a pipeline-compile hitch when a new material first appears.
16. Whether clans relate to the three factions anywhere.

