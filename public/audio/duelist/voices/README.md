# Duelist Adventure: recorded comms lines

The story missions read their radio lines aloud with the browser's built-in voices
(`src/components/duelist/client/voices.mjs`). A recording plays instead whenever there is one:

1. `lines.json` lists every line once: `{ id, mission, speaker, text }`. Regenerate it after changing a
   mission's words: `node tools/duelist/comms-lines.mjs` (from the repository root).
2. Record a line (or make it with a text-to-speech service) and save it here as `<id>.mp3`.
3. List it in `voices.json`: `{ "lines": { "<id>": "<id>.mp3" } }`.

A line's id comes from the speaker and the exact words, so a changed line needs a new recording.
