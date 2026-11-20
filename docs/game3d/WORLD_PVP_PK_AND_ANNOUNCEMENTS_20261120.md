# Game 3D — world announcements and voluntary PvP / PK

## Gameplay rules
- PvE is the default. Open-world player damage requires **both combatants** to opt into PvP.
- Wolfveil Town and personal homes / apartments are always safe, regardless of either player's flag.
- Wolfveil south, west, east and north streamed wilderness areas are optional PvP. Opponents must be in the same loaded area and verified world instance. A PvE-marked player cannot be damaged, even in a PvP wilderness zone.
- Other dungeons and private instances default to safe until a trusted server zone configuration exists.
- PK credit is awarded only for a **server-verified lethal PvP receipt**. Announce each verified PvP kill and killing sprees at streak 3, 5, 10 and every 5 thereafter.
- Verified item acquisitions and cleared dungeons can appear in the centered gold-and-glass HUD announcements. The existing local loot pickup is separately labeled YOUR LOOT.

## Source
- src/components/game3d/pvp/WorldPvpRules.mjs — browser/server pure eligibility, safe zones and shared boundaries
- server/game3d/worldPvpAuthority.mjs — internal-only trust-gated reference authority, receipt deduplication, flag states and PK streaks
- src/components/game3d/pvp/WorldPvpControl.jsx — game UI flag preference; sends game3dWorldPvpFlagRequested and waits for game3dWorldPvpFlagCommitted, reverting to PvE without confirmation
- src/components/game3d/notifications/WorldAnnouncementFeed.jsx — read-only HUD; shows game3dVerifiedWorldAnnouncement events from verified transport and private local notices
- src/components/game3d/notifications/WorldAnnouncementModel.mjs — closed set of server event descriptions
- tests/game3d-world-pvp-and-announcements.test.mjs — safe zone, consent, trust, receipt and spree tests

## IMPORTANT: world combat deployment still requires integration
**Do not report multiplayer PK as active yet.** The current shared Game 3D world uses PlayerState/WebRTC for presence, while the existing dedicated combat authority handles duels; the game does not yet offer a trusted authenticated open-world player damage endpoint. The new server module is a fail-closed foundation, not a public endpoint or replica-safe database.

Next tasks for the world server:
1. Obtain verified player and instance identities and authoritative positions (including guest identity and residence boundaries). Never trust browser-supplied target, mode, position or event data.
2. Persist PvP flags and adjudicated fatal receipts transactionally, across host restart and multiple replicas. This reference authority uses memory only.
3. Apply shared safe-zone and dual-opt-in eligibility checks on **all** player damage actions: basic, bow, skill, AOE, companion, projectile, DoT and reflection. Do not use the client as damage authority.
4. Reply to verified flag requests using authenticated state; only after server acknowledgement dispatch game3dWorldPvpFlagCommitted to the UI.
5. After a trusted loot award or dungeon completion call commitAchievement; after verified fatal PvP adjudication call commitElimination. Send returned typed records to world subscribers as game3dVerifiedWorldAnnouncement. Browser events never grant rewards or PK titles.
6. Verify two live players: safe town, immunity of PvE-flagged participants, safe apartments, cross-region attacks denied, no forged kill/loot events, correct kill streaks, reconnect/replay protection and unchanged duel mechanics.

The UI can show local loot, zone entry and preference notices now. Global PvP / dungeon / reward notifications need verified server publication. Test with node --test tests/game3d-world-pvp-and-announcements.test.mjs plus lint and build.
