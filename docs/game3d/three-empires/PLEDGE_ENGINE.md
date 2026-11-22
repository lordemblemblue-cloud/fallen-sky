# The pledge engine

Band 0 of the build order in `03_QUEST_PLAN.md`. Branch `claude/pledge-engine-20261121`.

A pledge is a quest with steps that are done in order. This document is the contract for the sessions that build world hooks, quest givers and screens next: the shape of a pledge, the exact event each kind of step waits for, how the world reports progress, and what a server would have to check.

What is built: pure logic, the store wiring, tests. What is not: no world hook sends any of these events yet, no screen shows a pledge, no giver offers one, and there is no pledge in the game's data. Nothing here grants a reward.

## 1. Files

All in `src/components/game3d/pledges/`. Every file is a `.mjs` with explicit import extensions, so Node tests can load it. None imports quest data, the store, React or Three.js.

| File | What it holds |
| --- | --- |
| `pledgeModel.mjs` | `definePledge`, `validatePledge`, the step-kind table `PLEDGE_STEP_KINDS`, `pledgeObjectiveMatchesEvent`, `pledgePrerequisitesMet`, `isPledge`, `pledgeChoiceKey`, `pledgeOutcomeFlag` |
| `pledgeProgress.mjs` | `applyPledgeEventProgress` (the ordered reducer), `getPledgeActiveGroup`, `getPledgeStepProgress`, `getPledgeStepChanges`, `isPledgeReadyToComplete` |
| `pledgeState.mjs` | What the store changes for a pledge on accept, event, complete and abandon |
| `pledgeOutcome.mjs` | `getPledgeOutcome`, `getPledgeRecord`, `getPledgeChoices`, `resolvePledgeOutcome` |
| `pledgeStandings.mjs` | `getPledgeStandingRequest` |
| `pledgeClaim.mjs` | `buildPledgeCompletionClaim` |
| `pledgeRegistry.mjs` | `registerPledges`, `getRegisteredPledge`, `listRegisteredPledges` |
| `pledgePlaces.mjs` | The 49 places of the plan and their look-ups |

The `voice/` folder beside them is the voice pipeline's (`VOICE_PIPELINE.md`), not part of the engine. Pledge data itself lives in `threeroads/script/` (`BUILD_RULES.md`).

Changed: `src/components/game3d/useQuestStore.jsx` (section 6). Not touched: `GameWorld3D.jsx`, `questData.jsx`, `AXEQuestFramework.js`, `AXEQuestEventProgress.js`, every screen.

## 2. Defining a pledge

```js
import { definePledge } from './pledges/pledgeModel.mjs';

const pledge = definePledge({
  id: 'example_crate',                 // letters, digits, _ . -  (unique among all quests)
  npcId: 'example_ferryman',           // who gives it; null for a pledge with no giver
  title: '...',
  description: '...',
  unlockLevel: 2,                      // default 1
  recommendedLevel: 2,                 // default = unlockLevel
  factionId: null,                     // only offered to this faction when set
  requires: 'another_id',              // one quest or pledge that must be completed
  requiresAll: ['id_a', 'id_b'],       // every one of these must be completed
  storyFlagsRequired: ['flag_a'],
  storyFlagsOnComplete: ['flag_b'],
  repeatable: false,
  priority: 0,
  category: 'chapter',                 // chapter | side | story | world | event
  pledge: {
    line: 'main',                      // which story line it belongs to (an id)
    chapter: 1,                        // 0 or more; default 0
    swornTo: '...',                    // who it is sworn to       (required)
    cause: '...',                      // why it is asked          (required)
    cost: '...',                       // what keeping it costs    (required)
    steps: [
      { id: 'ask',   kind: 'talk',    text: '...', target: 'example_ferryman' },
      { id: 'dock',  kind: 'go_to',   text: '...', placeId: 'P04' },
      { id: 'haul',  kind: 'carry',   text: '...', target: 'example_crate_item', placeId: 'P08',
        count: 2, failsOn: 'carry_dropped' },
      { id: 'lamp',  kind: 'use',     text: '...', target: 'example_lamp', seconds: 4, optional: true },
      { id: 'whose', kind: 'choose',  text: '...' },
      { id: 'hand',  kind: 'deliver', text: '...', target: 'example_clerk' },
    ],
    choices: {
      whose: {
        prompt: '...',
        options: [
          { id: 'owner', text: '...', flags: ['example_returned'] },                 // outcome 'kept' by default
          { id: 'keep',  text: '...', flags: ['example_kept'], outcome: 'bent' },
        ],
      },
    },
    standings: {
      kept:   { renown: 1, trust: 3 },
      bent:   { renown: 4, trust: -1 },
      broken: { trust: -2 },
      optional: { lamp: { regard: 1 } },   // added when that optional step was done
    },
    rewardPreview: { kinds: ['experience', 'trust'] },   // shown to the player; grants nothing
  },
});
```

