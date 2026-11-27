# Fantasy Battle performance and defensive validation — first pass

Previous save-recovery head 2ff60c2: Fantasy Battle and Base44 security checks succeeded; shared Game 3D and WebGPU checks failed. Do not publish.

## Changes

- Exploration telemetry still samples every 250 ms while active. Identical snapshots send at most one heartbeat every two seconds (from 4 to 0.5 messages/second for an unchanged world). Paused/input-locked or failed worlds do not emit periodic telemetry. Resume resets the filter. Explicit restored, discovery, service and encounter events remain immediate.
- Heartbeats still evaluate position autosave eligibility but do not replace the identical world UI state. Unchanged profile updates preserve object identity and do not trigger profile renders. This is a messaging/React optimization, not a claim of GPU FPS improvement. Active movement and changing world metadata retain existing cadence; local signature serialization still has a cost.
- World update rejects invalid coordinates, handles invalid region metadata, uses half-open section bounds, and caps merged history to the existing 1,000-entry limit, retaining legacy IDs. Defensive profile validation returns false rather than throwing on malformed save properties. These are browser-local data integrity checks, not an authoritative multiplayer economy.
- No graphics, map geometry, combat balance, authentication, server routes, managed Base44 files or UI template pictures changed.

## Verification

New tests exercise idle suppression, heartbeat after movement, resume reset, malformed payloads, legacy duplicate histories and structural sharing. Current head automated checks, lint and device acceptance remain pending. Measure CPU, message counts, GPU frame time, memory, and 10-second movement checkpoint behavior on desktop and mobile before claiming an FPS improvement. Validate menu/service/treasure transitions, world return from combat, and all quality modes. Remaining: shared renderer failures, actual visual integration, physical anchors, cinematics and secure guest cloud storage decision.
