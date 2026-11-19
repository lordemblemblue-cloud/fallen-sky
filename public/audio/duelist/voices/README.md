# Duelist Adventure: recorded comms lines

The story missions' radio lines are recorded here, one MP3 per line, made with ElevenLabs text-to-speech
(model Eleven v4, ElevenLabs' premade voices; who speaks with which voice is the `CAST` in
`tools/duelist/record-comms.mjs`). The game plays a line's recording when `voices.json` lists it and falls
back to the browser's built-in voices for any line without one (`src/components/duelist/client/voices.mjs`).

- `lines.json` lists every line once: `{ id, mission, speaker, text }`. A line's id comes from the speaker and
  the exact words, so a changed line is a new line that needs its own recording.
- `voices.json` lists the recordings: `{ "lines": { "<id>": "<id>.mp3" } }`.

After changing a mission's words (from the repository root):

1. `node tools/duelist/comms-lines.mjs` (rewrites `lines.json`)
2. `node --env-file=<a git-ignored .env file holding ELEVENLABS_API_KEY> tools/duelist/record-comms.mjs`
   records only the lines that have no recording yet (`--dry` first shows them and the characters they cost).

A recording made another way (an actor, another service) works too: save it as `<id>.mp3` and list it.
