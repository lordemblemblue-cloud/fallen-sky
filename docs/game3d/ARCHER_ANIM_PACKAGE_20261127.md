# Archer animation package v1 (2026-11-27)

This is the first package from the Atom X Eve Animation Studio (`C:\Users\marcu\AtomXEveAnimationStudio`, outside
this repository). It holds ten archer clips for each fused body, in `public/models/animations/archer/`. Male clips sit
at the top of that folder and female clips in `female/`. The package also has a `manifest.json`.

**The game does not load these files.** Nothing in `src/` refers to them, and no existing clip or manifest changed. The
clips use the weapon clip pack's format (`weapons/weaponClipPack.mjs`): one skeleton-only GLB per clip, exported with the
same settings as `tools/game3d-weapon-anim/export_clips.py`. They can therefore become bow states later, but only by the
owner's choice.

## The clips

| # | Clip | Seconds | Markers | Notes |
| --- | --- | --- | --- | --- |
| 1 | `archer_combat_idle` | 2.4 loop | | Open stance about 45° to the target, bow carried low on the left, head on the target line |
| 2 | `archer_nock` | 0.8 | `nock` 0.64, `cancel` 0.8 | Right hand to a hip quiver, arrow up, set on the string with the bow upright in front |
| 3 | `archer_raise` | 0.4 | | Bow up to the target line, hook set, about 7 cm pre-draw |
| 4 | `archer_draw` | 0.5 | `full` 0.5 | Draw along the arrow line to the corner of the mouth; back tension, shoulders turn in line |
| 5 | `archer_full_draw_aim` | 0.3 | `full` 0 | Settle and expansion: draw hand 8 mm back, head tilts into the string |
| 6 | `archer_sustained_aim` | 2.0 loop | `full` 0 | Breathing hold; aim drifts under 0.25° and returns |
| 7 | `archer_release` | 0.2 | `hit` 0.0167, `cancel` 0.1 | Fingers open on frame 1, draw hand slides back along the jaw, bow tips forward about the wrist |
| 8 | `archer_follow_through` | 0.45 | `cancel` 0.15 | Held follow-through; head stays on the target |
| 9 | `archer_lower` | 0.55 | | Bow canted and lowered outside the front leg, draw hand down |
| 10 | `archer_return_idle` | 0.4 | | Settles into clip 1's first pose |

- **Sequence:** 1 → 2 → … → 10 → 1. Every join is seamless: the same pose and zero speed on both sides of each cut.
- **Loops:** the two loop clips close.
- **String and arrow:** the game draws both itself (`playerWeaponRuntime.js`), pulling the string to
  `mixamorig:RightHandMiddle1`. That knuckle sits on the arrow line at full draw. On the male body it is 0.26 m behind
  the string's rest point, inside the 0.85 m limit `updateBow` uses. The draw is 0.60 m from nock to arrow rest on the
  male and 0.57 m on the female.

## How it was made

The order of preference was RGB MoCap capture, then Cascadeur correction, then Blender mastering.

1. **Capture was not possible.** RGB MoCap is installed, but none of its models has its files yet.
2. **Cascadeur was not used.** Its MCP server was off, and its licence on this PC is a Pro Trial, which forbids
   commercial use (EULA 2025.1 §2.2(e)).
3. **So this version is keyframed in Blender, headless, from real archery references:**
   - World Archery "How to shoot a recurve bow";
   - USA Archery's NTS steps;
   - Casey Kaufhold's step-by-step form;
   - the public-domain (CC0) 2019 World Cup Final clips on Wikimedia Commons, whose frames were checked for the release
     and the follow-through.
4. **How the clips are solved.** Every frame is solved with inverse kinematics on a copy of the weapon studio:
   - feet planted;
   - the bow hand from the game's own grip transform;
   - the draw knuckle on the arrow line;
   - the head aimed down the arrow;
   - wrists turned from the forearm so they stay natural.
5. **Re-capture later.** The studio keeps a reference request so the owner can supply footage. A later version can be
   captured once RGB MoCap's commercially usable GEM-X model is installed.

## Quality checks

All checks ran in Blender on the keyed clips:

- **Feet:** no sliding (0.0 mm) and no hip travel.
- **Joints:** elbow, knee, wrist (under 80°), neck and spine limits.
- **Motion:** no one-frame spikes, seamless transitions and closed loops.
- **Bow clearance:** the bow checked against each body's own measured limbs and torso.
- **Aim:** arrow on the line within 0.3°, head on the target, and the game's string-pull condition met.
- **Markers:** in place.

| Body | Result |
| --- | --- |
| Male (fused-male-v1) | All ten clips pass. |
| Female (fused-female-v1) | Eight pass. `archer_nock`: the bow brushes the left thigh, at most 2.5 cm, as she reaches for the quiver. `archer_lower`: the bow passes 2.3 cm into the torso capsule at the start of the lowering. Both are marked `needs-review` in the manifest. |

`tests/game3d-archer-anim-package.test.mjs` checks the shipped files directly:

- each clip loads with the GLTFLoader and passes `clipBindsToActor` on the real fused bodies;
- durations and markers match the manifest;
- the sequence joins and the loops close in the exported keys;
- no game manifest or state name refers to these clips.

## Using them later (owner's decision)

The clips are slower and more deliberate than the game's baked bow states. For example, `bowDraw` takes 0.45 s from low
ready to full draw, while nock, raise and draw here add up to 1.7 s. A first mapping could be:

| Game state | Clips |
| --- | --- |
| `idleBow` | `archer_combat_idle` |
| `bowHold` | `archer_sustained_aim` |
| `bowDraw` | `archer_raise` + `archer_draw`, compressed |
| `bowRelease` | `archer_release` + `archer_follow_through` + `archer_lower` |

Either export them into `public/models/animations/weapons/` with those state names, or add a flag that loads this
manifest. Keep the game's timing rules in mind (`HoldChargeRules`, and the bow's full draw at 1.2 s).

## Limits

- Keyframed, not captured.
- The quiver exists only in the studio previews; the game has no quiver.
- Finger keys on the bow hand are replaced by the game's own grip closing.
- Checked on the bare body only, not with armour or clothes.
- File sizes match the game's own clip exporter (no key reduction): male 1.6 MB, female 2.6 MB.