A step is `{ id, kind, text, placeId?, target?, count?, seconds?, optional?, failsOn? }` and nothing else: an unknown field is an error, so a typing mistake is caught.

`definePledge` throws `PledgeDefinitionError` when anything is wrong. The message starts `Pledge "<id>" is not valid:` and each line names the step, for example `step "haul" count must be a whole number from 1 to 1000`. `error.pledgeId` and `error.problems` carry the same. `validatePledge(data)` returns the list of problems without throwing.

What comes back is frozen all the way down and is a quest as far as the existing code is concerned:

| Field | Value |
| --- | --- |
| `id`, `npcId`, `title`, `description`, `unlockLevel`, `recommendedLevel`, `factionId`, `requires`, `requiresAll`, `storyFlagsRequired`, `storyFlagsOnComplete`, `repeatable`, `priority`, `category` | As given, with the defaults above |
| `type` | `'pledge'` |
| `sequential` | `true` |
| `objectives` | One objective per step, in order (see below) |
| `objective` | `objectives[0]`, for the code that still reads a single objective |
| `optionalObjectives` | `[]` (optional steps are in `objectives`, marked `optional: true`) |
| `reward` | Always `{}`. The game's turn-in grants whatever `reward` says from the browser, so a pledge may not carry one: `definePledge` rejects a pledge that has a `reward` |
| `pledge` | `{ line, chapter, swornTo, cause, cost, steps, choices, standings, rewardPreview }` |

Each objective is `{ id, type, count, optional, label, description, stepKind, failsOn, targetId or itemId, placeId?, seconds? }`. `id` is the step id; `label` and `description` are the step's `text`.

Other rules `definePledge` enforces: at most 24 steps; step ids unique within the pledge; the first step is not optional; `count` is a whole number from 1 to 1000 (default 1); `seconds` only on `use`, `defend` and `hold_zone`; a `choose` step has no `count`, `target` or `failsOn` and must have an entry in `pledge.choices` with at least two options; `failsOn` may not name the event that completes the step; `standings.optional` may name only optional steps; a pledge may not require itself.

## 3. Step kinds: the exact event for each

Every step is advanced by one event and only that event. `type` is the event's `type`. "Must carry" lists the fields that have to match, or the event is ignored.

| Kind | The step needs | Objective type | Event `type` | The event must carry |
| --- | --- | --- | --- | --- |
| `talk` | `target`: the person's id | `talk` | `npc_talked` | `targetId` = the step's `target` |
| `go_to` | `placeId`, or `target` for a spot that is not one of the 49 places | `discover_location` | `location_discovered` | `targetId` = the step's `target` if it has one, otherwise its `placeId` |
| `defeat` | `target` (a kind of enemy, or one spawn group), `placeId`, or both | `kill` | `enemy_killed` | When the step has a `target`: `targetId` = `target` **or** `kind` = `target`. When the step has a `placeId`: `placeId` = that place. Both, when it has both |
| `defeat_boss` | `target`: the boss's id | `defeat_boss` | `boss_killed` | `targetId` = `target` |
| `pick_up` | `target`: the item's id | `collect_item` | `item_collected` | `itemId` = `target` |
| `carry` | `target`: the thing carried. `placeId` says where to | `carry` (new) | `carry_completed` (new) | `targetId` = `target` |
| `deliver` | `target`: who or what receives it | `deliver` (new) | `item_delivered` (new) | `targetId` = `target` |
| `use` | `target`: the object. `seconds` = how long it must be held | `interact` | `world_interact` | `targetId` = `target` |
| `escort` | `target`: who or what is escorted. `placeId` says where to | `escort` | `escort_completed` | `targetId` = `target` |
| `defend` | `target` (a person or thing) or `placeId` (a place). `seconds` = how long | `defend` | `defend_completed` | `targetId` = `target` if it has one, otherwise `placeId` |
| `hold_zone` | `placeId`, or `target` for a zone that is not one of the 49 places. `seconds` = how long | `capture` | `capture_completed` | `targetId` = `target` if it has one, otherwise `placeId` |
| `choose` | An entry in `pledge.choices` under the step's id | `choose` (new) | `choice_made` (new) | `targetId` = the step's id, `choiceId` = one of its option ids. Send `pledgeId` too |
| `spare` | `target`: the enemy's id | `spare` (new) | `enemy_spared` (new) | `targetId` = `target` |

Fields any event may carry:

- `count`: how many at once. Left out, it is 1. It must be a whole number from 1 to 100; anything else (0, a negative, a fraction, a string, more than 100) and the whole event is ignored. This is the existing rule for quests (`AXEQuestEventProgress.js`).
- `pledgeId`: when present, only that pledge reacts. Use it whenever the hook knows which pledge the event is for, and always for `choice_made`, because two pledges may both have a step called `decide`.

Notes on the table:

