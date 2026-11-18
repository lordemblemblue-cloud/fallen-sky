# Weapon feel: summon, idles, right-click, dagger and two-hand sword, riding (2026-11-18)

Branch `claude/weapon-feel-20261118`, from `main` 67f1d36. Owner request (2026-11-18 chat) plus the
approved Blacksmith + combat handoff, section 5 (audit decisions 11 and 12 in
`BLACKSMITH_COMBAT_V2_AUDIT_20261118.md`).

## What changed

### Weapons in the hand (`weapons/playerWeaponSummon.js`, `weapons/playerWeaponRuntime.js`)

Two owner-visible bugs: old swords stayed in the hand after switching, and after a reload the equipped
weapon sometimes never appeared. The summon now reconciles the hand every frame:

- an old weapon melting away is removed when its melt ends, and also when the melt is cut short;
- a weapon that was put away but whose melt was interrupted is unequipped instead of turning solid again;
- a failed equip (model or manifest not loaded) is retried after 0.5, 1, 2 and 4 s, then counts as put
  away; drawing it again tries anew (`WEAPON_EQUIP_RETRY`);
- a weapon lost from the hand while drawn is drawn again;
- once a second, any `WeaponPack_*` root on the body that the runtime no longer holds is removed
  (`runtime.sweepStrays`).

### Idles

Each weapon family has a looping stance, baked on the body's own rig like the combos
(`weapons/weaponComboClips.js`, `weapons/weaponComboBinder.js`): `idleSword`, `idleSwordTwoHand`,
`idleDaggers`, `idleBow`. Empty hands keep the normal idle. The owner's uploaded `idleArmed` still wins
for the bow when it is loaded. A drawn weapon never falls back to the generic AFK pose (empty hands);
switching weapons restarts the idle-variant delay.

### Right mouse button (`player/weaponRightClick.mjs`, `GameWorld3D.jsx`)

| Weapon | Hold | Quick tap |
|---|---|---|
| Bow | over-the-shoulder aim (zoom) | guard |
| Sword | two-hand stance | guard |
| Daggers | — (press = the normal attack, a stab) | — (no guard) |
| Empty hands, other | — | guard |
| Riding | bow aims; anything else taps to guard | |

Only the bow zooms now. `SWORD_STANCE`: on after 220 ms of holding; attacks and sword skills deal
1.2x; walking speed 0.75x; no guard while held. Long two-handed blades (odachi, katanas) keep their
own katana combo in the stance, and sword skills keep their one-handed clips.

### Attacks

| Clip | Length | Contact | Notes |
|---|---|---|---|
| `swordCombo1` flat slash | 0.50 s | 0.22 s | handoff timing (retimed original cut) |
| `swordCombo2` rising diagonal | 0.54 s | 0.24 s | handoff timing (retimed original cut) |
| `swordCombo3` forward thrust | 0.48 s | 0.21 s | new; replaces the overhead chop in the basic chain |
| `swordTwoHand1-3` | 0.52 / 0.56 / 0.60 s | 0.24 / 0.26 / 0.30 s | both hands on the hilt |
| `daggerLight1` right slash | 0.33 s | 0.12 s | left click, alternates with 2 |
| `daggerLight2` left cross-cut | 0.37 s | 0.15 s | left click |
| `daggerStab` | 0.43 s | 0.18 s | right click |

`DAGGER_ATTACKS`: light hits 0.75x (they come faster), the stab 1.0x. Daggers used to play a kick: their
role is Defense, and the basic-attack code only gave weapon combos to the Damage path. Basic melee clicks
now swing the held weapon's family whatever its role.

The second hand of a two-handed grip is re-solved onto the hilt on every baked frame and its fingers
close around it. The legacy sword-skill tier clips keep the original three cuts.

**Contact frame.** A PvE basic melee click starts the swing; its strike (hit roll, damage, kills) lands
when that swing reaches its contact frame. Every accepted swing is numbered by the controller
(`getLastSwingSerial`, the `serial` on combo cues). A swing cut short (dodge, hit, a newer press) lands
nothing. Bows and skills resolve as before.

### Riding (`player/mountedRiderPose.mjs`)

- A drawn pack weapon (or the daggers) stays in the hand while riding; it is no longer hidden until an
  attack, and riding never auto-dismisses it.
- One hand holds the reins just above the withers; the other carries the weapon out at its side
  (`RIDING_WEAPON_AIMS`: sword forward and a little down, bow upright, a dagger forward and down; a
  mounted attack raises it). With daggers the reins hand grips its own dagger too, the blade running back
  down along the forearm. Bows sit in the left hand, so the right takes the reins; swords sit in the right
  hand, so the left takes the reins. Mirror it in `GameWorld3D.jsx` (`reins`) if the owner wants the sword
  on the left.
- Legs straddle the body: the flank under the saddle is measured once (half-width per 5 cm of depth), and
  each thigh goes out and down as steeply as it can while clearing it by 7.5 cm (`LEG_CLEARANCE`), shin
  hanging from the knee and swung out only as far as the flank needs.
- The rider sits on the back: when mounting, the posed body is checked against the back surface and the
  seat rises by the overlap less 1.5 cm (`SEAT_COMPRESSION`, at most 15 cm).
- Vertices mostly skinned to `wing*` bones are not counted as body, so the winged wolf (#158) and tiger
  (#160) seat the rider on the back, not on their raised wings.
- The bear is about 1.1 m wide at its saddle, so legs spread wide there.

### Also

`onboarding/creatorStageScene.js` skips frames while its WebGL context is lost. It used to throw every
frame (rescheduling before rendering), and in dev each error was relayed to the Vite server until it
stopped serving files.

## Checks

- Tests: `tests/game3d-weapon-summon-reconcile.test.mjs` (9), `tests/game3d-weapon-feel.test.mjs` (10,
  both fused bodies: timing, unit/finite tracks, seamless loops, no joint jumps, planted feet, facing,
  blades above the ground, cut directions, hands together on the hilt, controller idles, swing numbers),
  `tests/game3d-riding-weapons.test.mjs` (8, both bodies on the bear with sword, bow and daggers, plus a
  synthetic winged mount). Six stale assertions in `game3d-weapon-combos`, `game3d-sword-skill-moves` and
  `game3d-katana-techniques` were updated; those six fail on `main`.
- Whole suite (`node --test --test-reporter=tap tests/`): branch 982 tests, 85 failing; `main` 956 tests,
  91 failing; no test fails on the branch that passes on `main`.
- Live on `/gameview` (guest, Faction 1): every starter weapon equips and shows alone in the hand; the
  equipped weapon appears after a reload; idles per family; sword right-click stance and two-hand swing;
  dagger light chain and stab; bow-only zoom; riding the bear with sword, daggers and bow; the winged wolf
  and tiger posed in the page with the game's own loader and mount framing (Faction 2/3 mounts are locked
  to those factions).

## Limits

- Duels resolve damage on the server with its own numbers: the stance and dagger multipliers apply to
  PvE only.
- The Painted Fan (`sky` family) has no model, so nothing is shown in the hand (it punches and kicks).
- The first load of a weapon GLB is slow on the dev server (10-14 s); afterwards it is instant.
- Sword skills keep their one-handed clips in the two-hand stance (they get the 1.2x).
- Other players' clients bake the new dagger and two-hand clips too (`weapons/remoteWeaponCombos.js` uses
  the same binder), but a remote dagger swing shows no stand-in dagger: `REMOTE_COMBO_STAND_INS` only has a
  sword and a bow. No network change.
