# Crescent Moon original equipment — clone Game 3D preview

Source: merged Claude [main PR #1469](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/1469) (2026-11-13), `crescent_moon`, Legendary, six individually equipped pieces fitted **for Eve**, not Adam.

## Implemented on this isolated clone branch
- Main catalog's identical `AXE_DEV_ARMOR_SETS` definitions: Crescent Moon Helmet, Chestplate, Pants, Gloves, Boots and Cape, each with authentic separate slots and base stats.
- Clone-only V3 *one-time* starter inventory migration: the six nontradeable, initially unequipped preview items appear in existing and new clone character inventories. They do not overwrite existing equipment or reset upgrades, and do not keep respawning if a piece is consumed. Main production stays unchanged; on main the set remains dev-only.
- Existing Blacksmith reinforcement, enchantment, over-enchant, sockets, and equipment runtime stat scaling continue using each owned piece's `instanceId`. No new incompatible upgrade system or fake power multipliers were added.
- Equipment-to-avatar bridge, existing character ID, armor manifest loading, skin/body masks, fitted skeletal armor layers, helmet/hair handling and spring-bone cape motions ported from main. The clone's existing fused **v2** character body and Dev Test readiness remain unchanged.
- **All 12 original binary assets now exist in the clone**: 6 `female_*.glb` and 6 corresponding `female_*.jpg`, each verified by matching main Git blob SHA and byte length. The connected GitHub Contents API returned empty base64 for the three GLBs above 1 MiB, but Git trees accepted their original content-addressed blobs; a subsequent clone directory listing independently verified their sizes/SHAs. All six registered in the clone armor manifest, without `dev_only` flags in this clone preview manifest only.
- No counterfeit meshes, cross-region terrain changes, Adam fallback, world spawn/loot, store sales, or main repo live grants.

## Base stats (before upgrades)
- Helmet: Defense 2; HP 10
- Chestplate: Defense 4; HP 24
- Pants: Defense 3; HP 14
- Gloves: Attack 2; Defense 1
- Boots: Evasion 2; HP 8
- Cape: Defense 1; HP 8

These values come from the original canonical `AXE_ARMOR_SLOT_BASE_STATS`. Upgrade math comes from existing `base44/shared/axeItemEnhancement.ts`: a successful first reinforcement raises the multiplier from 1.00 to 1.05, before stat rounding, modifiers and other set effects; the next enchant adds 0.01 to the multiplier. Real gameplay must still consume the required materials and save the returned enhancement state.

## Verify before moving from draft to merge
```sh
node --test tests/game3d-clone-crescent-moon-equipment.test.mjs
npm run build
```
Then sign into the clone and verify six item cards, each original thumbnail, 3D layer fit on Eve (including v1-authored armor over clone v2 body), equip/unequip, persistence after reload, full six-piece set, animation/cape motion, after-upgrade stat increases, Blacksmith material costs/failure behavior, no item upgrade for unowned IDs, multiplayer parity, no unintended equipment appearing on Adam and no regression to original gear.

**Status:** source + binary assets committed, SHA/size and static code inspection complete; Node test commands, Vite build, signed-in actual 3D visual tests and Blacksmith end-to-end upgrades remain unverified in this session. Keep this clone PR draft until these checks pass.
