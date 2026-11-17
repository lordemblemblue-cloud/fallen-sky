# Game 3D clone — cross-device render resolution and UI fit
Updated: 2026-11-16

## Design contract
Game 3D has **two independent resolutions**:

1. **Logical viewport** is the CSS pixel size of the visible game container. It controls camera aspect, input raycasts, world labels, quest dialogs, HUD positions, services/navigation, menu layout and mobile touch targets. It always follows the real browser viewport and safe-area insets.
2. **3D framebuffer** is the internal WebGL drawing-buffer size. It affects rendering workload, shader passes and visual sharpness, but **never** changes CSS dimensions, camera FOV, gamepad/mouse aiming, player movement, collision, or browser/device display mode.

Changing the framebuffer does not stretch UI or make the game wider/narrower. Portrait, ultrawide and handheld aspect ratios are preserved. Browser WebGL applications **cannot change an operating system's physical resolution**. Native mode uses device-pixel density subject to GPU safety caps.

## Player controls (Settings → Graphics & Display)
- **3D Render Resolution:** Adaptive, 720p, 900p, 1080p, 1440p, Native pixels. Numeric selections specify the internal **target output height**, maintaining the actual viewport aspect; e.g. Steam Deck-sized 1280×800 CSS at 1080p draws ~1728×1080, not stretched 1920×1080.
- **Interface Size:** Auto Fit, Compact, Standard, Large. Selection affects UI typography/density, not 3D rendering pixels. Auto Fit uses logical browser width and height.
- **Frame Rate Cap:** existing 30/60/120/144 FPS now paces only WebGL draw submissions. Game movement, quests, server messages, simulation clocks, input and animations continue updating every animation frame.
- **GPU Render Profile:** existing Auto/Performance/Balanced/Quality/Off remains. On Adaptive render resolution, existing hysteresis changes DPR gradually using **actual rendered frames**, and corrects deliberate 30 FPS pacing. When a player picks a specific resolution, only WebGL texture/pixel safety limits can lower it.
- **Quality / Visual Style:** existing Low/Medium/High/Ultra, Classic, Sumi-e and Living Ultra-Sumi stay independent; both ink and atomic render targets resize with the drawing buffer.

Settings are stored locally under `game3d_display_settings_v1` and follow the same title/in-world Game 3D experience. The game reuses its existing renderer; no second GPU/canvas/game session is created.

## Mobile release default
When building a mobile/handheld distribution, optionally set the following Vite environment value **before** the production build:

`VITE_GAME3D_MOBILE_DEFAULT_RESOLUTION=720p`

Valid values are `auto`, `720p`, `900p`, `1080p`, `1440p`, `native`. Without it, the first-run default is **Adaptive**. The configured value applies only to CSS-small screens and handheld/touch layouts (including Steam Deck-like 1280×800 with touch), **only when no player preference is already saved**. Players may change the selection in Settings; their preference wins. This is a distribution-default/profile lock at initial configuration, not a forced physical screen mode or an unchangeable user lock.

A distribution that requires a hard frame-budget ceiling should use the existing `GAME3D_MAX_RENDER_PIXELS` and `GAME3D_MAX_RENDER_TEXTURE_SIZE` restrictions; no application is allowed to exceed browser texture/GPU limits.

## Examples (logical viewport → WebGL buffer)
| Device / CSS viewport | Chosen render preset | Internal output (approx.) |
| --- | --- | --- |
| Desktop, 1920×1080 CSS, DPR 1 | 1080p | 1920×1080 |
| Handheld, 1280×800 CSS, DPR 1 | 1080p | 1728×1080 |
| Hi-DPI phone, 390×844 CSS, DPR 3 | 720p | 332×720 |
| Hi-DPI phone, 390×844 CSS, DPR 3 | Native | 1170×2532 |
| Ultrawide, 3440×1440 CSS, DPR 1 | 1080p | 2580×1080 |
| 5K desktop, 5120×2880 CSS, DPR 1 | Native | Capped by safe megapixel limit |

The renderer floors fractional output pixels; a one-pixel difference is expected. `GAME3D_MAX_RENDER_PIXELS` is 8.3 MP, the max ratio is 3× and the effective maximum texture dimension is 8192 (or the browser's lower WebGL limit). These are *defensive defaults*, not promised performance guarantees.

## Supported layout behavior
- `GameWorld3D` observes actual canvas-parent size with ResizeObserver and `renderer.setSize(width,height,false)`. It updates perspective aspect from **CSS dimensions**, and resizes Sumi-e and Atomic targets. No inline canvas width/height locks are introduced.
- `GameView` responds to the display-settings event and browser/visual viewport resize; it updates Game 3D-only CSS properties for UI density and safe insets.
- Game 3D HUD/Services retain their original CSS layouts, with bounds/safe-area fixes at phone and low-height landscape breakpoints. The Pause Menu reflows without horizontal stretching and remains keyboard accessible.
- Dynamic resolution does not move input hitboxes, change lock-on math, re-create the character scene or alter persistent progression.

## Tests and release acceptance
Automated:
`node --test tests/game3d-clone-display-resolution.test.mjs tests/game3d-clone-adaptive-graphics.test.mjs tests/game3d-clone-native-gpu-settings.test.mjs tests/game3d-console-settings-shared.test.mjs`
Then `npm run build`; this is the dedicated `game3d-clone-responsive-resolution.yml` workflow.

Manual QA required **before claiming full cross-device certification**:
1. Phone portrait 390×844 / DPR 3: 720p, 1080p, Native and Adaptive; rotate to landscape; notch/safe-area and keyboard reveal; main HUD, Services, combat controls, chat and character loadout reachable.
2. Steam Deck or tablet-like 1280×800, both touch and gamepad/mouse: 720p/900p/1080p/native, focus and hover, menu scroll, safe-area controls, lock-on and bow aim.
3. Desktop 1920×1080, 2560×1440, ultrawide 3440×1440 and browser-zoom/window-resize transitions: no stretched scene, input raycasts align with pointer, HUD and 3D preview remain aligned.
4. Change render resolution repeatedly in the title and live Game 3D without avatar/world remount, WebGL context leaks, stale FBO dimensions, white post-processing frames, crash or black display.
5. Measure GPU/FPS and frame times at 30/60/120/144, including genuine 30 FPS cap without automatic GPU downgrade; check memory/thermal behavior of extended play on real phones.
6. All Services subpages (Character, Appearance, Skillbook, Companion, Questbook, Blacksmith, Shop, etc.) and any equipped 3D viewers must fit handheld scroll bounds, portrait landscape and accessibility/touch target requirements. This broad visual matrix **has not yet been signed off**.

Scope: Game 3D clone only; no changes to Game 2, dashboard, terrain, caves, enemies, combat damage, economy or the backend.
