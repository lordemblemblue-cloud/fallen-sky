# Animation roadmap (2026-11-28)

This roadmap follows from [ANIMATION_AUDIT_20261128.md](ANIMATION_AUDIT_20261128.md). The order is the owner's:
essential locomotion and combat first, then class and weapon sets, abilities, ultimates, NPCs, and cinematics last.

- **Production happens in the Animation Studio** (`C:\Users\marcu\AtomXEveAnimationStudio`, outside the repo). Sources
  stay there; only runtime files and their manifests come into this repo.
- **One scoped branch and PR per pack.** Nothing changes damage, timing, collision, hitboxes or outcomes.
- **Only Implementation-ready work is built**, under this folder's rules. Anything that needs a design or story
  decision waits for the owner.

## Statuses (tracker)

The tracker uses these statuses:

1. Not started
2. Researching
3. Waiting for footage
4. Captured
5. Retargeted
6. Refined
7. Effects made
8. Exported
9. Integrated
10. Tested in gameplay
11. **Approved and completed**

There is also **Blocked (reason)**.

Nothing counts as complete without four things: a real asset, its integration into the game, its effects, and a live
gameplay check.

The machine-readable tracker is `AnimationAssets/Metadata/tracker.json` in the studio. This table mirrors it:

| Item | Status |
| --- | --- |
| Archer package v1 (Fallen Sky, both bodies) | Exported: on branch `claude/archer-anim-package-20261127`, not integrated; two female clips need review |
| Everything else in the audit | Not started |

## Phase 0: owner decisions and setup (blocking)

1. **GEM-X.** Close RGB MoCap and run `Setup_GEMX.cmd`, answering its terms prompt. Then the studio downloads its 9
   models (already approved).
2. **Cascadeur.**
   - Switch on its script server: the command "MCP.Start script server", or Settings → Launch on Startup → Launch MCP
     server. The studio then works only in new tabs.
   - Decide on a paid licence (Indie or Pro). Without one, Cascadeur output cannot ship.
