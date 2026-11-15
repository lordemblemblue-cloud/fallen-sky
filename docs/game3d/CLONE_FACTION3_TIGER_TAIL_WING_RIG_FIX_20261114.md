# Clone Game 3D — Faction 3 Tiger Mount: Tail and Wing Rig Stabilization
Date: 2026-11-14. Clone repository: `marcusflow1-arch/gitsync-pro`.

## Source and observed symptom
The owner supplied a Base44 Game 3D screenshot showing the Faction 3 Fantasy Tiger
mount while ridden and described the tail/head pulling into each other, possibly
because unattached Icosphere helper meshes follow the rider instead of the
animal, and wing controls sit away from the front shoulders/neck.

The repository confirms:
- Faction 3 uses owner GLB **#160**, `faction_tiger`,
  `animationRigProfile:'winged_faction_3_160'`.
- Its source GLB has a documented 28-joint skin with an
  `Idle_Relaxed_Tail` clip but **no walk/run clips**.
- Game 3D overlays that native idle/tail/wing animation with retargeted
  baby-wolf gait; local rider IK runs after the pet mixer; remote companions
  and the Companion menu have separate render paths.
- The screenshot alone **does not prove malformed vertex weights**.
  The remote Base44 binary asset was not retrievable in this session, so no
  claim is made that its GLB source weights have been edited.

## Fix implemented — clone only
1. `character/factionThreeMountRig.mjs` is loaded **only** when
   `animationRigProfile==='winged_faction_3_160'`. It identifies authentic
   `tail.01…tail.06`, `wing.L.base`, `wing.R.base`, `front.L.upper`,
   `front.R.upper`, `chest`, `neck` and `head` bones.
2. **Native animation isolation:** Before layering the mount's
   `Idle_Relaxed_Tail` onto its retargeted gait, remove unweighted
   Icosphere-control transform tracks and accidental root/tail/wing
   translations from the *runtime clip copy*. Preserve actual mount bone
   quaternion tracks and mesh morph weights.
3. **Mount-owned tail spring:** Advance post-mixer and post-navigation using
   the mount group's own world position/orientation and bounded local
   velocity; the rider, camera, and unrelated player IK are never used as
   sources. Dampen and cap each tail-bone quaternion about the original
   bind/rest orientation. Extreme head/neck twists are also limited so
   head and tail cannot fold into each other.
4. **Front shoulder wing anchors:** On loading the actual Faction 3 model,
   use each existing front upper-leg shoulder plus chest/neck bone to
   locate the paired wing base; correct an obviously misplaced wing using
   its current parent-local bone position. Keep parent, skin joint index,
   bind inverse matrix and original wing rotation unchanged. Small native
   wing animation can continue independently of the rider.
5. **Icosphere handling:** Inspect only *small, unskinned* objects named
   like Icosphere helpers; do not detach or recolor a real SkinnedMesh.
   Attach eligible visual helpers to the closest authentic tail/wing
   joint in the mount hierarchy while preserving world placement, hide
   isolated stray markers, disable helper raycasts and keep all changes
   reversible at disposal. No new gameplay/physics collider is created.
6. **Mounted rider seat:** Exclude hidden secondary-motion marker meshes
   from the rider IK's body-geometry sampling so they cannot skew the
   seat/grip estimation or pull the player's pose toward a stray helper.
7. Apply the same treatment in **local GameWorld3D**, **remote mounted
   companion clones**, and the **Companion 3D preview**. Each mount instance
   owns its own guard and spring state, disposed during switching/unmounting
   or component teardown; source cached GLBs are not overwritten.

## Unchanged
Faction 1 and Faction 2, the GLB URL and original owner file, mount ownership,
levels, movement/collision/game physics, combat, weapons, saddles, player IK,
animations of unrelated actors and gameplay synchronization.

## Validation
```sh
node --test tests/game3d-faction3-tiger-tail-wing-rig.test.mjs
npm run build
```
The test uses an actual synthetic Three.js skeletal hierarchy to check:
- exclusive Faction 3 triggering and unchanged Faction 2;
- native helper track removal while bone quats remain;
- paired shoulder wing correction with same skeleton parents;
- safe hide/reparent/restore of unweighted Icospheres, without touching
  the SkinnedMesh;
- steady tail during rider/camera-only movement and responsive spring on
  true mount-root locomotion;
- extreme tail/head local joint rotations bounded and no cross-body folding;
- local, remote, companion preview and mounted-rider source integration.

In a live clone, visually confirm walk, idle, sprint, sharp turns, stop,
mount/dismount, camera-only orbit, remote player and Companion preview.
Check that both wings remain high behind the **front shoulders** close to
the neck, and that the tail does not intersect the head during turns.

**Open limitation:** This does *not* reweight the original uploaded GLB.
If a **skinned** wing/tail mesh itself has incorrectly authored skin indices
or inverse bind matrices, a source-asset rigging pass in Blender plus
re-export is still needed. Full WebGL rendering and source GLB inspection
were unavailable in this session; the feature should be tested in Base44
Preview before any production publish.
