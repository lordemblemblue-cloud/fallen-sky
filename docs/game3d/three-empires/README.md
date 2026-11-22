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

## Decisions needed from the owner

1. Is this the story you want? Any empire you would change?
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

Nothing yet: no Meshy credits, no ElevenLabs credits. Estimates come with the first models and the first recorded lines.

## Rules this work keeps

- The reference game is used for structure and craft only. None of its map, places, names, characters, quests, art or music is used.
- The three empires are inspired by history and folklore that belong to everyone; every person, place and event is original.
- No reward, currency or item is granted by the player's browser. No database change, secret or deployment without the owner.
- Every new place is measured in the browser before and after, on WebGPU, and has a low-poly version.
