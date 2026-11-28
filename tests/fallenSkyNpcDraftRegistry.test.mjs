import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateNpcDraftRegistry } from '../scripts/validate-fallen-sky-npc-draft.mjs';

const registry = JSON.parse(readFileSync(new URL('../docs/game3d/threads-of-our-pain/NPC_PHASE42_REGISTRY.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

test('actual Phase 42 draft passes with exact coverage and zero enabled actors', () => {
  const result = validateNpcDraftRegistry(registry);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.coverage, {"actors":30,"mainAssociations":20,"sideCoordination":55,"requiredCanonicalIds":125,"enabledActors":0});
});

const cases = [
  ["duplicate actor", d=>{d.actors[1].proposedNpcId=d.actors[0].proposedNpcId;}],
  ["missing actor", d=>{d.actors.pop();}],
  ["extra actor", d=>{d.actors.push(JSON.parse(JSON.stringify(d.actors[0])));}],
  ["duplicate side coordination", d=>{d.actors[1].sideQuestCoordination.push("S01");}],
  ["duplicate within actor", d=>{d.actors[0].sideQuestCoordination.push("S01");}],
  ["missing side coordination", d=>{d.actors[0].sideQuestCoordination.pop();}],
  ["unknown side ID", d=>{d.actors[0].sideQuestCoordination[0]="S99";}],
  ["unknown main association", d=>{d.actors[0].mainStoryAssociations.push("D01");}],
  ["missing main association", d=>{d.actors[0].mainStoryAssociations=[];}],
  ["missing canonical discovery", d=>{d.canonicalIds.discoveries.pop();}],
  ["duplicate canonical main", d=>{d.canonicalIds.main[1]="M01";}],
  ["unknown canonical side", d=>{d.canonicalIds.side[0]="S56";}],
  ["enabled draft", d=>{d.actors[0].enabled=true;}],
  ["missing enabled field", d=>{delete d.actors[0].enabled;}],
  ["string enabled flag", d=>{d.actors[0].enabled="false";}],
  ["approved actor", d=>{d.actors[0].contentStatus="APPROVED";}],
  ["incorrect reality", d=>{d.actors[19].reality="PRESERVED";}],
  ["unrecognized reality", d=>{d.actors[0].reality="OTHER";}],
  ["duplicate personal prefix", d=>{d.actors[2].proposedPersonalPrefix=d.actors[1].proposedPersonalPrefix;}],
  ["unapproved Aldren prefix", d=>{d.actors[0].proposedPersonalPrefix="ALD";}],
  ["duplicate name", d=>{d.actors[1].name="  ALDREN ";}],
  ["antagonist quest giver field", d=>{d.actors[29].questGiver=true;}],
  ["Hesper verifier field", d=>{d.actors[24].evidenceVerifier=true;}],
  ["physical presence field", d=>{d.actors[19].physicalPresence=true;}],
  ["wrong S38/S51 thematic assignment", d=>{[d.actors[24].sideQuestCoordination,d.actors[29].sideQuestCoordination]=[d.actors[29].sideQuestCoordination,d.actors[24].sideQuestCoordination];}],
  ["wrong version", d=>{d.schemaVersion=2;}],
  ["live registry", d=>{d.status="LIVE";}],
  ["malformed actor", d=>{d.actors[0]=null;}],
  ["malformed refs", d=>{d.actors[0].sideQuestCoordination={S01:true};}],
  ["malformed canonical ids", d=>{d.canonicalIds=null;}],
  ["unsupported top-level activation field", d=>{d.active=true;}],
  ["blank name", d=>{d.actors[0].name=" ";}],
  ["null input", ()=>null],
  ["array input", ()=>[]],
];
for (const [name, mutate] of cases) {
  test('rejects ' + name, () => {
    const data = clone(registry);
    const changed = mutate(data);
    const result = validateNpcDraftRegistry(changed === undefined ? data : changed);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  });
}
test('does not mutate input', () => {
  const before = JSON.stringify(registry);
  validateNpcDraftRegistry(registry);
  assert.equal(JSON.stringify(registry), before);
});
test('accepts valid reordered entries', () => {
  const data = clone(registry);
  data.actors.reverse();
  data.canonicalIds.main.reverse();
  assert.equal(validateNpcDraftRegistry(data).ok, true);
});
