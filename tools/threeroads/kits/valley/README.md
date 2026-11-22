# Valley kit (The War of Three Roads)

Builds `public/game3d/threeroads/kits/valley.glb`: the pieces (38 today) of
`src/components/game3d/threeroads/kits/valleyKitPieces.mjs`, each as `<id>_LOD0` and `<id>_LOD1`,
one 2048 WebP atlas, materials `valley_lit` and `valley_glow` (emissive, same atlas).
Every mesh is fitted to its table size and pivot; node transforms are identity.

The build, bake, checks and contact sheets are shared by every kit and live in `../common/`
(see `../README.md`). This folder holds what is the valley's own: `pieces.py` (one builder per
piece, plus `TILE_KEYS`, `TEXEL` and the contact-sheet `COMBO`) and thin wrappers.

```bash
B="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" -b --factory-startup -P tools/threeroads/kits/valley/build_valley_kit.py -- --samples 64   # about 2.5 minutes
node tools/threeroads/kits/valley/check_valley_kit.mjs
node --test tests/game3d-three-roads-valley-kit.test.mjs
```

Bark (`TILE_KEYS = ('bark',)`) is not unwrapped per face: every bark face maps into one uniform bark
tile at the top of the atlas. The Oath Tree's trunk and limbs are made of many narrow strips, and in
the game the lower mip levels of a per-face unwrap blended those strips with their neighbours
(stripes and specks of other colours on the trunk from a few metres away).
