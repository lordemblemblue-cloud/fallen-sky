# Game 3D mobile armor: four viewer surfaces and actual armor assets

Date: 2026-11-14.

## Root cause

Inventory ownership was not the same thing as a renderable armor layer. The original clone GitHub build contained only the female development Crescent Moon armor manifest (6 entries) and models; it did **not** contain the shipped Nightscale/Frostwarden fitted GLB meshes and JPEG thumbnails, or the male armor entries. Equipping those sets showed a valid item in the inventory without a visible fitted mesh. Separately, the world-only armor equip-event forwarder could mount after an equipment/character preview, and non-world viewers did not consistently subscribe to the canonical character-scoped equipment inventory.

## Changes

- Clone: restore the **original, byte-identical** Nightscale (6 male + 6 female) and Frostwarden (6 male + 6 female) fitted armor models and thumbnails, and the 5 original female Moonfeather fitted pieces/thumbs. That is 29 GLB + 29 JPEG assets. Restore the complete original shipped armor manifest (35 entries: 23 female, 12 male). Do not create fake replacement meshes, import unrelated assets, or change inventory IDs or account state.
- Both repos: use canonical inventory ownership as the live appearance source via the shared armor bridge. Reconcile old visual overrides for known inventory armor sets when their items are no longer equipped, leaving creator-owned non-inventory appearance layers intact. Do not reset/unlock/grant/unequip items.
- Both repos: Appearance and Character Services use the same `useGameAvatar` appearance and fused Eve/Adam CreatorStage renderer, not separately computed preview armor. Only mount an on-screen equipment preview on phones to avoid invisible WebGL contexts and unneeded GPU work. Surface armor-load errors rather than silently hiding pieces.
- Both repos: Character selection preview reads the **selected roster character's** saved character-scoped inventory read-only, without switching which character is active. Preserve active Play state and independently owned characters.
- Clone only: fix compact WebGL preview that used a bare fused model URL and lost the model's female/male rig identity. Preserve full appearance when loading the approved v2 fused model; cap compact avatar preview DPR at 1.5 to limit phone canvas memory.
- World Play in both repos already consumes `useGameAvatar` and reapplies `applyPlayerAppearance` when the equipped appearance changes. The new shared bridge keeps that appearance updated while the world is loaded, and the existing AvatarCustomizationRuntime attaches skin-rigged armor, helm hair masking and cape springs.

## Intended visible behaviors to verify

1. On a mobile browser, equip/unequip each Nightscale and Frostwarden armor slot on Eve and Adam while in Appearance/Character Services and see the new piece on the 3D model; scroll between Services, with no empty/white or runaway WebGL canvases.
2. Enter Play, walk/run/turn/attack wearing the same outfit. Check fitted chest, legs, gloves, boots, helmet and cape follow animations and no hair clips through the helmet.
3. Select one roster character, return to the login view and see **that selected character's** own saved armor even if the active world character is different; switching characters must not transfer the owner's items.
4. Unequip or destroy inventory-owned pieces and confirm stale preview meshes vanish immediately. Check swapping individual pieces between sets, relaunching and login/logout across separate accounts.
5. Preview female Moonfeather pieces; Crescent Moon remains development-only. Other catalog sets without actual fitted GLB assets cannot be guaranteed to render; do not fabricate their meshes.

## Validation limits

Directory and manifest checks were grounded in actual GitHub data: all required restored clone folders and file names were verified on the feature branch. Every imported model/thumbnail git blob SHA was identical to the original main repository's content SHA, and the manifest was copied from the existing original. Pure reconciliation code was evaluated against a stale-helmet, switched-chest and preserved-creator-hair case and produced the expected slots in both repos. 5 source and asset tests were added in each repo. Those facts **do not prove signed-in phone rendering, mobile WebGL contexts, animation/skin compatibility, a full npm build, or published deployment**. Independently test both repositories before merging or publishing.

Both PRs remain independent and draft until native tests/build and mobile Play acceptance. Existing clone feature PRs #15, #10, #16 and #11 may touch overlapping Game 3D files; do not force merge. No unrelated terrain, accounts, product data or live published world changed.
