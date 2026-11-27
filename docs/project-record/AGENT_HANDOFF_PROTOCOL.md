# Agent hand-off protocol: ChatGPT, Claude, Gemini and other approved agents

Written 2026-11-27 by the project-recovery session, as part of the owner's recovery directive (§13). It builds on what the repository already uses:

- the root [AGENTS.md](../../AGENTS.md): guest-only entry, Base44 rules, the 2026-11-26 story-driven terrain hand-off;
- the [WebGPU agent hand-off](../webgpu/AGENT_HANDOFF.md): ownership announced in draft PRs, one agent per file, evidence with every commit;
- the story-side gates in [R112](../game3d/threads-of-our-pain/R112_PRODUCTION_READINESS_AND_AGENT_ACCEPTANCE_GATES.md) §2 and §7, and the [terrain hand-off](../game3d/threads-of-our-pain/CLAUDE_TERRAIN_HANDOFF.md);
- the per-feature hand-offs in `docs/duelist/*_HANDOFF*.md` and `docs/game3d/*_HANDOFF_*.md`.

It applies to Fallen Sky (Game 3D), Duelist Adventure and Fantasy Battle, which all live in `lordemblemblue-cloud/fallen-sky`.

## 1. What is authoritative

1. **The repository is the record.** A decision, design or result that lives only in a chat is not yet part of the project. Commit it (docs PR) or ask the owner to.
2. **Where things are written:**
   - [docs/project-record/](README.md): per-game development records, the backlog, work packages, missing-information requests and completion reports.
   - Story canon for Fallen Sky: [docs/game3d/threads-of-our-pain/](../game3d/threads-of-our-pain/README.md). Its precedence rules (R85, R86, R111, R64A/R65, R76A, R84) stay in force.
   - Per-feature write-ups: `docs/game3d/`, `docs/duelist/`, `docs/fantasybattle/`, `docs/webgpu/`, `docs/security/`.
   - Tasks and evidence: GitHub pull requests and issues of `lordemblemblue-cloud/fallen-sky`.
3. **Conflicting instructions:** the latest instruction the owner explicitly approved wins; compatible earlier requirements stay (owner directive §2). An agent's draft is never an approval, however detailed. When a record cannot tell which instruction is later, it lists both with their sources and asks the owner.
4. **No agent knows what another agent did unless it is written down.** A ChatGPT conversation does not notify Claude; a Claude session does not notify ChatGPT or Gemini. Never claim another agent was told something without an actual hand-off: a commit, a PR comment, an issue, or the owner relaying it.

## 2. Who decides what

