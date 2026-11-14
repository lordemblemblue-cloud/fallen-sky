# Final Wolfveil Town Plaza clearance — video review 2026-11-14

Repository: `marcusflow1-arch/gitsync-pro`, clone Game 3D.

The owner recorded a 38-second Base44 clone preview showing leftover stair/wall chunks, freestanding black building/roof beams near the plaza boundary, extra trees and blue/cyan ground fixtures, with green checkerboard paving where stone is requested.

## Keep
- The one ancient/central tree and its floor planter/design (separate hand-placed FBX tree root, outside imported GLB cleanup).
- Town brick/paving/tile surfaces and their collision triangles; existing paths and low outer boundary.
- Original entrance gate and warm lanterns; never delete the entire surrounding Wolfveil landscape or unrelated NPCs.
- Natural Wolfveil exterior terrain, grass, forest and its independent geometry.

## Remove
- All nonessential imported building roofs, remnants, upright structural beams, stair/wall posts, bridge remnants and loose material inside the plaza, **including the former 4.5m perimeter-exemption band**.
- Extra trees and pink/blossom parts elsewhere; cyan/blue named pedestal/obelisk marker meshes in the imported town.
- Tall stone stair pieces while retaining low horizontal stone, stone artwork and central brick inlay.
- Remove 3 automatically generated decorative gateways outside the plaza. Retain only the main southern entrance gate and two warm hanging lanterns. The four **ground-level approach ramps** remain for walking.

- The green checkerboard/plaza “grass” material is replaced with a textured stone material on imported-town floor meshes; exterior Wolfveil landscaping remains unchanged.

## Implementation
- `WolfveilImportedTownInteriorClearance.mjs`: indexed triangle-by-triangle cleanup of the imported mesh rather than toggling visibility. Low perimeter surfaces remain, but perimeter posts/roof fragments do not.
- `WolfveilImportedTownCritique.mjs`: warm entry gateway count reduced to one; imported green plaza textures use Sumi-e stone.
- One authoritative geometry index determines render and collision. No hidden wall hitbox should remain after a triangle is removed.

## Validation and limitations
- Added `node --test tests/game3d-clone-town-interior-clearance.test.mjs` and a PR workflow for tests plus frontend build.
- This branch has **not** been inspected in a signed-in Base44 preview. The recorded frame only proves defects existed before these changes, not that they were eliminated afterward.
- Exact shape of merged Blender meshes, obstruction location, blue upright fixtures **outside** the imported town GLB, and player-foot traversal/collision across every tile must still be verified. Never mark the square 100% until the player walks it.
- The linked Base44 editor app from the screenshot is not accessible through the connected Base44 account. Uploading code to GitHub alone will not update or publish its preview.
