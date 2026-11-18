# Enchantment light for armor and weapons (2026-11-18)

Implements the owner's handoff workbook *Fallen Sky Enchantment VFX* (spec v1.0, 2026-11-18).
**Visual only.** Enchant odds, costs, caps, upgrade and ascension math, rarity drops, item stats,
combat, hitboxes and animation rigs are unchanged. Nothing here writes gameplay state.

Code: `src/components/game3d/enchantVfx/`. Tests: `tests/game3d-enchant-vfx.test.mjs`.
Preview: `tools/game3d-enchant-vfx/preview/`.

## What players see

The **enchantment percentage** picks the stage (palette, brightness, motion). The largest
breakpoint at or below the percentage wins.

| % | Stage | Palette | Armor (inside the surface) | Weapon (inlay + tight aura) |
|---|---|---|---|---|
| 0–29 | Unenchanted | none | original material, untouched | none |
| 30 | Lit Glass | pale sky-white-blue | light trapped in the engraving, slow breathing | faint tight corona |
| 59 | Verdant Spark | green fiery-electric | green current along the etched channels, light flicker | green close outline |
| 90 | Golden Spark | yellow fiery-electric | yellow filaments, patterned pulse | short yellow corona |
| 120 | Azure Current | electric blue | blue current travelling through the inlay | blue aura, controlled sparks |
| 150 | Chosen Radiance | sky blue, white, icy silver | layered white-blue glass core | layered sky-white-blue sheath |
| 200 | Ascended Resonance | silver, crimson, blue | silver cores, separate crimson and blue channels (never blended to purple) | silver/crimson/blue aura |

Above 200 shows the 200 stage (there is no extra tier). Negative, corrupt or missing values show
nothing.

**Rarity** is an independent axis. It sets how much of the ornament carries light, the accents,
and the VFX budget:

| Rarity | Inlay share | Look | Weapon aura / sparks |
|---|---|---|---|
| Common | 4.5 % | a tiny highlight on existing lines | nearly invisible, no particles |
| Unique | 6 % | Common family, one clearer accent | very faint, no particles |
| Rare | 9 % | clean lines, thin cyan edge accent | tight halo, a few sparks from 120 % |
| Elite | 12 % | more paths, violet edge accent, pulsing nodes | two shells, sparks from 90 % |
| Legendary | 16 % | richest inlay, gold edge accent, faint glass layer | three shells, sparks from 59 % |

Brightness = stage intensity × rarity multiplier (0.35 / 0.45 / 0.65 / 0.82 / 1.00), clamped.
**Mythical is not implemented.** Items whose rarity is spelled `mythic` / `mystical` borrow the
Legendary budget, and no Mythical style exists anywhere.

The image that came with the workbook names the stages differently (Awakened Sheen, Energized
Inlay, Empowered Glow, Augmented Radiance, Chosen Radiance, Ascended Resonance). The code follows
the workbook (Lit Glass … Ascended Resonance). The labels live in one table in
`enchantVisualRules.mjs` if the owner prefers the image's names.

## Repository audit (P0): where the data comes from

| Need | Source | Field |
|---|---|---|
| Item instance | `axe/equipment/AXEEquipmentInventoryStore.js` | `item.instanceId` (never the template id) |
| Rarity | the item | `item.rarity`: `common`, `uncommon`, `unique`, `rare`, `rare_elite`, `elite`, `elite_set`, `legendary`, `heroic`, `mythic`, `mystical`, `chosen`, `ascendant` (mapped in `resolveEnchantRarity`) |
| Slot | the item | `item.slot` / `item.category`: `weapon`, `helm`, `chest`, `gloves`, `legs`, `boots`, `cape` (armor pipeline: `helmet`, `chest`, `gloves`, `pants`, `boots`, `cape`) |
| Equipped | the item | `item.equipped`; held weapon: `getActiveEquippedAXEWeapon()` |
| Enchant records | `equipment/enchantmentStore.jsx`, by instance id | `reinforcement.percent` (0–200), four enchant-slot levels (0–10 each), `overEnchant.level` (0–10) |
| Stat formula | `base44/shared/axeItemEnhancement.ts` | `getAXEEnhancementStatMultiplier` |
| Armor meshes | `onboarding/customizationRuntime.js` `AvatarCustomizationRuntime` | one fitted GLB per armor slot (`layers`) |
| Weapon meshes | `weapons/playerWeaponRuntime.js` (+ `playerWeaponSummon.js`, `weaponConstructFx.js`) | `getRoots()` |

