# Game 3D Clone — Classic Wolfveil restored, selective Suigen assets reused

**Date:** 2026-11-15  
**Repository:** `marcusflow1-arch/gitsync-pro`  
**Owner instruction:** Restore the existing map and take selected trees, bamboo, rock and terrain character from the uploaded Dominion of Suigen instead of replacing Wolfveil wholesale.

## Exact input and original assets

The attached `Wolfveil_Dominion_Of_Suigen_2400m_AAA_Map.mjs` and `(1).mjs` are byte-identical (SHA-256 `31106c299eb7b793cee7556ebc18f1721063914974f5904091485a33cc21f790`).

The original 2,400m source GLB remains untouched; its embedded scene is **not** used as a replacement for Classic Wolfveil in the default mode.

I extracted **18 original mesh components** with their original UVs, geometry and glTF/PBR material definitions, in a small `406,324`-byte GLB (SHA-256 `420c09e11bc02e86d9033beb45356ee052c515215ca181eb9f4bdb666548e5c3`). It contains:

| Prefab | Actual source nodes and components | Purpose |
|---|---|---|
| CherryTree | `Map_Object_1034` through `Map_Object_1038` (5 parts) | Natural cherry bark and blossoms |
| OakTree | `Map_Object_1104` through `Map_Object_1108` (5 parts) | Green ancient oak trunk and foliage |
| MapleTree | `Map_Object_1109` through `Map_Object_1113` (5 parts) | Red maple foliage and bark |
| Bamboo | a small upright cut of `Baked_GLB_Bamboo_Forest_Mesh` (1 part) | Original emerald bamboo forest model; deliberately not using the source's sideways individual sticks |
| MossRock | `Map_Object_1964` (1 part) | Mossy forest stone / natural terrain details |
| BasaltRock | `Map_Object_1966` (1 part) | Cracked basalt / cliff-edge rock detail |

**Asset URL:** `https://media.base44.com/files/public/6ab42219a52fd34656a53b37/1c09c2eb8_wolfveil_suigen_selective_assets.glb`.

The uploaded GLB pack is an actual extracted subset of the owner's scene; it is **not** merely new procedural shapes inspired by that scene. A copy of the raw texture or heightmap is not substituted for the Classic game terrain.

## What changes in the clone

- Escape → Graphics → World Map defaults to **Classic Wolfveil · Main Map**.
- **Dominion of Suigen · Archive** retains the complete alternative 2,400m source scene, its 60-house procedural extension, shops, underground stairs, water vortex and alternate dungeon portals for optional revisits.
- A new **v2 selection preference** means older `v1=suigen` selections do not force the player straight back into the uploaded replacement world. Once selected in v2, the person's explicit Classic/Suigen choice persists normally. No inventory/quest/character save is deleted.
- Classic keeps its *actual* 1,100m physical terrain, existing rivers, waterfall, original quest positions, player spawn, town, cave entrances, combat and server movement rules. It receives **a small cosmetic layer** of selected, original Suigen oak/cherry/maple trees, baked bamboo, mossy boulders and basalt stones.
- **30 candidate placements** are planned around the existing woodland and mountain outskirts, outside town and accessible roads. At runtime each candidate is validated against the Wolfveil playable boundary, protected landscaping tiles, quest-site clearance, town footprint, river and paths, plus existing actual ground elevation. Unsafe placements are omitted, not forcibly inserted.
- No new physical terrain, water, stairs, portals or building collision is copied over. All transferred props are **decorative only** to avoid disagreement with the server-authoritative collision system; the original Classic forest models remain visible if loading the extracted pack fails.
- The accent pack is downloaded once and reused for all groups; shared geometries and PBR materials are disposed only after all instances are removed. Changing to Suigen hides the Classic accent layer; switching back restores it.
- The visual intent is painterly fantasy / Zelda-inspired composition with the original source's tree, bamboo and rock material character. This does not claim an official licensed Zelda asset pack.

## QA and current limits

**Completed:** Exact owner-source inspection, extracted binary verification, upload to Base44 media library, clone code and targeted source/regression test additions.

**NOT yet verified:** Native clone production build, signed-in Play/WebGL visual walkthrough, remote asset loading/CORS on the target preview, tree root seating at every coordinate, FPS on mobile or other devices, camera clipping, and fully reliable all-player collision parity. Existing GitHub native workflow logs have also been incomplete/unavailable during earlier phases. Do not label this 100% AAA verified until a real end-to-end walkthrough confirms it.

**Recommended first inspection:** Start in the Classic map, visit western forest x ≈ -450/z≈200–400, eastern bamboo x≈315–455/z≈260–370, and southwest maple/rock x≈-350 to-475/z≈-300 to-400. Confirm trunks and bamboo are grounded, river/quest paths clear, the original town remains intact, and switching Classic → Suigen → Classic never changes the character position or progression.

**Future separate work:** Only after visual confirmation, decide whether some original Suigen geological surface *colors* should be adapted to selected Classic terrain squares. Do not replace the trusted Classic heightfield with a 2,400m imported mesh. Artist-authored painted surfaces must respect assigned LAND workstreams and the one-square quality rule.
