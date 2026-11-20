# Blacksmith v2: Combine, Enchant and Ascend (2026-11-18)

Branch `claude/blacksmith-v2-20261118`, cut from `main` at `67f1d36`. It implements decisions 1–8
of the audit (`docs/game3d/BLACKSMITH_COMBAT_V2_AUDIT_20261118.md` on
`claude/blacksmith-combat-audit-20261118`), which the owner approved ("Yes, use them"), following the
owner's handoff (sections 1–4, 7, 8) and the v2 workbook (Combine v2, Ascension v2, Stat Rules v2,
V2 QA Checklist).

Not in this branch: decision 9 (skill damage curve: `claude/skill-damage-curve-…`), decisions 10–12
(basic-attack spacing, sword two-hand stance, dagger right-click: `claude/weapon-feel-…`).

**Nothing is deployed.** The Base44 functions and the entity change below must be deployed by the
owner (see "Deploy"). Until then, Combine and Ascend for cloud characters run on the device, exactly as
today.

## What changes for players

| | Before | Now |
|---|---|---|
| Enchant | "Reinforcement" 0–200 % in Services, capped by rarity (Rare 50 %, Elite 80 %, Legendary 120 %). A failure from 70 % lost 5 points, never below 40 %. | **Enchant 0–200 %** in the Blacksmith's Enchant tab, every rarity to 200 %. A failure loses **3 points, never below 0 %**, at every level, and never breaks the item. Server-rolled as before. |
| Enchant slots / Over-Enchant | Blacksmith Enchant tab | Unchanged, in the same tab ("Slots (4 × +10)") and the Over-Enchant tab. Both still add to the item and the enchant light. |
| Combine | Same template and rarity, any item level | Same **rarity, item level, slot and type** (weapon family; armor and jewelry by slot), any template. +2 % of the original roll per stage, **added**. Fee: free (config). Server-authoritative. |
| Ascend | Rare/Elite/Legendary "feeding": 1, 2, 3, 4 donors per rank, saved progress, higher-level donors skip ranks, always succeeds; bonus scaled by the Reinforcement at the time; Elite/Legendary extra %; set bonuses +25 %/rank; +4 weapon = 4 virtual skill levels | **One donor per attempt** (same rarity and type, item level equal or lower). Success **+1 100 %, +2 80 %, +3 65 %, +4 50 %**. A failure keeps the donor and the rank. Each rank adds original × (Rare 0.15 / Elite 0.75 / Legendary 1.0) × rank / 4 to the item's **own** stats. Set bonuses, skills and other items are untouched. Prestige names at +4 stay. Fee and catalyst: free (config). Server-authoritative. |
| Item stats | enhancement × advancement (compounding), each screen with its own partial math | **One per-item breakdown**, additive, used by combat, the Blacksmith, the equipment viewer, the inventory, compare and tooltips: `Attack 1,000 (+150)`, `Crit Chance 8.0% (+1.2 pp)`. |

## Config values (all in shared code, read by the game and the server)

**Enchant** — `base44/shared/axeItemEnhancement.ts`, `AXE_REINFORCEMENT_CONFIG`

| Key | Value | Notes |
|---|---|---|
| `stepPercent` | 5 | per success (unchanged) |
| `maxPercent` | 200 | every rarity |
| `rarityCaps` | `{ mythic: 120, mystical: 120 }` | Mythic is future-only in the handoff; its drops (Lv 180+ bosses) keep their existing 120 % until you decide |
| `failurePenaltyPercent` / `floorPercent` | 3 / 0 | replaces `downgradeStartsPercent` 70 and the 40 % floor |
| success chance | 100 % up to 40 %, then 96 % falling linearly to 28 % at the cap (unchanged formula; the curve now runs to 200 % for every rarity) | 50 %: 91.8 %, 90 %: 74.8 %, 120 %: 62 %, 150 %: 49.3 %, 195 %: 30.1 % |
| cost per attempt | `mat_reinforce` × (1 + ⌊% / 20⌋), + 1 Stabilizer when protected | unchanged (`axeServiceEconomy.ts`) |
| protected attempt | a Stabilizer keeps the current % on a failure | unchanged existing feature (see open questions) |
| stat share | Enchant % / 100 + 1 % per slot level + 2.5 % per Over-Enchant level, of the original roll | unchanged formula, now added instead of multiplied; the enchant light reads the same total |

