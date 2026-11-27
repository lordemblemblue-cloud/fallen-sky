# The War of Three Roads: plan for the open world

Branch `claude/three-empire-war-20261121`. Documents only so far; nothing in the game has changed.

The owner asked for the open world of Game 3D (Fallen Sky) to become a three-empire war: a long story with a reason behind every quest, 50 to 70 quests, adventure spots shaped into the land, monsters and voices, with quests that send rival players to the same places so they end up fighting each other, all running smoothly in the browser.

## Read in this order

| # | Document | What it is |
| --- | --- | --- |
| 1 | [01_WHAT_MAKES_A_QUEST_MAP_WORK.md](01_WHAT_MAKES_A_QUEST_MAP_WORK.md) | What the reference map and videos taught, with numbers, and how each lesson is used |
| 2 | [02_STORY.md](02_STORY.md) | The story: the three empires, why each needs the valley, the main arc, each side's arc, the people |
| 3 | [03_QUEST_PLAN.md](03_QUEST_PLAN.md) | All 68 pledges with giver, place, steps and kind of reward; the 49 places on the real map; monsters; build order |

Research behind them, in [research/](research/):

- `WORLD_TODAY.md`: the game as it is in the code today (map, caves, terrain, enemies, quests, factions, fighting between players, performance budgets).
- `REFERENCE_LAND_NOTES.md`: the main-story walkthrough studied scene by scene: how land is shaped and how story is staged.
- `REFERENCE_QUEST_MAP_NOTES.md`: counts and spacing from the map site and the "100% of the game" video.

## The story in three lines

A piece of the Wolf Star fell into this valley. Three empires found a road here in the same year, and each needs the valley to survive: Akitsu its star-iron, Tameri its water and grain, Remoria its land. Each believes the Wolf that sleeps here is theirs, and someone in the valley wants them to fight.

## Where it stands

**2026-11-27: on hold.** The owner's main campaign, The Threads of Our Pain, is now in `main` (`docs/game3d/threads-of-our-pain/`), and since 2026-11-26 the repository's `AGENTS.md` says it supersedes conflicting War of Three Roads story and map assumptions. The two stories disagree in eight places. The owner's answer the same day: **"Keep it switched off."** The story stays in the game as it is, off by default; nothing more of it is built and chapters 3 to 6 stay unplayable. The owner also said the old map is being replaced. The comparison and the one question still open are in [OWNER_REQUESTS.md](OWNER_REQUESTS.md). What follows is the record of what was built before that.

**2026-11-21: the owner answered "Yes, build it"** to the story. Building has started, band by band (see the build order in the quest plan and `BUILD_RULES.md`). Everything new is behind the switch `?threeRoads=1` until a band is ready.

The other nine decisions below were not answered one by one. Until the owner says otherwise the build takes the plan's own answer for each: the faction-to-empire match and the names as written; quests are called pledges; the 32 existing quests stay beside the new ones; quest fights match the player's level; no new gates yet; nothing is granted by the browser; war pledges start on duels; the quest engine and the opening first. Each of these is cheap to change later, and each is raised again when the band it affects is shown.

**2026-11-22: band 1 is in main** (pull request 251), still behind `?threeRoads=1` and off unless that is added to the address. It is the town and the Gate Fields: twelve places, seven people in the town, the two opening chapters of the main story and two valley pledges. Bram the lamplighter is the first person with a model of his own (`COSTS.md`: 26 Meshy credits).

**Band 2 is built behind the builders' switch and has been played from end to end**: the three army camps, three smaller places and each empire's first two chapters (`CAMPS_BAND2.md`). It shows only with `?threeRoads=1&threeRoadsPreview=1`, so nobody who turns the story on meets a camp before the owner has seen it. The plan's camps moved when the real ground was surveyed: the river runs in a gorge, so the Landing is a cliff-top camp, and the fort stands across the ridge path. Two faults found when it was played are mended in main. Waves that are meant to take a guarded spot stood where they appeared; they are now sent walking to it (the walking was checked in the game by the enemies session; the two guard scenes have not been replayed with it). A walker could not get from the plaza up the main road to the north gate, because the back wall of the Luna palace's footprint, which has no house standing in it, closed the road; the doorways session opened it on the road's line (pull request 295, walked on foot and mounted). The way north on foot: up the hillside beside the stairway, in at the palace's south door (0, 98), out at the north opening (0, 131.5), along the road to the Ridge Path gate (−22, 240).

**2026-11-22: band 3 is written and not built.** Chapters 3 to 6 of the main story (the Jade Lantern Grotto, the Wolf Stones, Whispering Root Hollow, the Sunken Inkstone Cistern) are in `script/BAND3_SCRIPT.md`: 79 spoken lines. Nobody is offered them yet, preview or not, because three of the four go under the valley and the pledge engine cannot follow a player into the caves. What it asks of the builders, and what the real ground said, is at the top of `src/components/game3d/threeroads/script/band3.mjs`. Three faults in the land stand in its way:

- A ring at a cave's mouth puts the player in the Wolf Rotunda in the middle of the cave network, not in the cave they walked into. The Jade Grotto's painted chamber is then 580 m of tunnel away.
- The only path to Whispering Root Hollow passes 12 m from the edge of a camp of level 35 dead. The chapter is for levels 12 to 16.
- The Sunken Inkstone Cistern's mouth is 20 m beyond the edge of the ground a player can walk on: walkers stop at z 527.3 (checked in the game by the doorways session). Since pull request 295 its path no longer cuts the ridge path, but it still folds over itself near the top. Chapter 6's surface spots stand at the Wolf-Ear Vigil, where that path leaves the ridge path.

**2026-11-22, evening: all of the above is in main** (pull requests 251, 269 and 292, merged by the owner), still behind the switches and off unless they are added to the address. On the merged main the story's 330 checks pass.

## Decisions needed from the owner

1. Is this the story you want? Any empire you would change? **Answered: yes.**
2. Which existing faction is which empire: bear = Akitsu (Japan), wolf = Remoria (Rome), tiger = Tameri (Egypt). This is the one choice that touches existing characters.
3. The names: Akitsu, Tameri, Remoria, and the people in the story.
4. "Pledge": the code has no pledge system. I read it as the monsters, caves and quests side of the game, and named quests Pledges. If you meant something else (the clans, for example), say so.
5. The 32 quests already in the game: keep beside the new ones, re-dress, or retire?
6. Levels: today the east is the easy side and the west the hard side. Quest fights matched to the player's level (my plan), or camps re-levelled so every side has easy and hard ground?
7. Two new farm tracks from the Gate Fields into the west and east, which means two new gates.
8. Rewards must come from the server, and the game's server path for quests is not switched on. New quests playable without rewards until it is, or held back?
9. Fighting between players in the wild areas is not switched on in the published game; duels are. Build war pledges on duels first, or wait?
10. Build order: the quest engine and the opening (town and Gate Fields) first?

## What has cost what

236 Meshy credits so far, for the eight townspeople who have models of their own; every task is listed in `COSTS.md`. No ElevenLabs credits: nothing has been recorded. The three bands written so far hold 225 spoken lines, 27,730 characters to record.

## Rules this work keeps

- The reference game is used for structure and craft only. None of its map, places, names, characters, quests, art or music is used.
- The three empires are inspired by history and folklore that belong to everyone; every person, place and event is original.
- No reward, currency or item is granted by the player's browser. No database change, secret or deployment without the owner.
- Every new place is measured in the browser before and after, on WebGPU, and has a low-poly version.
