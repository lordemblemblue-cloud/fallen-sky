# Duelist Adventure — Screenshot-to-Functional-Template Implementation Prompt
Date: 2026-11-21

## Repeatable engineering prompt (use for any follow-up)
> In `lordemblemblue-cloud/fallen-sky`, implement the user's five Duelist Adventure UI reference screenshots as **reusable, text-free design frames** rather than screenshots rendered as interfaces. Use custom original vector/UI geometry only: angular blue-toned translucent frame, fine icy rim, restrained warm-orange selected states, a character-stage frame, thin separators, and a bottom navigation rail. Do **not** bake text, faces, portraits, character pictures, currency, or buttons into the artwork. Layer accessible HTML/React controls, actual game data, and live GLB models over the graphics. Keep Normal, Ranked, Practice and Custom visually identical except for active category and content. Categories appear in a vertically centered left rail; relevant mode tiles sit immediately to their right; a selected-detail/actions column sits to the far right. Character has a selectable roster, live existing GLB preview, independent class selection, real XP to level 25, and per-level earned mastery (levels 2–4 and other non-fives upgrade abilities in rotation, levels 5/10/15/20/25 grant Ultimate +1). Derive ranks from the same trusted XP rules used by the server; never allow client-forged levels, gold or rewards. Use backend-authorized match operations and existing routes, with only supported modes launchable. Ranked queues, Transport, Custom lobbies, target range and other incomplete backends must be clearly disabled as planned. Put Home, Play, Character, Story, Store and Settings in the bottom header; Settings is rightmost, remove Battle Pass and Plus. Keep Store a read-only catalog outside matches, because item purchases use match-only server-owned gold. Preserve present gameplay, match rendering and guest entry; run focused tests, lint and Vite build. Perform desktop/tablet/mobile QA; never mistake GitHub merge for Base44 live publication.

## Implemented source
- `public/ui/duelist/template-mode-frame.svg` and `template-character-frame.svg`: original text-free vector assets, intended to be scaled and reused.
- `src/components/duelist/menu/duelistTemplateUI.css`: responsive skins, angular tile states and footer nav.
- `src/components/duelist/menu/templateCatalog.mjs`: four menu categories, real vs planned route mapping.
- `src/components/duelist/menu/DuelistTemplateHub.jsx`: live Home, Play, Character, Store catalog, Settings navigation and keyboard Escape.
- `src/routes/duelist.jsx`, `src/routes/duelist-next.index.jsx`, `src/routes/duelist-next.$page.jsx`: actual entry/deep links.
- `src/components/duelist/menu/MenuPages.jsx`: bottom nav for Story / Mode / Join pages.
- `src/components/duelist/core/progression.mjs`: deterministic mastery bonuses derived from levels 1–25.
- `src/components/duelist/core/ranks.mjs`, `src/components/duelist/core/classes.mjs`, `src/components/duelist/sim/world.mjs`: use only server-owned level for modest 4% ability/special numeric scaling and 2% ability cooldown reduction per earned ability point; Ultimate +1 every fifth level, matched execution reach calculation.
- `src/components/duelist/client/ClassPicker.jsx`: in-match class chooser shows next earned mastery reward.

## QA and product boundaries
- The reference image's many faces, cosmetic skins, currencies, ranked queues and private-room controls are **illustrative**, not product data. Only actual models `maskedWarrior`, `huntress`, `female` (Eve), `male` (Adam) are selectable. Class progression is **per combat class**, not independently per appearance.
- The user explicitly superseded the old "no permanent mastery combat bonuses" rule; server-owned XP/level now supply deterministic ability bonuses. Temporary elapsed-match boosts remain separate and reset every match.
- No invented backend for Ranked or Custom. Online Play is only enabled by `useLobby().online` and the existing `MENU_MODES` registry.
- Store in menus is browsing only, with real `SHOP_ITEMS`; purchases still occur in authenticated match seats and never through this UI.
- Reference visuals are a design guide, not assets copied from another game. The templates don't embed fonts, portrait raster art or reference-screen text.
- Validate direct `/duelist`, `/duelist-next`, `/duelist-next/character`, `/duelist-next/settings`, `/duelist-next/store`, `/duelist-next/play-menu`, Story and live match routes; Escape and bottom-nav transitions; scaling, keyboard focus; owned XP and offline-vs-online state. GitHub Actions cannot provide actual browser-based visual screenshots.
- Deployment to Base44 live requires correct app linkage and explicit publish; no claim of live release from GitHub alone.
