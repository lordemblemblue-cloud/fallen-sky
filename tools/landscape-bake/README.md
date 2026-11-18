# Wolfveil landscape bakes (high-poly → texture → low-poly)

Headless Blender 5.2 scripts (Blender's bundled Python + numpy; no system Python needed).
Always use `-b --factory-startup` so the owner's open Blender session and preferences are never touched.

| Script | Builds | Output (default `public/game3d/landscape`) |
|---|---|---|
| `bake_materials.py` | Seamless high-poly ground patches (dirt pebbles/straw, ~42k grass blades, fractured cliff blocks, granite setts, herringbone brick), baked top-down: normal, colour, AO, height | `wv_{dirt,grass,rock,cobble,brick}_{albedo,normal}.webp` (normal alpha = height) |
| `bake_rocks.py` | Six 327,680-triangle rock sculpts → 900/270/76-triangle LODs with a shared baked atlas | `wv_rocks.glb` |
| `bake_textures.py` | Procedural height-field textures (snow; legacy recipes kept for reference) | `wv_snow_*.webp` |
| `../../scripts/bake-wolfveil-terrain-macro.mjs` (Node) | 0.54 m evaluation + erosion of the shared height function | `wv_terrain_macro_*.webp` + `.json` |

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/landscape-bake/bake_materials.py -- public/game3d/landscape --preview docs/game3d/landscaping/bake-20261116 [wv_dirt wv_grass ...]
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/landscape-bake/bake_rocks.py -- public/game3d/landscape docs/game3d/landscaping/bake-20261116
node scripts/bake-wolfveil-terrain-macro.mjs --preview docs/game3d/landscaping/bake-20261116
```

After a material re-bake, copy the printed `MEANS` (sRGB) into `WOLFVEIL_SPLAT_LAYERS` in
`src/components/game3d/wolfveil/WolfveilTerrainSplat.js` (used to turn palette colours into tints).
After any change to the height function, re-run the macro bake (a test checks its checksum).
See `docs/game3d/landscaping/WOLFVEIL_LANDSCAPE_ROUND2_20261118.md`.
