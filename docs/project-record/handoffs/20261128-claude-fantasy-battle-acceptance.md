# Fantasy Battle browser acceptance pass (WP-FB-01, with WP-FB-04) — hand-back record

- Date: 2026-11-28. Agent: Claude (session local_eeaafc19), at the hub's request.
- Build under test: the production build of main df514c34 (`npm run build`, served with `vite preview`, no file
  watchers), route `/fantasy-battle` (Sapphire Adventure).
- Browser: the Claude desktop app's built-in Chromium. The pane was hidden, so:
  - viewports were emulated at 1280×720 ("desktop") and 667×375;
  - animation frames were driven by a MessageChannel pump in the page and the world iframe;
  - screenshots were not available. Evidence is the page's own text and state (DOM, localStorage, world messages) and
    the console.
- Input: the real UI only. Clicks went to buttons. The explorer was moved with the world iframe's own touch-control
  messages (`move`, `interact`).
- Afterwards the origin's storage was restored to how it was found (no saves, settings or renderer override).

## Results

| # | Step | 1280×720 · WebGPU | 667×375 · `?renderer=webgl` | Evidence |
|---|---|---|---|---|
| 1 | Title | PASS | PASS | No save: Start New Game on, Continue and Load Game off. With a save: both on. At 667×375 nothing is clipped. |
| 2 | New game | PASS | NOT RUN | "Create your character" (Next is disabled until a name is entered), Settings (sound muted), Start adventure. The world loads on WebGPU and autosaves to slot 1. |
| 3 | Save | PASS | PASS (layout) | Autosave on start and after changes. Manual save: Save Game, Slot 1, Confirm overwrite, "Progress saved" (savedAt advanced). |
| 4 | Load | PASS | PASS | Load Game shows "1 of 3": Slot 1 "Most recent" is selectable, the empty slots are disabled. |
| 5 | Continue | PASS | PASS | Restores the saved position (x 46.1): 7.5 s on WebGPU; 8.8 s on WebGL2, where the world iframe gets `renderer=webgl`. |
| 6 | Battle | **FAIL** (see item 1) | PASS | Encounter started from the world. Combat HUD shows round, turn order, enemy intent and "Not learned" skills. Defeat screen: no rewards, pre-battle save unchanged, Retry. Victory screen: XP, gold, loot. On WebGL the practice battle ran on classic WebGL, and its HUD fits at 667×375. |
| 7 | Level-up | NOT RUN | NOT RUN | Needs 100 XP (four normal wins). The level-1 hero alone won 1 of 5 fights (item 2). |
| 8 | Equipment | PASS | PASS (layout) | Grove Amber Ring equips into the Ring slot, Attack goes from 12 to 13, and the save records it at once. |
| 9 | Quest journal | PASS | PASS (layout) | Main story 0/6; quest offer (Accept/Decline) makes the quest Active; the HUD tracks it; "Ready to complete", then Complete quest shows the Quest Completion screen. |
| 10 | Loot #423 (WP-FB-04) | PARTIAL | NOT RUN | See the loot details below. |

Loot details (step 10):
- PASS: first-victory gear on encounter 1, `wilds_grove_01` (Grove Amber Ring ×1 and Sapphire Ore ×1, kept in the
  save).
- PASS: practice grants nothing (XP, gold and inventory unchanged).
- PASS: completing the quest grants nothing extra.
- NOT RUN: the other 13 encounters.
- NOT RUN: replaying a completed encounter (the world does not start completed encounters again).
- Art fallbacks: the items show inline SVG icons and no broken images; their look was not checked.

Other screens seen working: Region Discovery, the rest point's services (Merchant, Blacksmith, Crafting, Preparation),
Sanctuary "Rest and recover" (HP 6 → 120, saved), and Return to title with its confirmation.

Static checks:
- `npm run build`: PASS.
- `npm run lint`: FAIL, already failing on main (item 3).
- The adventure workflow's tests: 175/175 PASS.

## Items (each its own package; nothing was fixed here)

1. **WebGPU battles: the world's battle arena submits invalid frames.** During every WebGPU battle (story or practice)
   the console repeats two warnings, about 250 per battle until Chrome stops reporting for that device:
   - `Invalid RenderPipeline "renderPipeline_MeshStandardNodeMaterial_93"`;
   - `Invalid CommandBuffer from CommandEncoder "renderContext_0" … Queue.Submit`.

   It does not happen while exploring on WebGPU, and not at all on WebGL2. The world iframe draws the arena in its
   `sanctuary` mode, which suggests the arena's standard-material meshes; the battle stage itself only uses basic
   materials. The visible effect was not confirmed (pane hidden); a missing or black arena behind the fighters is
   likely. It may be related to the r171 issue on the unmerged branch `claude/webgpu-morph-texture-key-20261123`; that
   is not verified.
2. **Level-1 difficulty.** The hero alone at level 1 won 1 fight in 5, using Quick Shot and Guard:
   - the Grove Spirit was won once, at 6/120 HP, and lost once;
   - the Pilgrimage Sentinel was lost 3 times;
   - the practice archer was lost once.

   Several of these numbers come from defaults that the owner has not approved (record FB-D8).
3. **`npm run lint` fails repo-wide** (already on main): 2359 errors in 705 files. In Fantasy Battle, 91 `no-undef`
   errors in 8 files: `.mjs` files use `process`, `console`, `URL` and `Buffer`, and the ESLint config gives `.mjs` no
   globals.
4. **Not covered by this pass:**
   - level-up;
   - the other 13 encounters' loot, and replay;
   - a new game at 667×375 or on WebGL;
   - the cross combinations (desktop with WebGL, 667×375 with WebGPU). Layout is DOM-only, and each renderer was
     exercised once;
   - screenshots;
   - a real phone.
