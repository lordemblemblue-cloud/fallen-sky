/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateOpeningRegionDraft } from '../scripts/validate-fallen-sky-opening-region.mjs';
import { createOpeningQuestAdapter } from '../src/components/game3d/narrative/openingQuestAdapter.mjs';
const draft=JSON.parse(readFileSync(new URL('../docs/game3d/threads-of-our-pain/NPC_PHASE46_OPENING_REGION.json',import.meta.url),'utf8'));
test('opening draft graph valid',()=>{const r=validateOpeningRegionDraft(draft);assert.ok(r.ok,r.errors.join('\n'));});
const cases=[
["premature activation",d=>{d.enabled=true;}],
["invented coordinates",d=>{d.nodes[0].transform=[0,0,0];}],
["duplicate anchor",d=>{d.nodes.push(d.nodes[0]);}],
["missing merchant",d=>{d.nodes=d.nodes.filter(n=>n.id!=="M01_MERCHANT");}],
["missing lower route",d=>{d.edges=d.edges.filter(e=>e.from!=="M01_STREAM_PATH");}],
["cue bypass",d=>{d.edges.push({...d.edges[0],from:"M01_SPAWN",to:"M01_CLEARING_EDGE"});}],
["edge into fragment",d=>{d.edges.push({...d.edges[0],to:"M02_FRAGMENT"});}],
["premature arena entry",d=>{d.edges.push({...d.edges[0],to:"M03_ARENA_START"});}],
["missing readiness gate",d=>{d.arenaHandoff.requires.pop();}],
["forced combat",d=>{d.restrictions.noCombatM01M02=false;}],
["forced camera",d=>{d.restrictions.noForcedCamera=false;}],
["forced optional quest",d=>{d.objectiveDefinitions[1].requires.push("S01");}],
["enabled quest",d=>{d.objectiveDefinitions[0].enabled=true;}],
["missing proximity alternative",d=>{d.eventAlternatives.merchant_warning=["interaction"];}],
["missing outer lookout",d=>{d.arenaHandoff.from.pop();}],
["missing safe exit",d=>{d.edges=d.edges.filter(e=>e.to!=="M02_RETREAT"&&e.from!=="M02_RETREAT");}],
["wrong reality",d=>{d.reality="ORIGINAL";}],
["malformed graph",d=>{d.edges=null;}],
];
for(const [name,mutate] of cases)test('rejects '+name,()=>{const d=JSON.parse(JSON.stringify(draft));mutate(d);assert.equal(validateOpeningRegionDraft(d).ok,false);});
test('authored definitions accepted by Phase 45 but disabled',()=>{const a=createOpeningQuestAdapter({definitions:draft.objectiveDefinitions,contentRevision:'phase46_draft'});const scope={ownerId:'__anon__',characterId:'char_test',campaignId:'campaign_test'};const s=a.newSnapshot(scope);const r=a.append(s,{scope,expectedRevision:0,event:{eventId:'accept1',questId:'M01',kind:'ACCEPT',reality:'PRESERVED',objectiveId:null}});assert.equal(r.reason,'UNKNOWN_OR_DISABLED_QUEST');});
