# Duelist Adventure: main menu and permanent public matches (2026-11-19)

## Player-facing entry
- The existing `/duelist` main menu preserves its left-side rail and cinematic background.
- The old secondary selected-character card is removed.
- The visible game branding is **Duelist Adventure**, without the legacy label.
- **Game Modes** exposes Duel, Capture the Flag, Free For All, and Team Deathmatch. Each mode's **Play Against Bots** starts the new Duelist combat engine at `/duelist-next/play`. **Find Online Server** opens the expanded server browser.
- **Online** replaces the main rail with a full-width browser; **Back to main menu** restores the previous rail section.
- The Online filters are **All**, **Team Deathmatch**, **Free For All**, **Capture the Flag**, and **Duel**. The browser lists only rooms returned by the actual `/lobby` endpoint and displays humans, bots, capacity, and joinability. Clicking a row joins that exact server ID.
- Fleet Assault, Practice, Combat Training, Story Campaign, and Controls & Settings remain independent options in the original menu. Fleet Assault is preserved for further work.
- Games launched from the original `/duelist` menu return to `/duelist` with their **Menu** button.

## Server behavior
- `server/duelist/server.mjs` automatically creates one permanent, public match room for each mode in `ONLINE_MODES` (duel, ffa, tdm, ctf) at server initialization.
- Each starts with a full roster of bots. Server-authoritative `joinMatch` substitutes a human for one bot; `leaveMatch` substitutes a bot for the departed human. Fair-play input limits and match rules are unchanged.
- Permanent public rooms remain discoverable even without connected players, are exempt from idle-room cleanup, and start a new round after a completed match. Extra rooms are still possible if existing ones fill.
- Public `/lobby` includes `publicRoom` metadata and does not expose player IDs or credentials.
- The join protocol optionally includes a selected `matchId`. The server rejects stale, mismatched, or invalid IDs instead of silently joining another room.

## Activation and verification
- Deploy the existing dedicated Duelist match server from `server/duelist/index.mjs` and configure the browser's `VITE_DUELIST_WS_URL` to its WebSocket endpoint. Until then, the browser accurately reports server unavailability; it does **not** fabricate active servers.
- Existing match admission still requires a valid Base44 account token, or an explicitly configured guest-capable server. Guest mode is currently documented for local testing, so production identity/admission configuration needs review.
- Regression coverage was extended in `tests/duelist-server.test.mjs` for the four startup rooms, bot occupancy, exact room join, one-bot-per-human replacement, invalid/stale selections, and public/private room separation.
- These repository changes were committed to GitHub; no claim is made here that they were deployed, manually play-tested, or that automated tests have run.