Findings:
- **There is no single stored "enchant %".** The visual percentage is the item's total
  enhancement bonus, computed with the stat system's own formula:
  `(getAXEEnhancementStatMultiplier(...) - 1) × 100` = reinforcement % + 1 per enchant-slot level +
  2.5 per over-enchant level. So every Blacksmith upgrade that raises an item's stats also moves its
  light, including the visible Blacksmith tabs (Enchant, Over-Enchant), which never touch
  reinforcement. It is stored as `150`, not `1.5`. One function
  (`enchantPercentFromRecords`) holds this choice. To drive the light from reinforcement % only,
  change that function.
- **Max is 200:** `AXE_REINFORCEMENT_CONFIG.maxPercent = 200`. Rarity caps reinforcement at 40–120 %
  (200 % only for `chosen` / `ascendant`). Unchanged; with enchant + over-enchant a Legendary item
  can reach 185 % (Chosen Radiance).
- **Capes are enchantable**: armor-pack capes are ordinary equipment instances.
- **A helmet slot exists** (`helm` → `helmet`) and reuses the trim treatment (optional per spec). No
  slot was added.
- **Materials:** every fitted armor GLB has one `MeshStandardMaterial` with a base-colour map only
  (no emissive, normal or metal maps). They are double-sided, and capes are skinned with `Cape_*`
  spring chains.

## How it works

- `enchantVisualRules.mjs`: the one rule table: stages, palettes, rarities, slot rules, quality
  profiles; `resolveEnchantVisualStyle()` returns everything a renderer needs. Armor styles always
  have `externalAura: false`.
- `enchantMasks.mjs`: where light may live, computed once per piece (see *Masks*), plus trim and
  flow attributes in the bind pose, so the light never slides on skinned or cloth meshes.
- `enchantGlowMaterial.js`: the surface patch for `MeshStandardMaterial`. On the lit channel the
  painted colour gives way to the light (inlay), and an emissive term coloured and animated by the
  stage is added. One shader program per material layout; **every enchant change is a uniform
  write** (no recompiles). State lives in a `WeakMap`, never in `material.userData` (which
  `Material.copy()` JSON-clones).
- `armorEnchantGlow.js`: the armor renderer. `AvatarCustomizationRuntime.apply()` calls it, which
  covers the world avatar, the character viewers (`EquipmentPreview3D`, `AXESpiritualCharacterViewer`)
  and the roster-slot preview with one hook. Only appearances built from the inventory carry
  `game3d_armor_enchant` (`armorEquipBridge.useArmoredAppearance`, `SelectedCharacterArmorPreview`);
  the character creator never does. Pieces never enchanted are never patched.
- `weaponEnchantVfx.js`: the weapon renderer, updated in `GameWorld3D` right after the summon. It
  patches private clones of the held weapon's materials, adds tight fresnel shells that share the
  weapon geometry (no copies) and a few 6–12 mm sparks anchored to the blade or limbs. It hides the
  aura while the oil-metal forming effect owns the materials, and restores the originals and frees
  everything once the weapon leaves the hand.
- `enchantEquipment.mjs` / `enchantVisualState.js`: read-only adapters. Per worn piece
  `{ instanceId, pieceId, rarity, percent }` comes from the inventory + enchant stores, refreshed
  on equip changes, every upgrade and character switches. Another roster character's records are
  read from storage.
- `EnchantLightPreview.jsx`: the Blacksmith / Services / inventory card. It shows the current stage,
  the stage a successful attempt would light (from the game's own rules: the next reinforcement
  step, +1 enchant level or +1 over-enchant level) and a swatch from the same palette.

### Lifecycle and performance
- Equip / enchant change: only the pieces whose item, stage, rarity or percentage changed are
  touched. Unequip: the layer and its materials are disposed by the avatar runtime, and the ornament
  mask texture goes with its material (`dispose` listener). Weapons: clones, shells and sparks are
  freed when the weapon leaves the hand (no ghost aura).
- Measured in the preview: shader programs 10 → 16 on the first enchant (one per piece layout),
  then **unchanged** across all 7 stages × 5 rarities.
- Masks: about 512² per piece, computed once per decoded image, O(pixels).
- Mobile profile (coarse pointer + narrow screen): half the sparks, one aura shell, no glass layer.
  QA can force it with `game3dEnchantVfx.setQuality('mobile')`.
- No full-screen bloom is used. The light reads under the game's ACES tone mapping at exposure 1.1.

## Masks (artist handoff)

Each piece's light lives in a mask. In order of preference:
1. **Authored:** a greyscale mask in the piece's **emissive texture** (glTF `emissiveTexture`,
   UV0, the same layout as the base colour, separate from it). Keep `emissiveFactor` black so
   nothing glows unenchanted. Brightness is used as is: a texel lights when its value ≥
   1 − share(rarity), so grey levels are a rarity knob:
   white = every rarity · ≈0.93 = Rare and up · ≈0.89 = Elite and up · ≈0.85 = Legendary only · black = never.