**Combine** — `base44/shared/axeItemAdvancement.ts`, `AXE_COMBINE_CONFIG`

| Key | Value |
|---|---|
| `maxCombines` | 12 |
| donor | same rarity, `itemLevel`, slot and subtype (`masteryWeaponId` for weapons; a weapon without a family only matches its own template); never equipped, locked or favourite; never itself |
| success chance | 90 % at +0 falling linearly to 35 % at +12 (unchanged) |
| `statPerStage` | 0.02 (2 % of the original roll per stage, added) |
| `fee` | `{}` (free; any loot item id → count, charged on every attempt) |
| failure | stage and donor kept, fee only |

**Ascension** — `base44/shared/axeItemAdvancement.ts`, `AXE_EQUIPMENT_ASCENSION_CONFIG`

| Key | Value |
|---|---|
| `eligibleRarities` | rare, elite, legendary |
| `maxBonusByRarity` | rare 0.15, elite 0.75, legendary 1.0 (per rank: rare 3.75 / 7.5 / 11.25 / 15 %; elite 18.75 / 37.5 / 56.25 / 75 %; legendary 25 / 50 / 75 / 100 %) |
| `futureRarities.mythic` | maxBonus 1.5, `enabled: false` (placeholder only) |
| `successChanceByRank` | [1, 0.8, 0.65, 0.5] for +1..+4 |
| donor | same rarity, slot and subtype; donor `itemLevel` ≤ target; one per attempt; used up only on success |
| `fee` / `catalyst` / `catalystOnFailure` | `{}` / `{}` / false (free; the fee on every attempt, the catalyst on success) |
| `legacyStageRarities` | chosen: keeps its older Evolution-Stone stage (no donor, no item stats) because the Chosen set's ×2/×3 (left untouched, decision 6) counts Stage IV pieces |
| other rarities | Common, Uncommon/Unique, Heroic, Mythic and the rest: off |

**Stat model** — `src/components/game3d/axe/equipment/AXEItemStatBreakdown.mjs`

For each stat on the item: `original = baseStats + rolledStats`; `total = original + Combine + Enchant +
Ascend (+ Refine 2.5 %/level, Ultimate 4 %/level, Weapon Legacy on attack, the armor perk on defense)`,
every part a share of the original. Rate stats (crit chance/damage/defense, % bonuses) are percentage
points: Combine and Enchant leave them alone, Ascension grows them relatively, crit chance never passes
100 %. Soul infusion, gems, runes, auras and set bonuses are added by combat afterwards, as before.

## Before / after (original roll Attack 1,000, Crit Chance 8 %)

