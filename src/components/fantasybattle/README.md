# Fantasy Battle

A turn-based 2D bow duel at `/fantasy-battle`. The characters are layered puppets in the Live2D manner, cut from the
owner's archer parts sheet. KOTOR was the reference for the round structure only (pick actions, then watch the round
play out); no names, art, sounds or UI come from it.

## Layout

| Path | What |
| --- | --- |
| `core/puppetCore.mjs` | The rig: bones and joint pivots, triangle-grid layers, 2.5D look warp with parallax by depth, smear along velocity, spring-damper hair and cloth, breathing (relaxed and combat-ready), random blinks, expression crossfades, sockets, dynamic z-order. Pure, no imports. |
| `core/skillTimeline.mjs` | Skills as data: schema check, keyframe tracks with phases and easing, events on their frames, blend weights, cancel windows with an input buffer (`SkillPlayer`). Pure, no imports. |
| `core/battleRules.mjs` | Rounds: every fighter picks an action, initiative by action priority then speed, Focus, hit and crit rolls, guard, three-arrow volleys, knock-outs, the opponent's choice. Seeded and deterministic. |
| `data/archerRig.json` | The archer: bones, layers (part, sheet pivot, position, z, grid, depth, spring), expressions, sockets, stances, breathing, look. |
| `data/bowSkills.json` | Quick Shot (1), Radiant Shot (2), Triple Volley (3), Guard (4), hit reactions, victory, defeat. |
| `render/puppetView.js` | three.js view of one puppet (plain `MeshBasicMaterial`s, so WebGPU and WebGL draw it the same), the live bowstring, the nocked arrow, wireframe and pivot overlays. |
| `render/stageFx.js` | Procedural backdrop and effects: arrows with trails and live hitboxes, hit sparks, the guard ward, the charge glow, screen shake. |
| `render/sfx.js` | Web Audio sound effects (no audio files). |
| `FantasyBattleStage.js` | Renderer (`createSceneRenderer('fantasy-battle')`: WebGPU where offered, WebGL otherwise), the two fighters, event handling, hit-stop, the battle flow, recording. |
| `FantasyBattlePage.jsx`, `StudioPanel.jsx` | HUD (HP, Focus, turn order, actions), the Studio drawer (mode, skills, expressions, debug, skin swaps, downloads). |
| `exportKit.js`, `standalone/playerRuntime.js` | Downloads: layers zip, JSON, a standalone HTML player (Canvas 2D, same core), recolours for `setLayerTexture`. |

Layers live in `public/fantasybattle/archer/` with `parts.json` (each layer's origin on the sheet and its size).

## Sapphire Adventure, the release flag and the test page

- `/fantasy-battle` renders `SapphireAdventure.jsx`, the released game that other agents built on top of this duel:
  - the approved 48-screen UI kit (`uiCatalog.mjs`, the `sapphire*.css` styles);
  - an exploration world in an iframe (`/fantasy-battle-world`, `world/sapphireWorld.js`);
  - campaign quests (`core/campaignQuests.mjs`), the party and companions;
  - equipment, bows and accessories (`core/equipmentCatalog.mjs`, `core/weaponCatalog.mjs`);
  - first-victory encounter loot (`ENCOUNTER_GEAR_REWARDS` in `core/adventureState.mjs`);
  - three local save slots (localStorage key `fantasyBattle.sapphire.saves.v1`), with encrypted backup export and import.
- Its battles run on this folder's `FantasyBattleStage`, with a transparent backdrop, party units and learned actions.
- Design notes and status are in `docs/fantasybattle/` and `docs/project-record/FANTASY_BATTLE_RECORD.md`. The record
  also lists this duel's defaults that the owner has not approved (FB-D8).
- The release flag is `FANTASY_BATTLE_RELEASED` in `src/components/games/hub/gamesHubCatalog.mjs`; it is `true` on main.
  - It sets the games-menu tile's status.
  - It gates `/fantasy-battle` and `/fantasy-battle-world`: while it is false, both show "Coming soon" outside
    development (`import.meta.env.DEV`).
- `/fantasy-battle-studio` keeps this duel and its Studio drawer as a test page (the owner's request, 2026-11-27). It
  opens under the same flag and is not linked from the games menu.

## Puppet API

`stage.fighters.hero` (and `.rival`) in the page, `window.__fantasyBattle` from the console:

- `setLookTarget(x, y)`: world point to look at; the player follows the cursor while choosing and the opponent otherwise.
- `triggerExpression(name, hold)`: `neutral`, `focused`, `attackShout`, `hurt` (also `wink`, `pout`).
- `playSkill(id, onHit)`: `onHit(info)` when one of the skill's arrows lands. Returns `started` or `buffered`.
- `loadSkillJSON(data)`: one skill, an array, or `{ skills: [...] }` (Studio: "Load skill JSON...").
- `setLayerTexture(layerId, url)`: skin or weapon swap (Studio: Moon bow, Copper hair).
- `stage.onAudioEvent = (sfxId) => ...`: replace the default synth.

## Skill JSON

```json
{ "id": "quickShot", "name": "Quick Shot", "hotkey": "1", "totalDuration": 1.05, "blendInTime": 0.14,
  "blendOutTime": 0.3, "cancelWindowStart": 0.75,
  "keyframes": [{ "time": 0.32, "phase": "anticipation", "easing": "easeInOutQuad",
    "bones": { "drawArm": { "rotation": -77.1, "offset": [0, 0], "smearStretch": 0, "zIndex": 58 } },
    "params": { "draw": 1, "nocked": 1 }, "expression": "focused" }],
  "events": [{ "time": 0.38, "type": "onHitFrame", "activeFor": 0.9 },
    { "time": 0.38, "type": "spawnArrow", "arrow": { "speed": 2300 }, "trail": { "style": "gold", "length": 0.1 } },
    { "time": 0.38, "type": "playSFX", "sfxId": "release" }, { "time": 0.38, "type": "screenShake", "intensity": 1.5 }] }
```

Phases: `anticipation`, `active`, `hitStop`, `recovery`. Bone values are absolute over the rest pose (degrees,
counter-clockwise; offsets in character units). `params.draw` pulls the string to the drawing hand, `params.nocked`
shows the arrow, `params.charge` lights it. Events: `onHitFrame`, `playSFX`, `screenShake`, `spawnArrow`,
`spawnEffect` (`ward`, `chargeAura`), `hitStop`, `expression`. `hold: true` keeps the last pose (victory, defeat).
An arrow's hitbox is live only inside its skill's `onHitFrame` window, and only when the round's roll says it hits.

## Tools

- `node tools/fantasybattle/cut-archer-parts.mjs [sheet] [out] [--overview png]`: re-cut the sheet
  (`tools/fantasybattle/source/archer-parts-sheet.webp`). Parts are separated by alpha-connected regions (alpha >= 128
  plus the soft fringe), never by colour.
- `node tools/fantasybattle/preview-rig.mjs out.png [--skill id --at s] [--combat 1] [--bones] [--look x,y] [--expr name]`:
  draw any pose with the same core, without a browser.
- Tests: `node --test tests/fantasybattle-*.test.mjs`.

## Made here, not on the sheet

The sheet has no drawing arm, arrow or bowstring, and only full faces for expressions. Made procedurally: the arrow
(SVG in the cutter), the closed-eye blink patch (cut from the eyes-closed face), the hands split from their bracers at the
wrist, the bow with its painted string erased, the live bowstring and all effects. The drawing pose reuses the sheet's
arms, rotated at the joints. The six faces are aligned to one canvas and swapped for expressions. The rival is the same
rig with a violet tint.