2. **Derived (default today):** from the base colour: luminance edges (weighted by how much they
   stand out from their surroundings, so busy patterns don't light up wholesale) plus gold/brass and
   bright silver tones, rank-normalised over the piece's own texels. The black atlas padding never
   counts or lights, and island borders never read as engraving. The strongest *share* of the
   surface carries light, so a piece never lights as a whole.
3. **Mesh trim (fallback):** open borders (hems, cuffs, collars, plate edges). Creases count on
   low-poly pieces only; dense generated meshes are "sharp" almost everywhere.

Flow (where the light starts, computed in the bind pose: +Y up, +Z front): chest from the sternum
outwards · gloves from the wrist to the fingertips · pants, boots, cape and helmet top down ·
weapons from the grip to the tip (bows: both limbs). The light reaches further with each stage.

Knobs, all in `enchantVisualRules.mjs` / `enchantGlowMaterial.js`: stage palettes; per-rarity
`coverage`, `sharpness`, `accent`, `nodes`, `glass`; slot `emphasis`; `ARMOR_ENCHANT_EXPOSURE`,
`WEAPON_ENCHANT_EXPOSURE`, `WEAPON_AURA_WIDTHS`; inlay strength in `setEnchantGlowStyle`.

## QA checklist

| QA | Result | Evidence |
|---|---|---|
| 01 below 30 % | pass | tests (untouched material, no gain), harness 0 % column |
| 02–07 thresholds 30/59/90/120/150/200 | pass | tests (29/30, 58/59, 89/90, 119/120, 149/150, 199/200), stage sheets |
| 08 201 % / negatives | pass | tests (clamp to 200 / 0, no extra tier) |
| 09 five rarities at the same % | pass | tests (monotonic share, gain, layers), rarity sheets (Crescent Moon 120 %, Nightscale 150 %) |
| 10 Mythical | pass | tests (no Mythical style; mythic → Legendary budget) |
| 11 mixed pieces | pass | tests; harness "mixed" sheet; live page with the real stores (chest 150, gloves 30, cape 90, pants 120, boots 59, helmet 0) |
| 12 armor invariant | pass | tests (no objects added to armor, `externalAura: false` for every stage × rarity) |
| 13 weapon invariant | pass | tests; sword and bow sheets (inlay + shells + sparks) |
| 14 legacy models without masks | pass | trim fallback + tests (flat texture lights nothing; no texture → trim only) |
| 15 rapid equip/unequip | pass | tests (40 cycles: originals back, no shells or sparks left); live page (12 chest cycles) |
| 16 Blacksmith before/after | pass | live page: real `reinforceItem` 30 → 35 %; card and 3D updated at once; card shows Now/After |
| 17 sprint/jump/attack | pass (posed) | harness posed sheet (arm raise, knee bend, spine twist); bind-pose attributes cannot slide |
| 18 cape movement | pass (posed) | posed sheet (cape chains swung, border light bends with the cloth, readable from behind) |
| 19 surfaces consistent | pass in previews | one rule table feeds every surface; signed-in GameView not run |
| 20 day/night, bloom | not run | no bloom pipeline exists; ACES 1.1 only |
| 21 many players + mobile | partial | one program, uniform-only updates, allocation-free weapon loop, mobile profile; not profiled with crowds |
| 22 no gameplay change | pass | tests (no store writes or setters in `enchantVfx/`); full suite: no new failures |
| 23 reload | pass | tests (records read back from storage); live page reload restores each piece's light |

## Known limitations and follow-ups
- **Other players** show no enchant light: the world sync does not carry per-piece enchant data.
- The **mounted** weapon presenter and the Training Bow test presenter are not decorated; the
  in-hand pack weapons are.
- The in-world anvil "inspection" object is a primitive placeholder that nothing shows today, so
  the Blacksmith preview is the 2D card.
- The signed-in Base44 GameView was not run (sign-in needed). The checks used the real runtime,
  assets and stores in `tools/game3d-enchant-vfx/preview`.
- The Ascension set aura (`AXEAscendedGearVisualRuntime`, a separate system) still draws its own
  body ring; the "no armor aura" rule here covers the enchant light only.

## Preview harness
`node node_modules/vite/bin/vite.js --config tools/game3d-enchant-vfx/preview/vite.config.mjs` → http://localhost:5196
- `/?set=crescent_moon|nightscale|frostwarden&auto=1`: stage, rarity, mixed, motion, posed and
  weapon sheets plus the program-count check (PNG sheets in `preview/shots/`, git-ignored).
- `/live.html`: the real inventory and enchant stores, the roster-slot armor viewer and the
  Blacksmith card (`window.liveQA.equipAll()`, `.setPercent('chest', 150)`, `.reinforce('gloves')`).
