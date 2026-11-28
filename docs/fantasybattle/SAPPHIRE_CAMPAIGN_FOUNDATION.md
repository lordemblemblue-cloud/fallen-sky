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

## Chapter 3 runtime slice — The Waterfall That Speaks

After the Pilgrim Road quest is claimed, the main waterfall quest unlocks in the existing journal. It tracks the recorded wilds_waterfall_01 encounter and unlocks optional Echoes Beneath the Falls after claim. The cave side quest uses the existing wilds_cave_01 encounter, including an earlier victory, to reveal why the bell in the prologue was heard before it rang. The Scout's invitation is shown only after the existing recruitment prerequisite and before recruitment. No new reward, character mapping, terrain or visual asset.

The quest catalog now supports allowlisted encounter and discovery objective types, main/side labels, prerequisite claims, progress derived from saved world records and bounded v1 campaign keys. The cave quest currently uses victory only: a physical echo-inspection trigger is not implemented. Do not represent it as a new landmark or reward until an approved map anchor is bound to a verified world discovery. Existing Chapter 2 saves and old Grove-only saves remain valid. The original journal and responsive fallback share the generalized list, actions and progress; the codex reveals only accepted or recorded campaign history. Existing service/quest and combat authority remains intact.

### Environment and placement handoff
- fb.waterfall.lookout: safe approach and narrative interaction, not inside battle radius; readable waterfall path and alternate retreat.
- fb.waterfall.recruit: position after the existing waterfall encounter return point, with room for the current party and keyboard/touch interaction.
- fb.cave.echo: optional, signposted branch; visual storytelling should suggest reversed echoes (without reliance on audio). Provide a stable return point and avoid requiring jumps or narrow ledges. The eventual discovery ID needs explicit review before it becomes an objective; the current cave victory is sufficient.
- Preserve existing encounter IDs and bounds. Claude/Gemini supply final geometry, character assets and coordinate manifest; no new coordinates inferred from artwork.
- Next: Chapter 4 Heights main quest, optional elite trial independent of main progression, relay story and placement handoff. Regression tests added; new CI, lint, build and device visual acceptance pending.

## Chapter 4 runtime slice — The Heights

The Heights unlocks after the waterfall main quest is claimed. Two recorded encounters (wilds_heights_01 and wilds_heights_02) determine completion, and neither cave investigation nor elite trial is required. The optional Trial of the Silent Watch unlocks at the same time and uses wilds_heights_elite; acceptance, progress and completion are independent of the main quest. Existing first-victory rewards remain authoritative. The shared journal, codex, save validation and portable backup use the catalog, with no new save version. The original exploration HUD and responsive fallback prioritize the current main objective, with optional active objectives shown when no main objective is pending; preparation dialogue at existing services gives a relevant story note. No difficulty or encounter behavior changes.

### Narrative and placement
- First relay: a repeated warning orders travelers to retreat. The Warden recognizes a broken command; the party discovers that the relay cannot distinguish the present from an old emergency.
- Second relay: a surviving fragment points to the sanctuary. The Scout observes that the signal becomes stronger uphill. The party clears the second existing encounter, rather than using a fictional lever or gate.
- Trial of the Silent Watch: an old guardian tests those approaching the sanctuary. The encounter entrance explicitly identifies it as optional and advises party preparation. A completed trial reveals the original purpose of the watch without blocking the main path.
- Claude/Gemini anchor handoff: fb.heights.relay (safe interaction at first relay), fb.heights.relay_upper (second relay), fb.heights.trial_warning (before elite trigger), fb.heights.rest_approach (safe preparation/retreat), and fb.heights.sanctuary_view (sightline toward next destination). Provide editable coordinates, walkable clearance, facing, interaction radius, keyboard/touch access, visible non-color-only cues and return paths. Keep existing encounter IDs; physical relay interactions and new geometry are pending.
- Chapter 3 head passed Fantasy Battle and Base44 security checks, shared Game 3D failed and WebGPU was still running at last check. Chapter 4 regression tests added; new head CI and visual/mobile acceptance pending. Next: Sapphire Sanctuary, its two required encounters and the gatekeeper story.

## Chapter 5 runtime slice — Sapphire Sanctuary

The main quest unlocks after Heights is claimed. Both wilds_sanctuary_guard and wilds_sanctuary_boss must be recorded; neither optional trial, cave investigation nor recruitment is required. A boss victory before quest acceptance is recognized, but cannot substitute for the outer guard objective. Journal, codex, HUD, service notes and portable save validation reuse the campaign catalog. Claim adds no loot, XP or gold; the existing first-victory reward transaction remains the authority.

The outer guard's warning explains the repeated emergency order. The Gatekeeper's introduction states that it waits for the light to return. Existing combat intent UI already displays phase names and action previews in both layouts: Astral Watch above 65% HP, Falling Stars above 30% through 65%, Total Eclipse at or below 30%. No phase, HP, damage, action or AI change is made. A verified non-practice victory with the recorded boss ID displays a story acknowledgement; the journal completion reveals that the original signal came from beyond the sanctuary. These are text beats, not a scripted cinematic or new NPC scene.

