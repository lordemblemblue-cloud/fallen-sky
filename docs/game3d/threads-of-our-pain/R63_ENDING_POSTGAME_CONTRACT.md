# R63 — Ending consequences and postgame access decision package

27 November 2026. Sources: R39–R41 recovered source, R42 S55, R46 D50, R54 ending pass, R61 continuity ledger, R62 character/quest audit. This document refines the existing candidates and identifies approval gates. It is not a third ending, new canon, an implemented save service or owner approval.

## 1. Fixed narrative rules

- M05 physical death is a fixed story event. Later chapter presentation of the older protagonist's genuine experiences does not establish that they occur after that death locally.
- M19 interrupts forced convergence before any life-force decision. The victory does not establish the fate of the planet or automatically heal the human war. The hostile goddess's remaining identity and motives may remain mysteries.
- The optional sacrifice/rebirth premise is owner-directed; the new protagonist has emotional echoes, not conscious catastrophe memories. The third reality has no invasion history. The Moon Goddess is honored there as healer and guardian among the Twelve.
- M20 reads the chosen M19 outcome, never silently changes it. Neither generosity, completed discoveries, faction allegiance nor reward availability dictates the ending.
- Both choices receive equal visual prominence, equal campaign completion recognition and accessible confirmation. No countdown, morality grading, required optional content or gameplay incentive to sacrifice.

## 2. Consequence matrix — recommended candidates, not approved

| Subject | Separation | Rebirth | Approval boundary |
|---|---|---|---|
| Age-15 protagonist | Continues his own life, memory and relationships in the preserved world; no further involuntary migration | Recommend that he continues as a distinct person in the preserved world, without the involuntary link. Show only a resident-led coda until the owner confirms this interpretation | Explicit confirmation of younger fate on Rebirth required |
| Age-18 protagonist | Retain the reality and significance of his lived experience. M05 death remains fixed. Do not promise an active post-death body; any coda with playable age-18 actor requires an approved chronology/ontology | Original personal playable existence ends through the authored symbolic life-force transition; no old avatar in new life | Separation candidate in R39 says both retain existence; this is an unresolved tension, not a correction to canon |
| Original population | World remains distinct; verified local survivors continue their work; wider invasion unresolved | Same survivor-preserving candidate; no replacement or retroactive erasure | Owner must approve persistence of original inhabitants and exact survivor scope on both branches |
| Preserved population | World continues independently; local reconstruction does not end every conflict | Same; not a fictional or disposable world | Owner must approve both population outcomes |
| Moon protection / link | Forced convergence ends; recommend no renewed live migration; final seal behavior to be approved | Forced convergence ends; original link released as defined by approved contract | Exact dormant vs closed and cosmological mechanism pending |
| Third reality | Not accessed or unlocked | Distinct conditional life, no invasion history, emotional familiarity without conscious recall | Casting, scale and continued access pending |
| Account completion | Same completion receipt and branch record | Same completion receipt and branch record | No branch-exclusive progression advantage by default |

Recommendation is to keep every existing population's independent history meaningful. This avoids a player discovering after confirmation that an entire civilization was erased without warning. It is a proposed survivor-preserving interpretation, not an assertion that everyone survives or that all suffering ends. If the owner instead chooses another cosmology, replace the explicit consequence table before final selection is enabled.

## 3. Concrete epilogue direction

Separation: return the younger protagonist to M19's sanctuary checkpoint. At the damaged M15 road, workers rotate a direction sign toward a safe surveyed route and leave unrepaired timber visible; this shows practical progress without implying the war is over. At the original assembly point a worker fixes a bench beside the water station. Use the resident-led exchange from R54 by default. Do not caption an active older-avatar scene “after the separation” until chronology and continuation are explicitly approved; the existing R40 candidate includes that caption and must be held, not silently overwritten.

Rebirth: the new protagonist follows the public lower stream route or upper vista route to the sanctuary. A gardener, companion and visitors have independent activities; recognize the earlier ridge and arch through silhouettes, not copied wreckage, reused actor identities or an invasion memorial. The existing R54 relief dialogue remains unchanged. The companion's identity, casting and relationship remain provisional. Show a distinct survivor coda only under an approved population contract; it must not imply the new protagonist remembers or watches the old lives in-character. S55 and D50 need not be completed to access the public garden.

## 4. Postgame access matrix — proposed defaults

| Capability | Separation active save | Rebirth active save | Separate pre-finale archive / gallery |
|---|---|---|---|
| Preserved world | Continue as age 15 in supported current phases | No live access by default; younger fate and access are separate decisions | Pre-finale playable snapshot proposal; no changes to completed save |
| Original world | Authored coda only; any active opportunity individually approved | Coda/history only, subject to approved survivor contract | Only original opportunities present in that snapshot; no global realm selector |
| Third world | Locked | Public sanctuary/trail and only additional authored locations | Gallery can show already-earned approved epilogue; no reward or quest writes |
| Story-specific equipment/currency | Preserve existing younger inventory; no older duplicate grants | Fresh third-life inventory as authored; no import of old-life items, skills, currency or story keys | Snapshot inventory isolated; no transfer or rollback exploit |
| Previously earned account achievements/cosmetics | Retain account record | Retain account record; cosmetic display only when approved and lore-compatible | Read-only gallery; proposed isolated snapshot progression, no extra economic grants |
| Pending side quests | Continue when NPC, phase, route and evidence are available | Earlier quests cannot be completed via a third-world analogue | Resume supported pre-finale content separately, subject to approval |
| Paired discovery with both observations genuinely earned | Eligible local reward if current route and state support it | Record earned status; no automatic old-world delivery | Continue only actual observations and access permitted by snapshot |
| Paired discovery missing original observation | Pending/unavailable unless an authored opportunity exists | Preserve pending record; do not grant missing evidence | May earn only at actual authored scene; no gallery-generated flags |
| Ending replay | View committed coda; optional independent branch replay if approved | Same | Gallery does not modify ending; separate branch replay never overwrites original |

