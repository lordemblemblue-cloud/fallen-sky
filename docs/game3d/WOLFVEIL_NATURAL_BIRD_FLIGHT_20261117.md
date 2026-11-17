# Wolfveil — text-keyframed natural flight for the owner's rigged bird

## Asset and target
The previously integrated Wolfveil near-bird asset is the owner's skinned bird
`tripo_convert_bdd73c28-af44-45e3-b758-1d783314f872.glb`.
Its earlier inspection reports 21 joints and **no embedded animation clips**.
It is loaded from `WOLFVEIL_OWNER_BIRD_ASSET` in
`src/components/game3d/wolfveil/ambient/WolfveilAmbientBirds.mjs`.
This work assigns code-generated flight poses to the **existing skeletal bones**
on each SkeletonUtils clone. It neither generates a replacement bird nor
changes the owner's mesh, skin weights, textures or bone placement.

## Text-defined wing animation
`WolfveilBirdRigAnimation.mjs` holds a seamless normalized set of wing stroke
keyframes and smoothed frame interpolation, driving both
`0_Left_Limb_0` and `0_Right_Limb_0` when those original Tripo bone names
are present. Optional downstream wing joints articulate smaller fingertip
movements. Optional head, neck and tail joints stabilize the body in flight.
The animation remains mirrored on the two sides and additive to each
joint's original local bind-pose quaternion, avoiding accumulative rotation.

- **Powered flight:** fast downstroke, slow recovery, mild body bob.
- **Glide:** wings mostly spread and stable for a rest interval; small feather
  correction rather than frozen rigid wings.
- **Bank:** aircraft-like roll interpolated from actual heading changes.
- **Climb:** small nose-up pitch based on vertical movement.
- **Landing approach:** open wings with slower, weaker braking beats; nose down.
- **Perch:** fold/tuck the wings, head and tail settle, no body bob.
- **Takeoff:** strong high-amplitude wingbeats and nose-up pitch.

Each spawned bird has independently seeded wing speed, initial wing phase,
powered duration and glide duration; flock motion is not synchronized.
The existing pathfinding-free `fly → descend → land → rest → take off`
terrain state machine is preserved.

## Distance, performance and safety
Detailed nearby birds are skinned GLB clones animated with existing bones.
Faraway birds remain one `THREE.InstancedMesh` draw call; a shared shader
uniform animates wing height, offset per instance by its position so flocks
don't flap in synchrony. The original mobile/GPU quality budgets remain.
Both near and distant birds remain purely visual, with no physics/colliders,
combat damage, loot, terrain changes or server entities.

## Verification and limitations
The regression tests check seamless stroke interpolation, original expected
limb names and fallback naming, independent bird cycles, glide, takeoff,
landing, the original protected terrain sampling and World3D update lifecycle.
The full application Vite build is required by the new GitHub workflow.
These are source and build checks, **not proof of an authenticated GPU-rendered
Play session**.

The public media GLB couldn't be directly re-downloaded/inspected this
session, so the actual 21-bone mapping uses the previous inspection and
the same known limb names that the existing game already targeted.
After syncing/publishing to the owner's Base44 GitSync Pro Play preview,
visually confirm left/right wing direction, feather bones, collision-safe
perch contact, model facing (-X), clip absence, mobile FPS, and CDN/CORS.
If the CDN cannot load the model, the existing small flapping fallback still
works but is NOT equivalent to verifying the textured owner's bird.
