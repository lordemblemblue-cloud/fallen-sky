# Duelist Adventure: the four classes, recap and plan (2026-11-20)

The owner asked (2026-11-20) to pick up the four-class work, recap it, choose the best kit for each class, and
finish it together with the modes, the home screen and the match HUD. This note records where things stand and
the choices made. Names and art are original to this game: Will, the Dimensional Veil, Telekinesis and crystal
blades. Other games are references for feel and layout only (fast melee duels; class-based objective modes).

## Where things stand (main 18dfa286 + the open PRs folded into `claude/duelist-rebuild-20261118`)

Done and merged:
- **Combat core** (this branch's earlier phases): Will / Veil / HP, crystal sword combos, Telekinesis (push, pull,
  grip and throw), Veil Breach, dash, resist, roll, knockdown; bots; prediction and reconnect online.
- **Modes**: Duel, Free for All, Team Deathmatch, Capture the Flag, Three-Point Control (hold 2 of 3 to score,
  `sim/control.mjs`), Football, Practice; Online quick-match (random TDM, CTF or Control); public servers with
  bot seats and overflow rooms.
- **Story**: Contraband and Saltmarch, solo or co-op crews, key rebinding, recorded voices for all 50 lines.
- **Four-class rules** (`core/classes.mjs`, PR #141): class data, queued class choice applied at spawn, a
  server-owned special meter (charged by eliminations and flag captures), special eligibility checks
  (executions, rear arc, HP threshold).
- **Home and HUD**: the hangar hub with header, Play / Story / Character navigation, the play drawer and footer;
  the glass match HUD with ability buttons, objective rails and the victory screen; the quiet, slim HUD style.

Not done (the four-class handoff's own list, plus the owner's requests):
1. No class reaches the screen: no class picker, no class request on the wire, no class weapons, no class
   powers or specials, the HUD shows the six generic powers and no special meter.
2. Only the single crystal sword is drawn and animated. The rules have twin-blade and staff move sets, but
   there are no models or clips for them (the owner's clip pack has sword clips only).
3. Transport (escort a payload to its destination; the other team stops it) is a "Planned" placeholder.
4. The home screen has no starport/dock scene with the fighter idling and looking around.
5. The match HUD layout the owner described: special in the centre, portrait with the HP bar to its right at
   the far left, abilities on the left, objective at top centre, map at top right.

## The classes (the choices)

Each class has a weapon, a passive, four abilities (three on screen, the fourth one rotation away) and a special
charged by the server-owned meter. Will pays for abilities as today; cooldowns are per ability.

| | Warrior | Duelist | Assassin | Healer |
|---|---|---|---|---|
| Weapon | one crystal blade, **red** | **twin** crystal blades | **double-bladed staff**, violet | one crystal blade, **blue** |
| Role | front-line bruiser | duel specialist | flanker | support |
| Passive | Heavy Stance: +15 % strike damage, guards break faster, less knockback taken, slower swings | Twin Rhythm: four-hit light chain; strikes drain the Veil faster | Shadow Step: longer, quieter rolls; +10 % damage from behind | Swift Stance: faster, lighter swings; healing charges the special |
| 1 | Leap Strike: jump up to 10 m and slam (stagger around the landing) | Telekinetic Pull | Veil Cloak: unseen for 4 s (a shimmer up close); striking or being hit ends it | Mend: heal an ally (or yourself) 30 HP over 3 s |
| 2 | Telekinetic Grip | Quickstep: 3 s faster movement and strikes | Telekinetic Push | Quickstep, shared with allies within 6 m |
| 3 | Repulse: push everyone around you away | Blade Throw: one blade flies out and back | Empowered Strikes: the next 3 strikes hit harder and drain Will | Levitate: rise and float for 2 s |
| 4 | Blade Throw | Guard and Counter: a short parry stance that answers a strike with a free riposte | Misdirect: one enemy loses its lock on you and cannot target you for 3 s | Telekinetic Push |
| Special | **Rage** (full meter): 5 s of double damage, +30 % speed, no stagger, grip or knockdown | **Execution** (a third of the meter): finish an enemy at 25 % HP or less within reach | **Shadow Execution** (full meter): finish any enemy from behind (rear 120°, 2.3 m) | **Sanctuary** (full meter): 5 s dome around you; allies inside take 80 % less from powers and 35 % less from strikes, and heal |

Changes from the first contract, and why:
- **Juggernaut is now Warrior**, as the owner calls it (id `warrior`).
- **The Healer heals.** The first draft had no healing at all; Mend replaces its copy of Mind Trick, and the
  special heals as well as protects.
- **Mind Trick becomes Misdirect** (Assassin only): an original name and a clear rule (lock-on broken,
  untargetable by that one enemy for 3 s).
- **Speed becomes Quickstep**, and the Healer's shares it with nearby allies, so each class's copy differs.

Balance numbers are first proposals for playtesting (`SPECIAL_BALANCE` and the class table in
`core/classes.mjs`).

## Status (2026-11-20, branch `claude/duelist-rebuild-20261118`)

Built and tested (213 Duelist tests; checked in the browser in practice and Capture the Flag against bots):

- **The four kits, server-authoritative** (`core/classes.mjs`, `core/abilities.mjs`, `core/moves.mjs`,
  `sim/world.mjs`, `core/combat.mjs`, `sim/match.mjs`): every ability and special in the table above, the
  passives, the seat-owned special meter (charged by a player's landed hits, heals on allies, eliminations and
  objectives; spent by the special). Keys 1-4 are the class's abilities, Q the special, R Veil Breach.
- **On the wire** (protocol 4): `join` carries the class, a `class` message queues a change for the next spawn,
  snapshots carry each fighter's class and effects. Bots take the four classes in turn and use their kits.
- **In the browser**: the class picker (before the fight, between rounds, while down, or from the class symbol by
  the HP bar), class weapons (red blade, blue blade, gold twin blades, violet double-bladed staff), effects for
  every ability (bursts, lasting motes, the Sanctuary dome, a thrown blade that spins, a cloaked fighter as a
  ghost of itself), and the owner's HUD (`client/DuelistHud.jsx`, `public/ui/duelist/hud/README.md`).
- **Clips of their own for the twin blades and the staff, made in Blender** (2026-11-21;
  `tools/duelist/blender/weapon_clips.py`, from the owner's clip pack): rebuilt at 60 frames a second on a smooth
  curve, each link of a chain starting from the pose and speed the one before leaves. Twin blades: a left-hand
  slash, a right-hand slash, a cut into a lunge, a turn in the air with both blades, a double chop, a stance and a
  guard. Staff: a two-handed stance and guard, three sweeps and an air turn that leave from the stance and settle
  back into it; the second hand is kept on the shaft on every body (`client/secondHand.mjs`). Every blade leaves
  its own trail. The motion lab (`/duelist-lab`) shows the clips with their weapons.
- **Flow: strikes by direction that chain freely** (2026-11-21; `core/moves.mjs` FLOW, `core/fighter.mjs`). A light
  strike takes the way the stick is held as it is pressed, relative to the facing: forward an **advance** that
  closes more than a metre, sideways a wide **sweep**, back a **turn** that cuts all round; with no direction it is
  the next link of the form's chain. Inside a strike's chain window any light strike of the form may follow, never
  the same one twice running, and a chain is as long as the form's own (sword three, twin blades four, staff
  three). Eight new clips (`swordAdvance`, `swordSweep`, `swordTurn`, the twin blades' three, `staffLeap`,
  `staffSweep`; the staff's turn is its chain's second link). A press that waits keeps its direction; the link
  count travels with the fighter (protocol 5); duelist and master bots use the advance, the sweep and the turn.
  These are this game's own rules, written from its own frame data and clips.
- **What everyone shares, and what only a class has** (2026-11-21). Shared by every fighter: strikes, guard, run
  (Shift), dash (Alt), roll (C), jump (Space), Veil Breach (R) and Resist (Z). Only its class has: its four
  abilities (keys 1-4) and its special (Q). The rules refuse another class's ability, a Telekinesis power the kit
  lacks or another class's special however it is asked for (`core/fighter.mjs` `blockedReason`), and a browser can
  only ever send the key, never a move's name (`tests/duelist-kit-and-keys.test.mjs` checks every class against
  every ability).
- **Class levels** (2026-11-21; `core/progression.mjs`, `core/ranks.mjs`). Each class has its own level, 1 to 20,
  from EXP earned in matches with that class (12,160 EXP to the top). Abilities have five ranks: every fifth level
  (5, 10, 15, 20) adds a rank to all four, so they are maxed at level 20. The special has three tiers: as learned,
  improved at level 10, final at level 20. A rank changes damage, reach, how long an effect lasts and how soon the
  ability is ready again; timings and costs never change. A level reached in a match fights from the next spawn.
  Bots fight at the players' average level.

  | Special | Level 1 | Level 10 | Level 20 |
  |---|---|---|---|
  | Rage | 5 s | 6 s | 7 s |
  | Execution (target's HP at most) | 25% | 30% | 35% |
  | Shadow Execution (angle behind, reach) | 120 degrees, 2.3 m | 150 degrees, 2.5 m | 180 degrees, 2.7 m |
  | Sanctuary (radius, time, healing) | 6 m, 5 s, 5 HP/s | 7 m, 6 s, 6 HP/s | 8 m, 7 s, 7 HP/s |

- **Passives that grow with the class** (rank 1 to rank 5): Warrior, *Heavy Stance*: strikes 15% to 24% harder,
  knockback moves it 15% to 35% less, swings a little slower. Duelist, *Twin Rhythm*: each link of a chain hits 3%
  to 7% harder than the one before it; strikes drain the Veil faster. Assassin, *Shadow Step*: rolls 25% to 38%
  farther, strikes from behind 10% to 26% harder. Healer, *Swift Stance*: faster, lighter swings; unhurt for 4 s it
  mends itself 1 to 2 HP a second; healing an ally charges its special.
- **Who keeps a level.** The match awards the EXP (`sim/match.mjs`). Offline, this browser keeps each class's EXP
  (`client/prefs.mjs` `classXp`). Online, the match server keeps it per account and decides the level
  (`server/duelist/progress.mjs`): a browser's claim is never read. It is kept in a JSON file when
  `DUELIST_PROGRESS_FILE` names one on a disk that lasts; without it, online levels last only while the server
  runs. Offline and online levels are separate until the account's own store holds them.

- **The sword cuts by direction, in three modes** (2026-11-21, the owner's design; `core/cuts.mjs`, clips from
  `tools/duelist/blender/cut_grid.py`). The keys held as the strike is pressed pick the cut, and the blade travels
  toward the key: W straight down the middle, S the same line upward, A and D flat cuts, W+A and W+D diagonals
  downward, S+A and S+D diagonals upward; standing still is a flat cut to the left. Three modes share those nine
  lines (X goes round them; three pips under the weapon's name): **swift** is quick and light, **balanced**,
  **heavy** winds all the way out, takes longer and hits hardest.
  - *One motion out of several.* Eight points round the body each have one pose of the whole body, and a cut is
    the way from one to another, so the pose a cut ends in is the pose another starts from. A cut that follows in
    the chain window carries on from where the blade is: the nearer the last cut's end to this one's start, the
    more of the wind-up it skips, and straight back along the line lands about one and a half times sooner. The
    same key twice running comes back along its own line. A chain is three cuts.
  - *A second press hard on the first* (within 0.16 s) turns the cut into a move of its own, by where the stick
    points then: the same way, the **whirl** (a turn that cuts all round); to one side, the **cross** (a turning
    cut that sweeps wide); back the way it came, the **backhand** (it carries on round behind the body). One
    cooldown of 2.5 s covers all three.
  - *No spam.* One press, one cut; a press too early in a cut is dropped, one in the cut waits its turn (a quarter
    of a second at most); the same cut is free again once it has run out.
  - *New clips*: 27 cuts and 3 backhands made in Blender from the stance alone (planted feet, a step with the
    cut, wrists kept inside their bend); the whirl and the cross play the pack's spinning cut and turning
    backhand. These are this game's own rules and motions; nothing is taken from another game.
  - *Move while you cut.* A cut by direction does not root the fighter: the stick still moves the body through it, at
    a share of the running speed (swift 85%, balanced and the staff 70%, the twin blades 85%, heavy 50%). The
    animator plays the cut on the trunk and arms while the legs keep walking; standing still, the cut's own legs show.
  - *A class has its own style* (the owner, 2026-11-21): the Healer cuts swift with a guarding free hand, the Warrior
    heavy, the Duelist with twin blades, the Assassin with the double-ended staff. The mode key is only for a fighter
    with no class.
  - *Twin blades and staff cut the same nine lines*, each in one mode of its own (18 clips). Every twin-blade cut
    has a leading hand: the right blade leads what travels to the left and the cut down, the left blade what travels
    to the right and the cut up, and the other blade follows the same line in the mirror, so the two cross and
    uncross. The staff has points of its own: the right hand keeps near the hip and the far end does the reaching, so
    both hands are on the shaft through 23% to 100% of each cut. A second press hard on the first gives each form
    three moves it already had (the blades' turn in the air, sweep and turn; the staff's turning sweep, swing and
    leap).
  - *Quicker.* Every cut is about a fifth quicker than it first was; a master sword duel between bots is back to
    about a minute.
  - *When blades meet, and when a fighter falls* (clips `swordRecoil`, `bladesRecoil`, `staffRecoil`, `pushThrust`):
    a parried cut is thrown back over the weapon shoulder with the trunk rocked; the push and the pull have a clip
    of their own (the free hand drawn back to the ribs and shot straight out, open); a defeated body sheds light and
    flickers out as it falls, and is whole again when the fighter stands.
  - *Checked* (2026-11-21): in the rules, all four classes' four abilities and specials start and do their work
    (20 of 20); in a practice match, the Warrior, the Healer, the Duelist and the Assassin each start the right cut
    for the direction held; the Warrior covers ground through a heavy cut.
  - *The whirl and the cross have clips of their own* (2026-11-21, six more): each is one turn of the whole body on one
    foot with the blade carried round, the whirl to the left with the blade level, the cross to the right and rising
    from low across the body.
  - *Not yet*: two real players online; the twin blades' and the staff's three quick-press moves are still older
    clips; bots stay in their class's mode and do not pick modes; the old strikes (`swordLight1-3`,
    `bladesLight1-4`, `staffLight1-3` and the advance, sweep and turn) are off the light key; nobody but the Masked
    Warrior and the Huntress has been watched in motion; five Duelist tests fail on main itself and here (controls on
    blur, three on mastery and match boost, one special contract).

Still to do:

1. **Tuning.** The strikes by direction and every rank's numbers are first proposals; heavy strikes do not take a
   direction yet, the bots use Flow only a little, and nobody has played a level-20 class against a level-1 one.
   An online player's level is not yet in the account's own store (it is in the match server's file).
2. **Transport** (escort a payload; the other team stops it): still a "Planned" entry in the play drawer. The
   HUD has no scoreboard for it yet. **A single rotating control point** has its scoreboard ready
   (`view.singlePoint`) but no mode behind it.
3. **The home screen's starport dock** with the chosen fighter idling and looking around.
4. **Balance.** Every number in `core/classes.mjs`, `core/moves.mjs` and `core/abilities.mjs` is a first
   proposal. Bots do not use specials yet (their seats do not charge a meter).
5. **Level and EXP** are kept in the browser (`client/progress.mjs`): an account-wide level needs the match server
   to keep it.
6. Story missions are still played without a class (the first build's push, pull, grip and breach on keys 1-4).
