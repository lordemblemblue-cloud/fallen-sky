# Project record: Fallen Sky, Duelist Adventure, Fantasy Battle

The authoritative development record, backlog and missing-information report for the owner's three games, written 2026-11-27 as steps 1–9 of the owner's recovery directive (sent 2026-11-27; saved in the hub session's notes as `project-recovery/OWNER_DIRECTIVE_20261127.md`).

Baseline: `lordemblemblue-cloud/fallen-sky` `main` at **`ab03f50a`** (merge of PR #420, 2026-11-27 18:03 -0500). Everything below describes that commit unless a row names a branch or PR. While the record was being written, `main` moved to **`0b6ca52d`** (18:39): six of the seven hub-verified branches were merged and the War of Three Roads was kept switched off by the owner; then to **`9034ba14`** (18:49): Fantasy Battle's loot economy (#423) and the R143 fixture (#425). The records were updated for those changes, and the test counts were re-run on `0b6ca52d` (see [BACKLOG.md](BACKLOG.md) §Testing). The NPC-phase story docs (phases 57–67, PRs #424, #426–#433) were merged into each other as a stacked chain of docs branches and are **not in `main`** as of `9034ba14`.

## Files

| File | What it holds |
|---|---|
| [SOURCES.md](SOURCES.md) | Every source searched, what was found, and what could not be reached |
| [FALLEN_SKY_RECORD.md](FALLEN_SKY_RECORD.md) | Fallen Sky (Game 3D): story, quests and world first, then systems |
| [DUELIST_RECORD.md](DUELIST_RECORD.md) | Duelist Adventure |
| [FANTASY_BATTLE_RECORD.md](FANTASY_BATTLE_RECORD.md) | Fantasy Battle (Sapphire Adventure) and the games hub |
| [BACKLOG.md](BACKLOG.md) | The centralized backlog, in the directive's sections and statuses |
| [WORK_PACKAGES.md](WORK_PACKAGES.md) | Packages that can be built now, with dependencies and completion criteria |
| [MISSING_INFORMATION.md](MISSING_INFORMATION.md) | Requests to the owner, in the directive's format, grouped so connected questions are answered together |
| [AGENT_HANDOFF_PROTOCOL.md](AGENT_HANDOFF_PROTOCOL.md) | How ChatGPT, Claude, Gemini and other approved agents hand work to each other |
| [COMPLETION_REPORTS.md](COMPLETION_REPORTS.md) | Per-game status by area, with counted inventories and the counting method |

## Record categories (directive §3)

Each game record sorts items into: approved and implemented; approved and implementation-ready; approved but partially implemented; approved but blocked by missing dependencies; incomplete design; awaiting assets; awaiting user decisions; awaiting technical verification; superseded or rejected.

Rules used:
- A fully designed but unprogrammed feature is **implementation-ready**.
- Programmed but untested is **not complete**; it goes to "awaiting technical verification" or "partially implemented".
- **"Approved"** needs an owner statement or an owner merge. An owner merge is recorded as "accepted into main", which is not the same as approving every proposal inside the merged docs: several merged docs call their own content a proposal or draft, and the record keeps that label.
- Placeholders are never counted as finished assets.

## Source labels and verification

- **[code]** a file on `main`; **[doc]** a repo document; **[PR #n]** a pull request of `lordemblemblue-cloud/fallen-sky`; **[commit]** a commit; **[issue #n]**; **[note]** a Claude session's hand-over note in the hub's shared notes folder; **[mem]** a hub memory note (dated state; re-checked against `main` where the row says so); **[transcript]** a Claude Code session transcript on this machine.
- **checked**: the recovery session or one of its read-only readers opened the code on `main` or ran the test itself. **claimed**: stated in a PR body, doc or note and not re-run.
- Tests run for this record (2026-11-27, Node v26.13.0, Windows 11): `node --test --test-reporter=tap tests/` on `ab03f50a` = **3010 tests, 2851 pass, 159 fail** (43 s); on `0b6ca52d` = **3040 tests, 2884 pass, 156 fail** (44 s), with no new failing test and three that now pass (the two Three Roads tests, and one `duelist-server` quick-match test that passes when run alone on either commit). On `9034ba14` = 3104 tests, 2947 pass, 157 fail (the extra failure is the flaky `duelist-server` quick-match test). `server/game3d/tests/` and `server/game2/tests/` on `ab03f50a` = 1748 tests, 1610 pass, 88 fail (220 s). Per-file failures are in [BACKLOG.md](BACKLOG.md) §Testing.

## Precedence

1. The owner's latest explicit approval wins; compatible earlier requirements stay (directive §2).
2. For Fallen Sky story canon, the precedence rules already written in `docs/game3d/threads-of-our-pain/` (R85, R86, R64A/R65, R76A, R84, R111) stay in force; this record does not replace them.
3. Where this record and a newer commit disagree, the commit wins: update the record in the same PR that changes the state.

## How to update

Change a row's status in the same PR that changes the code or design, with the new source label. Owner answers to [MISSING_INFORMATION.md](MISSING_INFORMATION.md) are committed with their date and marked "owner-approved" (see [AGENT_HANDOFF_PROTOCOL.md](AGENT_HANDOFF_PROTOCOL.md) §7).