- `placeId` is a condition only for `defeat` (in the code, the one kind with `matchPlace`). For every other kind it is a pointer for the map and for the hook (where the person stands, where the thing has to be carried); the hook is what knows the player arrived.
- A `defeat` step always needs a `target` or a `placeId`. The game's own kill report (`reportEnemyKill`, an `enemy_killed` with a tier and nothing else) therefore never advances a pledge.
- Timed kinds (`use`, `defend`, `hold_zone`) are timed by the hook: it sends the one event when the time is up. `seconds` is data for the hook and the screen; the reducer does not count time. A step that needs several rounds (three waves, three heaves) uses `count: 3` and one event per round.
- A choice can be made in a menu or by a deed. "Spare her or finish it" is a `choose` step whose hook sends `choice_made` with `choiceId: 'spare'` when the weapon is lowered, or `'kill'` when the blow lands.
- Four event names were already in use and are reused where they fit: `location_discovered`, `item_collected` and `world_interact` are sent today by the exploration nodes with their own ids (`ft_spirit_vein` and so on), and `boss_killed` by the paused AXE dungeons. A pledge reacts to them only when the id matches its step, so give pledge targets their own ids unless sharing is meant.

### The enemies subsystem's kill event

`BUILD_RULES.md` has the enemies subsystem report each death as

```js
{ type: 'enemy_killed', targetId: groupId, placeId, kind, tier, count: 1 }
```

That payload is what a `defeat` step needs, with three things to keep to:

1. **`target` may be the kind or the group.** A step with `target: 'ink_stray'` counts every death whose `kind` is `ink_stray`; a step with `target: 'm01_gate_strays'` counts only deaths in the group with that `groupId`. Name the kind when any of them will do, the group when the pledge spawned its own.
2. **`placeId` has to be the place's id from `pledgePlaces.mjs` (`P04`), and it has to be there whenever the step names a place.** A step with a `placeId` ignores a kill event that has none or has another. If the enemies subsystem cannot always know the place, pledges should name the group and leave `placeId` off the `defeat` step.
3. **It should go out on `axePledgeEvent`, not `axeQuestEvent`.** On `axeQuestEvent` the same event also reaches the ten AXE and Echo quests, and the ones that ask for kills without naming a target (`axe_q_first_patrol`, `axe_q_first_elite` and the Echo kill chapters) will count three-roads monsters; if those monsters are also on the game's own kill path (`reportEnemyKill` in `GameWorld3D.jsx`), they count twice. On `axePledgeEvent` only pledges hear it. A test pins both behaviours.

`tier` is carried but not read by pledges. A boss is not covered by this event: a `defeat_boss` step waits for `boss_killed` with `targetId` = the boss's id, so either the enemies subsystem sends that as well when a boss dies, or the pledge uses a `defeat` step with `count: 1` that names the boss's group or kind.

### Failure events

A step may name one or more events in `failsOn`. When one arrives while the step is open (section 4) and the step has progress, the step goes back to zero. Steps before it keep what they had.

| Event `type` | Meant for | The event should carry |
| --- | --- | --- |
| `carry_dropped` | `carry`: the thing was dropped or the carrier was hit | `targetId` = the step's `target` |
| `escort_failed` | `escort`: the escorted person or wagon was lost | `targetId` = the step's `target` |
| `defend_failed` | `defend`: what was defended fell | `targetId` = the step's target or place |
| `zone_lost` | `hold_zone`: the zone was taken | `targetId` = the step's place or target |
| `use_interrupted` | `use` with a `count` | `targetId` = the step's `target` |
| `player_died`, `enemy_killed` | anything, for example an optional "nobody fell" | |

Any event name may be used; these are the documented ones (`PLEDGE_FAIL_EVENT_TYPES`). A failure event with a `targetId` reaches only the step with that target (`target`, or the place for `defend` and `hold_zone`); one without a `targetId` reaches every open step that listens for it. `count` is not read on a failure event. For a step with `count: 1` there is nothing to send back to zero, so the hook simply does not send the completing event.

## 4. The rule of order

- Only the first unfinished required step may advance, together with the optional steps listed directly after it. Those are the **open** steps. An event that matches a later step is ignored and is not remembered: the hook has to send it again once that step is open.
- An optional step belongs to the required step listed before it. It is open while that step is open and closed for good once that step is done. The first step may not be optional.
- One event advances a step by its `count`, never past what the step asks for, and never a step that is already done.
- When every required step is done the pledge is ready to be turned in, and nothing more advances.
- `getPledgeActiveGroup(pledge, objectiveProgress)` returns `{ index, stepId, step, optionalIndexes, optionalStepIds }`, or `null` when the pledge is ready. Hooks and screens use it to know what to show and what to listen for.

The 32 quests already in the game are not sequential and keep the old behaviour: every matching objective advances at once.

## 5. How the world reports progress

A hook reports that something happened. It does not say which step it is for; the engine works that out.

