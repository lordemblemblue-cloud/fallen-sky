import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const fail = (message: string, status = 400) => { throw Object.assign(new Error(message), { status }); };
const cleanText = (value: unknown, label: string, max: number) => {
  if (typeof value !== 'string') fail(label + ' must be text');
  const result = (value as string).trim();
  if (!result) fail(label + ' is required');
  if (result.length > max) fail(label + ' is too long (maximum ' + max + ' characters)');
  return result;
};
const safeChannel = (channel: any) => ({
  id: channel.id, game_id: channel.game_id, name: channel.name,
  channel_type: channel.channel_type || 'chat',
  access_scope: channel.access_scope || 'clan_only',
  created_by_clan_id: channel.created_by_clan_id,
  description: channel.description || '',
  capacity: channel.capacity || 50,
  requires_password: Boolean(channel.join_password_hash || channel.join_password),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ success: false, error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const data = body?.data || {};
    const { clanId, gameId } = data;
    if (typeof clanId !== 'string' || !clanId) fail('Clan is required');
    if (typeof gameId !== 'string' || !gameId) fail('Game is required');

    // All reads and writes are mediated by verified clan membership. Never
    // expose service-role entity reads directly to the browser.
    const entities = base44.asServiceRole.entities;
    const memberships = await entities.ClanMember.filter({ clan_id: clanId, user_id: user.id });
    const member = memberships?.[0];
    if (!member) fail('Clan membership required', 403);
    const privileged = member.role === 'leader' || member.role === 'officer';
    const channelFor = async (channelId: string) => {
      if (!channelId || typeof channelId !== 'string') fail('Forum channel is required');
      const channel = await entities.ClanFormChannel.get(channelId);
      if (!channel || channel.game_id !== gameId) fail('Forum channel not found', 404);
      const owner = channel.created_by_clan_id || channel.clan_id;
      const shared = channel.access_scope === 'all_clans';
      const joined = Array.isArray(channel.participating_clan_ids)
        && channel.participating_clan_ids.includes(clanId);
      if (owner !== clanId && (!shared || !joined)) fail('This clan has not joined the forum', 403);
      const leader = /(^|[-_\s])leaders?($|[-_\s])/.test(String(channel.name || '').toLowerCase())
        || channel.visibility_scope === 'leaders';
      if (leader && (owner !== clanId || !privileged)) fail('Leader forum is restricted', 403);
      return { channel, owner, shared, leader };
    };
    const topicFor = async (channelId: string, topicId: string) => {
      const scope = await channelFor(channelId);
      if (!topicId || typeof topicId !== 'string') fail('Topic is required');
      const topic = await entities.ClanFormTopic.get(topicId);
      if (!topic || topic.channel_id !== channelId || topic.game_id !== gameId) fail('Topic not found', 404);
      if (topic.visibility_scope === 'leaders' && (scope.owner !== clanId || !privileged)) {
        fail('Leader forum is restricted', 403);
      }
      if (scope.shared && topic.visibility_scope !== 'both'
          && topic.clan_id !== clanId) {
        fail('This topic is not shared with your clan', 403);
      }
      return { ...scope, topic };
    };

    if (action === 'session') {
      return json({ success: true, role: member.role, clanId, gameId });
    }

    if (action === 'list_shared_channels') {
      const channels = await entities.ClanFormChannel.filter({ game_id: gameId }, '-created_date', 150);
      return json({
        success: true,
        channels: (channels || [])
          .filter((channel: any) => channel.access_scope === 'all_clans'
            && (channel.is_open !== false || (channel.participating_clan_ids || []).includes(clanId)))
          .map((channel: any) => ({
            ...safeChannel(channel),
            joined: (channel.participating_clan_ids || []).includes(clanId),
          })),
      });
    }

    if (action === 'list_topics') {
      const { channelId } = data;
      const scope = await channelFor(channelId);
      const rows = await entities.ClanFormTopic.filter({ channel_id: channelId, game_id: gameId }, '-updated_date', 150);
      const topics = (rows || []).filter((topic: any) =>
        (topic.visibility_scope !== 'leaders' || (scope.owner === clanId && privileged))
        && (!scope.shared || topic.visibility_scope === 'both' || topic.clan_id === clanId));
      return json({ success: true, topics });
    }

    if (action === 'list_messages') {
      const { channelId, topicId } = data;
      await topicFor(channelId, topicId);
      // Legacy replies were written before channel_id was declared in the
      // entity schema. The verified topic ID anchors the channel, so these
      // messages can be read safely without losing older discussions.
      const rows = await entities.ClanFormMessage.filter(
        { topic_id: topicId, game_id: gameId }, '-created_date', 300,
      );
      const messages = (rows || []).filter((item: any) => !item.channel_id || item.channel_id === channelId);
      return json({ success: true, messages: messages.slice().reverse() });
    }

    if (action === 'create_topic') {
      const { channelId } = data;
      const scope = await channelFor(channelId);
      const title = cleanText(data.title, 'Topic title', 140);
      const visibility = scope.leader ? 'leaders' : scope.shared ? 'both' : 'clan';
      // The server determines visibility from the channel; the client cannot
      // elevate a private topic into cross-clan visibility by sending "shared".
      const topic = await entities.ClanFormTopic.create({
        channel_id: channelId, game_id: gameId,
        clan_id: clanId, title, created_by_user_id: user.id,
        status: 'open', visibility_scope: visibility,
        last_activity: new Date().toISOString(),
      });
      return json({ success: true, topic });
    }

    if (action === 'send_message') {
      const { channelId, topicId } = data;
      const { topic } = await topicFor(channelId, topicId);
      if (topic.status === 'closed') fail('This discussion is closed', 409);
      const content = cleanText(data.content, 'Reply', 6000);
      // A lightweight persisted cooldown discourages repeated posts.
      // Concurrent requests may race; stronger distributed limits can be
      // introduced separately if traffic requires them.
      const recent = await entities.ClanFormMessage.filter(
        { user_id: user.id, channel_id: channelId }, '-created_date', 1,
      );
      const last = recent?.[0] && Date.parse(recent[0].created_date || '');
      if (Number.isFinite(last) && Date.now() - last >= 0 && Date.now() - last < 900) {
        return json({ success: false, error: 'Please wait briefly before replying again' }, 429);
      }
      const message = await entities.ClanFormMessage.create({
        topic_id: topicId, channel_id: channelId, game_id: gameId,
        user_id: user.id, clan_id: clanId,
        username: user.full_name || user.username || user.email?.split('@')?.[0] || 'Player',
        content,
      });
      // A saved reply must be acknowledged even if the secondary activity
      // timestamp update fails; otherwise users retry and duplicate it.
      try {
        await entities.ClanFormTopic.update(topic.id, { last_activity: new Date().toISOString() });
      } catch (cause) {
        console.warn('Forum reply saved but topic activity timestamp could not refresh', cause);
      }
      return json({ success: true, message });
    }

    if (action === 'set_topic_status' || action === 'rename_topic') {
      const { channelId, topicId } = data;
      const { topic, owner: channelOwner } = await topicFor(channelId, topicId);
      const owner = topic.clan_id || channelOwner;
      const author = topic.created_by_user_id === user.id;
      const clanOfficer = privileged && owner === clanId;
      const hostOfficer = privileged && channelOwner === clanId;
      if (!author && !clanOfficer && !(action === 'set_topic_status' && hostOfficer)) {
        fail('Only the topic author or clan officers can manage this discussion', 403);
      }
      const patch = action === 'rename_topic'
        ? { title: cleanText(data.title, 'Topic title', 140) }
        : { status: data.status === 'closed' ? 'closed' : data.status === 'open' ? 'open' : fail('Invalid topic status') };
      const updated = await entities.ClanFormTopic.update(topicId, patch);
      return json({ success: true, topic: updated });
    }

    if (action === 'edit_message' || action === 'delete_message') {
      const { channelId, topicId, messageId } = data;
      const { topic, owner: channelOwner } = await topicFor(channelId, topicId);
      if (!messageId || typeof messageId !== 'string') fail('Reply is required');
      const message = await entities.ClanFormMessage.get(messageId);
      if (!message || (message.channel_id && message.channel_id !== channelId)
          || message.topic_id !== topicId || message.game_id !== gameId) fail('Reply not found', 404);
      const author = message.user_id === user.id;
      const canDelete = author || (privileged && (message.clan_id === clanId || channelOwner === clanId));
      // Moderators may remove abusive messages, but must never rewrite
      // another player's words under that player's displayed identity.
      if (action === 'edit_message' ? !author : !canDelete) {
        fail('You cannot modify this reply', 403);
      }
      if (message.deleted_at) fail('This reply was removed', 409);
      if (action === 'edit_message' && topic.status === 'closed') fail('This discussion is closed', 409);
      const patch = action === 'edit_message'
        ? { content: cleanText(data.content, 'Reply', 6000), edited_at: new Date().toISOString() }
        : { content: '[deleted]', deleted_at: new Date().toISOString() };
      const updated = await entities.ClanFormMessage.update(messageId, patch);
      return json({ success: true, message: updated });
    }

    return json({ success: false, error: 'Invalid forum action' }, 400);
  } catch (error) {
    console.error('Clan forum operations error:', error);
    return json({ success: false, error: error?.message || 'Clan forum operation failed' }, error?.status || 500);
  }
});
