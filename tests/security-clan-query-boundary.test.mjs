import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../base44/functions/secureClanAccess/entry.ts', import.meta.url), 'utf8')
  .replace(/^import [^\n]+\n/, '');

function harness({ role = 'member', restriction = 'none', member = true } = {}) {
  const calls = [];
  let handler;
  const entities = {
    ClanMember: { async filter(query, sort, limit) { calls.push(['membership', query, limit]); return member ? [{ role }] : []; } },
    ClanChannel: { async get(id) { calls.push(['channel', id]); return { divisionId: 'clan-1', role_restriction: restriction }; } },
    ClanMessage: { async filter(query) { calls.push(['messages', query]); return []; } },
    Division: { async filter(query) { calls.push(['public', query]); return []; } },
  };
  runInNewContext(source, { Deno: { serve(fn) { handler = fn; } }, Response, console,
    createClientFromRequest() { return { auth: { async me() { return { id: 'user-1', role: 'user' }; } }, asServiceRole: { entities } }; } });
  return { calls, invoke: body => handler({ json: async () => body }) };
}

test('invalid identifiers never reach privileged queries', async () => {
  for (const divisionId of [{ $ne: null }, ['clan-1'], null, '', 'x'.repeat(161), ' clan-1', 123]) {
    const h = harness();
    assert.equal((await h.invoke({ operation: 'getMembers', divisionId })).status, 400);
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  assert.equal((await h.invoke({ operation: 'deleteMessage', divisionId: 'clan-1', entityId: { $ne: null } })).status, 400);
  assert.equal(h.calls.length, 0);
});

test('member listing is scoped to canonical clan_id and bounded', async () => {
  const h = harness();
  assert.equal((await h.invoke({ operation: 'getMembers', divisionId: 'clan-1', limit: 500 })).status, 200);
  assert.equal(h.calls.length, 2);
  assert.equal(JSON.stringify(h.calls[0][1]), JSON.stringify({ clan_id: 'clan-1', user_id: 'user-1' }));
  assert.equal(JSON.stringify(h.calls[1][1]), JSON.stringify({ clan_id: 'clan-1' }));
  assert.equal(h.calls[1][2], 100);
  const denied = harness({ member: false });
  assert.equal((await denied.invoke({ operation: 'getMembers', divisionId: 'clan-1' })).status, 403);
  assert.equal(denied.calls.length, 1);
});

test('unknown or inherited channel roles fail closed', async () => {
  for (const restriction of ['__proto__', 'constructor', 'toString', 'unknown', 'officer']) {
    const h = harness({ restriction });
    assert.equal((await h.invoke({ operation: 'getMessages', divisionId: 'clan-1', entityData: { channelId: 'channel-1' } })).status, 403);
    assert.ok(!h.calls.some(([kind]) => kind === 'messages'));
  }
  const h = harness({ role: 'officer', restriction: 'officer' });
  assert.equal((await h.invoke({ operation: 'getMessages', divisionId: 'clan-1', entityData: { channelId: 'channel-1' } })).status, 200);
  assert.ok(h.calls.some(([kind]) => kind === 'messages'));
});

test('public listing remains available to authenticated callers without a clan', async () => {
  const h = harness();
  assert.equal((await h.invoke({ operation: 'listPublic' })).status, 200);
  assert.equal(h.calls[0][0], 'public');
});
