# Fallen Sky bottom-left world chat — guest visibility hotfix (2026-11-20)

Branch: `fix/fallensky-bottom-left-chat-enter-guest-20261120`. This is the **actual** bottom-left gameplay chat, not the AI assistant or dashboard messaging.

## Reproduced source-level causes
- `GameView.jsx` mounts `WorldChatPanel` with `userId={user?.id}`, but `AGENTS.md` explicitly defines guest-only game entry. Previous Enter handler returned immediately on `!userId`; guest players could not open the dock, and the realtime subscription was skipped entirely.
- Idle opacity was `.035` and its entire dock lacked a visible activation affordance, so users could not find it.
- CSS used `max-height:min(250px,max(0px,calc(100dvh - minimap - old skill diamond)))` and could collapse the dock to **zero height**, especially on short displays. The old global max-width of 276px also prevented focused chat from expanding.

## Changes
- The first Enter reveals the panel, the second Enter focuses its input **without requiring an account ID**. Gameplay shortcuts are intercepted in capture phase; Enter is ignored for textboxes, menu buttons, IME composition, key repeat and suppressed overlays.
- The dormant panel has an unobtrusive, clickable `Chat / Enter` trigger. Message controls stay in the bottom-left gameplay HUD, outside the glass message surface.
- Chat height uses the real minimap clearance and XP bottom anchor; focused chat may extend to 450px wide and blurs only the overlapping quest tracker. It never intentionally climbs over the minimap.
- Incoming authorized realtime messages reveal chat and switch to their channel unless already composing; no fabricated messages, fake server success, or unauthorized database access.
- Failed sends preserve the player's typed message and show an explanatory notice.
- Tests: `tests/game3d-chat-activation-guest-20261120.test.mjs`, updated `tests/game3d-chat-faction-modal-20261120.test.mjs`, and the focused GitHub Actions workflow.

## Outstanding backend blocker — do not claim multiplayer guest text works
The existing `base44/functions/worldChat/entry.ts` returns HTTP 401 without `base44.auth.me()`, and `base44/entities/ChatMessage.jsonc` permits reads only for signed-in user/admin roles. This is incompatible with the guest-only game entry policy in `AGENTS.md`. Client visibility is now corrected; actual **guest-to-guest** sending, server history, and realtime receipt are not validated and are likely denied until an authenticated guest-game messaging session protocol is designed and deployed with spam protection, identity/session integrity, rate limits, and authorized read scopes. **Do not** flip entity RLS to public or use a privileged browser SDK to work around this.

## Review checklist
1. Enter once: see panel. Enter twice: focus input. Escape: close. Enter inside another input: no game-chat activation.
2. Toggle community visibility / Always Show Chat; ensure temporary reveal still works even if dock is hidden. Click the idle chat trigger.
3. Small phone landscape / standard desktop: panel stays under map and widens over quest text, never clips to zero. Invisible horizontal scrollbars remain.
4. Test incoming chat from a permitted signed-in server session: panel becomes visible. Test guest mode: input appears but a send clearly reports the server authorization blocker.
5. Browser 3D and server guest chat remain unverified until actually exercised. Do not claim a live deployment solely from GitHub merge.

## Follow-up: translucent persistent chat correction (2026-11-20)
The user clarified that the earlier `Chat / Enter` chip and two-stage Enter activation were incorrect. The **actual bottom-left in-world chat box** must remain rendered at low opacity while idle, with its existing message area and channel row in place. Enter once immediately focuses the composer and brightens the panel. Successful local sends, authorized incoming messages and chat-channel actions show it clearly, then it fades to its translucent rest state after nine seconds of inactivity. The existing Always Show Chat preference pins full opacity; explicit hide-chat preference is still respected. No new launcher or Enter label is introduced. The chat stays below the minimap.
Changes are restricted to `WorldChatPanel.jsx`, `Game3DChatChannels.css`, `chatVisibilityModel.mjs` and targeted regression tests. Server-side guest messaging authorization remains the same open blocker as above.
