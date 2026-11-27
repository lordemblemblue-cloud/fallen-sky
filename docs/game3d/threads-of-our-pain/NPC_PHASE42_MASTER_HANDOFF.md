# Fallen Sky — Phase 42 master NPC implementation handoff

27 November 2026 | **Documentation-only proposal** | Phases 01–41 of the NPC design conversation consolidated as a separate overlay, not a new numbered story revision. Do not activate quests, deploy, migrate live saves or spend generation credits from this brief. Read the current story index at implementation time: concurrent story, WebGPU and Duelist work may advance it.

## Source precedence and read order

1. Root [AGENTS.md](../../../AGENTS.md) and [current story index](README.md); read [Claude terrain handoff](CLAUDE_TERRAIN_HANDOFF.md) and [stable 125-ID index](R61_STABLE_ID_INDEX.md).
2. [R62 actor audit](R62_CHARACTER_QUEST_AUDIT.md), [R64A owner ending direction](R64A_OWNER_ENDING_RECONCILIATION.md), [R65 finale](R65_M19-M20_REVISED_FINALE.md), [R66 quest reconciliation](R66_QUEST_CONTINUITY_RECONCILIATION.md), R67/R68 phase registers and R69–R74 scheduling reviews.
3. [R75 primary decisions](R75_POSTGAME_PROGRESSION_DECISIONS.md) and [R75A supplement](R75A_POSTGAME_PROGRESSION_ADDENDUM.md): recommendations, not approvals. R64A/R65 supersede independent-world separation and mandatory amnesia; R66 supersedes conflicting short discovery/quest summaries.
4. [Proposed NPC coordination registry](NPC_PHASE42_REGISTRY.json). Existing expanded scenes, local actors and quest IDs win over this overlay. No new canonical IDs.

Verified repository structure: TanStack Start, React 19, JavaScript/JSX, Base44. No TypeScript source additions. Guest-only public entry at / and /gameview remains; do not re-add account pages or redirects. Never bypass restricted endpoint authorization. Preserve Base44-managed server/error capture and generated route tree.

## Scope and status

30 proposed principal NPCs; M01–M20, S01–S55, D01–D50 = 125 established narrative entries. The current source index reports 105/105 optional source-level opportunity reviews; this is not runtime coverage. The companion JSON has exactly 30 proposed IDs and each of the 55 side IDs mapped once to a coordinator. Discovery and main IDs are listed for navigation, not expanded scripts. Do not substitute the registry for source scripts. Personal quests (prefixes KAE, ERY, LUN, HNT, LYR, GRD, TOM, HEN, LIV, SAB, COR, MIN, DIV, SHR, BND, GRN, AST, MED, LUM, INN, FRG, MTG, CMD, HSP, MUS, RIV, CTK, PIL, FRX; Aldren prefix unresolved) remain disabled. Full individual personal scripts, canonical actor-ID reconciliation, reward stats and availability still need review. No invented total for new quests.

| Phase | Design output | Implementation gate |
|---|---|---|
| 31 | Relationship network | Authored edges, reality/knowledge and reconciliation flags |
| 32 | Quest ownership | Canonical actor and expanded script reconciliation |
| 33 | Introductions | Alternative first meetings; no repeated intro |
| 34 | Schedules | Location anchors, phase windows and event priority |
| 35 | Dialogue | Speaker knowledge, evidence, choice and repeat rules |
| 36 | Progression | XP/gear baseline and role parity, no forced optional grind |
| 37 | Enemies | Encounter-specific AI/telegraphs, posture and recovery |
| 38 | Economy | Transaction safety, rarity/upgrade math and reward provenance |
| 39 | Terrain | Surveyed collision, entrances/exits, actual local anchors |
| 40 | Backend | Schema/access-control review, atomic persistence and migrations |
| 41 | Cinematics | Voice/animation/audio manifests, skip recovery and accessibility |
| 42 | Master package | Draft review, dependency validation, implementation PRs |

## Character coordination

All names beyond established source names are proposed. Coordination means a thematic or professional connection, not permission to replace quest givers. Preserve distinct source actors, e.g. Mira/Renn/Tovin versus Mara/Luma, and original-world medics/smiths versus preserved characters. Resolve Neris presentation against source diver before model assignment.

