# Gear tiers, levels 1–155: plan, back end and Blacksmith Tier Up (2026-11-19)

Branch `claude/gear-tiers-20261119`, cut from `main` at `e9c62fc` (Blacksmith v2 is merged there).
**For the owner to review. Nothing changes in the game until the setting is switched on** (see
"Switching it on"); every number below is a labelled default in one data file,
`base44/shared/axeGearTiers.ts`, and can be changed without touching code elsewhere.

## The request, as read here

The owner (2026-11-19, voice-typed) asked to plan gear for levels 1–155 by band and rarity, generate
the back-end data for every equipment piece with placeholders for the model and icon, reuse one look
per band (only level and stats change inside it), and add a Blacksmith step-up such as 45 → 55.

- **Common / Unique**: random stats; looks for 1–30 and 31–55; a new drop every **5** levels (the owner
  allowed 3 or 5; 5 needs fewer templates).
- **Rare**: from **45** (the owner corrected 55 to 45), every 10 levels: 45, 55, 65 … to 155.
- **Elite**: from **85**, every 10 levels: 85, 95, 105 … to 155.
- **Legendary**: only from level-155 monsters, for heroes at 150–155.
- One look per rarity, band and item type; the Blacksmith **Tier Up** moves an item to its next step
  (45 → 55) and, past a band edge, to the next look. Combine, Enchant and Ascension keep working on
  every tier (Combine already needs the same item level, so items combine within a step).

## Questions for the owner (defaults in use until answered)

1. **Five tiers or six?** The code has `uncommon`, shown as "Unique". You listed Uncommon and Unique
   separately. Default: five tiers (Common, Unique, Rare, Elite, Legendary).
2. **What a tier-up costs**: Default: Upgrade Stones only (1 at the first step, +1 per step), always
   succeeds, and Combine / Enchant / Ascension / sockets / aura stay on the item. Alternatives: a donor
   item, Silver, odds below 100 %.
3. **Low-tier drop steps**: every 5 levels (default) or every 3?
4. **Existing items**: default: they keep their level, stats and model, and only note the step at or
   below their level; their first Tier Up moves them onto the next step (old Rare 50 → step 45 → Tier Up
   to 55; old Elite 110 → step 105 → 115; old Legendary 135 → below 155, Tier Up to 155).
5. **The hero level cap is 100** (`AXE_LEVEL_CAP`, `base44/shared/axePowerBudget.ts`, also the XP curve
   and the save rules). Gear above 100 (Rare/Elite 105+, Legendary 155) can drop from such monsters but
   cannot be equipped until the cap is raised to 155. Raising it is a separate balance change, not made
   here. (Today's Elite already starts at 110, so this was already true.)
6. **One 10-level grid from 45**: you mentioned Elite at "105 and then 120" and the bands 120–130,
   130–140, 140–150, 150–155. On one grid the steps there are 115, 125, 135, 145 and 155, so each of the
   top bands holds exactly one step and every Tier Up is +10. If you want literal 120 / 130 / 140 / 150
   steps instead, it is a data edit to the ladders.
7. **Legendary equip level**: default 150 for the Lv 155 Legendary (you said heroes at 150–155).
8. **Slots**: the 12 types that drop as combat gear today (sword, daggers, bow, fan, helm, chest,
   gloves, legs, boots, cape, ring, necklace). Wings, costume, vanity, trinket and auxiliary keep their
   own systems. Rings and necklaces keep today's rule that crit chance does not grow with level (only
   rarity); say if jewelry should scale.

## Ladders and looks

`I`, `II`… name a rarity's looks; every step in a row shares that look (one mesh, one icon) per item
type. "Tier-up cost" is the cost of moving from that step to the next.

