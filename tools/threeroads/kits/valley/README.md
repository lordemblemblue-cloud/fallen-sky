# Valley kit (The War of Three Roads)

Builds `public/game3d/threeroads/kits/valley.glb`: the 37 pieces of
`src/components/game3d/threeroads/kits/valleyKitPieces.mjs`, each as `<id>_LOD0` and `<id>_LOD1`,
one 2048 WebP atlas, materials `valley_lit` and `valley_glow` (emissive, same atlas).
Every mesh is fitted to its table size and pivot; node transforms are identity.

Headless Blender 5.2 only (`-b --factory-startup`, never the owner's open Blender), and never `python`.

```bash
B="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" -b --factory-startup -P tools/threeroads/kits/valley/build_valley_kit.py -- --samples 64   # about 2 minutes
node tools/threeroads/kits/valley/check_valley_kit.mjs                                        # per piece: tris, size, pivot, material; totals
node --test tests/game3d-three-roads-valley-kit.test.mjs
# contact sheets (LOD0 with a 1.8 m figure; LOD0 vs LOD1 at 60 m in screen pixels)
"$B" -b --factory-startup -P tools/threeroads/kits/valley/render_sheets.py -- public/game3d/threeroads/kits/valley.glb OUT/tiles_near near
node tools/threeroads/kits/valley/compose_sheet.mjs OUT/tiles_near near OUT/valley_sheet_near.png
```

| File | What |
| --- | --- |
| `pieces.py` | One builder per piece, in game coordinates (x right, y up, z front). `B.lod` 1 drops small parts and round segments. |
| `kitlib.py` | Primitives (box, beam, lathe, ring, hull, rock, roofs), palette, `Builder.finish` (fit to size, pivot, Z-up conversion). |
| `kitbake.py` | Unwrap and pack all pieces into one atlas; bake procedural colour per palette key plus AO over a ground plane; or `--flat` swatches. |
| `build_valley_kit.py` | Reads the piece table, builds, bakes, exports. `--flat` (no bake, seconds), `--boxes` (stand-in boxes), `--only a,b`, `--blend`, `--atlas`. |
| `valleyKitInspect.mjs`, `check_valley_kit.mjs` | Reads the GLB and checks it against the table and `VALLEY_KIT_LIMITS`. |
| `render_sheets.py`, `compose_sheet.mjs` | The two contact sheets. |

To change a piece: edit its builder in `pieces.py`, rebuild with `--flat` to look quickly, then the full bake.
Colours are palette keys in `kitlib.PALETTE`; tinted pieces (`tint: true`) use `white`/`white_dk` only.

Blender 5.2 pitfall met here: `mesh.materials.clear()` resets every face's material index, and so does entering
edit mode on an object with fewer slots than indices; `kitbake.bake_atlas` saves and restores them.