```js
// Reaches the AXE and Echo quests (as before) and every registered pledge.
window.dispatchEvent(new CustomEvent('axeQuestEvent', {
  detail: { type: 'npc_talked', targetId: 'example_ferryman' },
}));

// Reaches registered pledges only.
window.dispatchEvent(new CustomEvent('axePledgeEvent', {
  detail: { type: 'enemy_killed', targetId: 'example_wasp', placeId: 'P08', count: 1 },
}));

// The same as axePledgeEvent, as a function call; returns true if anything changed.
import { reportPledgeEvent } from './useQuestStore';
reportPledgeEvent({ type: 'choice_made', pledgeId: 'example_crate', targetId: 'whose', choiceId: 'keep' });
```

`axePOIDiscovered` (detail `{ id }`) is turned into `location_discovered` with `targetId: id`, as before, and now reaches pledges too.

Which channel to use:

- **Kills go on `axePledgeEvent`** (or `reportPledgeEvent`), never on `axeQuestEvent`. The game already reports each kill to the older quests through `reportEnemyKill(QUESTS, tier)`. A second `enemy_killed` on `axeQuestEvent` would count that kill twice for the three AXE kill quests and the Echo chapters.
- For everything else either channel works. `axeQuestEvent` is right when an older quest should hear it as well (a discovery, a pick-up); `axePledgeEvent` when it is pledge business only.
- To get the `placeId` for a kill, use `pledgePlaceAtWorld(position)` from `pledgePlaces.mjs` (section 9).

One update is written to storage and sent to subscribers per event that changed something, a choice and its flags included.

### Announcing steps on the bus

The engine does not know the three-roads bus. The pledge-world subsystem announces steps by watching the store:

```js
import { subscribeQuests } from '../../useQuestStore';
import { listRegisteredPledges } from '../../pledges/pledgeRegistry.mjs';
import { getPledgeActiveGroup, getPledgeStepChanges } from '../../pledges/pledgeProgress.mjs';

const seen = new Map();   // pledge id -> its progress the last time we looked, while sworn
const stop = subscribeQuests((state) => {   // called at once with the current state, then on every change
  for (const pledge of listRegisteredPledges()) {
    if (!state.acceptedIds.includes(pledge.id)) { seen.delete(pledge.id); continue; }
    const now = state.objectiveProgress[pledge.id] || {};
    const started = (stepId) => ctx.bus.emit('pledge:stepStarted', { pledgeId: pledge.id, stepId });
    if (!seen.has(pledge.id)) {
      // Just sworn, or this scene was just mounted: announce what is open now.
      const open = getPledgeActiveGroup(pledge, now);
      if (open) [open.stepId, ...open.optionalStepIds].forEach(started);
    } else {
      const changes = getPledgeStepChanges(pledge, seen.get(pledge.id), now);
      changes.done.forEach((stepId) => ctx.bus.emit('pledge:stepDone', { pledgeId: pledge.id, stepId }));
      changes.started.forEach(started);
    }
    seen.set(pledge.id, now);
  }
});
// in dispose(): stop();
```

`getPledgeStepChanges(pledge, previousProgress, nextProgress)` returns `{ done, failed, started, ready }`: the step ids that finished, the ones sent back to zero, the ones that are open now and were not before (the next required step and its optional steps), and whether the pledge just became ready to turn in. Every area change remounts the world, so the first reading after a mount announces the open step again; that is what lets a place rebuild what the step needs.

The bus events themselves (version 1) are in `BUILD_RULES.md`, section 4. The ones that touch pledges:

| Bus event | Who | What it has to do with a step |
| --- | --- | --- |
| `pledge:stepStarted`, `pledge:stepDone` | announced by pledge-world, as above | Other subsystems spawn, move and clear things on these |
| `enemies:spawnGroup` | asked of enemies by pledge-world when a `defeat` step starts | Its `groupId` is what a step may name as `target` |
| `enemies:defeated`, `enemies:groupCleared` | announced by enemies | Bus only. The store hears a death through the window event above, not through the bus |
| `cast:arrived` | announced by cast | Pledge-world turns the arrival of an escorted person into `escort_completed` |

## 6. What the store does (`useQuestStore.jsx`)

State is per character, in the browser, as before. A pledge uses the same fields a quest does, plus one:

| Field | For a pledge |
| --- | --- |
| `acceptedIds`, `completedIds`, `abandonedIds`, `completionCounts`, `lastAcceptedId` | As for any quest |
| `objectiveProgress[pledgeId][stepId]` | How far each step is |
| `progress[pledgeId]` | The first step's progress (the old single-objective field) |
| `choices['<pledgeId>:<stepId>']` | The option id chosen (`pledgeChoiceKey`) |
| `storyFlags` | The flags named by the chosen options; `storyFlagsOnComplete`; and `pledge:<pledgeId>:kept`, `:bent`, `:broken`, of which exactly the latest is true (`pledgeOutcomeFlag`) |
| `pledgeOutcomes[pledgeId]` | `{ outcome, kept, bent, broken }`: the last ending and how many times each happened. New field, present only once a pledge has been completed or abandoned |