3. **Footage.** Record your own reference (the instructions are in the studio's acquisition request), or approve
   downloads one by one.
4. **ActionForge licence** for Duelist's 80 source clips.
5. **"Fallen Sky 2"**: what it means.
6. **Which game goes first** for live testing. Fallen Sky is on its temporary platform; Duelist and Fantasy Battle are
   live.

## Phase 1: core locomotion, Fallen Sky bodies (replace the placeholders)

- **Scope:**
  - **Idles:** combat and AFK idles.
  - **Ground movement:** walk, run and sprint with starts, stops and pivots; eight-way strafe and backpedal; turns in
    place.
  - **Jumping:** a real jump start, loop and land, plus fall and hard landing.
  - **Air moves:** double jump and air dash, where the game already has them.
- **Source:** captured footage through GEM-X, retargeted. Where capture isn't available yet, the studio keyframes in
  Blender (the archer method), labelled as such.
- **Done when:** the clips are exported in the existing mobility-pack format (`models/animations/mocap/manifest.json`),
  played by the existing controller slots, the code-made placeholders retire, and the live check passes:
  - no foot slide: under 3 mm while planted, and the run under 0.05 m/s;
  - no snapping into or out of locomotion;
  - input is never delayed.

## Phase 2: core combat already in the game

- **The bow:** map the archer package onto the bow states, compressed to the game's timing (`bowDraw` 0.45 s). Real
  `bowRunCarry` and quick-shot clips.
- **Sword:** block and parry for the one-handed sword (combos and charge exist).
- **Two-handed sword and daggers:** real clips to replace the code-baked states.
- **Other players' view:** remote players play the same pack (`remoteWeaponCombos.js`).
- **Done when:** markers (`hit`, `cancel`, `windUp`, `nock`, `full`) match the existing combat timings, and the weapon
  clip pack test passes.

## Phase 3: defence and reactions

- **Dodges:** real eight-way dodges and rolls, replacing `playerEightWayDodgeClips.js` and the fallback dodges.
- **Reactions:** directional light and heavy hit reactions, stagger, knockdown and get-up.
- **Death:** a real death to go with the existing ash effect, then respawn.

## Phase 4: one animation and one effect per skill (30 AXE skills)

- **One move each:** an anticipation → execution → recovery move per skill, made in the studio and bound by its
  `animation_ref`. A small loader in the skill executor would read that name; it doesn't today.
- **One effect each,** keyed by `vfx_ref`, following the owner's lifecycle: anticipation, activation, power build-up,
  execution, impact, follow-through, recovery, fade.
- **Sync** sound, trails, camera and collision with the existing hit times.
- **Effects must not misstate range:** an effect's size must match the real `aoeRadius` and range, and never show more
  reach than the hitbox.
- **Order:** the role families one at a time (offensive sword, guardian, ranged), patterns 1–8 first.

## Phase 5: ultimates and divine skills

Patterns 9–10 and `AXEDivineSkillSet`, with the same lifecycle and quality-tier variants of each effect.

## Phase 6: class and weapon identity sets (design-approved only)

- **The weapon families the owner listed:** shield, spear, staff, magic, unarmed, dual swords, energy blades and the
  double-bladed staff.
- **Each family gets:** idle, movement overlay, combos, dodges, defence, specials and ultimate.
- **Built only once** the game design approves that family for the game. Until then each one is "Blocked (design)".

## Phase 7: NPCs, social and cinematics

- **NPCs:** idles, talk, gestures and interactions for the new campaign's cast, once its models exist ("awaiting
  assets" in the Fallen Sky record).
- **Cinematics:** M01–M20 performances, after the story decisions (R111 P0) and the cast models.

## Duelist and Fantasy Battle tracks (both live: small, careful PRs)

**Duelist**

- Strafe and backpedal loops, and Levitate.
- Review the blades and staff cuts on all four classes.
- Once the owner answers the ActionForge question, re-make or license those 80 source clips.

**Fantasy Battle**

- Retarget and calibrate the goddess (PR #446), then give her real battle clips.
- Unique puppets need character art first.
- The 3D exploration avatar's locomotion uses Phase 1's method.

## Performance work (alongside every phase)

- **Smaller files:** key reduction at export (the archer files are unreduced, the same as the game's own exporter);
  share skeletons and clips between bodies where the rigs allow.
- **Cheaper at a distance:** animation LODs and slower updates for far actors.
- **Effects budget:** effect pooling, using the existing `effectLightPool` and `sharedEffectLight`. Particle caps and
  quality tiers. WebGPU-safe materials. Mobile checks.
- **Never** change gameplay numbers.

## Techniques to apply (from Cascadeur's official help pages; the videos were not watched)

These come from the help articles at https://cascadeur.com/help (Mocap (Alpha), Using Mixamo Rig, Retargeting,
AutoPosing, AutoPhysics, Fulcrum Points, Constraints (Alpha), Collision Penetration Cleaning, Additive Layers,
Interpolation, Easing, Inbetweening, Ballistic Trajectory, Export FBX/DAE and GLB/GLTF).

The channel's recent tutorials were listed but not watched or transcribed: YouTube's transcript would not load in this
session's browser. They are:

- Mocap Cleanup course: rigging, best tools, limb direction and twists, keys and interpolation, splitting takes,
  import and retargeting;
- How to Animate Finishers;
- Using Constraints with AutoPhysics;
- Collision Penetration Cleaning Tool;
- Animation Layers, Additive Layers and Easing;
- Generate Animation Cycles;
- Generate Creative Animations with Root Motion;
- How to Throw Weapons.

Techniques:

1. **Capture cleanup.** Split long takes into segments. Run Mocap Cleaning on short intervals; it over-smooths strikes,
   so keep impact frames out of its interval.
2. **Retarget.** Import the fused body's FBX with the Mixamo joint mapping. Fold the arms so the elbows bend correctly
   before generating the rig. Use retargeting copy and paste. Root Motion Correction keeps the planted feet planted.
3. **Weight and balance.** Use AutoPhysics with fulcrum points (feet on the ground). Use ballistic trajectories for
   jumps and air dashes, with the centre of mass on a true arc. Keep an intentional fantasy motion when physics would
   flatten it.
4. **Penetration.** Run Collision Penetration Cleaning on the controllers of the touching parts, with hinge constraints
   on, over the interval. This is the tool for the female archer's two review clips once a licensed run is allowed.
5. **Layers.** Make idle variants and aim offsets as additive layers. Merge layers before rig changes.
6. **Timing.** Use easing handles for timing without changing paths, Bezier clamped for grounded motion, and AI
   inbetweening (120 frames at most between keys) for drafts, then key on top.

## Delivery rules for every pack

- **Before the pack:** read the repo's rigs, controllers and combat rules.
- **The pack's files:**
  - the clips, one GLB per clip per body;
  - a manifest with timings, events, QA status and licence trail;
  - a doc and a test that loads every clip on the real bodies;
  - previews from four views.
- **Its PR:** carries the test commands and results, and lists its known limits.
- **Never** overwrite newer work. **Never** merge or push `main`.
