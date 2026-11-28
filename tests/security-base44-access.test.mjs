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
      assert.ok(rule?.[verb] && typeof rule[verb] === 'object',
        `${name}.${verb} must have an explicit access rule`);
      assert.match(JSON.stringify(rule[verb]), /"user\.id"|"{{user\.id}}"|"role":"admin"/,
        `${name}.${verb} must depend on an authenticated identity or admin role`);
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

test('party cleanup requires a valid server-side signature before service-role access', () => {
  const source = readFileSync(new URL('../base44/functions/partyLifecycle/entry.ts', import.meta.url), 'utf8');
  assert.match(source, /PARTY_LIFECYCLE_EVENT_SECRET/);
  assert.match(source, /sameSignature\(signature, expected\)/);
  assert.match(source, /Math\.abs\(Date\.now\(\) - Number\(stamp\)\) > 120_000/);
  assert.ok(source.indexOf('sameSignature(signature, expected)') < source.indexOf('base44.asServiceRole'),
    'privileged data access must occur only after signature verification');
});
test('clan officers cannot be self-appointed through direct entity mutations', () => {
  const member = entity('ClanMember');
  assert.deepEqual(member.rls.update, { user_condition: { role: 'admin' } });
  const source = readFileSync(new URL('../base44/functions/clanSystem/entry.ts', import.meta.url), 'utf8');
  assert.match(source, /newRole !== 'member' && newRole !== 'officer'/);
  assert.match(source, /base44\.asServiceRole\.entities\.ClanMember\.update\(target\[0\]\.id/);
});

test('avatars cannot directly change owner, equipment, level, XP or unlocks', () => {
  const avatar = entity('Avatar');
  const admin = { user_condition: { role: 'admin' } };
  assert.deepEqual(avatar.properties.user_id.rls.update, admin);
  for (const field of [
    'level', 'experience', 'social_influence', 'reputation_badges',
    'equipped_items', 'unlocked_abilities', 'active_companions',
  ]) {
    assert.deepEqual(avatar.properties[field].rls.update, admin, `${field}.update`);
    assert.deepEqual(avatar.properties[field].rls.create, admin, `${field}.create`);
  }
  const code = readFileSync(new URL('../base44/functions/avatarSystem/entry.ts', import.meta.url), 'utf8');
  assert.match(code, /base44\.asServiceRole\.entities\.Avatar\.create\(/);
  assert.match(code, /use_equipment_loadout/);
  const loadout = readFileSync(new URL('../base44/functions/equipmentLoadout/entry.ts', import.meta.url), 'utf8');
  assert.match(loadout, /snapshotOwnedEquipment\(svc, user\.id, userCardId\)/);
});

test('ownership and authorship fields cannot be rewritten by their owners', () => {
  const admin = { user_condition: { role: 'admin' } };
  for (const field of ['user_id', 'avatar_id']) {
    assert.deepEqual(entity('AvatarObservationSettings').properties[field].rls.update, admin);
  }
  for (const field of ['user_id', 'clan_id', 'topic_id', 'channel_id', 'username']) {
    assert.deepEqual(entity('ClanFormMessage').properties[field].rls.update, admin);
  }
});

test('clan notification handler verifies HMAC before touching privileged data', () => {
  const code = readFileSync(new URL('../base44/functions/clanMembershipNotifier/entry.ts', import.meta.url), 'utf8');
  assert.match(code, /CLAN_MEMBERSHIP_EVENT_SECRET/);
  assert.match(code, /sameHash\(signature, expected\)/);
  assert.match(code, /Math\.abs\(Date\.now\(\) - Number\(stamp\)\) > 120_000/);
  assert.ok(code.indexOf('sameHash(signature, expected)') < code.indexOf('base44.asServiceRole'),
    'unverified clan events must never reach the admin entity client');
});
test('private clan chat and leader forums cannot be read directly by visitors', () => {
  const admin = { user_condition: { role: 'admin' } };
  for (const name of ['ClanMessage', 'ClanFormMessage', 'ClanFormTopic', 'ClanFormChannel']) {
    assert.deepEqual(entity(name).rls.read, admin, `${name}.read`);
  }
  assert.deepEqual(entity('AvatarRuntimeModel_TEMP_CHECK').rls.read, admin);
  for (const [name, fields] of [
    ['AvatarHomeState', ['activityLog', 'preferences']],
    ['ClanVaultItem', ['note']],
    ['GuildResource', ['note']],
    ['Party', ['voiceRoomId']],
  ]) {
    for (const field of fields) {
      assert.deepEqual(entity(name).properties[field].rls.read, admin, `${name}.${field}.read`);
    }
  }
});

test('server validates clan membership and channel roles before reading chat', () => {
  const server = readFileSync(new URL('../base44/functions/secureClanAccess/entry.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../src/components/game3d/clan/clanStore.jsx', import.meta.url), 'utf8');
  assert.match(server, /clan_id: divisionId,\s*user_id: userId/);
  assert.match(server, /verifyChannel\(base44, divisionId, entityData\?\.channelId, membership\)/);
  assert.match(server, /channel\.divisionId !== divisionId/);
  assert.match(server, /channel\.role_restriction/);
  assert.match(server, /message\[0\]\.userId === user\.id/);
  assert.match(server, /const allowed = \{\}/);
  assert.doesNotMatch(server, /Division\.update\(divisionId, entityData\)/);
  assert.match(client, /functions\.invoke\('secureClanAccess'/);
  assert.doesNotMatch(client, /entities\.ClanMessage\.(filter|list|get|subscribe)/);
  assert.doesNotMatch(client, /base44\.asServiceRole/);
});

test('guest save streaming preserves valid UTF-8 including split characters', async () => {
  const { readBoundedGuestBody } = await import('../base44/shared/readBoundedGuestBody.mjs');
  const raw = JSON.stringify({ name: '月🌙é' });
  const bytes = new TextEncoder().encode(raw);
  const body = new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } });
  assert.equal(await readBoundedGuestBody({ body }, raw.length), raw);
  assert.equal(await readBoundedGuestBody(new Request('https://example.test', { method: 'POST', body: '' })), '');
});

