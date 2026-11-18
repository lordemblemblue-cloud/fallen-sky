# Game 2 · Dark Jedi duel

The Game 2 button on the Moon (Luna) dashboard opens `src/pages/Game2.jsx`, which mounts `Game2Duel.jsx`.
The duel is a small WebGL2 engine in `engine/` (plain ES modules, loaded lazily as its own chunk):

| File | What it does |
| --- | --- |
| `gl.js`, `glb.js`, `assets.js` | WebGL2 renderer, GLB loader, asset loading (`public/game2/`) |
| `g2anim.js`, `actor.js` | Ghoul2 `_humanoid` skeleton player with the original Jedi Outcast animation bank |
| `saber.js`, `fighter.js`, `combat.js` | Raven saber move state machine, locomotion, blocks, hits, blaster bolts |
| `forcerules.js` | **Pure Force rules ported from `w_force.c`** (see below), unit tested |
| `force.js` | Force powers for the player *and* the Dark Jedi (same class, same costs) |
| `darkjedi.js` | Dark Jedi brain: saber fencing + Force use picked by range, Force left and cooldowns |
| `executions.js` | Finishing moves (R): Grip crush, the Pull · Lightning · Speed cut, and the Counter's Speed cut |
| `teamMatch.js`, `levels/` | Offline skirmish modes (FFA, TDM, CTF, Sudden Death) and the authored Skybridge Citadel arena |
| `game.js`, `hud.js`, `input.js`, `audio.js`, `fx.js`, `world.js` | Game loop, rounds, HUD, input, sounds, effects, arena |

## Saber, movement and aim rules (checked against the original source)

Both modes share these rules; each line names the Raven source it follows.

| Rule | Source |
| --- | --- |
| The ignited blade is traced every step and always cuts what it touches. Outside an attack, contact deals stance-scaled touch damage every 200 ms (Fast 2 · Medium 3 · Strong 4.5) | `w_saber.c` `CheckSaberDamage` (idle wound) |
| During an attack move a contact deals the stance damage (12 / 18 / 28, x1.6 specials) and the same blade may hit that target again 100 ms later (300 ms after a block). Non-Jedi take x1.5; back attacks and the jump slash cannot be parried | `CheckSaberDamage` (attack wound), `WP_SaberCanBlock` |
| The torso follows the view: the view yaw and 75% of the view pitch are spread over `lower_lumbar` 30% · `upper_lumbar` 30% · `thoracic` 40%, so the mouse steers the swing and looking down drives it toward the ground. NPCs pitch toward their target | `cg_players.c` `CG_G2PlayerAngles` |
| No strafe cycles: sideways and diagonal movement play run / walk with the legs turned up to 60° toward travel; backpedalling uses the back cycles. Standing, the legs hold until the view is 40° away, swing at 300°/s and never trail by more than 90° (turn-in-place steps while they catch up) | `bg_pmove.c` `PM_Footsteps`, `CG_SwingAngles` |
| Story mode Bryar pistol: 10 damage, 40 m/s bolt, 400 ms between shots; hold alt fire to charge in 200 ms steps (up to 10 x 5 x 1.7 = 85) | `bg_weapons.c`, `g_weapon.c` `WP_FireBryarPistol` |
| A strike is committed: once the attack itself plays (after the wind-up) the mouse no longer turns or pitches the body until it ends. During the wind-up a deliberate mouse flick (60 px) re-aims it: down = vertical, down-right / down-left = diagonal going right / left, sideways = horizontal | Game 2 addition (mouse-directed swings) |
| Standing still, a swing plays on the whole body as authored. Over running or jumping legs the torso keeps the attack's own hip turn (`G2Rig.matchHips`), so a vertical chop lands in front instead of ~70 degrees to the side | Game 2 addition |
| Academy forward jump attacks: single saber, Medium/Strong, W without strafe, rising faster than 100 units/s (2.5 m/s), feet below 32 units (0.8 m) above the current floor, and 25 Force. Start the attack while jumping; the old 500 ms conversion is commented out in Academy. Strong launches at 300/280 units/s, Medium at 150/400; landing preserves the move | JA MP `bg_saber.c` `PM_SaberAttackForMovement`, `PM_SaberJumpAttackMove`, `PM_SaberFlipOverAttackMove` |
| Wall run: Force Jump level 2+, W+A or W+D toward a nearby real wall plus a fresh Space press; release and press Space again after 400 ms to kick away. The 1.85 s source clip includes its 500 ms release tail; loss of contact plays the stop clip. New Space from an air approach can attach too | JA SP `PM_CheckJump`, `PM_AdjustAngleForWallRun`; air-approach side-run continuation is a Game 2 extension |
| Interrupted animation fades keep the displayed pose; returning the torso to locomotion blends over 120 ms | Game 2 rig-fitting/presentation adjustment; see `docs/game2/ACADEMY_COMBAT_REVIEW.md` for source boundaries |
| A slash from the air holds its strike until 100 ms after landing and leans into the ground; a downward slash aimed at the floor does the same. A blade that reaches the floor sparks, plays the wall-hit sound and leaves a scorch | `w_saber.c` world trace + Game 2 addition |