| Rarity | Look band | Steps (item level) | Hero level to equip | Tier-up cost (Upgrade Stones) at each step |
|---|---|---|---|---|
| Common | I: 1–30 | 1, 5, 10, 15, 20, 25, 30 | 1, 5, 10, 15, 20, 25, 30 | 1, 2, 3, 4, 5, 6, 7 |
| Common | II: 31–55 | 35, 40, 45, 50, 55 | 35, 40, 45, 50, 55 | 8, 9, 10, 11, top |
| Unique | I: 1–30 | 1, 5, 10, 15, 20, 25, 30 | 1, 5, 10, 15, 20, 25, 30 | 1, 2, 3, 4, 5, 6, 7 |
| Unique | II: 31–55 | 35, 40, 45, 50, 55 | 35, 40, 45, 50, 55 | 8, 9, 10, 11, top |
| Rare | I: 45–84 | 45, 55, 65, 75 | 45, 55, 65, 75 | 1, 2, 3, 4 |
| Rare | II: 85–119 | 85, 95, 105, 115 | 85, 95, 105, 115 | 5, 6, 7, 8 |
| Rare | III: 120–130 | 125 | 125 | 9 |
| Rare | IV: 131–140 | 135 | 135 | 10 |
| Rare | V: 141–150 | 145 | 145 | 11 |
| Rare | VI: 151–155 | 155 | 155 | top |
| Elite | I: 85–119 | 85, 95, 105, 115 | 85, 95, 105, 115 | 1, 2, 3, 4 |
| Elite | II: 120–130 | 125 | 125 | 5 |
| Elite | III: 131–140 | 135 | 135 | 6 |
| Elite | IV: 141–150 | 145 | 145 | 7 |
| Elite | V: 151–155 | 155 | 155 | top |
| Legendary | I: 151–155 | 155 | 150 | top |

Totals: **540 item templates** (rarity × item type × step) on **192 looks** (rarity × band × item
type): 16 looks per item type instead of 45.

### The look-reuse map and placeholder art

Each look has an id `<rarity>_<bandMin>_<bandMax>_<type>` (e.g. `rare_45_84_sword`) and two placeholder
keys, `gear/<lookId>/model.glb` and `gear/<lookId>/icon.png`. Every template and dropped item carries
them (`lookId`, `modelKey`, `iconKey`, `placeholderArt: true`). When a real model or picture exists, one
entry in `AXE_GEAR_LOOK_ASSETS` (`src/components/game3d/axe/loot/AXEGearTierLoot.mjs`) —
`{ rare_45_84_sword: { modelUrl, iconUrl } }` — makes every new drop of that look use it; nothing else
changes. Until then items show the game's slot icons. `listAXEGearLooks()` lists all 192 looks with
their steps (the art to-do list).

## Stat rules

The existing loot curves, unchanged, applied per step:

- Flat stats = the type's base × rarity scale × level scale × (1 + quality / 100), where the level scale
  is 1 + 6 % per level above 1 and the rarity scale is Common 1, Unique 1.08, Rare 1.18, Elite 1.32,
  Legendary 1.52 (`AXE_LOOT_LEVEL_SCALE_PER_LEVEL`, `AXE_GEAR_RARITY_SCALE`).
- Rate stats (crit chance, crit defense, % bonuses) scale with rarity only.
- Base stats at level 1 come from the game's own items: swords, daggers and fans attack 6 (fan +2
  spirit), bows 5, the armor pack's slot stats, the starter ring and necklace.
- A drop also rolls a quality band (0–20 %) and the existing random affixes (Common 0, Unique 1, Rare 1,
  Elite 2, Legendary 3), so items of one step still differ ("different stats based on what drops").
- Combine, Enchant and Ascension add their shares of the item's original roll as in Blacksmith v2.

Base stats per step at quality 0 (a few item types; the rest follow the same rules):

| Item | Common 1 / 30 / 55 | Unique 1 / 30 / 55 | Rare 45 / 85 / 125 / 155 | Elite 85 / 125 / 155 | Legendary 155 |
|---|---|---|---|---|---|
| Sword (attack) | 6 / 16 / 25 | 6 / 18 / 27 | 26 / 43 / 60 / 72 | 48 / 67 / 81 | 93 |
| Bow (attack) | 5 / 14 / 21 | 5 / 15 / 23 | 21 / 36 / 50 / 60 | 40 / 56 / 68 | 78 |
| Chest (defense, max HP) | 4, 24 / 11, 66 / 17, 102 | 4, 26 / 12, 71 / 18, 110 | 17, 103 / 29, 171 / 40, 239 / 48, 290 | 32, 191 / 45, 267 / 54, 324 | 62, 374 |
| Ring (crit chance %) | 0.5 at every step | 0.54 | 0.59 | 0.66 | 0.76 |

