# Faction 2 and Faction 3 — Default Winged Pets (Game 3D)

Date: 2026-11-13. Application: Game 3D clone (GitSync Pro). This is a source/asset registration record; not evidence of a deployed, signed-in 3D Play verification.

## Uploaded 3D models

| Faction | Model | Media URL | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| Faction 2 | Owner GLB #158 | [#158](https://media.base44.com/files/public/6ab42219a52fd34656a53b37/c474d5f03_9_fantasy_armor_and_clothing_equipment____158.glb) | 8,173,464 | `4925d9a2bc06076c5e8ff877d31d30d020e7f8c6f3fe307ddaa6b79c7e105608` |
| Faction 3 | Owner GLB #160 | [#160](https://media.base44.com/files/public/6ab42219a52fd34656a53b37/d58217bc6_9_fantasy_armor_and_clothing_equipment____160.glb) | 8,830,436 | `1b2fac8658a872e3499f2ebd46c5ce6844ddb5ef2705245aca804283d5755ae9` |

These are actual files uploaded to this app's Base44 media library with the native upload tool. No binary files were copied into Git. Each faction gets its corresponding owner-supplied visual model via the existing companion/mount ID:

- Faction 1: unchanged `faction_bear`, `axe_mount_faction_bear`; **existing default preserved**.
- Faction 2: uploaded #158, retained ID `faction_armored_wolf` and `axe_mount_faction_wolf`.
- Faction 3: uploaded #160, retained ID `faction_tiger` and `axe_mount_faction_tiger`.
- Non-faction characters retain the existing War Wolf default. XP, mount stats, restrictions, gear, owned companions and old IDs are unchanged.

New character faction assignment uses `getGame3DStarterMountDefinitionId(factionId)`. Joining a faction later safely replaces an *untouched*, 0-XP, single starter when appropriate; it does not consume progression, delete a customized mount or grant endless high-level mounts when repeatedly changing faction. Existing purchased/custom leveled mounts remain intact.

## Animations and rigging

- #158: glTF2 GLB; 51 nodes, 15 meshes, one 30-joint skin, **native `Idle` and `Tail_Idle`** clips (each 39 channels).
- #160: glTF2 GLB; 48 nodes, 14 meshes, one 28-joint skin, **native `Idle_Relaxed_Tail`** clip (30 channels).
- Neither owner file embeds `walk` or `run`. Do not mislabel idle/tail clips as walking cycles.
- `factionPetAnimationRigs.mjs` contains anatomy-specific mappings for all four quadruped legs, pelvis, spine, neck and head. Runtime `mountAnimations.mjs` uses the **existing inspected baby-wolf `Take 001` walking and running sections**, retargeted in world/bind-pose space, and retains each new model's embedded idle animation for tail/head/wing movement.
- The native tail/wing quaternion tracks are overlaid onto retargeted walk/run actions, so wings and tail can still move during locomotion. The fallback is a bounded procedural quadruped gait with native idle if the baby-wolf source cannot load.
- Both local Play and remote-player companion managers already use `prepareMountAnimationClips`. Each remote player gets an independent skeleton clone and mixer.
- If either new Base44 GLB URL fails to load, the local world and remote-player manager use the retained `previousModelUrl` and the original animation-rig profile instead of leaving that player's creature invisible. This is a network/asset fallback, not a claim that the new clips failed verification.

## Verification

Verified without a renderer: complete GLB headers and glTF2 metadata, skins/joints, animation channel targets, file sizes and SHA-256 on the two user uploads. Base44 returned public media URLs for both app IDs. Faction 1 and unassigned fallback definitions remain unchanged in source.

Still to verify in the real signed-in Game 3D world: GLB URLs/CORS, embedded idle playback, retargeted leg stride and ground contact, wing and tail motion while running, mount saddle and rider alignment, follower animation, pause/respawn/reload, faction switching after creation, persistence, two-player poses, and mobile performance. Existing screenshots/merge statuses do not prove this pass.

**Source rollout**: merge the matching pull request for each repository. Then update the matching Base44 app code/preview and verify visually before publishing. Uploaded media alone does not change the live faction pet code.
