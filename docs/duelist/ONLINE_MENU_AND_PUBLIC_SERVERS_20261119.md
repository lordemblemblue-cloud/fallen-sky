# Duelist Adventure — integrated Play menu, co-op and servers
Updated 2026-11-19

## Main menu (`/duelist`)
- The original cinematic left rail remains. Its new **Play** entry shows four mode selections on the right: Duel, Capture the Flag, Football, Team Deathmatch. There is no separate **Online** navigation item and no "Game Modes" header.
- A thin gold separator sits between the modes and the actual server list. Each server row shows mode, human occupancy, bot occupancy, status, and Join.
- An initially live server per mode is seeded by `server/duelist/server.mjs`. Joining a room replaces exactly one bot. When every slot fills, an extra server of that mode is created immediately. There is at least one available spare as long as the mode is full; empty overflow rooms can retire after 60 seconds if another room is open.
- The page reads real server data through `/lobby` rather than inventing server rows. If the match service is offline, the interface says so.
- Clicking a mode filters the server list; clicking it again restores all modes. A selected mode also offers an offline match with bots.
- The old secondary character preview card stays removed. Fleet Assault, Practice, Story Campaign, and Controls & Settings remain separate.

## Story Campaign — Contraband
- The Story Campaign menu now launches the existing `Contraband` mission instead of the old placeholder campaign.
- Solo play loads locally without a multiplayer server.
- Co-op supports 1–4 players with real shared mission progress and objectives.
- **Host Open Crew** creates an advertised crew (mode `story`, `create:true`, `open:true`).
- **Join Open Crew** finds an available public crew; selecting a specific listed crew passes its opaque ID.
- **Create Private Crew** creates an unlisted room with a five-letter code. **Join Code** requires that code; guessing an ID cannot admit a player to a private room.
- Returning from the game goes back to the original `/duelist` menu. The in-mission HUD displays the crew code and teammate status.

## Practice
- The oversized panel has been replaced by two stages:
  1. Choose **One on One**, **Infinite Practice**, or **Learn the Basics**, each with a short description.
  2. Choose a supported Game 2 training map and launch the actual training engine.
- Infinite Practice pre-enables the existing invulnerability toggle for the duel participants. Players can still toggle it inside the arena.

## Football
- A new Football mode is in the shared Duelist simulation: two bot-filled teams, a physical goal-scoring ball, and first to five goals (or the lead at eight minutes).
- Move to dribble; press **F** near the ball for a stronger kick. Server-authoritative ball physics and team goals are networked and rendered.
- Football here uses goals rather than American-football downs, possession, or tackling. Those more elaborate rules are not part of this initial implementation.

## Verification and deployment
- The CI workflow `.github/workflows/duelist-adventure-check.yml` runs Duelist server, co-op, combat, Football and web-build checks.
- GitHub source changes are complete. They are **not equivalent to publishing the Base44 web app or deploying the Node WebSocket match service**.
- A dedicated live host must run `node server/duelist/index.mjs`, with a permitted origin and authenticated access configured. The browser must be built with `VITE_DUELIST_WS_URL=wss://<host>/ws/duelist`. Until that is configured, only local/offline matches and solo campaign play can be used.