- `acceptQuest(id, def?)`: finds the pledge in the registry when no definition is passed. Checks `requires`, `requiresAll` and `storyFlagsRequired`, already accepted, already completed. It does not check level or faction; callers do that for quests today, and `pledgePrerequisitesMet(pledge, state, { level, factionId })` checks all of it for a pledge. A pledge always starts from zero, with no choice left from an earlier run.
- `reportQuestEvent(quests, event)`: a pledge in the list goes through the ordered reducer; every other quest through the old one.
- `completeQuest(id, def?)`: as for a quest (every required step done, flags set), then records the outcome, `kept` or `bent`.
- `abandonQuest(id, def?)`: as for a quest, then records `broken`, removes the pledge's choices and clears the story flags those choices had set. The steps have to be played again.
- `isQuestComplete(pledge, state)` works unchanged.

For the 32 existing quests nothing changes. This was checked two ways: a test that runs all 32 beside two pledges against the old reducer, event for event (in the suite), and a one-off comparison of the store before and after over 20,000 random operations, which gave the same return values, the same state and the same bytes in storage every time.

## 7. Choices and outcomes

- A `choose` step completes on `choice_made` with a `choiceId` that is one of its options. Any other `choiceId` is ignored and the step stays open. A choice cannot be made twice.
- The store records the option id under `choices['<pledgeId>:<stepId>']`, sets that option's `flags` to true and the other options' flags to false, in the same update as the step's progress.
- Each option is `kept` (the default) or `bent`. The pledge's outcome is `bent` if any choice made is marked `bent`, otherwise `kept`. A pledge with no choices is `kept` when completed.
- Abandoning a sworn pledge is `broken`.
- `getPledgeOutcome(pledgeId, state)` returns `'kept'`, `'bent'`, `'broken'`, or `null` if the pledge has never ended. For a pledge sworn again it stays the last ending until the new one is reached. `getPledgeRecord` adds the counts. `resolvePledgeOutcome(pledge, state)` says what the outcome would be if it were completed now.
- A later pledge can depend on an earlier ending through the ordinary `storyFlagsRequired`, for example `['pledge:example_crate:kept']`.

## 8. Standings and the claim

`getPledgeStandingRequest(pledge, outcome, state?)` returns `{ renown, trust, regard }` read from the definition for that outcome, plus what the definition lists for each optional step that was done when `state` is passed (never for `broken`). It is a request. It changes no store and grants nothing.

`buildPledgeCompletionClaim(pledge, state)` returns what the browser would send a server at turn-in. It makes no network call.

```json
{
  "kind": "pledge_completion_claim",
  "version": 1,
  "pledgeId": "example_crate",
  "line": "main",
  "chapter": 1,
  "ready": true,
  "steps": [
    { "id": "ask",   "kind": "talk",    "count": 1, "required": 1, "optional": false, "done": true },
    { "id": "haul",  "kind": "carry",   "count": 2, "required": 2, "optional": false, "done": true },
    { "id": "lamp",  "kind": "use",     "count": 0, "required": 1, "optional": true,  "done": false },
    { "id": "whose", "kind": "choose",  "count": 1, "required": 1, "optional": false, "done": true }
  ],
  "choices": { "whose": "keep" },
  "outcome": "bent"
}
```

`ready` is false and `outcome` is null until every required step is done. The claim carries no reward and no standings on purpose: a server reads those from its own copy of the pledge.

### What a server would have to verify

The browser's state is what the player is shown. None of it is proof. For the pledge as a whole: the player and character are who the session says; the pledge exists in the server's own data; level, faction, `requires`, `requiresAll` and story flags were met when it was sworn; it is not already completed unless repeatable; the steps happened in order, each after the one before; the outcome follows from the choices the server recorded.

| Kind | What the server has to have seen itself |
| --- | --- |
| `talk` | The character within reach of that person, in the right area, while the step was open |
| `go_to` | A position the server accepted inside the place's circle (centre and radius from its own copy of the places), while the step was open |
| `defeat` | That many kills of that kind, each recorded by the server's own kill record and credited to this character or their party, each inside the place, none counted for two steps |
| `defeat_boss` | The boss's death in the server's record, with this character among those who fought it |
| `pick_up` | The item handed out by the server that many times; each item on the ground taken once |
| `carry` | The thing was taken up, was not dropped, and reached the destination place; the time taken is possible on foot over that distance |
| `deliver` | The character held the thing, stood within reach of the receiver, and the thing was taken away |
| `use` | The character within reach of the object for at least `seconds` without a break, by the server's clock |
| `escort` | The escorted person or wagon, moved or tracked by the server, reached the destination alive with the character close by |
| `defend` | What was defended was still standing after `seconds` (or after each of `count` rounds) by the server's clock, against enemies the server spawned |
| `hold_zone` | The character's side held the zone for `seconds` by the server's clock, with no rival inside where the pledge says uncontested |
| `choose` | The choice is one of the options, was made once, while the step was open; where the choice is a deed, the deed itself (the enemy spared, the thing taken) |
| `spare` | The enemy was brought to the point of yielding by this character and was not killed |

