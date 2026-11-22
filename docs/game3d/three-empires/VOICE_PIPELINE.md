# Pledge voices: the ElevenLabs pipeline

How the final lines of the pledges (quests) become voice files, what it costs, and who could
speak each part. **Nothing has been recorded.** The story is not approved yet, and every recorded
character spends the owner's ElevenLabs credits.

Checked on 2026-11-21 with the free ElevenLabs calls only (voices, models, balance).

## 1. In three commands

From the repository folder, once lines are final and written into
`src/components/game3d/pledges/voice/voiceManifest.json`:

```powershell
node scripts/pledge-voices.mjs
```
The dry run: lines and characters per speaker, the total, the credits it will cost, and which lines
are already recorded (skipped) or new/changed. No key needed, nothing sent anywhere.

```powershell
node --env-file=<path-to>/.env.local scripts/pledge-voices.mjs --balance
```
Credits used, the plan's limit and the reset date. Free.

```powershell
node --env-file=<path-to>/.env.local scripts/pledge-voices.mjs --record --yes-spend
```
Records **only** the lines that are new or whose text, voice or model changed. It prints the dry
run first, then checks the balance and stops before spending anything if the credits left are fewer
than the estimate. Without `--yes-spend` it refuses and makes no call.

`<path-to>/.env.local` is the git-ignored file that holds `ELEVENLABS_API_KEY` (written by the
ElevenLabs onboarding). The key is read from the environment only: never put it in the repository,
a URL or a message. The script never prints it.

