# Duelist Adventure — quiet, compact HUD direction (2026-11-20)

The owner clarified that the game UI **must not be dominated by thick bright-blue borders or neon lighting**. It should be visually simple, slim, readable and translucent, while preserving restrained functional color.

## Scope of this pass

- In-match HUD only: health/portrait, special indicator, three-button ability bank, top score/objective rails, game-event feed and story dialogue/comms panel.
- `src/components/duelist/client/duelist.css` includes a scoped **Duelist Adventure quiet HUD pass** at the end of the file. This overrides the original ornate SVG backgrounds with neutral semi-transparent panels and thin borders without removing art files or changing logic.
- Neutral graphite surfaces, warm gold for accent/keys, green health, blue/red teams, purple dialogue speaker and modest cyan ability icons.
- Reduced occupied space on desktop; compact mobile breakpoints retained.
- Existing DOM values are live, abilities still page across six actions, inputs and server gameplay unchanged.
- Match feed and story comms are *presentational message surfaces*, **not a live multiplayer text-chat implementation**. Do not claim that typing or guest multiplayer messaging has been added to Duelist Adventure.

## Coordination

The game's other active workstreams (four class rules, WebGPU, matchmaking, network, victory result) are out of scope. Keep this in a separate GitHub branch/PR and avoid overwriting the other agents' changes.

## Validation

- `node --test tests/duelist-glass-hud.test.mjs tests/duelist-glass-victory.test.mjs`
- `node scripts/verify-duelist-ui.mjs`
- `npm run build`
- Desktop and narrow-screen browser visual QA, particularly the bottom row and score feed. GitHub-only file edits cannot substantiate a deployed preview.
