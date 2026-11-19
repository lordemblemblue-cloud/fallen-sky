# Duelist Adventure: rebuild plan (2026-11-18)

Owner request: rebuild Duelist Adventure's combat, animation, effects, sound, modes, menus and story **from
scratch**, on the Will system from the owner's design document ("The Fractured Veil": Will, Dimensional
Veil, Veil Collapse, Veil Breach, crystal weapons). Moderate upgrade of the feel: smoother, faster, fluent,
seamless movement ("like an anime montage"), no spam and no cheating.

Today `/duelist` runs the Game 2 engine copied from atom-x-eve-os (`src/components/game2`, `server/game2`).
That code stays untouched as a reference until the new game replaces it on the page.

## Ground rules

- New code only: `src/components/duelist/` (game), `server/duelist/` (match server), `tests/duelist-*`.
  Nothing is copied from `src/components/game2`.
- Original content only. The locally kept Jedi Outcast animation bank, sounds and maps are **not** used as
  source data. Animations are our own (baked on the rig like Fallen Sky's weapon clips, plus Fallen Sky's
  own authored and motion-captured clips); sound effects are synthesized; names follow the owner's universe
  (Will, Veil, Telekinesis, crystal weapons), never "Force", "lightsaber", "Jedi" or "Sith".
- Models: Fallen Sky's fused male and female bodies for now; the owner will add more.
- One rules core decides combat for both the browser and the server (`src/components/duelist/core/`, pure
  JavaScript, no rendering). The server is authoritative in multiplayer: clients send inputs, never damage.

## The Will system (from the owner's document)

| Layer | What it does |
|---|---|
| 1. Shield / armor plating | Absorbs incoming damage first; recharges after a pause without hits |
| 2. Dimensional Veil | Spends Will to keep the body out of reach: the harder the hit, the more Will |
| 3. Body (HP) | Takes real damage only when the Veil cannot protect it |

- **Stable Veil**, **Unstable Veil** (low Will: part of each hit leaks through, the pattern flickers),
  **Veil Collapse** (Will at zero: tangible until Will recovers; blocking, dodging and movement still work,
  never an automatic execution).
- **Veil Breach**: spend Will to synchronize with a nearby opponent's Veil for a short window; your hits
  reach their body. The defender can spend Will to resist it.
- **Will**, **Stamina** and **HP** are separate: Will powers the Veil and Telekinesis; Stamina pays for
  movement and swordsmanship; HP is injury. Losing Will never stops you from fighting with the weapon.
- **Telekinesis** replaces lightning: Push, Pull, Grip (lift, hold, crush, throw).
- **Crystal weapons**: sword (precise, strong against a weakened defense), reverse-grip dual blades (rapid
  hits that drain Will), double-bladed staff (continuous offense, area control), bow / sniper (range,
  breaks shields).

## Phases

| # | Phase | Done when |
|---|---|---|
| 1 | **Combat core** (rules, shared): vitals and the three protection layers, Veil states, Breach, stamina, actions with frame data, combo graph per weapon, cancel windows (roll into push), anti-spam (action lock, cooldowns, one buffered input, server rate limit) | unit tests for every rule |
| 2 | **Characters and animation**: three.js arena, fused bodies, locomotion that blends without pops (walk, run, strafe, sprint), roll, attacks per weapon, telekinesis gestures, hit / stagger / collapse reactions, camera | seamless transitions checked in game |
| 3 | **Effects and sound**: Veil distortion on hits, Will patterns on armor and cloak that break up as Will drains, telekinesis visuals (spatial warp, debris, crush), weapon trails, synthesized sound effects | every power and hit has its own look and sound |
| 4 | **Arena and modes**: an original sci-fi arena, Duel, Free for All, Team Deathmatch, Capture the Flag, Practice (bots and dummies), new bot AI | each mode playable against bots |
| 5 | **Multiplayer and fair play**: authoritative match server, input-only clients, rate limits, reconciliation, bots fill empty slots and leave when a player joins | two-client tests, cheat attempts rejected |
| 6 | **Menus and HUD**: simple layout, a page per mode, **Join** (puts you in any running match), Practice, loadout (crystal form), settings; HUD for HP, Stamina, Will and Veil state | every page reachable in two clicks |
| 7 | **Story mode (co-op mission)**: invade an enemy base, uncover the illegal firearms smuggling, recover the evidence, discover the bigger power behind it: your own mentor, a Will user | mission playable with friends start to finish |
| 8 | **Switch over**: `/duelist` runs the new game; the old engine is retired after the owner signs off | owner sign-off |

## Story mode outline (draft, for the owner's review)

Working title: **Contraband** (co-op, 1 to 4 players).

