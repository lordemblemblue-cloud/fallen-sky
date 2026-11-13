# WS15 — real-forest-inspired Wolfveil trail landscaping

**2026-11-13 — SOURCE-ONLY REVIEW BRANCH. NOT MERGED OR DEPLOYED.**
Twin repositories: marcusflow1-arch/atom-x-eve-os and marcusflow1-arch/gitsync-pro.

## Real-world mapping references

- **Hoh Rain Forest, Olympic National Park:** Hall of Mosses / Spruce Nature Trail — mossy edges, forest/stream transitions, layered green understory. Official NPS: https://www.nps.gov/olym/planyourvisit/visiting-the-hoh.htm
  Google Maps lookup: https://www.google.com/maps/search/?api=1&query=Hoh+Rain+Forest+Olympic+National+Park
- **Epping Forest, London:** interconnected waymarked forest paths, variable verge widths and gaps. City of London: https://www.cityoflondon.gov.uk/things-to-do/green-spaces/epping-forest/activities-in-epping-forest/walking-and-running-in-epping-forest
  Google Maps lookup: https://www.google.com/maps/search/?api=1&query=Epping+Forest+London
- **Saugatuck Dunes State Park, Michigan:** rolling sandy-woodland trails and varied ground-cover edges. Michigan DNR: https://www.michigan.gov/recsearch/parks/saugatuck
  Google Maps lookup: https://www.google.com/maps/search/?api=1&query=Saugatuck+Dunes+State+Park

No Google Maps API credentials were available or used. No Google tiles, rasters, Street View photographs, site coordinates or proprietary geometry were downloaded, traced or copied. All Wolfveil placements use original procedural math against the game's own scene, and the public trail guides above are design references only.

## Implemented source changes

- Existing western woodland fork and training-forest corridors only, using local Wolfveil coordinates. Game 3D applies the existing +70m Z world transform exactly once.
- Original indexed terrain receives feathered natural loam and moss-green vertex color variation outside the existing trail tread. No new mesh, geometry height, road, physics floor, collider or BVH changes.
- Existing route-side grass gets shorter blades, irregular original-green shades and varied widths, with every X/Y/Z root unchanged.
- Up to 90 staggered, embedded slate-stone candidates are sampled against the real visible terrain, guarded by four footprint elevations, road/building clearance, water, existing owner FBX roots and tile reservations. Existing SW 50% decorative thinning still applies. No new collision objects.
- Protected X40-Z123, X49-Z113, X64-Z130, X46-Z116 and T07-05 squares and existing SW workstream exclusions are left alone. No Game 1, unrelated screen, tree-anchor, river route or authoritative server changes.

## Files on both branches

- src/components/game3d/wolfveil/WolfveilForestTrailLandscape.mjs — planner, edge metric, pigment, tile guards and decorative stones.
- src/components/game3d/wolfveil/WolfveilGroundCover.js — opt-in on the existing Game 3D-only planting and stone batches.
- src/components/game3d/wolfveil/WolfveilScene.js — paint original indexed terrain only at the market-origin Game 3D opt-in.
- tests/game3d-wolfveil-forest-trail-landscape.test.mjs — source regressions for route influence, owned squares, no-height-change, fixed roots, budgets and Game 1 exclusion.

## Actual checks and outstanding gates

Executed in each repo: **10/10 V8 source-function assertions passed** against the exact branch module and the current canonical 10 Wolfveil route records. The permissive test fixture produced 90 bounded candidate stones, and mocked terrain pigment updated one qualifying vertex without changing protected/far vertices. These are source-only checks, not actual screenshot or physics evidence.

NOT executed: committed native Node tests, full project build, signed-in Game 3D Play, true terrain/slope+mount walkthrough, GPU shaders, before/after screenshots, rainy/day/night materials, low/high FPS, imported town obstruction QA or two-client authority QA. Real Play may generate fewer than 90 stones.

Before any release: run the new Node test and the app build in both repos; visually compare real west-woodland/training-forest shoulder boundaries; verify no grass intersects neighboring owned tiles; confirm forest stones stay embedded and nonblocking; inspect collision of walls, stairs, water, trees and paths; profile graphics; obtain landscape hub #1266, WS15 #1281 and independent square-owner acceptance. Do not mark an unfinished terrain square 100% or merge on source checks alone.
