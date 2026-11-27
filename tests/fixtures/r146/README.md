# R146 — tests of existing Blacksmith rule modules

Continues R145 in draft PR #425; main pinned ab03f50a184f9c981f08f579d4f1fc22dbb006be. Unlike previous synthetic transaction fixtures, these tests import the actual shared rule modules, with synthetic item instances and deterministic roll inputs. No production source changed.

Run from repository root with Node v22.16.0:

```sh
node --experimental-strip-types --test tests/fixtures/r146/*.test.mjs
```

Observed local Linux Node v22.16.0: **19 tests, 19 pass, 0 fail, 0 skipped** (243.420639 ms total; experimental Type Stripping warning). Direct network fetch unavailable in sandbox; retrieved source via GitHub connector and transcribed locally, then verified exact Git blob hashes before execution. No stub modules or replacement rules. Source files verified:

| Existing source | Git blob |
|---|---|
| base44/shared/axeItemEnhancement.ts | 6b02e51f9dab2e012832ebf6ebee70fe5f7533b1 |
| base44/shared/axeItemAdvancement.ts | 62766d9e415b81c6466cbf3a7a8e668c389f2139 |
| base44/shared/axeServiceEconomy.ts | 6e450287618031f40941bd4898831e7939a18f82 |

Both committed test blobs match the exact executed files: enhancement.test.mjs b064ddf342fa2cd879d01035ff719467c562626d (8ee6abc82fcd78a5422df1fb18d043e2e4ffe25d), advancement.test.mjs da8f648eadff67e02014fca94f42d9db94821e81 (1a67cbca0b42e8dd69c7ad35387bce62da60b95c). Historical R140–R145 record 64 passes, not rerun here; 83 recorded across all revisions, not a production pass percentage.

## Verified behavior at this source revision

- Enchant: +5 points on success, -3 on unprotected failure, no destruction; 100% chance through current 40%, 200% general cap; future mythic/mystical 120%. Stabilizer prevents failure downgrade. Over-Enchant +10 cap, fracture starts at +4, protected failure preserves record, success clears fracture. Additive enhancement share.
- Combine: matching rarity, level, slot/subtype; different templates permitted. Equipped, locked, favorite/favorited/isFavorite and vanity-only donors rejected. Success consumes donor and advances count; failure preserves both. Max 12, configured +2% original stat share per stage; chance curve starts 90%, config minimum 35%. Current fee map empty.
- Ascension: Rare, Elite, Legendary; same rarity and slot/subtype, donor level equal or lower, no protected donor. Odds for +1..+4 are 100/80/65/50%; failure preserves donor and rank, success consumes donor. Current +4 own-item stat bonus fractions .15/.75/1.0 respectively. Chosen has separate materials-only legacy path, no individual Ascension stat bonus. New path fee and catalyst maps currently empty; no nonzero outcome-dependent cost tested. Mythic disabled for this path.
- Existing service cost growth, protection material, Chosen stage stones, Refine downgrade/destruction and protection, Ultimate rarity/sealing/recovery. Ordinary Enchant non-destruction is distinct from high-level Refine destruction.

These are observed current-source settings, not a request to change them or new owner approval. Compare any later owner balance decisions separately before modifying source. R144/R145 synthetic costs are not real catalog values.

## Remaining gates

Reviewed dependency closure for itemUpgradeLedger.ts: imports the above three modules and axeGearTiers.ts (6a0879d89b7100c4a6a4b0f02c60be35c103c240); ledger a5a80f7818a307f1606a506246a4aad555fe3c2d. Full ledger, gear-tier and legacy duplicate drop-ID accounting have not yet been executed. No actual material removal, save restoration, server roll endpoint, database concurrency, CI, production app or live data verified by R146. Prior SQLite experiments remain independent. Base44 atomicity and missing discovery deployment source still block production transaction integration.

Next R147: direct tests of actual itemUpgradeLedger.ts and axeGearTiers.ts, including multiset spent drop IDs, donor removal, restore record reconciliation and tier-up rules; then narrow integration assessment. No merge/deploy authorization.