| Party | Decides or does | Never does without the owner's explicit approval |
|---|---|---|
| Owner | Scope, canon, design approval, asset approval, merges, Base44 publish | (all approvals are the owner's) |
| ChatGPT (project manager / reviewer / story drafter when the owner asks) | Audits the repo, drafts story and design packets, writes acceptance criteria and issues, reviews evidence | Merging, publishing, marking a draft as owner-approved |
| Claude Code (implementation lead when dispatched: the owner's local sessions, coordinated by the hub session) | Implements approved, complete work on its own branch, writes tests, opens PRs, reports evidence; owns terrain blockout and implementation for story-driven world work (AGENTS.md, 2026-11-26) | Pushing `main`, merging, publishing, inventing story or mechanics |
| Gemini (research and comparison pilots when separately authorized; R87B, R112 §2) | Reference research, alternative previews for comparison | Editing a region another agent is editing; presenting its stat formulas or lore as canon (mark them as proposals with sources) |
| Other approved agents (Codex, Cursor, Copilot and similar) | Work on a named branch and PR inside an assigned file set | Same limits as Claude |

Ownership by area (from the existing hand-offs; change it only with the owner):
- Fallen Sky world geometry, terrain, caves, dungeon blockout: Claude (AGENTS.md 2026-11-26; CLAUDE_TERRAIN_HANDOFF.md). The story side supplies dialogue and location constraints only.
- Fallen Sky story text, quests, NPC phases: owner plus the narrative drafter (the R-series and NPC-phase docs). Implementation of approved quests goes through the existing quest architecture.
- Fantasy Battle map/environment design and character visual design: their assigned agents and approved hand-offs (owner directive §6). Others prepare integration points only.
- New animations for any game: the local RGB MoCap → Cascadeur → Blender pipeline (owner directive §14; animation-studio spec 2026-11-27). Placeholders never count as finished assets.

## 3. Before you start

1. Read root `AGENTS.md`, this file, the game's record in `docs/project-record/`, and the backlog row you are taking.
2. Fetch `main` and check that the work is not already done or in an open PR (search PR titles and branches; the record's "superseded" and "in progress" rows).
3. Check the row's status. Only **Implementation-ready** packages may be built. **Awaiting information / assets / approval** rows are not to be filled in by guessing.
4. Announce ownership: open a draft PR (or comment on the issue) naming the branch and the files you will touch. One agent per file set; coordinate before editing a shared hot file (for example `src/components/game3d/GameWorld3D.jsx`, `src/pages/GameView.jsx`, `AGENTS.md`, `docs/game3d/threads-of-our-pain/README.md`).
5. Work on a new branch from current `main`. Never switch branches in a checkout another agent uses.

## 4. While working

- Implement only what the source defines. When something important is missing, stop that part, write a request in [MISSING_INFORMATION.md](MISSING_INFORMATION.md) format, and continue with unrelated complete work (owner directive §4).
- Do not resolve intentional story mysteries, reveal concealed identities, add relationships or change motivations (directive §5).
- Preserve working functionality. Put risky changes behind a flag or preview route, as the repo already does (`?threeRoads=1`, `?gearTiers=1`, the production "Coming Soon" gate for Fantasy Battle).
- Keep the security rules in AGENTS.md: guest-only entry, server-side authorization for restricted gameplay and economy, no service-role bypass, no secrets in `VITE_*`.

## 5. Hand-back record (required for every hand-off)

Put it in the PR body, and for multi-session work also in `docs/project-record/handoffs/YYYYMMDD-<agent>-<topic>.md`. Use these headings (owner directive §13):

```
Project / feature:            (game, backlog ID, work package ID)
Branch / head commit / PR:
Completed:                    (what now exists, with file paths)
Approved:                     (which parts the owner approved, and where: message date, PR comment, doc)
Left incomplete:              (and why)
Next step:
Files changed:
Decisions to preserve:        (with sources)
Assets required:              (owner, provenance, licence)
Unresolved dependencies:
Tests performed:              (exact commands, environment, raw pass/fail counts; "NOT RUN" when not run)
Live / visual checks:         (route, device, renderer, what was seen; "NOT RUN" when not run)
Remaining problems:           (known bugs, regressions, risks for multiplayer and other games)
Missing information filed:    (request IDs in MISSING_INFORMATION.md)
```

## 6. Evidence rules

- "Verified" needs executed tests whose output you saw, plus a live check for anything visual or interactive. Screenshots alone or a desktop-only check are not verification (R112 §7).
- "Implemented" means merged to `main`. Code on a branch is "In progress" or "Awaiting approval".
- Untested code is "Testing required", never complete. Claims copied from a PR body stay unverified until someone re-runs them; say who ran what.
- Compare test failures with a baseline run on the same `main` before calling something a regression (the suite has known failures; see the testing section of [BACKLOG.md](BACKLOG.md)).
- Never invent numbers (FPS, coverage, percentages). Percentages in [COMPLETION_REPORTS.md](COMPLETION_REPORTS.md) come from counted inventories with the method written next to them.

## 7. After the owner answers a missing-information request

1. Commit the answer (or the exported conversation excerpt the owner points to) to the right doc, with the date and "owner-approved".
2. Change the request's status in `MISSING_INFORMATION.md` to "Answered (date, where)".
3. Move the dependent backlog rows to "Implementation-ready" and update the work package.
4. Resume from the recorded checkpoint; do not restart the feature.

## 8. Agent-specific notes

- **ChatGPT:** the repository is public; read it on GitHub. When writing story or design packets, mark each as draft until the owner approves it, keep the stable IDs (R61), and add the packet to the index README the docs already use. A packet that changes canon must name the affected IDs.
- **Claude Code (local):** follow the hub session's brief; worktrees under `C:\Users\marcu\.copilot\repos\fallen-sky-worktrees\`; commit as the repository owner identity the hub gives; push only your branch; never push `main`; report the branch head and compare link to the hub. The machine runs Windows: no `python`, CRLF sources, junctioned `node_modules`.
- **Gemini:** cite every reference; flag formulas and lore that are guesses; return comparison material as files the owner can review, not as edits to another agent's region.
