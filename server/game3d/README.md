# Game 3D Dedicated Duel Authority — Combat Foundation 3.1

**Deployment status:** Standalone, opt-in implementation. Not connected to live DuelSystem hit submissions, not merged/deployed automatically, and not suitable for ranked games yet.

## Architecture

One Node.js WebSocket process owns each duel in **one mutable in-memory simulation**. The service runs a single 50ms tick loop and broadcasts a snapshot at most every 100ms, plus ordered combat events. No Base44 SDK database writes are made during the simulation.

The match receives TWO authenticated, short-lived admission tickets (one per duelist) from `game3dCombatTicket`. HMAC ticket claims contain the authenticated account, the active DuelSession ID, the server-read duel pair, and the duel stat snapshot. A claim is signed on the Base44 backend, verified by the Railway instance, and one-time-use. The sender may never pass an arbitrary user ID in its movement/command packets.

Movement comes from **directional input** (normalized X/Z and facing), not from browser-uploaded world coordinates. The worker advances authoritative X/Z each tick at a bounded speed, caps a dodge burst and handles a time-limited dodge invulnerability. The current prototype uses a bounded flat 2D arena. It does **not** contain the Wolfveil/12 Sky world collision mesh, vertical terrain simulation, mounted flight, or a navmesh.

Combat owns server-side basic and skill cooldowns, one-cast Will/stamina costs, held guard stamina drain, dodge immunity, AEGIS shield duration/durability, three-hit combo indices, server-clock skill charges, and result history. Each incoming command has one ordered intent sequence and unique receipt ID; replaying the same command returns the same result. The damage roller is **bundled from `base44/shared/axePowerBudget.ts`** (the same AXE formulas used by the existing GameWorld3D duel backend), not a copied or arbitrary new damage model.

The current dedicated match does **not** award account Duel Mastery or transmit a match result to Base44; that requires a future authenticated result settlement and exactly-once persistence contract. Competitive charged bonuses remain disabled because no server-owned mastery attestation has yet been handed to this worker.

## Private environment settings

**Railway dedicated process** (must be ONE replica until a coordinated match allocator exists):

- `GAME3D_COMBAT_SECRET`: identical random 32+ character secret on both the Base44 function and Railway, NEVER prefixed `VITE_`.
- `GAME3D_ALLOWED_ORIGINS`: comma-separated exact origins such as `https://example-game-domain.com`; no wildcard.
- `PORT`: assigned port supplied by the platform.

**Base44 function `game3dCombatTicket`**:

- `GAME3D_COMBAT_SECRET`: the matching private secret.
- `GAME3D_COMBAT_WS_URL`: public `wss://your-dedicated-host.example/game3d-duel` URL.
- `GAME3D_COMBAT_AUTHORITY_ENABLED=true`: only when a safe opt-in preview deployment is intended. Otherwise ticket issuance fails closed with HTTP 503.

Do **not** put the signing secret or any Base44 service-role token in the Vite/browser bundle. The gateway validates browser origins at the WebSocket upgrade; signed tokens are still required.

### Build from full repository checkout

```sh
cd server/game3d
npm install
npm run build
npm start
```

Railway: use the **full repository source**, set the working/build directory to `server/game3d` while keeping `../../base44/shared/axePowerBudget.ts` accessible to esbuild, install dependencies in this package, and run the start command. The `prestart` script compiles the shared TypeScript combat budget with esbuild for Node 20. Provide health check `GET /health`. The gateway accepts authenticated WebSocket upgrades only on `/game3d-duel`.

## Opt-in client API (not automatically mounted)

`src/components/game3d/social/dedicatedDuelClient.js` exports `connectDedicatedDuelPreview(duelId, handlers)`. It obtains its own authenticated ticket through the existing Base44 function transport, starts the WebSocket, and exposes:

```js
const duel = await connectDedicatedDuelPreview(duelId, {
  onSnapshot: snapshot => { /* render the isolated server arena */ },
  onEvents: events => { /* show server-confirmed effects */ },
  onClose: () => { /* reconnect with a new one-time ticket */ },
});
// Wait for the 'welcome' message before sending controls.
duel.setMovement({ x: 0, z: 1, facing: 0 });
const result = await duel.sendCommand('basic', { weaponPath: 'damage' });
duel.close();
```

Accepted commands: `basic`, `guard` (`held: true/false`), `dodge` (`x,z`), `shield`, `charge_begin` (`skillId, weaponPath, chargeId`), `cast` (`castId, skillId, weaponPath, optional chargeId/chainFromCastId`), `skill_hit` (`castId,hitIndex,weaponPath`). Movement uses `input` with an increasing input sequence, normalized X/Z and facing yaw in radians.

**Do not route live GameWorld3D attacks to this server while Base44 DuelSystem also processes them.** There is no automatic client-side routing toggle in this PR, by design. The two systems must not independently deal damage to the same duel.

## Known limitations and next cutover work