## Drops

With the setting on, the ordinary gear drop (`rollAXEEquipmentDrop`, same drop chance per enemy tier)
picks a rarity from the monster level's weights, then the rarity's **step at or below the monster's
level** (a level-45 cave drops Lv 45 Rares; a level-54 monster too; level 55 drops Lv 55), one of the 12
item types, a quality band and the affixes. The armor-pack drop keeps its own pieces and models but uses
the same rarity availability and steps, and notes its step for Tier Up.

| Monster level | Common | Unique | Rare | Elite | Legendary |
|---|---:|---:|---:|---:|---:|
| 1–10 | 100 % | — | — | — | — |
| 11–20 | 80 % | 20 % | — | — | — |
| 21–30 | 60 % | 40 % | — | — | — |
| 31–44 | 48 % | 52 % | — | — | — |
| 45–55 | 25 % | 45 % | 30 % | — | — |
| 56–84 | — | — | 100 % | — | — |
| 85–114 | — | — | 76 % | 24 % | — |
| 115–134 | — | — | 50 % | 50 % | — |
| 135–154 | — | — | 30 % | 70 % | — |
| 155+ | — | — | 15 % | 60 % | 25 % |

Normal mobs; elite mobs and champions weigh each rarer grade ×1.22 and bosses ×1.6, as today. These
weights are new numbers (Common and Unique stop at 55, Rare starts at 45 and Elite at 85) and are for
review. Today's world has monsters up to level 75, so steps above that are future content.

## Blacksmith Tier Up

A new Blacksmith tab, **Tier Up**, shown only while the setting is on:

- Moves the item to its next step: base stats become that step's at the item's own quality; rolled
  affixes keep their roll and grow with the level (the loot's own curves); the item level and the level
  needed to equip it become the step's. Tier-system items take the next step's template and name and,
  past a band edge, its look. Items with their own model (armor-pack pieces, the weapon pack) keep
  their model, name and template.
- Same instance id, so **Combine, Enchant, Ascension, sockets and aura carry over**.
- The hero must have the level to equip the next step. The top step (Common/Unique 55, Rare/Elite/
  Legendary 155) is the end.
- Cost and odds: owner question 2 (default: Upgrade Stones, 1 + 1 per step, always succeeds).
- The panel shows the ladder, the step now and next, the hero level needed, whether the look changes,
  the cost and odds, and the item's stats now → after (`Attack 27 → 32 (+6.48 → +7.68) = 33.48 → 39.68`
  on a sword with Combine +2 and Enchant 20 %).

### Server authority

For a cloud character the server rolls and pays it like Combine and Ascension:
`base44/shared/itemUpgradeLedger.ts` adds the `tier_up` service, whose record is the item's own tier
fields (level, level to equip, base and rolled stats, and for tier-system items the template, name and
look). `itemUpgrade` checks the hero's level in its copy of the save, pays the Upgrade Stones from it,
is idempotent per transaction and keeps the record (`Game3DItemUpgrade`, enum gains `tier_up`). The
Character Vault puts a tier-up back when a save goes below it (a reloaded browser) or keeps its level
with other stats (an edited save), and leaves any other level change alone (Weapon Legacy also raises
item levels). Local guest characters use the same rules on the device.

**Deploy (owner), together:** entity `Game3DItemUpgrade` (`tier_up` in the enum), function `itemUpgrade`,
function `characterVault`. Until then a cloud character's Tier Up runs on the device (the client treats
an older server's "not rolled by the server" answer that way, as for Combine and Ascend before).

## Save migration

Non-destructive and repeatable (`migrateAXEGearTierItem`): with the setting on, every saved weapon,
armor or jewelry item of a laddered rarity keeps its level, stats, name and model and gains a
`gearTier` note (rarity, type, the step at or below its level, its band). Nothing is rewritten when the
note is already there; nothing happens with the setting off. Items outside the ladders (wings, Chosen,
Heroic, auxiliary …) are untouched.

