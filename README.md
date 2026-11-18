# Game 3D / Book — Atom × Eve

This repository hosts the standalone Game 3D / Book experience: character creation and selection, factions, companions, mounts, quests, combat, and Wolfveil.

## Temporary guest mode (November 2026)

- `/` and `/gameview` launch the game directly without a login page or redirect.
- The login, registration, forgot/reset-password and MFA pages, their client-side flows, and the unrelated GitSync Pro dashboard have been removed.
- The character-selection screen is **part of the game** and remains intact.
- Character slots and local progression use the existing `__anon__` browser-local save namespace. Guest data is **not** account-backed or synced between browsers.
- Account-restricted server functionality (including privileged game APIs and account-based social/character operations) stays protected, and may be unavailable to guests. Do not remove authorization checks or expose service-role access to work around this limitation.
- A new account system can be designed and added when ready; do not silently restore the old registration/MFA flows.

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
```

App routes live in `src/routes`. The actual game is mounted by `src/components/game3d/Game3DHost.jsx` and `src/pages/GameView.jsx`; gameplay backend modules remain under `base44/functions` and `server/game3d`.

The existing migration notes are in [docs/GAME3D_BOOK_MIGRATION_STATUS.md](docs/GAME3D_BOOK_MIGRATION_STATUS.md); those are historical and may describe the old authenticated route setup.
