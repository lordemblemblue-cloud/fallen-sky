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
  - [x] Motion lab at `/duelist-lab`: every clip on every body, speed, scrub, travel, camera views
  - [x] The owner's characters (Tripo, unrigged T-pose meshes, 2026-11-18): Masked Warrior and Huntress,
    rigged by `tools/duelist/rig_character.py` (Blender, headless): the fused skeleton fitted to the body's
    own proportions (arm row, span, armpits, cross-sections), heat weights where Blender can solve the mesh
    (Masked Warrior) and region-limited distance weights where it cannot (Huntress), textures 2K. Reports in
    `tools/duelist/characters/`. Selectable as you / opponent on `/duelist-next` (Eve and Adam too).
    Re-rig: `blender -b --factory-startup -P tools/duelist/rig_character.py -- <character.glb> <out.glb> --preview <dir>`
  - [ ] Strafing and backpedal clips for locked-on movement (the pack has forward loops only)
  - [ ] Dual blades, staff and bow movesets and clips
- [ ] Phase 3: effects and sound (in progress)
  - [x] Bent space (`client/warp.mjs`): a post pass displaces the picture around Telekinesis: rings that run
    out (push, throw, resist, impacts) or fold in (pull, breach), a swirling lens round a held body, with a
    slight colour split at the bend
  - [x] Telekinesis (`client/vfx.mjs`): the hand gathers light in the wind-up; push sends a rippling cone of
    bent air, dust and a floor wave; pull folds it back into the hand; the grip binds the body with twin
    twisting ribbons, motes and orbiting shards; the throw bursts and the body trails light; Breach opens a
    violet tear; Resist rings out across the floor. No lightning anywhere.
  - [x] Floor waves (`arena.arc`): the hex lines light as a wave passes; knockdowns slam dust and a ring
  - [x] Crystal sword trails (`client/trails.mjs`), strikes only, brightness by Will
  - [x] Hits: Veil ripples and crystal shards, shield hexes, wound sparks, block and parry sparks with a
    flash, Veil collapse shatters; camera shake and a short hit-stop on heavy hits (picture only, the rules
    never pause)
  - [x] Sound (`client/audio.mjs`): all synthesized in WebAudio (no recordings): blade swings, Veil / shield /
    body hits, block, parry, push, pull, grip hum (climbs while held), throw, breach crack, resist, roll, dash,
    knockdown, Veil shatter, defeat, victory and loss stingers; placed in the world; mute button
  - [x] `client/director.mjs`: turns the simulation's steps into effects, sound, shake and hit-stop
  - [ ] Footsteps, ambience, arena music
