# Weapon Animation Studio

Edit the game's sword, bow and dagger clips in Blender, by hand, and play the edited clips in the game.
The game bakes its weapon clips in code (`src/components/game3d/weapons/weaponComboClips.js`); a clip
exported from the studio replaces the baked clip of the same state, for every weapon of its family.
States the studio has not exported keep their baked clip. Damage, hits and cooldowns stay where the game
decides them today; a clip only decides how the swing looks and, through its markers, when it connects.

| File | Does |
| --- | --- |
| `export-game-clips.mjs` | game -> studio: every weapon clip as the game bakes it, on one fused body, with its timing (`game-clips-<body>.glb` / `.json`). States already in the pack come from the pack, so a rebuilt studio starts from what the game plays. |
| `export-reference-clips.mjs` | the owner's animations -> reference clips on the same body (`ref-clips-<body>.glb`) |
| `build_studio.py` | makes `WeaponStudio_<body>_vNNN.blend` (the next free version) |
| `render_poses.py` | headless screenshots: `action@frame` or `action@marker` |
| `export_clips.py` | studio -> game: `public/models/animations/weapons/<state>.glb` and `manifest.json` |
| game side | `weapons/weaponClipPack.mjs` loads the pack; `weapons/weaponComboBinder.js` (`setAuthoredClips`) plays it |

## Build a studio

```powershell
$studio = "$env:USERPROFILE\Documents\FallenSkyWeaponStudio"
node tools/game3d-weapon-anim/export-game-clips.mjs --out $studio
node tools/game3d-weapon-anim/export-reference-clips.mjs --out $studio
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P tools/game3d-weapon-anim/build_studio.py -- --repo . --studio $studio --body male --refs "$studio\ref-clips-male.glb"
```

`--body female` builds the female studio (its clips export to `public/models/animations/weapons/female/`).
The generated files stay out of the repository (keep the studio folder outside it; the default
`tools/game3d-weapon-anim/studio/` is ignored).

## What is in the .blend

- **Body**: the fused body at the game's scale, feet on the floor; its armature is `Male_Rig` / `Female_Rig`.
- **Weapons**: `Weapon_Sword`, `Weapon_Bow`, `Weapon_Daggers`, each parented to its hand bone exactly where
  the game holds it. Hide the families you are not editing.
- **One action per game state**, with markers:

  | Family | States |
  | --- | --- |
  | Sword | `swordCombo1..3` (one hand), `swordTwoHand1..3`, `idleSword`, `idleSwordTwoHand`, `swordCharge`, `swordTwoHandCharge`, the skill tiers |
  | Bow | `bowCombo1..3`, the shots, `bowDraw`, `bowHold`, `bowRunCarry`, `idleBow` |
  | Daggers (the defense weapon) | `daggerLight1..2`, `daggerStab`, `idleDaggers`, `daggerCharge` |

  | Marker | The game uses it for |
  | --- | --- |
  | `hit` | the contact frame: the strike lands here (or the arrow leaves the string) |
  | `sweep_start` / `sweep_end` | the blade trail and the cut's window |
  | `cancel` | from here the next press cuts in |
  | `windUp` | a held press waits here; after 0.2 s it becomes the charge |
  | `chargeFrom` / `charge` | the charge move's slow coil, from its start to its peak (reached with the full 1.2 s hold) |
  | `nock` / `full` | the bow: the arrow is on the string / full draw |

  Move a marker to retime the game; keep every marker the action came with (one that is missing falls
  back to the baked clip's time).
- **Reference actions** `ref_af_*` (ActionForge 80-clip pack: sword, shield, block, melee),
  `ref_longbow_*` (Mixamo Pro Longbow Pack: draw, aim, recoil, equip, block), `ref_meshy_*`
  (Meshy: Charged_Slash, Archery_Shot 1-3), retargeted onto this body and kept in place. Borrow poses,
  arcs and timing from them, or copy their keys into a game clip. They are never exported.
- `StudioCamera` and `StudioSun` for screenshots.

## Rules that keep a clip working in the game

- The game plays these clips as montages over locomotion: while the hero moves, the hips and legs follow
  the walk or run underneath (`player/locomotionUnderlay.js`) and the chest keeps the clip's turn. Keep the
  clip in place (no travel), the feet planted, and the upper body readable on its own.
- The game closes the hands around the grip itself after the animation, so finger keys only change the
  studio's look.
- Looping states (`idle*`, `bowHold`, `bowRunCarry`) need the same first and last pose.
- Long blades (greatsword, odachi, katana, tachi) swing the katana moves under the same state names. The
  studio's sword clips are the one-handed sword's and never play on a long blade.

## Live session with the owner

1. Start Blender 5.2 with the Blender MCP add-on enabled and its server started (`localhost:9876`), and open
   the latest `WeaponStudio_<body>_vNNN.blend`.
2. Inspect before changing: the action on `*_Rig`, the frame, the bone the owner means.
3. Change only the part the owner points at: one bone, one frame range, one key. Not the whole clip.
4. Screenshot after each change (the viewport, or `render_poses.py`), so the owner sees it at once.
5. Save each step as the next version (`File > Save As`, `..._v004.blend`): any step can be undone by
   opening the version before it. Confirm before anything destructive (deleting keys, actions, bones).
6. Export what changed (in Blender: the Scripting tab, or the MCP):

   ```python
   import sys; sys.argv = ['blender', '--', '--repo', r'C:/path/to/fallen-sky']
   exec(open(r'C:/path/to/fallen-sky/tools/game3d-weapon-anim/export_clips.py').read())
   ```

   Without `--only` / `--all` it writes the actions changed since the studio was built. `--remove swordCombo1`
   takes a state out of the pack again (the game goes back to the baked clip).
7. Check it in the game (`npx vite dev`, `/gameview`): swing, hold to charge, walk while swinging.
8. `node --test tests/game3d-weapon-clip-pack.test.mjs` before a commit.

## Limits

- Other players see the baked clips (`remoteWeaponCombos.js` bakes its own and does not load the pack).
- One variant per state in the pack: a long-blade edit would need a `longBlade` variant entry
  (`variant` action property), which the studio does not build yet.