Default recommendation: retain a durable pre-choice checkpoint and offer a distinctly labeled playable copy to complete missed adventures. The completed campaign remains intact. Until reward-sharing semantics are approved, isolate all snapshot inventory, currencies and reward writes; do not enable repeatable account grants. If playable copies are not approved, retain read-only history and honest journal availability instead. Do not imply archive/replay is canonical migration.

## 5. M19 confirmation UX and state ownership

Proposed state transitions: CONVERGENCE_STOPPED → SAFE_REVIEW → CONSEQUENCES_READ → EXPLICIT_CONFIRM → COMMITTED → M20_READY → EPILOGUE_COMPLETE → POSTGAME_READY. Back returns to safe review; leave returns to safe checkpoint. Review/skip/cancel writes no outcome. Commit requires approved contract revisions for both routes, validated selected branch, explicit confirmation and durable save transaction. Retry with same receipt must not double-award, switch branches or modify survivor scope. In development, missing contract blocks final commitment and permits noncanonical preview only. Destination load failure preserves a safe source or committed recovery checkpoint.

Before confirmation, summarize for each route: who continues, what remains unknown, which avatar is playable, which worlds and quests are accessible, and what happens to current equipment. Show any missed opportunities from actual state, not a generic threat of lost progress. Do not say “finish every quest now.” The existing symbolic transition is cinematic, not a player-controlled lethal action. Use plain consequences, not guilt-inducing wording or superior-ending labels.

Suggested internal contract fields (schema proposal, not implemented): contractRevision, branchId, approvalStatus, youngerFate, olderFate, originalPopulationScope, preservedPopulationScope, thirdRealityAccess, localChronologyPolicy, sealPolicy, inventoryPolicy, accountPolicy, archivePolicy, codaVariant, safeCheckpointId. Outcome record immutable per completed campaign; account receipt idempotent. Server-authoritative rewards and existing guest entry/security policy unchanged.

## 6. Opportunity manifest and journal — required before shipping

Maintain one entry per actual original-world observation and any other phase-limited quest step: quest/discovery ID, step ID, reality, authored scene anchor, first/last available phase (surveyed or TBD), optional alternate encounter, evidence provenance, required access, reward owner, branch eligibility, archive behavior, status. Do not fill missing phase windows from presentation order. Journal states: available; waiting for authored opportunity; observed; complete; unavailable in current branch. Unavailable is not failed or completed. Distinguish historic record from current world marker.

Targeted examples: D50 keeps seed pouch and paired focus separate from S55 public garden restoration; M20 route remains independent. D39 retains older bow ownership and requires real lookout observation, not a replay screenshot. D46's missing original observation must remain pending unless authored access is approved. S39's original evidence uses genuine observations only. These examples are not a completed 50-discovery opportunity manifest.

## 7. Claude terrain and engineering acceptance

Reuse M19 sanctuary approach, assembly report table, near ring, safe bench and exit; remove active hazards before deliberation. Use existing M15 road and original shelter work alcove for Separation; branch-specific coda actor matrix. Rebirth reuses broad geographical anchors but independent materials, planting, history, actors and light. Public trail has safe routes around stream, no mandatory jump/glide, no hidden focus gate, no new portal, no simultaneous rendering of full realities. Provisional aliases use R54 naming; actual coordinates and dimensions remain surveyed/TBD. Provide collision before render reveal, camera clearance, local audio/captions, reduced-motion transitions, low-poly assets and active-reality-only streaming.

Planned tests (not run): both approved branches, no approval/invalid revision, skip all optional quests, pending paired observations, review and cancel, duplicate confirmation, reconnect before/during/after commit, scene load failure, unchanged survivor ledger, no postdeath active avatar without approval, third-life zero conscious memory, old inventory non-transfer, one completion receipt, archive isolation, gallery no writes, zero optional garden progression, low graphics, reduced motion, touch/controller/keyboard, measured WebGPU/fallback performance. Return surveyed transforms, actual state matrix, scene screenshots and measurements; never claim the tests passed merely from this spec.

## 8. Owner decisions — separate from authorization to draft

1. Confirm survivor-preserving populations for each route.
2. Confirm younger protagonist's independent continued existence on Rebirth, or provide alternate consequence.
3. Resolve older local chronology and whether Separation ever permits an active older avatar. Until then recommend resident-led coda and no resurrection claim.
4. Confirm third-life casting, extent of playable third world and access.
5. Confirm pre-finale snapshot, account cosmetic policy, and cross-save reward semantics.
6. Confirm exact seal/link behavior on each branch.

No ending is locked by R63. No manuscript rewrite, new quest IDs, game code, terrain construction, merge or deployment. Next R64: verify historical source paths and build phase-limited opportunity manifest from actual scripts; mark unestablished dates TBD. Finish document/footer and dialogue QA in subsequent passes.
