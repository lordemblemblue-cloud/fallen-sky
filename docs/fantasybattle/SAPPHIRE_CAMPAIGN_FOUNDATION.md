# Fantasy Battle — Sapphire Adventure campaign foundation

Status: proposed narrative expansion, not an assertion of released content. Scope: Fantasy Battle only. Keep Fallen Sky and Duelist Adventure untouched. The existing 48 original UI plates are installed; use them directly, including responsive fallbacks. Claude and Gemini own environment and character art production; this handoff specifies narrative, encounter and interaction placement rather than geometry or models.

## Existing implementation and continuity

The current guest profile begins as a named Archer, with an initial tonic and Silver Archer Bow. The current three recruit IDs are groveArcher (after wilds_grove_01), pilgrimWarden (after wilds_pilgrimage_02) and mistScout (after wilds_waterfall_01). Preserve these IDs, their recruitment checks, combat classes, ownership, and saved profiles. The requested family concept (Father, Artemis/Diana, Sinala and Son) is a narrative direction, not a completed identity mapping: do not rename or map these four roles automatically to the prototype roster. Artemis/Diana is an archer, Father a sword-and-shield fighter, Sinala a tactician, and Son a swordsman/tank in the family concept; the current prototype has different role constraints. Confirm the mapping before changing playable classes or protagonist creation. The story below avoids requiring that mapping.

## Campaign premise (proposed)

Sapphire Wilds is a pilgrimage route sustained by an ancient network of shrine lights. A disrupted signal leaves settlements isolated, and travelers begin to mistake the echoes of missing voices for actual people. The hero initially searches for missing travelers, learning that the shade creatures are not proof of evil in the people whose voices they mimic. By the sanctuary, the party learns the network has been overloaded with accumulated memories and that restoring it requires finding the original signal source, not destroying every shade. The immediate threat is resolved at the sanctuary, while Moonveil and the Astral Ruins reveal a deeper history.

### Prologue — A light that did not return

**Opening cinematic:** A lantern is extinguished at a distant shrine. A traveler carrying an unaddressed letter reaches the trail; the letter is dry but its ink is fading. The hero finds it on the path and hears a bell whose echo arrives before the bell itself. This is a deliberate supernatural mystery, not a missing explanation: the failing network replays old signals out of sequence; the player learns that fact in the second act.

**Suggested dialogue** (proposed NPC, not a new recruit): Trail Keeper: “The grove used to answer every bell. Three nights ago, the bells began answering each other.” Hero: “Who went to look?” Keeper: “An archer. Follow the lanterns. If you hear your name, look for the person before you answer.”

**Placement:** Put the opening interaction in the starting safe area, outside enemy trigger radii. The lantern trail should be readable without a minimap and without relying exclusively on color. A later skip/replay option must not alter quest progress. The existing UI path is setup/character creation → exploration 10 → dialogue 13 → quest offer 43 → journal 08.

### Chapter 1 — Whispering Grove

The Grove Spirit repeats a distress call from an older pilgrimage, drawing the living toward an unsafe crossing. The keeper's objective is to investigate the source and clear the path; the existing encounter wilds_grove_01 is the actual combat goal. After victory the Grove Archer explains that the voices belong to previous travelers, not necessarily to the person standing before the party. Their recruitment is an act of mutual protection, not a reward automatically granted by claiming a quest.

**Quest offer:** “A light has gone out in Whispering Grove. Reach the grove and stop the spirit that is drawing travelers off the road.”
**Before combat:** Grove Archer (off-screen): “Don't chase the voice. Find what is making it.”
**After victory:** Grove Archer: “You heard it too, didn't you? Something remembers this road better than we do. Let me walk with you.”
**Completion:** Trail Keeper: “Then the path is open, but the silence is not an answer. Keep your lantern close.”

Existing objective and claim path: acceptGroveQuest → battle victory wilds_grove_01 → complete → claimGroveQuest. Existing already-defeated acceptance remains valid; claim is an acknowledgement with no extra fabricated currency or XP. Optional recruitment follows the real encounter check, and must not be required to claim. Suggested placement: quest giver near trail service, reveal the enemy at a clear approach, recruit interaction after the combat return point. Keep the path open on repeat visits.

### Chapter 2 — The road of unfinished promises

The pilgrimage route becomes dangerous as warded sentinels treat all visitors as threats. A warden stayed behind to escort travelers, but the shrine's damaged watch repeats the last emergency order. The party learns that the guards are following a broken instruction rather than guarding a hidden villain. This provides a narrative reason for the sentinel ward mechanics without changing their AI.

