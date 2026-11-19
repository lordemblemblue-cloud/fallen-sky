# Duelist Adventure match server

The authoritative server for online Duelist Adventure (duel, free for all, team deathmatch, capture the
flag). Practice stays in the browser.

- **One Node process, many matches.** Every match is `src/components/duelist/sim/match.mjs`, the same rules
  the browser practises with, stepped at 60 Hz. The server decides every hit, every cooldown and every
  score; each player gets 20 snapshots a second.
- **Players only send commands** (`input` messages: movement, facing, button presses). Input is checked
  (`net/protocol.mjs` `sanitizeInput`: move clamped, only known commands), button presses go through a token
  bucket (`core/fairplay.mjs`: 14 a second, bursts of 6), and a connection sending more than 90 messages a
  second is closed. One connection per account.
- **Join.** `join { mode }` puts the player in the busiest match of that mode that has room, taking a bot's
  seat (the lowest-scoring bot of the team that needs a player), or starts a match filled with bots.
  `join { mode: 'any' }` picks the busiest match of any mode that has players in it. A leaving player's
  seat goes back to a bot. A finished match starts again 12 s later with the same players.
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

## Deploying (not done; needs the owner's go-ahead)

A Railway service (or any Node 20+ host) running `node server/duelist/index.mjs` from the repository root,
one replica (matches live in memory), with `BASE44_APP_ID` and `DUELIST_ALLOWED_ORIGINS` set; then set
`VITE_DUELIST_WS_URL` for the web build.

## Not yet

- Client-side prediction: the browser shows the server's state 100 ms behind (smooth, but your own moves
  arrive one round trip late on a distant server).
- Reconnecting to the same seat after a dropped connection; results saved to accounts.

Tests: `node --test tests/duelist-server.test.mjs` (from the repository root).
