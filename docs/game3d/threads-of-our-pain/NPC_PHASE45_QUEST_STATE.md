# Phase 45 — Opening quest state foundation

Development-only, not connected to GameView or existing saves. Stacked on #405 and #404. Read current main story index, R61 stable IDs and R67 chronology. Existing useQuestStore.jsx is untouched. The adapter accepts only M01–M06 and S01–S08 definitions explicitly supplied by a future reviewed integration; no production definitions or activation provided. Test fixtures use synthetic objective IDs, not actual authored content.

## Contract
- Exact main predecessor chain, independent of optional quests. M01–M03 and M06 preserved; M04–M05 original. Reality on event is a future trusted host assertion, not proof of travel. No transition or death/respawn implementation; preserve R67 M05 authored death and unresolved local chronology.
- Scope is owner + character + campaign. Versioned event journal, strict ID/objective checking, exact retry detection, conflict on reused event ID, expected revision check, bounded serialization and replay validation. No automatic migration of unscoped legacy quest history. Completion is narrative only: no item, gold, XP, server entitlement or ending.
- This local model is not an authentication or anti-cheat boundary. A client can forge its own local save; server-authorized rewards require independent evidence, durable atomic receipt and concurrency enforcement. Expected revision in a pure function is not a database CAS. A future persistence integration must atomically compare and commit against current stored revision (or enforce a single writer), handle write errors and character switching, and never overwrite corrupt saves. Do not mount until reviewed.
- No paired focus, M19/M20, discovery claims or postgame policies implemented. S01–S08 objective contracts and actual availability remain pending; do not use fixture definitions in game. No UI, renderer, terrain, Base44 endpoints, schema or existing storage changes.

## Validation
32 isolated JavaScript scenarios passed in development runtime before commit. Node test file exercises the same cases; repository CI, lint, build, deployed Base44 scan and browser tests not executed. Next: author source-mapped M01–M06 definitions, inspect authoritative event/reward callers, design persistence host and safe terrain entry in separate PRs. No merge/deploy from this pass.
