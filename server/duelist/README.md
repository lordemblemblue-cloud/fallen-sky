# Duelist Adventure match server

The authoritative server for Duelist Adventure's five public modes (Duel, Capture the Flag,
Football, Team Deathmatch and Three-Point Control) plus the Contraband co-op story mission.
The **Online** quick-match tile chooses randomly between Team Deathmatch, Capture the Flag and
Three-Point Control (Football and Duel are excluded). Practice and solo campaign play remain available in the browser.

- **One Node process, many matches.** Every match is `src/components/duelist/sim/match.mjs`, the same rules
  the browser practises with, stepped at 60 Hz. The server decides every hit, every cooldown and every
  score; each player gets 20 snapshots a second.
- **Players only send commands** (`input` messages: movement, facing, button presses). Input is checked
  (`net/protocol.mjs` `sanitizeInput`: move clamped, only known commands), button presses go through a token
  bucket (`core/fairplay.mjs`: 14 a second, bursts of 6), messages beyond 120 a second are ignored, and a
  connection sending more than 400 a second is closed. One connection per account.
- **Prediction.** A player's inputs are numbered and used one a tick, in order (none waiting: the last one's
  movement stands; a burst after a stall skips to the newest few, keeping every press). Each snapshot says
  which input was used last (`ack`) and, while the server is acting on that player's inputs, carries the
  player's own fighter in full (`own`, only ever to that player); the browser replays the inputs not used
  yet on top of it (`src/components/duelist/net/predict.mjs`). A page from before an update (an older
  `PROTOCOL`) is told to reload.
- **Public matches and auto-overflow.** At startup, one permanent bot-filled room is created for each
  of the four competitive modes. `join { mode, matchId? }` joins the selected live server, replacing
  one bot (the lowest-scoring bot of the team that needs a player). The server rejects invalid/stale/wrong-mode
  room IDs. When a room becomes full of humans, it immediately opens an additional bot-filled room. The last
  spare room is retained until another has space. A leaving player's seat goes back to a bot; an idle extra room
  is eventually cleaned up. A finished match restarts 12 s later with the same players. `join { mode: 'any' }`
  chooses the busiest room with people.
- **Crews (the story missions).** `join { mode: 'story', mission, create: true }` opens a private room and
  returns its five-letter code; `join { mode: 'story', mission, create: true, open: true }` hosts a new public
  crew, while `join { mode: 'story', matchId }` joins a selected publicly listed crew (private IDs cannot be
  joined this way). Friends join private rooms with `join { mode: 'story', code }` (whatever mission the crew
  plays), and `join { mode: 'story', mission }` finds an open crew playing that mission or starts one. Up to four
  people in a crew. The missions are `src/components/duelist/sim/mission.mjs` (`MISSIONS`: Contraband,
  Saltmarch), stepped like a match (the depot's people and the crew's allies are run here too); the `input`
  message carries the interact key. A room of your own is not in the lobby; an open crew is (with its mission).
  The mission waits while its room is empty (the room closes after a minute); 20 s after it is completed the
  crew goes on to the next mission in the story (the last one plays again). Wrong codes are slowed down (five,
  then a 30 s wait). The Join button (`any`) looks for a
  match, not a mission.
- **Reconnecting.** A dropped connection keeps its seat for 30 s (`RECONNECT_SECONDS`): meanwhile a bot plays
  it in a match, the mission's autopilot in a crew (a crew with nobody connected waits). Every `joined` carries a
  key; `hello { resume: { match, key } }` sits the player back down (a fresh key each time; an account's key
  never opens another account's seat, and a guest only ever gets a guest's back). Signing in afresh without a
  key gives up a seat the account left waiting. The server pings every 5 s and cuts connections that stop
  answering.
- **Sign-in.** Each connection signs in once with the player's Base44 token (checked with Base44, like the
  Game 2 arena server); the account id is the player's id.

## Run it

From the repository root (the server imports the game's rules from `src/`):

```bash
DUELIST_ALLOW_GUESTS=1 node server/duelist/index.mjs
```

The browser connects to `ws://localhost:5321/ws/duelist` when it runs on localhost, or to
`VITE_DUELIST_WS_URL` (a `wss://…/ws/duelist` URL) when that is set.

## Settings

| Variable | Meaning |
| --- | --- |
| `BASE44_APP_ID` | the app whose accounts may play (required unless guests are allowed) |
| `BASE44_BACKEND_URL` | default `https://base44.app` |
| `PORT` | default `5321` |
| `DUELIST_ALLOWED_ORIGINS` | comma-separated exact origins allowed to connect |
| `DUELIST_ALLOW_GUESTS` | `1` lets people in without an account: local testing only, never in production |
| `DUELIST_BOT_LEVEL` | `trainee`, `duelist` (default) or `master` |
| `DUELIST_PROGRESS_FILE` | Where each account's class EXP is kept: a JSON file on a disk that survives restarts. Without it, class levels last only while the server runs. |

## Deploying (not done; needs the owner's go-ahead)

A Railway service (or any Node 20+ host) running `node server/duelist/index.mjs` from the repository root,
one replica (matches live in memory), with `BASE44_APP_ID` and `DUELIST_ALLOWED_ORIGINS` set; then set
`VITE_DUELIST_WS_URL` for the web build.

## Not yet

- Results saved to accounts.
- A crew member who joins mid-mission meets the people already in the depot as they were manned for the
  smaller crew (later rooms are manned for the new size).

Tests: `node --test tests/duelist-server.test.mjs tests/duelist-football.test.mjs tests/duelist-predict.test.mjs tests/duelist-reconnect.test.mjs` from the repository root after installing the match server's dependencies. The `.github/workflows/duelist-adventure-check.yml` CI runs these alongside the combat/mission checks and the web build.

## Three-Point Control (backend ready; maps next)

Points A, B and C are neutral at round start. Stand uncontested in a point's four-metre radius
for four seconds to capture it; a contested point freezes capture progress. Ownership lasts until
another team completes a takeover. Zero or one points earn no score, **two points earn 1% per second**, and
**three points earn 2% per second**. First to 100% wins. Eliminations do not award capture score.
The server determines capture, ownership, percentages, and winner; clients only render the HUD and
placeholder markers. Future map layouts may pass `controlLayout: [{x,z},{x,z},{x,z}]` to
`createDuelistServer()` or `createMatch()`, with rematch persistence already supported. See
`docs/duelist/THREE_POINT_CONTROL_QUICKPLAY.md` for the full contract. Multiplayer protocol version is 3.

## Persistent public arenas

The hosted entry point enables continuous simulation for the permanent public room in each of the seven competitive modes. Empty overflow rooms still sleep and expire under the existing rules. Permanent rooms restart after the existing 12-second intermission, preserving their room ID. Set `DUELIST_CONTINUOUS_PUBLIC_ROOMS=0` to restore the prior idle behavior if host profiling shows an unacceptable CPU cost.

The online browser always displays one fixed 3D join card per official room, plus extra rooms confirmed by /lobby. Each card joins its exact room ID. Unknown counts are not fabricated while disconnected. These previews are schematic map views, not a live spectator feed. Visible room cards render at a capped frame rate; offscreen cards release their renderer and hidden tabs pause drawing. The authoritative service is independent of dashboard or browser lifetime. Production guest access, service hosting and the published VITE_DUELIST_WS_URL still require a secure deployment configuration; do not enable the local-only guest bypass on an unrestricted production host. The current server uses existing mode-specific capacities; 100-player rooms require separate load testing and capacity changes.