Other modes: `--voices` (the account's voices, free), `--models` (models and credit rates, free).
Options: `--speaker <id>` and `--limit <n>` record a few lines first, to audition a voice cheaply;
`--manifest <file>` and `--out <dir>` point elsewhere (the tests use them).

## 2. Adding lines

In `voiceManifest.json`:

```json
{
  "model": "eleven_multilingual_v2",
  "speakers": { "hayasaka": { "voiceId": "cjVigY5qzO86Huf0OWal", "settings": { "stability": 0.5 } } },
  "lines": [
    { "id": "akitsu-03-hayasaka-01", "speaker": "hayasaka", "text": "…the final line…" }
  ]
}
```

- `id` becomes the file name: lower case letters, digits, `-`, `_`. Suggested form:
  `<pledge>-<speaker>-<nn>`. Each id is unique; it is what the dialogue asks for.
- `speaker` must be a key of `speakers`. A speaker with an empty `voiceId` is allowed in the dry
  run (casting still open) but cannot be recorded.
- `settings` is optional: `stability`, `similarity_boost`, `style`, `use_speaker_boost`, `speed`.
  Changing only the settings does **not** re-record lines already made (the dry run notes it);
  delete that line's entry from `voiceIndex.json` to re-record it on purpose.
- Lines over 5,000 characters are refused (the tightest request limit among the models).
- Edit the text of a line and the next `--record` re-records that line only. Change a speaker's
  voice or the model and every line of that speaker (or all lines) is re-recorded: the dry run
  shows the price before you do it.

## 3. Files, and why they ship with the game

```
scripts/pledge-voices.mjs                              the tool (node, no new dependencies)
src/components/game3d/pledges/voice/voiceManifest.json speakers, voices, lines
src/components/game3d/pledges/voice/pledgeVoice.mjs    playback, for the dialogue UI to call later
public/game3d/voice/pledges/<speakerId>/<lineId>.mp3   one file per line (made by --record)
public/game3d/voice/pledges/voiceIndex.json            per line: text hash, speaker, voice id, model,
                                                       settings, characters, bytes, duration, date
tests/pledge-voices.test.mjs                           node --test tests/pledge-voices.test.mjs
```

The index is what stops paying twice: a line is skipped when its file exists and the index
records the same text hash (SHA-256 of the text as sent), voice and model. The index is saved after
every single line, so a run that stops halfway keeps everything it already paid for.

Why recorded once and shipped, instead of generated while playing (as the Living Quest does today):

- **Cost.** Generated live, every player who hears a line pays for it again. Recorded once, a
  line costs its characters one time, ever.
- **The key stays home.** Live generation needs a server holding the key at play time. Shipped
  files need no key and no server.
- **Same take every time, and the owner hears it before players do.** Generated speech varies
  from call to call; a file can be reviewed and re-recorded if it is wrong.
- **No wait.** A file starts at once; a live request takes a second or more and can fail.

Size: at the chosen format (MP3, 128 kbit/s) a second of speech is about 16 KB. 70,000 characters
is roughly 75 to 80 minutes of speech, about 75 MB. Files are fetched only when a line plays, never
at game load. If that is too large, switching `OUTPUT_FORMAT` in the script to `mp3_44100_64`
halves it at the same credit cost; decide before the first recording.

Playback (`pledgeVoice.mjs`): `playPledgeLine(lineId, { caption, onCaption })` always shows the
caption; if the index lists the line, it plays the file the same way the quest dialogue box does
(a plain `Audio` element at its default volume, autoplay errors ignored). One pledge line plays at
a time. The index is fetched once, on the first request, so nothing in the live game changes until
a pledge line is asked for. The dialogue UI is not wired to it yet.

## 4. The account today

| | |
| --- | --- |
| Plan | Creator (active) |
| Credits used | 7,420 of 131,000 |
| Credits left | **123,580** |
| Resets | 2026-12-19 |

## 5. Model

What the account offers for speech, with the credit rates the API reports:

| Model | Credits per character | Longest request |
| --- | --- | --- |
| `eleven_v4` | 1 | 100,000 |
| `eleven_v4_turbo` | 0.5 | 100,000 |
| `eleven_v3` | 1 | 5,000 |
| `eleven_v3_conversational` | 0.5 | 5,000 |
| `eleven_multilingual_v2` | 1 | 10,000 |
| `eleven_flash_v2_5`, `eleven_turbo_v2_5` | 0.5 | 40,000 |
| `eleven_flash_v2`, `eleven_turbo_v2` | 0.5 | 30,000 (English only) |

**Recommendation: `eleven_multilingual_v2`, 1 credit per character** (set in the manifest). It is
the most consistent model from one line to the next with the premade voices, which matters for a
cast speaking hundreds of separate lines, and it takes the voice settings above. The half-price
models (turbo, flash) are built for speed, not for acted dialogue, and recording happens once, so
speed buys nothing here.

`eleven_v4` costs the same (1 credit per character) and is newer than anything this tool was
tested against; `eleven_v3` is more expressive but less steady between takes. Before the full
recording, spend about 500 credits to record the same three lines with `eleven_multilingual_v2`
and `eleven_v4` (`--speaker <id> --limit 3`, changing `model` between runs) and let the owner
choose by ear. Changing the model afterwards re-records everything, so choose first.

## 6. Casting proposal

The account has the 21 standard ElevenLabs voices and no custom ones. Every voice speaks
American or British English; there is one old voice (male), no old woman and no child. Proposal,
matched to the direction in `02_STORY.md` section 11 (also written into `voiceManifest.json`, empty
where nothing fits). The owner approves the casting; nothing here is final.

Legate Corvinus and Tribune Aelia get British voices (a familiar convention for a Roman-style army); Brenna,
"born outside the republic", keeps an American voice on purpose; Kallias, from the island cities,
gets the one Australian voice.

| Part | Direction | Voice | Voice id | Fit |
| --- | --- | --- | --- | --- |
| Lyra | Woman, 30s, calm, dry, used to being obeyed | Sarah (mature, reassuring, confident) | `EXAVITQu4vr4xnSDxMaL` | good |
| Sable Vey | Low, unhurried, a judge's patience | River (relaxed, neutral, calm) | `SAz9YHcvj6GT2YYXdXww` | fair: the story does not say whether Sable Vey is a man or a woman; River is a neutral voice |
| Elder Maren | Old woman, warm, quick; one scene | — | — | **gap**: no old woman's voice |
| Master Hesper | Old man, soft, kind, never raises his voice | Bill (wise, mature, old) | `pqHfZKP75CvOlQylNhV4` | good; the only old voice, kept for the villain |
| Iset | Child (nine) | — | — | **gap**: no child's voice |
| Colonel Hayasaka | Man, late 30s, clipped, courteous, tired | Eric (smooth, trustworthy) | `cjVigY5qzO86Huf0OWal` | good |
| Lady Asagiri | Woman, 50s, very still | Lily (velvety, British) | `pFZP5JQG7iQjIQuC4Bku` | good |
| Kohaku | Young woman, bright, stubborn | Jessica (playful, bright, warm) | `cgSgspJ2msm6clMCkdW9` | good |
| Mizuhara | Young man, fast, delighted | Liam (energetic) | `TX3LPaxmHKxFdv7VOQHJ` | good |
| Sergeant Gorō | Older man, rough, fatherly | Roger (laid-back, resonant) | `CwhRBWXzGAHq8TQ4Fs17` | fair: fatherly, not rough or old; lower stability adds some grit |
| Ren | Young woman, sharp, proud | — | — | **gap**: the account's seven women's voices are all cast; Laura would fit but plays Tiaa, and Ren meets Tameri in the story |
| General Nakhtamun | Man, 50s, deep, slow, grief under it | Brian (deep, resonant, comforting) | `nPczCjzI2devNBz1zQrb` | good |
| Priestess Meresankh | Woman, 40s, gentle, immovable | Bella (warm, professional) | `hpp4J3VqNfWAUOO0d1Us` | fair: a little bright; high stability |
| Paneb | Man, thin precise voice | Daniel (steady, formal, British) | `onwK4e9ZLuTAKqWW03F9` | fair: precise, not thin |
| Sabu | Man, easy, amused, a hunter's quiet | Chris (charming, down-to-earth) | `iP95p4xoKVk53GoZ742B` | good |
| Tiaa | Woman, 20s, sardonic | Laura (quirky, sassy) | `FGY2WhTYpPnrIDTdsKH5` | good |
| Legate Corvinus | Man, 40s, measured, formal, honest | George (warm, mature, British) | `JBFqnCBsd6RMkjVDRZzb` | good |
| Tribune Aelia | Woman, 30s, direct, warm, angry when lied to | Alice (clear, British) | `Xb7hH8MSUJpSbSDYk0k2` | good |
| Augur Veranius | Old man, thin, exalted | — | — | **gap**: Bill is the only old voice and plays Hesper |
| Old Vine | Old soldier, gravel, humour | Callum (husky trickster) | `N2lVS1w4EtoT3dr4eOWO` | fair: gravel and humour, not old |
| Kallias | Man, lively, argues for fun | Charlie (energetic, Australian) | `IKne3meq5aSn9XLyUdCD` | good |
| Brenna | Woman, 20s, earnest, exact | Matilda (knowledgeable, professional) | `XrExE9yKIg1WjnnlVkGX` | fair: exact, but sounds older than twenties |
| Townsmen (3) | Small parts | Will, Harry, Adam | `bIHbv24MWmeRgasZH58o`, `SOYHLrjzK2X1ezoPC6cr`, `pNInz6obpgDQGcFmaJgB` | good for one-scene parts |
| Townswomen (2 to 5) | Small parts | — | — | **gap**: no free woman's voice; reusing a main character's voice for a passer-by would be noticed |
| The Wolf | Three voices at once, one from each people | — | — | **gap / owner decision**: see below |

**What the owner must approve before anything is added** (adding or designing a voice is done on
the ElevenLabs website; the Creator plan has room for custom voices, and any credits a design
preview spends are shown there before it is made):

1. **Elder Maren**: an old woman's voice, designed or taken from the ElevenLabs voice library.
2. **Augur Veranius**: an old man's voice, thin and exalted.
3. **Ren**: a young woman's voice, sharp and proud.
4. **Iset**: a child's voice. Child voices are rare in the library; voice design can make one.
5. **Two or more townswomen**.
6. **The Wolf**: either three designed voices, or three voices from the cast (one per empire), each
   Wolf line recorded three times (three speakers `wolf-akitsu`, `wolf-tameri`, `wolf-remoria` are
   already in the manifest). Each Wolf line then costs **three times** its characters. Playing the
   three together needs either a pre-mixed file per line (an audio tool outside this script) or a
   small change to `pledgeVoice.mjs` to start three files at once; neither is built.
7. Whether Sable Vey is a man or a woman (River works for either; George would be the man's choice,
   but he plays Corvinus).

Five to seven new voices in all. Once added, put each new voice id into the manifest; `--voices`
lists them with their ids.

## 7. What the whole plan costs

At 1 credit per character (`eleven_multilingual_v2`, `eleven_v4` or `eleven_v3`):

| Spoken characters | Credits | Share of the monthly 131,000 | Fits in today's 123,580 left? |
| --- | --- | --- | --- |
| 60,000 | **60,000** | 46% | yes |
| 80,000 | **80,000** | 61% | yes |

Add on top: each Wolf line three times over, and a margin of about 10 to 15% for lines rewritten or
re-recorded after the owner listens. At 80,000 characters plus that margin (about 92,000 credits)
the job still fits in one month of the current plan, but not together with much other ElevenLabs
use in the same month. The half-price models would cost 30,000 and 40,000 credits.

In money: the API reports credits, not prices. The recording uses part of the monthly Creator
allowance; it costs nothing extra as long as it stays inside the credits left (the script stops
before going over). Check the plan's price on the account's billing page.

## 8. Not verified

- No line was recorded, so the sound of any voice with these characters, the model comparison
  and the real file sizes are untested. The duration in the index is computed from the file size
  at 128 kbit/s, not read from the file.
- The recording mode was tested only against a fake ElevenLabs in `tests/pledge-voices.test.mjs`
  (18 tests); the text-to-speech request itself has never been sent.
- Whether ElevenLabs charges for a request that fails partway is not known; the script stops at the
  first failure (it retries only "too many requests", which is not charged).
- The playback module is tested in node with a fake `Audio`; it has not been run in a browser, and
  no dialogue calls it yet.
