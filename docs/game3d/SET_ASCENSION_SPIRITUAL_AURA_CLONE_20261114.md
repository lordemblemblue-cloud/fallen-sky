# Game 3D clone — rarity progression, set Ascension, and spiritual aura

**Scope:** `marcusflow1-arch/gitsync-pro` clone preview only. Main Game 3D remains unchanged.

## Separate progression systems

1. **Reinforcement, enchantment and over-enchantment** improve the individual weapon/armor's stats through existing item-specific Blacksmith records. The percent-based enhancement ceiling uses the item's actual rarity; it is not a set-bonus scalar.
2. **Equipment Ascension +1 through +4** comes from each item's saved, character-scoped `AXEItemAdvancementStore.stage.rank`. For ordinary sets, each successful Ascension increases the *existing unlocked set threshold* bonus by **25% of its original value**. It does not create new fixed values or inject +500 Chi into a particular set.
3. **Aura** is a visual sign of item/set Ascension. It never grants an additional hidden combat stat or require a model GLB.

### Set bonus calculation

Each activated set tier's bonus is scaled by `1 + minStageRank × 0.25`. `minStageRank` is the lowest Ascension rank among the required number of equipped pieces for that threshold, after sorting ranks high-to-low. Two-piece bonuses therefore require two upgraded pieces; four-piece bonuses require four. Unupgraded extra pieces do not lower an already earned two-piece tier bonus.

| Lowest rank among required matching pieces | Bonus multiplier |
| --- | ---: |
| 0 | 1× |
| +1 | 1.25× |
| +2 | 1.5× |
| +3 | 1.75× |
| +4 | 2× |

**Math illustration only, not an assigned game bonus:** If a future set originally provides +500 Chi, it progresses through +625/+750/+875/+1,000 at Ascension +1/+2/+3/+4. A base +20% aerial bonus would likewise become 25/30/35/40% *for that conditional PvE effect*. Existing combat caps and PvP exclusions still apply.

### Rare / Elite differentiation

- **Rare set:** normal enhancement raises the item itself, and item Ascension retains the existing flat-stat imprint for that long-kept equipment **plus** its growing set threshold bonuses. This rewards collecting, infusing, enchanting and keeping a sentimental Rare set.
- **Elite and higher sets:** normal enhancement still raises the item, but Ascension-stage power focuses on improved **matching set bonuses**, not a second stage-based item-stat imprint. An early Elite set may be weaker than a heavily upgraded Rare; Elite's higher base stats and higher enhancement ceiling are designed to let it pull ahead with investment. Exact cross-rarity balance / 15% advantage must be tuned against full monster combat and economy data, not assumed.
- **Non-set equipment:** the original item Ascension stat imprint remains available.
- **Chosen:** the best endgame six-piece set retains its distinct +100% full-core-stat bonus and +200% only after every piece is Ascension +4. These are **not** scaled again by the generic 25%-per-stage set logic.

### Percentage-based enhancement caps

The existing engine stores percent-based reinforcement separately from ten-level over-enchantment. Updated reinforcement ceilings: Common 40%, Unique 45%, Rare 50%, Elite 80%, Legendary/Mythical 120%, Chosen/Ascendant 200%. Actual over-enchantment has its own ten-level rules, which were **not** quietly replaced by percent progression. The owner can choose to unify or rename the two systems later.

Old items whose saved reinforcement is already above the newly lowered rarity cap remain owned; this change blocks further advancement, rather than altering or silently downgrading saved progress.

### Original, model-independent VFX

- Any owned and equipped weapon that reaches item Ascension +1 receives a lightweight silver/cyan **spiritual weapon aura**, following the animated hand socket. If the avatar rig lacks a usable hand socket, the effect is skipped rather than placed incorrectly or changing stats.
- A **full matching set** unlocks a soft, pulsing spiritual body aura when all authored slots are worn and Ascended at least +1. The lowest rank of those pieces controls aura strength.
- Implemented as six modest Three.js mesh effects total (three body, three weapon), with no model download, new material texture, light or spawned particles. Render lifecycle subscribes to live equipment/Blacksmith state and disposes when the world is left.
- This is an **original spiritual energy design**, not a copy of an existing anime transformation or asset. Final animation, user toggles, performance benchmarking and authored VFX remain for visual QA.

### Future item-sacrifice crafting (not yet enabled)

The idea to offer **another owned piece of equipment as an Ascension donor** is kept as a future forge design, with explicit preview, success chance, requirements and transaction confirmation before any irreversible consumption. This PR does not remove or sacrifice inventory items automatically. Rates and donor eligibility still require balancing and server-authoritative write handling.

## Checks

- `node --test tests/game3d-clone-set-ascension-and-spiritual-aura.test.mjs`
- Confirm separate **normal enhancement** raises item stats; Ascension increases an actual set's existing bonus only when enough matching pieces have ascended. Check Rare/Elite behavior and Chosen isolation.
- In clone browser: equip a weapon, Ascend it to +1, verify hand aura; collect matching six-piece set, Ascend all to +1, verify body aura; change item/reload and ensure visuals follow equipment and saved stages.
- **Not verified:** browser rendering, real full build, mobile frame rate, weapon socket availability on every rig, all possible pre-existing inventory saves and server-authoritative sacrificial crafting.
