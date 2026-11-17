# Game 3D Spirituality — viewer and test preview (2026-11-17)

This feature lives on `game3d/concept-d-l-corner-weapon-skills-ornament-20261117` in `lordemblemblue-cloud/fallen-sky`.

## UI behavior

- Left: one real orbitable Three.js avatar stage reusing `createAvatarScene` and `useGameAvatar` for the current Game 3D character and equipped appearance.
- Halo progression is displayed with lightweight level-dependent **three-dimensional procedural rings** parented to the avatar. Wing paths use lightweight colored 3D feathers; selected wing paths can be previewed even before being equipped. These lightweight preview effects are representations of the progression tiers, **not an exact duplicate of all in-world GLB animations**.
- Right: one larger glass panel containing compact discipline navigation, overview/enhance/evolve tabs, stats, and existing Titles/Ascension/Essence views.
- The central dividing hairline uses a 50%-height gold gradient that fades toward its top and bottom.
- The My Halo label reads `Ranked players killed` as requested. This text correction does not change the original rogue/player-kill ledger backend.

## Preview-only max kills (not real progression)

The existing preview-max feature already includes Halo, Wings, and Titles. It now includes a `Max Kills (Preview)` toggle and makes `Max All` enable it. The preview value is 999,999, displayed **only in Spirituality's projected Halo/Wings state**. It is never written to the actual kill-count store, saved character records, backend, or multiplayer server. Enhancement attempts are blocked while this fake balance is active.

The toggle is **hidden unless all existing test controls explicitly permit it**. For local development:

```
VITE_AXE_GAME3D_PREVIEW_MAX=true
VITE_AXE_GAME3D_SERVER_ENV=test
```

For a non-local test preview, additionally configure the **exact** preview hostname, not a wildcard:

```
VITE_AXE_GAME3D_PREVIEW_HOST=example-preview-host.invalid
```

Replace `example-preview-host.invalid` with the deployment's actual test hostname. Do not set these preview controls in the published production environment. These client-side flags are not server-side admin permissions.

## Verify before publishing

1. Start with a real active character. Open Spirituality and rotate the loaded model. Check equipment, character swaps, camera framing and model-load failures.
2. On Halo page check current level, level advancement, tier-dependent 3D halo rings, numbers, and the visibility toggle. On Wings select each path, check colors and feather tier, preview vs equipped state.
3. Check `Buddha Essence`, `Titles`, and `Ascension` in the enlarged information area. Verify scrolling, button focus, and 390px/mobile landscape layouts.
4. In an explicitly configured test preview enable `Max Kills`: Halo/Wings displays must show 999,999; live kill ledger stays unchanged; enhancement actions remain disabled. Turn it off and verify real values return.
5. Enable `Max All`, verify Halo/Wings/Title levels and readouts, then `Clear Test Boosts` or change characters. Real stats and currency must not be permanently modified.
6. Run `node --test tests/game3d-spiritual-viewer-max-kills-20261117.test.mjs`, `npm run lint`, and `npm run build`. Separately verify signed-in gameplay and deployed revision before claiming the UI is live.

No deployment, merge, or runtime/build success is implied by this document.
