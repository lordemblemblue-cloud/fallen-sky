# Limited Blacksmith materials — isolated Dev Test region (not live)

Branch: `test/game3d-limited-blacksmith-materials-20261118` (based on unmerged `claude/blacksmith-v2-20261118`).

**Not merged, not deployed.** This is an opt-in preview fixture for testing
Blacksmith controls, not a public inventory grant, a live drop change, or a
server-side seed. Do not publish or merge without verifying isolation.

## How to claim in a test build

1. Check out this feature branch in a LOCAL development or explicit preview environment.
2. Select the **Dev Test** character with ID `__dev_test__`.
3. Open the Game 3D page with `?axe_test_region=1` in its URL.
4. Open Blacksmith; click **Claim Limited Test Materials** once.
5. Use the materials normally in Enchant, Over-Enchant, Sockets/Gems and Ultimate
   forge flows. Core Essence supports the Core tab.

The button only appears when ALL checks pass: non-live dev/preview host,
explicit `axe_test_region=1`, Dev Test character. A normal published
`.base44.app` host fails the region gate. Grants are per-character and
one-time (receipt in character-scoped storage); no automatic replenishment.

## Limited test batch

| Purpose | Existing inventory IDs | Qty |
|---|---|---|
| Enchant / reinforcement | `mat_reinforce` | 12 |
| Over-Enchant | `mat_over_enchant` | 6 |
| Protection | `mat_protection` | 6 |
| Socket opening | `mat_crystal` | 6 |
| Ultimate legacy | `mat_divine_essence` + `mat_heroic_core` | 5 each |
| Aura | `mat_aura_shard` | 3 |
| Other crafting | `mat_essence` + `mat_elite_temper` | 6 + 3 |
| Chosen legacy stage | `evo_upgrade_stone` | 4 |
| Gems | Ruby I, Sapphire I, Jade I, Spirit I, Critical I | 4, 2, 2, 2, 2 |
| Ultimate rune tags | Wrath I, Warding I, Precision I | 3, 3, 2 |
| Core enhancement | `AXECoreStore` Essence balance | +500 |

The pack is fewer than 100 inventory units. It requires that many free bag
slots rather than silently granting items into the vault. Missing known
definitions abort the grant. Items are flagged `testOnly` and bound; those
flags are **not a substitute for server-side test/live isolation**.

## Deliberate exclusions

- Rare / Elite / Legendary **Ascend** in Blacksmith v2 requires compatible
  **owned equipment donors**, not a material catalyst. Donor items are *not*
  granted, because the request was materials only.
- Combine also requires a compatible equipment donor; its fee is currently free.
- Gem fusion and Ultimate rune fusion consume Silver/Gold, which this batch
  does *not* grant.
- No live accounts, server inventory records, drop tables, or upgrade balance
  formulas are modified.

## Validation before test-only deployment

- `node --test tests/game3d-blacksmith-test-materials.test.mjs`
- Verify the button is absent on the published host, including with the query flag.
- Test with Dev Test character and the flag; confirm inventory + Core Essence
  appear once, change characters, reload and verify no cross-character leak.
- Attempt a protected Enchant, a socket, gem insertion, and an Ultimate rune
  operation; verify consumptions and receipt.
- Confirm server-rolled upgrades can read the test character's saved materials.
  If Character Vault sync blocks or changes ownership, do **not** bypass it;
  test only the local fallback until a truly isolated server is available.
