# Duelist Adventure home/play drawer — UI implementation handoff

Branch: `feature/duelist-actual-menu-redesign-20261120`.
Status: Draft review; no merge, deployment, or Base44 publish.

## Reason for this branch
The previously shared screenshots were **static concept mockups**, not source code. At the Nov 20 review, `src/components/duelist/menu/MenuPages.jsx` still rendered a centered "SELECT PLAY MODE" wizard, with Classic Arena/Select Fighter on the left and 7 crowded footer entries. The requested redesign is now implemented in the actual GitHub React/CSS source.

## Implemented
- One consistent, bottom-left, angled, responsive drawer instead of an obstructive center modal.
- Two stacked Normal Play and Ranked Play category selectors; neither overlaps. Both display the same per-mode choices, with no practice in Ranked.
- Click a mode to update the detail section in place. Mode list: Duel, Capture the Flag, Transport, Team Deathmatch, Control Point, Free for All, Football. Standalone Practice and Online entries were removed from this mode list: normal-mode detail offers those actions directly.
- Actual supported gameplay routes launch via `/duelist-next/play?mode=...&online=0|1` using the existing mode registry. Offline practice uses the existing bot path; Online requires an available match server. For unsupported Transport, show a truthful Planned placeholder. Ranked is a visible selectable category but cannot launch until its matchmaking backend exists.
- Lightweight CSS hero (mode icon and title). No external media, shader, or extra GPU draw pass added.
- Persisted AI level and opponent model controls reuse the existing `usePrefs` store. Do not falsely advertise unsupported round-type, arena-level, or ranked settings.
- Home nav: Play, Story Campaign, Character. Removed left Hangar/Classic Arena/Select Fighter cluster and disabled Loadout/Skills/Ranking clutter. Footer: Settings, Battle Pass (Planned), Plus (Planned/unavailable). Legacy route `/duelist-classic` still exists; it is just not advertised in the new home.
- Responsive layout and Escape-to-close interaction, reduced-motion styling retained.

## Integration and outstanding work
- The Base44 **editor app ID shown in the owner's screenshot** is `6af625cd654fa5b8954442ce`. The Base44 connector currently exposes only Atom x Eve OS, its copy, and UrbanFlow, and reports this screenshot's app as **inaccessible**. Therefore, this GitHub PR **cannot be claimed visible in that editor preview**. The owner must connect the correct Base44 app/account or review/merge/sync the GitHub changes through the app's configured workflow. Do not silently change a different Atom x Eve OS app.
- Visual browser QA required at desktop 16:9, narrow laptop, tablet and mobile. Test normal/ranked selection, every mode detail, Escape, offline Online disabled, practice route, footer/settings, story and fighter. Make sure drawer remains left of right-side navigation at wide desktop widths.
- Ranked queue and Transport's moving-objective gameplay are not implemented here; do not imply they work. The 3D background and WebGPU migration path remain unchanged.
- No browser screenshots, GPU measurements or deployment verification have been performed. Keep review in draft until the UI can be checked in the correct Base44 preview.
