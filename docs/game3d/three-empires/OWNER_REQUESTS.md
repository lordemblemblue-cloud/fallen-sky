# The War of Three Roads: on hold, with questions for the owner

Written 2026-11-27 by the session that built the War of Three Roads (branch `claude/three-empire-war-20261121`).

## In short

- The owner's main campaign, **The Threads of Our Pain**, is in `main` under `docs/game3d/threads-of-our-pain/` (172 files, last changed 2026-11-27). Since 2026-11-26 the repository's `AGENTS.md` and that folder's `CLAUDE_TERRAIN_HANDOFF.md` say it "supersedes conflicting War of Three Roads story/map assumptions".
- The two stories disagree in eight places (table below). The Threads' own notes name what it keeps from the War of Three Roads and what it does not.
- So **nothing more of the War of Three Roads story is being built.** Chapters 3 to 6 (band 3) are written but have not been made playable, and will not be until the owner answers request 2.
- What is already in the game stays as it was: switched off unless `?threeRoads=1` is added to the address or the admin test menu is used.

What I read of the Threads: the handbook (`R85`), the index (`R61`), the handoff, the opening of `M14.md`, the headings of `S02.md` to `S09.md`, and every line in the folder that names the War of Three Roads. I did not read all 172 files.

## Where the two stories disagree

| # | The War of Three Roads (built or written) | The Threads of Our Pain | Where the Threads says so |
| --- | --- | --- | --- |
| 1 | A living piece of the Wolf Star fell here and was painted as a wolf. It is an unfinished god; four "Teeth" hold it; drawing one opens three roads. | Two real lives of one hero (age 15 in a preserved world, age 18 in the original world under invasion), a Goddess, a hostile goddess, a broken seal. Keep the three peoples' ordinary needs, "not its Wolf Star explanation". | `D26_S37.md`, `R85` |
| 2 | Chapter 2, "Three Arrows" (built, in `main`): Elder Maren is killed at the noon parley at the fountain by three arrows, and the war opens. | `M14` "Three Arrows": an envoy is killed on the road; three reports blame three nations; nobody is shown to be guilty. `S06` "Noon at the Fountain" is a parley before it, with "No new culprit, assassination". | `M14.md`, `S06.md` |
| 3 | Master Hesper is the hidden hand: he drew the first Tooth, arranged the murder and plants the clues. Band 3 lays his trail (the polished old token, the wet brush). | "no established culprit". `S38` "Hesper's Ledger": Hesper is "the subject, not proof of guilt". The culprit is left open on purpose. | `R85`, `M08.md` |
| 4 | Chapter 1 makes the Truce oath the first thing every player must do, and every quest is a "pledge" sworn to someone. | `S04` "Sworn at the Gate" is an optional oath: "No required faction allegiance". No compulsory oath gates the story. | `S04.md`, `R85` |
| 5 | Chapter 1 has the player free Tome, Henut and Livilla from under wagons at the Southern Wolf Gate, as part of the main line. | `S05` "Three Travelers": an optional rescue of the same three in the gate fields, written afresh. "no oath tree, Veil oath, old faction allegiance, or old geometry imported". | `S05.md`, `D21_S27.md` |
| 6 | Each empire has an eight-chapter story of its own, with named commanders and camps at surveyed sites. Two chapters each are built. | Keeps the three nations and "faction camps" to visit. Calls the old empire plot and terrain superseded. | `D19_S23.md`, `M14.md` |
| 7 | Band 3 is set in the four existing caves, with new bosses. A repair branch for those caves is waiting (`claude/wolfveil-cave-mouths-20261123`). | Has its own cave plan and says: "do not restore deleted caves, dungeons or world assets automatically". | `CLAUDE_TERRAIN_HANDOFF.md` |
| 8 | Main chapters are numbered M01 to M12. | Main chapters are numbered M01 to M20, and mean different things. | `R61` |

What the Threads says it carried over from the War of Three Roads (`R53_M14-M18_VOICE_PASS.md`): the three peoples' competing ordinary needs (Akitsu star-iron, Tameri water and grain, Remoria land), no whole empire as the villain, and the neutral fountain. Sable Vey, Lyra, Tome, Henut, Livilla, Hesper, the Oath Tree and the Gate Fields all appear in it as well.

## Request 1: what becomes of the War of Three Roads

- **Project:** Fallen Sky, Game 3D.
- **Feature or section:** The War of Three Roads as a whole.
- **What has already been completed:** In `main`, switched off by default: the opening in the town and the Gate Fields (4 quests), the three army camps with each empire's first two chapters (6 quests), about forty people (eight with models of their own), four low-poly building kits, and the systems under them. Written, not playable: chapters 3 to 6 of its main line.
- **What information is missing:** Whether this story stays in the game, and in what form.
- **Why this information is required:** The two stories contradict each other (table above), and the repository now says the Threads comes first. Building more of the old one would deepen the contradiction.
- **Specific questions that must be answered:**
  1. Retire the War of Three Roads story and keep only its systems and assets? Or leave it in the game exactly as it is, switched off? Or rework its built chapters into the Threads' own `S04`, `S05`, `S06` and `M14`?
  2. If it is reworked, the Threads' writer supplies the words. Is that right? I will not write them.
