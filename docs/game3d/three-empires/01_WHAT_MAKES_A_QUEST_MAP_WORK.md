# What makes a quest map work

Step 1 of the three-empire plan. Draft for the owner, 2026-11-21.

This is what I took from the references you gave (the map site and the two walkthrough videos), in my own words, and how each point is used in our plan. The references were studied for structure and craft only. Nothing of that game's map, places, names, characters, quests, art or music is used in ours.

The detailed notes behind this page are in `research/`:
- `REFERENCE_LAND_NOTES.md`: the main-story walkthrough studied scene by scene, with timestamps to go back to, pattern cards for each kind of place, and thirty rules for shaping land.
- `REFERENCE_QUEST_MAP_NOTES.md`: counts taken from the map site's own marker data and checked against the "100% of the game" video. Its first part (the counts) is in and is used below; spacing and pacing are still being written.
- `WORLD_TODAY.md`: our own game as it is in the code today.

## 1. The numbers, and what they mean for a world our size

Counts from the map site's marker data (see the notes); the rest rounded.

| | The reference | Ours today | Our plan |
| --- | --- | --- | --- |
| Land | about 37 square kilometres | 1.2 square kilometres | the same 1.2, in five areas, plus separate cave scenes |
| Regions | nine, each with a capital, about 8 places to live and about 32 adventure spots | five areas | five areas: a neutral town, a shared battlefield, one home side per empire |
| Places you can discover | about 400 (290 adventure spots, 73 places to live, the rest shrines and landmarks) | about 23 worth the name | 49 |
| Places per square kilometre | about 11 | 19 | 40 |
| Walk between neighbouring places | about a minute | varies; large empty stretches | about half a minute |
| Named quests | roughly 270, plus a great many small errands and endless repeatable jobs | 32, almost all "kill N" | 100: the 32 kept, 60 new stories, 8 kinds of war pledge |
| Quests per place | less than one | about one | two |

Two things follow.

**Our world is thirty times smaller, so it has to be about four times denser, and it has to hide its places from each other.** The reference can leave a minute of empty country between two places. We cannot: the whole valley is under four minutes' run across. What we can do is what the densest parts of the reference do: put every place behind a fold in the ground, so that from any one spot you see two or three places, not ten. This is why the plan asks for ridges, hollows and tree belts before it asks for buildings.

**We get our length from reuse, where the reference gets it from sprawl.** Its quests mostly visit a place once. Ours send the player back to the same fountain, the same stones, the same fields four or five times, each time with different light, different people and different stakes. That is cheaper to build and to run, and it is also what makes a small place feel lived in.

"About half of what that game offered" is roughly 135 named quests. The plan reaches 100 and leaves room for a later band of about 35 more once the three Roads lead somewhere.

## 2. How the reference lays out a region, and what we copy from the idea

- **One seat of power, a few friendly places, many hostile ones.** Each region has a capital, two to four villages or farms, and fifteen to twenty hostile places around them. → Each of our outer areas has one forward camp, two or three friendly places, four or five hostile ones, one cave mouth and one Road home.
- **Roads join the friendly places; the hostile ones sit a short way off the road.** You notice them from the road and choose to leave it. → Our camps and shrines sit on the trails; dens, old battlefields and ruins sit 40 to 80 m off them, marked by smoke or a banner.
- **Borders are real things**: a bridge, a pass, a gate. The country changes there and nowhere else. → Our eleven gates. Each empire's look begins at its gate.
- **The starting region is the gentlest and teaches every kind of place once.** → The town and the Gate Fields hold one of each: a place to talk, a place to fight monsters, a place to fight players, a grave, a locked door.
- **Every region has a thing you can see from everywhere in it.** → One big shape per area: the great cedar, the obelisk, the fort towers and aqueduct, the mill, the Oath Tree.

## 3. How quests use the map

- **Quest givers stand where people would really be**: at a hearth, at a gate, on the road, at the door of the dangerous place itself. → Ours are in camps, at the lodges, and often at the place where the trouble is.
- **The first step of a quest is short; the last is far.** Early quests end within a few minutes' walk; later ones cross regions. → Chapters 1 and 2 of each empire's story stay inside its camp's own basin. Chapters 3 to 6 cross into another empire's land.
- **The main story is a tour.** It takes the player to every region once, so that by its end the whole map is known. → Our twelve chapters visit all five areas and all five caves, in an order that circles the valley.
- **Each faction's story has a home and sends you out from it.** → Each empire's eight chapters start and end at its camp.
- **One place serves several quests.** → 49 places carry 68 new pledges.
- **Some quests have no giver**: a body, a letter, a door that will not open. → Our eight discoveries.
- **About six quests in ten end underground or behind a wall; the rest end in a conversation or a delivery.** → Ours: about half end in a fight at a place, a quarter in a choice, a quarter in an act of care (a burial, a rescue, a delivery).

