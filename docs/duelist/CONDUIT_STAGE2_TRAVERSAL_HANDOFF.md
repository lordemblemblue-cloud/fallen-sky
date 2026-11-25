# Conduit Stage 2A — physical traversal candidate (2026-11-25)

## Scope
Stage 1 lighting PR #356 is still open. This independent draft adds only new files: a renderer-independent candidate sweep, fixture tests, actual assembled-registry audit, workflow and this handoff. No changes to the three-viewer architecture, lighting, live TDM or shared simulation/protocol. Existing modeArenaLayout.mjs uses a zero floor in default movement; do not register Conduit until server/client support negative elevations.

## Candidate behavior
Collision snapshot consumes the exact existing registry (OBBs, discs/cutouts, annuli, cylinders, ramps, shafts, jump pads) without a Three.js dependency. No invented floor, negative elevations supported. Swept movement, support, step-up/down, head clearance, ballistic launch and spawn/route probes use the same registry. This is a candidate, not a production authoritative replacement. Capsule clearance approximations and edge behavior require tuning against actual map; no production ray/LOS, recovery, dynamic combat, air-control, bot action execution or server synchronization yet.

## Evidence
Five fixture groups from exact committed module/test sources were executed in an isolated JavaScript harness (imports/exports stripped for evaluation, minimal assertion shim); all five passed. Includes -5m floor landing through a cutout, ceiling/wall collision, bidirectional analytic ramp, 12 idealized pad flights, snapshot immutability and invalid inputs. This is not a Node test runner or browser result. Three.js unavailable in the local environment; actual assembled map tests, full npm lint/build, physical WebGPU and multiplayer are NOT TESTED.

## Actual map gate
The separate assembled-map test builds the existing scene via Three.js and uses the collision registry with no renderer. It probes all 32 candidate spawns, 40 directed stair flight edges (12 stairs total), 32 directed doorway/connector checks, 12 pad takeoffs, and non-drop walking/ramp graph edges. Prints actual failed route IDs, reason and end position; fails CI if any probe fails. Four platform drop edges are explicitly untested. Straight-edge probes are a candidate route approximation, not character controller certification. Do not suppress failing checks or assume a graph edge is walkable. Use diagnostics to fix geometry/waypoints in follow-up after coordinating with lighting owner. Run physical character traversal and authoritative collision and combat/LOS reconciliation before live activation.

## Next
1. Obtain actual assembled gate results; address each obstruction, entrance gap, support mismatch and landing issue.
2. Share a renderer-independent collision data generation path and wire the approved sweep into server and client prediction with protocol review. Extend ray/LOS and recovery.
3. Validate bot actions, actual class movement, drops, knockback, spawn/pickups, desktop/mobile and multiple connected clients.
4. Only after review enable Conduit in TDM. No merge/deploy in this task.