## Switching it on

Highest first: on a developer machine `?gearTiers=1` (or `=0`) in the address, remembered in that
browser; the build flag `VITE_GAME3D_GEAR_TIERS=true`; `AXE_GEAR_TIER_CONFIG.enabled` (false). A live
site never reads the address. With it off, drops, item levels, the Blacksmith and the services are
exactly as on `main`.

## Files

- `base44/shared/axeGearTiers.ts` (new): item types, ladders, bands, config, templates, looks, drop
  weights and levels, tier info, tier-up preview, record read/apply, migration.
- `src/components/game3d/axe/loot/AXEGearTierFlag.mjs` (new), `AXEGearTierLoot.mjs` (new: the drop and
  `AXE_GEAR_LOOK_ASSETS`); `AXEEquipmentLootSystem.js`, `AXEArmorLootSystem.js` (switch behind the setting).
- `base44/shared/itemUpgradeLedger.ts`, `base44/functions/itemUpgrade/entry.ts`,
  `base44/entities/game3-d-item-upgrade.jsonc` (server tier-up).
- `src/components/game3d/axe/equipment/AXEEquipmentInventoryStore.js` (migration note, apply a tier
  record), `AXEEquipmentSystem.js` (`requiredLevel`), `AXEItemStatBreakdownList.jsx` (shows a changing
  original roll).
- `src/components/game3d/axe/services/`: `AXEBlacksmithImageWorkspace.jsx` (Tier Up tab),
  `AXEServiceTransactionGateway.js`, `AXEServiceWorkspaceModel.js`, `AXEServiceRegistry.js`,
  `AXEServiceEligibility.js`, `AXEServiceGroups.js`; `src/components/game3d/character/characterVault.js`.
- `tests/game3d-gear-tiers.test.mjs` (new).

## Tests and live check

- `node --test --test-reporter=spec tests/game3d-gear-tiers.test.mjs`: 12/12 pass (ladders and bands,
  540 templates / 192 looks with placeholder keys, stats per step, drop availability and levels, drop
  items, Tier Up 45 → 55 and 75 → 85 with the look change, refusals and costs, older items keeping
  their model, the migration, the ledger and Vault rules, `itemUpgrade` against an in-memory Base44
  stand-in, and the setting).
- Whole suite `node --test --test-reporter=tap tests/`: 1,172 tests / 87 failing, against `main`
  e9c62fc's 1,160 / 87: no new failures. ESLint (errors) clean on the changed files.
- Live (`npx vite dev`, `/gameview?gearTiers=1`, a guest character on this device): the real drop
  function gave Unique Lv 10 from a level-12 monster, Rare Lv 45 at 45 and 50, Rare Lv 55 at 62 (same
  look), Elite Lv 85 at 90 and Elite Lv 135 (look III) at 140; an armor-pack piece at 52 kept its
  Nightscale model at Lv 45. A picked-up Rare Sword I (Lv 45) with Enchant 20 % and Combine +2, on a hero
  raised to level 60 for the test, went through the Tier Up tab: "Success: Lv 45 → Lv 55. Combine,
  Enchant and Ascension were kept." (template `gear_rare_sword_lv55`, same look, attack 27 → 32, one
  Upgrade Stone spent); the next step (65) was blocked for the level-60 hero; the item stayed Lv 55
  after a reload. With `?gearTiers=0` the Tier Up tab was gone and drops were today's. No console errors
  from these modules. Not checked live: the server path (not deployed).

## Known limitations

- The hero level cap (100) stops gear above 100 from being equipped (question 5).
- Placeholder art only: no meshes or icons were made; the 192 looks are the art list.
- Monster levels above 75 do not exist in today's world, so Rare 85+, Elite and Legendary are reachable
  only once higher areas exist.
- The older drop tables (`AXE_GEAR_LEVEL_TIERS`, `AXE_FARMING_EQUIPMENT_TIERS`: Rare 50/80/120, Elite
  110–140, Legendary 135) stay in place for the setting-off game and for Ascension's farming rarities;
  remove them once the owner keeps the new ladders.