## Main menu

Game 2 opens on `Game2Menu.jsx`: a menu down the left (Story Mode, Multiplayer, Skirmish, Duel Practice, Settings,
Controls, Exit to Luna) with the chosen page on the right, over a live background: two AI fighters duel in the arena
(the engine's `attract` mode) under a slow camera, with a drifting starfield. Settings (mouse sensitivity, invert Y,
volume, field of view, quality, FPS counter, menu motion) are kept in `settings.js` / localStorage and read when a match
starts. The lightsaber picked in Skirmish or Duel Practice (single, dual sabers or a double-bladed saberstaff) is kept too.

**Multiplayer** now selects a right-side option panel without leaving the main menu: **Browse Servers**, **Host a Match** and **Offline Practice**. Browse opens the actual full-screen Railway multiplayer lobby; Host enters that lobby with the create-server dialog ready when authenticated hosting is available; Offline Practice starts a local Dark Jedi duel. **Duel Practice** also starts the offline Dark Jedi duel described here.
**Skirmish** runs the offline AI modes (`docs/game2/team-ctf-sudden.md`): Free for All, Team Deathmatch, Capture the Flag
and Sudden Death, on Skybridge Citadel (fortresses over a chasm, energy bridges a console switches off, fatal falls) or
one of the three Raven duel arenas. **Story Mode** runs story missions on the *same* combat code: the saber, Force, block,
damage and bolt rules above are shared, not copied. A mission only adds a level, objectives and enemy behaviour around them.

