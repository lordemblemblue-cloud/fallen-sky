# Game 3D — Equipped armor visible on player and every 3D viewer

**Scope:** live Game 3D actor first; Character and Appearance service 3D panels; selected character/roster preview; both original and GitSync clone repositories.

## Source of the original problem
- The inventory `equipped` flag was sometimes correct while the displayed avatar was unchanged: the 3D appearance bridge and its legacy character-selected layer overrides could drift from the canonical, per-character AXE inventory.
- The Game 3D actor is loaded asynchronously. A useEffect that ran before `modelRef.current` was populated could not apply the latest equipment to the first visible world frame.
- The clone formerly rendered Character and Appearance panels using a different, legacy 3D preview instead of the fitted fused-body creator. Selected-character roster preview also needed character-specific saved gear.
- The fitted layer runtime previously failed all pending layer changes if even one equipped GLB was missing or its skeleton bind failed.
- Inventory includes armor pack items with no fitted GLB yet. These should surface an explicit missing-model warning rather than quietly pretending a 3D piece was applied.
- Source model restrictions: Crescent Moon only has Eve/female skinned geometry; Adam cannot wear it visually. Some other catalog packs are item-only, not yet authored as wearable skinned GLBs.

## Implemented
1. `useArmoredAppearance` subscribes to canonical AXE equipment per character and reconciles old creator selections/bridge overrides against current worn pack pieces. Equipment identity, game stats and ownership remain unmodified.
2. Fitted armor manifest is fetched once, but filtered per viewer and currently equipped piece IDs. An already-equipped dev-only item may be **rendered** even when a production preview hides dev items from the selection catalog. No dev inventory creation, loot drops or trading are activated.
3. On actor load, `GameWorld3D` immediately reapplies `appearanceRef.current` to the real model, before first rendered frame. Subsequent inventory changes still use the existing reactive hook.
4. The same fused-creator `CreatorStage` is used in Character and Appearance service panels. Lazy viewport/IntersectionObserver ensures a hidden mobile pane does not consume a WebGL renderer.
5. The character-selection screen uses `SelectedCharacterArmorPreview`, which reads the **selected** saved character's own equipment without switching the active game identity.
6. `AvatarCustomizationRuntime` reports armor GLB loading/bind errors by slot, applies valid pieces independently, and safely disposes failed layers; the player/preview show an explanatory warning when armor assets or fitted rigs are missing.
7. The clone retains the other team's concurrently merged fitted Nightscale/Frostwarden/Moonfeather models, saved-armor reconciliation and gender-specific fused preview loader fix. No stale branch overwrite or rollback of these other fixes.

## Verification and release conditions
- Run `node --test tests/game3d-armor-live-viewer-sync.test.mjs tests/game3d-mobile-armor-viewer-parity.test.mjs` and `npm run build`. For main also run `node --test tests/game3d-dev-armor-crescent-moon.test.mjs`.
- Equip all six available armor slots on Eve, watch **the live character** visibly change first, then open both 3D service panes; rotate front/back; use Adam-compatible Nightscale/Frostwarden; switch characters on roster.
- Remove one piece, change sets, reload the page and change to another character; nothing previously worn should remain on an unequipped slot.
- Test missing GLB, wrong skeleton/body, poor network, delayed GLB completion, independent preview mounting and low-memory phone.
- Verify that no non-authorized inventory item, currency, XP or reward is created during these visual changes.

**Not yet verified in signed-in Base44 Play.** Clone Base44 preview was previously reporting build error and direct sandbox editing was blocked by workspace plan. This work is a scoped GitHub draft PR, not a live deployment or an in-game visual capture.
