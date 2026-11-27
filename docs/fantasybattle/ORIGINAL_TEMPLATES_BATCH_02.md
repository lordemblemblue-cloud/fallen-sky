# Original-picture template batch 02 — screens 19 and 20

Status: image drafts prepared outside GitHub; not activated. Do not register until the exact binary assets are present and visual/functional overlay QA passes. Do not generate substitute frames.

| Screen | Original source | Asset | SHA-256 of cleaned WebP |
| --- | --- | --- | --- |
| 19 Character Creation | Sapphire Sumi Character Creation UI.png | 19.webp (1671×941) | ecd63961e9551d8054beea1a5d3294520ce89c017247a80b47e505f656605185 |
| 20 Character Selection | Sapphire Sanctuary Character Selection.png | 20.webp (1672×941) | 00650a547dc8dbbe552ad5d236de8fe1f6beb3cfb0f2d80ac4cc3bad67fd0d92 |

The text removal was localized on each original picture; 96.04% and 97.43% of pixels respectively remain exactly identical. Some retouch marks and baked selected-state highlights may remain. Preserve the artwork; do not claim the baked character art is a live character model. Import exact image files under public/fantasybattle/sapphire/templates/ only after review.

## Overlay alignment reference

Coordinates below are x/y/width/height on a 1200×676 reference image; normalize against that frame and use the same contained aspect-ratio wrapper for artwork and controls. Do not add a second decorative panel. These are draft alignment targets, not implemented buttons.

Screen 19: name field [842,114,311,35]; class rows [830,204,338,53], [830,263,338,54], [830,322,338,55], [830,382,338,55]; appearance controls [49,123,320,430]; character preview [390,65,423,532]; back [95,590,209,53]; start [850,584,311,66]. Use actual supported Fantasy Battle classes and appearance state, not the baked mockup's class names; if the art does not match current classes, keep draft until separately approved. Unsupported customization must not be presented as functional.

Screen 20: character tiles [67,120,256,75] with successive row starts 200,274,346,420,490; selected profile portrait [842,114,111,116]; level [1083,113,80,34]; bars [989,155,178,66]; skills [860,239,297,50]; save rows [842,339,317,54], [842,401,317,55], [842,465,317,54]; start [461,592,270,58]; new character [800,599,175,40]; load [989,599,145,40]. Empty slots must visibly show empty state and cannot launch nonexistent saves. Delete/duplicate/cloud art must not imply actions that are unavailable; cloud sync remains deferred. Baked portraits, scene thumbnails, bars and selection glow need dynamic masking or matching separately sourced image layers before activation.

Keep PR #399 draft and release gate unchanged. No production enablement from this batch.