**Proposed objectives:** inspect the warning marker; survive wilds_pilgrimage_01; clear wilds_pilgrimage_02; speak to the Pilgrim Warden if desired.
**Dialogue:** Warden: “The watch was told to protect the road. Now it protects the road from the people on it.” Hero: “Can we stop it?” Warden: “First, we survive it. Then we learn who gave the order.”
**Placement:** warnings before both encounters; clear retreat route; quiet rest space beyond the second encounter, with recruitment accessible through the existing service flow. The first combat introduces defense, the second tests it. Recruitment retains the existing prerequisite; do not introduce a second frontline or new class.

### Chapter 3 — The waterfall that speaks

An echo travels upstream against the falling water. A Mist Scout has discovered that the sound is a message from a shrine, but a shade prevents safe passage. The party clears wilds_waterfall_01 and the Scout shares the direction of the signal. The nearby cave encounter wilds_cave_01 is proposed as an optional investigation, not a new mandatory gate. It contains evidence that messages are repeating out of order, resolving the opening cinematic's early-bell mystery.

**Dialogue:** Scout: “Listen to the water. The voice goes the wrong way.” Hero: “Then it isn't calling from below.” Scout: “Exactly. Something up the mountain is remembering us.”
**Placement:** safe dialogue perch away from edge and trigger; readable path to cave; distinct optional objective marker; no mandatory jump puzzle until controls and mobile accessibility are tested. Scout recruitment retains the existing waterfall victory requirement.

### Chapter 4 — The heights

The party approaches shrine relay stations that flicker with stored memories. Sentinels close access to the higher path; the party sees repeated guard instructions and distant signs of the sanctuary. Suggested encounter sequence: wilds_heights_01, wilds_heights_02, with wilds_heights_elite as an optional trial. The elite tests preparation and party tactics rather than acting as a surprise mandatory difficulty spike. The view ahead should communicate the next destination without pretending that the painted map is authoritative navigation.

**Dialogue at relay:** “A warning repeated long enough becomes a command. Someone must teach the watch to stop.”
**Placement:** relay interaction at a safe landing; heal/retreat routes before harder encounters; keep optional elite visually distinct.

### Chapter 5 — Sapphire Sanctuary

The sanctuary guard wilds_sanctuary_guard bars the inner chamber. The gatekeeper wilds_sanctuary_boss attacks because it is defending the failing network. Its existing phases (Astral Watch above 65% HP, Falling Stars at 65% or below, Total Eclipse at 30% or below) represent the shrine losing control. The player sees intent before acting; the encounter should reward understanding and survival, not a hidden scripted invulnerability. Victory ends the immediate lockdown. A later dialogue reveals that the network's original signal came from beyond the sanctuary; no new reward is promised by this scene.

**Pre-boss:** “The watch is not waiting for us. It is waiting for the light to return.”
**Post-boss:** “We have opened the sanctuary. Now we must learn what it was trying to remember.”
**Placement:** clear warning before the guard and a safe preparation point before boss activation; keep scenery outside battle hit areas. The sanctuary is not automatically a map-wide fast-travel unlock.

### Chapter 6 — Moonveil Gardens / Astral Ruins

Use the existing additional regions wilds_sec_6 and wilds_sec_7. Moonveil Spirit (wilds_moonveil_01) and Moonveil Keeper (wilds_moonveil_elite) show the older rituals that maintained the relay network; the keeper is proposed as an optional deeper investigation. The Astral Wraith (wilds_astral_01) and Astral Vanguard (wilds_astral_elite) reveal the observatory as a former source of the signals. The chapter ends with a question: who chose to leave the last message unsent? That identity remains an intentional narrative mystery, not a claim about an existing boss or location. Do not invent an extra encounter ID or mark the campaign complete until a real final objective is implemented.

## Placement contract for Claude / Gemini