1. *Infiltration*: get inside the orbital freight depot of the Halvane Logistics consortium. Objective:
   find who signs off the "medical crates".
2. *The Ledger*: the crates hold unregistered crystal-forged rifles. Find the three people behind the
   shipments (quartermaster, broker, security chief). Objective updates as each is identified.
3. *Exfiltration of evidence*: the mission changes: take the ledger cores and the broker's records out
   alive. The base locks down; fight to the extraction lift.
4. *The Name*: the records point to a buyer who pays in Will-forged crystal, someone who could make the
   rifles in the first place. A recorded message plays in a voice you know: the master who taught you to
   fight. Final objective: reach the archive vault before it is purged; the mentor waits there. Boss duel
   built on Veil Breach (they cannot be hurt until your crew drains and breaches their Veil).

Writing rule from the document: characters speak because something matters to them, not to explain a
mechanic; mysteries open gradually.

## Status

- [x] Plan
- [x] Phase 1a: rules core, `src/components/duelist/core/` (tests: `tests/duelist-core.test.mjs`, 11 passing)
  - `tuning.mjs`: every number (HP / Stamina / Will 100, shield 40, regen and delays, Veil thresholds, guard,
    input budget)
  - `vitals.mjs`: the three resources, shield, Veil state (stable / unstable / collapsed) and recovery
  - `damage.mjs`: one hit through evade, guard (parry / block / guard break), shield, Veil (Will), body
  - `moves.mjs`: frame data for the four crystal forms (sword, dual blades, staff, bow / sniper), Telekinesis
    (push, pull, grip and throw), Veil Breach, Resist, roll and dash
  - `fighter.mjs`: the action state machine: chains, cancel windows (roll into push), cooldowns, one
    buffered press, stagger, grips
  - `combat.mjs`: what a landed move does (knockback, stagger, hold, throw, breach, parry)
  - `fairplay.mjs`: the server's per-fighter input budget and the allowed client commands
  - knockdown (`KNOCKDOWN`): a push or a throw that drives a body 3 m or more knocks it down; it lies, rises,
    and nothing reaches it until it stands (no juggling). A pull only drags the target into reach.
- [x] Phase 1b: arena simulation, `src/components/duelist/sim/` (tests: `tests/duelist-sim.test.mjs`)
  - `world.mjs`: bodies in a round arena, reach and arcs, roll/dash root motion, strikes moving the body by
    their clip's own travel, knockback, Telekinesis holds and throws, projectiles, teams
  - `bots.mjs`: trainee / duelist / master practice bots that only send commands (same costs, cooldowns and
    limits as a player); they wait for a fallen foe to stand (tests: `tests/duelist-bots.test.mjs`)
- [ ] Phase 2: characters and animation (in progress)
  - [x] Practice duel at `/duelist-next` (beside the current `/duelist`): player against a bot, fixed 60 Hz
    simulation, HUD (shield, Will, HP, stamina, Veil state, cooldowns; tappable power buttons), victory/defeat
  - [x] Motion pack from the owner's clip pack (ActionForge, 80 clips on the fused female rig, 2026-11-18):
    `tools/duelist/build-motion-pack.mjs` strips the meshes (`tools/duelist/source/actionforge-80.anim.glb`
    keeps all 80 clips), takes travel out of the clips and measures it, finds each strike's fastest swing,
    and writes `public/models/animations/duelist/duelist-motion.glb` (58 clips) and
    `core/motionPack.data.mjs`. Rebuild: `node tools/duelist/build-motion-pack.mjs tools/duelist/source/actionforge-80.anim.glb`
  - [x] Retargeting at load (`client/motionLibrary.mjs`): any Mixamo-named body plays the clips (the fused
    male's arm bones are rolled differently from the female's; the roll/flip pack is retargeted the same way)
  - [x] `core/moveMotion.mjs`: each move's clip and how its wind-up, contact and follow-through map onto the
    move's startup, active and recovery (the rules keep the frame data; the clip follows), shared by the
    animator and the simulation's root motion (tests: `tests/duelist-motion.test.mjs`)
  - [x] Animator: idle/walk/jog/sprint by speed; the sword chain (rising slash, diagonal cut into a lunge,
    spinning cut), the overhead heavy, Telekinesis reach/hold/throw, Breach palm strike, Resist brace; settle
    clips after a move; roll or locked-on flips; block; flinches, guard break, knockdown and get-up, defeat
  - [x] Motion lab at `/duelist-lab`: every clip on both bodies, speed, scrub, travel, camera views
  - [ ] Strafing and backpedal clips for locked-on movement (the pack has forward loops only)
  - [ ] Dual blades, staff and bow movesets and clips
- [ ] Phase 3 onward