The game's private quest pipeline (`server/game3d/`, `base44/functions/game3dQuestAction174`) is not called by the published game today. Until it is, a pledge can be played and its ending remembered in the browser, and nothing of value may be granted for it.

## 9. Places

`pledgePlaces.mjs` holds the plan's 49 places as `{ id, key, name, area, region, mouthArea, x, z, radius, state, approx, also }`, in local Wolfveil metres (the world adds 70 to z).

- `id`: `P01` to `P49`, the plan's number. This is what a step's `placeId` holds.
- `key`: a plain description (`north_fort`, `west_forward_camp`) that does not depend on the story's names. `name` is the plan's draft name; the story is not approved, so it is a placeholder and nothing shows it.
- A surface place has `area` (`town`, `south`, `west`, `east`, `north`) and `region: null`. A place under the valley has `region` (`wolfveil-caves`, `lunar-cave`), `area: null`, its mouth's surface position in `x`, `z` and that mouth's area in `mouthArea`.
- `state`: `here` or `new`. `radius`: from the plan for P08, P24 and P35; from the game's data for places that have one; otherwise 25 m.
- `also`: the plan's second coordinate, where it gives two (P04, P07) or a line (P39). The first is the centre.
- `approx: true`: the plan gives no numbers for it.

Look-ups: `pledgePlace('P08')` or `pledgePlace('threshing_floor')`; `pledgePlacesInArea('south')`; `pledgePlacesInRegion('wolfveil-caves')`; `pledgePlaceAtLocal(x, z)` and `pledgePlaceAtWorld({ x, z })` return the surface place a point is in (the smallest circle that holds it, then the nearest), or null. Pass `{ mouths: true }` to count cave mouths as well.

What did not fit the plan cleanly:

- **Every place is in the area the plan lists it under**, and every place to be built is at least 30 m from an area border. None had to be moved.
- **The plan's header says 23 places are already in the game and 26 are new; its own tables mark 22 as "Here" and 27 as "New".** The data follows the tables.
- **P02 The Three Lodges** and **P03 Lantern Wall** have no coordinates in the plan ("three of the plaza's houses", "north side of the plaza"). P02 is set to the plaza's centre with a 60 m radius, which is the same centre as P01; P03 to (0, −5), just inside the plaza's north edge. Both need real positions once the houses are chosen.
- **P48 The Wolf Rotunda** has no mouth on the surface; its position is the room's centre in the cave layout (−6, 24), radius 46, taken from `WolfveilCaveLayout.mjs`. **P49 The Lunar Cave** is placed at the Vortex Lake's portal mouth (215, 358), from `VortexLakeLayout.mjs`. Neither is from the plan.
- **P08 Threshing Floor**: the plan says "85 m wide", so the radius is 42.5 m. The game's fighting ground at the same centre has a radius of 85 m. One of the two is meant; the data follows the plan's words.
- **P43 The High Road** (160, 530) and the existing **P46** cistern mouth (−40, 548) lie beyond the 528 m "playable half span" the landscape design names, though inside the 550 m square the terrain covers. P43 is decoration in the plan; worth a look before anything is built there.
- Existing places close to an area border (they are where they are): P18 Wolf Stones, 5 m south of the north border; P07 Wolf Sanctuary, 20 m; P30 Hidden Waterfall, 20 m; P05 Training Grounds, 25 m. A fight or a crowd at the Wolf Stones will press against the invisible wall between the west and north areas.
- No two places in one area are closer than 40 m except P01 and P02 (above).

## 10. Putting pledge data in the game (not done here)

```js
import { definePledge } from './pledges/pledgeModel.mjs';
import { registerPledges } from './pledges/pledgeRegistry.mjs';

registerPledges('band-1-town', [definePledge({ ... }), definePledge({ ... })]);
```

The first argument names the set (one data file). Registering the same name again replaces that set, so a hot reload is safe; an id another set already owns is an error. The data file has to be imported somewhere for this to run. From then on the bridge and `reportPledgeEvent` reach those pledges, and `acceptQuest(id)`, `completeQuest(id)` and `abandonQuest(id)` find them by id.

What the next sessions still have to do, because the existing screens and givers read the `QUESTS` array, which pledges are not in:

