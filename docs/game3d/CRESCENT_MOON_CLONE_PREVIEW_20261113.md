# Crescent Moon equipment — clone preview port

Source: merged Claude PR [main #1469](https://github.com/marcusflow1-arch/atom-x-eve-os/pull/1469), merged on 2026-11-13. The source set is `crescent_moon`, **six Legendary pieces fitted to Eve**.

## Implemented in this clone branch
- Added the main catalog's `AXE_DEV_ARMOR_SETS` and six independent, nontradeable inventory entries: helmet, chestplate, pants, gloves, boots, cape. Each retains the original baseStats, reinforcement/enchantment structure, sockets, appearance slot, identity and JPG thumbnail.
- Clone-only V3 *one-time* seed migration puts each piece in existing and new clone-character inventories without replacing gear or resetting upgrades. Unlike the source main's `import.meta.env.DEV` gate, the clone preview inventory is visible in the clone's built preview. The main repo remains dev-only, unchanged. No loot/drop/market grants.
- Ported the main fitted-armor visual bridge, live character bindings, body-mask geometry and cape springs. Retained the clone's `Female_Fused_v2.glb` / `Male_Fused_v2.glb` selection and existing Dev Test character readiness.
- Existing Blacksmith reinforcement, enchant, over-enchant and runtime stat scaling continue to operate on owned item `instanceId` and need no new fabricated upgrade rules. For example, successful +5% reinforcement scales a Chestplate's base Defense 4 and HP 24 to 4.2 / 25.2 before game-stat rounding/other multipliers.
- Imported **all six genuine JPEG thumbnails** and three original model GLBs with matching Git blob SHA: **helmet, gloves, cape**. These three are present in the clone manifest and fit-checkable. No substitute meshes were invented.

## Known blocker — original assets not yet all copied
The three original model GLBs for **chest** (2,463,768 bytes), **pants** (1,620,180 bytes) and **boots** (1,456,376 bytes) exist on main but are NOT yet in the clone. The connected GitHub contents reader returns empty base64 `content` for files above its 1 MiB Contents API limit, even though the source objects exist. Those three slots remain *items with stats and pictures only*; the clone manifest intentionally omits their visual entries rather than issuing three guaranteed 404s when equipped. Do not claim six visual pieces work or merge/publish this PR as complete. The remaining original binary GLBs must be transferred through a git-aware binary upload or other authorized means, with original SHA verification, and added to manifest.

## Verification
```sh
node --test tests/game3d-clone-crescent-moon-equipment.test.mjs
npm run build
```
Also run the signed-in clone preview and verify: character inventory item icons, exact six categories, equip/unequip and reload persistence, actual avatar mesh fitting for Eve, missing-slot behavior, Blacksmith reinforcement/enchant/over-enchant before/after stats, resource consumption and no upgrades on unowned ids, C1/quest gameplay and GPU memory, and no armor leak to Adam or main/live.

**Status**: source and 9 original binary assets committed on isolated clone branch, native test/build/actual browser QA not verified; three original model GLBs unresolved. Maintain draft-only status until source files, runtime and visual tests all pass.