"Before" is `main`'s own rules and runtime formula; Ascension ranks are assumed imprinted at the item's
Enchant % at the time. Lower totals for fully upgraded items are the expected effect of additive stats
(decision 7); Ascension is far stronger for Elite and Legendary (the owner's numbers).

**Rare** (old Enchant cap 50 %)

| State | Attack before | Attack now | Crit before | Crit now |
|---|---:|---:|---:|---:|
| Clean (+0 / 0 % / +0) | 1,000 | 1,000 = **1,000** | 8.0 % | 8.0% |
| Enchant 50 % (old cap) | 1,500 | 1,000 (+500) = **1,500** | 8.0 % | 8.0% |
| Combine +12 | 1,240 | 1,000 (+240) = **1,240** | 8.0 % | 8.0% |
| Ascend +4 (0 % Enchant) | 1,183 | 1,000 (+150) = **1,150** | 8.37 % | 8.0% (+1.2 pp) |
| Combine +12, Enchant 50 %, Ascend +4 | 2,248 | 1,000 (+890) = **1,890** | 8.52 % | 8.0% (+1.2 pp) |
| Old max: Combine +12, Enchant 50 %, slots +40, Over +10, Ascend +4 | 3,222 | 1,000 (+1,540) = **2,540** | 8.52 % | 8.0% (+1.2 pp) |
| New max: Combine +12, Enchant 200 %, slots +40, Over +10, Ascend +4 | 3,222 (capped at 50 %) | 1,000 (+3,040) = **4,040** | 8.52 % | 8.0% (+1.2 pp) |

**Elite** (old Enchant cap 80 %)

| State | Attack before | Attack now | Crit before | Crit now |
|---|---:|---:|---:|---:|
| Clean | 1,000 | 1,000 = **1,000** | 8.0 % | 8.0% |
| Enchant 80 % (old cap) | 1,800 | 1,000 (+800) = **1,800** | 8.0 % | 8.0% |
| Combine +12 | 1,240 | 1,000 (+240) = **1,240** | 8.0 % | 8.0% |
| Ascend +4 (0 % Enchant) | 1,243 | 1,000 (+750) = **1,750** | 8.37 % | 8.0% (+6.0 pp) |
| Combine +12, Enchant 80 %, Ascend +4 | 2,887 | 1,000 (+1,790) = **2,790** | 8.61 % | 8.0% (+6.0 pp) |
| Old max: Combine +12, Enchant 80 %, slots +40, Over +10, Ascend +4 | 3,930 | 1,000 (+2,440) = **3,440** | 8.61 % | 8.0% (+6.0 pp) |
| New max: Combine +12, Enchant 200 %, slots +40, Over +10, Ascend +4 | 3,930 (capped at 80 %) | 1,000 (+3,640) = **4,640** | 8.61 % | 8.0% (+6.0 pp) |

**Legendary** (old Enchant cap 120 %)

| State | Attack before | Attack now | Crit before | Crit now |
|---|---:|---:|---:|---:|
| Clean | 1,000 | 1,000 = **1,000** | 8.0 % | 8.0% |
| Enchant 120 % (old cap) | 2,200 | 1,000 (+1,200) = **2,200** | 8.0 % | 8.0% |
| Combine +12 | 1,240 | 1,000 (+240) = **1,240** | 8.0 % | 8.0% |
| Ascend +4 (0 % Enchant) | 1,283 | 1,000 (+1,000) = **2,000** | 8.37 % | 8.0% (+8.0 pp) |
| Combine +12, Enchant 120 %, Ascend +4 | 3,751 | 1,000 (+2,440) = **3,440** | 8.73 % | 8.0% (+8.0 pp) |
| Old max: Combine +12, Enchant 120 %, slots +40, Over +10, Ascend +4 | 4,859 | 1,000 (+3,090) = **4,090** | 8.73 % | 8.0% (+8.0 pp) |
| New max: Combine +12, Enchant 200 %, slots +40, Over +10, Ascend +4 | 4,859 (capped at 120 %) | 1,000 (+3,890) = **4,890** | 8.73 % | 8.0% (+8.0 pp) |

Set bonuses no longer grow with Ascension: a complete set at +4 gives exactly its authored bonus (before:
up to ×2). Weapon skill perks no longer gain 4 virtual skill levels at +4 (before: +12 % skill damage).

## Server authority (decision 8)

- `base44/shared/itemUpgradeLedger.ts`: `combine` and `stage` (Ascension) join `SERVER_ROLLED_UPGRADES`
  with their records in `axe_item_advancement_v2`. `rollUpgrade` takes the donor from the server's copy
  of the save. A success records the donor on the target's row (`consumed`). `saveAsServerKnows` treats
  used-up donors as gone at once; `enforceUpgradeLedger` (Character Vault) removes them from every save
  it keeps and puts the server's Combine/Ascension records back; `ledgerRecordsFor` (restore) stops
  counting a donor as used up when the restored backup holds it again.
- `base44/functions/itemUpgrade/entry.ts`: accepts `donorId`; refuses a target or donor that a refine
  destroyed or an upgrade used up (`item_consumed`, `donor_unavailable`), a donor the server's save does
  not hold yet (`not_synced`), and a donor that breaks the rules (result `reason`, nothing written,
  nothing charged). Idempotent per transaction id as before (a repeated id returns the stored result,
  never a second roll or a second donor). The most an attempt can cost must be affordable before its
  result counts (Ascension's catalyst depends on success).
- `base44/functions/characterVault/entry.ts`: restore also writes the row's `consumed`.
- `base44/entities/game3-d-item-upgrade.jsonc`: `service` enum gains `combine` and `stage`; new
  `consumed` array.
- Game: `AXEServiceTransactionGateway.js` checks the donor rules and costs first
  (`checkDonorUpgrade`), sends the donor to the server for a cloud character, applies the server's record
  and removes the used-up donor locally; local-only characters (guest `__anon__`, `__default__`) keep the
  local path with the same shared rules. `characterVault.js` passes `donorId`; while the deployed
  `itemUpgrade` predates v2 (it answers "not rolled by the server"), Combine and Ascend stay on the device.

### Deploy (owner)

Deploy these together, entity first:

1. Entity `Game3DItemUpgrade` (`base44/entities/game3-d-item-upgrade.jsonc`): enum + `consumed`.
2. Function `itemUpgrade`.
3. Function `characterVault` (shares `itemUpgradeLedger.ts`).

If only `characterVault` were deployed, it would enforce Combine/Ascension records that the old
`itemUpgrade` cannot write, and a device-side Combine would be reverted on the next save.

## Files

Shared rules and server: `base44/shared/axeItemEnhancement.ts`, `axeItemAdvancement.ts`,
`axeServiceEconomy.ts`, `itemUpgradeLedger.ts`; `base44/functions/itemUpgrade/entry.ts`,
`base44/functions/characterVault/entry.ts`; `base44/entities/game3-d-item-upgrade.jsonc`.

Game: `axe/equipment/AXEItemStatBreakdown.mjs` (new), `AXEItemStatBreakdownList.jsx` + `.css` (new),
`AXEEquipmentRuntimeStats.js`, `AXEEquipmentDisplayStats.mjs`, `AXEItemAdvancementStore.js`,
`AXESetAscensionRules.mjs`, `AXESetBonusSystem.js`, `AXEFarmingItemPerks.mjs`,
`AXEAscensionFeedingRules.mjs` (deleted); `axe/combat/AXEStrikeRuntime.js` (perk call only);
`axe/services/AXEBlacksmithImageWorkspace.jsx`, `AXEBlacksmithWorkflowPanel.jsx`,
`AXEBlacksmithAutoForge.js`, `AXEServiceWorkspaceModel.js`, `AXEServiceTransactionGateway.js`,
`AXEServiceRegistry.js`, `AXEGlobalServicesMenu.jsx`, `AXEGlassLoadoutPane.jsx`;
`progression/hub/CharacterInventoryTab.jsx`; `character/characterVault.js` (all under
`src/components/game3d/`).

UI: the Blacksmith's Enchant tab opens on "Enchant % (0–200)" with "Slots (4 × +10)" beside it; the
Combine and Ascend tabs show the donor rules, odds, fee and the item's stats now and after a success;
every owned item's tooltip, the equipment viewer (with a compare against the item worn in that slot),
the Services panel and the inventory tab show the same breakdown. "Reinforcement" is labelled
"Enchant %" everywhere the player sees it (ids and save keys are unchanged).

Docs: `SET_ASCENSION_SPIRITUAL_AURA_CLONE_20261114.md` and `CLONE_EQUIPMENT_FARMING_ASCENSION_20261115.md`
are marked superseded.

## Tests

`node --test --test-reporter=spec tests/game3d-blacksmith-v2.test.mjs` — 21/21 pass. It covers the V2 QA
P0 rows: Combine (correct duplicate, wrong subtype, wrong level, +12 cap, failure at +5), Enchant (90 →
87 %, 2 → 0 %, every rarity to 200 %), Ascend (clean gear, Rare/Elite/Legendary +4 = +150/+750/+1,000 on
1,000, 500 defense → +75, 8 % → +1.2 pp, set untouched, +3 → +4 failure and success, Mythic off), the
additive breakdown, the Vault ledger, and the `itemUpgrade` function itself run against an in-memory
Base44 stand-in with scripted dice (success, repeated transaction, used-up donor refused as donor and as
target, failure keeps donor, mismatched donor writes nothing, +4 cap).

Updated because they pinned the replaced rules: `game3d-clone-equipment-farming-ascension` (feeding,
level skips, +4 skill levels → one donor, no skips, no extra levels), `game3d-clone-set-ascension-and-spiritual-aura`
(set scaling → none; caps → 200 %), `game3d-clone-crescent-moon-equipment` (Legendary cap 120 → 200 %;
runtime reads the breakdown), `game3d-clone-enhancement-stat-preview` (viewer source patterns).

Whole suite, `node --test --test-reporter=tap tests/`, compared by failing test name:

| | Tests | Failing |
|---|---:|---:|
| `main` 67f1d36 | 956 | 91 |
| this branch | 976 | 90 |

No new failures. One fixed: "world and combat wire the aura lifecycle and current advancement records"
(its stale pattern for the old imprint code is replaced). ESLint (errors) clean on the changed files.

## Live check (`npx vite dev`, `/gameview`, guest)

A new guest character (local-only, so Combine and Ascend used the device path; the server path is covered
by the stand-in tests above), with test gear added through the game's own `addAXEEquipmentItem`:

- Enchant tab opens on Enchant %: Rare sword 0 → 5 % ("Success: Enchant 0% → 5%."); at 90 % a forced
  failure gave "Failed: Enchant 90% → 87%. The item is intact.", 5 Reinforcement Stones charged, Combine
  and Ascension unchanged. A slot enchant still works and the light moved 87 → 88 %.
- Combine listed exactly the five Rare Lv 50 swords from other templates (not the Lv 40 or Lv 75 sword,
  not the bow), fee free; confirm prompt; a forced failure kept +0 and the donor; a success gave +1 and
  used the donor up.
- Ascend listed donors Lv ≤ 50 (incl. a Lv 40 sword), odds 100/80/65/50 %; a forced +1 → +2 failure kept
  the donor and the rank; +4 reached with one donor each; prestige name "Rare Elite Test Rare Sword A".
- The sword then read `Attack 1,000 (+1,040) = 2,040` (Combine +20, Enchant +870, Ascend +150) in the
  Blacksmith, its tooltip and the equipment viewer; equipping it raised the hero's flat damage by exactly
  2,040. A Rare ring at +1 read `Crit Chance 8.0% (+0.3 pp)`; the viewer compared it with the worn ring.
- Enchant %, Combine and Ascension records survived a page reload.
- No console errors from these modules (only the expected local Base44 406s and manor sources).

Not checked live: the legacy character hub (`CharacterInventoryTab`, `AXEGlobalServicesMenu`), which
this build does not open (bundle-checked only, same breakdown component); the server path (not deployed);
screenshots (the app window was behind others, so the pane did not draw).

## Open questions for the owner

1. **Mythic Enchant cap**: kept at its existing 120 % (`rarityCaps`); say if Mythic drops should reach 200 %.
2. **Stabilizer on Enchant**: a protected attempt still keeps the current % on a failure (existing
   feature). Keep, or remove so every failure costs 3 points?
3. **Armor perk**: armor's own-defense perk still adds its +3/+4/+5 % at Ascension +4 (not in the removal
   list). Keep or remove?
4. **Rarities without ascension**: items of Common/Unique/Heroic/Mythic… already ascended under the old
   path keep their rank but get no bonus (no approved values). Chosen keeps its stage path (×2/×3 rule).
5. **Fees**: Combine and Ascension fees are material costs (loot ids); a Silver fee needs a server-side
   Silver debit, not built while the fee is free.
6. **Balance**: Legendary +4 doubles an item's own stats, including chance stats (8 % → 16 %); additive
   stats lower fully upgraded items that used to compound (tables above). PvP duel stats come from the
   same derived stats, so they move the same way.
7. The paused private-server previews (`server/game3d/ascendStageRules.mjs`, `enchantRules.mjs`) are not
   live and still describe the old names; untouched.
