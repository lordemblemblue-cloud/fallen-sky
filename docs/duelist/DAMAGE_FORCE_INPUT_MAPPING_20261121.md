# Duelist 2: incoming damage, Battle Shop, and target-lock controls (2026-11-21)

## Confirmed owner requirements
1. Taking damage must **never reduce Force**. The game currently calls its Force resource **Will**.
2. **Tab** opens and closes the in-match Battle Shop.
3. Clicking the **middle mouse button** locks automatically onto the nearest available hostile; clicking it again unlocks.

## New combat rule
- The authoritative shared rules in `core/damage.mjs` now process hit damage through invulnerability, parry/guard (stamina for blocks), shield/armor, and **HP**. No incoming attack spends the victim's Will; this includes empowered attacks and powers that inflict direct damage. A Veil Breach bypasses ordinary shield/armor, not the player's Will resource.
- **Will remains a resource for the attacker's active abilities and channels** (Telekinesis, breach, resisting grips, and similar actions). This request does not make casting free.
- The existing Veil visual state still reflects Will previously spent by abilities, including collapse when an ability exhausts it. Ordinary hits cannot cause that collapse. Legacy damage-to-Will balancing constants are retained as no-op compatibility fields while downstream HUD and gameplay references are updated.
- Three-hit stagger immunity, guard/parry and the free attack/sprint rules are preserved. The server and browser both import the same damage rules; no network protocol change is needed because resource state fields are unchanged.

## Input and UI rule
- `bindings.mjs`: `shop: 'Tab'`; `lock: 'Mouse1'`. Battle Shop is a separate client-only binding, not an unauthorized network combat command.
- The shop toggle callback fires on key-down even while gameplay is paused for an open shop, so a second Tab closes it. Ignore key-repeat. Free pointer lock when entering the shop and allow it to be recaptured by clicking into the arena.
- Mouse1 (middle click) triggers target-lock even before pointer capture, using existing `nearestHostile()` (hostile, alive, not yielded, within line of sight in missions). A second click releases lock. Cancel browser middle-button autoscroll.
- Old saved preferences with `lock: 'Tab'` are migrated on load when the new Tab shop default occupies that key. User-chosen nonconflicting remappings remain valid. Settings and HUD labels use the binding table.

## Validation and handoff
- Focused tests: `node --test tests/duelist-core.test.mjs tests/duelist-class-kits.test.mjs tests/duelist-controls.test.mjs tests/duelist-stamina-stagger-immunity.test.mjs`
- Verify in practice, story, and online matches: damage still affects shield/HP but Force is unchanged; spells still consume the caster's Force; shield Breach bypasses armor; Tab opens/closes shop without browser focus traversal; middle click picks a target and toggles off, both before and after pointer lock.
- This branch does not change the Fallen Sky 3D black-screen recovery or WebGPU rendering. Do not merge until validation.