- **Required files or assets:** None new.
- **Other systems affected:** The quest list (with the switch on, these quests are offered ahead of the older ones); the admin test menu another agent added on 2026-11-23; the low-poly world work; the cave repair branch.
- **Work that can continue without this information:** No story work. Keeping the branch level with `main` and its checks passing.

## Request 2: chapters 3 to 6 (band 3)

- **Project:** Fallen Sky, Game 3D.
- **Feature or section:** The First Stroke, What the Wolf Stones Remember, Root Fire, The Drowned Ledger.
- **What has already been completed:** The script: 4 quests, 79 spoken lines (`script/BAND3_SCRIPT.md`). It is in `main`, offered to nobody. Three small follow-up commits are on the branch only.
- **What information is missing:** Whether these four chapters may exist at all.
- **Why this information is required:** They are built on the Wolf Star explanation (row 1) and they point at Hesper (row 3). Both are things the Threads says not to do.
- **Specific questions that must be answered:** Discard these four chapters? If any part should survive, which part, and rewritten by whom?
- **Required files or assets:** None.
- **Other systems affected:** The cave repair branch `claude/wolfveil-cave-mouths-20261123`, made so that these chapters could be reached. Whether to merge it is now a question about the old caves, not about this story.
- **Work that can continue without this information:** None on these chapters. They stay unplayable.

## Request 3: the rest of the old plan (bands 4 and 5)

- **Project:** Fallen Sky, Game 3D.
- **Feature or section:** The 54 quests of the plan that were never written: each empire's chapters 3 to 8, main chapters 7 to 12, fourteen valley stories, eight discoveries, eight war pledges.
- **What has already been completed:** An outline for each in `03_QUEST_PLAN.md`: who asks, where, the steps, a staging note and the kind of reward.
- **What information is missing:** Every spoken line; exact counts and timings; what each choice changes later; the rules by which a war pledge sets players against each other; every reward.
- **Why this information is required:** Under the owner's rule of 2026-11-27, missing parts are not to be invented. Until now I wrote the lines myself from the outline.
- **Specific questions that must be answered:** Only if request 1 keeps the story: who writes these, and are the outlines themselves still approved?
- **Required files or assets:** The written chapters.
- **Other systems affected:** Fighting between players (duels are on, fighting in the open world is not); server-decided rewards (not switched on).
- **Work that can continue without this information:** None.

## Request 4: reusing what was built for The Threads of Our Pain

- **Project:** Fallen Sky, Game 3D.
- **Feature or section:** The systems and assets under the War of Three Roads.
- **What has already been completed:** Quests made of ordered steps with nine kinds of step and remembered choices; staging of scenes (people brought in, moved, followed, lines spoken in order); monsters put at a place, with waves that walk to a spot; people with their own models (Sable Vey, Master Hesper, the Gate Warden, Elder Maren, Bram, Mizuhara, Paneb, Aelia Sabina); camps and places built from four low-poly kits; a dry-run voice pipeline.
- **What information is missing:** Whether the Threads' builders should use these, and which of the eight models are still the right people.
- **Why this information is required:** The Threads' handbook asks for the same kinds of thing (ordered objectives, receipts, staged scenes, people who appear by phase) and says to reuse existing systems where compatible. Nobody has said these are the ones.
- **Specific questions that must be answered:** May the Threads be built on these systems? Are the models of Sable Vey and Hesper acceptable for the Threads' Sable and Hesper?
- **Required files or assets:** None new.
- **Other systems affected:** The Threads' quest and cinematic work (`R85`, section 5).
- **Work that can continue without this information:** Describing these systems for the Threads' builders, if asked.

## Request 5: spending and the older open decisions

- **Project:** Fallen Sky, Game 3D.
- **Feature or section:** Meshy and ElevenLabs credits; the nine decisions listed in this folder's `README.md`.
- **What has already been completed:** 236 Meshy credits spent on eight people; 579 left. Nothing recorded with ElevenLabs; 225 lines (27,730 characters) are written.
- **What information is missing:** Nothing, unless request 1 keeps the story.
- **Why this information is required:** Models and recordings for a story that may be retired would be wasted.
- **Specific questions that must be answered:** None now. If the story is kept: the nine decisions in `README.md`, then credits for about twenty more people and the monsters, and which voices.
- **Required files or assets:** None.
- **Other systems affected:** None.
- **Work that can continue without this information:** All of it waits. Nothing is being spent.
