# Game 3D: swimming (2026-11-21)

Owner report: "we have swim animations that came with the character, but they don't activate. You just fall
underwater." In the recording (Wolfveil, by the torii and the timber bridge) the hero walks off the bank into the
river and keeps walking on the river bed with the water over their head. Nothing in Game 3D knew about water depth.

## What changed

- **Water surface** (`axe/world/game3dWaterSurface.mjs`): heights are read from the water meshes themselves. That is
  the Wolfveil river strip (262 triangles), plus the Vortex Lake basin when that area is loaded. So the swim line is
  the drawn water. Up-facing triangles are bucketed on a ground grid once, and a query tests one cell. It is not a
  collider.
- **Swim state** (`player/playerSwimState.mjs`):
  - It runs every frame right after the feet are glued to the ground. The glue code itself is unchanged.
  - Water at least 1.45 m deep over the bed (a standing hero's neck) starts the swim. The hero stands again where
    the bed comes up to 1.2 m, with a band in between so the edge never flickers.
  - While swimming, the hero's origin floats 4 cm under the surface. The owner's swim clips keep the neck at the
    origin, so the head is above the water and the body below.
  - The way in and out is one 0.4 s blend. The swim loop cross-fades in while the body moves between where it stood
    and the float height, so the head stays level.
  - A hero above the surface (a bridge deck, the top of a jump) is dry.
- **Clips**: the owner's ActionForge loops `swim_idle_loop_fit` and `swim_fwd_loop_fit`
  (`tools/duelist/source/actionforge-80.anim.glb`) were not in Game 3D's clip set at all. The Duelist bakes its own
  selection and skips them. `tools/avatar-motion/mobility-clips.mjs` now retargets them onto both fused bodies as
  `Swim_Idle` and `Swim_Forward` in the mobility pack, which records each clip's neck height and stroke speed. The
  legacy bodies (Getsuga, Artemis) have no swim clips and keep their walk and idle while floating.
- **Controller** (`LunaDashboardPlayerController`): `setSwimming()` swaps walk and idle for swim forward and swim
  idle. Swim forward is paced by the cadence sync: it runs at 1.32-1.38 m/s and plays faster to match the 1.9 m/s
  swim.
- **Camera** (`PlayerCameraSystem`): over water the eye stays at least 0.35 m above the water line.
- **Remote players**: the local player's `anim` already names the controller state, so a swimmer sends `swimIdle`
  or `swimForward`, and the packet's height already floats them. Remote avatars are the hosted Mixamo archer.
  `remoteSwimClips.mjs` retargets the same two loops onto the archer's own skeleton in the browser, once. The archer
  carries its skeleton four times, so only the first copy, the one three.js animates, is solved.

## What happens in the water

| Action | In deep water |
| --- | --- |
| Moving | swim forward at 1.9 m/s; standing still treads water |
| Shift run, Ctrl sprint | no effect: one swimming pace |
| Strikes and skills (click, 1-0) | refused, "You can't fight while swimming" |
| Dodges and rolls (double-tap, R) | refused silently |
| Jump, wing glide, Skywalk (Space) | refused; Space can still put a drawn weapon away |
| Hit reactions | no reaction clip; damage still applies |
| Mounting (F) | refused, "You can't mount while swimming" |
| Riding into the water | the mount wades to 1.45 m and stops: "Your mount can't swim. Take off with Space to cross the water" |
| Flying mount | crosses at 3.2 m above the water line, not the bed |
| Landing a flying mount over deep water | refused, "Your mount can't land on deep water" |

The mount's flight height used to count from the ground under it, so over the river it flew about 1 m above the
water, and over the 4-5 m deep Vortex Lake it would have flown under it. The water's depth now comes in as the mount
climbs.

## Verified

On `/gameview` (vite dev, guest, Faction 3 character, keys sent as browser events), at the river by the timber
bridge (world x 103-122, z 90; water about 8.6 m, bed down to 6.7 m):

- Walking in: Walk until the water reached 1.51 m, then swim forward cross-faded in while the body rose from the bed
  to 4 cm under the surface in about 0.4 s. Swimming then held that height. Stopping played swim idle.
- Treading water: neck at the surface, head above, hips 0.46 m and feet 1.16 m below. Swimming forward: body flat,
  hips and feet 0.15 m below.
- Walking out: still swimming through 1.43 and 1.29 m, standing at 1.19 m, then Walk up the bank.
- Swim pace 1.94 m/s, 1.95 with Ctrl and 1.97 with Shift. Camera 1.75 m above the water, and at the lowest pitch
  exactly 0.35 m.
- Strikes, skill keys, F, Space and double-taps were refused as in the table, with the notices shown.
- The ridden tiger stopped at 1.44 m of water with its notice. Flying, it held 3.1-3.3 m above the water across the
  river. Landing over the water was refused, and it landed on the bank.
- A simulated remote player (the live movement event the multiplayer layer sends, at the river) played the
  retargeted loops on the hosted archer. Its neck sat at the water line and its feet 1.29 m down while treading
  water.
- After merging main c64e39d9 (now on the WebGPU renderer), the same river walk was checked again. The hero swam
  from 1.52 m with the cross-fade, floated 4 cm under the surface and trod water when stopped. They were still
  swimming at 1.26 m and stood at 1.15 m on the way out, and F was refused in the water.
- After merging main 4c212c2e (gate travel, each area its own scene, WebGPU by default), checked again live:
  - The town scene's water index holds 135 triangles: the river as the area clip leaves it, so exactly what is drawn
    in this area.
  - The hero swam from 1.52 m, floated 4 cm under the surface, and at the town's east border (x 122) was held as at a
    wall, still afloat.
  - The ridden tiger stopped at the bank at 1.45 m with its notice.
  - Riding east on the Residential Timber Bridge deck still went through the gate: the town to east travel started at
    x 121.9, and the rider arrived mounted at x 128.
  - The east scene built its own index from its part of the river (227 triangles).

## Areas and water

Each area builds the water index from the water meshes it has when the world starts. With the area clip (one area
per scene) that is the part of the river drawn there; with `?wholeWorld=1` it is the whole river. An area with no
water mesh loaded has an empty index: the hero never swims there and walks on the ground as before.

## Merging with the gate work

In GameWorld3D's movement block the area gate push (`pushAreaGate`) runs first. The mount's deep-water stop follows
it and is skipped once a gate crossing has started (`areaTravelStarted`), so riding through a gate over the river
still travels. The swimming test pins that order.

## Tests

`node --test --test-reporter=tap tests/`, compared by failing test name with unmodified `origin/main`:

| | tests | pass | fail |
| --- | --- | --- | --- |
| origin/main 4c212c2e | 1787 | 1683 | 104 |
| this branch (with 4c212c2e merged) | 1798 | 1694 | 104 |

The same 104 tests fail on both. The same held at each earlier merge: main c64e39d9 (118 on both) and main d8817383
(109 on both). The gate tests (`game3d-wolfveil-gate-travel`, `game3d-wolfveil-area-edge`) pass. The 11 new tests are
in `tests/game3d-swimming.test.mjs`:

- the swim state: entry, exit band, bridge decks, teleports;
- the water index on the real river mesh;
- both bodies' clips;
- the real controller in the water;
- the remote retarget, including a skeleton carried four times;
- the camera clamp and the world wiring.

Three pins in two existing tests were updated where the wiring changed on purpose. ESLint on the 13 changed and new
files reports the same 2 errors as main's versions, and none new.

## Not verified

- Two real clients, the female body live (only in tests), the Vortex Lake live (its area was not loaded), mobile,
  a signed-in account, owner-device frame rate.
- The Base44 preview itself.

## Known limits

- The companion walks along the river bed when it follows a swimmer.
- A hero with a sword out keeps it in hand while swimming.
- The water does not flow: no current pushes the swimmer downstream.

## For the Base44 preview

Merge `claude/swim-20261121` into `main`. Everything is client code plus six small static GLBs under
`public/models/animations/mocap/`. There are no Base44 functions, entities or secrets to deploy.
