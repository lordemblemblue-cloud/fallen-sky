# Emblem Blue / Game 3D — Passwordless Guest Cloud Saves

## Competition entry
The only public interface is the game. Both `/` and `/gameview` mount the existing Game 3D view; retired sign-in/registration routes are redirected to home. The **Start → Faction → Create Character → Select → Enter World** flow is game character creation, **not account login**. Keep it.

## Character recovery
- Player enters a character name and creates their character without a Base44 account.
- Cloud registration creates a **160-bit random recovery code** on the server and returns it once. A SHA-256 digest of the code is stored in the private `Game3DGuestCharacterSave` entity; the code is stored locally on that browser.
- Character selection has **Recovery code** (display/copy) and **Recover character** (name + private code).
- The active character remains playable from browser storage; cloud sync checks for updates every 20 seconds, flushes on checkpoint events, and retries when offline.
- A returning visitor on the same browser does not enter any code. Other devices require name + code.
- Names are **not** credentials and may be duplicated; the recovery code, not the name or IP address, grants access.
- Saves are protected by revision checks and a previous snapshot. The sync engine asks the player when both local and cloud copies diverge, instead of overwriting automatically.
- Guest delete uses a server tombstone before removing local saves. A local-only, never-registered character can be removed locally.

## Privacy and operational requirements
- The guest backend function `guestCharacterVault` is intended to be **publicly callable without Base44 sign-in**. It must run with server-side service-role access to the private entity, validate character ownership with the recovery code, and must never expose the entity directly through anonymous read/update permissions.
- **Set app visibility to Public and disable Require login to access in Base44's deployment settings.** Removing React login routes does not override platform access settings.
- Configure request/IP throttling or a WAF for anonymous registration/recovery endpoints before a large public launch. The recovery code is high entropy, but unauthenticated endpoints can still be abused for traffic/storage costs.
- Do not log recovery codes; do not share them publicly. Loss of both the original browser storage and the code makes self-service cross-device recovery impossible.
- Do not reuse the old account-backed `characterVault` authorization for guest endpoints. Server-rolled, account-privileged upgrades/social functionality remain protected and may not work for guests; do not expose privileged functions as a workaround.
- The new backend schema/function must be synced and deployed to the actual Base44 app linked to this GitHub repository. GitHub commits alone do not prove that deployment or anonymous invocation is enabled.

## Test checklist
1. Open the deployed root link in a fresh incognito browser: see Game 3D Start, no auth screens.
2. Create character, enter unique name, pick faction, verify the 3D game remains playable.
3. With cloud deployed, select character and open Recovery code. Copy it. Verify save status shows cloud confirmation.
4. Earn XP or change appearance, wait for save/checkpoint. Refresh same browser: character and progress remain.
5. Open another browser: choose Recover character and enter the same name + recovery code. Verify roster and stats come back.
6. Enter an incorrect code: server returns generic not-found, no character leaked or overwritten.
7. Simulate offline: local play continues and a status explains cloud is unavailable, then resync when online.
8. Change progress on two devices: conflict prompt appears; choose one copy, the other is not silently overwritten.
9. Delete a cloud-backed guest character: remote tombstone before local deletion; recovery should no longer succeed.
10. Confirm `/login`, `/register`, `/forgot-password`, `/reset-password`, `/mfa` do not render authentication UI.