| Proposed ID | NPC | Side coordination | Main associations |
|---|---|---|---|
| FS_NPC_001 | Aldren | S01, S30 | M01 |
| FS_NPC_002 | Kael | S02 | M06 |
| FS_NPC_003 | Eryndor | S03, S20 | M07, M08 |
| FS_NPC_004 | Moon Goddess | S45, S54 | M02, M03, M05, M06, M17, M18, M19 |
| FS_NPC_005 | Thoren Ashwood | S07 | M03 |
| FS_NPC_006 | Lyra the Seeker | S04, S25 | M06, M07, M08, M13 |
| FS_NPC_007 | Garran Stoneward | S05, S24 | M06, M15 |
| FS_NPC_008 | Tome | S26 | M14, M15, M16 |
| FS_NPC_009 | Henut | S27, S31 | M14, M15, M16 |
| FS_NPC_010 | Livilla | S28 | M14, M15, M16 |
| FS_NPC_011 | Sable Vey | S06, S29, S37 | M14, M15, M16 |
| FS_NPC_012 | Elias Windrow | S08, S35 | M08, M16 |
| FS_NPC_013 | Doran Ironroot | S09, S10 | M07, M13 |
| FS_NPC_014 | Neris Tideborne | S11, S44 | M09, M17 |
| FS_NPC_015 | Selene Ashveil | S12, S46 | M09, M10 |
| FS_NPC_016 | Orin Vellwood | S13, S41 | M08 |
| FS_NPC_017 | Elowen Greenveil | S14, S55 | M12, M20 |
| FS_NPC_018 | Veyron Starwatch | S15, S23 | M13, M17 |
| FS_NPC_019 | Amara Dawnveil | S16, S33, S48 | M11, M18 |
| FS_NPC_020 | Luma Everlight | S17, S18 | M11, M12 |
| FS_NPC_021 | Mara Hearthwood | S19, S52 | M15, M16 |
| FS_NPC_022 | Garrick Ironheart | S21, S32 | M13, M14, M15, M16 |
| FS_NPC_023 | Aster Windcrest | S22, S43, S50 | M13, M17 |
| FS_NPC_024 | Cassian Valeward | S34 | M15 |
| FS_NPC_025 | Master Hesper | S38 | M14, M15, M16 |
| FS_NPC_026 | Seren Silverchord | S39 | M12, M16 |
| FS_NPC_027 | Riven Ashborne | S36, S40 | M16, M17 |
| FS_NPC_028 | Talia Ashwillow | S42, S53 | M04, M05, M11 |
| FS_NPC_029 | Elaris Dawnseeker | S47, S49 | M18 |
| FS_NPC_030 | Unnamed Goddess | S51 | M09, M10, M14, M15, M16, M17, M18, M19 |

S38 is controlled by the independent clerk and investigators; Hesper is the subject, not proof of guilt. S51 is issued by the local guide, never hostile goddess. S20 spirit distinct from Eryndor unless approved otherwise. S05 three independent traveler rescues; M14 fallback reports. No physical cross-reality appearances or automatic knowledge propagation. M20 links are not survival guarantees.

## Ordered implementation packages (separate feature PRs)

