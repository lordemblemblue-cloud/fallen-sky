# Game 3D — Meshy head likeness in Character Creation (preview integration)

**Repository:** `lordemblemblue-cloud/fallen-sky`
**Branch:** `feature/game3d-meshy-face-draft-creator-20261117`
**Scope:** Test/preview only; no account, roster, body mesh, active avatar, quest or game mechanic mutation.

## What exists already

The Character Creator **Face > Match from a photo** section already had `GenesisFaceScan.jsx` + MediaPipe `selfieFit.js`. Its local, on-device face landmarks measure shape and complexion/hair to update the supported Eve/Adam and other shape keys. No uploaded photograph leaves the browser in that original path.

A face photo is NOT sufficient to generate an exact animated 3D human head, and `Thunder Trial` does NOT advertise player-face uploads. Thunder Trial showcases AI-generated 3D assets and auto-rigging. Meshy provides a separate Image-to-3D / Multi-Image-to-3D developer API.

## Added in this branch

1. **Separate cloud draft feature** in the existing creator Face panel: `MeshyFaceDraftCreator.jsx`, flag `VITE_GAME3D_MESHY_FACE_PREVIEW=true`. Choose 1–4 images of the same person, FRONT first. 2–3 orientations are better than one for shape, but not a guarantee of likeness.
2. **Explicit informed photo-sharing consent**. The UI locally reduces each chosen image to at most 768 pixels and re-encodes as JPEG; only the explicit Generate action sends the images to the game server and onward to Meshy. Never send merely on upload or before consent. The existing local face-fitting workflow remains intact.
3. **Authenticated Cloudflare/TanStack server route** `/api/game3d-face` uses the existing `requireUserRoute` and Base44 bearer auth; the test-only backend checks `GAME3D_MESHY_FACE_ALLOWED_USERS`. Meshy API credentials and task-signing secret never appear in frontend code or responses.
4. **Current API**: one portrait uses `POST /openapi/v1/image-to-3d`; 2–4 reference photos use `POST /openapi/v1/multi-image-to-3d` with Meshy 7.1 and N1 texturing, generating a 2K textured GLB. The `GET` endpoint polls task state with a signed user-bound ticket. `DELETE` attempts to delete the task. Cloud result URLs are restricted to Meshy's signed asset host.
5. **Separate orbitable 3D draft preview** of Meshy's resulting GLB, without changing `model_url`, `creator_body`, the currently playable character, the roster or the character's appearance save. The user can discard drafts.

### Preview environment required (SERVER secrets except VITE-prefixed browser flag)

```
# Client build: only reveals an opt-in preview studio, no provider credentials.
VITE_GAME3D_MESHY_FACE_PREVIEW=true

# Backend: test-only and allowlisted to a known Base44 user ID.
GAME3D_MESHY_FACE_ENABLED=true
GAME3D_MESHY_FACE_SERVER_ENV=test
GAME3D_MESHY_FACE_ALLOWED_USERS=<your-Base44-user-id>
MESHY_API_KEY=<store-as-secret-not-committed>
GAME3D_MESHY_FACE_SIGNING_SECRET=<random-secret-at-least-32-chars>
```

**All flags default off.** On a production backend the gate deliberately refuses to call Meshy. Do not commit the key or put it under any `VITE_` variable. No sample API key is included. Existing project credentials are neither read nor changed by this PR.

### Privacy and economics

- Users must explicitly consent to a cloud upload. Human face images are sensitive: process only photos of the consenting user or with appropriate permission; keep the original on-device path for players who decline.
- The generation request DOES transmit photographs to Meshy; once transmitted, Meshy's own handling, retention and privacy policies apply. The game code never saves raw photos to the character profile or local storage. Discard/Delete can request Meshy task deletion where allowed; in-progress tasks may reject deletion.
- Meshy's documented pricing (as checked 2026-11-17) lists 30 credits for 2K textured Image-to-3D/Multi-Image-to-3D with Meshy 7.1. Credits are provider-defined and may change. Show cost/limits before enabling production.
- Two creations per test user in each server worker process is only a temporary usability guard. **It is NOT a distributed billing quota**. Before public launch add durable server-side per-user quotas, atomic credit checks, audit and abuse controls, upload data policy, moderation and deletion lifecycle.

### Critical limitation — draft is NOT a playable head yet

Meshy generates its *own* topology, UV unwrap and textures. Feeding that generated head mesh or texture into the existing skinned Eve/Adam models cannot automatically reproduce their exact appearance:
- Source head/neck alignment, scale and clip attachment must match the character.
- Skinned humanoid neck and head bone weights must map to the actual game skeleton and survive animation and body swaps.
- Facial blend shapes (eyes, jaw, lips, blinking, expressions, gaze) must be preserved or reconstructed.
- A Meshy-generated 2K texture does not use the same UV layout as the existing character's face, so **do not directly apply it to an arbitrary head**.
- Generate/verify a normalized fitted head and facial UV/rig adapter before enabling `Apply Head` or saving the generated asset; reject incompatible models. Prefer a compatible face texture/landmark transfer onto the standardized game head for animation reliability.
- Only after creator preview, third-person world, equipment/helmet clearance, mobile performance, multiplayer replication and character-vault sync agree should a new head become selectable.

### Verification

```
node --test tests/game3d-meshy-face-draft.test.mjs
npm run lint
npm run build
```

To check Meshy end-to-end in your **test** environment, configure secrets, enable the feature for your user ID, upload 2–3 well-lit photos and consent to the Meshy submission. Inspect the generated 3D draft, including side and rear views. Try an API error, credit-exhaustion, upload cancellation, different signed-in user and task deletion. The full-body character must remain unchanged throughout.

**No paid Meshy job was submitted, no user's photos were uploaded, and no playable head was installed by this code review.**
