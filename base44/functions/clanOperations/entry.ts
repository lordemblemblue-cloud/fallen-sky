import { startClanUpgrade } from '../../shared/startClanUpgrade.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.63';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    const getMembership = async (clanId: string) => {
      if (!clanId) return null;
      const rows = await base44.asServiceRole.entities.ClanMember.filter({ clan_id: clanId, user_id: user.id });
      return rows?.[0] || null;
    };

    const requireMember = async (clanId: string) => {
      const member = await getMembership(clanId);
      if (!member) throw Object.assign(new Error('Clan membership required'), { status: 403 });
      return member;
    };

    const requireOfficer = async (clanId: string) => {
      const member = await requireMember(clanId);
      if (!['leader', 'officer'].includes(member.role)) {
        throw Object.assign(new Error('Leader or officer permission required'), { status: 403 });
      }
      return member;
    };

    const completeFinishedUpgrades = async (clanId: string) => {
      const rows = await base44.asServiceRole.entities.ClanUpgrade.filter({ clan_id: clanId });
      const now = Date.now();
      for (const upgrade of rows || []) {
        if (upgrade.status !== 'in_progress' || !upgrade.started_at) continue;
        const durationMs = Math.max(1, Number(upgrade.build_seconds || 0)) * 1000;
        if (new Date(upgrade.started_at).getTime() + durationMs > now) continue;
        await base44.asServiceRole.entities.ClanUpgrade.update(upgrade.id, {
          status: 'active',
          tier: Math.min(Number(upgrade.max_tier || 5), Number(upgrade.tier || 0) + 1),
          progress_seconds: Number(upgrade.build_seconds || 0),
          completed_at: new Date().toISOString(),
        });
      }
      return await base44.asServiceRole.entities.ClanUpgrade.filter({ clan_id: clanId });
    };

    // All clan/game chat traffic uses one allowlisted channel namespace. The
    // backend verifies membership and officer access, never trusting a
    // client-supplied channel name or an unverified role.
    const resolveMessageChannel = (channelId: unknown, role: string) => {
      const channel = channelId == null || channelId === '' ? 'clan_global' : channelId;
      if (typeof channel !== 'string' || channel.length > 150) {
        return { error: 'Invalid chat channel', status: 400 };
      }
      if (channel === 'clan_leaders' && !['leader', 'officer'].includes(role)) {
        return { error: 'Leader channel is restricted', status: 403 };
      }
      if (['clan_global', 'clan_strategy', 'clan_leaders'].includes(channel)) return { channel };
      // Each game has isolated channels for its actual operational zones.
      // "global_chat" is a legacy social pseudo-game used by Game Chats.
      const gameZone = /^([A-Za-z0-9][A-Za-z0-9_-]{0,119})_(chat|voice|farming|exploration|strategy|party)$/.exec(channel);
      if (gameZone) return { channel };
      return { error: 'Unknown chat channel', status: 400 };
    };

    if (action === 'list_messages') {
      const { clanId, channelId } = data;
      const member = await requireMember(clanId);
      const resolved = resolveMessageChannel(channelId, member.role);
      if (resolved.error) return json({ success: false, error: resolved.error }, resolved.status);
      // Load the most recent page, then render it chronologically. Ascending
      // sort with a limit accidentally kept the *oldest* 250 messages.
      const rows = await base44.asServiceRole.entities.ClanMessage.filter(
        { divisionId: clanId, channelId: resolved.channel },
        '-created_date',
        250,
      );
      return json({ success: true, messages: (rows || []).slice().reverse(), role: member.role });
    }

    if (action === 'send_message') {
      const { clanId, channelId, content } = data;
      const member = await requireMember(clanId);
      const resolved = resolveMessageChannel(channelId, member.role);
      if (resolved.error) return json({ success: false, error: resolved.error }, resolved.status);
      if (typeof content !== 'string') return json({ success: false, error: 'Message must be text' }, 400);
      const clean = content.trim();
      if (!clean) return json({ success: false, error: 'Message is required' }, 400);
      if (clean.length > 4000) return json({ success: false, error: 'Message is too long' }, 400);
      // Best-effort spam throttle using persisted messages. Separate requests
      // may race; this is not intended as a transactional rate-limit service.
      const recent = await base44.asServiceRole.entities.ClanMessage.filter(
        { divisionId: clanId, userId: user.id },
        '-created_date',
        1,
      );
      const last = recent?.[0] && Date.parse(recent[0].created_date || '');
      if (Number.isFinite(last) && Date.now() - last < 900) {
        return json({ success: false, error: 'Please wait briefly before sending another message' }, 429);
      }
      const message = await base44.asServiceRole.entities.ClanMessage.create({
        divisionId: clanId,
        channelId: resolved.channel,
        author: user.full_name || user.username || user.email?.split('@')?.[0] || 'Player',
        authorAvatar: user.avatar_url || '',
        content: clean,
        userId: user.id,
        role: member.role,
        isAnnouncement: false,
        isPinned: false,
      });
      return json({ success: true, message });
    }

    // Game Chats is a coordination hub, not a random activity simulator.
    // Aggregate only recent presence for *members in this clan*, and return
    // counts rather than identities. Party availability comes from real
    // forming parties; assignments are scoped to the requesting member.
    if (action === 'game_chat_state') {
      const { clanId } = data;
      await requireMember(clanId);
      const [members, assignments, parties] = await Promise.all([
        base44.asServiceRole.entities.ClanMember.filter({ clan_id: clanId }, '-joined_at', 300),
        base44.asServiceRole.entities.ClanAssignment.filter({ clanId }, '-created_date', 300),
        base44.asServiceRole.entities.Party.filter({ clanId }, '-created_date', 250),
      ]);
      const counts: Record<string, { activePlayers: number; farmingPlayers: number; openParties: number }> = {};
      const add = (id: unknown, field: 'activePlayers' | 'farmingPlayers' | 'openParties') => {
        if (typeof id !== 'string' || !id) return;
        if (!counts[id]) counts[id] = { activePlayers: 0, farmingPlayers: 0, openParties: 0 };
        counts[id][field] += 1;
      };
      const now = Date.now();
      const ids = [...new Set((members || []).map((member: any) => member.user_id).filter(Boolean))];
      const recentUsers = await Promise.allSettled(ids.map((id) => base44.asServiceRole.entities.User.get(id)));
      recentUsers.forEach((result) => {
        if (result.status !== 'fulfilled' || !result.value) return;
        const memberUser = result.value;
        const lastSeen = Date.parse(memberUser.last_seen || '');
        if (!Number.isFinite(lastSeen) || now - lastSeen < 0 || now - lastSeen > 150000) return;
        const activity = memberUser.current_activity || {};
        if (!['game', 'party'].includes(activity.type) || String(activity.clanId || '') !== String(clanId)) return;
        const gameId = activity.type === 'party' ? activity.gameId : activity.id;
        add(gameId, 'activePlayers');
        if (activity.type === 'game' && activity.zoneId === 'farming') add(gameId, 'farmingPlayers');
      });
      for (const party of parties || []) {
        const membersInParty = Array.isArray(party.members) ? party.members.length : 0;
        if (['forming', 'active'].includes(party.status) && membersInParty < Math.max(1, Number(party.maxSize || 4))) {
          add(party.gameId, 'openParties');
        }
      }
      const assignedGameIds = [...new Set((assignments || [])
        .filter((task: any) =>
          !['completed', 'cancelled'].includes(task.status) &&
          (task.assigneeId === 'all' || String(task.assigneeId) === String(user.id)) &&
          typeof task.targetId === 'string' && task.targetId !== 'general')
        .map((task: any) => task.targetId))];
      return json({ success: true, games: counts, assignedGameIds });
    }


    // Member-facing home reads only the guild's shared information.
    // Leadership-only channels never enter the homepage announcement feed.
    if (action === 'home_state') {
      const { clanId } = data;
      const membership = await requireMember(clanId);
      const division = await base44.asServiceRole.entities.Division.get(clanId);
      if (!division) return json({ success: false, error: 'Clan not found' }, 404);
      const requests: [string, () => Promise<any>][] = [
        ['announcements', () => base44.asServiceRole.entities.ClanMessage.filter({ divisionId: clanId, isAnnouncement: true }, '-created_date', 100)],
        ['upgrades', () => base44.asServiceRole.entities.ClanUpgrade.filter({ clan_id: clanId }, '-created_date', 100)],
        ['halls', () => base44.asServiceRole.entities.ClanHall.filter({ clan_id: clanId }, '-created_date', 1)],
        ['members', () => base44.asServiceRole.entities.ClanMember.filter({ clan_id: clanId }, '-joined_at', 1000)],
      ];
      const results = await Promise.allSettled(requests.map(([, read]) => read()));
      const failures: string[] = [];
      const records: Record<string, any[]> = {};
      requests.forEach(([key], index) => {
        const result = results[index];
        if (result.status === 'fulfilled') records[key] = Array.isArray(result.value) ? result.value : [];
        else { failures.push(key); records[key] = []; }
      });
      const fields = ['id', 'name', 'tag', 'motto', 'description', 'icon', 'banner', 'level', 'xp', 'reputation', 'sizeLimit', 'playstyles', 'focusTags', 'genres', 'gameTags', 'clanAchievements'];
      const clan = Object.fromEntries(fields.filter((key) => division[key] !== undefined).map((key) => [key, division[key]]));
      return json({
        success: true, clan, role: membership.role, failures,
        announcements: records.announcements
          .filter((row) => !row.channelId || row.channelId === 'clan_global')
          .map(({ id, author, authorAvatar, content, role, isPinned, created_date }) => ({ id, author, authorAvatar, content, role, isPinned, created_date }))
          .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || Date.parse(b.created_date) - Date.parse(a.created_date)),
        upgrades: records.upgrades.map(({ id, upgrade_name, tier, max_tier, status, progress_seconds, build_seconds, started_at, completed_at }) => ({ id, upgrade_name, tier, max_tier, status, progress_seconds, build_seconds, started_at, completed_at })),
        hall: records.halls[0] ? { hall_name: records.halls[0].hall_name, hall_type: records.halls[0].hall_type, favor: records.halls[0].favor, aetherium: records.halls[0].aetherium } : null,
        members: records.members.map(({ id, role, nickname, title }) => ({ id, role, nickname, title })),
      });
    }

    if (action === 'admin_state') {
      const { clanId } = data;
      await requireOfficer(clanId);
      const [inventory, upgrades, assignments, events, members] = await Promise.all([
        base44.asServiceRole.entities.ClanVaultItem.filter({ clan_id: clanId }),
        completeFinishedUpgrades(clanId),
        base44.asServiceRole.entities.ClanAssignment.filter({ clanId }),
        base44.asServiceRole.entities.ClanEvent.filter({ divisionId: clanId }),
        base44.asServiceRole.entities.ClanMember.filter({ clan_id: clanId }),
      ]);
      const completedAssignments = (assignments || []).filter((row: any) => row.status === 'completed').length;
      return json({
        success: true,
        inventory: inventory || [],
        upgrades: upgrades || [],
        assignments: assignments || [],
        events: events || [],
        members: members || [],
        progress: {
          memberCount: members?.length || 0,
          inventoryUnits: (inventory || []).reduce((sum: number, row: any) => sum + Number(row.quantity || 1), 0),
          activeUpgrades: (upgrades || []).filter((row: any) => row.status === 'active').length,
          assignmentsCompleted: completedAssignments,
          assignmentsTotal: assignments?.length || 0,
          upcomingEvents: (events || []).filter((row: any) => new Date(row.startTime || row.start_time || 0).getTime() >= Date.now()).length,
        },
      });
    }

    if (action === 'create_assignment') {
      const { clanId, assignment = {} } = data;
      await requireOfficer(clanId);
      const row = await base44.asServiceRole.entities.ClanAssignment.create({
        clanId,
        divisionId: clanId,
        type: assignment.type || 'objective',
        targetId: assignment.gameId || assignment.targetId || 'general',
        targetName: assignment.targetName || assignment.title || 'Clan Directive',
        title: assignment.targetName || assignment.title || 'Clan Directive',
        priority: assignment.priority || 'recommended',
        assigneeId: assignment.assigneeId || 'all',
        dueDate: assignment.dueDate || null,
        notes: assignment.notes || '',
        status: 'pending',
        createdBy: user.id,
        created_by_user_id: user.id,
      });
      return json({ success: true, assignment: row });
    }

    if (action === 'set_assignment_status') {
      const { clanId, assignmentId, status } = data;
      const member = await requireMember(clanId);
      const row = await base44.asServiceRole.entities.ClanAssignment.get(assignmentId);
      if (!row || (row.clanId !== clanId && row.divisionId !== clanId)) return json({ success: false, error: 'Assignment not found' }, 404);
      const officer = ['leader', 'officer'].includes(member.role);
      if (!officer && row.assigneeId !== 'all' && String(row.assigneeId) !== String(user.id)) {
        return json({ success: false, error: 'Assignment is not assigned to you' }, 403);
      }
      await base44.asServiceRole.entities.ClanAssignment.update(assignmentId, { status });
      return json({ success: true });
    }

    if (action === 'create_event') {
      const { clanId, event = {} } = data;
      await requireOfficer(clanId);
      if (!event.title || !event.startTime) return json({ success: false, error: 'Title and start time are required' }, 400);
      const row = await base44.asServiceRole.entities.ClanEvent.create({
        divisionId: clanId,
        creatorId: user.id,
        title: event.title,
        description: event.description || '',
        eventType: event.eventType || 'meeting',
        startTime: event.startTime,
        maxParticipants: Math.max(1, Number(event.maxParticipants || 20)),
        game: event.game || '',
        participants: [user.id],
      });
      return json({ success: true, event: row });
    }

    if (action === 'join_event') {
      const { clanId, eventId } = data;
      await requireMember(clanId);
      const event = await base44.asServiceRole.entities.ClanEvent.get(eventId);
      if (!event || event.divisionId !== clanId) return json({ success: false, error: 'Event not found' }, 404);
      const participants = Array.from(new Set([...(event.participants || []), user.id]));
      if (participants.length > Number(event.maxParticipants || 9999)) return json({ success: false, error: 'Event is full' }, 400);
      await base44.asServiceRole.entities.ClanEvent.update(eventId, { participants });
      return json({ success: true });
    }

    if (action === 'deposit_inventory') {
      if (user.role !== 'admin') return Response.json({ error: 'Administrator access required for manual vault credits' }, { status: 403, headers: corsHeaders });
      const { clanId, item = {} } = data;
      // The vault records real guild contributions. There is no server-side
      // personal inventory to debit yet, so recording stays with leadership and
      // every stack is bounded: an ordinary member cannot mint vault stock.
      await requireOfficer(clanId);
      const name = typeof item.item_name === 'string' ? item.item_name.trim() : '';
      if (!name) return json({ success: false, error: 'Item name is required' }, 400);
      if (name.length > 80) return json({ success: false, error: 'Item name is too long' }, 400);
      const quantity = Math.min(99, Math.max(1, Math.floor(Number(item.quantity || 1)) || 1));
      const row = await base44.asServiceRole.entities.ClanVaultItem.create({
        clan_id: clanId,
        item_id: item.item_id || '',
        item_name: name,
        item_icon: item.item_icon || '',
        rarity: item.rarity || 'common',
        category: item.category || 'material',
        quantity,
        stash_tab: Number(item.stash_tab || 0),
        deposited_by: user.id,
        deposited_at: new Date().toISOString(),
        note: item.note || '',
      });
      return json({ success: true, item: row });
    }

    if (action === 'withdraw_inventory') {
      const { clanId, itemId, quantity = 1 } = data;
      await requireOfficer(clanId);
      const item = await base44.asServiceRole.entities.ClanVaultItem.get(itemId);
      if (!item || item.clan_id !== clanId) return json({ success: false, error: 'Vault item not found' }, 404);
      const take = Math.max(1, Math.min(Number(quantity || 1), Number(item.quantity || 1)));
      if (take >= Number(item.quantity || 1)) await base44.asServiceRole.entities.ClanVaultItem.delete(itemId);
      else await base44.asServiceRole.entities.ClanVaultItem.update(itemId, { quantity: Number(item.quantity || 1) - take });
      return json({ success: true, withdrawn: take });
    }

    if (action === 'start_upgrade') {
      const { clanId, upgrade = {} } = data;
      await requireOfficer(clanId);
      const key = upgrade.key || upgrade.upgrade_key;
      const row = await startClanUpgrade(base44.asServiceRole.entities, clanId, key);
      return json({ success: true, upgrade: row });
    }

    if (action === 'list_exploration') {
      const { clanId, gameId } = data;
      await requireMember(clanId);
      const rows = await base44.asServiceRole.entities.ExplorationIntel.filter({ clan_id: clanId, game_id: gameId }, '-created_date', 250);
      return json({ success: true, intel: rows || [] });
    }

    if (action === 'create_exploration') {
      const { clanId, gameId, intel = {} } = data;
      await requireMember(clanId);
      if (!intel.title && !intel.location_name) return json({ success: false, error: 'Location name is required' }, 400);
      const row = await base44.asServiceRole.entities.ExplorationIntel.create({
        clan_id: clanId,
        game_id: gameId,
        title: intel.title || intel.location_name,
        location_name: intel.location_name || intel.title,
        description: intel.description || '',
        location_type: intel.location_type || 'discovery',
        coordinates: intel.coordinates || '',
        media_urls: intel.media_urls || [],
        tags: intel.tags || [],
        discovered_by: user.id,
        discovered_by_name: user.full_name || user.username || 'Player',
        verified: false,
      });
      return json({ success: true, intel: row });
    }

    if (action === 'list_parties') {
      const { clanId, gameId } = data;
      await requireMember(clanId);
      if (typeof gameId !== 'string' || !gameId.trim()) {
        return json({ success: false, error: 'Game is required' }, 400);
      }
      const rows = await base44.asServiceRole.entities.Party.filter(
        { clanId, gameId }, '-created_date', 100,
      );
      return json({ success: true, parties: (rows || []).filter((row: any) =>
        !['completed', 'disbanded'].includes(row.status)) });
    }

    if (action === 'create_party') {
      const { clanId, gameId, party = {} } = data;
      const member = await requireMember(clanId);
      if (typeof gameId !== 'string' || !gameId.trim()) return json({ success: false, error: 'Game is required' }, 400);
      if (typeof party.goal !== 'string' || !party.goal.trim()) {
        return json({ success: false, error: 'Party goal is required' }, 400);
      }
      if (party.assignmentId) {
        const task = await base44.asServiceRole.entities.ClanAssignment.get(party.assignmentId);
        if (!task || (task.clanId !== clanId && task.divisionId !== clanId) ||
            (task.targetId !== gameId && task.targetId !== 'general') ||
            (!['leader', 'officer'].includes(member.role) &&
              task.assigneeId !== 'all' && String(task.assigneeId) !== String(user.id))) {
          return json({ success: false, error: 'Assignment cannot be linked to this party' }, 403);
        }
      }
      const row = await base44.asServiceRole.entities.Party.create({
        clanId,
        gameId,
        leaderId: user.id,
        goal: party.goal.trim().slice(0, 200),
        description: party.context || 'general',
        context: party.context || 'general',
        maxSize: Math.max(2, Math.min(12, Number(party.maxSize || 4))),
        status: 'forming',
        micRequired: !!party.micRequired,
        assignmentId: party.assignmentId || null,
        members: [user.id],
        lastActive: new Date().toISOString(),
      });
      return json({ success: true, party: row });
    }

    return json({ success: false, error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Clan operations error:', error);
    return json({ success: false, error: error?.message || 'Clan operation failed' }, error?.status || 500);
  }
});