## 4. How the main story is staged

From the scene-by-scene study. These are the things that make a player feel brought in, and they are rules for every chapter of ours.

1. **A person or an object hands over each quest, never a menu.** A runner arrives in the middle of a scene; an empty stand has a note on it; a carved wall names the next place. → See "How each chapter hands you to the next" in the quest plan.
2. **You are shown a place before you are sent to it.** A ruin is pointed out on a ridge eight minutes before the quest that enters it. A shut gate is seen an hour and a half before it opens. → Root Hollow's glow is seen from the Wolf Stones; the whirlpool lake and its dragon are seen from the fort road long before chapter 10.
3. **Big moments have witnesses.** After the first great fight, the soldiers who fought beside the player gather round, and their reaction is the reward. → Every chapter of ours ends with someone looking at the player differently.
4. **The stakes are explained while the land moves past**: on a ride, on a climb, along a carved wall. → No standing conversation of ours runs longer than about 90 seconds; the rest is said on the way.
5. **The same place returns changed.** One square is seen calm and then burning; one summit is visited four times. → Our fountain, fields, stones, quarry and plateau.
6. **Each big place ends with something learned about the world, more than with a chest.** → Each of our caves ends in a discovery about the war.
7. **Light marks the goal.** The way out of a cave is daylight; the last hall is the brightest. → A rule for our caves and camps.

**What the reference does badly, which we avoid.** Nearly half of its main story on screen is people standing and talking; one scene is seven minutes of reading files and another is a twelve-minute meeting. In a browser action game built on fighting, that would lose the player. And the "100% of the game" run exists because of how much of that game is errands with no reason behind them, which is exactly the "kill five skeletons" problem you named. None of our 68 is an errand: each is asked by someone, for a cause, at a cost.

## 5. How land is shaped, by kind of place

The land study turned each kind of place into a card with sizes. The short version:

| Kind of place | Shape | Read from far by |
| --- | --- | --- |
| Road | 4 m wide on valley floors; trails 2 to 2.5 m; a bend every 40 to 60 m with a boulder or tree clump hiding what comes next | signposts at forks, carved stones along it |
| Camp | 30 to 60 m across, in a hollow or on a ledge; a fire, three to eight shelters, a lookout point | smoke by day, firelight by night, the owner's banners at its edge |
| Fort or tower | a tower 8 m across and 15 to 18 m tall on a knoll 60 m across, low broken walls for cover | the tower top |
| Old tomb or ruin | a tall carved front and a wide stair outside; inside, nine spaces from a collapsed entry hall to a final cavern 40 m across, with a short way back to the door | the outline of its arches on a ridge |
| Cave | a mouth 4 to 6 m wide; tunnels 3 to 5 m; chambers 15 to 40 m | bones, roots, a dark opening framed in a cliff |
| Village | six to ten buildings along one street beside water | a mill wheel, a roof corner |
| Shrine on a height | a switchback stair with a carved stone every 80 to 120 m, a shut gate, a flat top with one tall rock | pale stones against the sky |
| Open arena | 60 to 80 m across, nearly flat, four to eight pieces of cover one to two metres high, one tall perch, open sky | smoke, a roar, a shape in the air |

Each of our 26 new places is one of these kinds. Before each one is built, the builder goes back to the timestamps on its card, looks again at how that kind of place sits in the land, then shapes ours, and repeats until it reads right. That is the loop you asked for.

## 6. Shaping for speed

A browser game cannot afford what the reference draws. The land study's rules that matter most for frame time:

- Shape areas into rooms with ridges, which cost nothing, where walls and buildings cost a lot.
- Paint roads into the ground; do not model them.
- Build every camp, fort and ruin of one empire from about twelve shared pieces, drawn in batches.
- Spend detail on outlines and on what is within ten metres of the path. Everything past 150 m is a low-poly shape.
- Put caves and interiors in their own scenes behind a door.
- Use a column of smoke, a fire glow or a banner as the long-distance marker: almost free, and readable from the gate.
- At most two to four real lights per place.
- Change the light, the people and the damage to tell a new chapter in an old place.
