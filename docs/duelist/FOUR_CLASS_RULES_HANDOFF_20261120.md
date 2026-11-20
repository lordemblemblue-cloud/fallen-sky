# Duelist Adventure four-class rules — engineering handoff (2026-11-20)

Branch: feature/duelist-four-class-rules-20261120. Draft PR only; no merge or deployment.

## Design contract

Four classes, selectable before a match or upon death/respawn. Class data is shared by local practice and authoritative multiplayer; never trust a client to change class, deal execution damage, or charge its special meter.

- Assassin: double-bladed staff, Invisibility / Push / Enhanced Strikes / Mind Trick. Special: full-meter execution from behind, no HP threshold.
- Duelist: twin crystal blades, Pull / Speed / Blade Throw / Guard and Counter. Special: ~one-third-meter execution if the target is below an HP threshold.
- Juggernaut: single blade, heavy stance, Leap / Grip / Repulse / Blade Throw. Special: Rage (short invulnerability, double damage, faster movement and attacks).
- Healer: single blade, swift stance, Mind Trick / Speed / Levitate / Push. Special: defensive ally field, protection and absorption versus powers.

The UI displays 3 ability circles at a time; the selector rotates one slot to reach the fourth. The special ring displays the authoritative 0–100% resource. Never fake charge.

## Implemented here

- New pure JS src/components/duelist/core/classes.mjs contains frozen class definitions, animation-name slots for original future clips, class abilities, supported weapon forms, tunable special rules, special costs and charge event types.
- requestClassSelection refuses swapping while alive in an active fight and queues the choice; classAtSpawn chooses the next weapon and clears pending selection.
- evaluateSpecial rejects invalid charge/state and, for executions, protected/friendly/dead targets, insufficient range, bad HP threshold for Duelist or wrong rear angle for Assassin. It returns an INTENT, not damage or an actual effect.
- awardSpecialCharge accepts known event names and clamps charge, to be called by server-side combat events only.
- Shared exports available through src/components/duelist/core/index.mjs.
- Unit tests in tests/duelist-classes.test.mjs and workflow .github/workflows/duelist-four-classes.yml.

## Incomplete — do NOT claim playable four-class combat

No model, class animation, special effects or class-specific powers are wired. Shared match simulation now owns pending class IDs on player seats via queueMatchClass and applies the weapon choice at initial countdown, respawn or next duel round. But the multiplayer WebSocket protocol still has NO class-request message, and there is NO in-game class picker or special meter integration; external clients cannot invoke this new selection API yet. The HUD in separate draft PR #135 is not wired to this class resource.

Next agent-owned tasks (separate PRs): (1) authoritative per-seat class selection, server-derived death/round states and preserving selection on reconnect; (2) special-meter ownership and confirmed combat charge in simulation and snapshots; (3) real class abilities/specials through core damage and fairplay checks; (4) custom original animations and matching meshes; (5) pre-battle and respawn selector, real cooldown/special HUD and desktop/mobile QA. Coordinate with PR #135, avoid modifying its HUD files or WebGPU/Game3D files on this branch.

Balance proposals, not finalized: Duelist execution at <=25% HP; Assassin rear 120-degree cone within 2.3m; Rage duration 5s with double damage and +30% movement and attack speed; healer ward duration 5s, 80% power resistance. Needs playtesting and owner review.

No benchmark or deployment is claimed.

## Shared match simulation update

- Changes in src/components/duelist/sim/match.mjs and world.mjs add queueMatchClass, per-player pendingClass/classId, and weapon assignment on next spawn. Class choice is NEVER applied immediately during live combat; old players continue using the legacy sword when no class is chosen.
- New tests/duelist-match-classes.test.mjs cover countdown selection, rejected live changes, bot/unknown seat rejection, post-death respawn, next duel round and protection persistence.
- All dedicated CI jobs (class rules + match regression tests, ESLint, full application build) passed on code commit 2990dd19447b39edece97542c09ef5794dbdc440 in [GitHub Actions run 44818159207](https://github.com/lordemblemblue-cloud/fallen-sky/actions/runs/44818159207). The follow-up commit updates documentation only.
- The next agent should wire class choice to an authenticated player seat through a bounded WebSocket message; update client prediction, reconnect and body weapon visuals and cover spoof attempts. Do not claim the four special abilities are live.
