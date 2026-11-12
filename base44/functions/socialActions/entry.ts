import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// The in-game friend system's server half. The game calls this with
// { action, data } through callGameServer() (src/components/game3d/social/socialServer.js):
//   send_friend_request      { target_user_id }
//   respond_friend_request   { request_id, decision: 'accept' | 'decline' }
// The request, friendship and notification tables only take server writes, so every
// mutation here runs as the service role after the caller has been verified.

type AnyObj = Record<string, any>;

const displayName = (user: AnyObj | null, fallback?: string) =>
  user?.full_name || user?.username || fallback || 'Player';

async function findFriendship(base44: any, a: string, b: string) {
  const [asA, asB] = await Promise.all([
    base44.asServiceRole.entities.SocialFriendship.filter({ user_a_id: a, user_b_id: b }, '-created_date', 1).catch(() => []),
    base44.asServiceRole.entities.SocialFriendship.filter({ user_a_id: b, user_b_id: a }, '-created_date', 1).catch(() => []),
  ]);
  return (asA || [])[0] || (asB || [])[0] || null;
}

async function findPendingRequest(base44: any, a: string, b: string) {
  const rows = await base44.asServiceRole.entities.FriendRequest.filter(
    { status: 'pending', sender_id: a, receiver_id: b }, '-created_date', 5,
  ).catch(() => []);
  return (rows || [])[0] || null;
}

async function notify(base44: any, payload: AnyObj) {
  await base44.asServiceRole.entities.SocialNotification.create(payload).catch(() => null);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const data: AnyObj = body?.data || {};

    if (action === 'send_friend_request') {
      const targetId = String(data.target_user_id || '');
      if (!targetId) return Response.json({ error: 'Invalid target', code: 'invalid' }, { status: 422 });
      if (targetId === user.id) return Response.json({ error: "That's you!", code: 'self' }, { status: 422 });

      const target = await base44.asServiceRole.entities.User.get(targetId).catch(() => null);
      if (!target) return Response.json({ error: 'Player not found', code: 'not_found' }, { status: 404 });

      const existing = await findFriendship(base44, user.id, targetId);
      if (existing) return Response.json({ already_friends: true, request: null });

      const pending = await findPendingRequest(base44, user.id, targetId);
      if (pending) return Response.json({ request: pending, already_pending: true });

      const myName = displayName(user);
      const request = await base44.asServiceRole.entities.FriendRequest.create({
        sender_id: user.id,
        sender_name: myName,
        sender_avatar: user.avatar_url || '',
        receiver_id: targetId,
        status: 'pending',
      });

      await notify(base44, {
        recipient_id: targetId,
        actor_id: user.id,
        actor_name: myName,
        type: 'friend_request',
        title: 'Friend request',
        body: `${myName} wants to be friends`,
        request_id: request.id,
        read: false,
      });

      return Response.json({ request });
    }

    if (action === 'respond_friend_request') {
      const requestId = String(data.request_id || '');
      const decision = String(data.decision || '');
      if (!requestId) return Response.json({ error: 'Invalid request', code: 'invalid' }, { status: 422 });
      if (decision !== 'accept' && decision !== 'decline') {
        return Response.json({ error: 'Invalid decision', code: 'invalid' }, { status: 422 });
      }

      const request = await base44.asServiceRole.entities.FriendRequest.get(requestId).catch(() => null);
      if (!request) return Response.json({ error: 'Request not found', code: 'not_found' }, { status: 404 });
      if (request.receiver_id !== user.id) {
        return Response.json({ error: 'This request is not yours', code: 'forbidden' }, { status: 403 });
      }
      if (request.status !== 'pending') {
        return Response.json({ error: 'This request was already answered', code: 'conflict' }, { status: 409 });
      }

      const senderId = request.sender_id;
      const myName = displayName(user);
      let friendship: AnyObj | null = null;

      if (decision === 'accept') {
        // One row per pair; the game reads both directions and de-duplicates.
        const first = String(user.id) < String(senderId) ? user.id : senderId;
        const second = first === user.id ? senderId : user.id;
        const [firstUser, secondUser] = await Promise.all([
          base44.asServiceRole.entities.User.get(first).catch(() => null),
          base44.asServiceRole.entities.User.get(second).catch(() => null),
        ]);
        friendship = await base44.asServiceRole.entities.SocialFriendship.create({
          user_a_id: first,
          user_a_name: displayName(firstUser, first === user.id ? myName : request.sender_name),
          user_b_id: second,
          user_b_name: displayName(secondUser, second === user.id ? myName : request.sender_name),
        });
      }

      await base44.asServiceRole.entities.FriendRequest.update(request.id, {
        status: decision === 'accept' ? 'accepted' : 'declined',
      });

      await notify(base44, {
        recipient_id: senderId,
        actor_id: user.id,
        actor_name: myName,
        type: decision === 'accept' ? 'friend_accepted' : 'friend_declined',
        title: decision === 'accept' ? 'Friend request accepted' : 'Friend request declined',
        body: decision === 'accept'
          ? `${myName} accepted your friend request`
          : `${myName} declined your friend request`,
        request_id: request.id,
        read: false,
      });

      return Response.json({
        accepted: decision === 'accept',
        mutual: Boolean(friendship),
        friendship,
        request: { ...request, status: decision === 'accept' ? 'accepted' : 'declined' },
      });
    }

    return Response.json({ error: 'Invalid action', code: 'invalid' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error?.message || String(error), code: 'server' }, { status: 400 });
  }
});