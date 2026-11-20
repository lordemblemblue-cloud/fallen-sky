# Duelist Adventure — Online quick-match + Three-Point Control

## Online (a menu action, not a match ruleset)

From **Play**, choose the new **Online** tile. This sends `{t:'join',mode:'online'}` to the match server. The authoritative server uses a secure random selection among:

- **Team Deathmatch** (`tdm`)
- **Capture the Flag** (`ctf`)
- **Three-Point Control** (`control`)

The server replies with the actual game mode and its public match room ID. It joins the busiest room of the randomly selected mode with an available bot seat, or creates an extra room as needed. The browser never decides or forges the selected mode. It cannot use a supplied `matchId` to override random matchmaking. All three modes retain the existing bot-replacement, reconnect and match overflow behaviors.

The separately selectable match modes remain available; Football and Duel are **not** part of Online's random pool.

## Three-Point Control rules

Three objectives are **A**, **B** and **C**, starting neutral. Each team is red or blue.

1. **Capture:** Stand in a point's 4-metre radius for 4 uninterrupted seconds while no enemy is inside. Multiple teammates can hold the point, but they do not make it capture faster.
2. **Contest:** If both teams occupy a point, its capture progress pauses and ownership cannot change.
3. **Retake:** An enemy team must complete the same 4-second capture to steal an owned point. Ownership persists even when the point is temporarily unattended.
4. **Scoring:** **0** percentage points per second for zero or one point; **1% per second** for exactly two owned points; **2% per second** when all three are owned.
5. **Victory:** First team to **100%** wins. The score is capped at exactly 100; objective points cannot be earned from eliminations.
6. **Combat:** The existing team combat rules, respawns, temporary respawn protection and bots continue to work; downed/dead/grabbed fighters do not contest or capture.

The one-point-per-second rate for **two** points is an initial balancing choice. The stated all-three-points rate is exactly two percent per second. Edit the two constants in `src/components/duelist/sim/control.mjs` to rebalance later.

## Designed for upcoming maps

The rules do not depend on authored level meshes or character models.

- `makeControlPoints(arena, layout?)` constructs three objectives and can take map-authored positions `[{x,z},{x,z},{x,z}]` in **A**, **B**, **C** order.
- `createMatch({mode:'control',controlLayout})` uses those positions. `createDuelistServer({controlLayout})` carries them into server-created rooms **and rematches**.
- Until maps are built, the existing arena uses symmetric fallback coordinates. `controlProps.mjs` renders minimal temporary rings, not a designed map.
- The HUD and lobby read *server-authored* `matchView().controlPoints`. Each point contains `id, x, z, owner, capturing, progress, contested`. `progress` is 0–1.
- The score and win state are authoritative in `match.teamScores` and `match.phase`.
- Bots receive objectives from the same array, so moving a point in a future map also moves their navigation goal.

New map designers only need to select reachable capture positions and ensure paths from each team spawn to A, B and C. The backend capture/scoring and Online random-match protocol require no redesign.

## Tests and deployment

- `tests/duelist-control.test.mjs`: neutral points, capture, contest, takeover, dead-player exclusion, 1% / 2% rates, score cap at 100, map-position injection.
- `tests/duelist-server.test.mjs`: Online server-only random mode selection, rejecting quickplay server-ID overrides, and networked objective state.
- `scripts/verify-duelist-ui.mjs`: checks Duelist JSX syntax and relative source imports independently from the separate Game 3D build.
- `.github/workflows/duelist-adventure-check.yml`: runs these tests on GitHub pushes.

Deployment is a separate step. The repository code does **not** by itself publish the Base44 front end or run the match server. Keep client and server on the same `PROTOCOL` version, currently **3**.
