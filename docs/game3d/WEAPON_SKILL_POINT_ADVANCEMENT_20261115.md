# Game 3D — Weapon skill-point advancement (2026-11-15)

## Scope
- Both independent Game 3D repos: `marcusflow1-arch/atom-x-eve-os` and `marcusflow1-arch/gitsync-pro`.
- Existing three weapon paths: sword/damage (offensive), bow/range (ranged), guardian/defense (defensive).
- This is NOT part of LAND-WS01–WS15; no terrain squares, ownership locks, or unrelated games are touched.
- Source and server-bound save rules use `base44/shared/weaponSkillPoints.mjs` as their shared math.
- The existing three **attribute** points per level (`playerHUDStore.jsx`) and per-skill mastery through confirmed combat use (`skillMasteryStore.jsx`) are distinct and unchanged.

## Point budget
- Level cap 100; level 1 begins with 0 spendable weapon skill points.
- Each transition to level L (L >= 2) grants **3 + floor(L / 20)** guaranteed weapon points.
- Earned total is the sum for levels 2..L, never rolled, never a client-supplied earned counter.
- Totals: L20=58; L40=139; L60=240; L80=361; L100=502.
- Five sequential upgrade stages per weapon cost **20 + 30 + 40 + 50 + 60 = 200** points.
- At level 100, players can complete two full weapon paths (400), with 102 left for the third.
- The older proposed 0.2% increase is deliberately superseded: 3 points * a 0.2% increase per level would fall far short of the stated two-and-a-half-path requirement.

## Skills, passives, and charged damage
- The existing registry's ten core skills per weapon are grouped into five consecutive stages of two arts per stage. A stage is available when the preceding stage is fully funded. The first stage is the starter stage.
- Each stage also grants one free passive **on entering the stage**: Charge Focus I–V, +1% charged damage each, automatically applied to the weapon. The player does not spend separately for passives.
- Each stage's investment percentage is `100 * spent / stageCost`. Its paired registered skills get exactly that much additional damage **on a charged cast** only. Example: 5/20 points = 25%; 15/30 = 50%. Ordinary uncharged casts retain normal damage.
- Charge is available independently and is **not unlocked** by points. This change enhances existing charge output; it does not replace charge timing, mastery XP, hits, animation, or cooldown.
- Completing the fifth stage is the final upgrade, with **no new max-cap bonus**.
- Other legacy/non-core registry attacks and buffs retain existing availability and damage rules until individually mapped.

## Backend validation and limitations (review blockers)
- New stored key: `axe_weapon_skill_points_v1` holds only tier allocations, scoped per character. Current-level earned total is computed, not stored.
- `base44/shared/characterSaveRules.ts` validates this new value in the existing Character Vault PUT path. Invalid schema, unknown trees, nonlinear tiers, over-cap tiers, overspending relative to the character level, disappearing allocations, and reductions versus the previous server copy are rejected.
- Character Vault is a **revision-checked save system**, not yet an authoritative ledger of XP or node-spend transactions. A compromised client could attempt fabricated allocations within the character-level entitlement; further authoritative progression/transaction enforcement is needed before release.
- PvE browser skill dispatch now applies the stage and free passive bonus to charged strikes. **PvP parity is NOT DONE**: `base44/functions/duelSystem/entry.ts` and `server/game3d/authority.mjs` calculate charge and damage from server-side policy and do not read the new character skill-point allocations. Never trust `skillPointChargeBonusPct` from a client event to fix this.
- Existing PvP charge bonus is separately gated by server-verified mastery attestation; do not weaken that gate. Server-confirmed per-character progression and match-state snapshot must be completed before adding the new bonus to PvP.
- Existing temporary skill and weapon damage caps need regression verification for the extra charged scaling. Native hit outcomes, real weapon VFX, live two-client combat and reconnect cases have not been certified.

## Acceptance before reviewable merge
1. Run `node --test tests/game3d/weapon-skill-points.test.mjs` and focused skill mastery, Character Vault, charge, and duel tests **in both repositories**. Investigate any actual code/test failures; hosted no-step CI alone is not proof of a defect.
2. Inspect the branch against the newest main, rebase/resolve only owned Game 3D skill files and verify no unrelated scope.
3. Implement/verify authoritative point transactions and fair, server-validated PvP bonus calculations without trusting browser damage multipliers.
4. Test each stage at 0%, 1%, 25%, 50%, and 100%, 3 weapon categories, normal/charged casts, mastery progression, free passives, fast and multi-level-ups, character switching, logout/login, and cross-device Vault sync.
5. Signed-in Game 3D Play visually and mechanically confirm skill-tree UI, stored balance, correct charged hits in PvE, and two-client parity where applicable.
6. Keep both PRs **draft** until independent game acceptance and owner approval. Do not merge merely because source or calculations pass.
