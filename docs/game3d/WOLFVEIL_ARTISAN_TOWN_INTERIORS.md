# Wolfveil artisan district — walkable interiors & mobile optimization

This change builds on the owner's merged Japanese-Egyptian twin-wolf fountain
town. It does **not** restore the previous assembled Blender town or change the
world map's canonical heightfield or spawn coordinates.

## Navigation
- Twelve ground-floor buildings (4 shops, 8 residences) use door-aware wall
  segments instead of solid whole-building rectangles. The rear and side walls
  still collide, while genkan and service entrances remain open.
- All eight residences now have hollow geometry with a front entrance, a few
  lightweight interior props, and a camera ceiling cutaway.
- Sprinting/click-to-move uses swept movement checks to prevent bypassing
  narrow wall segments.
- The collision helper is in
  `WolfveilTownInteriorNavigation.mjs`; no duplicate physics floor is created.
- Ground-floor rooms are walkable. **Upper floors are visual rooms and do not
  yet have authored stair navigation or a multi-floor collision mesh.**

## Shop roles
- **Blacksmith:** common starter weapons delivered to the canonical equipment
  inventory, with shared Silver deducted and refund on insertion failure.
- **Potion apothecary:** two healing potion variants with an option to drink
  from the character-scoped bag (restores HP via playerHUDStore).
- **Tailor:** basic common chest, gloves and boots, added to equipment inventory.
- **Model showroom:** E opens a selector for the three procedural display
  mounts already inside the former stable room. Previewing is free; it does
  not grant a companion or generate an external 3D asset.

Press **E** while standing in a shop or at its entrance. Close the glass panel
with Esc or the X button. Existing NPC quest dialogue still uses its normal E
handoff when no vendor is active.

**Economy safety:** These first-pass purchases reuse the game's existing
character-scoped browser stores. They are *not server-authoritative orders*;
wire purchases through an authenticated, idempotent ledger before enabling
server-backed multiplayer trading or real currency.

## Performance
- Auto low-detail mode on coarse-pointer/mobile; fewer cylinder and sphere
  segments, fewer roof ribs, and lower-resolution procedural textures.
- Merge static mesh batches inside the roofs, the walls of eight residences,
  shop interiors and fountain stone courses. Dynamic water, moving door
  meshes, glowing rune props and showroom models remain independently animated.
- Distance-cull whole home/shop groups periodically.
- The host can inspect `importedSpawnTown.performanceStats`, mirrored in
  `root.userData.townReplacement.performance`, for before/after draw-mesh
  and triangle counts. Numbers depend on the hardware quality mode.
- Preserve the crystal water cascade and spiral energy ribbons.

## Automated tests
```sh
node --test tests/wolfveil-artisan-town-navigation.test.mjs tests/wolfveil-town-cutaway-camera.test.mjs
npm ci
npm run build
```

## Manual clone QA before merging
1. Visit all 8 homes (ground floor), enter/exit through each front opening.
2. Visit all 4 shops from their front and side entrances; try walking into
   solid rear and side walls. There must be no full-building invisible box.
3. Open the vendor panels; purchase items on a test character, try a
   low-Silver purchase, and check equipment/consumable persistence.
4. Preview all three showroom mounts; confirm no inventory changes.
5. Check floor-step alignment, NPC patrol and quest interactions, daylight,
   night effects, camera/roof cutaway and multiplayer separation.
6. Measure actual desktop/phone FPS, GPU memory, load time, draw calls, and
   wall collision while sprinting or click-to-move. Tune further if needed.

**Status:** Integrated in a draft PR for clone review, not deployed or merged
to production. Build/navigation tests do not substitute for live walk-through QA.