- **Givers.** `getAvailableQuestForNPC` and `getAXENPCQuestHandoff` look only at `QUESTS`, and the first does not know `requiresAll`. For pledges: `listRegisteredPledges().filter(p => p.npcId === npcId && pledgePrerequisitesMet(p, questState, { level, factionId }).ok)`.
- **Tracker and logbook.** `getJadeQuestTrackerEntries(definitions, state)` works with pledges as it is when they are in the list it is given: it skips optional steps and shows the first unfinished step with the step's own text. The logbook shows every step with its text and marks optional ones. `QuestDialogueBox` builds its objective lines from the objective type and ignores the step's text, so for the four new types it says "Complete the objective"; it needs to read `objective.label`.
- **Turn-in.** The game's turn-in calls `grantQuestReward(q)` and reads `q.reward.xp`. A pledge's `reward` is empty, so nothing is granted. This path was read, not run with a pledge.
- **Accepting.** The game spawns a quest's enemies around the player when it has `spawnCount`. A pledge cannot have one (`definePledge` rejects it); enemies at a place are a hook to build.

## 11. Not covered

- War pledges (two sides, a time window, the banner raised while sworn): no model yet. A war pledge can be written as a repeatable pledge, but nothing here knows about sides or time windows.
- Per-step dialogue: a step has one `text`. Lines spoken at each step, and voices, belong to the dialogue work.
- Counting time, spawning, markers, anything on screen.
- A step that sends the player back to an earlier step when it fails. `failsOn` resets the open step only.

## 12. Tests

```
node --test tests/game3d-pledge-model.test.mjs tests/game3d-pledge-progress.test.mjs tests/game3d-pledge-store.test.mjs tests/game3d-pledge-places.test.mjs
```

41 tests. `game3d-pledge-store.test.mjs` bundles the real `useQuestStore.jsx` and `questData.jsx` with esbuild and runs them in Node with a stand-in for `localStorage` and `window`. `tests/game3d-pledge-fixtures.mjs` holds three invented pledges used only by the tests, and `tests/game3d-pledge-worked-example.mjs` the example below.

## 13. A worked example, from accept to the completion claim

An invented pledge (not game content) that uses a talk, a place, kills at a place, a carry that fails once, an optional step, a choice and a delivery. The same data is in `tests/game3d-pledge-worked-example.mjs`, and a test sends exactly these events through the real store and checks every line of the table.

```js
const pledge = definePledge({
  id: 'example_mill_sacks',
  npcId: 'example_miller',
  title: 'Example: the mill sacks',
  description: 'Example pledge for the engine document.',
  storyFlagsOnComplete: ['example_mill_done'],
  pledge: {
    line: 'example', chapter: 1,
    swornTo: 'the miller',
    cause: 'Rats are in the grain and the sacks have to reach the floor before dark.',
    cost: 'There is one load, and two who need it.',
    steps: [
      { id: 'ask',        kind: 'talk',    text: 'Speak with the miller.', target: 'example_miller', placeId: 'P09' },
      { id: 'reach_mill', kind: 'go_to',   text: 'Go to the mill.', placeId: 'P09' },
      { id: 'clear_rats', kind: 'defeat',  text: 'Clear three rats from the mill.', target: 'example_rat', placeId: 'P09', count: 3 },
      { id: 'haul',       kind: 'carry',   text: 'Carry two sacks to the threshing floor.', target: 'example_sack', placeId: 'P08', count: 2, failsOn: 'carry_dropped' },
      { id: 'ring_bell',  kind: 'use',     text: 'Ring the mill bell on the way.', target: 'example_mill_bell', seconds: 3, optional: true },
      { id: 'whose',      kind: 'choose',  text: 'Decide who gets the load.' },
      { id: 'hand_over',  kind: 'deliver', text: 'Hand the tally to the quartermaster.', target: 'example_quartermaster', placeId: 'P08' },
    ],
    choices: {
      whose: {
        prompt: 'Who gets the load?',
        options: [
          { id: 'farm', text: 'The farm families.', flags: ['example_sacks_to_farm'] },
          { id: 'camp', text: 'Your own camp.', flags: ['example_sacks_to_camp'], outcome: 'bent' },
        ],
      },
    },
    standings: {
      kept: { trust: 3 }, bent: { renown: 3, trust: -1 }, broken: { trust: -2 },
      optional: { ring_bell: { regard: 1 } },
    },
  },
});
registerPledges('example', [pledge]);
```

The giver's screen swears it: `acceptQuest('example_mill_sacks')` returns `{ ok: true }` and every step stands at 0. The open step is `ask`.

Then the world reports what happens. Each row is one `window.dispatchEvent(new CustomEvent(<window event>, { detail }))`. The last column is each step's count afterwards, in the order ask, reach_mill, clear_rats, haul, ring_bell, whose, hand_over.