| Module | What it does |
| --- | --- |
| `level/builder.js`, `level/kit.js` | Plain-data floor plans (walls with doorways, rooms with ceilings, ramps, cliffs, doors) → collision triangles, ray boxes and meshes |
| `level/space.js` | Walking collision (the same `BSPCollision` the Raven arena uses), sliding doors, ceilings, zones, line of sight, bolt and camera rays |
| `level/nav.js` | Navigation grid built from that collision, A* with path smoothing, door aware |
| `brains/` | Brain registry (`kind` → AI). `trooper.js`: sight / hearing, firing distance, repositioning to spots with a clear shot, bursts, rolls away from swings, search, officers rally. `companion.js`: Jan Ors follows and shoots. The duel brains are registered unchanged |
| `archetypes.js` | Combatant data (stormtrooper, officer, Jan, and `reborn` = the duel's Reborn value for value) |
| `mission/director.js` | Objectives (zone / clear groups / use console / hold a terminal), triggers, spawn groups, doors, checkpoints, dialogue, barks, mission HUD, results |
| `missions/kejimPost.js` | Mission 1 · Kejim Post (Expanded Remaster), original geometry and dialogue |

Brains only press the same buttons the player does (`Fighter.cmd`), so every character obeys the same rules.
To add a mission, write `missions/<name>.js` (layout + groups + objectives) and register it in `missions/index.js`.
`tests/game2-mission.test.mjs` builds the level headless, checks navigation and doors, and plays the mission
through the real director, including a checkpoint restart.

## Online multiplayer: public FFA and team rooms

The lobby offers four maps (Skybridge Citadel, Lightsaber Training, Hangar Duel and Carbon Chamber)
and two online modes. Each map has a separate **Free-for-all** room for at most **100 human players**,
plus a separate **Team Battle** room with up to **50 Jedi** and **50 Dark Jedi** (100 total).
Jedi/Dark Jedi is only cosmetic in free-for-all. In Team Battle the factions are actual opposing
teams: shared-side combat RPCs are blocked by the relay and friendly fire is disabled in game
combat rules. Players can join any non-full public match with their existing Atom XE login,
without an invite or a private host. A first join opens the room automatically. Optional Reborn
AI is available only in free-for-all and never counts as a human slot.

These are *admission limits*, not a completed load-performance guarantee. The WebSocket relay
still fans out state updates to all clients in a room and each browser currently keeps remote
fighter puppets. Snapshot rates scale down in bigger rooms; stress testing a true 100-person
match, client framerate/LOD, bandwidth, visibility-based interest management and server-side
combat authority remain important before certifying AAA-scale live combat.

The Railway `server/game2` service must be redeployed after merging the code, otherwise the
lobby will detect and warn about missing modes or maps on an older live relay. Game state is
client-owned today; Railway authenticates users, verifies room, enforces player and side caps,
filters same-side RPCs, and relays positions and combat events. On leaving, the arena host role
transfers to the longest-standing player. A defeated fighter respawns with temporary protection.

| Module | What it does |
| --- | --- |
| `Game2Lobby.jsx` | Callsign, look, how many are in, Enter the arena, offline practice. Needs a signed-in account |
| `net/signaling.js` | The arena record and the WebRTC offer / answer through the app backend: `base44/entities/Game2Room.jsonc` and `Game2Signal.jsonc` (the pattern the voice chat uses with `VoiceSignal`). `?g2net=local` uses the tabs of one browser instead, for testing |
| `net/mesh.js` | One WebRTC connection per pair of players (full mesh, no server hop). Channel `u` (unordered, no retransmits) for snapshots and pings, `r` (reliable) for hits and Force |
| `net/session.js` | Arena host / joiners, 10-player cap, host hand-over, merging two arenas, relay through the host when two players cannot link directly |
| `engine/netgame.js` | Game sync: snapshots (60/s, 30/s above 6 players), other players' fighters, remote hits and Force, host-run AI Reborn, respawns, scoreboard, online HUD |

Authority and latency: every player simulates their own fighter, so moves, swings and Force answer on the next frame and
never wait for the network. Other fighters are shown at their extrapolated current position and updated every rendered
frame. A blade contact is resolved by the attacker and applied by the victim's game; a push / pull is resolved by the
victim's game with its exact state (counters and blocks per `w_force.c`). Measured on one machine over a real WebRTC link:
0.45 ms round trip, a snapshot reaches the other player 1.3 ms after the action and shows on their screen within one frame
(6 ms at 144 Hz); sending costs under 0.05 ms per step. Over the internet the ping is the distance between the players
(typically under 65 ms in the same region). ICE servers come from the `getIceServers` backend function (STUN, plus TURN
when configured; without TURN, two players behind strict NATs cannot connect directly).

## Fleet Assault (space battle, 40+ players)

Republic against Separatist cruisers, two a side, each led by a Jedi commander. Plan, open questions and protocol:
`docs/game2/FLEET_ASSAULT_PLAN.md`. Unlike the arena, **the match is server-authoritative**: `server/game2/fleet/` runs
it on the Railway server (a join with `mode: 'fleet'`), and the same dependency-free code runs inside the page for
practice against AI pilots, so practice and online play by identical rules.

| Module | What it does |
| --- | --- |
| `server/game2/fleet/rules.mjs` | Every tuning number (provisional until the owner's design document): roles, ships, cruisers, commander curve, ground phase |
| `server/game2/fleet/flight.mjs` | Flight model shared by server and client: throttle, boost meter with drift, pitch / yaw / roll, lasers with heat |
| `server/game2/fleet/match.mjs`, `bots.mjs`, `hub.mjs` | The match, the AI pilots that fill it to 40, matchmaking |
| `fleetAssault/client/fleetClient.js` | Quake 3-style prediction: 16 ms commands, replay of unacknowledged ones on each 15 Hz snapshot, other ships drawn 120 ms behind |
| `fleetAssault/client/transport.js` | In-page practice server (`LocalFleetTransport`, `?fleetlag=120` adds latency) or Railway (`RailwayFleetTransport`, refuses a server without Fleet Assault) |
| `fleetAssault/client/spaceView.js` | The space scene on `engine/gl.js`, unchanged: its own `Renderer`, a rolling chase camera, ships and cruisers from `geo()` boxes, lasers / engines / explosions / stars as billboards |
| `fleetAssault/client/fleetHud.js`, `flightControls.js`, `fleetAudio.js` | 2D HUD, mouse-stick controls on `engine/input.js`, synthesised sounds |
| `fleetAssault/FleetFlight.jsx`, `Game2FleetAssault.jsx` | The session (overlays, scoreboard with commander reassignment, commander orders in the Esc menu, the planet schematic) and the launcher (with the practice-only boarding drill) |
| `fleetAssault/boarding/cruiserInterior.js` | The inside of a cruiser on `level/builder.js` (hangar, engineering, generator decks at y = 4, bridge at y = 8); every station on the point and height `rules.mjs` `INTERIOR.stations` checks |
| `fleetAssault/boarding/boardingNet.js` | The match glue for the engine's `Game.net` hooks (as `netgame.js` is for the arena): reports `st`, `fx`, `hit`, `npc`, `plant` / `defuse`; puppets for other bodies; runs the trooper garrison and the AI stand-in commander |
| `fleetAssault/boarding/bodyPose.js` | A fighter's pose as the integer list `rules.mjs` `POSE_FIELDS` checks (the fields of `netgame.js` `snap()`), and a puppet taking it on (as `netgame.js` `updatePuppet()`) |
| `fleetAssault/boarding/interiorView.js` | Loads the engine the first time the body is put aboard and runs a `Game` in `boarding` mode for that ship |

Progression (the owner's design, after Battlefront II): points from score and kills buy, on the deploy screen shown
when you are destroyed and in warm-up (keys 1-3 ship, 4-6 on foot, or the Esc menu), the next ship level (fighter,
command ship, Jedi / dark Jedi fighter) or level on foot (trooper, heavy trooper with grenades and a personal shield,
Jedi). The server pays for it at launch and only accepts the hit kinds that kit has. Costs are provisional
(`SHIP_TIERS` / `TROOPER_TIERS` in `rules.mjs`); the owner's nine ship models are not used yet (see the plan).

Controls: the mouse steers a stick that springs back to centre (arrows too), A / D roll, W faster, S brake, Shift or
Space boost, left mouse lasers, T lock the enemy nearest the reticle, right mouse or F missile once locked, R back to
the hangar, Esc menu (roles), Tab scoreboard, H help. Commanders: 1–4 broadside focus, J hyperdrive jump, M mark.
Boarding (the owner's design): a boarding craft flies into the enemy cruiser through the hangar tunnel at mid-hull;
the force field at each mouth lets enemy ships in only while that cruiser's shields are down (a closed field throws
you back out, damaged), and crossing the point deep inside loads the interior. HUD markers show each enemy hangar.

**Aboard a cruiser** (a boarding craft flew in through the hangar, or a commander / guard on their own ship) the space view gives way to the
ship's interior on this engine: the same saber, Force, block and bolt code as the duel and Story Mode, with the duel's
controls (F1 lists them). E at a station plants a charge (enemy ship) or defuses one (own ship); Esc opens the menu, which
carries the commander's orders (broadside focus, hyperdrive jump) and can show the battle outside. The match server
owns every HP, so Heal and Drain are not offered aboard. The kit follows the trooper level the server gave the body
(`you.b.tier`): a trooper carries Story Mode's Bryar pistol and no lightsaber or Force, a heavy trooper the pistol, a
grenade launcher on the right mouse button (`engine/launcher.js`, damage through `Combat.damage`) and a personal shield
that soaks damage first as it does on the server, a Jedi (and every commander) the lightsaber and the Force. Only the
hit kinds of that kit (`you.b.kinds`) are reported. What crosses the network:

| Message | When |
| --- | --- |
| `st` | twenty times a second, and at once (at most 30 a second) when the saber move, status or held power changes: the position, never more than 2 m from the last report (what the server's speed check takes 50 ms later), and the pose (`bodyPose.js`). A server from before the relay (welcome `proto` < 2) gets `pos`, position only, ten times a second |
| `hit` | a blow our combat code landed on another body: the raw damage and its kind (`saber` for the blade, `force` for Force and the thrown saber, `bolt` for a blaster or reflected bolt, `explosion` for a grenade), paced under the server's per-hit and per-second caps; the server applies the commander curve |
| `fx` | a Force effect our player put on another player's puppet (a push or pull to resolve, a grip, a levitate, a stagger or knock after our blow, lightning, a blade block) for that player's page to resolve with their own fighter; their answer to a push (`throwRes`) and a break-free from their grip come back the same way. A cast, saber sparks and a taunt go to everyone aboard. Only what our level's kit has (a trooper casts no Force; `rules.mjs` `RELAY.needs`, which the server checks too). No damage: that is `hit` |
| `npc` | the garrison and the AI commander run in each boarder's page: a trooper we kill is a `kill` (paced to the server's interval; the copy here follows the server's count), their damage to us is a `hurt`. Damage our page took resolving another player's effect (a push's knock) is a `hurt` naming them (`by`): the server takes it only within 3 s of an effect from them, and credits them |
| `plant` / `defuse` / `cancel` | E at a station, E again to stop |

The server relays poses (`fr`, every tick, unreliable) and effects (`ff`, reliable) only between bodies in the same
area, after checking each pose field's range, an effect's size and kind, the side (pushes, grips... only on the other
side), the distance, and a rate per body (`rules.mjs` `RELAY`). A relayed pose carries the position the server accepted,
not the one the page claimed. Other players are then drawn the way the online arena draws them: their animation layers,
swings and stance, Force poses and held powers (the grip beam, lightning), knockdowns and getups, at the relayed
positions 90 ms behind. A body without a pose stream (the AI stand-in of our own ship) walks between snapshots.

The AI stand-in commander is the duel's Dark Jedi brain (`brains`' `darkjedi`, the Reborn's values) with the commander
curve on its fighter: damage taken (x the strike-team bonus for a strike-team player), damage dealt and Force regen
follow `commanderModifiers()` of the snapshot. It wakes when someone comes up to the bridge and fights within 3 m of its
post, because the server keeps that body on the bridge and checks every blow's range from there. A human commander's
own fighter takes the same curve from `you.md`.

QA: `node --test server/game2/tests/*.test.mjs tests/game2-fleet-client.test.mjs tests/game2-fleet-boarding.test.mjs`,
then `npm run build`, then practice in a browser: launch, boost through a turn, lock and fire, die and relaunch, play a
commander and a saboteur; with the boarding drill, fly into an enemy hangar as a saboteur and plant on the hyperdrive, and as a strike team
fight the commander on the bridge.

## Controls

Move with WASD, hold Shift to walk, Space to jump (hold for Force Jump), C to crouch/roll,
R to draw/holster saber, and press Tab to cycle Fast / Medium / Strong lightsaber stances.
Left mouse attacks; aiming the camera up or down during a slash selects an upward or downward animation
and aims the displayed blade and collision in that direction. Slashes sample the full blade sweep
and the opponent's movement between frames, including crouched and grounded targets.
Hold right mouse to send the saber out and keep it spinning at range, steering toward the camera aim;
release right mouse to recall it. This works while jumping or Force-jumping as well. Thrown at a fighter it homes in, and
when it hits it lodges and keeps spinning inside them, cutting, until it is recalled or pushed loose. Thrown mid-roll it
leaves from chest height in front of you and flies straight out the way you look, level (or a little up if you aim up)
while you tumble (the
tumbling hand is no launch point), and it keeps flying while you roll.

**Academy roll stab:** with original Academy frames loaded, held attack during the last 250 ms of a forward roll
selects `LS_ROLL_STAB` / `BOTH_ROLL_STAB` for Single, Dual and Staff, costing 25 Force. The original body animation
and grip determine the blade; it does not home toward an enemy or force the hilt into an invented pose. Backward and
sideways rolls do not become a forward stab. The original roll speed/clearance checks and staff SoulCal roll-cancel
window are used. The older JO lunge-based rolling thrust remains only when the Academy motion is absent.

Both mouse buttons together start one of five original whole-body katas (50 Force). Fast, Medium, Strong, Dual and
Staff each retain their native move ID, clip, playback duration and recovery. A click released between frames is
latched too. Missing original frames refuse the special without charging Force; no unrelated slash chain is substituted.
The existing Game 2 damage model remains separate from native animation fidelity. A right click alone waits 0.1 s
for the left one, then resolves a throw or directional staff kick.

Backtick (`) opens the lightsaber menu in all native Game 2 mounts. Choose Single, Dual or Double-bladed staff;
Esc/backtick returns to play. The match keeps running. Finish an action and land before switching, so selecting a kit
cannot cancel a special, wall exit, roll, throw or Force cast. Returning to Single restores its previous style.

R on a foe that glows red (at or under 25% health, in front of you) executes them: within 3.6 m a Force Grip that crushes
their throat, further out (up to 10 m) Force Pull, Lightning, then a Force Speed dash that cuts them in half. For 1.6 s
after the Counter's strike leaves a foe that low (within 4 m), R is the Speed cut instead (`speedCut`): no pull, no
lightning, a Force Speed dash right past them, the saber cutting them in half at the waist on the way. T taunts.

**Force quick-cast (hold a key for channeled abilities):**
1 Push, 2 Pull, 3 Grip, 4 Lightning, 5 Heal, 6 Speed, 7 Mind Trick,
8 Rage, 9 Protect, 0 Absorb. The numeric keypad also works. Hold 1 to charge Force Push (farther and harder, more Force); held the full 3 s it is pushed with both hands and throws them twice as far.
G is Force Levitate: lifts the foe (or prop) in front of you helplessly for 3.5 s so you can get away (any hit drops
them; a Force Push launches them). X unleashes Force Repulse once its meter (filled by damage and defeats) reaches 80%, the
way Starkiller does it: you rise, curl into a ball while the Force gathers, then burst open with your arms flung wide;
everyone within 7 m is blasted outward and disintegrates in the air, and you float back down.

**Mind Dominance (`dominance` in `engine/executions.js`):** V, at 55% of the same meter, takes the mind of the foe in
front of you (within 15 m, on their feet, with a saber in hand or on the belt, at any health). Their blade goes out, the
hilt comes into both hands and turns around against their solar plexus while they tremble (the first frame of Jedi
Outcast's `BOTH_WALK9` holds the hands together; `Fighter.hiltPose` places the hilt), then they ignite it through
themselves - the blade comes out of the back - and sink to their knees and fall (`BOTH_DEATH18`); the caster holds the
mind trick (`BOTH_MINDTRICK1` at its peak). A saberstaff's other blade stays off.
A foe holding Force Absorb resists it and nothing is spent. AI fighters use it on a foe below 60% health. Repulse (X)
costs 80, Mind Dominance 55; the meter shows both marks.

**Counter:** a block can parry the attacking blade away (25% for the player, more mid-parry; the AI by skill). The
attacker is thrown open, arms over the head (the strong style's broken top parry, held), unable to guard for 0.9 s,
with a heartbeat of slow motion; 0.12 s later the defender strikes on their own (a click strikes at once) - the strong
top-to-bottom cut, stepping in, unblockable, twice the damage - and a killing one splits the victim down the middle (a
vertical cut: the halves fall away to either side). One that leaves them at 25% or less opens the Speed cut (R, above).
The AI strikes on its own the same way when it parries you, and can Speed-cut you too. Offline modes only.

**Force Dodge (`Combat.tryDodge`, `Fighter.startDodge`):** Incoming lightsaber strikes check Force Dodge *before* automatic saber parry, so the player has an independent 30% chance to move away automatically (AI chance scales by skill). Passive dodges are free. Holding **Q** raises the chance for an eligible incoming hit to 100%, provided at least **15% of the maximum Force meter** remains, and each successful Q-assisted dodge spends exactly that amount. Holding Q without an attack does not consume Force or trigger a dash. With less than the required Force, the normal passive chance still applies. Both forms share a 1.5 s cooldown; existing Counter critical strikes remain undodgeable. Each dodge is a blue flash-step with afterimages and a Jedi Outcast directional dodge animation. **Q+A/D** chooses a side, **Q+S** retreats, and **Q+W** curves around a nearby attacker to their back; without direction it dodges to an unobstructed side. Floor and wall collision checks remain active. Offline games and the online arena use the same reactive dodge logic. In the online arena, the defending player resolves the dodge with their own live Q input; Fleet Assault boarding keeps its existing server-controlled hit protocol.

**Force clash (`engine/clash.js`):** two pushes meeting (you push someone who pushed, or answered a push of, you in the
last 0.5 s), or two lightning streams meeting, lock both fighters in a clash for 3 s. Click as fast as you can: where
the two meet drifts toward whoever is losing, and the one with more clicks wins. Two pushes meet as a ball of shoved air
in the middle, each side's pressure front (a ring that grows with its share of the clicks) bearing on the other, air
squeezing out sideways - nothing is drawn back to either caster. Two lightning streams fork from both hands of each
side into a crackling ball where they meet. When time is up the winner's blast drives through to the loser (0.28 s, the
loser's own stream gone) and the loser is blasted away (or electrocuted and thrown down); a tie throws both back, and
anyone else's hit breaks it. AI fighters who keep their feet often push back, and click at their own pace. Offline
modes only. (Pressing Lightning, 4, while still holding a Push charge on 1 is the separate lightning push; unchanged.)

**Force Lightning (4):** a freely aimed, shotgun-like electrical fan extending 10 metres
in front of the player's actual aiming direction, with 18 degrees of spread on each side.
Any hostile fighter inside the cone is hit each tick; opponents behind, too far away,
or outside the lateral spread are not. Visible bolts spray through this cone instead of
locking onto an enemy. Holding the key keeps this exact forward-only behavior (it no longer
automatically turns into a 360-degree area storm). Force Absorb and opposing lightning
clashes still apply. The separate thrown-saber lightning combo remains unchanged.

**Combos:** Jump and Pull a foe below you: they are lifted up in front of you and hang there for a moment; Push them then
and they are blown away with the Force Push knockdown (any foe flying helplessly is). Push then Speed (6) dashes you in front of the pushed foe as they hit the ground, with a bonus hit. Lightning
while your saber is thrown charges it: the lightning spreads around it as it flies (and drains Force much faster).
Push someone into a wall hard enough and the wall cracks.

**Force selection menu:** Scroll the mouse wheel (or use [ / ]) to choose any available
Force power and press F to use the highlighted ability. Hold F for Grip, Lightning,
Heal, or Drain. Drain and Force Sight are available through the selector even though
they are beyond the ten direct-cast slots.

F1 shows/hides the controls; Enter rematches; Ctrl + mouse wheel or - / = zooms.
Mouse movement looks around, including a fallback when the browser rejects pointer lock.

## Dual sabers and saberstaff

Jedi Outcast has no dual-saber or saberstaff animations. Everywhere (the live site included) the kits use sets derived
at load from Jedi Outcast's (`actor.js` `withDerivedAnims`; nothing extra is shipped):

- **Dual sabers** fight in the one-handed Fast style with the left arm the mirror image of the right one, two frames
  behind (`G2D_<anim>`), swung out from the shoulder (`DUAL_SPREAD`): one saber high across the body, the other out
  low, the hands kept apart through every swing (the second blade strikes the mirrored arc a beat later).
- **The saberstaff** is held one-handed at the middle (Fast style, Darth Maul's way) and spins in the hand through
  each attack (`Fighter.twirlStaff`, `STAFF_TWIRL`), finishing on the next half turn between attacks.

A kit keeps its own style (`Fighter.kitStyle`: Tab and the AI's style changes leave it). A quarter of the skirmish bots
fight with dual sabers and a quarter with a staff.

### Jedi Academy's own sets (local install)

Jedi Academy fights with them in styles of their own (6 dual, 7 staff), and with a Jedi Academy install the game uses
them instead of the derived sets:

```bash
node tools/game2/ja-anim-bank.mjs   # reads ../local-retail/jka/_humanoid.gla + animation.cfg
```

Extract `models/players/_humanoid/_humanoid.gla` and `animation.cfg` from `GameData/base/assets1.pk3` into
`../local-retail/jka` (next to the repo) first. The tool writes `public/game2/local/ja/`. This checkout already tracks
the three converted bank files; do not accidentally replace or add retail source files when rebuilding them.
`engine/assets.js` appends the 609 Academy animations after the JO bank, preserving old frame indices. Verify actual
load/decompression before claiming that a server has the original motions; a missing bank retains the derived kit
fallbacks, while the two-button katas are explicitly unavailable.

With them: dual sabers and the saberstaff stand, run, walk, swing, chain, parry, deflect and recover with Jedi
Academy's own sets (`BOTH_A6_*`, `BOTH_P7_S7_*`…, `saber.js` `animFor`), have their own specials (dual front-back and
left-right attacks, spin and jump attacks), the real katas on both mouse buttons (`BOTH_A1/A2/A3_SPECIAL`,
`BOTH_A6_SABERPROTECT`, `BOTH_A7_SOULCAL`), and the saberstaff kicks on right mouse + a direction. The staff is held in
the middle with a blade out of each end, as in Jedi Academy.
Jedi Academy's skeleton lacks 22 of Game 2's 72 bones (finger joints, toes): those keep a two-handed grip.

## Push, pull, grip and lightning rules

All outcomes are decided in `engine/forcerules.js` and applied by `Game.applyThrow()`:

| Rule | Source |
| --- | --- |
| A defender answers a push / pull with his own push / pull (no Force cost, short lockout) only if he is alive, not already in a Force animation, not mid-swing, on the ground and has Force for the power | `CanCounterThrow` (w_force.c) |
| The defender's level is his own push / pull level, **one less while moving**. Equal or higher level stops the throw completely; a difference of 1 / 2 / 3 stops 80% / 40% / 20% | `ForceThrow` |
| Knock-down only if the attacker out-ranks the defender, attacker level 3 and the target is within 3.2 m; otherwise the target is staggered or slides | `ForceThrow` |
| Force Absorb lowers the power level by the absorb level and refills the absorber's Force | `WP_AbsorbConversion` |
| Grip: 6.4 m range, target in front, not already gripped, not just freed, caster not busy / mid-swing. Victim takes a damage tick every 0.4 s of 1% of max HP (at least 0.4 HP); level 1 holds up to 5 s without lifting, level 2 lifts and cracks for 20 at 3 s, level 3 carries the victim and cracks for 40 at 3 s; 4 s limit for 2 and 3 | `ForceGrip`, `DoGripAction` |
| A gripped fighter can still Push / Pull (level >= the grip level breaks it, and the gripper is busy so he cannot counter) or Absorb (cancels it) | `ForceThrow`, `DoGripAction` |
| Lightning: Absorb cancels the damage and feeds the absorber | `ForceLightningDamage` |

On top of the source rules there is one gameplay layer so a block is "likely, not certain": a *reaction roll*
(player 80%, Dark Jedi 70%, lower when the attacker is behind the defender). Everything else is deterministic.
The HUD tells you why a push landed (moving, mid-swing, in the air, low on Force, caught off guard).

## Assets

`public/game2/` holds the character GLB, the rig and animation bank, saber move data and the sound effects.
Any asset change must keep the file names used by `engine/assets.js` and `engine/audio.js`
(`tests/game2-duel.test.mjs` checks that every referenced file exists).

## Original Lightsaber Training Arena

Game 2 Duel mode now loads the actual duel_training.bsp Raven RBSP v1 binary from
public/game2/maps (copied from the user's Drive /maps directory). The loader
reads geometry, texture coordinates, patch tessellation, worldspawn and
deathmatch spawn entities directly from this BSP. The old round placeholder
arena is *not* used in Duel mode; all other app pages and Game 1 are untouched.

The arena collision detects walkable triangles, solid-wall segments, floors and
steps. Combat is the Game 2 single-player duel against a red-saber Reborn opponent.
The opponent currently reuses the installed Dark Jedi model/rig and AI, not a
separate original Reborn character mesh. Multiplayer PvP networking and original
Raven brush/trigger/shader scripting are not implied by this import.

Original texture paths/UVs drive the WebGL2 material batches. Thirteen original
Yavin JPEG textures from the user's Drive have been included under
public/game2/maps/textures/yavin. Materials not yet included use a visible
flat-shaded fallback. This is a native-map geometry import, not a full Jedi
Outcast game engine port.

## Guided Arena Tutorial (offline)

**Launch:** Game 2 main menu → **Arena Tutorial** → **Enter tutorial arena**.
This now loads the training arena **directly, without the generic multiplayer loadout or an extra Deploy click**. The first real instructor demonstration starts automatically, and after watching it the player can choose **Try it myself**. If the first lesson is skipped, the lesson dropdown, replay and Next technique controls remain available.
The tutorial is its own `tutorial` mode in the real Lightsaber Training arena. An allied AI
instructor and an idle enemy target are reset between lessons. It never opens a network room,
awards cards/currency, changes story checkpoints, or replaces Duel Practice.

Select **Single**, **Dual**, or **Double-bladed** under **Your lightsaber kit**, then choose a technique. The selected kit is installed in the actual player and instructor Fighter, and staff-only lessons appear when Double-bladed is selected. Without the original Jedi Academy kick clips, the staff-kick lesson is visibly marked unavailable and cannot pretend to demonstrate or complete. Once the proper Academy animation bank is present, it unlocks.

Choose **Watch AI demonstrate** or **Try it myself**. Both single-lesson and cinematic showcases frame the instructor and training target with a collision-aware camera; switching lessons or taking your turn cancels any background autoplay. The AI drives
real Fighter/Force moves, not a pre-rendered mockup. Readable, numbered text explains each
input; the practice check listens for genuine cast/swing state and combo order. Automatic
Force Dodge has only a demonstration. Completed lesson IDs are cached in the browser under
`atomxe.game2.tutorial.completed.v1`; additional lessons appear uncompleted.

The live curriculum is implemented in `engine/tutorialCatalog.js` and `engine/tutorial.js`.
Selectable `POWERS` and current hotkeys are imported directly from `force.js`, so newly
added selectable Force powers automatically receive a basic cast-and-practice lesson.
For **new combo mechanics** or actions that require special validation, call
`registerGame2TutorialLesson({ id, title, group, steps, goal, demo })` when the feature is
registered, and extend `Game2TutorialDirector.achieved` and its demonstration dispatcher
for the new goal/demo. Registration returns an unregister callback. This prevents the
tutorial from claiming a new move is playable before its action/validation exists.

**QA:** `node --test tests/game2-tutorial.test.mjs tests/game2-combos.test.mjs tests/game2-duel.test.mjs`,
then `npm run build`, followed by a browser walkthrough of draw, saber attack, Force casts,
Push → Speed, held Lightning, special meter, automatic Dodge, replay/reset, and leaving to
the main menu. Test the single/dual/staff curriculum separately. Exercise on a test deployment
before enabling the feature for live players; offline mode leaves multiplayer unchanged.
