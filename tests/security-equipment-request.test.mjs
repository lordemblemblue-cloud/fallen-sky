import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEquipmentRequest } from '../base44/shared/equipmentRequestValidation.mjs';

const slot = value => ['helmet','weapon-1','armor'].includes(value);
const parse = body => validateEquipmentRequest(body, slot);
test('malformed equipment envelopes cannot become getState', () => {
  for (const body of [null, [], 'getState', 42, true, {data:null}, {data:[]}, {action:['clear']}, {action:'constructor'}, {action:null}]) assert.ok(parse(body).error);
});
test('equipment mutation requires canonical string slot and card identifiers', () => {
  for (const value of [null, [], ['weapon-1'], {}, 1, 'unknown']) assert.ok(parse({action:'unequip',data:{slot:value}}).error);
  for (const value of [null, [], ['card-1'], {$ne:null}, 1, '', ' card-1', 'x'.repeat(161), 'card\n1']) assert.ok(parse({action:'equip',data:{slot:'weapon-1',user_card_id:value}}).error);
});
test('valid loadout operations and explicit empty object stay compatible', () => {
  assert.deepEqual(parse({}), {action:'getState',data:{}});
  for (const body of [
    {action:'getState'}, {action:'clear'}, {action:'unequip',data:{slot:'helmet'}},
    {action:'equip',data:{slot:'weapon-1',user_card_id:'card-1'}}
  ]) assert.equal(parse(body).action,body.action);
});
test('endpoint validates input before privileged access and loadout initialization', () => {
  const source = readFileSync(new URL('../base44/functions/equipmentLoadout/entry.ts',import.meta.url),'utf8');
  const validation = source.indexOf('const validated = validateEquipmentRequest(');
  const denial = source.indexOf('if (validated.error)');
  const privileged = source.indexOf('const svc = base44.asServiceRole.entities;');
  const initialize = source.indexOf('let loadout = await ensureLoadout(svc, user.id)');
  assert.ok(validation >= 0 && validation < denial && denial < privileged && privileged < initialize);
  assert.match(source,/req\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(source,/snapshotOwnedEquipment\(svc, user\.id, userCardId\)/);
  assert.match(source,/status > 499\) return json\(\{ error:'Equipment request failed' \}, 500\)/);
});