test('guest save streaming cancels oversized bodies before consuming the remainder', async () => {
  const { readBoundedGuestBody } = await import('../base44/shared/readBoundedGuestBody.mjs');
  for (const chunk of [new Uint8Array(40).fill(97), new Uint8Array(11).fill(97)]) {
    let cancelled = false;
    const body = new ReadableStream({ start(c) { c.enqueue(chunk); }, cancel() { cancelled = true; } });
    assert.equal(await readBoundedGuestBody({ body }, 10), null);
    assert.equal(cancelled, true);
    assert.equal(body.locked, false);
  }
});

test('guest save request size enforcement precedes parsing and privileged access', () => {
  const source = readFileSync(new URL('../base44/functions/guestCharacterVault/entry.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /await req\.text\(/);
  assert.match(source, /const raw = await readBoundedGuestBody\(req\)/);
  assert.match(source, /if \(raw === null\) return json\(\{ error: 'Save request is too large' \}, 413\)/);
  assert.ok(source.indexOf('await readBoundedGuestBody(req)') < source.indexOf('JSON.parse(raw'));
  assert.ok(source.indexOf('JSON.parse(raw') < source.indexOf('const base44 = createClientFromRequest(req)'));
});

test('signed automation endpoints bound request memory and check signature freshness before privileged access', () => {
  for (const name of ['partyLifecycle', 'clanMembershipNotifier']) {
    const source = readFileSync(new URL('../base44/functions/' + name + '/entry.ts', import.meta.url), 'utf8');
    const bodyRead = source.indexOf('await readBoundedGuestBody(req, 16_000)');
    const freshness = 'Math.abs(Date.now() - Number(stamp)) > 120_000';
    const first = source.indexOf(freshness);
    const last = source.lastIndexOf(freshness);
    const hmac = source.indexOf('crypto.subtle.sign');
    const service = source.indexOf('base44.asServiceRole');
    assert.doesNotMatch(source, /await req\.text\(/, name);
    assert.ok(first >= 0 && first < bodyRead && bodyRead < last && last < hmac && hmac < service, name);
    assert.match(source, /if \(raw === null\) return (reply|respond)\(\{ error: 'Request too large' \}, 413\)/, name);
    assert.match(source, /if \(!same(Signature|Hash)\(signature, expected\)\)/, name);
  }
});