- Authority lives in the **memory of one Node process**; process restart or Railway replica replacement loses the match. Not persisted, not replicated, not crash-safe.
- The entry state is a signed **server-read DuelSession snapshot**, but character stats and equipment may still originate from earlier client-generated duel builds (albeit clamped). A real character-equipment/progression attestation is still needed.
- No terrain collision/navmesh integration, anti-wallhack visibility or world-scale model replication. The server prevents **client position teleports** by integrating directional input, but a modified client could still supply malicious input timing within admitted limits; proper authoritative account equipment and server clocks are prerequisite for ranked PvP.
- No persistence of winner/loser, mastery XP, Echo Chronicle, rewards, player inventory, or AEGIS shield back to Base44. No matchmaking allocation, migration on restart, or cross-node ownership lease.
- Tickets are one-use and expire in 30 seconds. On disconnect, a participant can obtain a new ticket while the active DuelSession still exists; an empty match is retained for 180 seconds then deleted.
- Need a verified duel activation handoff, shared input/camera projection, authoritative result settlement, stable reconnect identity, durability and progress migration. Until that is done, **the existing Combat 3.0 Base44 duel remains the live authority**.
- Client-side skill mastery and mount/soul-companion abilities are not switched over to this worker. The new match simulates the basic duel skills and AEGIS/guard/dodge only. The only supported physical environment is the small bounded 2D arena; this is not a complete Game 3D world engine.

## Deferred tests

`npm test` has deterministic test source in `server/game3d/tests/` for actor-ordered moves, inputs, shielding, dodge, charge/combos, idempotent network replay and signed tickets. **Do not claim it has been executed**; the owner asked to defer testing to beta. Separate deployment staging, 2-client live tests and side-by-side balance parity review are still needed.

The next milestone must deliver a real cutover protocol with exactly-one authority per match and a durable, authenticated, idempotent outcome sink.

## Combat Foundation 3.2 — consensual handoff and persistence

The 3.1 opt-in-only restrictions above still explain the original worker, but 3.2 adds a **mutually approved, feature-gated live handoff** and signed Base44 settlement.

- The `DuelSystem` frontend shows a **Use dedicated server** consent button only when `VITE_GAME3D_DEDICATED_OPTIN=true`. Both duelists must approve. While preparing, normal Base44 combat pauses; either duelist can cancel. Preparing approvals expire after 45 seconds.
- `duelSystem.request_dedicated` needs `GAME3D_COMBAT_HANDOFF_ENABLED=true`. The ticket issuer and signed reporting endpoint additionally need `GAME3D_COMBAT_AUTHORITY_ENABLED=true`.
- Railway worker now **requires** `GAME3D_COMBAT_REPORT_URL=https://.../game3dCombatReport` (the full deployed HTTPS function invocation endpoint). Both services require the same private `GAME3D_COMBAT_SECRET`; the worker still requires `GAME3D_ALLOWED_ORIGINS`, one replica and a secure WebSocket URL.
- Each worker-owned checkpoint is HMAC signed and sent about every 2 seconds; a stable terminal result ID provides idempotent settlement. Only matching dedicated-epoch reports may write finished HP/winner/loser state. Reconnect tickets include the last saved checkpoint.
- An unjoined match times out after one minute, and a finished match retries backend settlement. If reporting is not confirmed, neither player should assume a persistent victory.
- Normal duels do not switch to the worker unless both consent. No fallback to old damage RPC once a duel is handed off.
- **This does not yet solve transaction-safe Base44 handoff votes, world collision/animation synchronization, or durable atomic winner/XP commits.** It remains an opt-in beta implementation; do not enable ranked stakes.

See `docs/game3d/COMBAT_FOUNDATION_3_2.md` for the deployment order, risks and deferred beta scenarios. Neither code execution nor Railway deployment has been performed as part of this pull request.

## Combat Foundation 3.4 — explicit Wolfveil map collision preview

The opt-in dedicated worker now supports the **private** `GAME3D_COMBAT_MAP_ID=wolfveil-v1` on **both** Base44 duelSystem and the worker. This mode uses the live Wolfveil authored building footprints and terrain-height formula at the renderer's +70m Z offset. Movement and strike line-of-sight must pass through the worker's static map collision checks. Ticket checkpoint binding and worker reports preserve the same map ID across reconnects; absent/mismatched map configuration is refused instead of silently using flat collisions.

This does not include live house GLBs, stairs, bridges, arbitrary world regions, or a trusted map instance/spawn allocator. Default is still no map configuration and preexisting circular arena behavior. See `docs/game3d/COMBAT_FOUNDATION_3_4.md`. Automated tests and live deployment remain deferred until beta.

## Combat Foundation 3.5 — instance fence and optional terminal delivery journal

Set `GAME3D_COMBAT_INSTANCE_BINDING_ENABLED=true` **only in isolated staging** on both Base44 and the worker to bind an immutable per-duel arena ID to the handoff and restore ticket. In map mode, also configure Base44's private `GAME3D_COMBAT_MAP_FINGERPRINT` to match the worker collision fingerprint computed from geometry; a mismatch refuses admission. `GET /health` reports the current map fingerprint.

An optional **persistently mounted private** directory `GAME3D_COMBAT_SETTLEMENT_OUTBOX_DIR` adds a fsynced terminal-result queue. On restart the single worker retries unsettled finals instead of silently restoring a potentially completed match. This is not exactly-once database commit; see `docs/game3d/COMBAT_FOUNDATION_3_5.md`. No production flags were enabled and tests remain source-only, unexecuted until beta.
