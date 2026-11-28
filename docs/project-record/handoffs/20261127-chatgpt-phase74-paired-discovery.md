# Phase 74 — WP-FS-S3 / FS-S06

Project: Fallen Sky. Branch `feature/fallen-sky-phase74-paired-discovery`, PR #443, pinned main 9081292c685a60328bdcc22444486d778af9fc5f.
Completed: `src/components/game3d/narrative/pairedDiscoveryModel.mjs` and `tests/fallenSkyPairedDiscoveryModel.test.mjs`. Generic isolated per-discovery journal accepts D01–D50, explicit fixture enablement, strict scoped events, independent observations, voluntary reveal and entry recheck, occupied lease and safe-exit independence, verified interaction/receipt/second vista split, legacy historical completion annotation, read-only lifetime receipt reuse, positive authored closure. No reward writer, scene, inventory or live imports. Existing paired discovery material store unchanged.
Approved: R66 owner-required second vista, R76/R76A carryover and actual opportunity; exact fixture API is proposed, not production authorization. Preserve Phase 61 specific access conditions. No new story bindings or NPC lifetime assumptions. Left incomplete: trusted event and entitlement ledger, actual per-ID predicates, storage authority, legacy import mapping, collision/egress recovery, approval to mount. Occupied reload is diagnostic preflight only; no actual lease persists across engine reload here. Prior receipt provided by trusted fixture setup; new receipt observation does not prove cross-cycle uniqueness or item ownership. Legacy without actual ledger receipt requires reconciliation, never a new grant. No live authoritative transaction, scene, or security test. Assets: none for fixture; survey and rigs per Claude. Missing information: existing MI-FS-S1/S2/S3/S6, no added assumption. Next WP-FS-S4 zero-optional graph test.
Tests performed: exact authored module and test scenario body evaluated in isolated JS with strict equality and expected-throw assertions. 46/46 named scenarios passed (one covers all 50 canonical disabled IDs). Native Node, CI/lint/build NOT RUN. Live/visual NOT RUN. Cases:
- PASS all 50 canonical IDs recognized but disabled unless explicitly set
- PASS unknown ID refused
- PASS non discovery ID refused
- PASS no initial completion
- PASS unverified closure rejected
- PASS unverified observation rejected
- PASS early reveal rejected
- PASS early claim rejected
- PASS early vista rejected
- PASS first order original then preserved
- PASS duplicate observation rejected
- PASS unsafe collision prevents reveal
- PASS unsafe exit prevents reveal
- PASS involuntary reveal refused
- PASS focus release outside closes reveal
- PASS entry rechecks collision
- PASS focus release inside retains lease
- PASS occupied reload flagged for preflight
- PASS unverified interaction rejected
- PASS verified interaction does not claim
- PASS unverified receipt rejected
- PASS exit independent before claim
- PASS verified delayed claim after exit
- PASS receipt cannot repeat with new event ID
- PASS reload between claim and vista
- PASS temporary wait preserves claim
- PASS vista requires voluntary actual access
- PASS vista completes narrative after claim
- PASS no repeat vista
- PASS other observation order
- PASS genuine closure cannot reopen within cycle
- PASS closed occupied chamber still exits
- PASS legacy completion retained without fabricated vista
- PASS legacy without ledger cannot mint
- PASS legacy with real historical receipt can finish vista
- PASS NG+ uses lifetime receipt only, new cycle objectives
- PASS existing entitlement rejects new grant mode and mismatched receipt
- PASS foreign character denied
- PASS foreign cycle snapshot denied
- PASS different discovery snapshot denied
- PASS injected reward fields rejected
- PASS stale revision rejected
- PASS exact event replay safe even stale
- PASS receipt ID conflict refused
- PASS tampered history rejected
- PASS malformed snapshot rejected
No merge, publication or production writes.