A. **Inventory existing implementation** (read-only): locate actual Game 3D components, data loaders, persistence schema, backend entity permissions, current tests and assets; map real actor/quest IDs and flag aliases. Do not assume illustrative fields exist. Return gap matrix and baseline tests.
B. **Data-only registries and validation**: canonical quest IDs, source anchors, NPC references and disabled proposal registry; reject missing references, duplicates and mandatory paths through optional quests. JavaScript validators/tests. No gameplay toggle.
C. **Persistence/security foundation**: keep guest local saves versioned; do not trust display names or local data for privileged rewards. Review restricted endpoints, validators and ownership, no anonymous service-role, no secrets in browser. Atomic receipts require actual storage capabilities; do not claim atomicity across independent writes. Design recoverable transaction protocol if no native transaction. No destructive migration.
D. **Vertical slice M01–M06**: forest, lunar clearing, original city/road, Wolfveil return; merchant warning, goddess seal, beast fight, three role training, authored M05 event, Lyra introduction; S01–S08 and D02–D06 optional only at approved windows. No paired-focus mechanic before its unlock. Terrain agent owns surveyed geometry; do not revive deleted maps.
E. **NPC living world**: one shared schedule/relationship/dialogue service, occupation animations, resident anchors, regional travel records and event overrides; must not block core services or duplicate actors. Two-hour day cycle and population budgets are candidates, not requirements. Keep terrain collision independent of NPC culling.
F. **Discovery and middle campaign**: M07–M13, S09–S25, D07–D20 and D01 when eligible. Each discovery needs both first observations, unique relic entitlement, second perspective alignment, safe exit/retry. Preserve R66 legacy completion and recollection annotations; never fabricate old receipts. S43 reads D01 evidence and never re-awards its sword. M10 escape is older knowledge/intervention, not paired focus.
G. **Three empires**: M14–M16, S26–S41, D21–D27 at actual phases. S29 counts two distinct verified sources; R66 proposes S27 receipt before repair completion. Do not use a blanket completed-quest gate. S39 exchange versus original-song lore per approved lane policy; no forced faction choice or war resolution from optional quests.
H. **Convergence**: M17–M19, S42–S55, D28–D50 at actual windows. Resolve S53/S55 lane policies, actor lifetimes and unavailable encounters. R66 second-view and safe-lease rules. Both lives contribute; no timer in final deliberation; no forced sacrifice. Ending commitment blocked until save/equipment policies approved.
I. **Combat, progression and economy calibration**: level cap 155 and proposed chapter level bands; main route viable without side grinding. Three weapon roles Damage/Range/Defense, narrow melee cleave, bow charge 0–1.2s, headshot x2, 0.4s base delay, move while aiming; 3 stagger hits then 1s immunity; verify current implementation before changes. Rare 50/80, Elite 120/130/140, Legendary 155; rarity bonuses +25/+30/+45/+100 (Chosen eligibility unresolved). Upgrade base stats; Ascend set bonus only +25% original per stage; Combine max12, fail loses gold only, no destruction; enchant -3% layer unresolved. No auto-equip. Armor full/optimized/hidden rendering must not change stats. All drop rates, XP formula, difficulty settings and new NPC item stats need calibration. No Chosen activation without approval.
J. **Cinematics/audio and postgame**: preserve M11/M12 distinct families and shared melody; separate S39 music. M19/M20 use R65: sacrifice restores age-eighteen existence with former age-fifteen lives ancient history; refusal fuses preserved land with original destruction, replaces death timeline, continued play, roughly 20-year coda not automatically playable time jump. R75/R75A recommend equal earned progression, legitimate item provenance (never resurrect sold/consumed items), isolated replay, limited restored exploration and immediate fused recovery; all pending confirmation. No new portal, mandatory amnesia, independent younger avatar or guaranteed resurrection.
K. **Integration QA**: build/lint and project-specific tests, real desktop Edge and mobile WebGPU/fallback profiles, preview and live verification only after authorization. Each PR has narrowly scoped file ownership, current-main rebase/checks, reviewed diff, rollback plan and no unrelated changes.

## Acceptance matrix

- Registry: exactly 30 draft proposed IDs; all 125 existing IDs reachable in source; all 55 S IDs assigned once in coordination overlay; no personal expansion enabled.
- Quest: M01–M20 possible with zero optional content; optional observation windows audited against actual runtime; original receipts not fabricated; D01/D25/D45 second vistas required for narrative completion, unique claim separate; S29 any two distinct eligible sources, no repeated receipt; no forced focus in M10.
- Identity: independent NPC/knowledge/lifetime records, no unsupported Hesper verdict, no premature deity name, no unearned relationship or reward. Services available via approved alternate access.
- Rendering: stable collision/landing/return before reveal; no aggressive close-range terrain unloading, no invisible lethal hazards; pooled/LOD actors; measure frame time, memory and loading on named hardware. Compare WebGPU/fallback gameplay parity.
- Security: attempt cross-save access, invalid input, concurrent reward/upgrade requests, interruption, duplicate claims, practice-state leakage, unauthorized migration; inspect actual Base44 scan and endpoint permissions. Never claim a pass without evidence.
- Finale: no choice from skip/back; committed branch durable across failed load/reconnect; no duplicated entitlement, no automatic historical completion, no invented survivor fates. R75A policy remains proposed. Verify both paths only after approval.

## Claude return format

For each region or feature: source revision and stable IDs; actual files/PR; actor lifetime and local phase; anchor transforms and route topology; collision/navmesh and accessibility results; objective/receipt evidence; real performance measurements and unresolved constraints. Use shared low-poly kits, active reality only, bounded overlap proxies, stable terrain, material reuse; 22-region/18-batch concept is provisional, not surveyed coordinates. Keep old caves/dungeons unloaded/deleted unless explicitly authorized. Do not create broad parallel implementations.

## Outstanding decisions

Owner review: new character names and existing actor mapping; complete personal quest scripts and exact stat rewards; precise original visit windows and compatibility with prior saves; S53 and S55 lane policies; R75/R75A level/equipment/wallet reconciliation, sold/consumed item provenance, isolated replay, restored exploration and fusion checkpoint; exact enchant penalty layer, Chosen tier, difficulty/XP/drop-rate tuning. Engineering: inspect runtime schema and security scan; terrain surveys; asset production; real gameplay tests. No code, terrain, migration or live deployment is performed by this documentation.
