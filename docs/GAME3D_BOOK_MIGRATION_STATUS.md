# Game 3D / Book (Adam + Eve) — migration and QA status

Updated 2026-11-12. Source snapshot pinned to `marcusflow1-arch/atom-x-eve-os` at `c073fc3be90b7013b1b5dae2da7f802b902675e2`. Destination: `marcusflow1-arch/gitsync-pro`, continuation branch `migration/game3d-book-adam-eve-20261112`. This is the Book / Adam + Eve project, **not** the separate racing `Game3.jsx`.

## Source-copy coverage (verified from Git tree IDs)

| Original directory | Imported | Status |
| --- | ---: | --- |
| `src/components/game3d/` | **922 / 922** | Exact source tree match (`2dfc5baea20e5683615f07505e6bbba264973afb`) |
| `server/game3d/` | **627 / 627** | Exact source tree match (`63f019d0385594a672791b63dc1333b0d1c51a11`) |

These counts establish Git-tracked *source-copy parity*, not build, networking, persistence, security, or gameplay correctness. The migration branch also includes GameView, several cross-app dependencies, and Base44 game-domain functions and entity schemas. Their completeness and runtime integration must be checked separately.

## Additional porting and release status

- Textual `public/game3d` and `public/models/characters` asset manifests have begun transferring. **Do not assume original binary assets are complete.** The source snapshot contains local GLB character models, mocap files, audio MP3s, and images that require authenticated byte-preserving transfer and hash verification; the GitHub connector used for this work cannot directly import private binary blobs.
- `scripts/import-game3d-book.mjs` exists to import the remaining code and assets from an authenticated source checkout. Audit its source pin and overwrite behavior before an automated re-run.
- `base44/functions` and `base44/entities` represent source definitions; they do **not** automatically migrate permissions, deployed endpoints, live player data, identities, or access-control policy.
- The dedicated Node `server/game3d` runtime cannot run automatically inside a TanStack Start / Cloudflare Worker app. Its hosting, endpoint configuration, persistence, authentication, and multiplayer ownership remain unverified.
- The destination dependency lockfile must be reconciled. No successful destination `npm install` / `npm run build`, signed-in Play, GLB rendering, movement/collision, character persistence, real two-client multiplayer, or backend authorization test has yet been established.

## Pull requests and merge safety

- PR #1 was merged on 2026-11-12 despite its incomplete-migration description.
- PR #2 was also merged on 2026-11-12 at 23:06:57 UTC, **despite the QA HOLD wording**. A merged GitHub PR does not establish that the destination app is production-ready.
- Subsequent commits are being made on `migration/game3d-book-adam-eve-20261112`; preserve them in a separate reviewable continuation PR and **do not publish or merge them into production until validation succeeds**. Reconcile new `main` changes before a future merge.

## Required verification before release

1. On an authenticated development checkout, import original private game assets without replacing newer destination customizations; use exact source commit, preserve file bytes, and compare hashes.
2. Run `npm install`, regenerate and commit `package-lock.json`, then `npm run build` and lint/tests. Resolve import graph, router compatibility, React/Three dependencies, and Cloudflare-specific failures.
3. Verify source manifests, public paths, actual Adam/Eve GLB rendering, skin materials, hair, physics, camera, animations, sounds, and 3D collision.
4. Configure and independently deploy the authoritative Node game server plus secure authentication, sessions, character saves, equipment/inventory, trade, quest, and two-client synchronization.
5. Verify destination Base44 application binding, entity permissions, secrets/separation, GitHub integration, and deployment logs before declaring the target app usable.
6. Perform signed-in Play QA. Only then consider merging a review PR and publishing.

**Current gate: SOURCE FILE COPY COMPLETE FOR TWO CORE DIRECTORIES; FULL MIGRATION AND DEPLOYMENT NOT VERIFIED.**
