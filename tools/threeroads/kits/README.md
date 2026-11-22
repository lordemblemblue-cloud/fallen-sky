# Three Roads kits

One GLB per kit in `public/game3d/threeroads/kits/`: `valley`, `remoria`, `akitsu`, `tameri`. Each holds
the pieces of its table (`src/components/game3d/threeroads/kits/valleyKitPieces.mjs`,
`empireKitPieces.mjs`) as `<id>_LOD0` and `<id>_LOD1`, one 2048 WebP atlas and two materials,
`<kit>_lit` and `<kit>_glow`. Headless Blender 5.2 only (`-b --factory-startup`), never `python`.

```bash
B="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" -b --factory-startup -P tools/threeroads/kits/common/kitbuild.py -- remoria            # add --flat for a quick look
node tools/threeroads/kits/common/check_kit.mjs remoria
node --test tests/game3d-three-roads-kit-remoria.test.mjs
# contact sheets: LOD0 with a 1.8 m figure ("near"), LOD0 beside LOD1 at 60 m ("far")
"$B" -b --factory-startup -P tools/threeroads/kits/common/render_sheets.py -- public/game3d/threeroads/kits/remoria.glb OUT/tiles near remoria
node tools/threeroads/kits/common/compose_sheet.mjs remoria OUT/tiles near OUT/sheet.png
```

| `common/` | What |
| --- | --- |
| `kitlib.py` | Primitives (box, beam, limb, lathe, ring, hull, rock, roofs), the shared palette, `Builder.finish` (fit to the table, pivot, skirt, Z-up conversion). |
| `kitbake.py` | Unwrap and pack a kit into one atlas; bake procedural colour per palette key plus AO over a ground plane; uniform tiles for `TILE_KEYS`; or flat swatches. |
| `kitbuild.py` | Reads a kit's table, builds, bakes, exports. Options `--flat`, `--boxes`, `--only a,b`, `--blend`, `--atlas`, `--samples`. |
| `kitInspect.mjs`, `check_kit.mjs` | Read a GLB and check it against its table and limits. |
| `render_sheets.py`, `compose_sheet.mjs` | The contact sheets. |

Each kit folder has `pieces.py`: one builder per piece id, in game coordinates (x right, y up, z front),
built above y = 0. `B.lod` 1 keeps the outline and colours and drops small parts.

Pivots: `base` (footprint centre on y 0), `top` (hangs from y 0), `hub`/`centre` (centred on all axes),
`wagon`/`basket` (start at y 1.2), `bowl`/`brazier` (start at y 1.1), `kettle` (y 0, shares its kettle's
origin), `frame` (footprint centred; the piece reaches 6 m beyond it toward +Z), `waterline` (y 0 is the
water; the hull goes below it). `skirt`: everything touching the ground is carried down that far.

Blender 5.2 pitfalls met here: `mesh.materials.clear()` resets every face's material index, and so does
entering edit mode on an object with fewer slots than indices; the UV packer spreads islands over UDIM
tiles unless they start inside 0..1; saving an image renames it.
