# R145 — concurrent Blacksmith transactions and replay

Continues R144 on draft PR #425, based on main ab03f50a184f9c981f08f579d4f1fc22dbb006be. Run from root:

```sh
node --test tests/fixtures/r145/concurrency.test.mjs
```

Local Linux Node v22.16.0: 9 tests, 9 pass, 0 fail, 0 skipped; elapsed 538.848 ms for the suite, experimental node:sqlite warning. Tested Git blob 3355a12b80d900666b57fce305b243289c0f916c matches retrieved GitHub file, commit 282d7039f0fee764da28ca2d20e0934c0ba84140. Historical R140–R144 results: 55 passes, not rerun in this pass. Total recorded 64 across six suites, not production certification.

## Observed scope

Disposable file-backed SQLite WAL, synchronous FULL, two independent worker connections synchronized at a start gate, BEGIN IMMEDIATE and revision checks. Nine tests: identical request replay, competing donor across combine/stage, final material competition, distinct character scopes, conflicting intent for same transaction ID, injected precommit failure, lost reply and older receipt after later upgrade, bounded lock contention, and noncompeting retry. Receipt, revision, gold, material and donor changes commit together. Two same-revision different requests conflict; the losing request must revalidate at a fresh revision rather than auto-spend. If a donor or material is no longer present, refuse the retry.

## Production compatibility

Reviewed base44/shared/itemUpgradeLedger.ts at pinned main (blob a5a80f7818a307f1606a506246a4aad555fe3c2d), lines 113–194. Real rules delegate to resolveReinforcement, resolveOverEnchant, resolveRefine, resolveUltimate, resolveCombineRecord, resolveAscensionRecord and resolveTierUp; actual cost derives from service-specific catalog functions. Ascension catalyst cost depends on outcome; maximum affordability is checked before applying actual cost. spentCounts treats drop IDs as a multiset (rare duplicates), and pickCostUnits accounts for previously spent units. The synthetic fixture uses unique material labels and must not substitute for that legacy behavior. R144 source review identified latest-only transaction replay; no claim that the live endpoint permits exploitation. Verify actual atomicity before proposing an integration.

## Limitations and next

Synthetic success-only outcomes, 2 gold and one material per operation, no real catalog or random rolls, no actual authentication, no real restore interlock in this suite, no production load or CI run. Earlier R144 tests cover synthetic failure/locked gear and restore flag separately. SQLite serializes writers, not evidence of Base44 distributed transaction guarantees. Worker pairs are not a stress/load test, and injected lost reply is not a real network failure. No production source or policy changed. Guest entry and existing upgrade costs remain untouched. Base44 atomicity and discovery deployment evidence still unresolved.

Next R146: move toward a narrow compatibility test of actual Blacksmith rule functions and material accounting, including duplicate legacy drop IDs, result-dependent costs, donor restrictions and restore reconciliation. Locate actual source dependencies and execute tests against pinned source where possible. Avoid expanding synthetic-only coverage indefinitely; no production integration until verified. No merge or deployment authorization.
