# Game 3D / Book — Atom × Eve

This is the standalone **Game 3D / Book** destination for the original **Adam and Eve** models, character creation, factions, companions, mounts, Halo/Wings, quests and Wolfveil world.

**Migration branch status: incomplete; not deployed.** See [Migration Status](docs/GAME3D_BOOK_MIGRATION_STATUS.md). The original source lives in the private repository `marcusflow1-arch/atom-x-eve-os`; this repository is the separate TanStack Start destination, so its existing Cloudflare/Base44 authentication and server bootstrap must be preserved.

## Complete the original game source import

From a clean checkout of the `migration/game3d-book-adam-eve-20261112` branch, with the GitHub CLI authorized to clone the private source:

```bash
npm run migrate:game3d -- --apply
npm install
npm run build
```

The import script follows the original Game 3D client imports and copies the Node game server, relevant Base44 backend modules and local Adam/Eve GLBs, while excluding unrelated game pages. It records any remaining cross-app imports for review.

The authenticated home route is Game 3D / Book, not the old GitSync dashboard. The old GitSync-only page routes are removed **on the migration branch**. The root document, sign-in flow, and TanStack Start infrastructure are intentionally retained.

**Important:** A code copy is not a transfer of live player records, secrets, backend credentials, or the running standalone game server. Verify Base44 destination connection, server deployment, asset loads, character/account isolation, and two-client signed-in Game 3D Play before merging to `main` or publishing.