### Placement handoff
- fb.sanctuary.outer_warning: safe approach before guard trigger; readable warning and retreat.
- fb.sanctuary.prepare: recovery and equipment preparation near, but outside, the existing boss trigger. Do not invent free items or rest facilities.
- fb.sanctuary.gatekeeper_intro: clear sightline and safe return point, no automatic combat from dialogue.
- fb.sanctuary.epilogue: quiet post-battle position, with a visible route toward Moonveil. Do not put the required quest claim behind a yet-unimplemented physical interaction.
- Claude/Gemini own final art, map geometry and coordinates. Preserve existing encounter IDs and world bounds. Next: Chapter 6 Moonveil/Astral quests, optional keeper, conclusion to the currently playable arc (not the complete game story), campaign progress summary, tests and handoff.
- Chapter 4 passed Fantasy Battle and Base44 security checks; Game 3D and WebGPU failed. Chapter 5 tests added; latest CI, lint/build and visual testing pending.

## Chapter 6 runtime slice — Moonveil Gardens / Astral Ruins

The Last Unsent Message unlocks after the Sanctuary quest is claimed. Its three required encounter IDs are wilds_moonveil_01, wilds_astral_01 and wilds_astral_elite. The independent Keeper of Forgotten Rites side quest uses wilds_moonveil_elite, is not required for the conclusion, and remains available afterward. The Vanguard is an existing elite encounter, not a new boss. All story claims are journal acknowledgements; first-victory rewards remain the only combat reward path.

The six-chapter arc summary is derived from the actual Grove claim and the five main campaign quest records. It appears in the original and fallback journal; the HUD and service notes acknowledge completion when no active optional quest needs attention. The player may continue exploring, recruiting and completing optional quests. No forced credits, new save fields, invented enemies or automatic map unlocks. The observatory reveals the original source but deliberately leaves the identity of the person who withheld the final message unresolved. This closes the currently planned arc, not the entire game.

### Placement and asset handoff
- fb.moonveil.archive: readable historical marker near a safe path through the garden; distinguish background lore from quest authority.
- fb.moonveil.keeper_warning: optional encounter approach with clear retreat and non-color-only difficulty cue.
- fb.astral.signal_echo: safe sightline near the Wraith approach; no new discovery trigger yet.
- fb.astral.observatory: approach before the existing Vanguard encounter with room to prepare.
- fb.astral.epilogue: safe post-victory interaction location, with return route and no forced exit from the world.
- Claude/Gemini supply geometry, final anchor transforms, textures and character models. Keep established world bounds and encounter IDs; no physical interaction placement or new art in this PR.

### Release boundary
All six main chapters and three encounter-based side quests now have runtime journal support (the separate Last Escort ledger remains design-only). The UI and data use existing game systems; final integration still needs approved asset manifests, actual map/NPC anchors, cinematics, equipment content expansion, cloud-save work, performance and device acceptance. Chapter 5 passed Fantasy Battle and Base44 security checks; Game 3D failed and WebGPU was still running at last check. Chapter 6 adds regression tests for all six required claims, optional independence, duplicate prevention and portable saves. New-head CI is required before merge; do not publish this draft.

## Optional quest runtime slice — The Last Escort

After the Road of Unfinished Promises is claimed, the optional Last Escort appears in the existing journal. The existing disc_pilgrimage reliquary on the upper walkway represents the ledger evidence for this interim implementation; inspecting it before accepting counts. The player can accept via the journal or the Grove rest point, then returns to grove_service to complete the quest. The service interaction presents two optional, non-persistent conversation questions. Asking about the evacuation order before finding the ledger does not reveal its contents; returning with the recorded discovery confirms the evacuation order. The missing escort's fate remains unresolved. The journal directs players to the Grove, not a remote claim. Claim requires the live matching service marker and no battle; awards 20 gold once, capped by the existing wallet limit. This reward and the interim anchor substitutions are proposed balancing and placement decisions, not final user-approved canon. Treasure rewards are separate, with no new quest inventory item or save schema. Existing campaign saves and the six-chapter count remain compatible.

### Cinematic and physical NPC handoff (not yet rendered)
- fb.pilgrim.ledger: replace the existing disc_pilgrimage visual with a readable patrol ledger within the reliquary; avoid changing the persistent discovery ID. An optional shot frames the ledger, its evacuation seal and the distant roadway. The player must be able to skip or close the scene; no cinematic grants quest progress or loot.
- fb.pilgrim.escort_return: replace the interim Grove rest point conversation with the stranded traveler when the approved NPC/map anchor arrives. Preserve return-service validation or migrate deliberately. Camera starts at the traveler's eye line, then reveals the ledger; the traveler recognizes the seal, and the scene returns control to the player. The actual missing escort remains a future plot thread.
- Do not place the new actors or render cinematic sequences without approved graphics and transforms. Current delivery is a functional text conversation and journal reward, not a new NPC mesh, cutscene player or map change.

Prior treasure/economy head cc1c41b passed Fantasy Battle adventure checks and Base44 security. Shared Game 3D and WebGPU failed; new quest tests, lint/build and device acceptance are pending. Next: review NPC/object placement contracts and integrate approved live anchors without inventing geometry or server authority.
