# Game 3D faction governance and chat — agent handoff (2026-11-20)

Owner request: add a **Faction** tile to the world Escape drawer, inspired by the political and territory-war progression of Twelve Sky 2. Keep the game’s original factions `AXE_Faction_1`, `AXE_Faction_2`, `AXE_Faction_3`; do **not** import names, game assets, or copyrighted artwork from another game.

## What is in this UI branch
- Gold/liquid-glass Escape drawer, green scrollbar, seven category tiles and large touch-friendly page tiles. Redundant `Game Menu` back control and `Main Menu` settings navigation removed.
- Editable and persistable keyboard bindings for service shortcuts and common movement actions; protected reserved combat/system keys.
- Read-only Faction overview: each faction's **live member count**, **online count**, **collective verified gear power**, **leader**, **vice leaders**, and **server-awarded map objective bonuses**.
- World/Party chat unchanged through their original server route. Clan button opens the existing clan conversation. Regular/nearby and faction broadcast channels are visually present **but disabled** until server support exists. Combat log is local, bounded and records actually resolved hits, misses and damage taken.
- Optional faction announcement ticker and short sound: only listens to a server-backed read endpoint; default **OFF** unless `VITE_GAME3D_FACTION_ANNOUNCEMENTS=true` is supplied at build time.
- Unit tests for keybind validation, faction model, announcement authorization, combat logging and UI structure.

## Server APIs required before turning on faction governance
Current browser clients do **not** have authority to appoint vice leaders, record votes, post global announcements, or award buffs. The frontend's `callGameServer('factionSystem', action, data)` is an API contract, **not** proof that the backend exists.

### Reads
- `action='overview'`: `{factions:[{id,online,members,power,leader,deputies,bonuses,votingOpen,electionEndsAt}]}`. All counts, powers and bonuses are computed from authoritative session, character, equipment and objective tables. Missing values should be `null`; never substitute local roster counts.
- `action='latest_announcement'`: `{announcement:{id,factionId,authorized:true,senderRole:'leader'|'vice',senderName,text,expiresAt}}`. Server filters to requesting character's faction, approves sender rank and enforces a short expiry. UI ignores all other data.

### Mutations (future work; do not expose buttons until ready)
- `nominate`, `vote`: server verifies active character, faction membership, vote eligibility and exactly **one vote per eligible character per monthly election**. UTC schedule and tie rules explicitly defined by server. Audit log retained.
- `appoint_vice`, `remove_vice`: server verifies caller is the **current elected leader** of the same faction, bounded vice slots, term-bound authority and no privilege escalation.
- `send_announcement`: server verifies caller is current leader or vice, faction membership, message length, sanitization, block/report policy, cooldown, moderation and faction-only delivery. Ignore any role/faction IDs submitted by the browser.
- `objective_result`: accepts only authenticated world/PvP/PvE outcomes from authoritative world logic, not browser-supplied kill counts or gear power. Award faction-wide XP/kills/other bonuses with explicit start/end and caps; expire them safely.

### Chat channels
- **Regular / Nearby**: server-filtered area or proximity chat, currently unavailable.
- **World**: existing `worldChat` server route; remains functional.
- **Clan**: existing clan chat/overlay and server permissions; remains functional.
- **Party**: existing private party channel; remains functional.
- **Faction Call**: new rank-verified server channel shared by leader and vice leaders; disabled until implemented.
- **Combat**: local observational log, NOT server authoritative and never a source of rewards.

## Security and testing
- Follow root `AGENTS.md`: guest-only entry, preserve server permission checks, do not enable public service-role bypasses. New server route requires a proper signed/session character identity and membership checks.
- Rate-limit and audit votes/announcements; never rely on a boolean `isLeader` from the client. Persist elections and bonuses, handle reconnections and player transfers.
- Browser verify desktop/mobile touch tiles, green scrollbar, scrolling ticker, screen-reader announcements, reduced-motion handling, input capture during rebinding, and that ESC closes without stray movement.
- Existing automation/other agents may edit `GameWorld3D.jsx` or `GameView.jsx`: coordinate commits and rebase carefully before merge.
- No automatic merge, deploy or backend activation in this branch.
