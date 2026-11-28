// Entity automation handler for ClanMember create/delete events.
// Announcements require a verified automation signature; a publicly supplied
// member ID is never proof of a membership event. Deleted records cannot be
// re-read as proof, so deleted-member announcements fail closed. Replayed
// creation announcements are deduplicated.

import { readBoundedGuestBody } from '../../shared/readBoundedGuestBody.mjs';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const signedHex = (bytes: Uint8Array) =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
const sameHash = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
};

// A trusted producer signs timestamp.body with HMAC-SHA256. It must set
// x-clan-event-time (milliseconds) and x-clan-event-signature (lowercase hex).
Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('CLAN_MEMBERSHIP_EVENT_SECRET') || '';
  if (secret.length < 32) return respond({ error: 'Clan notification unavailable' }, 503);
  const stamp = req.headers.get('x-clan-event-time') || '';
  const signature = req.headers.get('x-clan-event-signature') || '';
  if (!/^[0-9]{13}$/.test(stamp) || !/^[0-9a-f]{64}$/.test(signature) ||
      Math.abs(Date.now() - Number(stamp)) > 120_000) {
    return respond({ error: 'Unauthorized' }, 401);
  }
  let raw: string | null;
  try {
    raw = await readBoundedGuestBody(req, 16_000);
  } catch {
    return respond({ error: 'Invalid request' }, 400);
  }
  if (raw === null) return respond({ error: 'Request too large' }, 413);
  // A slow request must not extend the signature's validity window.
  if (Math.abs(Date.now() - Number(stamp)) > 120_000) return respond({ error: 'Unauthorized' }, 401);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = signedHex(new Uint8Array(await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(stamp + '.' + raw))));
  if (!sameHash(signature, expected)) return respond({ error: 'Unauthorized' }, 401);
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole.entities;
    const payload = JSON.parse(raw || '{}');
    const event = payload?.event || {};
    const type = String(event.type || '');
    if (!['create', 'delete'].includes(type)) {
      return Response.json({ ok: true, skipped: 'not a membership event' });
    }

    // This function is publicly callable. After a membership is deleted we
    // cannot prove caller-supplied old_data ever existed, so unsigned delete
    // notifications must not be trusted as evidence of a player leaving.
    if (type === 'delete') {
      return Response.json({ ok: true, skipped: 'unverified membership deletion event' });
    }

    const rowId = String(payload?.data?.id || event.entity_id || '').trim();
    if (!rowId) return Response.json({ ok: true, skipped: 'no membership row' });

    // A join announcement requires a current server-stored membership row.
    const row = await svc.ClanMember.get(rowId).catch(() => null);
    if (!row?.clan_id || !row?.user_id) {
      return Response.json({ ok: true, skipped: 'membership row does not match event' });
    }

    const clanId = String(row.clan_id);
    const memberUserId = String(row.user_id);

    // The clan must exist and the player must be a real account.
    const [division, users] = await Promise.all([
      svc.Division.get(clanId).catch(() => null),
      svc.User.filter({ id: memberUserId }).catch(() => []),
    ]);
    if (!division || !users?.[0]) {
      return Response.json({ ok: true, skipped: 'unknown clan or player' });
    }
    const userName = users[0].full_name || users[0].username || users[0].email?.split('@')[0] || 'A player';

    // Find the default channel for this clan.
    const channels = await svc.ClanChannel.filter({ divisionId: clanId });
    const ch = channels[0];
    if (!ch) return Response.json({ ok: true, skipped: 'no channel' });

    const verb = type === 'create' ? 'joined the guild' : 'left the guild';
    const content = `${userName} has ${verb}.`;

    // One announcement per membership change, so replays cannot flood a channel.
    const existing = await svc.ClanMessage.filter(
      { divisionId: clanId, channelId: ch.id, content }, '-created_date', 1,
    );
    if (existing?.length) return Response.json({ ok: true, skipped: 'already announced' });

    await svc.ClanMessage.create({
      divisionId: clanId,
      channelId: ch.id,
      author: 'System',
      authorAvatar: '',
      content,
      userId: memberUserId,
      role: row.role || 'member',
      isAnnouncement: true,
      isPinned: false,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[clanMembershipNotifier] error:', error);
    return Response.json({ error: 'Clan notification unavailable' }, { status: 500 });
  }
});