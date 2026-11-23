// Security invariants for the guest-first game app.
// These records are managed by authorized backend flows, never direct visitor writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const restricted = [
  'ClanFormMessage',
  'ClanInvite',
  'ClanChannel',
  'ClanFormTopic',
  'Party',
  'PartyEvent',
  'ClanFormChannel',
  'ClanEvent',
];

function entity(name) {
  return JSON.parse(readFileSync(new URL(`../base44/entities/${name}.jsonc`, import.meta.url), 'utf8'));
}

test('all sensitive clan and party records refuse anonymous direct mutations', () => {
  for (const name of restricted) {
    const rule = entity(name).rls;
    for (const verb of ['create', 'update', 'delete']) {
      assert.notEqual(rule?.[verb], null, `${name}.${verb} must not have public access`);
      assert.deepEqual(rule?.[verb], { user_condition: { role: 'admin' } }, `${name}.${verb} is restricted to server/admin workflows`);
    }
  }
});

test('invites and party event records are not public-readable', () => {
  assert.notEqual(entity('ClanInvite').rls.read, null);
  assert.notEqual(entity('PartyEvent').rls.read, null);
  assert.match(JSON.stringify(entity('ClanInvite').rls.read), /data\.inviteeId/);
  assert.match(JSON.stringify(entity('PartyEvent').rls.read), /data\.target_user_id/);
});

test('clan membership notifications never trust an unsigned deleted row payload', () => {
  const source = readFileSync(new URL('../base44/functions/clanMembershipNotifier/entry.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(type === 'delete'\)\s*\{\s*return Response\.json\(\{ ok: true, skipped: 'unverified membership deletion event' \}\)/);
  assert.match(source, /const row = await svc\.ClanMember\.get\(rowId\)/);
});
