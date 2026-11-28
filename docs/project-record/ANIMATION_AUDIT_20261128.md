# Animation audit: Fallen Sky, Duelist Adventure, Fantasy Battle (2026-11-28)

First assignment of the owner's "Master Animation Development Instructions — Fallen Sky" (§15), relayed by the hub on
2026-11-28.

- **Baseline:** `main` at `df514c34`.
- **Written by:** the animation-studio session.
- **Method:**
  - Every GLB in `public/` was read for its clips: name, length, animated channels, skin joints.
  - The code that plays them was read.
  - Facts already in this folder's records were reused, with their labels.
- **Labels:**
  - **[checked]** means read in the code or files for this audit.
  - **[record]** means taken from `FALLEN_SKY_RECORD.md`, `DUELIST_RECORD.md` or `FANTASY_BATTLE_RECORD.md`.
  - **[measured]** means a number from a run on this PC.
- Nothing here was played live for this audit.

The roadmap is in [ANIMATION_ROADMAP_20261128.md](ANIMATION_ROADMAP_20261128.md).

## 1. Tools on this PC (checked 2026-11-27/28)

| Tool | Version, place | Works now | Limits that matter |
| --- | --- | --- | --- |
| Blender | 5.2.3 LTS, `C:\Program Files\Blender Foundation\Blender 5.2` | Yes, headless: authoring, QA, previews, GLB export (the archer package was made this way) | none for commercial use (GPL; the output is the author's) |
| RGB MoCap (toyxyz) | 1.0.1, `Documents\Codex\RGBMoCap` | CLI runs; **no model files**, so no capture yet | Only **GEM-X** is licensed for commercial use. ExMR, GVHMR, FootMR and SMPL-X are non-commercial. GEM-X needs `Setup_GEMX.cmd` (the owner answers its terms prompt) and about 7 GB of models. |
| Cascadeur | 2026.3, open in the owner's window | Not driven yet: its MCP script server (port 8765) is off | **Pro Trial until 2026-12-10, no commercial use** (EULA 2025.1 §2.2(e)). Its local "Mocap (Alpha)" downloads a ~700 MB model on first use and takes one actor; its AI-cloud mocap and Kimodo are paid uploads. |
| Hardware | Ryzen 7 8845HS, 31 GB RAM, **NVIDIA RTX 4050 Laptop 6 GB** plus AMD 780M | CUDA available | One heavy GPU or Blender job at a time; C: has about 52 GB free |

The owner's rule for now is to treat all output as commercial. Game-ready files may come only from Blender, GEM-X, or a
paid Cascadeur. Trial and non-commercial tools are for internal tests only, and every clip's licence trail goes in its
manifest.

## 2. Skeletons

| Skeleton | Where | Joints | Notes |
| --- | --- | --- | --- |
| fused-male-v1 (Adam) | `characters/fused/Male_Fused_v2.glb` | 54 | Mixamo names; the bind matrices face −X (procedural poses start from the rest pose at load) |
| fused-female-v1 (Eve) | `characters/fused/Female_Fused_v2.glb` | 93 | The 54 body bones plus 39 hair bones; her clip files are about 1.7× the male's |
| Legacy v5 heroes | `characters/Artemis_Character_v5.glb`, `Getsuga_Tensho_Character_v5.glb` | 29 / 31 | Own pelvis and thigh hierarchy (not Mixamo); still handled by the fallback code |
| Duelist bodies | `characters/duelist/huntress.glb`, `masked-warrior.glb` | 55 | Mixamo names; the Duelist pack retargets at load to any Mixamo-named body [record] |
| Mounts | `mounts/faction_bear.glb` (40), `faction_tiger_rigged_v1.glb` (28) | 40 / 28 | Other pets and mounts are procedural rigs |
| Fantasy Battle goddess | per PR #446 | Mixamo names | **0 clips**; the battle still draws a 2D puppet [record] |
| Three Roads cast | `game3d/threeroads/cast/*.glb` (8) | 24 | Retired story; Idle, Talk and Walk only |

A shared Mixamo-named humanoid skeleton is already the common ground for the fused bodies, the Duelist bodies and the
goddess. Retargeting is needed for anything captured (SMPL-X or SOMA output), for the goddess, and for the legacy v5
rigs if they stay.

## 3. Fallen Sky (Game 3D)

### 3.1 Real clips that exist

| Area | Clips | Source and quality |
| --- | --- | --- |
| Locomotion | `Idle`, `Stand`, `Combat_Idle`, `Walk`, `Run` (both bodies), `Dodge_Left/Right` | Retargeted from the v5 heroes. 22 body bones plus hip movement, no fingers [checked]. Foot slip measured at 0.05–0.075 m/s walking and 0.25–0.28 m/s running [measured, retarget session 2026-11-10]. |
| Mobility pack | `Sprint`, `Swim_Forward`, `Swim_Idle`, `Glide_Hang`, `Back_Roll`, `Dodge_Forward` (+ `female/`) | Owner-supplied sources (Mixamo longbow pack run, ActionForge swim loops) and the earlier MediaPipe pipeline; `Back_Roll` and `Glide_Hang` animate only 17 channels [checked] |
| Acrobatic dodges | `dodges.glb`: `Flip_Left`, `Flip_Right`, `Back_Flip`, `Front_Roll` | Hand-authored v2, female-rig tracks (279 channels) [checked] |
| Sword | `swordCombo1..3`, `swordCharge` (both bodies) | Edited in Blender with the owner (Weapon Animation Studio) [checked] |
| Bow | `Bow_Draw`, `Bow_Sheathe` (female embedded) | `Bow_Draw` is the only embedded skill-era clip the code names [checked] |
| Embedded but unused | `GetsugaTensho`, `Chidori_Attack_01`, `Chidori_Ultimate`, `Chidori_Hit_Stun_Fall`, `Rain_Of_Arrows`, `Lunar_Beam`, `Call_Of_The_Husky` | Carried over from the v5 heroes; no code plays them [checked: no references] |
| Archer package v1 | ten clips per body (idle, nock, raise, draw, aim, hold, release, follow-through, lower, return) | Branch `claude/archer-anim-package-20261127`, not merged, not wired. Male 10/10 QA; female 8/10 (nock and lower need review) |
| Mounts | bear `Idle`/`Walk`/`Run`, tiger `Fly`/`Idle`/`Run`/`Walk` | From the creature GLBs; other mounts and pets are procedural |
| Enemies, bosses, quest NPCs, companions | idle/walk/run/kick/death from their own models | Spawners `EnemyPlayerSpawner`, `questEnemySpawner`, `boss/spawnWorldBoss`, `npc/spawnLivingQuestNPC`, `RemoteCompanionManager` [checked]; most of their models belonged to the removed map; the new campaign's cast is "awaiting assets" [record] |

### 3.2 Code-made placeholder motion (to be replaced by real assets)

| File | What it fakes |
| --- | --- |
| `player/playerMovementFallbackClips.js` | Jump start/loop/land, forward roll, death fall, and four directional dodges. A few keys on a few bones; the file calls them "last-resort visual placeholders". |
| `player/playerEightWayDodgeClips.js` | The eight-way acrobatic dodges |
| `player/playerHaloFlightClips.js` | `airJump`, `airWalkKick`, `airWalkLoop`, `airWalkFinisher`, `wingGlide` |
| `weapons/weaponComboClips.js` | Every weapon state except the four sword pack clips: two-handed sword, daggers, the bow's draw, hold, release, quick shot and run carry, the bow combos, and each weapon's idle. These are key poses baked in code. |
| `character/mountAnimations.mjs`, `factionPetAnimationRigs.mjs`, `factionThreeMountRig.mjs` | Mount and pet gaits |
| `remoteSwimClips.mjs`, `weapons/remoteWeaponCombos.js` | What other players see: baked clips, not the pack |

### 3.3 Missing entirely

The player's clip table (`player/playerNativeAnimationClips.js`) expects some slots that no file fills:

- AFK idle, backward run, and the dodge directions beyond left and right;
- a real jump set (start, loop, land) and real double-jump and air-dash moves.

Not in the table and not anywhere in the game:

- **Movement:** strafes, turn-in-place, and start, stop and pivot transitions; falls and hard landings; climbing.
- **Combat reactions:** hit reactions (directional, light and heavy), stagger, knockdown and get-up.
- **Defence:** block and parry per weapon.
- **Death and spawning:** a real death (the "standing death montage" the fallback mentions is not in the repo) and
  respawn.
- **Weapon families with no clips:** shield, spear, staff, magic casting, unarmed, dual swords, energy blades, and the
  double-bladed staff.
- **Social:** NPC interactions, emotes and social animations.
- **Story:** cinematic performances for M01–M20 and facial animation.

### 3.4 Skills without their own animation or effect

- **The skills.** There are 30 AXE core skills: three roles (offensive sword, defensive guardian, ranged), each with
  the same ten patterns (`axe/skills/AXECoreSkillLadder.js`). There is also the divine set (`AXEDivineSkillSet.js`).
  The six base skills in `skills/skillRegistry.jsx` carry an `animation_ref` and a `vfx_ref` too.
- **No code reads those names** [checked]. A cast picks its timing by cast type only:

  | Cast type | How the hits are scheduled |
  | --- | --- |
  | single hit | one strike |
  | sequential | hits one after another |
  | guardian burst | a burst of hits |
  | ranged double | two shots |
  | ranged barrage | a barrage of shots |

  Each strike then plays the weapon's ordinary swing or shot (`skills/skillExecutor.jsx`).
- **The effects are shared by everything:**
  - weapon trails (`vfx/CombatWeaponTrails.jsx`) and impact feedback (`vfx/CombatImpactFeedback.jsx`);
  - a handful of named effects: slash, lightning, frost tornado, heal, life drain, shadow teleport, wind run and bite;
  - the ascension and mount-fusion overlays.
- **Result:** none of the 30 skills has its own animation or its own effect yet. The owner's rule is one effect per
  skill, following the lifecycle (anticipation, activation, build-up, execution, impact, follow-through, recovery,
  fade).

### 3.5 Blending and transition problems already known

- **Partial blends go wrong.** In three.js, a partial-weight blend pulls toward the bind pose. Weapon montages
  therefore use a post-mixer underlay (`player/locomotionUnderlay.js`).
- **Montage limits:** strafing while aiming walks forward, aiming does not slow movement, and other players see
  full-body swings [mem `weapon-montage-20261119`].
- **Foot slip** while running (above).
- **Failing tests** in this area: remote weapon combos (4) and the weapon montage (1) [record].

## 4. Duelist Adventure (live)

- **The pack.** `animations/duelist/duelist-motion.glb` holds 144 clips (5.4 MB). They are retargeted at load onto any
  Mixamo-named body (`client/motionLibrary.mjs`) [checked, record].
- **About 80 clips come from the owner's ActionForge pack:**
  - sword, shield, punch, cast, pistol, interaction, crouch, jump, leap, slide and climb;
  - talk, fold arms, phone, yes and no;
  - hit, knockback, get-up and death.

  **Their commercial-use licence is not recorded anywhere in the repo.** That is an owner question.
- **About 64 clips were generated in Blender** (`tools/duelist/blender/weapon_clips.py`, `cut_grid.py`, `moments.py`):
  - nine-direction sword cuts in three modes, plus blades and staff cuts;
  - recoils, whirls, crosses, taunts, the roar, the Execution and Dominate.

  Their timings are mirrored in `core/cuts.mjs`.
- **Missing** [record §11]: strafe and backpedal loops, and Levitate.
- **Not reviewed:** the blades and staff cuts in every direction (DA-D10; only two characters were watched in motion).
- **Effects:** `client/vfx.mjs` (dissolve, ability effects) and 59 ability sounds. Whether every ability has its own
  effect is not audited here.
- **Open PRs #230 (class blend styles) and #232 (held jump):** they need reworded naming before any merge (DA-D9)
  [record].

## 5. Fantasy Battle / Sapphire Adventure (live)

- **Battles use 2D layered puppets.** `data/archerRig.json`, `core/puppetCore*`, and JSON skill timelines
  (`core/skillTimeline.mjs`, `data/bowSkills.json`). Every character, companion, enemy and boss shares the archer rig
  with tinted SVG layers [record].
- **The 3D goddess** has Mixamo bones and no clips. Replacing the 2D combat actor with her is blocked until the rig is
  retargeted and calibrated (PR #446) [record].
- **Not audited:** the 3D exploration world (Sapphire Wilds and Sanctuary) and its avatar animation, nor the owner's
  engine spec (a Google Doc, not in the repo).
- **Owner note, 2026-11-28:** it should play like Child of Light (mechanics only).

## 6. "Fallen Sky 2"

No project of that name exists in the repo. The owner needs to say whether it means Fallen Sky itself, a planned
sequel, or something else.

## 7. Work needed, by pipeline stage

| Stage | What it should cover |
| --- | --- |
| Capture (the owner's own footage, GEM-X) | All locomotion: walks, runs and sprints with starts, stops, pivots, strafes, backpedal and turns. Jumps and landings, hit reactions, knockdowns and deaths, NPC idles and interactions, and the cinematic performances. |
| Cascadeur (correction tests now; game-ready only after a paid licence) | Balance and centre-of-mass cleanup of captured takes, acrobatics (rolls, flips, double jump, air dash), combat weight, and body–weapon penetration cleaning. |
| Blender (works now) | Retargeting onto the fused bodies, Duelist bodies and goddess. Weapon-specific polish and grips, every skill's effects (meshes, textures, sprite sheets, timing), QA, previews and export. |
| Retargeting | Every capture (SMPL-X or SOMA to Mixamo, male 54 and female 93 joints), the goddess, and the Duelist bodies if the pack is replaced |

## 8. Licence flags

| Source | Status |
| --- | --- |
| ActionForge clips (Duelist, swim loops) | Unknown; ask the owner |
| Mixamo-sourced runs and the longbow pack | Adobe's terms allow use inside a game, but not redistributing the raw files |
| v5 hero clips | Origin not recorded |
| Meshy-made clips (Three Roads cast, reference archery) | Depend on the Meshy plan |
| Cascadeur | Trial, no commercial use |
| Archer v1 | Blender only; its licence trail is in each clip's manifest |
