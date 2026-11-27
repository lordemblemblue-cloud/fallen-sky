# Fantasy Battle guest save recovery

The guest-only game entry policy remains in force. Save data is local to the browser. Existing plain JSON and AES-256-GCM encrypted portable backups continue to work. Encryption uses the existing PBKDF2-SHA256 implementation with a fresh random salt and IV; passwords are never written to storage or sent to a server.

## New checkpoint behavior

Each slot retains at most one previous valid record inside the same storage envelope. The active record and previous record are written together using the existing bounded localStorage write. No recursive history is retained. A previous checkpoint can survive a damaged current slot record, but cannot recover an entirely unreadable storage envelope, cleared browser data, or device loss. A storage quota failure leaves the current session in memory and the prior stored record intact; export a file or use another slot. The existing serialized slot stamp protects against stale confirmations; this is optimistic conflict detection, not a transactional cross-tab mutex.

Settings at the title screen allow recovery of the selected slot's previous checkpoint after explicit confirmation. The name, level and timestamp are visible first. The current slot is replaced only if its stamp has not changed since the preview. Valid current progress becomes the next previous checkpoint. Legacy records without previous history still load normally. Portable exports contain the active profile only, not the entire history.

During live exploration, the existing immediate transaction/region autosaves remain. Additional movement checkpoints occur at most every ten seconds when the player has moved at least one horizontal unit from the last checkpoint. No periodic save during battle, menus, unassigned slots, or renderer startup. Failed periodic attempts are throttled, and the existing conflict warning remains. Manual save confirmation captures the original character and destination slot and rejects a changed character or combat state.

## Cross-device boundary

On device A export an encrypted backup from Save/Load, transfer it privately, and on device B use Settings > Portable Save Backup with the original passphrase. Review the destination slot and confirm replacement. This is manual encrypted transfer, not automatic cloud synchronization. Actual background cloud synchronization requires a separately approved guest ownership/recovery mechanism, authenticated storage or an equivalent secure capability, rate limiting, revocation and conflict handling. Do not expose public Base44 save endpoints, use service-role bypass, or treat character names as identity. No login screen has been introduced.

## Validation

Previous placement head bb7005b passed Fantasy Battle adventure checks and Base44 security; shared Game 3D failed and WebGPU remained in progress at check time. New regression tests cover retained history, stale restore, damaged slot and movement interval. New head CI, lint, browser storage quota behavior and device transfer acceptance remain pending. No publish.
