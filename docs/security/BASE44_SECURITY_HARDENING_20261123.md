# Base44 security hardening — 2026-11-23

## Scope
App: `AtomxEveGames` (`fallen-sky` repository). Covers the shared site, Fallen Sky, and Duelist Adventure code. This is **not** a full penetration test and does not establish that the published app has zero vulnerabilities.

## Confirmed issues addressed
1. Eight Base44 clan/party entity schemas previously contained nine operations with `rls: null` for create, update, or delete. Those public direct writes now require admin authority while previously restricted owner rules remain intact.
   - `ClanFormMessage`: create
   - `ClanInvite`: create
   - `ClanChannel`: create and delete
   - `ClanFormTopic`: create
   - `Party`: update
   - `PartyEvent`: create
   - `ClanFormChannel`: create
   - `ClanEvent`: update
2. `ClanInvite.read` is limited to inviter, invitee, or admin. `PartyEvent.read` is limited to target user or admin.
3. `clanMembershipNotifier` accepted unverified caller-provided `old_data` for deleted membership rows, enabling forged member-leaving announcements. Deleted-member announcements now fail closed until a signed automation event can be verified. Successful join announcements must correspond to a current stored membership. Internal errors are not returned to callers.
4. `partyLifecycle` is publicly callable and previously allowed anyone to request service-role deletion of a stored party if it was empty. The cleanup action now requires a HMAC-SHA256 signature over `timestamp.body`; default behavior fails closed without an automation secret. It checks `x-party-event-time` (epoch milliseconds, within two minutes), `x-party-event-signature` (lowercase SHA-256 hex), `PARTY_LIFECYCLE_EVENT_SECRET` (minimum 32 characters), and the stored Party membership. **Existing unsigned automation calls will stop deleting empty parties.** Wire a trusted signing producer before re-enabling this cleanup; do not expose the secret in frontend code.
5. Production dependency audit initially found 7 advisories (1 high, 3 moderate, 3 low). Updated locked transitive versions: `follow-redirects` 1.16.3, `seroval` 1.8.2, `dompurify` 3.5.0. Removed unused `react-quill-new` (and its Quill dependency). The remaining two entries are moderate in `react-router@6.30.6` and `react-router-dom@6.30.6`; upgrading to v7 needs compatibility work for legacy Game3DHost/MemoryRouter and must not be forced blindly.

## Verification
- `npm ci` and `npm run build` completed successfully.
- `node --test tests/security-base44-access.test.mjs`: 4/4 tests passed.
- `npm audit --omit=dev --audit-level=high`: exit 0, **zero high and zero critical advisories**; two moderate advisories remain.
- New `.github/workflows/base44-security-check.yml` runs the RLS/event tests and fails on new high/critical production dependency advisories.
- A targeted local search found no common hardcoded provider key/JWT signatures in the checked application code; absence of pattern matches is not proof of absence of secrets.
- Base44 `prevent_iframe_embedding` was already on. `restrict_browser_features` was off; evaluate it against camera/microphone/game controls before enabling.
- The Base44 Security Scan API returned a truncated result while inspecting this large app. Detailed current scanner findings require review in Base44's Security tab; do not claim the scan is clean.

## Follow-ups / accepted limitations
- Two moderate React Router advisories require a separately tested upgrade or mitigations.
- Review public read access to clan chats/topics, roster details, party voiceRoomId, clan vault notes and any private-world data; these entities may be public by design, and blanket restrictions could break intended public browsing and multiplayer.
- Finish server-verified public guest multiplayer admission; do not re-enable deleted account login screens, do not grant service-role privileges to guests.
- Public `guestCharacterVault` uses a high-entropy recovery code and restricted entity writes, but production should apply durable rate limits and abuse monitoring to guest registration/recovery.
- Review the platform's detailed Security Scan findings after each deploy, and run independent authenticated/untrusted-user authorization tests before a public launch.