| # | Window event | `detail` | What it does | Counts after |
| --- | --- | --- | --- | --- |
| 1 | `axeQuestEvent` | `{ type: 'npc_talked', targetId: 'example_miller' }` | `ask` done; `reach_mill` opens | 1 0 0 0 0 0 0 |
| 2 | `axeQuestEvent` | `{ type: 'carry_completed', targetId: 'example_sack' }` | Nothing: `haul` is not open yet, and the event is not remembered | 1 0 0 0 0 0 0 |
| 3 | `axePOIDiscovered` | `{ id: 'P09' }` | `reach_mill` done; `clear_rats` opens (pledge-world asks the enemies subsystem for the group) | 1 1 0 0 0 0 0 |
| 4 | `axePledgeEvent` | `{ type: 'enemy_killed', targetId: 'example_mill_rats', placeId: 'P11', kind: 'example_rat', tier: 'normal', count: 1 }` | Nothing: the right kind, the wrong place | 1 1 0 0 0 0 0 |
| 5 | `axePledgeEvent` | `{ type: 'enemy_killed', targetId: 'example_mill_rats', placeId: 'P09', kind: 'example_rat', tier: 'normal', count: 1 }` | `clear_rats` 1 of 3 (the step names the kind; `targetId` is the spawn group) | 1 1 1 0 0 0 0 |
| 6 | `axePledgeEvent` | the same | 2 of 3 | 1 1 2 0 0 0 0 |
| 7 | `axePledgeEvent` | the same | `clear_rats` done; `haul` opens, and with it the optional `ring_bell` | 1 1 3 0 0 0 0 |
| 8 | `axeQuestEvent` | `{ type: 'carry_completed', targetId: 'example_sack', pledgeId: 'example_mill_sacks' }` | First sack arrives: `haul` 1 of 2 | 1 1 3 1 0 0 0 |
| 9 | `axeQuestEvent` | `{ type: 'carry_dropped', targetId: 'example_sack', pledgeId: 'example_mill_sacks' }` | Hit on the road: `haul` goes back to 0. Earlier steps keep what they had | 1 1 3 0 0 0 0 |
| 10 | `axeQuestEvent` | `{ type: 'world_interact', targetId: 'example_mill_bell' }` | Optional `ring_bell` done (sent by the hook after the bell was held for 3 seconds) | 1 1 3 0 1 0 0 |
| 11 | `axeQuestEvent` | `{ type: 'carry_completed', targetId: 'example_sack', pledgeId: 'example_mill_sacks', count: 2 }` | Both sacks arrive: `haul` done; `ring_bell` closes; `whose` opens | 1 1 3 2 1 0 0 |
| 12 | `axeQuestEvent` | `{ type: 'choice_made', pledgeId: 'example_mill_sacks', targetId: 'whose', choiceId: 'camp' }` | `whose` done. The store records `choices['example_mill_sacks:whose'] = 'camp'`, sets `example_sacks_to_camp` true and `example_sacks_to_farm` false | 1 1 3 2 1 1 0 |
| 13 | `axeQuestEvent` | `{ type: 'item_delivered', targetId: 'example_quartermaster', pledgeId: 'example_mill_sacks' }` | `hand_over` done. Every required step is done: ready to turn in | 1 1 3 2 1 1 1 |

Through `getPledgeStepChanges`, a watcher announces, in order: done ask, started reach_mill; done reach_mill, started clear_rats; done clear_rats, started haul, started ring_bell; (failed haul); done ring_bell; done haul, started whose; done whose, started hand_over; done hand_over, ready.

Now `buildPledgeCompletionClaim(pledge, getQuestState())` returns:

```json
{
  "kind": "pledge_completion_claim",
  "version": 1,
  "pledgeId": "example_mill_sacks",
  "line": "example",
  "chapter": 1,
  "ready": true,
  "steps": [
    { "id": "ask",        "kind": "talk",    "count": 1, "required": 1, "optional": false, "done": true },
    { "id": "reach_mill", "kind": "go_to",   "count": 1, "required": 1, "optional": false, "done": true },
    { "id": "clear_rats", "kind": "defeat",  "count": 3, "required": 3, "optional": false, "done": true },
    { "id": "haul",       "kind": "carry",   "count": 2, "required": 2, "optional": false, "done": true },
    { "id": "ring_bell",  "kind": "use",     "count": 1, "required": 1, "optional": true,  "done": true },
    { "id": "whose",      "kind": "choose",  "count": 1, "required": 1, "optional": false, "done": true },
    { "id": "hand_over",  "kind": "deliver", "count": 1, "required": 1, "optional": false, "done": true }
  ],
  "choices": { "whose": "camp" },
  "outcome": "bent"
}
```

`getPledgeStandingRequest(pledge, 'bent', getQuestState())` returns `{ renown: 3, trust: -1, regard: 1 }`: the `bent` line plus the bell. It is a request; nothing is granted.

The turn-in screen calls `completeQuest('example_mill_sacks')`, which returns `{ ok: true }`. Afterwards `getPledgeOutcome('example_mill_sacks', getQuestState())` is `'bent'`, and the story flags `example_mill_done` and `pledge:example_mill_sacks:bent` are true.

Had the player walked away after row 12 instead (`abandonQuest('example_mill_sacks')`), the outcome would be `'broken'`, the choice record removed, `example_sacks_to_camp` set back to false, and every step at nothing; swearing it again starts from `ask`.
