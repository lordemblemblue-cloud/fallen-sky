# Base44 security hardening — consolidated report
Date: November 23, 2026
Scope: AtomxEveGames / Fallen Sky / Duelist Adventure (shared Base44 app).

## What was fixed

### Database access control
- Replaced nine anonymous create/update/delete permissions with authenticated/admin restrictions across eight clan/party entity types.
- Restricted invitations and party-event reads to the intended participants or admins.
- Prevented direct promotion/self-escalation: ClanMember updates are admin-only. The clan leader's authenticated backend promotion operation accepts only the 'member' and 'officer' targets, performs a verified clan lookup and uses a server-only update.
- Avatar progression fields (level, experience, influence, badges, equipment, unlocked abilities, companions) require a privileged create/update. Avatar ownership is immutable by regular users. The authenticated appearance server can initialize the level/experience, and the authenticated equip server handles equipment mutations. No direct browser progression update should succeed.
- Prevented clients from changing author/user/clan/topic/channel identity fields of ClanFormMessage and user/avatar identity fields in AvatarObservationSettings.
- Restricted ClanMessage, ClanFormMessage, ClanFormTopic, and ClanFormChannel reads to service-role/admin backend flows. The chat API validates the caller's clan membership and channel role; the frontend no longer reads/subscribes to sensitive chat records directly. Chat now refreshes approximately every 10 seconds rather than through an unrestricted realtime subscription. Clan membership's underlying entity keys are 'clan_id' and 'user_id'.
- Protected AvatarHomeState.activityLog/preferences, Party.voiceRoomId, ClanVaultItem.note and GuildResource.note from public reads, while retaining their other public fields for game discovery. Removed public read on the unused AvatarRuntimeModel_TEMP_CHECK entity.

### Privileged backend functions
- Both partyLifecycle and clanMembershipNotifier automation endpoints require distinct 32+-character server-side HMAC secrets and timestamp-bound signatures before using the service role.
- Unverified deleted-member events cannot impersonate a clan member and generate forged chat announcements.
- Without signed automation producers and configured secrets, the affected maintenance/announcement tasks intentionally fail closed. Their producers must be configured before those tasks resume.
- secureClanAccess now performs real clan member lookups, checks the selected channel belongs to the claimed clan and that the caller has the required role, limits message page sizes, restricts public directory output, verifies message deletion ownership, and allowlists leader-editable clan profile fields.
- Removed an attempted frontend asServiceRole call to User.

### Dependencies and build
- Resolved all production dependency advisories: updated follow-redirects to 1.16.3, seroval to 1.8.2, dompurify to 3.5.0, and React Router DOM to 7.18.6. Removed unused react-quill-new and vulnerable Quill dependency.
- 'npm audit --omit=dev --audit-level=low' reports zero known production vulnerabilities.
- 'npm run build' passes.
- Ten automated security invariants pass in tests/security-base44-access.test.mjs. The GitHub security workflow checks production audit, security tests and build on changes.

## Checks still required to claim complete Base44 approval

1. The Base44 platform's Security Scan API returned a truncated result for this large app. A fresh full scan in Base44 Security Center and its raw findings are still required. Do not claim 'Base44 approved' from npm audit alone.
2. Browser header setting 'prevent_iframe_embedding' was already enabled. The stricter Permissions-Policy setting remains off because the character creator intentionally accesses the camera; enabling it without a camera exception would break Genesis face scanning. Review a precise self-origin camera policy with Base44 support if Security Center recommends it.
3. React Router 7 compiled, but an end-to-end browser smoke test of Game3DHost's nested MemoryRouter and the actual deployed pages is still necessary before declaring the upgrade fully regression-free.
4. 'npm run lint' still fails across legacy scripts/shared modules due to existing undeclared Node globals / no-unused-vars; this was not used as a passing security test. It is separate from the production vulnerability audit.
5. Signed automation producers for PARTY_LIFECYCLE_EVENT_SECRET and CLAN_MEMBERSHIP_EVENT_SECRET have not been configured. Unsigned automated callbacks will be denied rather than performing privileged writes.
6. Production account/guest two-person multiplayer, consented camera flow, clan membership and chat role behavior should be tested with actual low-privilege and privileged accounts.
7. Remaining public catalog/community read entities need product-specific review. They are not automatically vulnerabilities solely because their read operation is public.

## Rules for follow-up
- Do not re-enable the removed login/MFA/GitSync routes or grant service-role privileges to guests.
- Do not mark unresolved scan findings as ignored simply to obtain a green badge.
- Never store HMAC secrets in client-side VITE_ variables.
- Restore point created before this round; use Base44 version history if compatibility issues emerge.

## Follow-up security pass — November 23, 2026

A direct, credit-free code audit and Base44 platform inspection was completed after the
previous consolidation. The result is **partial remediation, not proof of Base44
Security Center approval**, because its full scan response is still truncated.

- Ran a fresh Base44 security scan. The full result was returned as truncated by
  the platform API, so the exact 12–18 alleged findings could not be enumerated.
- Invoked Base44's automatic RLS recommendation fix for all 77 named entity
  schemas, with `record_security_fix_chat: false` to avoid builder-credit usage.
  The API reported `no_recommendation` on all 77 and changed no RLS rules.
  This is not evidence of zero code-level security findings.
- Verified platform browser protections: `prevent_iframe_embedding=true` and
  `restrict_browser_features=true`. No header change was necessary.
- Patched the four high-severity **development dependency** advisories in
  Cloudflare Vite tooling and transitive dependencies via the lockfile.
  `npm audit --audit-level=low` now reports zero vulnerabilities (including
  development tools).
- Removed `innerHTML` sinks from FantasyBattleStage's combat-number overlay
  and GameWorld3D's WebGL failure panel. Combat values are always rendered as
  DOM text nodes, and the combat-label CSS class is allowlisted.
- Added tests/security-dom-sinks.test.mjs and enhanced the security CI workflow
  to audit both runtime and development dependencies and to check the HTML sinks.
- `node --test tests/security-base44-access.test.mjs tests/security-dom-sinks.test.mjs`
  reports 12 passes. `npm run build` passes.

### Still outstanding
Obtain the specific full Security Center report (screenshot or export of each
finding including file path and severity) to review static-code findings and
backend function warnings; the platform's API still truncates the complete
report. No security findings have been ignored or dismissed. Guest cloud saves,
clan/chat, multiplayer, personal-avatar flows, and signed worker callbacks
still require a live role-based test to claim production security approval.
