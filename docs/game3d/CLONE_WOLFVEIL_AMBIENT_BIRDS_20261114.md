# Game 3D clone — ambient bird flocks (review QA hold)

**Scope:** `marcusflow1-arch/gitsync-pro` Game 3D `wolfveil` only. Tracks #67.
Do not fold this into Game 1, other games, player saves, terrain or combat.

## User-supplied asset (inspected, not an animation pack)
- Source upload: `tripo_convert_bdd73c28-af44-45e3-b758-1d783314f872.glb`.
- GLB 2,239,712 bytes, original Tripo generator header, 1 textured skinned mesh,
  7,142 vertices, 6,920 triangles, 21 rig joints, **0 animation clips**.
- Media asset: `https://media.base44.com/files/public/6ab42219a52fd34656a53b37/d9fad7809_tripo_convert_bdd73c28-af44-45e3-b758-1d783314f872.glb`.
- Public CDN URL was returned by connected Base44 asset upload. **No signed-in
  browser/CORS load or model visual comparison is verified yet.** Check asset
  provenance/licensing before redistributing outside the owner's application.

## Actual proposed effect
- 1 async GLB load; SkeletonUtils clones share a textured mesh, materials and
  original bones. The left/right limb bone roots get modest procedural flap
  rotations (source has no clips). If GLB fetch fails, lightweight 3D fallback.
- Nearby birds independently **fly → descend → land → rest → take off → fly**
  on height-sampled eligible terrain, not through rivers, towns, known routes,
  reserved southwest LAND-WS tiles or steep gradients.
- Far birds are cheap V-wing geometry in **one instanced draw call**.
  Near+far budgets: Low 4+7, Medium 9+14, High 14+22, Ultra 18+28 maximum;
  on coarse pointer/mobile or long frame times the budget shrinks automatically.
  These are local streaming densities around the player, NOT 46 persistent
  network entities spread across the entire authoritative world.
- GameWorld3D mounts this only when `region==='wolfveil'`, updates both
  character-select background and Play frames, tracks Graphics quality events,
  and disposes on world exit. All bird meshes ignore raycasts. No physical
  colliders, terrain meshes, server spawn or combat authority.
- Root model faces approximately toward local -X. Verify limb/bone articulation,
  scale, centerline, beak orientation, feather silhouette, landing contact and
  avoidance through *actual rendered* Play before acceptance.

## Verification ledger
- Inspected original GLB binary header and mesh; generated a local 3-angle
  inspection projection to confirm the uploaded subject is a perched bird.
- Source-based V8 isolated checks of the committed pure planner:
  **7/7 PASS** (quality/performance count, deterministic positions, landing
  exclusions, slope rejection and full airborne/landing/takeoff state cycle).
  Committed Node suite `tests/game3d-clone-ambient-birds.test.mjs` includes
  those contracts but was **NOT RUN in a full repo checkout**.
- `WolfveilAmbientBirds.mjs` passed V8 syntax parsing after stripping imports;
  this is NOT equivalent to a Three.js GPU render or Vite compile.
- **NOT RUN:** `npm ci`, `npm run build`, native `node --test`, authenticated
  browser Play, model/CORS load, character/mount traversal, FPS/LOD under combat
  stress, phone GPU budget, owner image/asset fidelity, two-client observation.

## Review/deploy gate
Clone PR #63 was already merged and remains untouched. Review overlaps with
open clone PRs editing `GameWorld3D.jsx` (such as #61 and #16) before merge.
Do not bypass protections or interpret no-step hosted CI as a proven code defect.
This is **draft / clone source integrated, not deployed or Play-certified**.
Next: run local Node tests/build, signed-in Game 3D clone QA at town exit,
forest and meadow during combat; check ground landing, wing bones, movement,
low/high/mobile FPS, no visual duplicates; amend and independently approve PR
before merging/publishing.