- [ ] Phase 4: modes and bots (in progress)
  - [x] `sim/match.mjs` (tests: `tests/duelist-match.test.mjs`): practice (you and 1-3 bots, no score),
    duel (rounds, first to 3, 90 s round clock decided by who stands better), free for all (first to 15
    defeats or the most at 8 min), team deathmatch (red/blue, first to 30 or the most at 8 min), capture
    the flag (bases at each end; carry theirs home while yours is home; first to 3 or the most at 10 min;
    a carrier who falls, is knocked down or is gripped drops it; a team mate's touch returns it; 20 s
    auto-return; carriers cannot sprint). Respawns with spawn protection (ends when you act). Countdown,
    round breaks, feed, results.
  - [x] Seats: bots fill empty seats and step out when a player joins (`joinMatch`: the lowest-scoring bot
    of the team that needs a player); a leaving player is replaced by a bot (`leaveMatch`). The network
    layer (phase 5) calls these.
  - [x] Bots: objectives (take their flag, run it home, return ours, guard, hunt the thief, escort our
    carrier), standing targets over fallen ones, parries timed on the blow, punishing whiffs, Breach on a
    strong Veil then a heavy, escapes when hurt; same commands and limits as a player. Full bot matches in
    every mode finish (duel ~2 min, FFA ~5 min, TDM ~3.5 min, CTF ~5 min with captures).
  - [x] Client: any mode at `/duelist-next` (mode bar; your fighter, opponent, bot count and level), every
    fighter drawn with team colours, name tags, CTF bases and flags (on the carrier's back), score line,
    countdown and "Fight!", respawn note, feed, result board, lock-on cycles to the nearest hostile
  - [ ] Bigger arenas with cover and a CTF map with two ends (today one round arena, sized per mode)
- [ ] Phase 5: online play (in progress)
  - [x] Match server `server/duelist/` (Node + ws, the Railway pattern of the Game 2 arena server; see its
    README): many matches in one process, each the shared `sim/match.mjs` stepped at 60 Hz; the server decides
    every hit, cooldown and score; 20 snapshots a second (own cooldowns only to their owner); sign-in with the
    Base44 token once per connection (guests only with `DUELIST_ALLOW_GUESTS=1`, local testing); one
    connection per account
  - [x] Join: a mode goes to the busiest match of that mode with room or starts one full of bots; Join (any)
    goes to the busiest match that has players; the joining player takes a bot's seat; a leaving player's seat
    goes back to a bot; a finished match restarts after 12 s with the same players
  - [x] Fair play: inputs sanitised (move clamped, only known commands), presses through the token bucket,
    messages over 120 a second ignored and over 400 a second disconnect, 4 KB message cap, origin allow-list
  - [x] Browser: `net/client.mjs` draws the server's match through the same renderer as local play (a mirror
    world 100 ms behind, interpolated); inputs at most 60 a second; `/duelist-next` Online switch and Join
    button (the local test server on localhost, or `VITE_DUELIST_WS_URL`)
  - [x] Tests: `tests/duelist-server.test.mjs` (real WebSocket clients); two browser tabs verified in one match
  - [x] Client-side prediction (`net/predict.mjs`): your own fighter is played in the browser by the same
    rules the moment you press, then reconciled with the server's word (the server uses each input once, in
    order, and sends your fighter in full). What only the server knows (a hit) is eased in over a tenth of a
    second; hits on you show the moment the server reports them. Against the real server with 100 ms added
    each way, 124 of 129 snapshots needed no correction and the largest was 10 cm; in the browser with a
    150 ms round trip a key press moves the fighter in the first frame (29 ms; 303 ms without prediction).
    Dev switches (this tab only): `sessionStorage` `duelist.lag` = round trip in ms, `duelist.predict` = '0' (off)
  - [ ] Reconnect to the same seat; results saved to accounts; deployment (needs the owner's go-ahead)
- [ ] Phase 6: menus (in progress)
  - [x] `/duelist-next` hub: Story, Join, a tile per mode (with how many are playing), Practice, Fighter,
    Settings (`src/components/duelist/menu/`)
  - [x] A page per mode (`/duelist-next/duel`, `/ffa`, `/tdm`, `/ctf`, `/practice`): the rules in three lines,
    the live matches of that mode, Play online / Play against bots (practice: opponent, bots, level)
  - [x] `/duelist-next/join`: one button into the busiest match that has players (or start one others can
    join), and the list of live matches; the server's public `/lobby` (modes and head counts only)
  - [x] `/duelist-next/fighter` (saved per browser), `/duelist-next/settings` (volume, sound on/off, mouse
    sensitivity, the controls), `/duelist-next/story` (the mission: play solo, start a crew room, join by
    code, join an open crew)
  - [x] `/duelist-next/play?mode=…&online=…`: the arena with a Menu button back to where you came from
  - [ ] Key rebinding; touch controls; a fighter preview (3D) on the Fighter page
- [ ] Phase 7: the story mission, "Contraband" (in progress)
  - [x] Rooms (`sim/level.mjs`): walls, doors and cover as boxes; bodies slide along them; strikes, shots and
    Telekinesis need a clear line; a graph of waypoints for finding a way between rooms
  - [x] The depot's people (`sim/enemies.mjs`): no Will and so no Veil; gunners and marksmen with
    crystal-forged sidearms (an aimed shot has a wind-up you can see, roll through or guard), enforcers and a
    captain hand to hand, three ringleaders, and a Will user (a full duelist). Nobody acts until alerted;
    squads raise the alarm; only a few may wind up a shot at once
  - [x] The mission engine (`sim/mission.mjs`): stages with objectives, markers and hooks; held
    interactions; comms lines; a fallen player returns at the checkpoint, a fallen crew starts the stage
    again; the depot is manned for the crew's size (1 to 4)
  - [x] Contraband (`sim/missions/contraband.mjs`): open the marked crates; unlock the inner door; find the
    quartermaster, the broker and the security chief and take their ledger cores; carry them to the cargo
    lift through the lockdown; hold the lift; the recording that names the buyer; the teacher in the vault,
    who yields (nobody is executed)
  - [x] Tests: `tests/duelist-mission.test.mjs` (a piloted crew of two finishes the mission by the rules)
  - [x] In the browser (`client/depot.mjs`, `guardKit.mjs`, `sidearm.mjs`, `MissionHud.jsx`,
    `missionSource.mjs`): the depot drawn from the level (doors red shut and green open, crates that open,
    the door control, ledger cores, the lift's hold ring, beacons and on-screen markers with distance, red
    lights in the lockdown); guards in a procedural uniform over the fused bodies; the sidearm's aim line;
    objective, comms, hold-F prompt, crew, "the crew is down", "mission complete"; people out of sight are
    not drawn or animated; the camera stays in the room. All seven stages verified with the autopilot
  - [x] With a crew (`server/duelist/`, `net/client.mjs`): crew rooms on the match server (a room of your own
    with a code, join by code, or any open crew), the mission run by the server, the interact key in the
    input message; two browser tabs verified in one crew
  - [ ] Guards' models: today a procedural kit (helmet, plates) over the base bodies; the owner's own guard
    characters would replace it
  - [ ] Voices or text-to-speech for the comms lines; a second mission
- [ ] Phase 8: `/duelist` switches to the new build (needs the owner's go-ahead)
