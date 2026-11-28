# Hand-back: Duelist WP-DA-01 (failing tests) and WP-DA-06 (mobile settings)

Written 2026-11-28 by the Claude session that built the Duelist landscape mobile UI fix (#296), assigned both packages by the hub session on 2026-11-27.

```
Project / feature:            Duelist Adventure; WP-DA-01 (triage the failing Duelist tests), WP-DA-06 (mobile settings regression)
Branch / head commit / PR:    claude/duelist-test-triage-20261127, from main df514c34; code head c3103d14, this record on top.
                              No PR opened (gh is not signed in on this PC); compare:
                              https://github.com/lordemblemblue-cloud/fallen-sky/compare/main...claude/duelist-test-triage-20261127?expand=1
                              Not merged.
Completed:                    14 of the 18 failing Duelist tests on df514c34 resolved; the 4 duelist-levels failures left to
                              WP-DA-09 as instructed. One game-code fix, one stylesheet clean-up, twelve tests brought in line
                              with behaviour already merged into main (one commit per area, each naming the commit that changed
                              the behaviour):
                              - duelist-match FFA (game fix, 7063f145): since 60d6df34 put free for all on The Conduit, a bot on
                                a ramp or with no straight line to its six nearest same-level nav nodes got no route and stood
                                still for the rest of the match, and so did every bot chasing it. conduitBotPath now falls back
                                to the nearest walkable node at any level within 3.5 m height, then the nearest node.
                              - duelist-mobile-ui (WP-DA-06, c3103d14): the glass Settings redesign (691325e7, 10d5dc81) owns
                                the phone layout and outranks duelistMobileUI.css; the old settings overrides there were dead and
                                are removed; the test checks the glass layout's phone guarantees instead.
                              - duelist-controls (cb48a939, b44903ac), duelist-online-class-entry (3b920845, 4e027a06),
                                duelist-online-server-browser (14fdaef5, 674a6fed), duelist-play-reference (f79083ed, 38e141b6),
                                duelistTemplateHub + duelistReferenceMenus story (002754c9, 8a316b15),
                                duelist-battle-shop-reference (9e1ed266, 69b9e05e), duelist-stamina-stagger-immunity
                                (9afdceb3, protocol 21), duelist-idle-class-rail (3c91c807, 3a827f04).
                              - duelist-special-contract-regression, -meter-invariants, -target-safety (4d542fc9): failing since
                                they were added; their fixtures put the attacker in front of the Assassin's target (Shadow
                                Execution needs its back; yaw 0 faces +z as in the sim and the rear-arc test).
Approved:                     The updated tests follow behaviour the owner merged into main (commits above). The Conduit bot
                              route fallback is new behaviour and needs the owner's review.
Left incomplete:              duelist-levels (4 tests): waits on DA-D2 (WP-DA-09). Conduit bots still freeze for other reasons
                              (see Remaining problems).
Next step:                    Owner review and merge. A separate package for Conduit bot navigation.
Files changed:                src/components/duelist/sim/conduitLiveLayout.mjs; src/components/duelist/menu/duelistMobileUI.css;
                              tests/duelist-{battle-shop-reference,controls,idle-class-rail,mobile-ui,online-class-entry,
                              online-server-browser,play-reference,special-contract-regression,special-meter-invariants,
                              special-target-safety,stamina-stagger-immunity}.test.mjs; tests/duelistReferenceMenus.test.mjs;
                              tests/duelistTemplateHub.test.mjs; this record.
Decisions to preserve:        Settings' phone layout lives in duelistReferenceMenus.css (glass surface); duelistMobileUI.css keeps
                              no settings rules. Every selector in duelistMobileUI.css starts with `html ` (#296). The Assassin's
                              rear arc: yaw 0 faces +z (core/classes.mjs behindTarget).
Assets required:              None.
Unresolved dependencies:      DA-D2 (class progression) for duelist-levels.
Tests performed:              Windows 11, Node 26.13.0, worktree with its own `npm ci` of main's lockfile.
                              - Each of the 142 Duelist test files run singly: main df514c34 685 pass / 19 fail in 16 files
                                (the 15 known files plus an intermittent duelist-server failure); branch 700 pass / 4 fail,
                                all in duelist-levels.
                              - `node --test --test-reporter=tap tests/`: main 3316 tests, 3170 pass, 145 fail; branch 3316 tests,
                                3184 pass, 131 fail. By failing test names: 14 no longer fail, 0 newly fail.
                              - tests/duelist-server.test.mjs alone: 23/23 twice on main and twice on the branch; its "Online
                                quick-match chooses only TDM, CTF or Three-Point Control ..." test fails now and then when other
                                test files run at the same time (real websockets), on main too.
                              - `npx eslint` on the 15 changed files: 7 errors, the same 7 as on main in the same files
                                (structuredClone and URL undefined in .mjs tests); none new. `npm run build`: exit 0.
                              - Seeded free-for-all on The Conduit, 120 s, seeds 1-12 (72 bots): bots frozen for the last 40 s
                                main 48, branch 23; defeats 24 -> 38; seeds with >= 3 defeats 3 -> 8; every respawn protected.
Live / visual checks:         Built-in browser pane, Vite dev server, WebGL renderer override, Duelist menu -> Settings:
                              667x375 (phone emulation) and 844x390 (?touchControls=1), before and after removing the old
                              overrides (same geometry): the panel ends at the 52 px footer; tabs, controls and buttons do not
                              overlap; Revert / Apply / Close tappable; all seven tabs reachable (four or five at once, the rest
                              by scrolling the tab column; Accessibility opened by a tap). Pictures: side-session notes folder
                              mobile-duelist-ui-20261123/wp-da-06-20261128. Not checked on a real phone.
Remaining problems:           - Conduit bots: after the fix about a third still freeze in a 2-minute free-for-all (two fighters
                                on a ramp at different heights standing off, bots wedged in corners, a used-up route when the
                                target is behind a wall, two bots one above the other on different levels). A blunt "steer at
                                the target when the route is empty" rule was tried and dropped (bots pushing into walls and
                                jittering). Online and offline bots share this code.
                              - duelistMobileUI.css still holds dsm-* story rules that no longer match anything (the story
                                screen became the ds-campaign view in 8a316b15); harmless, left for a clean-up.
                              - The shared C:\Users\marcu\.copilot\repos\fallen-sky node_modules (junctioned into worktrees)
                                predates main's package.json (fflate, react-router-dom 7, @base44/vite-plugin 1.0.55); a dev
                                server on main fails with it.
Missing information filed:    None.
```
