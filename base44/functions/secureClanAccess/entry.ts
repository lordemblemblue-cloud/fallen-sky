import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function checkClanMembership(base44, userId, divisionId) {
  const membership = await base44.asServiceRole.entities.ClanMember.filter({
    clan_id: divisionId,
    user_id: userId
  });
  
  return membership && membership.length > 0 ? membership[0] : null;
}

async function isClanLeader(base44, userId, divisionId) {
  const member = await checkClanMembership(base44, userId, divisionId);
  return member?.role === 'leader';
}
async function verifyChannel(base44, divisionId, channelId, membership) {
  if (typeof channelId !== 'string' || !channelId || channelId.length > 160) {
    throw Object.assign(new Error('Channel required'), {status:400});
  }
  const channel = await base44.asServiceRole.entities.ClanChannel.get(channelId).catch(() => null);
  if (!channel || channel.divisionId !== divisionId) {
    throw Object.assign(new Error('Channel not found'), {status:404});
  }
  const rank = new Map([['member', 0], ['officer', 1], ['leader', 2]]);
  const required = new Map([['none', 0], ['officer', 1], ['leader', 2]])
    .get(channel.role_restriction || 'none');
  if (required === undefined || (rank.get(membership?.role) ?? -1) < required) {
    throw Object.assign(new Error('Restricted channel'), {status:403});
  }
  return channel;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { operation, divisionId, entityId, entityData, limit } = body;
    const operations = ['listPublic', 'getMessages', 'postMessage', 'deleteMessage', 'getMembers', 'updateClan'];
    const validId = value => typeof value === 'string' && value.length > 0 &&
      value.length <= 160 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
    if (!operations.includes(operation) ||
        (operation !== 'listPublic' && !validId(divisionId)) ||
        (operation === 'deleteMessage' && !validId(entityId))) {
      return Response.json({ error: 'Invalid operation or identifier' }, { status: 400 });
    }
    
    // Validate clan membership for all operations
    let membership = null;
    if (operation !== 'listPublic') {
      membership = await checkClanMembership(base44, user.id, divisionId);

      if (!membership) {
        return Response.json({ error: 'Forbidden: Not a clan member' }, { status: 403 });
      }
    }
    
    let result;
    
    switch (operation) {
      case 'listPublic':
        // Public clan list
        {
          const safeLimit = Math.min(50, Math.max(1, Number.isInteger(limit) ? limit : 20));
          const rows = await base44.asServiceRole.entities.Division.filter(
            { is_public: true }, '-created_date', safeLimit);
          result = (rows || []).map(({id,name,description,emblem_url,banner_url}) =>
            ({id,name,description,emblem_url,banner_url}));
        }
        break;
        
      case 'getMessages':
        // Get clan messages (members only)
        if (!divisionId) {
          return Response.json({ error: 'Division ID required' }, { status: 400 });
        }
        
        // Enforce max limit
        const maxLimit = 100;
        const safeLimit = Math.min(maxLimit, Math.max(1, Number.isInteger(limit) ? limit : 50));
        
        await verifyChannel(base44, divisionId, entityData?.channelId, membership);
        result = await base44.asServiceRole.entities.ClanMessage.filter(
          { divisionId, channelId: entityData.channelId },
          '-created_date', safeLimit
        );
        break;
        
      case 'postMessage':
        // Post message (members only)
        if (!divisionId) {
          return Response.json({ error: 'Division ID required' }, { status: 400 });
        }
        
        // Built from server-verified values only: the author, the user id and
        // the role come from the authenticated caller and their ClanMember row,
        // and announcements/pins stay officer-only. Client-supplied identity
        // fields are never spread into the message.
        {
          const content = typeof entityData?.content === 'string' ? entityData.content.trim() : '';
          if (!content) {
            return Response.json({ error: 'Message is required' }, { status: 400 });
          }
          if (content.length > 4000) {
            return Response.json({ error: 'Message is too long' }, { status: 400 });
          }
          await verifyChannel(base44, divisionId, entityData?.channelId, membership);
          const officer = ['leader', 'officer'].includes(membership?.role);
          result = await base44.asServiceRole.entities.ClanMessage.create({
            divisionId,
            channelId: entityData.channelId,
            author: user.full_name || user.username || user.email?.split('@')?.[0] || 'Player',
            authorAvatar: user.avatar_url || '',
            content,
            userId: user.id,
            role: membership?.role || 'member',
            isAnnouncement: officer ? Boolean(entityData?.isAnnouncement) : false,
            isPinned: officer ? Boolean(entityData?.isPinned) : false,
          });
        }
        break;
        
      case 'deleteMessage':
        // Delete message (author or leader only)
        if (!entityId) {
          return Response.json({ error: 'Message ID required' }, { status: 400 });
        }
        
        const message = await base44.asServiceRole.entities.ClanMessage.filter({ id: entityId });
        if (!message || message.length === 0) {
          return Response.json({ error: 'Message not found' }, { status: 404 });
        }
        
        if (!divisionId || message[0].divisionId !== divisionId) {
          return Response.json({ error: 'Message not found' }, {status:404});
        }
        await verifyChannel(base44, divisionId, message[0].channelId, membership);
        const isAuthor = message[0].userId === user.id;
        const isLeader = await isClanLeader(base44, user.id, divisionId);
        
        if (!isAuthor && !isLeader && user.role !== 'admin') {
          return Response.json({ error: 'Forbidden: Cannot delete this message' }, { status: 403 });
        }
        
        result = await base44.asServiceRole.entities.ClanMessage.delete(entityId);
        break;
        
      case 'getMembers':
        // Get clan members
        if (!divisionId) {
          return Response.json({ error: 'Division ID required' }, { status: 400 });
        }
        
        result = await base44.asServiceRole.entities.ClanMember.filter({ clan_id: divisionId }, '-created_date', Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 100)));
        break;
        
      case 'updateClan':
        // Update clan (leader only)
        if (!divisionId) {
          return Response.json({ error: 'Division ID required' }, { status: 400 });
        }
        
        const isLeaderUpdate = await isClanLeader(base44, user.id, divisionId);
        if (!isLeaderUpdate && user.role !== 'admin') {
          return Response.json({ error: 'Forbidden: Only clan leader can update' }, { status: 403 });
        }
        
        // A clan leader may edit public profile fields, never arbitrary entity data.
        const allowed = {};
        for (const key of ['name','description','emblem_url','banner_url']) {
          if (typeof entityData?.[key] === 'string' && entityData[key].length <= 1000) {
            allowed[key] = entityData[key].trim();
          }
        }
        if (!Object.keys(allowed).length) {
          return Response.json({ error: 'No supported updates' }, {status:400});
        }
        result = await base44.asServiceRole.entities.Division.update(divisionId, allowed);
        break;
        
      default:
        return Response.json({ error: 'Invalid operation' }, { status: 400 });
    }
    
    return Response.json({ success: true, data: result });
    
  } catch (error) {
    console.error('Clan Access Error:', error.message);
    return Response.json({ error: 'Operation failed. Please try again.' }, { status: error?.status || 500 });
  }
});