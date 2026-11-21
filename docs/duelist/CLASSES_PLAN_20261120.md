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

Built and tested (145 Duelist tests; checked in the browser in practice and Capture the Flag against bots):

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

Still to do:

1. **New combos.** The class weapons now have clips of their own (above); strikes by direction that chain freely
   are still to be designed and written, as rules of this game's own.
2. **Transport** (escort a payload; the other team stops it): still a "Planned" entry in the play drawer. The
   HUD has no scoreboard for it yet. **A single rotating control point** has its scoreboard ready
   (`view.singlePoint`) but no mode behind it.
3. **The home screen's starport dock** with the chosen fighter idling and looking around.
4. **Balance.** Every number in `core/classes.mjs`, `core/moves.mjs` and `core/abilities.mjs` is a first
   proposal. Bots do not use specials yet (their seats do not charge a meter).
5. **Level and EXP** are kept in the browser (`client/progress.mjs`): an account-wide level needs the match server
   to keep it.
6. Story missions are still played without a class (the first build's push, pull, grip and breach on keys 1-4).
