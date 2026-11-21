# Duelist Adventure — original class animation and combo handoff
**Date:** 2026-11-20  
**Audience:** Claude and other contributors working in Emblem Blue / Fallen Sky  
**Status:** Design + integration handoff; **not implemented animation assets**. Document-only branch, no changes to gameplay, HUD, multiplayer, deployments, or existing PRs.

## Owner's direction — preserve this

Study the owner's earlier Jedi Academy / Jedi Outcast reference animations to understand the *intent* of stance, anticipation, attacks, defense and transitions. **Do not copy/paste old gameplay code, repackage the old animation files, or simply port animation keyframes.** Make **new, original, more fluent and modern** movement, and **new original combo sequences** inspired by the combat grammar: redesign poses, timing, spacing, footwork, follow-through, transitions, rhythm and strike order. Rebuild the combat implementation on the existing Duelist Adventure shared rules, not the legacy game's code. The result should not look jerky, clanking, dated, or like connected unrelated clips.

Reference: [owner's Drive game files](https://drive.google.com/drive/folders/1vNXCtPnrKPvqKP80JauIH7p5_RhzDdpK?usp=drive_link) — the listed folders include `GameData/base`, `forcecfg/light`, `forcecfg/dark`, `models/players`, `models/weapons2/saber`, `vm` and old executables. **Reference only**, not production-ready licensed game content. The linked directory has a `JediAcademy.exe`, but also old `jk2mpgame.qvm` and `Healer.fcf`, etc.; do not assume a particular animation can be decoded or legally reused merely from the file naming. We have verified folder contents, **not** completed extraction, rig/clip comparison or playback.

The actual shipped universe uses **Will, Dimensional Veil, Telekinesis and crystal blades**, not the original franchise's names or assets. Stance colour can be a review shorthand (owner: healer blue / juggernaut red); shipping terminology and VFX should use original Fallen Sky art direction.

## Existing work: build on it; do not duplicate Claude

Read these before editing:
- `docs/duelist/REBUILD_PLAN.md` — phased rebuild, Will/Veil mechanics, authored ActionForge clip pack and `/duelist-lab`.
- `docs/duelist/FOUR_CLASS_RULES_HANDOFF_20261120.md` — four class assignments, authoritative special charge and unfinished integrations.
- `src/components/duelist/core/classes.mjs` — class IDs, weapon constraints, power labels, four per class, one special per class, animation slot names. **Keep this as class source of truth** unless the owner explicitly revises it.
- `src/components/duelist/core/moves.mjs` and `fighter.mjs` — action frame windows, costs, combo routing, cancellation and anti-spam.
- `src/components/duelist/core/moveMotion.mjs` — animation timing matched to simulation and root-motion measurements.
- `src/components/duelist/client/motionLibrary.mjs` — authored clip retargeting across supported character rigs.
- `src/components/duelist/core/motionPack.data.mjs` and `tools/duelist/build-motion-pack.mjs` — existing *owner-provided ActionForge* source-to-pack pipeline.
- `src/components/duelist/sim/match.mjs` — simulation, seats and class assignment; authoritative network work remains separate.
- `/duelist-lab` — compare available clips, contact timing, natural motion, rigs and transitions.

**Current gap:** The rebuild documents already report an original owner-provided 80-clip source and a processed 58-clip motion pack. Sword and several telekinesis actions are mapped; locked-on strafing/backpedaling and dual-blade/staff combos are still listed as unfinished. The class definitions still mark class powers `implemented: false`. A class special returning a validated *intent* is not an actual executed ability. Earlier Claude rebuild PRs #90 and #91 were merged; class-selection/special-request boundaries and HUD work are in independent draft PRs. Do not overwrite those branches or pretend the missing parts are already playable.

## Class identity and ability contract

| Class | Weapon/stance | Four assigned abilities in current rules | One special/ultimate | Choreography identity |
| --- | --- | --- | --- | --- |
| **Healer** | One crystal blade, **swift** stance (owner's blue-stance reference) | Mind Trick, Speed, Levitate, Telekinetic Push | Protection and Absorption Field | Restrained, elegant, evasive; open-hand casting integrated into sword defense |
| **Juggernaut / Warrior** | One crystal blade, **heavy** stance (owner's red-stance reference) | Leap, Telekinetic Grip, Repulse, Blade Throw | Rage | Grounded weight transfer, deliberate powerful blows, aggressive advance, readable recovery |
| **Duelist** | Two separate crystal blades | Telekinetic Pull, Speed, Blade Throw, Guard and Counter | Execution with target HP gate | Alternating left/right attacks, precision footwork, quick directional changes and intelligent counters |
| **Assassin** | One double-ended crystal staff | Invisibility, Telekinetic Push, Enhanced Strikes, Mind Trick | Rear-position Shadow Execution | Continuous staff momentum, concealed starts, feints, close-range flanks and clean exits |

Do not confuse the Duelist's **two independent blades** with the Assassin's **one double-ended staff**. Do not grant every class the full reference game's power catalog. Preserve all four assigned abilities even if the HUD shows only three at once (existing rotating selector). Preserve each class's one special and authoritative meter rules. Any proposed power substitutions should be sent to the owner for approval, not silently changed.

## Original animation creation workflow

1. **Reference study (read only).** View representative legacy combat at normal and slow speed, if legally accessible, alongside `/duelist-lab` and the existing ActionForge clips. Record only abstract observations: timing arcs, attack/defense readability, foot plant, recovery, opening distance and action transitions. Create a written motion sheet; do not import original game animation binaries into the shipping asset directory.
2. **Author fresh poses and paths.** On the project character rigs, keyframe or capture entirely new animation for anticipation -> strike/contact -> recovery. Make the silhouettes, traversal arcs, hand poses, torso rotation, stagger and finishing positions newly authored. Compose fresh multi-strike sequences, rather than concatenating the originals in the same order.
3. **Separate locomotion from upper-body action where appropriate.** Add original directional idle, walk, run, sprint, strafe L/R, backpedal, stop/start and pivots while locked-on. Use controlled upper-body overlays for some casting, guard and one-handed actions; keep full-body control for leaps, rolls, executions and large momentum moves.
4. **Connect clip to authoritative gameplay.** For every strike, define move ID, clip ID, startup/active/recovery, contact frame, range/arc and cancel/buffer windows in core. Map the pose to core action timing via `moveMotion.mjs`; derive attack displacement from shared root-motion rules, not frame-by-frame client authority. Hit detection and charges remain server-confirmed.
5. **Retarget, inspect, iterate.** Use `motionLibrary.mjs` and `/duelist-lab` across male/female / Masked Warrior / Huntress, adjusting for bone roll, hand and hilt attachments, leg length and floor contact. Rework awkward motion, **not just increase playback speed**.
6. **Package and attribute.** Store only newly authored, appropriately licensed clips in a separate named pack with a source/author list and original rig/export metadata. Do not distribute third-party proprietary animation binaries from the Drive reference folder.

### Proposed initial combo choreography (new motion concepts, not current code)

These are **creative proposals** to help Claude plan unique original clips. The shared move frame data is authoritative until retuned in a separate reviewed change; these examples do **not** imply specials or combat are live.

**Healer — Defensive Flow**
- Short inside guard -> single diagonal redirect -> sidestep/retreating cut -> open-palm Push on a valid cancel, ending in a stable blue/swift guard.
- Alternative: parry/deflect -> quick riposte -> reposition toward ally -> field-cast pose when the server permits the special.
- Distinct feature: blade and non-weapon hand never intersect; spell gestures can blend from guard without an abrupt full-body reset.

**Juggernaut — Crushing Advance**
- Planted shoulder turn -> cross-body heavy cut -> short forward step with an opposing cut -> two-handed overhead finisher with clear wind-up and honest recovery.
- Alternative: guarded advance -> Grip wind-up/hold -> release -> follow-up heavy while the target's state allows it.
- Distinct feature: convincing mass and weight; avoid sliding feet, instant direction flips and untelegraphed high-damage impact.

**Duelist — Twin-Blade Spiral**
- Left blade probe -> right rising slash -> crossing center-line cut -> optional retreat-and-counter link, with different readable left/right arcs.
- Alternative: Pull to close distance -> matched dual-blade attack chain -> one deliberate feint/cancel -> counter, or special only if meter, range and HP threshold all validate.
- Distinct feature: both blades are tracked separately so trails, collisions, hands and animation paths make physical sense. Avoid perpetual spinning without purpose.

**Assassin — Shadow Staff Circuit**
- Low-profile lunge -> far-end staff sweep -> hand-roll into reverse side strike -> lateral exit; foot pivots direct staff momentum instead of teleporting the poles.
- Alternative: feint with leading end -> measured flank -> two-beat staff strike -> retreat/vanish, with execution only from a valid rear position with full meter.
- Distinct feature: staff momentum stays continuous, but every hit has a distinct contact window; staff does not cut through the character's body.

### Combo contract for implementation

Each combo in the future code should be represented by:
`classId`, `weapon`, `moveIds[]`, original `clipIds[]`, `startPose` / `endPose`, valid `chainWindow`, `cancelWindow`, `contactTimes`, `rootTravel`, `staminaCost`, `willCost`, `cooldown`, `interruptRules`, and `audioVfxEvents`. The code must validate weapon/class restrictions and reject unknown move IDs. Use existing pure-JS core data schemas rather than creating duplicate independent client rules. If a clip is missing, do not falsely advertise the combo as completed or grant invisible damage.

For the first new PR, choose **one Duelist dual-blade light chain and one Assassin staff light chain**, then add the Healer/Juggernaut variants after the clip/gameplay tests demonstrate correct timing. Parallel contributions can author rig clips or focused simulation mappings separately, but coordinate file ownership before altering `moves.mjs`, `moveMotion.mjs`, or networking. Keep current `/duelist-next` playable and old `/duelist` intact until owner sign-off.

## Quality bar: target modern, responsive 2026–27 feel

- **No visible pops:** idle -> walk/strafe -> block -> attack -> dodge -> attack; smooth return to the correct stance after hit, miss, interrupt or special.
- **No foot skating:** root travel in simulation matches animation; feet remain planted in guard, recovery, takeoff/landing and pivots. Test forward, backward, left/right, stationary, target-locked and moving.
- **Readable combat:** startup anticipates a hit; impact frame matches collision/VFX/audio; follow-through and stagger are understandable to opponents. A miss is visibly a miss.
- **Not faster just to be faster:** tune easing, rhythm, anticipation, clean curves, pose overlap, turn speed, directional movement, and sensible cancel windows. No robotic over-rotations, wrist clipping, hand switching or weapon/torso intersections.
- **Fair play:** defend, parry, dodge, counter and interrupt work with same deterministic core and server snapshots. Client visuals cannot secretly increase hitbox range, animation speed, damage, invulnerability, execution success or charge.
- **Regressions:** run existing `tests/duelist-*.test.mjs`; add frame/contact/root-motion and combo restriction tests for each new move; `npm run lint`, `npm run build`, two-client authority tests, and visual checks in `/duelist-lab`/`/duelist-next`. Do not claim these are passing until run against the changed commit.

## Collaboration plan / contributor checklist

- [x] Capture owner's constraint: **newly authored animations and newly created combos**, taking the old clips as study reference only.
- [x] Identify correct repo: `lordemblemblue-cloud/fallen-sky` (Emblem Blue / Fallen Sky).
- [x] Ground in Claude's merged rebuild (#90/#91) and four-class rules; no duplicate combat framework.
- [ ] Claude/animation owner: make a short reference observation sheet and storyboard the first two proposed chains, with timecodes/poses and rig attribution.
- [ ] Animation owner: author first original dual-blade and staff clip sets; include locked-on directional movement and transition coverage.
- [ ] Combat owner: connect clips to existing `moves.mjs` / `moveMotion.mjs` / `fighter.mjs`; use original hit frame data and fair-play budgets.
- [ ] Class power owner: implement real abilities and specials under authoritative damage/effect rules; no effect on mere request success.
- [ ] QA: test all four classes, three-visible/four-available ability selector, energy/stamina, interruption, local vs multiplayer, bots, and different rigs.
- [ ] Owner: review feel, attack readability, and class identity; approve balance and switch-over separately.

### Scope and handoff boundaries

**This document intentionally contains no raw Jedi binaries and no promise that the four-class animations or specials are already playable.** It provides the requirements and concrete next work for Claude. Keep it in a separate draft PR for review. Do not merge, replace other contributors' files, or deploy automatically. If another contributor is already editing a targeted code file, coordinate via the PR rather than overwriting the change.
