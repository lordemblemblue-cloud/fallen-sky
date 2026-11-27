import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const hex = (bytes: Uint8Array) => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
async function passwordDigest(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:600000}, key, 256)));
}
async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return hex(salt) + '.' + await passwordDigest(password, salt);
}
async function matchesPassword(password: string, stored: string) {
  if (!/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(stored)) return false;
  const [salt, expected] = stored.split('.');
  const actual = await passwordDigest(password, Uint8Array.from(salt.match(/../g)!, x => parseInt(x, 16)));
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const STANDARD_TOPICS = ['General', 'Farming', 'Grinding', 'LFG'];
const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status = 400) => { throw Object.assign(new Error(error), { status }); };
const project = (ch: any) => ({
  id: ch.id, game_id: ch.game_id, name: ch.name, description: ch.description || '',
  access_scope: ch.access_scope || 'clan_only',
  created_by_clan_id: ch.created_by_clan_id,
  channel_type: ch.channel_type || 'chat',
  capacity: ch.capacity || 50,
  requires_password: Boolean(ch.join_password_hash || ch.join_password),
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ success: false, error: 'Unauthorized' }, 401);
    const {
      game_id, clan_id, channel_id, desired_name, desired_capacity,
      create_new_channel = false, access_scope, join_password = '',
      channel_type = 'chat',
    } = await req.json().catch(() => ({}));
    if (typeof game_id !== 'string' || !game_id || typeof clan_id !== 'string' || !clan_id) {
      return json({ success: false, error: 'Game and clan are required' }, 400);
    }
    if (typeof join_password !== 'string' || join_password.length > 100) fail('Invalid channel password');
    const entities = base44.asServiceRole.entities;
    const members = await entities.ClanMember.filter({ clan_id, user_id: user.id });
    const member = members?.[0];
    if (!member) return json({ success: false, error: 'Clan membership required' }, 403);
    const privileged = member.role === 'leader' || member.role === 'officer';
    const name = typeof desired_name === 'string' ? desired_name.trim() : '';
    if (name.length > 80) fail('Channel name is too long');
    const leaderChannel = /(^|[-_\s])leaders?($|[-_\s])/.test(name.toLowerCase());
    if (leaderChannel && !privileged) fail('Leader channels require an officer', 403);
    if (create_new_channel && leaderChannel && access_scope === 'all_clans') {
      fail('Leader channels cannot be public', 403);
    }

    const channels = await entities.ClanFormChannel.filter({ game_id }, '-created_date', 300);
    let selected: any = null;
    if (channel_id) {
      if (typeof channel_id !== 'string') fail('Invalid channel ID');
      selected = await entities.ClanFormChannel.get(channel_id);
      if (!selected || selected.game_id !== game_id) fail('Channel not found', 404);
    } else if (!create_new_channel) {
      if (!name) fail('Channel name or ID is required');
      // Resolve by the requesting clan first, never by the first channel with
      // room: different clans may use the same forum title.
      if (access_scope === 'all_clans') {
        selected = channels.find((ch: any) => ch.name?.toLowerCase() === name.toLowerCase()
          && ch.access_scope === 'all_clans' && ch.is_open !== false);
      } else {
        selected = channels.find((ch: any) => ch.name?.toLowerCase() === name.toLowerCase()
          && ch.created_by_clan_id === clan_id && ch.access_scope !== 'all_clans');
      }
    }

    if (!selected) {
      if (channel_id) fail('Channel not found', 404);
      if (create_new_channel && !name) fail('Enter a channel name');
      if (!create_new_channel && access_scope === 'all_clans') fail('Shared channel not found', 404);
      const scope = create_new_channel
        ? (access_scope === 'all_clans' ? 'all_clans' : 'clan_only')
        : 'clan_only';
      const baseName = name || 'Clan Forum';
      const count = channels.filter((ch: any) =>
        ch.created_by_clan_id === clan_id && ch.name?.toLowerCase().startsWith(baseName.toLowerCase())).length;
      const title = create_new_channel && count ? baseName + ' #' + (count + 1) : baseName;
      selected = await entities.ClanFormChannel.create({
        game_id,
        name: title,
        description: create_new_channel ? 'Clan-created discussion space' : 'Clan discussions',
        created_by_clan_id: clan_id,
        participating_clan_ids: [clan_id],
        is_open: scope === 'all_clans',
        access_scope: scope,
        join_password_hash: join_password ? await hashPassword(join_password) : '',
        channel_type: ['chat', 'party'].includes(channel_type) ? channel_type : 'chat',
        capacity: Math.max(2, Math.min(200, Number(desired_capacity) || 100)),
        active_member_ids: [],
      });
    }

    if (selected.game_id !== game_id) fail('Channel belongs to another game', 403);
    const owner = selected.created_by_clan_id;
    const shared = selected.access_scope === 'all_clans';
    const selectedLeader = /(^|[-_\s])leaders?($|[-_\s])/.test(String(selected.name || '').toLowerCase());
    if (selectedLeader && (owner !== clan_id || !privileged)) fail('Leader forum is restricted', 403);
    if (!shared && owner !== clan_id) fail('This channel belongs to another clan', 403);
    if (shared && selected.is_open === false && owner !== clan_id
      && !(selected.participating_clan_ids || []).includes(clan_id)) {
      fail('This channel is not accepting new clans', 403);
    }
    // Upgrade pre-existing channels on access. The write clears the legacy value
    // and installs its verifier together, preserving existing memberships.
    if (selected.join_password && !selected.join_password_hash) {
      const hash = await hashPassword(selected.join_password);
      await entities.ClanFormChannel.update(selected.id, { join_password: '', join_password_hash: hash });
      selected.join_password_hash = hash;
      selected.join_password = '';
    }
    if (shared && selected.join_password_hash && owner !== clan_id
      && !(selected.participating_clan_ids || []).includes(clan_id)
      && !await matchesPassword(join_password, selected.join_password_hash)) {
      fail('Channel password is invalid', 403);
    }
    let current = Array.isArray(selected.active_member_ids) ? selected.active_member_ids : [];
    const cap = Number(selected.capacity || 50);
    if (!current.includes(user.id) && current.length >= cap) {
      // A browser crash can prevent the leave request. Reclaim seats held by
      // accounts whose heartbeat has expired before reporting a full room.
      const presences = await Promise.allSettled(current.map((id: string) => entities.User.get(id)));
      const now = Date.now();
      current = current.filter((_id: string, index: number) => {
        const result = presences[index];
        if (result.status !== 'fulfilled' || !result.value) return false;
        const last = Date.parse(result.value.last_seen || '');
        return Number.isFinite(last) && now - last >= 0 && now - last <= 5 * 60 * 1000;
      });
      if (current.length >= cap) fail('Channel is full', 409);
    }

    const participating = Array.isArray(selected.participating_clan_ids) ? selected.participating_clan_ids : [];
    const patch: Record<string, unknown> = {};
    if (current.length !== (selected.active_member_ids || []).length) patch.active_member_ids = current;
    if (!participating.includes(clan_id)) patch.participating_clan_ids = [...participating, clan_id];
    if (!current.includes(user.id)) patch.active_member_ids = [...current, user.id];
    if (Object.keys(patch).length) selected = await entities.ClanFormChannel.update(selected.id, patch);

    // Create the four standard discussions only once and only for an
    // authorized creator-clan member. Never seed another clan's channel.
    if (owner === clan_id) {
      const existing = await entities.ClanFormTopic.filter({ channel_id: selected.id });
      const titles = new Set((existing || []).map((topic: any) => String(topic.title || '').toLowerCase()));
      const defaults = STANDARD_TOPICS.filter((title) => !titles.has(title.toLowerCase())).map((title) => ({
        channel_id: selected.id, game_id, clan_id,
        title, created_by_user_id: user.id, status: 'open',
        visibility_scope: selectedLeader ? 'leaders' : shared ? 'both' : 'clan',
        last_activity: new Date().toISOString(),
      }));
      if (defaults.length) await entities.ClanFormTopic.bulkCreate(defaults);
    }

    // Do not return channel passwords or private member lists to the client.
    const topicRows = await entities.ClanFormTopic.filter({ channel_id: selected.id }, '-updated_date', 100);
    const topics = (topicRows || []).filter((topic: any) =>
      (topic.visibility_scope !== 'leaders' || (privileged && owner === clan_id))
      && (!shared || owner === clan_id || topic.visibility_scope === 'both'));
    return json({ success: true, channel: project(selected), topics });
  } catch (error) {
    console.error('Clan form join error:', error);
    return json({ success: false, error: error?.message || 'Could not join channel' }, error?.status || 500);
  }
});
