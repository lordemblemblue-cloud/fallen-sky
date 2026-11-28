# Duelist Adventure: development record

Baseline: `lordemblemblue-cloud/fallen-sky` `main` at `ab03f50a` (2026-11-27). Written 2026-11-27 by the project-recovery session. Legend and method: [README.md](README.md). Labels as in the other records: [code], [doc], [PR #n], [commit], [issue #n], [mem], [note]; **checked** = opened or run on `main` for this record; **claimed** = from a PR body or note, not re-run.

## 0. Where it stands

- Code: `src/components/duelist/` (187 tracked files: `core/`, `sim/`, `net/`, `client/`, `menu/`) and `server/duelist/` (authoritative match server, progress store, guest public host). Routes: `/duelist` renders `DuelistTemplateHub`; `/duelist-next*`, `/duelist-lab`, `/duelist-classic` remain [code; checked by the reader].
- Docs: 41 files in `docs/duelist/` (REBUILD_PLAN, CLASSES_PLAN_20261120, FOUR_CLASS_RULES_HANDOFF_20261120, KIT_FIXES_20261122, COMBAT_DIRECTIONAL_UPDATE_20261121, DAMAGE_FORCE_INPUT_MAPPING_20261121, the battle-shop ledgers, UI hand-offs, 13 CONDUIT stage hand-offs, map sources). Some are stale where code moved on (REBUILD_PLAN and CLASSES_PLAN still describe per-class levels; COMBAT_DIRECTIONAL calls blades and staff 3-way while the clip pack has 9 cuts each) [reader-checked]. Code on `main` is used where they disagree.
- Tests: each of the 142 Duelist test files run singly on `main`: **678 pass, 24 fail in 18 files**; `tests/duelist-server.test.mjs` 23/23 and did not stall [checked by the reader]. No browser, two-player or live check was done for this record.
- **2026-11-28:** two Duelist branches were merged into `main` at `faedf8c9` on the owner's "Yes, check and merge" (relayed by the hub): the test triage with the mobile settings fix (`fa19b28b`, WP-DA-01 and WP-DA-06) and the push rework (`87c9bc62`, WP-DA-05). On `main` `f5f29677`, every Duelist test file passes in the full `tests/` run except `duelist-levels` (4, waiting on DA-D2) [checked]. The triage's own singly-run count: 700 pass, 4 fail [handoff `20261128-claude-duelist-test-triage.md`].
- 138 Duelist PRs in the history; 11 open (§10). Issue #103 (Duelist UI/modes/combat/animation hand-off, opened for another agent) is mostly delivered; issue #298 (secure guest multiplayer) is blocked [reader-checked].

## 1. Approved and implemented

Approval sources: the owner's "Yes, build them" for the four-class plan (2026-11-20) and the owner's 2026-11-21/22 combat and kit lists [mem `duelist-adventure-rebuild.md`, `duelist-kit-fixes-20261122.md`; doc `CLASSES_PLAN_20261120.md`, `KIT_FIXES_20261122.md`, `DAMAGE_FORCE_INPUT_MAPPING_20261121.md` "owner-confirmed"].

| Item | Code | Tests on `main` |
|---|---|---|
| Four classes: Warrior (renamed from Juggernaut; id `warrior`), Duelist, Assassin, Healer, each with its own kit and passive | `core/classes.mjs` (`warrior`, `duelist`, `assassin`, `healer` entries; checked), `core/abilities.mjs`, `core/moves.mjs`, `sim/world.mjs` | classes, class-kits, abilities pass |
| Kits: Warrior Leap Strike, Telekinetic Grip, Repulse, Blade Throw, special Rage; Duelist Pull, Quickstep, Blade Throw, Guard and Counter, Execution (target ≤ 30 % HP); Assassin Veil Cloak, Push, Empowered Strikes, Mind Dominance, Shadow Execution from behind; Healer Mend, Quickstep aura, Levitate, Push, Sanctuary | `core/classes.mjs` | assassin rear-arc and cloaked-execution safety pass |
| Directional cuts, chains, snap moves, recoil, push, kill dissolve | `core/cuts.mjs` (timings `CUT_TIMING`, `BACKHAND_TIMING`, `SNAP_TIMING`, `FORM_TIMING`), `client/animator.mjs`, `director.mjs`, `vfx.mjs` [PR #209, #225, #293] | cuts, flow, moves, motion pass |
| Free attacks and sprint (no stamina), three hits in 2 s give 1 s stagger immunity, damage never drains Will, Tab shop, middle-mouse lock | `core/damage.mjs`, `core/fighter.mjs` | pass except one snapshot-mirror test (§8) |
| Movement: dash Alt, run Shift, roll C, jump Space, double jump and air dashes; guard, parry, dodge | `core/moves.mjs`, `core/combat.mjs`, `sim/world.mjs` | air-dash pass |
| Modes: Duel, Team Deathmatch, Capture the Flag, Football, Three-Point Control, Escort; bots | `sim/match.mjs`, `control.mjs`, `escort.mjs`, `football.mjs`, `sim/bots.mjs` | pass on `f5f29677`; the FFA test passes since the Conduit bot route fallback (`7063f145`, needs the owner's review), and about a third of bots still freeze in a 2-minute free-for-all (WP-DA-10) |
| Authoritative server, client prediction, reconnect, fair-play checks (local; not deployed) | `server/duelist/server.mjs`, `net/predict.mjs`, `core/fairplay.mjs` | server 23/23, reconnect, predict pass |
| Practice settings, training demonstrations, story supplies, key rebinding, comms voices (50 ElevenLabs lines) | `client/PracticeSettings.jsx`, `practiceDemonstration.mjs`, `core/demonstrationCatalog.mjs`, `client/voices.mjs` | pass except one play-reference test |
| Story missions Contraband and Saltmarch, solo and co-op crews with room codes | `sim/missions/*.mjs`, `sim/mission.mjs`, `client/MissionHud.jsx` | mission 8/8, saltmarch 3/3 |
| Liquid-glass hub, quiet HUD (owner: no thick neon borders), play drawer, mobile layout (#287, #296) | `menu/DuelistTemplateHub.jsx`, `client/GlassHud.jsx`, `menu/duelistOpenGlass.css`, `menu/duelistMobileUI.css` [doc `QUIET_HUD_STYLE_HANDOFF_20261120.md`] | glass-hud, unified-ui, mobile-ui and the menu tests pass on `f5f29677`; settings checked in the built-in pane at 667×375 and 844×390, not on a real phone (WP-DA-06) |
| Battle Shop Damage tiers I and II | `core/shop.mjs`, `client/ShopPanel.jsx` [PR #378] | shop tests pass except one reference test |
| 2026-11-22 kit fixes (T taunts, double jump and air dashes, effects, 59 ability sounds, 7 Blender clips) | branch `claude/duelist-adventure-20261122` `74ae9cf6` is an ancestor of `main` [checked] | in the pass set |

Memory said commits `96750be3..27d9b77c` were in no PR and not in `main`; that is stale: they are ancestors of `main` [checked `27d9b77c`].

## 2. Approved and implementation-ready

- **Announcer and clash sounds:** commit `295c5f4a` on `claude/duelist-feel-20261122`, 1 commit ahead of `main` [checked], no PR, never heard in game [mem]. Needs a PR and a listening check.
- **Push rework** the owner asked for on 2026-11-22 (translucent wind, knockback from 4.5 to about 6.5, the downed body slides, `pushSlide.mp3` wired): specified in [mem `duelist-kit-fixes-20261122.md`]. **Built and merged 2026-11-28** (`87c9bc62`): knockback 6.5 m, the slide along the floor, faint wind instead of the flash; `PROTOCOL` unchanged; `duelist-push-slide` 3/3 [checked]; checked live in practice [doc `docs/duelist/KIT_FIXES_20261122.md`; claimed]. The slide plays a synthesized skid until the recording on `claude/duelist-feel-20261122` (WP-DA-04) is merged.
- **Failing tests:** triaged 2026-11-28 (WP-DA-01, §8). Those in `duelist-levels` wait on decision DA-D2.

## 3. Approved but partially implemented

- **Class progression:** Claude built per-class levels 1–20 (owner confirmed "saved per class" [mem]); other agents replaced it on `main` with permanent mastery 1–25 plus a resettable per-match boost (`core/progression.mjs` `LEVEL_CAP = 25` [checked]; commits `45ce5f90`, `4c258278`, `17c37873`). 4 of 8 `duelist-levels` tests fail. Which design the owner wants is not recorded (DA-D2).
- **Healer Levitate fix** (immobilize, drop on damage, recover on landing): PR #361 only.
- **Public online play:** server code and guest host exist; deployment target, `VITE_DUELIST_WS_URL` and guest identity are missing [issue #298].
- **Room capacity:** 20 humans (#333) and 100-human pools (#338, draft) are on branches only.
- **Story:** two missions in `main`; rewrite PR #340 open (27 new lines still use browser speech pending recordings).
- **Conduit map:** stages 1–12 hand-offs in docs; stage 2A traversal PR #357 open; STAGE12 says not to activate it by changing the renderer or catalog alone.
- **Combat blend styles per class** (#230) and **held Space Force Jump** (#232): branches only.
- **Ultimates online:** the Execution tether and the ally Sanctuary glow are not shown to other players (the snapshot lacks `seizedBy` and zones) [mem].

## 4. Approved but blocked by missing dependencies

- Ranked: needs deployed servers, identity and a rating design; today five placeholder cards say "Ranked servers are not deployed" [code `menu/templateCatalog.mjs:5,22–24`; checked].
- Public matchmaking: Base44-token auth versus guest admission, host deployment [issue #298].
- Account-wide progress persistence (REBUILD_PLAN phase 5): needs a durable progress file or account store.
- Retiring the old engine and the final `/duelist` switch (REBUILD_PLAN phase 8): needs the owner's sign-off; `/duelist` already renders the new hub through other agents' PRs.
- Conduit activation: adapter and layout work first (STAGE12).

## 5. Incomplete design (do not invent; see [MISSING_INFORMATION.md](MISSING_INFORMATION.md) group DA)

Custom games (lobbies, rules, tournament room: placeholder cards only); Ranked rules; Battle Shop tiers beyond Damage I–II and the Relic actives (ledger says "design ideas only", numbers provisional); a third story mission and classes inside story missions; strafe and backpedal locomotion, footsteps, ambience, arena music; bot specials and bot mode choice; a bow or sniper moveset (mentioned, not designed); approved scripts and timings for the training demonstrations.

## 6. Awaiting assets

The owner's own guard and enemy models (guards are a procedural kit over base bodies); armour sets per class (armour is baked into body GLBs; LOD candidates need a Blender run [PR #384]); recordings for #340's 27 lines; a listening review of the 59 ability sounds and the announcer lines; new clips through the RGB MoCap → Cascadeur → Blender pipeline (none delivered yet). The 144-clip pack was built in Blender from a purchased clip pack plus Blender-made cut clips; treat it as working, not final, until the owner decides (directive §7, §14) [reader-checked `tools/duelist/blender/`, `core/motionPack.data.mjs`].

## 7. Awaiting owner decisions

| # | Decision | Source |
|---|---|---|
| DA-D1 | Merge, rebase or close each open PR (§10) and the `duelist-feel` branch | PR list |
| DA-D2 | Class progression: per-class levels 1–20 or mastery 1–25 plus match boost; rewards per level; whether online and offline progress merge | [mem] vs `core/progression.mjs` |
| DA-D3 | Deploy the match server, and the guest admission design | [issue #298] |
| DA-D4 | Story: keep the current two missions or take #340's rewrite; approve the agent-invented names ("for owner review") | [PR #340], REBUILD_PLAN |
| DA-D5 | Battle Shop numbers (ledger marks them provisional) | BATTLE_SHOP_OVERHAUL_PROGRESS |
| DA-D6 | Three-Point Control two-point scoring rate ("needs confirmation") | [issue #103] |
| DA-D7 | Ranked and Custom games scope | `menu/templateCatalog.mjs` |
| DA-D8 | Phase 8: retire the old engine | REBUILD_PLAN |
| DA-D9 | PR #230 and #232 describe themselves with another game's and Game 2's names ("inspired by … Jedi Academy", "recreate Duelist 2's hold-Space Force Jump … reference Game 2 engine"): reword and confirm the code is original before any merge | [PR #230, #232 bodies] |
| DA-D10 | Whether the new blades and staff cut motions look right (only two characters were watched in motion) | [mem] |

## 8. Awaiting technical verification (and known failing tests)

- Two real players online across all four classes; kit-fix effects and sounds online; blades and staff cuts in every direction; clash sounds; Levitate fix; held jump; mobile layout on current `main`; WebGPU cost versus WebGL (no speed test; WebGPU is default since 2026-11-21 [mem]); server load at 20 and 100 humans; Conduit numbers (#352 and #357 cite an isolated harness, not the Node runner).
- The 24 failing tests on `main` [checked by the reader]: `duelist-battle-shop-reference` (1), `duelist-controls` (bindings on blur, 1), `duelist-idle-class-rail` (1), `duelist-levels` (4), `duelist-match` (FFA, 1), `duelist-mobile-ui` (settings tabs at 667 and 844 wide, 1; the 2026-11-23 hand-over had 31/31 on `96c0c70a`), `duelist-online-class-entry` (1), `duelist-online-server-browser` (1), `duelist-play-reference` (1), `duelist-special-contract-regression` (1), `duelist-special-meter-invariants` (1), `duelist-special-target-safety` (1), `duelist-stamina-stagger-immunity` (1), `duelistReferenceMenus` (1), `duelistTemplateHub` (1), `duel-system-backend` (6; a legacy duel module that reads `Deno.env`, not the Duelist match server). Not triaged into real bugs versus stale assertions.
- **2026-11-28:** all of these pass on `main` `f5f29677` except the 4 in `duelist-levels` [checked]. The triage (WP-DA-01) found one real bug: free-for-all bots on The Conduit lost their route on ramps, fixed by a route fallback in `7063f145` that needs the owner's review. It found that three special tests had always placed the attacker in front of the Assassin's target, that nine others were stale against behaviour the owner had already merged, and that `duelist-mobile-ui` was testing overrides the glass Settings had replaced (each fix names the commit it follows). `duel-system-backend` was fixed separately by R159 (PR #473) [handoffs `20261128-claude-duelist-test-triage.md`, `20261127-chatgpt-r159-duel-authority-harness.md`].

## 9. Superseded or rejected

- Requests to use another game's animations or source code and a Star Wars theme (2026-11-20 to 11-22) were declined by the Claude sessions for copyright reasons; original clips and rules were built instead [mem `duelist-directional-strikes-spec.md`, `duelist-kit-fixes-20261122.md`]. The owner has not recorded accepting this; keep the originality rule.
- Per-class levels 1–20: replaced on `main` by mastery plus boost (pending DA-D2).
- The old `/duelist` engine copy: replaced by `DuelistTemplateHub`; `duelist-classic.jsx` remains.
- "Juggernaut" is now "Warrior"; the directive's "Warrior/Juggernaut" refers to this class.
- PR #333 (20-human rooms) is likely superseded by #338 and `main`'s public host (#349); PR #160 (class-request boundary, "not wired") overlaps lease modules already in `main` [reader merge-tree checks].

## 10. Open PRs (merge-tree against `ab03f50a` by the reader)

| PR | Content | Conflicts | Note |
|---|---|---|---|
| #384 | armour quality settings, lightweight guard rendering, LOD workflow | 2 files | armour optimisation is not in `main` |
| #361 | Healer Levitate fix | 1 (`sim/world.mjs`) | valid fix; rebase |
| #357 | Conduit 2A traversal audit | 4 | partly overlaps files already in `main` |
| #352 | Control Point trim precision | 1 | tiny; check `main`'s trim first |
| #346 | startup hang guards for the hub and Duelist, 15 s intro bypass, build workflow | 0 | check that no protection is weakened |
| #340 | two-mission story rewrite | 6 | owner chooses the story (DA-D4) |
| #338 | persistent server directory, 100-human pools (draft) | 9 | heavy overlap with `server.mjs` and protocol |
| #333 | 20-human rooms | 5 | likely superseded |
| #232 | held-Space Force Jump | 3 | overlaps double jump; wording (DA-D9) |
| #230 | four class blend styles, Assassin execution fix | 2 | overlaps animator; wording (DA-D9) |
| #160 | class-select packet boundary (not wired) | 0 | likely superseded |

## 11. Animation dependencies (directive §14)

Specified, with timings in code: sword cuts (9 × 3 modes), snap moves, blades and staff cuts, Execution, Dominance, Rage roar, taunts, recoils (`core/cuts.mjs`, KIT_FIXES per-clip tables). Not specified anywhere found: strafe and backpedal loops; Levitate caster and victim; Mend, Quickstep aura and Sanctuary casts; Warrior Leap Strike, Repulse and Grip clips; double-jump and air-dash motion; per-class finisher variants; death and knockdown variety; a bow set; a held-in-grip pose. Each needs frame timings, contact and damage windows, root motion, loop points and server timing before production (MISSING_INFORMATION MI-DA-06).