- Work from existing region and encounter IDs, not artwork labels; avoid overriding existing encounter coordinates, collision or travel bounds without a migration plan. Existing extra region bounds: Moonveil 220–260; Astral 260–302. Saved x is bounded by WORLD_MAX_X=300. No new route needs to extend those coordinates.
- Deliver an editable anchor manifest: stable proposed anchor ID, region/encounter reference, purpose, world position, facing, interaction radius, walkable clearance, safe approach and asset reference. Coordinates for new anchors are intentionally TBD until geometry is delivered. Never infer them from a painted UI.
- Proposed anchors: fb.trail.keeper, fb.grove.approach, fb.grove.recruit, fb.pilgrim.warning, fb.pilgrim.recruit, fb.waterfall.lookout, fb.waterfall.recruit, fb.cave.echo, fb.heights.relay, fb.sanctuary.prepare, fb.sanctuary.epilogue, fb.moonveil.archive, fb.astral.observatory. These are planning keys, not implemented services. Preserve existing collision, encounter and interaction definitions.
- Every interaction needs keyboard E and mobile touch, readable prompt, non-overlapping combat trigger, safe return position and an art-independent fallback. No map or character model generation is requested from the story implementer.

## Runtime integration sequence

1. Keep existing Grove acceptance/completion as authoritative. Wire the proposed localized prose into current dialogue/offer/journal/completion panels only after checking their actual data flows. No new save fields needed for this first slice.
2. Design a versioned quest catalog and bounded, backward-compatible save representation for later chapters. Validate transitions and prerequisites; derive victories from authoritative resolved encounters. Existing saves with Grove already defeated/claimed must load and retain progress. Do not mutate inventory in dialogue or re-grant existing loot.
3. Wire later quests, dialogue conditions, NPC placement, notifications and codex entries to shared quest state. Unknown/unimplemented content stays unavailable rather than presenting fake progress. Optional encounter completion and recruitment remain independent of the main path.
4. Equipment and illustrations: preserve current equipmentCatalog and item transactions. New artwork binds to allowlisted item IDs, uses fallback and lazy loading, cannot grant stats or ownership, and never controls class identity.
5. QA: new game and old saves, defeat/retry, defeat-before-acceptance, duplicate claim, repeated dialogue, combat lock, absent images, missing anchor, desktop and mobile. Run Fantasy Battle tests, lint, build and shared Game 3D/WebGPU/security validation before release.

No publication, new privileges, login changes, artwork replacement, or map/character production is part of this story-only proposal.

## Chapter 1 runtime slice (2026-11-27)

The original and fallback quest offer, journal, completion, service preparation conversation, encounter entrance, recruitment and codex now consume the shared Grove narrative. Service preparation displays a relayed story note at an existing available service; it does not create a physical Trail Keeper NPC or change service locations. The warning is shown only for the existing Grove encounter; recruitment dialogue is shown only when the Grove Archer is eligible and not already recruited. Completion prose requires both claimed status and recorded victory. No save schema, reward, combat, placement or artwork changes. Regression assertions cover progress gating and unchanged quest authority. Pending: full CI, lint and actual desktop/mobile text fit; opening cinematic and physical NPC anchors still await later implementation. Next: Chapter 2 quest catalog and save-compatible progression design.

## Chapter 2 runtime slice — The Road of Unfinished Promises

Main quest is now selectable in the existing Quest Journal once Grove completion is recorded. Accept and complete use the guarded existing transaction/autosave path. The two existing pilgrimage encounters supply objective progress, including victories recorded before acceptance. No new reward is granted on quest claim. The campaign field is optional for old saves and versioned, allowlisted and copied through portable backup import; it does not change existing Grove state. The Warden recruitment invitation appears only after the existing recruitment prerequisite and before recruitment, independently of quest claim. No NPC is falsely claimed to exist at an unplaced anchor.

Proposed side quest, **The Last Escort**: a stranded traveler asks the party to recover a lost patrol ledger. The ledger records an evacuation order, explaining why the sentinels are hostile. At a safe alcove beyond the first encounter, place a readable ledger interaction with clear walkable clearance; a second interaction at the Warden's safe rest area acknowledges the discovery. Keep this optional; no invented inventory item, location coordinates, XP or claim state is implemented until the map anchor and discovery contract exist. For Claude/Gemini: deliver editable anchor IDs fb.pilgrim.ledger and fb.pilgrim.escort_return, with positions, facing, radius and safe approach; reuse existing proposed fb.pilgrim.warning and fb.pilgrim.recruit. Avoid placing interactions inside either battle trigger. Art is separate from quest authority.

Testing: existing Chapter 1 head passed Fantasy Battle and Base44 security workflows; Game 3D and WebGPU workflows failed. Chapter 2 adds regression tests for acceptance, first/second victory, old and new backup round trips, impossible claims, unknown state fields and original journal wiring. New head CI and desktop/mobile visual fit remain required. Next: Chapter 3 and reusable side quest / discovery integration.
