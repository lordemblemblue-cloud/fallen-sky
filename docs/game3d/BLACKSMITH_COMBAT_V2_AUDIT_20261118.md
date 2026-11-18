# Blacksmith + combat handoff v2: repository audit (2026-11-18)

**Status: audit only. No game code was changed.** This answers step 0 and the P0 "Repository audit"
row of the owner's handoff (`Fallen_Sky_Claude_Blacksmith_Combat_Handoff.md` and the v2 workbook).
Audited `main` at `67f1d36` (PRs #77–#80 merged, including the enchant light, #80).
Everything in sections 1–2 was read from code, not run in the game.

## 1. Where the systems live

| Need | Code | Fields / behaviour |
|---|---|---|
| Owned item instances | `src/components/game3d/axe/equipment/AXEEquipmentInventoryStore.js` | `instanceId`, `templateId`, `rarity`, `itemLevel`, `slot` / `category`, `baseStats` + `rolledStats` (never mutated by upgrades), `equipped`, `locked`, `favorited`, `setId`, `masteryWeaponId` (weapon family: `sword`, `dual_blades`, `bow`, `sky`). Saved per character in browser storage (`axe_equipment_inventory_v2`); the Character Vault syncs the save to the cloud. |
| Slots | `axe/equipment/AXEEquipmentSystem.js` (`AXE_EQUIPMENT_SLOT_DEFS`) | weapon (2), helm, chest, gloves, legs, boots, ring (2), necklace, cape, wings, costume, four vanity slots, accessory (3), trinket (2), auxiliary (4). |
| Rarity values | item `rarity` | `common`, `uncommon`, `unique`, `rare`, `rare_elite`, `elite`, `elite_set`, `legendary`, `heroic`, `mythic`, `mystical`, `chosen`, `ascendant`. Farmed tiers drop from monsters: Rare (Lv50+), Elite (Lv110+), Legendary (Lv135+). |
| Reinforcement / Enchant / Over-Enchant records | `src/components/game3d/equipment/enchantmentStore.jsx`, keyed by instance id | `reinforcement.percent` (0–200), `enchantments` = four slot levels (0–10 each), `overEnchant.level` (0–10) and `fractured` |
| Combine / Ascension / Refine / Ultimate records | `axe/equipment/AXEItemAdvancementStore.js` | `combine.count` (0–12), `stage.rank` (0–4; legacy 5), `stage.imprints`, `stage.feedProgress`, `refine.level`, `ultimate.level` |
| Rules shared by game and server | `base44/shared/axeItemEnhancement.ts`, `base44/shared/axeItemAdvancement.ts`, `base44/shared/axeServiceEconomy.ts` | odds, caps and costs (section 2) |
| Server-rolled upgrades | `base44/functions/itemUpgrade/entry.ts`, ledger entity `Game3DItemUpgrade`, `base44/shared/itemUpgradeLedger.ts` | The server rolls and charges **reinforcement, over-enchant, refine and ultimate**: idempotent per transaction id, 250 ms rate limit, cost taken from the server's copy of the save, results forced back into the save by the Character Vault. |
| Local upgrades | `axe/services/AXEServiceTransactionGateway.js` | **Combine, Ascension and slot Enchant** run in the browser: in-flight locks plus receipts in browser storage. Not server-authoritative. |
| Item stat math used by combat | `axe/equipment/AXEEquipmentRuntimeStats.js` (`getAXEEquipmentRuntimeBonuses`) | one aggregator for all equipped items (section 2.4) |
| Item stat previews | `axe/equipment/AXEEquipmentDisplayStats.mjs`; `getAXEBlacksmithReadout` in `axe/services/AXEBlacksmithImageWorkspace.jsx` | separate, partial projections: the loadout pane shows enhancement only (no Combine or Ascension); the Blacksmith computes its own attack preview |
| Set bonuses | `axe/equipment/AXESetBonusSystem.js`, `AXESetAscensionRules.mjs`, `AXEChosenSetRules.mjs` | a set bonus is multiplied by (1 + 25 % × the rank of the Nth-most-ascended matching piece); the Chosen set gives ×2, or ×3 with all six pieces at +4 |
| Blacksmith UI | `axe/services/AXEBlacksmithImageWorkspace.jsx` | tabs: Enchant, Over-Enchant, Combine Stage, Ascend, Sockets & Gems, Core, Ultimate. Reinforcement is in the Services menu (`AXEGlobalServicesMenu.jsx`) and the inventory tab, not in the Blacksmith. |
| Enchant light | `src/components/game3d/enchantVfx/` (#80) | driven by the total enhancement % = reinforcement + 1 per slot-enchant level + 2.5 per over-enchant level (owner confirmed this choice) |
| Skills | `skills/skillRegistry.jsx`, `skills/skillExecutor.jsx`, `skills/skillMasteryStore.jsx` | skill level comes from mastery XP (weapon skills max 10). Damage = `scaling.damage_pct` interpolated linearly from level 1 to `max_level`, times character Ascension, charge and skill-point bonuses. |
| Bow | `combat/ArcheryChargeRules.mjs`, `combat/BowCameraAim.mjs` | charge 0.7 s = 50 %, 1.2 s = 100 % (×2 damage), can be held forever; headshot ×2 in PvE (the ray must hit the upper 22 % of the body box) |
| Basic-attack spacing | `combat/CombatActionQueue.mjs` | 0.2 s divided by attack speed, never below 0.06 s |
| Attack animations | `weapons/weaponComboClips.js` (baked on each body's own rig), `player/LunaDashboardPlayerController.jsx` | sword combo (3 swings, contact at 0.27–0.37 s), bow combo (3 shots), sword skill tiers; daggers play the sword combo. `clip.userData.hit` is the contact event. |

## 2. Existing behaviour vs the handoff

### 2.1 Enchantment 0–200 %

There is no single stored "enchant %". Three separate systems exist:

- **Reinforcement**: +5 % per success, capped by rarity (Common 40, Unique 45, Rare 50, Elite 80,
  Legendary 120, Chosen 200). 100 % success up to 40 %, then falling to 28 %. A failure below 70 %
  changes nothing; from 70 % it drops 5 % (never below 40 %). Server-rolled. Each % adds 1 % item stats.
- **Enchant** (the Blacksmith tab): four slots × +10, always succeeds, +1 % item stats per level.
- **Over-Enchant**: +10 once all four slots are +10; 2.5 % item stats per level; from +4 a failure
  fractures the item (−1 level).

The handoff wants one Enchant from 0 to 200 % where a failure costs 3 points (floor 0) and nothing breaks.
Reinforcement is the closest match: it is already a 0–200 % value and is rolled by the server.

### 2.2 Combine +0..+12

| | Existing | Handoff |
|---|---|---|
| Cap | 12 | 12 |
| Donor | same template and same rarity, any item level | same rarity, item level, slot and subtype (not necessarily the same template) |
| Odds | 90 %, falling to 35 % at high stages | config, not invented |
| Failure | donor kept, stage kept | same |
| Fee | none | a fee on every attempt (price not given) |
| Stat gain | +2 % item stats per stage | +1 % of the original roll, only if no formula exists (one does) |

### 2.3 Ascension +0..+4

| | Existing (Rare / Elite / Legendary "feeding") | Handoff |
|---|---|---|
| Donors | 1, 2, 3, 4 donors per rank with progress saved (Legendary: 1 per rank); a donor 10+ levels higher skips ranks | 1 donor per attempt; same rarity and slot/subtype; donor level ≤ target |
| Odds | always succeeds | +1 100 %, +2 80 %, +3 65 %, +4 50 % |
| Failure | n/a | donor kept, fee only |
| Fee | none | fee and catalyst from config |
| Item bonus | 5.5 / 7.5 / 10 / 13.5 % per rank × (0.5 to 1.65, depending on reinforcement %), plus 1.5 %/rank Elite or 2.5 %/rank Legendary; rate stats get a quarter of that (max 16 %) | original stat × 15 % (Rare), 75 % (Elite), 100 % (Legendary) × rank / 4, on the item's own stats; chance stats relative (8 % → +1.2 pp) |
| Set bonus | matching set bonus +25 % per rank | untouched |
| Other | +4 weapon perks add four virtual skill levels; armor own-defense perk; prestige names at +4 (Rare Elite, Elite Legendary, Legendary Ascended) | not mentioned |
| Common / Unique | ascend with materials (older path) | disabled pending a decision |

### 2.4 Stat math

Existing: item stats × enhancement multiplier × advancement multiplier, so the two compound. Rate
stats (crit %, crit damage, % bonuses) are never scaled by upgrades, only by the small ascension rate
bonus. Set bonuses are scaled by ascension.

Handoff: base + combine bonus + enchant bonus + ascend bonus, each computed from the original roll with
no compounding, and shown the same way (`Attack 1,000 (+150)`) in the Blacksmith, inventory compare,
tooltips, viewer and combat, from one function.

### 2.5 Skills and bow

- Skill damage already grows linearly per level, for example Heavy Strike 1.30 → 1.80 (+38 %), Triple
  Slash 0.90 → 1.20 per hit, Double Shot 1.10 → 1.50, Barrage 0.80 → 1.10 per shot.
- There is no dagger skill type: daggers (`dual_blades`) use the Guardian skills (Twin Fang Combo, four
  hits; Crushing Blow).
- No three-arrow special exists (Double Shot fires 2, Barrage 5 shots 0.3 s apart), so per the handoff
  none is created.
- The handoff's curve `M = 1 + cap × (0.65 t + 0.35 t²)` has to **replace** the linear interpolation;
  applying it on top would scale skill level twice.
- The handoff assumes a 0.4 s basic-attack spacing; the code uses 0.2 s.

## 3. Decisions needed (recommendation first)

1. **What is "Enchant %"?** Recommended: Reinforcement becomes the Enchant 0–200 % and moves into the
   Blacksmith's Enchant tab; a failure costs 3 points (floor 0) at every level; still server-rolled. The
   four +10 slots and Over-Enchant stay as they are and keep feeding the light.
2. **Rarity caps on Enchant.** Today Rare stops at 50 %, Elite at 80 % and Legendary at 120 %, so a
   Rare item can never show the 59 % green light. Recommended: 200 % for every rarity.
3. **Combine donors and gain.** Recommended: the handoff's donor rule; keep the existing +2 % per stage,
   but added rather than compounded.
4. **Combine fee.** None today, and the handoff says not to invent prices: give a price, or keep it free.
5. **Ascension rules.** Recommended: the handoff's rules for Rare, Elite and Legendary. That removes
   multi-donor feeding, level skips, reinforcement-scaled imprints, the Elite/Legendary extra %, the
   set-bonus scaling and the +4 virtual skill levels. Prestige names at +4 stay (visual only). Items
   already ascended keep their rank; their bonus switches to the new formula. Common and Unique
   ascension is switched off. Ascension fee and catalyst: give values, or keep it free.
6. **Chosen set ×2 / ×3** depends on all six pieces reaching +4, which is ascension amplifying a set.
   No Chosen items exist yet. Recommended: leave it until Chosen gear exists.
7. **Additive stats.** Recommended: additive, as in the handoff. Items whose enhancement and
   advancement compounded will show lower totals. Ascension may scale chance stats relatively within the
   existing caps; Combine and Enchant keep leaving them alone.
8. **Server authority for Combine and Ascend.** Recommended: add `combine` and `ascend` to the
   `itemUpgrade` server function (same ledger, idempotent, donor removed from the server's copy of the
   save). This needs you to deploy the Base44 function; no new entity.
9. **Skill damage curve.** Recommended: a setting, off by default, that replaces the linear per-level
   growth with the curve and keeps each skill's level-1 value. Caps: sword 40 %, bow 35 %, daggers 30 %
   (the Guardian skills, when daggers are held).
10. **Basic-attack spacing.** Recommended: keep the existing 0.2 s.
11. **Sword two-hand stance** (your chat request: hold right-click, off hand on the hilt, stronger
    attacks and abilities). How much stronger? Recommended: +20 % damage on attacks and sword skills
    while held, walking 25 % slower, no guard while held.
12. **Dagger right-click** becomes the normal attack, so daggers lose the right-click guard. OK?

## 4. Weapons and animation (owner's chat request + handoff section 5)

Checked live on a local merge of #78 and #79, before #80 landed:

- The starter inventory has 10 weapons, and every one of them equips.
- Bug: switching weapons can leave old weapons in the hand (two Fantasy Swords stayed on the right hand
  with the Training Bow out). Not fixed yet.
- After a fresh reload, equipping showed no weapon at all. Cause not found yet.
- Painted Fan (family `sky`) has no model, so nothing appears in the hand.
- Idles: the plain idle for unarmed and melee, and an uploaded `idleArmed` for the bow. No sword or
  dagger idle.
- Holding right-click zooms (over-the-shoulder aim) with every weapon.
- Daggers play the sword combo: no dagger clips, no right-click attack.
- Riding hides the weapon except during attacks; there is no rein or weapon-out pose.

Plan: an idle each for unarmed, sword, daggers and bow; right-click zoom for the bow only; daggers:
left-click alternates a quick slash (0.33 s, hit at 0.12 s) and a cross-cut (0.37 s, hit at 0.15 s),
right-click stabs (0.43 s, hit at 0.18 s); sword swings retimed to 0.50 / 0.54 / 0.48 s with hits at
0.22 / 0.24 / 0.21 s; bow release 0.26 s with the arrow at 0.07 s, charge rules unchanged; sword
right-click hold = two-hand stance; weapon-out riding poses and seat fit on all three mounts. All clips
original, baked on the existing rigs, one hit event per strike.

## 5. Branch plan

1. `claude/weapon-feel-…`: weapon-switch bug, idles, right-click, dagger and sword clips and inputs,
   mounted poses. No Blacksmith or stat changes.
2. `claude/blacksmith-v2-…`: Combine / Enchant / Ascend rules, one per-item stat breakdown for every
   surface, server Combine / Ascend, tests from the handoff's P0 list.
3. `claude/skill-damage-curve-…`: the curve behind a setting, with a before/after damage table.

The enchant light is already on `main` (#80); after decision 1 it needs a check, not new code.
