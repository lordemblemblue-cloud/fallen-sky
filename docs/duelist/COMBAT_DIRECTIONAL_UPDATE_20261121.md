# Duelist 2 combat and directional animations — owner update (2026-11-21)

## Implemented in the accompanying combat branch

- Basic and heavy **attacks use no stamina**, including single-blade cuts, twin blades, staff and ranged attacks. This is enforced at the shared move-definition boundary so browser prediction and authoritative simulation agree.
- Running / holding sprint uses **no stamina**. A winded combatant can still run and sprint. Guard blocking, rolls and other stamina-based *defensive* actions retain their costs.
- **Three confirmed unblocked damaging attacks within two seconds** trigger **one second of stagger immunity** for the defender. The third hit deals its usual damage but immediately clears existing hit-stagger; the defender can start a counterattack. Hits during the one-second window still damage but cannot inflict normal hit-stagger, do not add to the next streak, and cannot extend the window. Fresh parries remain meaningful. Respawning creates a clean streak and timer. This is a **stagger** rule, not damage invulnerability; exceptional control abilities (grip, knockdown) remain separate.
- New immunity state is synchronized by the Duelist multiplayer snapshot/prediction contract (protocol 12).

## Animation work to continue with Claude — not yet shipped by this branch

The design principle is the reference game's **eight-way attack language**, not its code, animation files, poses, or copyrighted assets. Every move and combo must be a newly authored original animation for Duelist Adventure's own characters and crystal weapons.

1. **Input directions** from the existing `stickDirection` mapper: forward, forward-right, right, back-right, back, back-left, left, forward-left. Neutral produces a separate default strike. The actual hit direction must use the player's facing, not the camera's world-axis. The server chooses the move, hit timing and damage.
2. **Warrior / Juggernaut**: one blade, **heavy/red** identity — planted, powerful strike arcs, meaningful startup and follow-through. Use the existing sword cut geometry and heavy timing, but give the class a fixed heavy stance, rather than requiring mode cycling. New original clip per angle.
3. **Healer**: one blade, **swift/blue** identity — quick compact directional strikes, precision footwork, brief recovery, protective free hand. Fixed swift stance; not interchangeable with Warrior's heavy animation just by tinting the weapon.
4. **Duelist**: **two distinct blades** — eight separately authored directional attacks with clear left/right hand ownership, crossing/uncrossing transitions and stable blade trails. No mirroring a single sword asset as the complete replacement. Neutral chain can remain a four-link alternating pattern while deliberate direction picks a distinct clip.
5. **Assassin**: **one double-ended staff** — eight distinct directional cuts, reverse strikes and end-to-end momentum with grip continuity and no torso intersection. Do not treat the two staff ends as dual-wielded blades.
6. **Every direction must have real animation evidence**: a new move ID (or explicitly directional clip binding), new licensed clip in the generated pack, accurate `MOVE_MOTION` segments and contact frames, matching `FLOW` routing, and coverage in the Motion Lab. Do not map eight directions to the same forward/side/back three clips and claim success.
7. **Combos:** allow following attacks from the previous end-pose through validated chain/cancel windows; preserve ability and special rules, server-owned hit confirmation, and anti-spam limits. Ensure rapid hits do not defeat the new three-hit stagger-immunity window.
8. **QA:** check eight directions for all four classes in practice and authoritative multiplayer, stationary and locked-on movement, animation synchronization, stamina at zero, hit-stun on hit three, uninterrupted counterattack for one second, parry/guard interaction, death and reconnect. Then verify browser performance and weapon pose on desktop/mobile.

## Current repository reality

- `src/components/duelist/core/cuts.mjs` and Blender `tools/duelist/blender/cut_grid.py` already support eight directional sword lines in three modes. `FLOW.sword` chooses them.
- `FLOW.dualBlades` and `FLOW.staff` currently reduce directions to only **forward / side / back** via `flowDirection`. Their existing `moveMotion.mjs` mappings and `weapon_clips.py` authoring pipeline use those broad motions.
- Next animation branch must author, bake and validate the missing 8-way twin-blade and staff clips, wire those clips into the pack and class-specific action routing, and validate with `tests/duelist-cuts.test.mjs` plus additional new tests. This combat branch **does not claim** the directional clip work is finished.

Related handoffs: `docs/duelist/ORIGINAL_CLASS_ANIMATION_COMBO_HANDOFF_20261120.md` and `docs/duelist/FOUR_CLASS_RULES_HANDOFF_20261120.md`. Keep the next animation changes isolated from WebGPU and the HUD merge streams.
